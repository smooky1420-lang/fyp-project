# SHEMS — Quick Project Summary (for group & report writing)

Use this file as a **short reference** when writing the FYP report. For deep technical detail, see `ARCHITECTURE_SUMMARY.md` and `BACKEND_DIVISION.md`.

---

## What is SHEMS?

**SHEMS (Smart Home Energy Management System)** is a web app that helps households **monitor electricity use**, **estimate costs** (Pakistan tariff logic), **optional solar** estimates, and **predict future usage** with a machine-learning model. Users register, add **smart meters / devices**, and view dashboards, charts, and reports.

---

## Tech stack (one glance)

| Layer | Technology |
|--------|------------|
| Frontend | React, TypeScript, Vite |
| Backend | Django, Django REST Framework |
| Database | SQLite (dev; PostgreSQL is a natural upgrade) |
| Auth | JWT for users; **device token** (`X-DEVICE-TOKEN`) for meter uploads |
| ML | scikit-learn (Random Forest), pandas, joblib — model file: `shems-backend/models/predictor.joblib` |

---

## Main features (what to describe in the report)

1. **Accounts & security** — Register, login, JWT; each user only sees **their** devices and data.
2. **Devices** — Register meters (name, room, type); optional **relay**, **power/daily limits**, **schedule**; ESP32 can **poll** `/api/devices/state-by-token/` with the device token.
3. **Telemetry** — Upload readings (voltage, current, power, cumulative `energy_kwh`); **Monitoring** page shows time-range charts per device.
4. **Tariff & money** — User sets PKR/kWh; system uses **Pakistan-style** tier ideas + **protection** logic in the tariff calculator; **today** and **monthly** cost views.
5. **Reports** — Monthly usage/cost; **per-device** breakdown and **per-month per-device** data for charts.
6. **Solar (optional)** — Config + weather-based **estimated** solar kW; grid import and savings hints.
7. **Predictions** — Trained **Random Forest** predicts **next 7 or 30 days** daily kWh (and cost using tariff). Train with: `python manage.py train_predictor` (from `shems-backend`).
8. **Recommendations** — **Data-based** tips only (e.g. month vs month change, biggest device, peak-hour usage, solar-related when relevant). No generic filler tips.

---

## How data flows (simple story)

**Meter → API → database → same user’s browser (JWT).**  
IoT devices send data **without** the user password, using the **device token**. The app never mixes two users’ devices.

---

## ML & demo data (short)

- **Training:** Command `train_predictor` reads historical **daily** usage from the DB and saves `predictor.joblib`.
- **Inference:** The Predictions API loads that file and uses the **logged-in user’s** recent history as inputs where needed.
- **Demo / testing:** `generate_synthetic_telemetry` and `seed_demo_devices` create realistic **hourly** data (e.g. AC / PC / fan-style profiles for a Pakistani household scenario). Run these from the `shems-backend` folder after `cd` there.

**Exact commands** are in `QUICK_CHEAT_SHEET.md`.

---

## Important folders (for screenshots & citations)

| Area | Path |
|------|------|
| Backend entry | `shems-backend/manage.py`, `shems-backend/config/` |
| API client (frontend) | `shems-frontend/src/lib/api.ts` |
| Main UI pages | `shems-frontend/src/pages/` (Dashboard, Monitoring, Devices, Reports, Predictions, Settings, Solar, …) |
| Predictions logic | `shems-backend/predictions/services.py` |
| Telemetry | `shems-backend/telemetry/` |

---

## Suggested report sections (outline)

You can map chapters like this:

1. **Introduction** — Problem: visibility and cost of home electricity; goal of SHEMS.
2. **Literature / related work** — Smart home energy, tariffs, ML forecasting (brief).
3. **Requirements** — Functional (monitor, predict, report, optional solar) and non-functional (security, usability).
4. **System design** — 3-tier diagram: React ↔ REST API ↔ DB; mention JWT + device token.
5. **Implementation** — Modules: auth, devices, telemetry, settings/tariff, solar, predictions; mention Random Forest and `predictor.joblib`.
6. **Testing / demo** — Screenshots of main pages; optional note on synthetic data and `train_predictor`.
7. **Conclusion & future work** — e.g. PostgreSQL, more devices, model retraining schedule.

---

## One-line pitch (abstract / intro)

*“SHEMS is a secure web application that collects per-device electricity telemetry, applies Pakistan-oriented tariff and cost logic, optionally estimates solar contribution, and uses a trained machine learning model to forecast short-term usage to support better energy decisions.”*

---

*Last note: everyone should run the backend from `shems-backend` and set `VITE_API_BASE` if the API is not on the default URL — see `shems-frontend/README.md`.*
