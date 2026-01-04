from django.urls import path
from .views import SolarConfigAPI, SolarStatusAPI, SolarHistoryAPI

urlpatterns = [
    path("config/", SolarConfigAPI.as_view()),
    path("status/", SolarStatusAPI.as_view()),
    path("history/", SolarHistoryAPI.as_view()),
]
