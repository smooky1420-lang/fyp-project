"""
Send live dummy telemetry to WattGuard (normal household loads).

  python demo_sender.py              # realistic power — no spurious high-usage alerts
  python demo_sender.py --stress     # old behaviour: >2.5 kW on every device (alert testing)

Add every device token you want to keep "online". Devices not listed will go offline
after ~1 minute with no uploads.

Get tokens from WattGuard → Devices → each device's token, or Django admin.
"""
from __future__ import annotations

import argparse
import random
import sys
import time
from typing import TypedDict

import requests

BASE = "http://127.0.0.1:8000"
POST_INTERVAL_SEC = 5

# (token, role) — roles control realistic power bands
DEVICES: list[tuple[str, str]] = [
    ("e129b36e85854b7f938f78ab75890bc2", "fridge"),
    ("1a23e453fb9a430f9a5f46e12ef3299e", "ac"),
    ("e7a6e7f58f8d4d1c8d5f48c295394478", "lights"),
    # Add your PC (or other) device token so it does not show offline:
    # ("YOUR_PC_DEVICE_TOKEN_HERE", "pc"),
]

# Running cumulative meter reading per token (kWh)
_energy_kwh: dict[str, float] = {}


class PowerSample(TypedDict):
    voltage: float
    current: float
    power: float


def _realistic_sample(role: str) -> PowerSample:
    """Typical residential band for demo telemetry."""
    v = random.uniform(228, 238)
    if role == "fridge":
        # Compressor cycles: mostly 80–180 W, occasional start surge
        p = random.uniform(90, 180) if random.random() > 0.08 else random.uniform(280, 420)
    elif role == "ac":
        # Running AC: 400–1100 W; rare short spike still under global 2500 W alert
        p = random.uniform(350, 950) if random.random() > 0.05 else random.uniform(1100, 1800)
    elif role == "pc":
        p = random.uniform(120, 280) if random.random() > 0.15 else random.uniform(300, 550)
    elif role == "lights":
        p = random.uniform(30, 120)
    else:
        p = random.uniform(80, 400)
    i = p / v if v else 0
    return {"voltage": v, "current": i, "power": p}


def _stress_sample() -> PowerSample:
    """Deliberately high load for alert / limit demos."""
    v = random.uniform(220, 240)
    i = random.uniform(12.0, 15.0)
    return {"voltage": v, "current": i, "power": v * i}


def send_telemetry(token: str, role: str, label: str, *, stress: bool) -> None:
    try:
        sample = _stress_sample() if stress else _realistic_sample(role)
        v, i, p = sample["voltage"], sample["current"], sample["power"]

        hours = POST_INTERVAL_SEC / 3600.0
        delta_kwh = (p / 1000.0) * hours
        prev = _energy_kwh.get(token, random.uniform(0.2, 1.5))
        e = prev + delta_kwh
        _energy_kwh[token] = e

        payload = {
            "voltage": round(v, 2),
            "current": round(i, 3),
            "power": round(p, 2),
            "energy_kwh": round(e, 6),
        }

        r = requests.post(
            f"{BASE}/api/telemetry/upload/",
            headers={"X-DEVICE-TOKEN": token, "Content-Type": "application/json"},
            json=payload,
            timeout=5,
        )
        mode = "STRESS" if stress else role
        print(
            f"[{label}] {r.status_code} | {mode} | "
            f"{payload['power']:.0f} W | meter {payload['energy_kwh']:.3f} kWh"
        )
    except Exception as exc:
        print(f"[{label}] Error: {exc}")


def main() -> int:
    parser = argparse.ArgumentParser(description="WattGuard live telemetry demo sender")
    parser.add_argument(
        "--stress",
        action="store_true",
        help="Send >2.5 kW on every device to test high-usage / limit alerts",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=POST_INTERVAL_SEC,
        help=f"Seconds between full rounds (default {POST_INTERVAL_SEC})",
    )
    args = parser.parse_args()

    active = [(t, r) for t, r in DEVICES if t and "REPLACE" not in t]
    if not active:
        print("No device tokens in DEVICES — edit demo_sender.py and add your tokens.")
        return 1

    if args.stress:
        print("STRESS MODE: high power on all devices (expect high-usage alerts).")
    else:
        print("Normal mode: realistic household loads (should not trip 2500 W alert).")

    print(f"Sending to {len(active)} device(s) every {args.interval}s → {BASE}")
    print("Devices not in this list will show offline after ~1 minute.\n")

    labels = [f"Device {i + 1} ({role})" for i, (_, role) in enumerate(active)]

    while True:
        for (token, role), label in zip(active, labels):
            send_telemetry(token, role, label, stress=args.stress)
        print("-" * 48)
        time.sleep(args.interval)


if __name__ == "__main__":
    sys.exit(main())
