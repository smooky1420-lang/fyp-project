from rest_framework import serializers
from .models import TelemetryReading

class TelemetryUploadSerializer(serializers.Serializer):
    voltage = serializers.FloatField()
    current = serializers.FloatField()
    power = serializers.FloatField()
    energy_kwh = serializers.FloatField()

class TelemetryReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = TelemetryReading
        fields = ("id", "device", "voltage", "current", "power", "energy_kwh", "created_at")
        read_only_fields = fields
