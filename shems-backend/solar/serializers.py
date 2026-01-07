from rest_framework import serializers
from .models import SolarConfig, SolarGeneration


class SolarConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = SolarConfig
        fields = ["enabled", "installed_capacity_kw", "latitude", "longitude"]


class SolarGenerationSerializer(serializers.ModelSerializer):
    class Meta:
        model = SolarGeneration
        fields = ["id", "solar_kw", "home_kw", "grid_import_kw", "cloud_cover", "created_at"]
        read_only_fields = ["id", "created_at"]

