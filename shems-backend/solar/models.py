from django.conf import settings
from django.db import models


class SolarConfig(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="solar_config"
    )

    enabled = models.BooleanField(default=False)
    installed_capacity_kw = models.FloatField(default=0.0)

    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"SolarConfig(user={self.user}, enabled={self.enabled})"

class WeatherCache(models.Model):
    latitude = models.FloatField()
    longitude = models.FloatField()

    cloud_cover = models.IntegerField()  # %
    sunrise = models.DateTimeField()
    sunset = models.DateTimeField()

    fetched_at = models.DateTimeField(auto_now=True)

    def is_fresh(self, max_age_minutes=30):
        from django.utils import timezone
        return (timezone.now() - self.fetched_at).total_seconds() < max_age_minutes * 60
