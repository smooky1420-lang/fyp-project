from django.conf import settings
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


class AlertEvent(models.Model):
    """Persisted alert with history — created when a condition triggers, resolved when it clears."""

    TYPE_OFFLINE = "offline"
    TYPE_HIGH = "high"
    TYPE_LIMIT = "limit"
    TYPE_DAILY_LIMIT = "daily_limit"

    TYPE_CHOICES = [
        (TYPE_OFFLINE, "Offline"),
        (TYPE_HIGH, "High usage"),
        (TYPE_LIMIT, "Power limit"),
        (TYPE_DAILY_LIMIT, "Daily energy limit"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="alert_events",
    )
    device = models.ForeignKey(
        Device,
        on_delete=models.CASCADE,
        related_name="alert_events",
    )
    alert_key = models.CharField(max_length=128)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    title = models.CharField(max_length=200)
    message = models.TextField()
    triggered_at = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    dismissed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "-triggered_at"]),
            models.Index(fields=["user", "device", "alert_key"]),
            models.Index(fields=["user", "resolved_at", "dismissed_at"]),
        ]
        ordering = ["-triggered_at"]

    def __str__(self):
        status = "active" if self.resolved_at is None else "resolved"
        return f"{self.title} ({status})"
