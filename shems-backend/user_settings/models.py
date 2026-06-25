from django.conf import settings
from django.db import models


class UserSettings(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="user_settings",
    )
    tariff_pkr_per_kwh = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    use_slab_billing = models.BooleanField(
        default=True,
        help_text="When true, costs use the active IESCO residential slab plan from the database.",
    )

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Settings({self.user_id})"


class TariffPlan(models.Model):
    """IESCO A-1 residential tariff schedule (admin-updatable when S.R.O. changes)."""

    name = models.CharField(max_length=120)
    source = models.CharField(
        max_length=200,
        blank=True,
        help_text="e.g. S.R.O 279 (I)/2026 — IESCO A-1 Residential",
    )
    effective_from = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-effective_from", "-id"]

    def __str__(self):
        status = "active" if self.is_active else "inactive"
        return f"{self.name} ({status})"


class TariffSlab(models.Model):
    CONSUMER_PROTECTED = "protected"
    CONSUMER_UNPROTECTED = "unprotected"
    CONSUMER_CHOICES = [
        (CONSUMER_PROTECTED, "Protected (progressive)"),
        (CONSUMER_UNPROTECTED, "Unprotected (flat rate on all units)"),
    ]

    plan = models.ForeignKey(
        TariffPlan,
        on_delete=models.CASCADE,
        related_name="slabs",
    )
    consumer_type = models.CharField(max_length=20, choices=CONSUMER_CHOICES)
    unit_from = models.PositiveIntegerField()
    unit_to = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Leave blank for open-ended top slab (e.g. 701+).",
    )
    variable_pkr_kwh = models.DecimalField(max_digits=8, decimal_places=4)
    fixed_charge_rs = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Optional monthly fixed charge from IESCO table (not added to energy estimate v1).",
    )
    label = models.CharField(max_length=80, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["consumer_type", "sort_order", "unit_from"]

    def __str__(self):
        end = self.unit_to if self.unit_to else "∞"
        return f"{self.consumer_type} {self.unit_from}-{end} @ {self.variable_pkr_kwh}"
