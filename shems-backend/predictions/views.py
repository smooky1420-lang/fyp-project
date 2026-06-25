from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .services import (
    predict_usage,
    get_recommendations,
    get_daily_usage_history,
    get_model_meta,
    _effective_tariff_for_user,
)


class UsagePredictionAPI(APIView):
    """
    GET /api/predictions/usage/?period=7|30
    Returns predicted daily usage and cost for next 7 or 30 days.
    Uses the trained scikit-learn model (models/predictor.joblib).
    Needs at least 3 days of usage data.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        period = request.query_params.get("period", "7")
        try:
            period_days = int(period)
            if period_days not in (7, 30):
                period_days = 7
        except ValueError:
            period_days = 7

        predictions, message, forecast_ctx = predict_usage(
            request.user, period_days=period_days
        )

        history = get_daily_usage_history(request.user, days=14)
        tariff = _effective_tariff_for_user(request.user)

        actuals = []
        for d in history[-7:]:
            if d["kwh"] > 0:
                actuals.append({
                    "date": d["date"],
                    "date_label": d["date"][-5:],
                    "actual_usage_kwh": d["kwh"],
                    "actual_cost_pkr": round(d["kwh"] * tariff, 2),
                })

        return Response({
            "predictions": predictions,
            "actuals": actuals,
            "message": message,
            "period_days": period_days,
            "model_info": get_model_meta(),
            "forecast_context": forecast_ctx,
            "effective_tariff_pkr_per_kwh": tariff,
        })


class RecommendationsAPI(APIView):
    """
    GET /api/predictions/recommendations/
    Returns data-driven recommendations (month-over-month, top device, peak-hour usage, solar).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        recs = get_recommendations(request.user)
        return Response({"recommendations": recs})
