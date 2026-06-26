# Last update log

**Purpose:** Running log of significant project changes (newest session at the top). Use this when catching up teammates, writing report “implementation timeline”, or prepping for demo/viva.

**Related docs:** `PROJECT_REPORT_QUICK_SUMMARY.md` · `QUICK_CHEAT_SHEET.md` · `ARCHITECTURE_SUMMARY.md` · `FRONTEND_QUICK_REFERENCE.md`

---

## 2026-06-24 — Slab billing, stored alerts, forecast polish, WiFi firmware

**Product name:** **WattGuard**

### Billing & tariffs (IESCO A-1)

| Area | What changed |
|------|----------------|
| **DB-driven slabs** | `TariffPlan` + `TariffSlab` models; seed migration `0003_seed_iesco_a1` (protected progressive + unprotected flat bands). |
| **Bill engine** | `user_settings/tariff_service.py` — `calculate_monthly_bill()`, `is_protected_consumer()` (6-month &lt;200 kWh rule). |
| **Wired into API** | Tariff calculator, monthly reports, today summary, predictions cost use slab effective rate when `use_slab_billing` is on. |
| **Admin** | Django admin can edit slab rates when S.R.O. changes. |
| **Settings UI** | Bill breakdown table, IESCO plan source, slab toggle. |
| **Tests** | `user_settings/test_tariff_service.py` |

### Alerts (persisted + notifications)

| Area | What changed |
|------|----------------|
| **Storage** | `AlertEvent` model (`telemetry/migrations/0003_alert_event.py`). |
| **Rules** | Offline (~**60 s**), user **power limit**, **daily energy limit** only (no global high-usage rule). |
| **Sync** | `alerts_service.py` creates/resolves on telemetry upload + `GET /api/alerts/`. |
| **API** | `POST /api/alerts/` — mark_read, dismiss, dismiss_all. |
| **Frontend** | `alerts.ts` (browser notifications), Alerts page history, TopBar enable button. |
| **Polling** | Dashboard + Alerts refresh every **10 s**. |

### Predictions & demo data

| Area | What changed |
|------|----------------|
| **Forecast fix** | Recommendations API tuple unpack from `get_monthly_reports`. |
| **Spike handling** | `predict_usage()` blends ML with recent baseline; `forecast_context` + UI banner on stress spikes. |
| **Slab cost on forecast** | `_effective_tariff_for_user()` for predicted PKR. |
| **Demo** | Separate **demo account** + `seed_demo_devices` + `train_predictor`; `demo_sender.py` (no `--stress` for normal demo). |

### Hardware (flash once)

| Area | What changed |
|------|----------------|
| **Firmware** | `firmware/wattguard_esp32/wattguard_esp32.ino` — **WiFiManager** captive portal (`WattGuard-Setup`): WiFi + server IP + device token saved to flash. |
| **PZEM** | Real readings via PZEM004Tv30; one physical meter = one app device (others via synthetic/demo_sender). |
| **Docs** | `firmware/README.md`, `HARDWARE_CIRCUIT_GUIDE.md` §5 updated. |

**Key paths**

| Item | Path |
|------|------|
| Tariff engine | `shems-backend/user_settings/tariff_service.py` |
| Alerts | `shems-backend/telemetry/alerts_service.py`, `telemetry/models.py` (`AlertEvent`) |
| Forecast | `shems-backend/predictions/services.py`, `shems-frontend/src/pages/Predictions.tsx` |
| WiFi firmware | `firmware/wattguard_esp32/wattguard_esp32.ino` |

### Demo reminders (exam account)

```powershell
cd shems-backend
python manage.py runserver 0.0.0.0:8000

# Clean demo user (after signup + 3 devices OR 1 real + synthetic):
python manage.py seed_demo_devices <token1> <token2> <token3>
python manage.py train_predictor
```

- **ESP32:** flash `wattguard_esp32` once → portal → paste token from Devices page.
- **Live without hardware:** `python demo_sender.py` (repo root; update tokens in script).
- **Tests:** `python manage.py test telemetry users user_settings predictions solar` (**24** tests).

### Future work (documented, not implemented)

- Optional DISCO protection declaration at signup/Settings until 6 months in-app history.
- Usage tier milestone alerts (50/100/180/200 units).
- IESCO fixed charges / FCA / taxes on bills.
- Hardware pairing API (6-digit code) instead of pasting token in portal.

