from django.db import models
from django.contrib.auth.models import User
import uuid

def generate_device_token():
    # 32-char token, unique, safe to copy/paste
    return uuid.uuid4().hex

class Device(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="devices")

    name = models.CharField(max_length=100)
    room = models.CharField(max_length=100, blank=True, default="")
    device_type = models.CharField(max_length=50, blank=True, default="")

    is_controllable = models.BooleanField(default=False)

    # For ESP32 later (device authenticates using this token)
    device_token = models.CharField(
        max_length=64,
        unique=True,
        editable=False,
        default=generate_device_token,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.user.username})"
