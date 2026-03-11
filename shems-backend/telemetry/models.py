from django.db import models
from django.utils import timezone
from devices.models import Device


class TelemetryReading(models.Model):
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="readings")

    voltage = models.FloatField()
    current = models.FloatField()
    power = models.FloatField()
    energy_kwh = models.FloatField()

    # Not auto_now_add so scripts can set historical timestamps; default used when upload API doesn't pass it
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [
            models.Index(fields=["device", "-created_at"]),
        ]

    def __str__(self):
        return f"{self.device.name} @ {self.created_at}"
