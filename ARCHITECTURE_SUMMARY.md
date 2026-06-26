# SHEMS / WattGuard — Architecture Summary

> **FYP name:** SHEMS · **UI product name:** WattGuard (same codebase).  
> **Recent changes:** see **`LAST_UPDATE.md`** (2026-06-24: IESCO slabs, stored alerts, forecast polish, WiFi provisioning firmware).

## 1. Overall Architecture Overview

SHEMS is a **full-stack web application** built with:
- **Backend**: Django REST Framework (Python) with SQLite database
- **Frontend**: React + TypeScript with Vite
- **Authentication**: JWT (JSON Web Tokens) using `rest_framework_simplejwt`
- **Communication**: RESTful API with CORS enabled

### Architecture Pattern
The system follows a **3-tier architecture**:
1. **Presentation Layer**: React frontend (TypeScript)
2. **Application Layer**: Django REST API
3. **Data Layer**: SQLite database (can be switched to PostgreSQL)

---

## 2. Data Flow: Database → Frontend

### Complete Request-Response Cycle

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐         ┌──────────────┐
│   React     │  HTTP   │   Django     │  ORM    │  SQLite     │  Query  │   Models     │
│  Frontend   │ ──────> │   REST API   │ ──────> │  Database   │ <────── │   (Tables)   │
│             │ Request │              │         │             │         │              │
│             │ <────── │              │ <────── │             │ ──────> │              │
└─────────────┘ Response└──────────────┘ Results└─────────────┘  Data   └──────────────┘
```

### Step-by-Step Data Flow Example: Fetching Device Telemetry

1. **Frontend Request** (`src/lib/api.ts`)
   - User action triggers `getTelemetryRange(deviceId, from, to)`
   - Function calls `authFetch()` which:
     - Retrieves JWT from localStorage or sessionStorage
     - On **401**, attempts **refresh** via `/api/auth/refresh/` then retries
     - Adds `Authorization: Bearer <token>` header
     - Makes GET request to `/api/telemetry/range/?device_id=1&from=...&to=...`

2. **Backend Routing** (`config/urls.py` → `telemetry/urls.py`)
   - Request matches `/api/telemetry/range/`
   - Routes to `TelemetryRangeAPI.get()` in `telemetry/views.py`

3. **Authentication & Authorization**
   - JWT middleware validates token
   - `IsAuthenticated` permission checks user
   - View filters devices by `user=request.user` (data isolation)

4. **Database Query** (`telemetry/models.py`)
   - Django ORM queries `TelemetryReading` table:
     ```python
     TelemetryReading.objects.filter(device=device)
                            .filter(created_at__gte=from_date)
                            .order_by("-created_at")[:limit]
     ```

5. **Data Serialization** (`telemetry/serializers.py`)
   - Model instances → JSON via DRF Serializer
   - Returns: `[{id, device, voltage, current, power, energy_kwh, created_at}, ...]`

6. **Response to Frontend**
   - JSON response sent back
   - Frontend receives typed data (`TelemetryReading[]`)
   - React components render charts/tables

### Key Data Models & Relationships

```
User (Django Auth)
  ├── Device (1:N) - User owns multiple devices (control, limits, schedule, device_token)
  │     ├── TelemetryReading (1:N) - Device has many readings
  │     └── AlertEvent (1:N) - Stored alerts per device
  ├── UserSettings (1:1) - Tariff rate, use_slab_billing flag
  └── SolarConfig (1:1) - User has one solar configuration
        └── SolarGeneration (1:N) - Historical solar data

TariffPlan (global, admin-managed)
  └── TariffSlab (1:N) - protected / unprotected rate bands
