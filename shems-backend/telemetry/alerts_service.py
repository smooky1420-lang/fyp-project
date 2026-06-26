"""Persist and sync alerts from device telemetry and configured limits."""
from datetime import timedelta

from django.utils import timezone

from devices.models import Device
from predictions.services import calc_kwh_in_range
from telemetry.models import AlertEvent, TelemetryReading

OFFLINE_SECONDS = 60
HISTORY_DAYS = 7


def _device_active_conditions(device, now) -> dict[str, dict]:
    """Return active alert_key -> payload for one device."""
    conditions: dict[str, dict] = {}
    offline_cutoff = now - timedelta(seconds=OFFLINE_SECONDS)
    today_start = timezone.localtime(now).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    today_end = today_start + timedelta(days=1)

    latest = (
        TelemetryReading.objects.filter(device=device)
        .order_by("-created_at")
        .first()
    )

    room = f" ({device.room})" if device.room else ""

    if not latest or latest.created_at < offline_cutoff:
        offline_mins = OFFLINE_SECONDS // 60
        offline_label = (
            f"{offline_mins} minute" if offline_mins == 1 else f"{offline_mins} minutes"
        )
        conditions[f"offline:device:{device.id}"] = {
            "type": AlertEvent.TYPE_OFFLINE,
            "title": f"{device.name} offline",
            "message": (
                f"No telemetry from {device.name}{room} in the last {offline_label}."
            ),
            "triggered_at": now,
        }
        return conditions

    power = float(latest.power or 0)
    reading_at = latest.created_at

    if device.power_limit_w and power > float(device.power_limit_w):
        conditions[f"limit:device:{device.id}"] = {
            "type": AlertEvent.TYPE_LIMIT,
            "title": f"Power limit exceeded: {device.name}",
            "message": (
                f"Reading {power:.0f} W exceeds limit "
                f"of {device.power_limit_w:.0f} W."
            ),
            "triggered_at": reading_at,
        }

    if device.daily_energy_limit_kwh:
        today_kwh = calc_kwh_in_range(device, today_start, today_end)
        limit = float(device.daily_energy_limit_kwh)
        if today_kwh > limit:
            day_key = today_start.date().isoformat()
            conditions[f"daily:device:{device.id}:{day_key}"] = {
                "type": AlertEvent.TYPE_DAILY_LIMIT,
                "title": f"Daily energy limit: {device.name}",
                "message": (
                    f"Today {today_kwh:.2f} kWh exceeds daily limit "
                    f"of {limit:.2f} kWh."
                ),
                "triggered_at": now,
            }

    return conditions


def sync_device_alerts(device: Device) -> None:
    """Create, update, or resolve stored alerts for one device."""
    now = timezone.now()
    active = _device_active_conditions(device, now)
    active_keys = set(active.keys())

    open_alerts = list(
        AlertEvent.objects.filter(
            user=device.user,
            device=device,
            resolved_at__isnull=True,
            dismissed_at__isnull=True,
        )
    )
    open_by_key = {a.alert_key: a for a in open_alerts}

    for alert in open_alerts:
        if alert.alert_key not in active_keys:
            alert.resolved_at = now
            alert.save(update_fields=["resolved_at", "updated_at"])

    for key, data in active.items():
        existing = open_by_key.get(key)
        if existing:
            if existing.message != data["message"]:
                existing.message = data["message"]
                existing.save(update_fields=["message", "updated_at"])
            continue

        AlertEvent.objects.create(
            user=device.user,
            device=device,
            alert_key=key,
            type=data["type"],
            title=data["title"],
            message=data["message"],
            triggered_at=data["triggered_at"],
        )


def sync_user_alerts(user) -> None:
    for device in Device.objects.filter(user=user).order_by("id"):
        sync_device_alerts(device)


def serialize_alert(alert: AlertEvent) -> dict:
    return {
        "id": str(alert.id),
        "type": alert.type,
        "title": alert.title,
        "message": alert.message,
        "created_at": alert.triggered_at.isoformat(),
        "resolved_at": alert.resolved_at.isoformat() if alert.resolved_at else None,
        "active": alert.resolved_at is None,
        "read": alert.read_at is not None,
        "device_id": alert.device_id,
    }


def get_user_alerts(user, days: int = HISTORY_DAYS) -> list[dict]:
    """Sync conditions then return non-dismissed alerts from the last N days."""
    sync_user_alerts(user)
    cutoff = timezone.now() - timedelta(days=days)
    qs = (
        AlertEvent.objects.filter(
            user=user,
            dismissed_at__isnull=True,
            triggered_at__gte=cutoff,
        )
        .select_related("device")
        .order_by("-triggered_at")
    )
    return [serialize_alert(a) for a in qs]


def mark_alerts_read(user, alert_ids: list[int]) -> int:
    now = timezone.now()
    updated = (
        AlertEvent.objects.filter(
            user=user,
            id__in=alert_ids,
            read_at__isnull=True,
        ).update(read_at=now)
    )
    return updated


def dismiss_alerts(user, alert_ids: list[int] | None = None) -> int:
    now = timezone.now()
    qs = AlertEvent.objects.filter(user=user, dismissed_at__isnull=True)
    if alert_ids is not None:
        qs = qs.filter(id__in=alert_ids)
    return qs.update(dismissed_at=now)
