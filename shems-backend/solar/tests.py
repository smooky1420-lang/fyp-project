from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from solar.models import SolarConfig


class SolarAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="solar1", email="s@example.com", password="pass12345"
        )
        self.client.force_authenticate(user=self.user)

    def test_solar_disabled_status(self):
        res = self.client.get("/api/solar/status/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.data["enabled"])

    def test_solar_enabled_without_openweather(self):
        SolarConfig.objects.create(
            user=self.user,
            enabled=True,
            installed_capacity_kw=3.0,
            latitude=33.6844,
            longitude=73.0479,
        )
        res = self.client.get("/api/solar/status/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["enabled"])
        self.assertIn("solar_kw", res.data)
        self.assertIn("weather_source", res.data)
