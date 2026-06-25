# Generated migration for tariff models

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("user_settings", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="TariffPlan",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(max_length=120)),
                ("source", models.CharField(blank=True, max_length=200)),
                ("effective_from", models.DateField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["-effective_from", "-id"],
            },
        ),
        migrations.AddField(
            model_name="usersettings",
            name="use_slab_billing",
            field=models.BooleanField(
                default=True,
                help_text="When true, costs use the active IESCO residential slab plan from the database.",
            ),
        ),
        migrations.CreateModel(
            name="TariffSlab",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "consumer_type",
                    models.CharField(
                        choices=[
                            ("protected", "Protected (progressive)"),
                            ("unprotected", "Unprotected (flat rate on all units)"),
                        ],
                        max_length=20,
                    ),
                ),
                ("unit_from", models.PositiveIntegerField()),
                ("unit_to", models.PositiveIntegerField(blank=True, null=True)),
                ("variable_pkr_kwh", models.DecimalField(decimal_places=4, max_digits=8)),
                ("fixed_charge_rs", models.PositiveIntegerField(blank=True, null=True)),
                ("label", models.CharField(blank=True, max_length=80)),
                ("sort_order", models.PositiveSmallIntegerField(default=0)),
                (
                    "plan",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="slabs",
                        to="user_settings.tariffplan",
                    ),
                ),
            ],
            options={
                "ordering": ["consumer_type", "sort_order", "unit_from"],
            },
        ),
    ]