```

**Trained model artifact (file, not a DB table):**
- `shems-backend/models/predictor.joblib` — scikit-learn `RandomForestRegressor` for daily usage prediction (produced by `train_predictor`)

**Database Tables:**
- `devices_device`: Stores device metadata (name, room, type, `device_token`, optional `relay_on`, power/daily limits, schedule fields for controllable loads)
- `telemetry_telemetryreading`: Stores power measurements (voltage, current, power, energy_kwh)
- `telemetry_alertevent`: Persisted alerts (offline, limit, daily_limit) with read/dismiss timestamps
- `user_settings_usersettings`: Per-user tariff fallback rate and `use_slab_billing` toggle
- `user_settings_tariffplan` / `user_settings_tariffslab`: Admin-editable IESCO A-1 slab schedules
- `solar_solarconfig`: Stores solar panel configuration
- `solar_solargeneration`: Stores historical solar generation data
- `solar_weathercache`: Caches weather API responses

---

## 3. Purpose of `/lib/api.ts` Folder

The `src/lib/` folder contains **shared utility modules** for the frontend:

### `/lib/api.ts` - Centralized API Client

**Purpose**: Single source of truth for all backend API communication.

**Key Functions:**

1. **Token Management**
   - `setTokens()`, `getAccess()`, `clearTokens()`: JWT token storage/retrieval
   - Tokens stored in `localStorage` for persistence

2. **HTTP Request Wrapper**
   - `authFetch<T>()`: Generic authenticated fetch function
     - Automatically adds JWT token to headers
     - Handles error parsing (DRF error format)
     - Returns typed responses

3. **API Endpoint Functions**
   - **Authentication**: `registerUser()`, `loginUser()`, `me()`
   - **Devices**: `listDevices()`, `createDevice()`, `updateDevice()`, `deleteDevice()`
   - **Telemetry**: `getLatestTelemetry()`, `getTelemetryRange()`, `getTodaySummary()`
   - **Settings**: `getUserSettings()`, `updateUserSettings()`, `getTariffCalculator()`, `getMonthlyReports()`
   - **Predictions**: `getUsagePrediction()`, `getRecommendations()`
   - **Solar**: `getSolarConfig()`, `updateSolarConfig()`, `getSolarStatus()`, `getSolarHistory()`

4. **TypeScript Type Definitions**
   - Exports TypeScript interfaces for all API responses
   - Ensures type safety across the frontend
   - Examples: `Device`, `TelemetryReading`, `SolarStatus`, `TodaySummary`, `UsagePredictionResult`, `Recommendation`

**Benefits:**
- **DRY Principle**: No duplicate fetch logic in components
- **Type Safety**: Centralized types prevent errors
- **Error Handling**: Consistent error extraction from DRF responses
- **Maintainability**: API changes only need updates in one place

### Other `/lib/` Files:
- `alerts.ts`: Fetches `GET /api/alerts/`, merges read/dismissed state in localStorage
- `errors.ts`: Error handling utilities

---

## 4. Predictions and Recommendations

### Overview

The **`predictions`** app forecasts **home total daily energy (kWh)** using a **Random Forest** regressor trained on historical daily aggregates from **all users’** telemetry. At request time, the API builds features from the **logged-in user’s** recent history and applies the shared model in `models/predictor.joblib`.

### Components

- **`predictions/services.py`** — Feature construction, `predict_usage()` (returns predictions + message + `forecast_context`), spike blending with recent baseline, slab-based cost via `_effective_tariff_for_user()`.
- **`predictions/views.py`** — `GET /api/predictions/usage/?period=7|30` returns predicted/recent actual kWh/cost, `forecast_context`, `effective_tariff_pkr_per_kwh`; `GET /api/predictions/recommendations/` returns data-driven tips.
- **`predictions/management/commands/train_predictor.py`** — Trains the regressor from DB telemetry and writes `models/predictor.joblib`.
- **`validate_model.py`** (project root under `shems-backend`) — Optional offline R²/MAE check on the training setup.

### Workflow

1. Ingest telemetry (real ESP32 uploads or synthetic generator).
2. Run `python manage.py train_predictor` from `shems-backend` to refresh `predictor.joblib`.
3. Frontend **Predictions** page calls `/api/predictions/usage/` and shows a banner when usage regime is `spike_today` (e.g. stress-test data).

If `predictor.joblib` is missing, prediction responses indicate that the model must be trained first. Forecast projects **forward** from historical patterns—it does not repeat a one-day spike unless usage stays elevated for a week (`elevated_week` regime).

---

## 5. Synthetic Telemetry (Demo Data)

### Purpose

Management commands generate **hourly** `TelemetryReading` rows for demos and ML training without hardware.

### Commands (run from `shems-backend`)

| Command | Role |
|--------|------|
| `python manage.py generate_synthetic_telemetry --device-token <TOKEN> [--role ac\|pc\|fan] [--clear]` | ~1 year of hourly data for **one** device |
| `python manage.py seed_demo_devices [token1 token2 token3]` | Runs generation for **three** tokens with roles **AC → PC → Fan/Lights** (order matters) |

### Pakistani household model (three devices)

Targets are **per device**; combined household totals stay roughly in the **5–10 kWh/day** band before noise:

- **AC**: ~5 kWh weekdays, ~7 kWh weekends (+2 kWh); evening-weighted hours so power is ~**1000 W** when the AC is “on” (`power` ≈ hourly kWh × 1000).
- **PC**: ~1 kWh/day (daytime window).
- **Fan/Lights**: ~0.5 kWh/day (spread across 24 h).

**Variation:** ±15% multiplicative noise per hour; **+0.1%** per calendar day seasonal ramp with a cap so combined daily energy stays bounded.

`TelemetryReading.power` is **average watts over that hour**; cumulative `energy_kwh` increases hour by hour for charting and delta-based cost logic.

---

## 6. Solar Calculation Logic

### Architecture Overview

The solar system integrates **real-time weather data** with **mathematical modeling** to estimate solar generation.

### Components

#### 6.1 Weather Service (`solar/weather_service.py`)

**Purpose**: Fetches and caches weather data from OpenWeatherMap API.

**Flow:**
1. Checks `WeatherCache` table for existing data (by lat/lon)
2. If cache is fresh (< 30 minutes old), returns cached data
3. Otherwise, calls OpenWeatherMap API:
   - Retrieves `cloud_cover` (percentage)
   - Retrieves `sunrise` and `sunset` times
4. Updates cache and returns `WeatherCache` object

**Caching Strategy**: Reduces API calls and improves performance.

#### 6.2 Solar Generation Estimation (`solar/solar_service.py`)

**Function**: `estimate_solar_kw(capacity_kw, cloud_cover, now, sunrise, sunset)`

**Algorithm:**
```python
1. If capacity_kw <= 0 or outside daylight hours → return 0.0

