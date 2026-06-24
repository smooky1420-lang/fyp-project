"""Compute live alerts from device telemetry and configured limits."""
from datetime import timedelta

from django.utils import timezone

from devices.models import Device
from predictions.services import calc_kwh_in_range
from telemetry.models import TelemetryReading

OFFLINE_SECONDS = 120
HIGH_USAGE_W = 2500


def get_user_alerts(user) -> list[dict]:
    """Return current alert dicts for a user (recomputed on each request)."""
    alerts: list[dict] = []
    now = timezone.now()
    offline_cutoff = now - timedelta(seconds=OFFLINE_SECONDS)
    today_start = timezone.localtime(now).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    today_end = today_start + timedelta(days=1)

    for device in Device.objects.filter(user=user).order_by("name"):
        latest = (
            TelemetryReading.objects.filter(device=device)
            .order_by("-created_at")
            .first()
        )

        if not latest or latest.created_at < offline_cutoff:
            alerts.append(
                {
                    "id": f"offline:device:{device.id}",
                    "type": "offline",
                    "title": f"{device.name} offline",
                    "message": (
                        f"No telemetry from {device.name}"
                        f"{f' ({device.room})' if device.room else ''} "
                        "in the last 2 minutes."
                    ),
                    "created_at": now.isoformat(),
                    "read": False,
                    "device_id": device.id,
                }
            )
            continue

        power = float(latest.power or 0)

        if power > HIGH_USAGE_W:
            kw = power / 1000.0
            alerts.append(
                {
                    "id": f"high:device:{device.id}",
                    "type": "high",
                    "title": f"High usage — {device.name}",
                    "message": (
                        f"Current load is {kw:.2f} kW. "
                        "Consider turning off heavy appliances."
                    ),
                    "created_at": latest.created_at.isoformat(),
                    "read": False,
                    "device_id": device.id,
                }
            )

        if device.power_limit_w and power > float(device.power_limit_w):
            alerts.append(
                {
                    "id": f"limit:device:{device.id}",
                    "type": "limit",
                    "title": f"Power limit exceeded — {device.name}",
                    "message": (
                        f"Reading {power:.0f} W exceeds limit "
                        f"of {device.power_limit_w:.0f} W."
                    ),
                    "created_at": latest.created_at.isoformat(),
                    "read": False,
                    "device_id": device.id,
                }
            )

        if device.daily_energy_limit_kwh:
            today_kwh = calc_kwh_in_range(device, today_start, today_end)
            limit = float(device.daily_energy_limit_kwh)
            if today_kwh > limit:
                alerts.append(
                    {
                        "id": f"daily:device:{device.id}:{today_start.date().isoformat()}",
                        "type": "daily_limit",
                        "title": f"Daily energy limit — {device.name}",
                        "message": (
                            f"Today {today_kwh:.2f} kWh exceeds daily limit "
                            f"of {limit:.2f} kWh."
                        ),
                        "created_at": now.isoformat(),
                        "read": False,
                        "device_id": device.id,
                    }
                )

    alerts.sort(key=lambda a: a["created_at"], reverse=True)
    return alerts
