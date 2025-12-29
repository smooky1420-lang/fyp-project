from django.urls import path
from .views import TelemetryUploadAPI, TelemetryLatestAPI, TelemetryRangeAPI,TelemetryTodaySummaryAPI

urlpatterns = [
    path("telemetry/upload/", TelemetryUploadAPI.as_view(), name="telemetry-upload"),
    path("telemetry/latest/", TelemetryLatestAPI.as_view(), name="telemetry-latest"),
    path("telemetry/range/", TelemetryRangeAPI.as_view(), name="telemetry-range"),
    path("today-summary/", TelemetryTodaySummaryAPI.as_view(), name="telemetry-today-summary")
]
