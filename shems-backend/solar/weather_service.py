import logging
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone as dt_tz

import requests
from django.conf import settings
from django.utils import timezone

from .models import WeatherCache

logger = logging.getLogger(__name__)

OPENWEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"


@dataclass
class WeatherData:
    cloud_cover: int
    sunrise: datetime
    sunset: datetime
    source: str  # openweather | cache | estimate | cache_stale


def _estimate_daylight(now) -> tuple[datetime, datetime]:
    """Fallback sunrise/sunset when OpenWeather is unavailable."""
    local = timezone.localtime(now)
    day = local.date()
    tz = timezone.get_current_timezone()
    sunrise = timezone.make_aware(datetime.combine(day, time(6, 0)), tz)
    sunset = timezone.make_aware(datetime.combine(day, time(18, 30)), tz)
    return sunrise, sunset


def _from_cache(cache: WeatherCache, source: str) -> WeatherData:
    return WeatherData(
        cloud_cover=cache.cloud_cover,
        sunrise=cache.sunrise,
        sunset=cache.sunset,
        source=source,
    )


def get_weather(lat: float, lon: float) -> WeatherData:
    """
    Return weather for solar estimation. Uses OpenWeather when configured;
    falls back to cache or a daylight estimate so Solar never hard-crashes.
    """
    cache = WeatherCache.objects.filter(latitude=lat, longitude=lon).first()

    if cache and cache.is_fresh():
        return _from_cache(cache, "cache")

    api_key = getattr(settings, "OPENWEATHER_API_KEY", None)
    if not api_key:
        sunrise, sunset = _estimate_daylight(timezone.now())
        logger.info("OPENWEATHER_API_KEY not set — using estimated weather for solar")
        return WeatherData(cloud_cover=15, sunrise=sunrise, sunset=sunset, source="estimate")

    params = {
        "lat": lat,
        "lon": lon,
        "appid": api_key,
        "units": "metric",
    }

    try:
        r = requests.get(OPENWEATHER_URL, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()

        cloud_cover = int(data["clouds"]["all"])
        sunrise = datetime.fromtimestamp(data["sys"]["sunrise"], tz=dt_tz.utc)
        sunset = datetime.fromtimestamp(data["sys"]["sunset"], tz=dt_tz.utc)

        if not cache:
            cache = WeatherCache(latitude=lat, longitude=lon)

        cache.cloud_cover = cloud_cover
        cache.sunrise = sunrise
        cache.sunset = sunset
        cache.save()

        return WeatherData(
            cloud_cover=cloud_cover,
            sunrise=sunrise,
            sunset=sunset,
            source="openweather",
        )
    except Exception as exc:
        logger.warning("OpenWeather request failed: %s", exc)
        if cache:
            return _from_cache(cache, "cache_stale")
        sunrise, sunset = _estimate_daylight(timezone.now())
        return WeatherData(cloud_cover=25, sunrise=sunrise, sunset=sunset, source="estimate")
