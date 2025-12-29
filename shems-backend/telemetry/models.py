from django.db import models
from devices.models import Device

class TelemetryReading(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="readings")

    voltage = models.FloatField()
    current = models.FloatField()
    power = models.FloatField()
    energy_kwh = models.FloatField()

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["device", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.device.name} @ {self.created_at}"
