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
from user_settings.tariff_service import cost_for_units, get_active_tariff_plan, is_protected_consumer
from user_settings.usage_service import get_home_monthly_usage
from .alerts_service import (
    dismiss_alerts,
    get_user_alerts,
    mark_alerts_read,
    sync_device_alerts,
)


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

        sync_device_alerts(device)

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
        end_local = now_local

        settings_obj, _ = UserSettings.objects.get_or_create(user=request.user)
        fallback_tariff = float(settings_obj.tariff_pkr_per_kwh or 0)
        plan = get_active_tariff_plan()
        monthly_usage = get_home_monthly_usage(request.user, months=6)
        is_protected = is_protected_consumer([m["kwh"] for m in monthly_usage])
        month_to_date_kwh = monthly_usage[0]["kwh"] if monthly_usage else 0.0

        _, month_bill = cost_for_units(
            month_to_date_kwh,
            is_protected=is_protected,
            fallback_tariff=fallback_tariff,
            plan=plan,
            use_slab=settings_obj.use_slab_billing,
        )
        if month_bill and month_bill.effective_pkr_per_kwh is not None:
            effective_tariff = float(month_bill.effective_pkr_per_kwh)
        else:
            effective_tariff = fallback_tariff

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
            cost_pkr = round(today_kwh * effective_tariff, 2)

            home_total_kwh += today_kwh

            devices_out.append({
                "device_id": d.id,
                "name": d.name,
                "today_kwh": today_kwh,
                "cost_pkr": cost_pkr,
            })

        home_total_kwh = round(home_total_kwh, 4)
        home_total_cost_pkr = round(home_total_kwh * effective_tariff, 2)
        month_to_date_cost = (
            float(month_bill.total_pkr) if month_bill else round(month_to_date_kwh * effective_tariff, 2)
        )

        return Response({
            "date": now_local.date().isoformat(),
            "timezone": str(tz),
            "tariff_pkr_per_kwh": effective_tariff,
            "month_to_date_kwh": round(month_to_date_kwh, 2),
            "month_to_date_cost_pkr": round(month_to_date_cost, 2),
            "use_slab_billing": settings_obj.use_slab_billing,
            "is_protected": is_protected,
            "devices": devices_out,
            "home_total_kwh": home_total_kwh,
            "home_total_cost_pkr": home_total_cost_pkr,
        })


class AlertsAPI(APIView):
    """Stored alerts synced from telemetry and device limits (JWT)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(get_user_alerts(request.user))

    def post(self, request):
        action = request.data.get("action")
        ids_raw = request.data.get("ids", [])

        if action not in ("mark_read", "dismiss", "dismiss_all"):
            return Response({"detail": "Invalid action."}, status=400)

        if action == "dismiss_all":
            count = dismiss_alerts(request.user)
            return Response({"updated": count})

        if not isinstance(ids_raw, list) or not ids_raw:
            return Response({"detail": "ids must be a non-empty list."}, status=400)

        try:
            alert_ids = [int(x) for x in ids_raw]
        except (TypeError, ValueError):
            return Response({"detail": "ids must be integers."}, status=400)

        if action == "mark_read":
            count = mark_alerts_read(request.user, alert_ids)
        else:
            count = dismiss_alerts(request.user, alert_ids)

        return Response({"updated": count})
