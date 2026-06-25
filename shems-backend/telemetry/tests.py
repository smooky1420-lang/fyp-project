from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from devices.models import Device
from telemetry.models import TelemetryReading


class AuthAPITests(APITestCase):
    def test_register_and_login(self):
        register_url = reverse("register")
        res = self.client.post(
            register_url,
            {"username": "tester", "email": "t@example.com", "password": "TestPass123!"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        login_url = reverse("login")
        res = self.client.post(
            login_url,
            {"username": "tester", "password": "TestPass123!"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)

    def test_me_requires_auth(self):
        url = reverse("me")
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class DeviceTelemetryAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="home1", email="h@example.com", password="pass12345"
        )
        self.device = Device.objects.create(
            user=self.user,
            name="AC",
            room="Living",
            device_type="PZEM-004T",
            power_limit_w=2000,
        )
        self.client.force_authenticate(user=self.user)

    def test_create_device_via_api(self):
        url = "/api/devices/"
        res = self.client.post(
            url,
            {
                "name": "Fan",
                "room": "Bedroom",
                "device_type": "PZEM-004T",
                "is_controllable": True,
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Device.objects.filter(user=self.user, name="Fan").exists())

    def test_telemetry_upload_with_device_token(self):
        url = "/api/telemetry/upload/"
        res = self.client.post(
            url,
            {"voltage": 230.0, "current": 0.5, "power": 115.0, "energy_kwh": 1.25},
            format="json",
            HTTP_X_DEVICE_TOKEN=self.device.device_token,
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TelemetryReading.objects.filter(device=self.device).count(), 1)

    def test_telemetry_upload_rejects_bad_token(self):
        url = "/api/telemetry/upload/"
        res = self.client.post(
            url,
            {"voltage": 230.0, "current": 0.5, "power": 115.0, "energy_kwh": 1.25},
            format="json",
            HTTP_X_DEVICE_TOKEN="invalid-token",
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_alerts_offline_when_no_readings(self):
        url = "/api/alerts/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(any(a["type"] == "offline" for a in res.data))
        self.assertTrue(any(a["active"] for a in res.data))

    def test_alerts_no_limit_when_device_has_no_limits(self):
        TelemetryReading.objects.create(
            device=self.device,
            voltage=230.0,
            current=12.0,
            power=3000.0,
            energy_kwh=1.0,
        )
        self.device.power_limit_w = None
        self.device.daily_energy_limit_kwh = None
        self.device.save()
        res = self.client.get("/api/alerts/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        types = {a["type"] for a in res.data}
        self.assertNotIn("high", types)
        self.assertNotIn("limit", types)
        self.assertNotIn("daily_limit", types)

    def test_alerts_power_limit(self):
        TelemetryReading.objects.create(
            device=self.device,
            voltage=230.0,
            current=10.0,
            power=2500.0,
            energy_kwh=1.0,
        )
        url = "/api/alerts/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        types = {a["type"] for a in res.data}
        self.assertIn("limit", types)

    def test_alerts_resolve_when_telemetry_returns(self):
        from telemetry.models import AlertEvent

        url = "/api/alerts/"
        self.client.get(url)
        self.assertTrue(AlertEvent.objects.filter(device=self.device, type="offline").exists())

        upload_url = "/api/telemetry/upload/"
        self.client.post(
            upload_url,
            {"voltage": 230.0, "current": 0.5, "power": 115.0, "energy_kwh": 1.25},
            format="json",
            HTTP_X_DEVICE_TOKEN=self.device.device_token,
        )
        offline = AlertEvent.objects.filter(
            device=self.device, type="offline", resolved_at__isnull=True
        )
        self.assertFalse(offline.exists())

    def test_alerts_mark_read(self):
        self.client.get("/api/alerts/")
        from telemetry.models import AlertEvent

        alert = AlertEvent.objects.filter(user=self.user).first()
        self.assertIsNotNone(alert)
        res = self.client.post(
            "/api/alerts/",
            {"action": "mark_read", "ids": [alert.id]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        alert.refresh_from_db()
        self.assertIsNotNone(alert.read_at)

    def test_device_state_by_token(self):
        self.device.relay_on = True
        self.device.save()
        url = "/api/devices/state-by-token/"
        res = self.client.get(url, HTTP_X_DEVICE_TOKEN=self.device.device_token)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["relay_on"])

    def test_today_summary(self):
        TelemetryReading.objects.create(
            device=self.device,
            voltage=230.0,
            current=1.0,
            power=230.0,
            energy_kwh=0.5,
        )
        TelemetryReading.objects.create(
            device=self.device,
            voltage=230.0,
            current=1.0,
            power=230.0,
            energy_kwh=1.0,
        )
        url = "/api/telemetry/today-summary/"
        res = self.client.get(url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(res.data["home_total_kwh"], 0)
