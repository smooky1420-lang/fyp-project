from datetime import timedelta

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from devices.models import Device
from solar.models import SolarConfig, SolarGeneration
from telemetry.models import TelemetryReading


class MonthlyReportsAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="reporter", email="r@example.com", password="pass12345"
        )
        self.device = Device.objects.create(user=self.user, name="AC", room="Hall")
        self.client.force_authenticate(user=self.user)

    def _add_readings(self, base_kwh: float, count: int = 5):
        t0 = timezone.now() - timedelta(hours=count)
        for i in range(count):
            TelemetryReading.objects.create(
                device=self.device,
                voltage=230.0,
                current=1.0,
                power=230.0,
                energy_kwh=base_kwh + i * 0.1,
                created_at=t0 + timedelta(hours=i),
            )

    def test_monthly_reports_returns_structure(self):
        self._add_readings(1.0)
        res = self.client.get("/api/settings/monthly-reports/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("monthly_reports", res.data)
        self.assertIn("device_breakdown", res.data)
        self.assertEqual(len(res.data["monthly_reports"]), 12)

    def test_monthly_reports_solar_from_history(self):
        SolarConfig.objects.create(
            user=self.user,
            enabled=True,
            installed_capacity_kw=5.0,
            latitude=33.7,
            longitude=73.0,
        )
        self._add_readings(2.0)
        now = timezone.now()
        SolarGeneration.objects.create(
            user=self.user,
            solar_kw=2.0,
            home_kw=1.5,
            grid_import_kw=0.0,
            cloud_cover=10,
            created_at=now - timedelta(hours=2),
        )
        SolarGeneration.objects.create(
            user=self.user,
            solar_kw=2.5,
            home_kw=1.8,
            grid_import_kw=0.0,
            cloud_cover=10,
            created_at=now - timedelta(hours=1),
        )
        res = self.client.get("/api/settings/monthly-reports/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(res.data["solar_kwh"], 0)
