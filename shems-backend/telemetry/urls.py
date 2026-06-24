from django.urls import path
from .views import (
    TelemetryUploadAPI,
    TelemetryLatestAPI,
    TelemetryRangeAPI,
    TelemetryTodaySummaryAPI,
    AlertsAPI,
)

urlpatterns = [
    path("telemetry/upload/", TelemetryUploadAPI.as_view(), name="telemetry-upload"),
    path("telemetry/latest/", TelemetryLatestAPI.as_view(), name="telemetry-latest"),
    path("telemetry/range/", TelemetryRangeAPI.as_view(), name="telemetry-range"),
    path("telemetry/today-summary/", TelemetryTodaySummaryAPI.as_view(), name="telemetry-today-summary"),
    path("alerts/", AlertsAPI.as_view(), name="alerts"),
]
