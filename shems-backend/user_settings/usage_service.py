"""Shared helpers for monthly home energy totals from telemetry."""
from django.utils import timezone

from devices.models import Device
from telemetry.models import TelemetryReading


def calc_monthly_kwh_for_device(device, month_start, month_end) -> float:
    readings = (
        TelemetryReading.objects.filter(
            device=device,
            created_at__gte=month_start,
            created_at__lt=month_end,
        )
        .order_by("created_at")
        .values_list("energy_kwh", flat=True)
    )

    total = 0.0
    prev = None
    for e in readings:
        try:
            cur = float(e)
        except (TypeError, ValueError):
            continue
        if prev is not None:
            delta = cur - prev
            if delta > 0:
                total += delta
        prev = cur
    return round(total, 2)


def get_month_boundaries(months_back: int = 0):
    """Return (month_start, month_end, month_label) for N months ago (0 = current)."""
    tz = timezone.get_current_timezone()
    now = timezone.localtime(timezone.now(), tz)
    month_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    for _ in range(months_back):
        if month_date.month == 1:
            month_date = month_date.replace(year=month_date.year - 1, month=12)
        else:
            month_date = month_date.replace(month=month_date.month - 1)

    month_start = month_date
    if month_date.month == 12:
        month_end = month_date.replace(year=month_date.year + 1, month=1, day=1)
    else:
        month_end = month_date.replace(month=month_date.month + 1, day=1)
    return month_start, month_end, month_date.strftime("%Y-%m")


def get_home_monthly_usage(user, months: int = 6) -> list[dict]:
    devices = Device.objects.filter(user=user)
    if not devices.exists():
        return []

    monthly_usage = []
    for i in range(months):
        month_start, month_end, label = get_month_boundaries(i)
        month_total = 0.0
        for device in devices:
            month_total += calc_monthly_kwh_for_device(device, month_start, month_end)
        monthly_usage.append({"month": label, "kwh": round(month_total, 2)})
    return monthly_usage


def get_current_month_home_kwh(user) -> float:
    usage = get_home_monthly_usage(user, months=1)
    return usage[0]["kwh"] if usage else 0.0
