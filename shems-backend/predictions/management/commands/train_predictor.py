"""
Train a scikit-learn regression model for daily usage prediction.

Data: TelemetryReading aggregated to daily (all users' homes pooled).
Features: day_of_week, is_weekend, day_index, prev_day_usage, mean_7_kwh, month.
Uses time-ordered test split (last N% of dates) — better for forecasting than random split.
Saves: models/predictor.joblib (model + ref_date + feature_names + meta metrics).

Run: python manage.py train_predictor
"""
from datetime import datetime
from pathlib import Path

import pandas as pd
import joblib
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone

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
                start_m = max(0, i - 7)
                window_days = daily[start_m:i]
                mean_7 = (
                    sum(float(x["kwh"]) for x in window_days) / len(window_days)
                    if window_days
                    else 0.0
                )
                rows.append({
                    "date": d["date"],
                    "day_of_week": day_of_week,
                    "total_kwh": kwh,
                    "is_weekend": is_weekend,
                    "day_index": day_index,
                    "prev_day_usage": prev_kwh,
                    "mean_7_kwh": mean_7,
                    "month": dt.month,
                })

        if not rows:
            self.stdout.write(self.style.WARNING("No daily rows found. Add devices and telemetry, then re-run."))
            return

        df = pd.DataFrame(rows)
        df = df.dropna(subset=["prev_day_usage"])
        if len(df) < 20:
            self.stdout.write(
                self.style.WARNING(
                    f"Only {len(df)} rows after adding lag. Need more history (e.g. run for 30+ days)."
                )
            )
            return

        df = df.sort_values("date")
        feature_cols = [
            "day_of_week",
            "is_weekend",
            "day_index",
            "prev_day_usage",
            "mean_7_kwh",
            "month",
        ]
        X = df[feature_cols]
        y = df["total_kwh"]

        split_idx = max(1, int(len(df) * (1.0 - test_size)))
        if split_idx >= len(df):
            split_idx = len(df) - 1
        X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
        y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

        self.stdout.write(
            f"Rows: {len(df)} (train {len(X_train)}, time-holdout test {len(X_test)})"
        )

        model = RandomForestRegressor(
            n_estimators=200,
            max_depth=14,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1,
        )
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        r2 = r2_score(y_test, y_pred)
        mae = mean_absolute_error(y_test, y_pred)
        self.stdout.write(self.style.SUCCESS(f"Holdout R² (time-ordered): {r2:.4f}"))
        self.stdout.write(self.style.SUCCESS(f"Holdout MAE (kWh/day): {mae:.4f}"))

        trained_at = timezone.now().isoformat()
        payload = {
            "model": model,
            "ref_date": REF_DATE.isoformat(),
            "feature_names": feature_cols,
            "meta": {
                "trained_at": trained_at,
                "r2_test": float(r2),
                "mae_test_kwh": float(mae),
                "n_samples": int(len(df)),
                "n_train": int(len(X_train)),
                "n_test": int(len(X_test)),
                "algorithm": "RandomForestRegressor",
                "feature_description": (
                    "Calendar + lag-1 kWh + 7-day trailing mean kWh + month; "
                    "trained on pooled daily home totals from all users."
                ),
            },
        }
        out_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(payload, out_path)
        self.stdout.write(self.style.SUCCESS(f"Model saved to {out_path}"))
