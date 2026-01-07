from django.urls import path
from .views import UserSettingsAPI, TariffCalculatorAPI, MonthlyReportsAPI

urlpatterns = [
    path("", UserSettingsAPI.as_view(), name="user-settings"),
    path("tariff-calculator/", TariffCalculatorAPI.as_view(), name="tariff-calculator"),
    path("monthly-reports/", MonthlyReportsAPI.as_view(), name="monthly-reports"),
]
