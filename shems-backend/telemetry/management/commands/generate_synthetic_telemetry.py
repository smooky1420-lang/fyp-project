"""
Generate 1 year of synthetic hourly electricity usage and save to TelemetryReading.

Logic:
  - Base load: 0.5 kWh per hour
  - Peak hours (18:00–22:00): add 3.0 kWh
  - Weekends: multiply total by 1.2
  - Noise: numpy.random.normal for slight randomness

Readings are stored per device (device has user). Uses voltage, current, power, energy_kwh, created_at.

Run: python manage.py generate_synthetic_telemetry [--device-token TOKEN] [--user USER_ID] [--device DEVICE_ID]
"""
from datetime import datetime, timedelta
import numpy as np
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model
from devices.models import Device
from telemetry.models import TelemetryReading

User = get_user_model()

BASE_KWH = 0.5
PEAK_EXTRA_KWH = 3.0
PEAK_START_HOUR = 18
PEAK_END_HOUR = 22  # exclusive: 18, 19, 20, 21
WEEKEND_FACTOR = 1.2
NOISE_SCALE = 0.1  # std dev for normal noise (kWh)
VOLTAGE = 230.0
# SQLite allows ~999 bound params per statement; 6 fields per row → max ~166 rows. Use 100 to be safe.
BULK_CHUNK = 100


def hourly_kwh_usage(dt: datetime, rng: np.random.Generator) -> float:
    """Synthetic hourly usage in kWh: base + peak + weekend + noise."""
    kwh = BASE_KWH
    if PEAK_START_HOUR <= dt.hour < PEAK_END_HOUR:
        kwh += PEAK_EXTRA_KWH
    if dt.weekday() >= 5:  # Saturday=5, Sunday=6
        kwh *= WEEKEND_FACTOR
    kwh += rng.normal(0, NOISE_SCALE)
    return max(0.01, float(kwh))


class Command(BaseCommand):
    help = "Generate 1 year of synthetic hourly TelemetryReading data for a device."

    def add_arguments(self, parser):
        parser.add_argument(
            "--device-token",
            type=str,
            default=None,
            help="Device token (e.g. from Devices page). Find this device and store readings for it.",
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

        if options.get("clear"):
            deleted, _ = TelemetryReading.objects.filter(device=device).delete()
            self.stdout.write(f"Cleared {deleted} existing readings for device id={device.id}.")

        tz = timezone.get_current_timezone()
        now = timezone.localtime(timezone.now(), tz)
        # End at current hour so "last 24h" in the UI always includes the latest reading
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
            kwh = hourly_kwh_usage(ts, rng)
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
