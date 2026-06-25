# SHEMS / WattGuard — Quick Project Summary (for group & report writing)

Use this file as a **short reference** when writing the FYP report. For deep technical detail, see **`ARCHITECTURE_SUMMARY.md`** (and `DATABASE_SCHEMA_SUMMARY.md` for tables).

> **Recent work:** see **`LAST_UPDATE.md`** (dated log of what the team changed — start with **2026-06-24**).

---

## What is this project?

**SHEMS (Smart Home Energy Management System)** is the FYP project name. The **web UI product name is WattGuard** — same system.

WattGuard helps households **monitor electricity use**, **estimate costs** (Pakistan tariff logic), **optional solar** estimates, **live alerts**, and **predict future usage** with a machine-learning model. Users register, add **devices** (with per-device tokens for hardware uploads), and view dashboards, charts, and reports.

---

## Tech stack (one glance)

| Layer | Technology |
|--------|------------|
| Frontend | React, TypeScript, Vite — branded **WattGuard** |
| Backend | Django, Django REST Framework |
| Database | SQLite (dev; PostgreSQL is a natural upgrade) |
| Auth | JWT for users (+ refresh); **device token** (`X-DEVICE-TOKEN`) for meter uploads |
| ML | scikit-learn (Random Forest), pandas, joblib — `shems-backend/models/predictor.joblib` |
| Hardware | ESP32 firmware — telemetry upload + state poll for relay/limits; optional PZEM-004T |

---

## Main features (what to describe in the report)

1. **Accounts & security** — Register (auto-login), login, JWT with refresh; **protected routes**; each user only sees **their** data.
2. **Devices** — CRUD; device token for ESP32; **relay**, **power/daily limits**, **schedule**; firmware polls `/api/devices/state-by-token/`.
3. **Telemetry** — Upload readings (V, I, P, cumulative `energy_kwh`); **Monitoring** with per-device and **home total** charts (correct energy aggregation).
4. **Tariff & money** — PKR/kWh; Pakistan-style calculator with **use & save**; today and monthly cost views.
5. **Reports** — 12 months usage/cost; device breakdown; solar vs grid (history-based when solar data exists); CSV export.
6. **Solar (optional)** — Config + weather-based estimates; graceful fallback without OpenWeather API key.
7. **Predictions** — Random Forest, 7/30-day forecast; `train_predictor` command.
8. **Recommendations** — Data-driven tips on Predictions page and top tips on Dashboard.
9. **Alerts** — `GET /api/alerts/`: offline, high usage, limit breaches; Alerts page + bell badge.
10. **Help** — In-app user guide at `/help` (FAQ, quick start, hardware, commands).

---

## How data flows (simple story)

**Device / ESP32 → API → database → same user’s browser (JWT).**  
Hardware uses the **device token**, not the user password. ESP32 also **polls** relay/limits from the server.

---

## ML & demo data (short)

- **Training:** `python manage.py train_predictor` → `predictor.joblib`
- **Demo data:** `seed_demo_devices` or `generate_synthetic_telemetry`
- **Tests:** `python manage.py test telemetry users user_settings predictions solar` (17 tests)

**Commands & env vars:** **`QUICK_CHEAT_SHEET.md`** · `.env.example` in backend and frontend folders.

---

## Important folders (for screenshots & citations)

| Area | Path |
|------|------|
| Backend entry | `shems-backend/manage.py`, `shems-backend/config/` |
| API client | `shems-frontend/src/lib/api.ts` |
| Main UI pages | `shems-frontend/src/pages/` |
| Help / user guide | `shems-frontend/src/pages/Help.tsx` → `/help` |
| Alerts logic | `shems-backend/telemetry/alerts_service.py` |
| Predictions | `shems-backend/predictions/services.py` |
| Firmware | `firmware/esp32_dummy_telemetry/` |
| Change log | **`LAST_UPDATE.md`** |

---

## Suggested report sections (outline)

1. **Introduction** — Problem: visibility and cost of home electricity; goal of SHEMS/WattGuard.
2. **Literature / related work** — Smart home energy, tariffs, ML forecasting (brief).
3. **Requirements** — Functional + non-functional (security, usability, hardware).
4. **System design** — 3-tier: React ↔ REST API ↔ DB; JWT + device token.
5. **Implementation** — Modules listed in features above; Random Forest; ESP32 integration.
6. **Testing / demo** — API tests; screenshots; Help page; live ESP32 optional.
7. **Conclusion & future work** — PostgreSQL, per-user ML models, push notifications, **optional DISCO protection status** (user-declared or imported billing history until 6 months of in-app telemetry), usage milestone alerts, fixed charges/taxes on IESCO bills, etc.

---

## One-line pitch (abstract / intro)

*“WattGuard (SHEMS) is a secure web application that collects per-device electricity telemetry, applies Pakistan-oriented tariff and cost logic, optionally estimates solar contribution, surfaces live alerts and data-driven recommendations, and uses a trained machine learning model to forecast short-term usage.”*

---

*Run backend from `shems-backend`. Set `VITE_API_BASE` in `shems-frontend/.env` if the API is not on `http://127.0.0.1:8000`. For LAN hardware demo use `runserver 0.0.0.0:8000`.*
