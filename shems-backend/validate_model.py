import os
from datetime import datetime, date

import django
import numpy as np

# --- DJANGO SETUP ---
# Assumes this file is run from shems-backend folder:  python validate_model.py
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model  # noqa: E402
from predictions.services import get_daily_usage_history, _get_model  # noqa: E402


def run_validation() -> None:
    User = get_user_model()
    u = User.objects.first()

    if not u:
        print("No user found in database.")
        return

    # 1) Get history
    hist = get_daily_usage_history(u, days=60)
    hist = [d for d in hist if d["kwh"] > 0]
    print(f"Days with data: {len(hist)}")

    if len(hist) < 20:
        print("Not enough history (need at least 20 days) for a proper test.")
        return

    REF_DATE = date(2020, 1, 1)

    # 2) Build features
    rows = []
    for i, d in enumerate(hist):
        dt = datetime.strptime(d["date"], "%Y-%m-%d").date()
        day_of_week = dt.weekday()
        is_weekend = 1 if day_of_week >= 5 else 0
        day_index = (dt - REF_DATE).days
        prev_kwh = hist[i - 1]["kwh"] if i > 0 else None

        rows.append(
            {
                "kwh": d["kwh"],
                "day_of_week": day_of_week,
                "is_weekend": is_weekend,
                "day_index": day_index,
                "prev_day_usage": prev_kwh,
            }
        )

    rows = [r for r in rows if r["prev_day_usage"] is not None]
    if not rows:
        print("No rows with previous-day usage available after filtering.")
        return

    X = np.array(
        [
            [r["day_of_week"], r["is_weekend"], r["day_index"], r["prev_day_usage"]]
            for r in rows
        ],
        dtype=float,
    )
    y = np.array([r["kwh"] for r in rows], dtype=float)

    payload = _get_model()
    if not payload:
        print("Model not found! Run 'python manage.py train_predictor' first.")
        return

    model = payload["model"]
    y_pred = model.predict(X)

    # 3) Metrics
    ss_res = np.sum((y - y_pred) ** 2)
    ss_tot = np.sum((y - y.mean()) ** 2)
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
    mae = float(np.mean(np.abs(y - y_pred)))

    print("-" * 30)
    print("VALIDATION RESULTS")
    print("-" * 30)
    print(f"Days evaluated: {len(y)}")
    print(f"R² Score: {r2:.3f} (1.0 is perfect)")
    print(f"MAE: {mae:.3f} kWh/day (Avg error)")
    print("-" * 30)
    print("First 5 actual vs predicted:")
    for actual, pred in list(zip(y, y_pred))[:5]:
        print(f"  Actual={actual:.2f} kWh | Pred={pred:.2f} kWh")


if __name__ == "__main__":
    run_validation()