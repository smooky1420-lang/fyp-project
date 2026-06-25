# Generated manually for AlertEvent model

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("devices", "0002_add_control_schedule_limits"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("telemetry", "0002_allow_explicit_created_at"),
    ]

    operations = [
        migrations.CreateModel(
            name="AlertEvent",
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
                ("alert_key", models.CharField(max_length=128)),
                (
                    "type",
                    models.CharField(
                        choices=[
                            ("offline", "Offline"),
                            ("high", "High usage"),
                            ("limit", "Power limit"),
                            ("daily_limit", "Daily energy limit"),
                        ],
                        max_length=20,
                    ),
                ),
                ("title", models.CharField(max_length=200)),
                ("message", models.TextField()),
                (
                    "triggered_at",
                    models.DateTimeField(default=django.utils.timezone.now),
                ),
                ("resolved_at", models.DateTimeField(blank=True, null=True)),
                ("read_at", models.DateTimeField(blank=True, null=True)),
                ("dismissed_at", models.DateTimeField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "device",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="alert_events",
                        to="devices.device",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="alert_events",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-triggered_at"],
            },
        ),
        migrations.AddIndex(
            model_name="alertevent",
            index=models.Index(
                fields=["user", "-triggered_at"], name="telemetry_a_user_id_0f0f0d_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="alertevent",
            index=models.Index(
                fields=["user", "device", "alert_key"],
                name="telemetry_a_user_id_8c8f8a_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="alertevent",
            index=models.Index(
                fields=["user", "resolved_at", "dismissed_at"],
                name="telemetry_a_user_id_9d9d9b_idx",
            ),
        ),
    ]
