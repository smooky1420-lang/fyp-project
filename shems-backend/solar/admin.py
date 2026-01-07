from django.contrib import admin
from .models import SolarConfig, WeatherCache, SolarGeneration

admin.site.register(SolarConfig)
admin.site.register(WeatherCache)
admin.site.register(SolarGeneration)
