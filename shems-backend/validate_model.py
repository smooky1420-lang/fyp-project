import os
from datetime import datetime

import django
import numpy as np

# Run from shems-backend: python validate_model.py
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model  # noqa: E402
from predictions.services import get_daily_usage_history, _get_model  # noqa: E402

REF_DATE = datetime(2020, 1, 1).date()


def build_rows_from_daily(daily):
    rows = []
    for i, d in enumerate(daily):
        try:
            dt = datetime.strptime(d["date"], "%Y-%m-%d").date()
        except ValueError:
            continue
        kwh = float(d["kwh"])
        day_of_week = dt.weekday()
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
        rows.append(
            {
                "total_kwh": kwh,
                "day_of_week": day_of_week,
                "is_weekend": is_weekend,
                "day_index": day_index,
                "prev_day_usage": prev_kwh,
                "mean_7_kwh": mean_7,
                "month": dt.month,
            }
        )
    return rows


def run_validation() -> None:
    User = get_user_model()
    u = User.objects.first()

    if not u:
        print("No user found in database.")
        return

    payload = _get_model()
    if not payload:
        print("Model not found! Run 'python manage.py train_predictor' first.")
        return

    model = payload["model"]
    feature_names = payload.get("feature_names") or [
        "day_of_week",
        "is_weekend",
        "day_index",
        "prev_day_usage",
    ]

    daily = get_daily_usage_history(u, days=730)
    rows = build_rows_from_daily(daily)
    rows = [r for r in rows if r["prev_day_usage"] is not None]
    if len(rows) < 10:
        print("Not enough history for validation.")
        return

    if len(feature_names) >= 6 and "mean_7_kwh" in feature_names:
        X = np.array(
            [
                [
                    r["day_of_week"],
                    r["is_weekend"],
                    r["day_index"],
                    r["prev_day_usage"],
                    r["mean_7_kwh"],
                    r["month"],
                ]
                for r in rows
            ],
            dtype=float,
        )
    else:
        X = np.array(
            [
                [r["day_of_week"], r["is_weekend"], r["day_index"], r["prev_day_usage"]]
                for r in rows
            ],
            dtype=float,
        )

    y = np.array([r["total_kwh"] for r in rows], dtype=float)
    y_pred = model.predict(X)

    ss_res = np.sum((y - y_pred) ** 2)
    ss_tot = np.sum((y - y.mean()) ** 2)
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
    mae = float(np.mean(np.abs(y - y_pred)))

    print("-" * 40)
    print("VALIDATION (first user, in-sample sanity check)")
    print("-" * 40)
    print(f"Features: {feature_names}")
    print(f"Days evaluated: {len(y)}")
    print(f"R²: {r2:.4f}")
    print(f"MAE: {mae:.4f} kWh/day")
    if payload.get("meta"):
        m = payload["meta"]
        print(f"Training holdout R² (from joblib): {m.get('r2_test', 'n/a')}")
        print(f"Training holdout MAE: {m.get('mae_test_kwh', 'n/a')}")
    print("-" * 40)
    print("First 5 actual vs predicted:")
    for actual, pred in list(zip(y, y_pred))[:5]:
        print(f"  Actual={actual:.2f} kWh | Pred={pred:.2f} kWh")


if __name__ == "__main__":
    run_validation()
