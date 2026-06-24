from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase


class RegisterAPITests(APITestCase):
    def test_register_creates_user(self):
        url = reverse("register")
        res = self.client.post(
            url,
            {
                "username": "newuser",
                "email": "new@example.com",
                "password": "SecurePass99!",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username="newuser").exists())

    def test_register_rejects_duplicate_username(self):
        User.objects.create_user(username="dup", email="a@b.com", password="x")
        url = reverse("register")
        res = self.client.post(
            url,
            {"username": "dup", "email": "c@d.com", "password": "SecurePass99!"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