2. Calculate solar factor (sine wave):
   - elapsed = time since sunrise
   - day_seconds = total daylight duration
   - solar_factor = sin(π × elapsed / day_seconds)
   - This creates a bell curve: 0 → peak → 0

3. Calculate cloud factor:
   - cloud_factor = max(0, 1.0 - (cloud_cover / 100) × 0.75)
   - 0% clouds = 100% efficiency
   - 100% clouds = 25% efficiency

4. Final calculation:
   - power = capacity_kw × solar_factor × cloud_factor
   - Returns rounded value (kW)
```

**Mathematical Model:**
- Uses **sine wave** to model sun's path (realistic power curve)
- Cloud cover reduces efficiency linearly (up to 75% reduction)
- Accounts for time of day (no generation at night)

#### 6.3 Solar Status API (`solar/views.py` - `SolarStatusAPI`)

**Endpoint**: `GET /api/solar/status/`

**Calculation Flow:**
1. Retrieves user's `SolarConfig` (enabled, capacity, location)
2. Gets weather data via `get_weather(lat, lon)`
3. Calculates current solar generation: `estimate_solar_kw(...)`
4. Gets latest home power consumption from `TelemetryReading`
5. Calculates grid import:
   ```python
   grid_import_kw = max(home_kw - solar_kw, 0.0)
   ```
   - If solar > home usage → grid import = 0 (excess solar)
   - If solar < home usage → grid import = difference

6. Calculates savings:
   ```python
   savings_today = min(home_kw, solar_kw) × tariff_pkr_per_kwh
   ```
   - Only counts energy that solar actually covers

7. Stores historical data in `SolarGeneration` table (every 5 minutes)

**Response:**
```json
{
  "enabled": true,
  "solar_kw": 2.5,
  "home_kw": 3.0,
  "grid_import_kw": 0.5,
  "savings_today_pkr": 75.50,
  "cloud_cover": 30,
  "source": "estimated"
}
```

#### 6.4 Solar History API (`solar/views.py` - `SolarHistoryAPI`)

**Endpoint**: `GET /api/solar/history/?from=...&to=...&limit=200`

**Data Source Priority:**
1. **Primary**: Stored `SolarGeneration` records (accurate historical data)
2. **Fallback**: Recalculate from `TelemetryReading` + weather (for initial setup)

**Purpose**: Provides time-series data for charts showing solar vs. home vs. grid over time.

---

## 7. Tariff Calculation Logic

### Overview

The system implements **IESCO A-1 residential slab billing** with rates stored in the database (`TariffPlan`, `TariffSlab`) and logic in **`user_settings/tariff_service.py`**.

### Components

#### 7.1 Tariff Calculator API (`user_settings/views.py` - `TariffCalculatorAPI`)

**Endpoint**: `GET /api/settings/tariff-calculator/`

**Purpose**: Returns protection status, current-month slab bill breakdown, and effective PKR/kWh.

#### 7.2 Protection Status Logic

**Definition** (`is_protected_consumer`): Protected if **every month in the last 6** (from in-app telemetry) had usage **&lt; 200 kWh**. New users with no history default to **protected**.

```python
# tariff_service.py
window = monthly_units[:6]
return all(float(u) < 200 for u in window)
```

#### 7.3 Slab billing engine (`tariff_service.py`)

- **Protected:** Progressive slabs (e.g. 1–100 @ 10.54, 101–200 @ 13.01 PKR/kWh on units in each band).
- **Unprotected:** Single flat rate on **all** units based on total monthly consumption band (e.g. 165 units → 28.91 PKR/kWh on entire bill).
- Rates seeded in migration `0003_seed_iesco_a1`; editable in Django admin when S.R.O. changes.
- **v1 scope:** Variable energy charges only; fixed charges / FCA / taxes are future work.

#### 7.4 Monthly Usage Calculation (`usage_service.py`)

**Method**: Positive **deltas** on cumulative `energy_kwh` per device, summed for home total (same delta idea as `calc_kwh_in_range` in predictions).

#### 7.5 Cost Calculation

- When `UserSettings.use_slab_billing` is **true**: `cost_for_units()` / `calculate_monthly_bill()` from active plan.
- Otherwise: flat `tariff_pkr_per_kwh` from user settings.

**Used in:** Today summary, monthly reports, tariff calculator, predictions forecast cost.

#### 7.6 Monthly Reports API (`MonthlyReportsAPI`)

**Endpoint**: `GET /api/settings/monthly-reports/`

**Returns:**
- Last 12 months of usage and cost
- `device_breakdown`: per-device totals across the window
- `device_monthly_breakdown`: for each month, per-device kWh/cost (for pie charts and month filters on the Reports page)
- Solar vs. grid energy split
- Aggregated statistics (totals, averages)

**Solar Integration:**
- Estimates solar generation for period
- Calculates grid import: `grid_kwh = total_kwh - solar_kwh`
- Shows energy savings from solar

---

## 8. API Endpoint Summary

### Authentication (`/api/auth/`)
- `POST /api/auth/register/` - User registration
- `POST /api/auth/login/` - JWT access + refresh tokens
- `POST /api/auth/refresh/` - New access token from refresh token
- `GET /api/auth/me/` - Current user info

### Devices (`/api/devices/`)
- `GET /api/devices/` - List user's devices
- `POST /api/devices/` - Create device
- `PATCH /api/devices/{id}/` - Update device (relay, limits, schedule, metadata)
- `DELETE /api/devices/{id}/` - Delete device
- `GET /api/devices/state-by-token/` - ESP32: fetch relay/limits/schedule (header `X-DEVICE-TOKEN`, no JWT)

### Telemetry (`/api/telemetry/`)
- `POST /api/telemetry/telemetry/upload/` - Device upload (X-DEVICE-TOKEN auth)
- `GET /api/telemetry/latest/?device_id=1` - Latest reading
- `GET /api/telemetry/range/?device_id=1&from=...&to=...` - Time range
- `GET /api/telemetry/today-summary/` - Today's summary with costs

### Settings (`/api/settings/`)
- `GET /api/settings/` - User settings (tariff)
- `PATCH /api/settings/` - Update tariff
- `GET /api/settings/tariff-calculator/` - Calculate tariff rate
- `GET /api/settings/monthly-reports/` - 12-month reports

### Solar (`/api/solar/`)
- `GET /api/solar/config/` - Solar configuration
- `PUT /api/solar/config/` - Update configuration
- `GET /api/solar/status/` - Current solar status
- `GET /api/solar/history/?from=...&to=...` - Historical data

### Predictions (`/api/predictions/`)
- `GET /api/predictions/usage/?period=7|30` - Daily usage forecast (and recent actuals) for the current user
- `GET /api/predictions/recommendations/` - Energy-saving recommendations

---

## 9. Security Architecture

### Authentication Methods

1. **User Authentication (Frontend)**: JWT tokens
   - Stored in `localStorage`
   - Sent as `Authorization: Bearer <token>` header
   - 60-minute access token lifetime
   - 7-day refresh token lifetime

2. **Device Authentication (ESP32/IoT)**: Device tokens
   - Each device has unique `device_token` (UUID)
   - Sent as `X-DEVICE-TOKEN` header
   - Allows devices to upload telemetry without user login

### Data Isolation

- All queries filter by `user=request.user`
- Users can only access their own devices, telemetry, and settings
- Django ORM enforces this at the database level

---

## 10. Key Design Patterns

1. **Repository Pattern**: Django ORM abstracts database access
2. **Service Layer**: `solar_service.py`, `weather_service.py`, and `predictions/services.py` separate business logic
3. **Serializer Pattern**: DRF serializers handle data transformation
4. **API Client Pattern**: `/lib/api.ts` centralizes HTTP communication
5. **Caching Strategy**: Weather data cached to reduce API calls

---

## 11. Technology Stack Summary

**Backend:**
- Django 6.0
- Django REST Framework
- JWT Authentication (SimpleJWT)
- SQLite (development) / PostgreSQL (production-ready)
- OpenWeatherMap API integration
- scikit-learn (Random Forest regressor), pandas, joblib (training and inference for usage predictions)

**Frontend:**
- React 18
- TypeScript
- Vite (build tool)
- React Router (routing)
- Charting on Monitoring / Reports / Predictions pages

**Key Libraries:**
- `corsheaders`: CORS handling
- `rest_framework_simplejwt`: JWT tokens
- `requests`: HTTP client for weather API
- `numpy` / `pandas` / `scikit-learn` / `joblib`: ML pipeline (backend)

---

## 12. Frontend application overview (current UI)

High-level behavior of main React pages under `shems-frontend/src/pages/` (see also `FRONTEND_QUICK_REFERENCE.md`).

| Area | Behavior |
|------|----------|
| **Dashboard** | Today’s totals, live status, today-by-device chips, **UsageChart**, optional solar card, top **energy tips** (recommendations), polls **alerts** every **10 s**. |
| **Devices** | Collapsible add form; CRUD; token copy; relay; limits & schedule; ESP32 reads state via token. |
| **Monitoring** | Per-device or **home total** charts; home energy uses **delta sum** across meters. |
| **Reports** | 12-month API; month selection; device breakdown; solar/grid uses **SolarGeneration** history when available. |
| **Predictions** | ML forecast + full recommendations list. |
| **Settings** | Tariff, calculator with **use & save**, solar config. |
| **Solar** | Weather-based estimates; **fallback** if OpenWeather unavailable. |
| **Alerts** | **`GET/POST /api/alerts/`** (offline, limits); stored history; browser notifications; dismiss in UI. |
| **Help** | **`/help`** — end-user guide & FAQ (no developer commands). |
| **Auth** | `ProtectedRoute` on app pages; signup **auto-login**. |

**Repository documentation (root):** `LAST_UPDATE.md` (dated change log), `ARCHITECTURE_SUMMARY.md` (this file), `QUICK_CHEAT_SHEET.md`, `FRONTEND_QUICK_REFERENCE.md`, `PROJECT_REPORT_QUICK_SUMMARY.md`, `DATABASE_SCHEMA_SUMMARY.md`, `HARDWARE_CIRCUIT_GUIDE.md`, `firmware/README.md`.

---

## 13. Alerts API (stored in DB)

Alerts are **persisted** in `telemetry_alertevent` and synced on each telemetry upload and `GET /api/alerts/`.

- **Endpoint:** `GET /api/alerts/` (JWT); `POST /api/alerts/` for mark_read / dismiss / dismiss_all
- **Logic:** `shems-backend/telemetry/alerts_service.py`
- **Rules:** device **offline** (no reading for **60 s**), user-set **`power_limit_w`**, user-set **`daily_energy_limit_kwh`** (no global “high usage” rule)
- **Frontend:** `src/lib/alerts.ts` — browser notifications, session tracking; Alerts page; Dashboard bell polls every **10 s**

---

## 14. Hardware loop (ESP32)

```
First boot / BOOT held at reset:
  Phone → WiFi "WattGuard-Setup" → captive portal → WiFi + server IP + device token → saved to flash

