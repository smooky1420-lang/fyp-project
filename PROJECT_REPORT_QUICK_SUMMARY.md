# SHEMS / WattGuard — Quick Project Summary (for group & report writing)

Use this file as a **short reference** when writing the FYP report. For deep technical detail, see **`ARCHITECTURE_SUMMARY.md`** (and `DATABASE_SCHEMA_SUMMARY.md` for tables).

> **Recent work:** see **`LAST_UPDATE.md`** (start with the **2026-06-24 — Slab billing, stored alerts…** section).

---

## What is this project?

**SHEMS (Smart Home Energy Management System)** is the FYP project name. The **web UI product name is WattGuard** — same system.

WattGuard helps households **monitor electricity use**, **estimate costs** (IESCO A-1 slab billing), **optional solar** estimates, **stored alerts** with browser notifications, and **predict future usage** with a machine-learning model. Users register, add **devices** (with per-device tokens for hardware uploads), and view dashboards, charts, and reports.

---

## Tech stack (one glance)

| Layer | Technology |
|--------|------------|
| Frontend | React, TypeScript, Vite — branded **WattGuard** |
| Backend | Django, Django REST Framework |
| Database | SQLite (dev; PostgreSQL is a natural upgrade) |
| Auth | JWT for users (+ refresh); **device token** (`X-DEVICE-TOKEN`) for meter uploads |
| ML | scikit-learn (Random Forest), pandas, joblib — `shems-backend/models/predictor.joblib` |
| Hardware | ESP32 + PZEM-004T; **WiFi provisioning firmware** (`firmware/wattguard_esp32/`) |

---

## Main features (what to describe in the report)

1. **Accounts & security** — Register (auto-login), login, JWT with refresh; **protected routes**; each user only sees **their** data.
2. **Devices** — CRUD; device token for ESP32; **relay**, **power/daily limits**, **schedule**; firmware polls `/api/devices/state-by-token/`.
3. **Telemetry** — Upload readings (V, I, P, cumulative `energy_kwh`); **Monitoring** with per-device and **home total** charts (correct energy aggregation).
4. **Tariff & money** — **IESCO A-1 slabs** in DB (`TariffPlan` / `TariffSlab`); protected vs unprotected (6-month rule); bill breakdown in Settings; today/monthly cost uses slab engine when enabled.
5. **Reports** — 12 months usage/cost; device breakdown; solar vs grid (history-based when solar data exists); CSV export.
6. **Solar (optional)** — Config + weather-based estimates; graceful fallback without OpenWeather API key.
7. **Predictions** — Random Forest, 7/30-day forecast; spike detection + explanatory banner; `train_predictor` command.
8. **Recommendations** — Data-driven tips on Predictions page and top tips on Dashboard.
9. **Alerts** — **Stored** `AlertEvent` rows; offline (~60 s), power/daily limits; browser notifications; Alerts page + bell badge (10 s poll).
10. **Help** — In-app user guide at `/help` (FAQ, quick start, hardware overview).

---

## How data flows (simple story)

**Device / ESP32 → API → database → same user’s browser (JWT).**  
Hardware uses the **device token**, not the user password. ESP32 is configured once via **WiFi captive portal** (token + server IP), then posts telemetry and polls relay/limits.

---

## ML & demo data (short)

- **Training:** `python manage.py train_predictor` → `predictor.joblib`
- **Demo data:** `seed_demo_devices` or `generate_synthetic_telemetry`
- **Live without 3 meters:** `demo_sender.py` or one real PZEM + synthetic for other circuits
- **Exam account:** separate signup user → seed → train (keeps test data isolated)
- **Tests:** `python manage.py test telemetry users user_settings predictions solar` (**24** tests)

**Commands & env vars:** **`QUICK_CHEAT_SHEET.md`** · `.env.example` in backend and frontend folders.

---

## Important folders (for screenshots & citations)

| Area | Path |
|------|------|
| Backend entry | `shems-backend/manage.py`, `shems-backend/config/` |
| API client | `shems-frontend/src/lib/api.ts` |
| Main UI pages | `shems-frontend/src/pages/` |
| Help / user guide | `shems-frontend/src/pages/Help.tsx` → `/help` |
| Tariff engine | `shems-backend/user_settings/tariff_service.py` |
| Alerts logic | `shems-backend/telemetry/alerts_service.py` |
| Predictions | `shems-backend/predictions/services.py` |
| Firmware | `firmware/wattguard_esp32/` · `firmware/README.md` |
| Change log | **`LAST_UPDATE.md`** |

---

## Suggested report sections (outline)

1. **Introduction** — Problem: visibility and cost of home electricity; goal of SHEMS/WattGuard.
2. **Literature / related work** — Smart home energy, tariffs, ML forecasting (brief).
3. **Requirements** — Functional + non-functional (security, usability, hardware).
4. **System design** — 3-tier: React ↔ REST API ↔ DB; JWT + device token; WiFi provisioning.
5. **Implementation** — Modules listed in features above; IESCO slabs; Random Forest; ESP32 + PZEM.
6. **Testing / demo** — 24 API tests; screenshots; Help page; live ESP32 or `demo_sender`.
7. **Conclusion & future work** — PostgreSQL, per-user ML, push notifications, DISCO protection onboarding, usage milestone alerts, IESCO fixed charges/taxes, hardware pairing API — see **`ARCHITECTURE_SUMMARY.md` §15**.

---

## One-line pitch (abstract / intro)

*“WattGuard (SHEMS) is a secure web application that collects per-device electricity telemetry, applies IESCO-oriented progressive slab billing, optionally estimates solar contribution, surfaces persisted alerts and data-driven recommendations, and uses a trained machine learning model to forecast short-term usage—with ESP32 hardware provisioned over WiFi without reflashing per device.”*

---

*Run backend from `shems-backend`. Set `VITE_API_BASE` in `shems-frontend/.env` if the API is not on `http://127.0.0.1:8000`. For LAN hardware demo use `runserver 0.0.0.0:8000`.*
