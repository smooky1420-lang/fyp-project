from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DeviceViewSet, DeviceStateByTokenAPI

router = DefaultRouter()
router.register(r"devices", DeviceViewSet, basename="device")

urlpatterns = [
    path("devices/state-by-token/", DeviceStateByTokenAPI.as_view()),
    path("", include(router.urls)),
]
