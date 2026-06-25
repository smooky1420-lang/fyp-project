from django.contrib import admin

from .models import TariffPlan, TariffSlab, UserSettings


class TariffSlabInline(admin.TabularInline):
    model = TariffSlab
    extra = 0
    ordering = ("consumer_type", "sort_order", "unit_from")


@admin.register(TariffPlan)
class TariffPlanAdmin(admin.ModelAdmin):
    list_display = ("name", "source", "effective_from", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("name", "source")
    inlines = [TariffSlabInline]


@admin.register(TariffSlab)
class TariffSlabAdmin(admin.ModelAdmin):
    list_display = (
        "plan",
        "consumer_type",
        "unit_from",
        "unit_to",
        "variable_pkr_kwh",
        "sort_order",
    )
    list_filter = ("plan", "consumer_type")
    list_editable = ("variable_pkr_kwh",)


@admin.register(UserSettings)
class UserSettingsAdmin(admin.ModelAdmin):
    list_display = ("user", "tariff_pkr_per_kwh", "use_slab_billing", "updated_at")
