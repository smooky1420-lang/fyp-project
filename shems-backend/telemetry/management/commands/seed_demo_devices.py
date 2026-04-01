"""
Run synthetic telemetry generation for your three demo devices (by device token).

Uses `generate_synthetic_telemetry` with roles: 1st token = AC, 2nd = PC, 3rd = Fan/Lights.

Run from shems-backend:
  python manage.py seed_demo_devices

Or pass custom tokens:
  python manage.py seed_demo_devices abc123 def456 ghi789
"""
from django.core.management import call_command
from django.core.management.base import BaseCommand

DEFAULT_TOKENS = (
    "e129b36e85854b7f938f78ab75890bc2",
    "1a23e453fb9a430f9a5f46e12ef3299e",
    "e7a6e7f58f8d4d1c8d5f48c295394478",
)
# Order: AC → PC → Fan/Lights (matches Pakistani household model)
DEFAULT_ROLES = ("ac", "pc", "fan")


class Command(BaseCommand):
    help = "Generate synthetic data for the 3 demo device tokens (default list built-in)."

    def add_arguments(self, parser):
        parser.add_argument(
            "tokens",
            nargs="*",
            help="Optional device tokens (3). If omitted, uses the default demo tokens.",
        )
        parser.add_argument(
            "--no-clear",
            action="store_true",
            help="Do not delete existing readings before generating (default is to clear).",
        )
        parser.add_argument(
            "--base-seed",
            type=int,
            default=100,
            help="Base random seed; each device uses base_seed + index (default 100).",
        )

    def handle(self, *args, **options):
        tokens = options["tokens"]
        if not tokens:
            tokens = list(DEFAULT_TOKENS)
        if len(tokens) != 3:
            self.stdout.write(
                self.style.ERROR("Provide exactly 3 device tokens, or omit to use the default three.")
            )
            return

        clear = not options["no_clear"]
        base_seed = options["base_seed"]

        for i, token in enumerate(tokens):
            token = token.strip()
            role = DEFAULT_ROLES[i]
            self.stdout.write("")
            self.stdout.write(self.style.WARNING(f"=== Device {i + 1}/3 ({role}): {token[:8]}... ==="))
            kwargs = {
                "device_token": token,
                "seed": base_seed + i,
                "role": role,
            }
            if clear:
                kwargs["clear"] = True
            call_command("generate_synthetic_telemetry", **kwargs)

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("All 3 devices processed. Train model: python manage.py train_predictor"))
