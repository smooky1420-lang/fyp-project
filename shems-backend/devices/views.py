from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from .models import Device
from .serializers import DeviceSerializer


class DeviceViewSet(viewsets.ModelViewSet):
    serializer_class = DeviceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Device.objects.filter(user=self.request.user).order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class DeviceStateByTokenAPI(APIView):
    """
    For ESP32: GET control state using X-DEVICE-TOKEN (no JWT).
    Returns relay_on, schedule, and limits so the device can enforce them.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        token = request.headers.get("X-DEVICE-TOKEN")
        if not token:
            return Response({"detail": "Missing X-DEVICE-TOKEN header."}, status=401)
        device = Device.objects.filter(device_token=token).first()
        if not device:
            return Response({"detail": "Invalid device token."}, status=401)

        on_time = device.schedule_on_time.isoformat(timespec="seconds") if device.schedule_on_time else None
        off_time = device.schedule_off_time.isoformat(timespec="seconds") if device.schedule_off_time else None

        return Response({
            "relay_on": device.relay_on,
            "schedule_enabled": device.schedule_enabled,
            "schedule_on_time": on_time,
            "schedule_off_time": off_time,
            "power_limit_w": device.power_limit_w,
            "daily_energy_limit_kwh": device.daily_energy_limit_kwh,
        })
