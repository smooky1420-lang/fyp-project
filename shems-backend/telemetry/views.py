from django.utils.dateparse import parse_datetime
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.utils import timezone
from django.conf import settings
from devices.models import Device
from .models import TelemetryReading
from .serializers import TelemetryUploadSerializer, TelemetryReadingSerializer
from user_settings.models import UserSettings


class TelemetryUploadAPI(APIView):
    """
    ESP32 / demo script endpoint.
    Authenticate using X-DEVICE-TOKEN header (NOT JWT).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.headers.get("X-DEVICE-TOKEN")
        if not token:
            return Response({"detail": "Missing X-DEVICE-TOKEN header."}, status=401)

        device = Device.objects.filter(device_token=token).first()
        if not device:
            return Response({"detail": "Invalid device token."}, status=401)

        s = TelemetryUploadSerializer(data=request.data)
        s.is_valid(raise_exception=True)

        reading = TelemetryReading.objects.create(
            device=device,
            voltage=s.validated_data["voltage"],
            current=s.validated_data["current"],
            power=s.validated_data["power"],
            energy_kwh=s.validated_data["energy_kwh"],
        )

        return Response(TelemetryReadingSerializer(reading).data, status=201)


class TelemetryLatestAPI(APIView):
    """
    Dashboard endpoint (JWT). Returns latest reading for a device owned by user.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        device_id = request.query_params.get("device_id")
        if not device_id:
            return Response({"detail": "device_id is required."}, status=400)

        device = Device.objects.filter(id=device_id, user=request.user).first()
        if not device:
            return Response({"detail": "Device not found."}, status=404)

        reading = TelemetryReading.objects.filter(device=device).order_by("-created_at").first()
        if not reading:
            return Response({"detail": "No readings yet."}, status=404)

        return Response(TelemetryReadingSerializer(reading).data)


class TelemetryRangeAPI(APIView):
    """
    Dashboard charts endpoint (JWT).
    Query params:
      device_id=1
      from=2025-12-27T00:00:00Z (optional)
      to=2025-12-27T23:59:59Z (optional)
      limit=500 (optional)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        device_id = request.query_params.get("device_id")
        if not device_id:
            return Response({"detail": "device_id is required."}, status=400)

        device = Device.objects.filter(id=device_id, user=request.user).first()
        if not device:
            return Response({"detail": "Device not found."}, status=404)

        qs = TelemetryReading.objects.filter(device=device).order_by("-created_at")

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

        items = list(qs[:limit])
        items.reverse()  # return ascending time for charts

        return Response(TelemetryReadingSerializer(items, many=True).data)

class TelemetryTodaySummaryAPI(APIView):
    """
    Dashboard summary for "today" (JWT).
    Returns per-device today kWh + home total + cost (PKR).

    Optional query:
      device_id=1  -> returns only that device
    """
    permission_classes = [IsAuthenticated]

    def get_user_tariff(self, user) -> float:
        settings_obj, _ = UserSettings.objects.get_or_create(user=user)
        try:
            return float(settings_obj.tariff_pkr_per_kwh)
        except (TypeError, ValueError):
            return 0.0


    def calc_today_kwh_for_device(self, device, start_local, end_local) -> float:
        """
        Uses SUM of positive deltas of cumulative energy_kwh.
        More robust than last-first (handles resets better).
        """
        qs = (
            TelemetryReading.objects
            .filter(device=device, created_at__gte=start_local, created_at__lte=end_local)
            .order_by("created_at")
            .values_list("energy_kwh", flat=True)
        )

        total = 0.0
        prev = None
        for e in qs:
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

    def get(self, request):
        tz = timezone.get_current_timezone()
        now_local = timezone.localtime(timezone.now(), tz)

        start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        end_local = now_local  # up to "now"

        tariff = self.get_user_tariff(request.user)

        device_id = request.query_params.get("device_id")

        devices_qs = Device.objects.filter(user=request.user).order_by("id")
        if device_id:
            devices_qs = devices_qs.filter(id=device_id)

        devices = list(devices_qs)
        if device_id and not devices:
            return Response({"detail": "Device not found."}, status=404)

        devices_out = []
        home_total_kwh = 0.0

        for d in devices:
            today_kwh = self.calc_today_kwh_for_device(d, start_local, end_local)
            cost_pkr = round(today_kwh * tariff, 2)

            home_total_kwh += today_kwh

            devices_out.append({
                "device_id": d.id,
                "name": d.name,
                "today_kwh": today_kwh,
                "cost_pkr": cost_pkr,
            })

        home_total_kwh = round(home_total_kwh, 4)
        home_total_cost_pkr = round(home_total_kwh * tariff, 2)

        return Response({
            "date": now_local.date().isoformat(),
            "timezone": str(tz),
            "tariff_pkr_per_kwh": tariff,
            "devices": devices_out,
            "home_total_kwh": home_total_kwh,
            "home_total_cost_pkr": home_total_cost_pkr,
        })
