from django.urls import path
from .views import UserSettingsAPI

urlpatterns = [
    path("", UserSettingsAPI.as_view(), name="user-settings"),
]
