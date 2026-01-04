import requests
from datetime import datetime, timezone as tz
from django.conf import settings
from django.utils import timezone
from .models import WeatherCache

OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"


def get_weather(lat: float, lon: float) -> WeatherCache:
    cache = WeatherCache.objects.filter(latitude=lat, longitude=lon).first()

    if cache and cache.is_fresh():
        return cache

    params = {
        "lat": lat,
        "lon": lon,
        "appid": settings.OPENWEATHER_API_KEY,
        "units": "metric",
    }

    r = requests.get(OPENWEATHER_URL, params=params, timeout=10)
    r.raise_for_status()
    data = r.json()

    cloud_cover = data["clouds"]["all"]
    sunrise = datetime.fromtimestamp(data["sys"]["sunrise"], tz=tz.utc)
    sunset = datetime.fromtimestamp(data["sys"]["sunset"], tz=tz.utc)

    if not cache:
        cache = WeatherCache(latitude=lat, longitude=lon)

    cache.cloud_cover = cloud_cover
    cache.sunrise = sunrise
    cache.sunset = sunset
    cache.save()

    return cache
