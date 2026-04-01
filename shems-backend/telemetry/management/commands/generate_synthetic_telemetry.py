"""
Generate ~1 year of synthetic hourly TelemetryReading data per device.

Pakistani household model (3 devices typical):
  - AC: ~5 kWh/day weekdays, ~7 kWh/day weekends (+2 kWh spike); concentrated
        in evening hours so average power ≈ 1000 W when the AC is running.
  - PC: ~1 kWh/day, daytime hours.
  - Fan/Lights: ~0.5 kWh/day, spread across the day.

Combined daily total (before noise) is ~6.5 kWh (weekday) or ~8.5 kWh (weekend),
i.e. within ~5–10 kWh. Seasonal ramp is capped so the household sum stays ≤ ~10 kWh/day.

Also:
  - ±15% multiplicative noise on every hourly reading
  - +0.1% per calendar day seasonal factor (capped per weekday/weekend)

Device role is inferred from device name + device_type (or use --role ac|pc|fan).

Power (W) for each hour = hourly_kwh * 1000 (average power over that hour).

Run: python manage.py generate_synthetic_telemetry [--device-token TOKEN] [--role ac|pc|fan]
"""
from datetime import datetime, timedelta
import numpy as np
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model
from devices.models import Device
from telemetry.models import TelemetryReading

User = get_user_model()

# ±15% multiplicative noise per reading
NOISE_PCT = 0.15
# +0.1% per calendar day from series start
SEASONAL_DAILY_RATE = 0.001
# Combined household caps (kWh/day before noise): weekday ~6.5, weekend ~8.5
CAP_WEEKDAY_COMBINED = 6.5
CAP_WEEKEND_COMBINED = 8.5

VOLTAGE = 230.0
BULK_CHUNK = 100

# Daily energy targets (kWh) before seasonal
AC_KWH_WEEKDAY = 5.0
AC_KWH_WEEKEND = 7.0  # +2 kWh vs weekday
PC_KWH_DAY = 1.0
FAN_KWH_DAY = 0.5


def infer_device_role(device: Device) -> str:
    text = f"{device.name} {device.device_type}".lower()
    if any(k in text for k in ("ac", "air", "split", "cooler", "inverter ac")):
        return "ac"
    if any(k in text for k in ("pc", "computer", "laptop", "desktop")):
        return "pc"
    if any(k in text for k in ("fan", "light", "bulb", "lamp", "lights")):
        return "fan"
    return "generic"


def seasonal_factor(day_index: int, is_weekend: bool) -> float:
    """Ramp ~0.1%/day, capped so typical 3-device totals stay within ~10 kWh/day."""
    s = 1.0 + SEASONAL_DAILY_RATE * max(0, day_index)
    cap = CAP_WEEKEND_COMBINED / (AC_KWH_WEEKEND + PC_KWH_DAY + FAN_KWH_DAY) if is_weekend else CAP_WEEKDAY_COMBINED / (AC_KWH_WEEKDAY + PC_KWH_DAY + FAN_KWH_DAY)
    return min(s, cap)


def hour_weights(role: str, is_weekend: bool) -> np.ndarray:
    """
    24 weights summing to 1.0 for distributing daily kWh across hours.
    """
    w = np.zeros(24, dtype=float)
    if role == "ac":
        if is_weekend:
            # 7 kWh in 7 evening hours → ~1 kWh/h → ~1000 W when on
            for h in range(17, 24):
                w[h] = 1.0 / 7.0
        else:
            # 5 kWh in 5 hours 18–22
            for h in range(18, 23):
                w[h] = 1.0 / 5.0
    elif role == "pc":
        # 1 kWh in 8 daytime hours
        for h in range(9, 17):
            w[h] = 1.0 / 8.0
    elif role == "fan":
        w[:] = 1.0 / 24.0
    else:
        # generic: small uniform
        w[:] = 1.0 / 24.0
    return w


def daily_target_kwh_for_role(role: str, is_weekend: bool) -> float:
    if role == "ac":
        return AC_KWH_WEEKEND if is_weekend else AC_KWH_WEEKDAY
    if role == "pc":
        return PC_KWH_DAY
    if role == "fan":
        return FAN_KWH_DAY
    return 0.5


def hourly_kwh_for_device(
    role: str,
    hour: int,
    is_weekend: bool,
    day_index: int,
    weights: np.ndarray,
    rng: np.random.Generator,
) -> float:
    """kWh for this clock hour after seasonal scaling and ±15% noise."""
    base_daily = daily_target_kwh_for_role(role, is_weekend)
    seasonal = seasonal_factor(day_index, is_weekend)
    daily_scaled = base_daily * seasonal
    base_hour = daily_scaled * float(weights[hour])
    noise = rng.uniform(1.0 - NOISE_PCT, 1.0 + NOISE_PCT)
    return max(0.001, float(base_hour * noise))


