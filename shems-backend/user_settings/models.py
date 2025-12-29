from django.conf import settings
from django.db import models

class UserSettings(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="user_settings",
    )
    tariff_pkr_per_kwh = models.DecimalField(max_digits=8, decimal_places=2, default=0)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Settings({self.user_id})"
