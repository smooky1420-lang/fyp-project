from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from telemetry.models import TelemetryReading
from user_settings.models import UserSettings
from .models import SolarConfig, WeatherCache
from .weather_service import get_weather
from .solar_service import estimate_solar_kw

class SolarConfigAPI(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cfg, _ = SolarConfig.objects.get_or_create(user=request.user)
        return Response({
            "enabled": cfg.enabled,
            "installed_capacity_kw": cfg.installed_capacity_kw,
            "latitude": cfg.latitude,
            "longitude": cfg.longitude,
        })

    def put(self, request):
        cfg, _ = SolarConfig.objects.get_or_create(user=request.user)

        cfg.enabled = request.data.get("enabled", cfg.enabled)
        cfg.installed_capacity_kw = request.data.get(
            "installed_capacity_kw", cfg.installed_capacity_kw
        )
        cfg.latitude = request.data.get("latitude", cfg.latitude)
        cfg.longitude = request.data.get("longitude", cfg.longitude)
        cfg.save()

        return Response({"status": "saved"})


class SolarStatusAPI(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cfg = SolarConfig.objects.filter(user=request.user, enabled=True).first()
        if not cfg:
            return Response({"enabled": False})

        weather = get_weather(cfg.latitude, cfg.longitude)

        now = timezone.now()
        solar_kw = estimate_solar_kw(
            cfg.installed_capacity_kw,
            weather.cloud_cover,
            now,
            weather.sunrise,
            weather.sunset,
        )

        latest = (
            TelemetryReading.objects
            .filter(device__user=request.user)
            .order_by("-created_at")
            .first()
        )

        home_kw = round((latest.power / 1000), 3) if latest else 0.0
        grid_import_kw = round(max(home_kw - solar_kw, 0.0), 3)

        settings_obj, _ = UserSettings.objects.get_or_create(user=request.user)
        tariff = float(settings_obj.tariff_pkr_per_kwh)

        savings_today = round(min(home_kw, solar_kw) * tariff, 2)

        return Response({
            "enabled": True,
            "solar_kw": solar_kw,
            "home_kw": home_kw,
            "grid_import_kw": grid_import_kw,
            "savings_today_pkr": savings_today,
            "cloud_cover": weather.cloud_cover,
            "source": "estimated"
        })


class SolarHistoryAPI(APIView):
    """
    Returns solar generation history for charts.
    Query params:
      from=2025-12-27T00:00:00Z (optional)
      to=2025-12-27T23:59:59Z (optional)
      limit=500 (optional)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cfg = SolarConfig.objects.filter(user=request.user, enabled=True).first()
        if not cfg:
            return Response({"detail": "Solar not enabled."}, status=400)

        # Get weather cache (or fetch if needed)
        weather = get_weather(cfg.latitude, cfg.longitude)

        # Get telemetry readings for the user's devices
        qs = TelemetryReading.objects.filter(device__user=request.user).order_by("-created_at")

        dt_from = request.query_params.get("from")
        dt_to = request.query_params.get("to")
        if dt_from:
            d = parse_datetime(dt_from)
            if not d:
                return Response({"detail": "Invalid 'from' datetime."}, status=400)
            qs = qs.filter(created_at__gte=d)

        if dt_to:
            d = parse_datetime(dt_to)
            if not d:
                return Response({"detail": "Invalid 'to' datetime."}, status=400)
            qs = qs.filter(created_at__lte=d)

        limit_str = request.query_params.get("limit", "200")
        try:
            limit = max(1, min(20000, int(limit_str)))
        except ValueError:
            return Response({"detail": "Invalid limit."}, status=400)

        readings = list(qs[:limit])
        readings.reverse()  # ascending time

        # Calculate solar generation for each reading
        history = []
        for reading in readings:
            reading_time = reading.created_at
            if reading_time.tzinfo is None:
                reading_time = timezone.make_aware(reading_time)

            solar_kw = estimate_solar_kw(
                cfg.installed_capacity_kw,
                weather.cloud_cover,
                reading_time,
                weather.sunrise,
                weather.sunset,
            )

            history.append({
                "timestamp": reading.created_at.isoformat(),
                "solar_kw": solar_kw,
                "home_kw": round(reading.power / 1000, 3),
                "grid_import_kw": round(max((reading.power / 1000) - solar_kw, 0.0), 3),
            })

        return Response(history)