Normal operation:
ESP32 ──POST──> /api/telemetry/upload/     (X-DEVICE-TOKEN, PZEM readings)
ESP32 ──GET───> /api/devices/state-by-token/  (relay_on, limits, schedule)
```

**Firmware:** `firmware/wattguard_esp32/wattguard_esp32.ino` (WiFiManager + PZEM004Tv30). See **`firmware/README.md`**.

**Demo without extra hardware:** one physical PZEM = one app device; `demo_sender.py` or synthetic telemetry for additional circuits.

---

## 15. Future work (FYP scope vs later)

Items intentionally deferred or partially implemented — suitable for report **Conclusion / Future work**:

| Area | Current behaviour | Possible extension |
|------|-------------------|-------------------|
| **Protected vs unprotected consumer** | Inferred from last 6 months of **in-app** usage; new users default to protected until history exists | Optional Settings toggle or onboarding question (“under 200 units/month for last 6 months per DISCO records”) until enough telemetry is collected; later replace with imported billing history |
| **Database** | SQLite (dev) | PostgreSQL for production |
| **ML** | Pooled Random Forest, manual `train_predictor` | Per-user models, scheduled retraining, spike scenarios labelled in UI |
| **Alerts** | Stored `AlertEvent`, browser notifications | Mobile push (FCM), usage tier milestones (50/100/180/200 units) |
| **Billing** | Variable slab rates from admin `TariffPlan` | Fixed charges, FCA, taxes per IESCO bill |
| **Solar** | Weather estimate + history | Hardware inverter API, net metering |

**Rationale for deferring protection onboarding:** Real DISCO classification depends on six months of **verified** consumption. A signup checkbox is unverifiable and awkward when the app has zero prior months; self-report plus partial in-app history adds edge cases without improving demo accuracy. Defaulting to protected until telemetry proves otherwise is sufficient for v1.

---

This architecture provides a scalable, maintainable system for monitoring and managing home energy consumption with solar integration, live alerts, and intelligent tariff calculations.

