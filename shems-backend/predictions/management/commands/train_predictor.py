"""
Train a scikit-learn regression model for daily usage prediction.

Data: TelemetryReading aggregated to daily (Date, Day of Week, Total kWh).
Features: Day of Week, Is Weekend, Day Index (trend), Previous Day Usage (lag).
Saves: models/predictor.joblib (model + ref_date for day_index).

Run: python manage.py train_predictor
"""
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import joblib
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone

from devices.models import Device
from predictions.services import get_daily_usage_history

User = get_user_model()

# Fixed reference date for day_index (consistent between train and inference)
REF_DATE = datetime(2020, 1, 1).date()


class Command(BaseCommand):
    help = "Build daily dataset from TelemetryReading, add features, train model, save as .joblib"

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=730,
            help="Number of days of history per user to use (default 730).",
        )
        parser.add_argument(
            "--min-days",
            type=int,
            default=14,
            help="Minimum days with data per user to include (default 14).",
        )
        parser.add_argument(
            "--out",
            type=str,
            default=None,
            help="Output path for .joblib (default: <project>/models/predictor.joblib).",
        )
        parser.add_argument(
            "--test-size",
            type=float,
            default=0.2,
            help="Fraction for test split (default 0.2).",
        )

    def handle(self, *args, **options):
        days = options["days"]
        min_days = options["min_days"]
        out_path = options["out"]
        test_size = options["test_size"]

        if out_path is None:
            base_dir = Path(__file__).resolve().parent.parent.parent.parent
            models_dir = base_dir / "models"
            models_dir.mkdir(exist_ok=True)
            out_path = models_dir / "predictor.joblib"
        else:
            out_path = Path(out_path)

        self.stdout.write("Pulling daily usage for all users...")
        rows = []
        users_with_devices = User.objects.filter(devices__isnull=False).distinct()
        for user in users_with_devices:
            daily = get_daily_usage_history(user, days=days)
            # Only days with at least some usage (we could keep zeros; here we keep all for lag)
            for i, d in enumerate(daily):
                try:
                    dt = datetime.strptime(d["date"], "%Y-%m-%d").date()
                except ValueError:
                    continue
                kwh = float(d["kwh"])
                day_of_week = dt.weekday()  # 0=Monday, 6=Sunday
                is_weekend = 1 if day_of_week >= 5 else 0
                day_index = (dt - REF_DATE).days
                prev_kwh = daily[i - 1]["kwh"] if i > 0 else None
                rows.append({
                    "date": d["date"],
                    "day_of_week": day_of_week,
                    "total_kwh": kwh,
                    "is_weekend": is_weekend,
                    "day_index": day_index,
                    "prev_day_usage": prev_kwh,
                })

        if not rows:
            self.stdout.write(self.style.WARNING("No daily rows found. Add devices and telemetry, then re-run."))
            return

        df = pd.DataFrame(rows)
        # Drop rows without previous day (needed for lag feature)
        df = df.dropna(subset=["prev_day_usage"])
        if len(df) < 20:
            self.stdout.write(
                self.style.WARNING(
                    f"Only {len(df)} rows after adding lag. Need more history (e.g. run for 30+ days)."
                )
            )
            return

        self.stdout.write(f"Training set: {len(df)} rows")
        X = df[["day_of_week", "is_weekend", "day_index", "prev_day_usage"]]
        y = df["total_kwh"]

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, random_state=42)
        model = RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42)
        model.fit(X_train, y_train)
        score = model.score(X_test, y_test)
        self.stdout.write(self.style.SUCCESS(f"R² on test set: {score:.4f}"))

        payload = {
            "model": model,
            "ref_date": REF_DATE.isoformat(),
            "feature_names": list(X.columns),
        }
        out_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(payload, out_path)
        self.stdout.write(self.style.SUCCESS(f"Model saved to {out_path}"))