See **`ARCHITECTURE_SUMMARY.md` §15** for full table.

---

## 2026-06-24 — Pre-final polish (Tiers 1–3 + Help page)

**Product name:** **WattGuard**

### Tier 1 — Demo-critical fixes

| Area | What changed |
|------|----------------|
| **Solar** | `weather_service.py` no longer crashes without `OPENWEATHER_API_KEY`; falls back to estimated daylight/cloud. Solar status includes `weather_source`, kWh-based savings. |
| **Auth** | `ProtectedRoute` guards all app pages. JWT **auto-refresh** on 401. `clearTokens()` clears **localStorage + sessionStorage**. Better API error messages in `authFetch`. |
| **ML** | Predictions use `pandas.DataFrame` at inference (no sklearn feature-name warnings). |
| **Monitoring** | Home Total **energy** uses summed per-device deltas, not raw cumulative meter sums. |
| **Firmware** | ESP32 polls `GET /api/devices/state-by-token/` (relay, limits). WiFi bug fixed. Optional `USE_PZEM` + PZEM004Tv30 with dummy fallback. |
| **URLs** | Single telemetry mount under `/api/`; `today-summary` at `/api/telemetry/today-summary/`. |
| **UI** | Browser tab title **WattGuard**. Profile → Settings. Removed forgot-password stub. |

**Files (examples):** `solar/weather_service.py`, `solar/views.py`, `shems-frontend/src/components/ProtectedRoute.tsx`, `shems-frontend/src/lib/api.ts`, `firmware/esp32_dummy_telemetry/esp32_dummy_telemetry.ino`, `shems-backend/.env.example`

### Tier 2 — Product completeness

| Area | What changed |
|------|----------------|
| **Alerts** | New `GET /api/alerts/` — server-computed offline, high usage, power/daily limits (`telemetry/alerts_service.py`). Alerts page uses API; dismiss/read in localStorage. |
| **Signup** | Auto-login after register → Dashboard. |
| **Settings** | **Use & save this tariff** applies calculated rate in one click. |
| **Reports** | Solar vs grid split uses **SolarGeneration** history when available; capacity estimate fallback otherwise. |
| **Tests** | 17 API tests at this stage (now **24** after tariff + alert tests). Run: `python manage.py test telemetry users user_settings predictions solar` |

### Tier 3 — Polish + user guide

| Area | What changed |
|------|----------------|
| **Help** | New page `/help` — end-user guide: getting started, what each page does, smart meters, FAQ. No dev commands. Public or sidebar **Help**. |
| **Dashboard** | Redesigned UI: dark hero (today kWh/cost/live power), quick links, meter grid, chart + tips sidebar. Old layout: `Dashboard.legacy.tsx`. |
| **Alerts** | Auto-refresh every 30s on Alerts page; Dashboard polls alerts every **10s** for bell badge. |
| **Env** | `shems-frontend/.env.example` for `VITE_API_BASE`; expanded backend `.env.example`. |

**New / key paths**

| Item | Path |
|------|------|
| Help page | `shems-frontend/src/pages/Help.tsx` |
| Alerts API | `shems-backend/telemetry/alerts_service.py`, `GET /api/alerts/` |
| Protected routes | `shems-frontend/src/components/ProtectedRoute.tsx`, `App.tsx` |

### Demo reminders (post-update)

```powershell
# Backend — use 0.0.0.0 for ESP32 on LAN
cd shems-backend
python manage.py runserver 0.0.0.0:8000

# Optional before viva
python manage.py seed_demo_devices
python manage.py train_predictor
```

- Help for examiners: `http://localhost:5173/help`
- Login page includes **User guide** link
- Copy `.env.example` → `.env` and set `OPENWEATHER_API_KEY` if you want live weather (optional)

---

## How to add the next entry

Copy the block above, paste a new `## YYYY-MM-DD — Short title` section **above** this one, and list what changed in tables or bullets. Keep one session per heading.

---

## Revert dashboard UI

The previous dashboard layout is saved at:

`shems-frontend/src/pages/Dashboard.legacy.tsx`

To restore it:

```powershell
Copy-Item "shems-frontend\src\pages\Dashboard.legacy.tsx" "shems-frontend\src\pages\Dashboard.tsx"
```
