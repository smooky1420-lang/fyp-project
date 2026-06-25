from rest_framework import serializers
from .models import UserSettings

class UserSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserSettings
        fields = ["tariff_pkr_per_kwh", "use_slab_billing", "updated_at"]

    def validate_tariff_pkr_per_kwh(self, value):
        if value < 0:
            raise serializers.ValidationError("Tariff cannot be negative.")
        if value > 500:
            raise serializers.ValidationError("Tariff is too high.")
        return value
