"""
Prediction and recommendation logic using real telemetry data.
Uses a scikit-learn model (Random Forest) for all predictions (no moving-average fallback).
Also generates smart recommendations based on trends, per-device usage, and time-of-day patterns.
"""
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from django.utils import timezone
from django.conf import settings

from devices.models import Device
from telemetry.models import TelemetryReading
from user_settings.models import UserSettings
from user_settings.tariff_service import cost_for_units, is_protected_consumer
from user_settings.usage_service import get_home_monthly_usage

# Lazy-loaded model payload: {"model", "ref_date", "feature_names"}
_cached_model = None


def _get_model():
    """Load predictor.joblib from models/ if present; cache in memory."""
    global _cached_model
    if _cached_model is not None:
        return _cached_model
    model_path = Path(settings.BASE_DIR) / "models" / "predictor.joblib"
    if not model_path.exists():
        return None
    try:
        import joblib
        _cached_model = joblib.load(model_path)
        return _cached_model
    except Exception:
        return None


def get_model_meta():
    """
    Metadata stored at train time (for UI / report). None if no model or old file without meta.
    """
    payload = _get_model()
    if not payload:
        return None
    meta = payload.get("meta")
    if not meta:
        return {
            "algorithm": "RandomForestRegressor",
            "feature_names": payload.get("feature_names", []),
            "note": "Re-run train_predictor to record R², MAE, and trained_at.",
        }
    out = dict(meta)
    out["feature_names"] = payload.get("feature_names", [])
    return out


