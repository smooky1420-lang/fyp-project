from datetime import timedelta
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from telemetry.models import TelemetryReading
from user_settings.models import UserSettings
from .models import SolarConfig, WeatherCache, SolarGeneration
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

        # Store historical data - store every time to ensure we have accurate history
        # Check if we already stored data in the last 5 minutes to avoid duplicates
        recent = SolarGeneration.objects.filter(
            user=request.user,
            created_at__gte=timezone.now() - timedelta(minutes=5)
        ).first()
        
        if not recent:
            try:
                SolarGeneration.objects.create(
                    user=request.user,
                    solar_kw=solar_kw,
                    home_kw=home_kw,
                    grid_import_kw=grid_import_kw,
                    cloud_cover=weather.cloud_cover,
                )
            except Exception as e:
                # Log error but don't fail the request
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to store solar generation: {e}")

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

        # Get stored solar generation data
        qs = SolarGeneration.objects.filter(user=request.user).order_by("-created_at")

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

        stored_data = list(qs[:limit])
        stored_data.reverse()  # ascending time

        # If we have stored data, use it
        if stored_data:
            history = []
            for gen in stored_data:
                history.append({
                    "timestamp": gen.created_at.isoformat(),
                    "solar_kw": gen.solar_kw,
                    "home_kw": gen.home_kw,
                    "grid_import_kw": gen.grid_import_kw,
                })
            return Response(history)

        # Fallback: calculate from telemetry if no stored data exists yet
        # This helps during initial setup before data is stored
        weather = get_weather(cfg.latitude, cfg.longitude)
        qs_telemetry = TelemetryReading.objects.filter(device__user=request.user).order_by("-created_at")

        if dt_from:
            d = parse_datetime(dt_from)
            if d:
                qs_telemetry = qs_telemetry.filter(created_at__gte=d)

        if dt_to:
            d = parse_datetime(dt_to)
            if d:
                qs_telemetry = qs_telemetry.filter(created_at__lte=d)

        readings = list(qs_telemetry[:limit])
        readings.reverse()

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
