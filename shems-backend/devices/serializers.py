from rest_framework import serializers
from .models import Device

class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = (
            "id",
            "name",
            "room",
            "device_type",
            "is_controllable",
            "device_token",
            "created_at",
        )
        read_only_fields = ("id", "device_token", "created_at")
