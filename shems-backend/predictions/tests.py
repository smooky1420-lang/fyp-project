from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from devices.models import Device


class PredictionsAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="pred", email="p@example.com", password="pass12345"
        )
        Device.objects.create(user=self.user, name="Fan")
        self.client.force_authenticate(user=self.user)

    def test_recommendations_endpoint(self):
        res = self.client.get("/api/predictions/recommendations/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("recommendations", res.data)
        self.assertIsInstance(res.data["recommendations"], list)

    def test_usage_prediction_endpoint(self):
        res = self.client.get("/api/predictions/usage/?period=7")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("predictions", res.data)