class Command(BaseCommand):
    help = "Generate synthetic hourly TelemetryReading data (PK household model)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--device-token",
            type=str,
            default=None,
            help="Device token (e.g. from Devices page).",
        )
        parser.add_argument(
            "--user",
            type=int,
            default=None,
            help="User ID to attach device to. If omitted, uses first user or creates one.",
        )
        parser.add_argument(
            "--device",
            type=int,
            default=None,
            help="Device ID to attach readings to. If omitted, uses first device or creates one.",
        )
        parser.add_argument(
            "--role",
            type=str,
            choices=("ac", "pc", "fan", "auto"),
            default="auto",
            help="Device role: ac, pc, fan, or auto (infer from name/type).",
        )
        parser.add_argument(
            "--seed",
            type=int,
            default=42,
            help="Random seed for reproducibility (default 42).",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete existing readings for this device before generating.",
        )

    def handle(self, *args, **options):
        device_token = options.get("device_token")
        user_id = options["user"]
        device_id = options["device"]
        role_opt = options.get("role") or "auto"
        seed = options["seed"]
        rng = np.random.default_rng(seed)

        device = None
        user = None

        if device_token:
            device = Device.objects.filter(device_token=device_token.strip()).first()
            if not device:
                self.stdout.write(self.style.ERROR(f"Device with token '{device_token[:16]}...' not found."))
                return
            user = device.user
            self.stdout.write(f"Using device id={device.id} ({device.name}) for user {user.username}.")

        if device is None:
            if user_id is not None:
                user = User.objects.filter(pk=user_id).first()
                if not user:
                    self.stdout.write(self.style.ERROR(f"User with id={user_id} not found."))
                    return
            if user is None:
                user = User.objects.first()
            if user is None:
                self.stdout.write(self.style.ERROR("No user in database. Create a user first (e.g. via signup)."))
                return

            if device_id is not None:
                device = Device.objects.filter(pk=device_id, user=user).first()
                if not device:
                    self.stdout.write(self.style.ERROR(f"Device with id={device_id} for user {user.id} not found."))
                    return
            if device is None:
                device = Device.objects.filter(user=user).first()
            if device is None:
                device = Device.objects.create(
                    user=user,
                    name="Synthetic Meter",
                    room="Main",
                    device_type="PZEM-004T",
                )
                self.stdout.write(self.style.SUCCESS(f"Created device id={device.id} for user {user.username}."))

        if role_opt == "auto":
            role = infer_device_role(device)
            if role == "generic":
                self.stdout.write(
                    self.style.WARNING(
                        "Could not infer ac/pc/fan from name/type; using 'fan'-like low profile (0.5 kWh/day). "
                        "Set --role ac|pc|fan if needed."
                    )
                )
                role = "fan"
        else:
            role = role_opt

        self.stdout.write(f"Device role for generation: {role}")

        if options.get("clear"):
            deleted, _ = TelemetryReading.objects.filter(device=device).delete()
            self.stdout.write(f"Cleared {deleted} existing readings for device id={device.id}.")

        tz = timezone.get_current_timezone()
        now = timezone.localtime(timezone.now(), tz)
        end = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
        start = end - timedelta(days=365)
        total_hours = int((end - start).total_seconds() // 3600)

        self.stdout.write(
            f"Generating {total_hours} hourly readings for device id={device.id} ({device.name}), user {user.username}."
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"To view: open Monitoring → select device \"{device.name}\" → choose 7d or 30d."
            )
        )

        cumulative_kwh = 0.0
        batch = []
        created = 0
        ts = start
        while ts < end:
            day_index = (ts.date() - start.date()).days
            local_ts = timezone.localtime(ts, tz) if timezone.is_aware(ts) else ts
            hour = local_ts.hour
            is_weekend = local_ts.weekday() >= 5
            w = hour_weights(role, is_weekend)
            kwh = hourly_kwh_for_device(role, hour, is_weekend, day_index, w, rng)
            cumulative_kwh += kwh
            power_w = kwh * 1000.0
            voltage = VOLTAGE
            current_a = power_w / voltage if voltage else 0.0

            batch.append(
                TelemetryReading(
                    device=device,
                    voltage=round(voltage, 2),
                    current=round(current_a, 2),
                    power=round(power_w, 2),
                    energy_kwh=round(cumulative_kwh, 6),
                    created_at=ts,
                )
            )
            if len(batch) >= BULK_CHUNK:
                TelemetryReading.objects.bulk_create(batch)
                created += len(batch)
                self.stdout.write(f"  Inserted {created} / {total_hours} ...")
                batch = []
            ts += timedelta(hours=1)

        if batch:
            TelemetryReading.objects.bulk_create(batch)
            created += len(batch)
        self.stdout.write(self.style.SUCCESS(f"Done. Inserted {created} records for device id={device.id}."))
