import math
from datetime import datetime


def estimate_solar_kw(
    capacity_kw: float,
    cloud_cover: int,
    now: datetime,
    sunrise: datetime,
    sunset: datetime,
) -> float:

    if capacity_kw <= 0:
        return 0.0

    if now < sunrise or now > sunset:
        return 0.0

    day_seconds = (sunset - sunrise).total_seconds()
    elapsed = (now - sunrise).total_seconds()

    # Sin curve (0 → peak → 0)
    solar_factor = math.sin(math.pi * elapsed / day_seconds)

    cloud_factor = max(0.0, 1.0 - (cloud_cover / 100.0) * 0.75)

    power = capacity_kw * solar_factor * cloud_factor
    return round(max(power, 0.0), 3)
