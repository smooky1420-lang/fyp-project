from rest_framework import serializers
from .models import Device

class DeviceSerializer(serializers.ModelSerializer):
    # TimeField serializes to "HH:MM:SS"
    schedule_on_time = serializers.TimeField(required=False, allow_null=True)
    schedule_off_time = serializers.TimeField(required=False, allow_null=True)

    class Meta:
        model = Device
        fields = (
            "id",
            "name",
            "room",
            "device_type",
            "is_controllable",
            "relay_on",
            "power_limit_w",
            "daily_energy_limit_kwh",
            "schedule_enabled",
            "schedule_on_time",
            "schedule_off_time",
            "device_token",
            "created_at",
        )
        read_only_fields = ("id", "device_token", "created_at")
