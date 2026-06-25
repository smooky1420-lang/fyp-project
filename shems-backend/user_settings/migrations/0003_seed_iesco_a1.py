from datetime import date
from decimal import Decimal

from django.db import migrations


def seed_iesco_a1(apps, schema_editor):
    TariffPlan = apps.get_model("user_settings", "TariffPlan")
    TariffSlab = apps.get_model("user_settings", "TariffSlab")

    plan, _ = TariffPlan.objects.update_or_create(
        name="IESCO A-1 Residential",
        defaults={
            "source": "S.R.O 279 (I)/2026 — IESCO Tariff Guide (A-1 General Supply, Residential)",
            "effective_from": date(2026, 2, 1),
            "is_active": True,
        },
    )
    TariffPlan.objects.exclude(pk=plan.pk).update(is_active=False)

    TariffSlab.objects.filter(plan=plan).delete()

    protected = [
        (1, 100, "10.5400", "001-100 units", 1, 200),
        (101, 200, "13.0100", "101-200 units", 2, 300),
    ]
    for unit_from, unit_to, rate, label, order, fixed in protected:
        TariffSlab.objects.create(
            plan=plan,
            consumer_type="protected",
            unit_from=unit_from,
            unit_to=unit_to,
            variable_pkr_kwh=Decimal(rate),
            fixed_charge_rs=fixed,
            label=label,
            sort_order=order,
        )

    unprotected = [
        (1, 100, "22.4400", "1-100 units", 1, 275),
        (101, 200, "28.9100", "101-200 units", 2, 300),
        (201, 300, "33.1000", "201-300 units", 3, 350),
        (301, 400, "36.4600", "301-400 units", 4, 400),
        (401, 500, "38.9500", "401-500 units", 5, 500),
        (501, 600, "40.2200", "501-600 units", 6, 675),
        (601, 700, "41.8500", "601-700 units", 7, 675),
        (701, None, "47.2000", "Above 700 units", 8, 675),
    ]
    for unit_from, unit_to, rate, label, order, fixed in unprotected:
        TariffSlab.objects.create(
            plan=plan,
            consumer_type="unprotected",
            unit_from=unit_from,
            unit_to=unit_to,
            variable_pkr_kwh=Decimal(rate),
            fixed_charge_rs=fixed,
            label=label,
            sort_order=order,
        )


def unseed(apps, schema_editor):
    TariffPlan = apps.get_model("user_settings", "TariffPlan")
    TariffPlan.objects.filter(name="IESCO A-1 Residential").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("user_settings", "0002_tariff_models"),
    ]

    operations = [
        migrations.RunPython(seed_iesco_a1, unseed),
    ]
