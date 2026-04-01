from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .services import predict_usage, get_recommendations, get_daily_usage_history


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

        predictions, message = predict_usage(request.user, period_days=period_days)

        # Include recent actuals for chart overlay (last 7 days that have data)
        history = get_daily_usage_history(request.user, days=14)
        from user_settings.models import UserSettings
        settings_obj, _ = UserSettings.objects.get_or_create(user=request.user)
        tariff = float(settings_obj.tariff_pkr_per_kwh or 0)

        actuals = []
        for d in history[-7:]:
            if d["kwh"] > 0:
                actuals.append({
                    "date": d["date"],
                    "date_label": d["date"][-5:],  # MM-DD
                    "actual_usage_kwh": d["kwh"],
                    "actual_cost_pkr": round(d["kwh"] * tariff, 2),
                })

        return Response({
            "predictions": predictions,
            "actuals": actuals,
            "message": message,
            "period_days": period_days,
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