def calc_kwh_in_range(device, start_dt, end_dt):
    """Total kWh for one device in [start_dt, end_dt) using positive deltas."""
    readings = (
        TelemetryReading.objects.filter(
            device=device, created_at__gte=start_dt, created_at__lt=end_dt
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
    return round(total, 4)


def get_daily_usage_history(user, days=60):
    """
    Returns list of { "date": "YYYY-MM-DD", "kwh": float } for the last `days` days.
    Only includes days that have at least one reading.
    """
    devices = Device.objects.filter(user=user)
    if not devices.exists():
        return []

    tz = timezone.get_current_timezone()
    now = timezone.localtime(timezone.now(), tz)
    start = (now - timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)

    daily = []
    for i in range(days):
        day_start = start + timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        total = 0.0
        for device in devices:
            total += calc_kwh_in_range(device, day_start, day_end)
        daily.append({
            "date": day_start.date().isoformat(),
            "kwh": round(total, 4),
        })
    return daily


def _effective_tariff_for_user(user) -> float:
    """Slab-derived PKR/kWh for current month, else saved manual rate."""
    settings_obj, _ = UserSettings.objects.get_or_create(user=user)
    fallback = float(settings_obj.tariff_pkr_per_kwh or 0)
    monthly = get_home_monthly_usage(user, months=6)
    if not monthly:
        return fallback
    is_protected = is_protected_consumer([m["kwh"] for m in monthly])
    mtd = monthly[0]["kwh"]
    _, bill = cost_for_units(
        mtd,
        is_protected=is_protected,
        fallback_tariff=fallback,
        use_slab=settings_obj.use_slab_billing,
    )
    if bill and bill.effective_pkr_per_kwh is not None:
        return float(bill.effective_pkr_per_kwh)
    return fallback


def _forecast_context(hist_kwh: list[float]) -> dict:
    """
    Summarise recent usage for UI + blending.
    Typical home: ~5–15 kWh/day. Stress-test spikes are flagged separately.
    """
    if not hist_kwh:
        return {
            "today_kwh": 0.0,
            "recent_7_day_avg_kwh": 0.0,
            "typical_daily_kwh": 0.0,
            "usage_regime": "insufficient",
            "blend_model_weight": 1.0,
        }

    today = float(hist_kwh[-1])
    last_7 = [float(x) for x in hist_kwh[-7:]]
    prior_7 = [float(x) for x in hist_kwh[-8:-1]] if len(hist_kwh) > 1 else last_7[:]

    recent_7_avg = sum(last_7) / len(last_7)
    typical = sum(prior_7) / len(prior_7) if prior_7 else recent_7_avg

    regime = "normal"
    blend_model = 0.55

    if typical > 0 and today > typical * 2.5:
        regime = "spike_today"
        blend_model = 0.2
    elif typical > 0 and recent_7_avg > typical * 1.8:
        regime = "elevated_week"
        blend_model = 0.35
    elif typical > 0 and today < typical * 0.4:
        regime = "low_today"
        blend_model = 0.45

    return {
        "today_kwh": round(today, 2),
        "recent_7_day_avg_kwh": round(recent_7_avg, 2),
        "typical_daily_kwh": round(typical, 2),
        "usage_regime": regime,
        "blend_model_weight": blend_model,
    }


def forecast_note_for_regime(ctx: dict) -> str | None:
    regime = ctx.get("usage_regime")
    typical = ctx.get("typical_daily_kwh", 0)
    today = ctx.get("today_kwh", 0)
    recent = ctx.get("recent_7_day_avg_kwh", 0)

    if regime == "spike_today":
        return (
            f"Today ({today:.1f} kWh) is much higher than your recent typical "
            f"~{typical:.1f} kWh/day — often caused by stress testing or a one-off heavy load. "
            "The forecast blends your recent week with the ML model and assumes usage "
            "may return toward normal. Run `python manage.py train_predictor` after "
            "collecting 2+ weeks at your real usage level if patterns have permanently changed."
        )
    if regime == "elevated_week":
        return (
            f"Your last 7 days average {recent:.1f} kWh/day — above your earlier typical "
            f"~{typical:.1f} kWh/day. Forecast is weighted toward recent consumption."
        )
    if regime == "normal" and typical > 0:
        return (
            f"Based on your recent ~{recent:.1f} kWh/day and seasonal patterns from the trained model. "
            "Retrain with `python manage.py train_predictor` after major long-term usage changes."
        )
    return None


def _predict_with_model(user, period_days, history):
    """
    Use loaded .joblib model to predict next period_days.
    Supports legacy 4-feature models and current 6-feature models (with 7-day mean).
    """
    payload = _get_model()
    if payload is None:
        return None
    model = payload["model"]
    feature_names = payload.get("feature_names") or []
    ref_date_str = payload.get("ref_date", "2020-01-01")
    try:
        ref_date = datetime.strptime(ref_date_str, "%Y-%m-%d").date()
    except ValueError:
        return None
    usage_days = [d for d in history if d["kwh"] is not None and d["kwh"] >= 0]
    if not usage_days:
        return None
    last_usage = usage_days[-1]["kwh"]

    settings_obj, _ = UserSettings.objects.get_or_create(user=user)
    tariff = _effective_tariff_for_user(user)
    tz = timezone.get_current_timezone()
    now = timezone.localtime(timezone.now(), tz)
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)

    use_extended = len(feature_names) >= 6 and "mean_7_kwh" in feature_names

    hist_kwh = [float(d["kwh"]) for d in history]
    ctx = _forecast_context(hist_kwh)
    blend_model = float(ctx["blend_model_weight"])
    # Baseline: typical recent day (exclude today's spike from "normal" anchor)
    prior = hist_kwh[-8:-1] if len(hist_kwh) > 1 else hist_kwh
    recent_baseline = sum(prior) / len(prior) if prior else ctx["recent_7_day_avg_kwh"]

    if use_extended:
        window = hist_kwh[-7:]
        if len(window) < 7:
            pad = window[0] if window else recent_baseline
            window = [pad] * (7 - len(window)) + list(window)
        prev_kwh = hist_kwh[-1] if hist_kwh else recent_baseline
    else:
        window = None
        prev_kwh = float(hist_kwh[-1]) if hist_kwh else recent_baseline

    predictions = []
    for i in range(period_days):
        d = tomorrow + timedelta(days=i)
        dt = d.date()
        day_of_week = dt.weekday()
        is_weekend = 1 if day_of_week >= 5 else 0
        day_index = (dt - ref_date).days
        if use_extended:
            mean_7 = sum(window) / 7.0
            month = dt.month
            row = {
                "day_of_week": day_of_week,
                "is_weekend": is_weekend,
                "day_index": day_index,
                "prev_kwh": prev_kwh,
                "mean_7_kwh": mean_7,
                "month": month,
            }
            X = pd.DataFrame([row], columns=feature_names)
        else:
            cols = feature_names or [
                "day_of_week",
                "is_weekend",
                "day_index",
                "prev_kwh",
            ]
            row = {
                "day_of_week": day_of_week,
                "is_weekend": is_weekend,
                "day_index": day_index,
                "prev_kwh": prev_kwh,
            }
            X = pd.DataFrame([row], columns=cols)
        model_pred = float(model.predict(X)[0])
        model_pred = max(0.0, model_pred)
        pred = (blend_model * model_pred) + ((1.0 - blend_model) * recent_baseline)
        pred = max(0.0, round(pred, 4))
        prev_kwh = pred
        if use_extended:
            window = window[1:] + [pred]
        cost = round(pred * tariff, 2)
        predictions.append({
            "date": dt.isoformat(),
            "date_label": d.strftime("%b %d"),
            "predicted_usage_kwh": round(pred, 2),
            "predicted_cost_pkr": cost,
        })
    return predictions, ctx


def predict_usage(user, period_days=7):
    """
    Predict next period_days using the trained scikit-learn model only.

    Returns:
      (predictions, message)

    - predictions: list of { "date", "predicted_usage_kwh", "predicted_cost_pkr" }
    - message: None on success, or a string explaining why predictions are unavailable
      (e.g. not enough data or model not trained).
    """
    history = get_daily_usage_history(user, days=90)
    usage_days = [d for d in history if d["kwh"] > 0]
    if len(usage_days) < 3:
        return [], "Need at least 3 days of usage data to generate predictions.", {}

    # Require a trained model
    payload = _get_model()
    if payload is None:
        return [], "Prediction model is not trained yet. Run `python manage.py train_predictor`.", {}

    result = _predict_with_model(user, period_days, history)
    if not result:
        return [], (
            "Prediction model could not generate values for this user yet. "
            "If you recently retrained with new features, ensure the loaded .joblib matches."
        ), {}

    model_preds, ctx = result
    note = forecast_note_for_regime(ctx)
    return model_preds, note, ctx


def get_recommendations(user):
    """
    Data-driven recommendations using monthly reports, device breakdown, and solar config.
    Returns list of { "type", "priority", "title", "description", "impact" }.
    """
    from user_settings.views import MonthlyReportsAPI
    from solar.models import SolarConfig

    recs = []
    api = MonthlyReportsAPI()
    reports, _monthly_usage = api.get_monthly_reports(user, months=12)
    device_breakdown = api.get_device_breakdown(user, months=1)  # current month only

    tariff = 0.0
    settings_obj, _ = UserSettings.objects.get_or_create(user=user)
    if settings_obj.tariff_pkr_per_kwh:
        tariff = float(settings_obj.tariff_pkr_per_kwh)

    # Month-over-month trend
    if len(reports) >= 2:
        this_month = reports[0]["kwh"]
        last_month = reports[1]["kwh"]
        if last_month > 0:
            pct = ((this_month - last_month) / last_month) * 100
            if pct > 15:
                recs.append({
                    "type": "savings",
                    "priority": "high",
                    "title": "Usage increased this month",
                    "description": (
                        f"Your usage is {pct:.0f}% higher than last month "
                        f"({this_month:.1f} vs {last_month:.1f} kWh). Check for new loads or leaks."
                    ),
                    "impact": (
                        f"Reducing to last month's level could save ~PKR "
                        f"{round((this_month - last_month) * tariff):,}/month"
                    ),
                })
            elif pct < -15:
                recs.append({
                    "type": "efficiency",
                    "priority": "low",
                    "title": "Usage decreased this month",
                    "description": (
                        f"Your usage is {abs(pct):.0f}% lower than last month. "
                        "Keep up good habits."
                    ),
                    "impact": "Continue monitoring to maintain savings",
                })

    # Top consumer device (monthly)
    if device_breakdown:
        sorted_devices = sorted(device_breakdown, key=lambda x: x["kwh"], reverse=True)
        top = sorted_devices[0]
        if top["kwh"] > 0:
            total_this_month = sum(d["kwh"] for d in device_breakdown)
            pct = (top["kwh"] / total_this_month * 100) if total_this_month > 0 else 0
            if pct > 40:
                recs.append({
                    "type": "efficiency",
                    "priority": "high",
                    "title": f'"{top["name"]}" is your biggest consumer',
                    "description": (
                        f"It used {top['kwh']:.1f} kWh this month ({pct:.0f}% of total). "
                        "Consider scheduling or power limits."
                    ),
                    "impact": (
                        f"Set a schedule or limit on Devices page to save up to "
                        f"PKR {round(top['cost_pkr'] * 0.3):,}/month"
                    ),
                })

    # Time-of-day pattern: detect devices with heavy peak-hour usage (18:00–22:00)
    # over last 7 days and suggest shifting those loads to off-peak.
    tz = timezone.get_current_timezone()
    now_local = timezone.localtime(timezone.now(), tz)
    start_local = now_local - timedelta(days=7)
    peak_start, peak_end = 18, 22

    peak_heavy_device = None
    peak_heavy_ratio = 0.0

    for device in Device.objects.filter(user=user):
        readings = (
            TelemetryReading.objects
            .filter(device=device, created_at__gte=start_local, created_at__lte=now_local)
            .order_by("created_at")
            .values("created_at", "energy_kwh")
        )

        total_kwh = 0.0
        peak_kwh = 0.0
        prev_e = None
        prev_ts = None

        for row in readings:
            e = row["energy_kwh"]
            ts = timezone.localtime(row["created_at"], tz)
            try:
                cur = float(e)
            except (TypeError, ValueError):
                prev_e, prev_ts = cur, ts
                continue

            if prev_e is not None:
                delta = cur - float(prev_e)
                if delta > 0:
                    total_kwh += delta
                    if peak_start <= ts.hour < peak_end:
                        peak_kwh += delta
            prev_e, prev_ts = cur, ts

        if total_kwh <= 0:
            continue

        ratio = peak_kwh / total_kwh
        # Consider a device "peak-heavy" if >50% of its energy is during 18–22h
        # and it uses at least ~5 kWh over the last week (to skip tiny loads).
        if ratio > 0.5 and total_kwh >= 5.0 and ratio > peak_heavy_ratio:
            peak_heavy_ratio = ratio
            peak_heavy_device = (device, total_kwh, peak_kwh, ratio)

    if peak_heavy_device:
        d, total_kwh, peak_kwh, ratio = peak_heavy_device
        recs.append({
            "type": "timing",
            "priority": "medium",
            "title": f"Shift '{d.name}' away from peak hours",
            "description": (
                f"Over the last week, about {ratio*100:.0f}% of '{d.name}' usage was "
                f"between {peak_start}:00–{peak_end}:00 (grid peak hours). "
                "Consider running it later at night (e.g. after 10 PM) when possible."
            ),
            "impact": "Shifting this device to off-peak can lower your bill on high-usage days.",
        })

    # Solar suggestion if no solar or low capacity
    solar_config = SolarConfig.objects.filter(user=user, enabled=True).first()
    avg_monthly = sum(r["kwh"] for r in reports) / len(reports) if reports else 0
    if avg_monthly > 100 and not solar_config:
        recs.append({
            "type": "solar",
            "priority": "medium",
            "title": "Consider adding solar",
            "description": (
                f"Your average usage is {avg_monthly:.0f} kWh/month. "
                "Solar could reduce grid dependency and bills."
            ),
            "impact": "Potential savings depend on capacity and tariff.",
        })
    elif solar_config and avg_monthly > 150:
        recs.append({
            "type": "solar",
            "priority": "low",
            "title": "Expand solar capacity",
            "description": (
                f"With {avg_monthly:.0f} kWh/month usage, increasing solar could further cut grid usage."
            ),
            "impact": "Estimate savings in the Solar page for your configuration.",
        })

    # Sort: high first, then medium, then low
    order = {"high": 0, "medium": 1, "low": 2}
    recs.sort(key=lambda r: (order.get(r["priority"], 1), r["title"]))
    return recs[:8]  # cap at 8
