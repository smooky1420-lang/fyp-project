from django.urls import path
from .views import UsagePredictionAPI, RecommendationsAPI

urlpatterns = [
    path("usage/", UsagePredictionAPI.as_view()),
    path("recommendations/", RecommendationsAPI.as_view()),
]
