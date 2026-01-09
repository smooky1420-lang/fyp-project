# SHEMS (Smart Home Energy Management System) - Architecture Summary

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
     - Retrieves JWT token from localStorage
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
  ├── Device (1:N) - User owns multiple devices
  │     └── TelemetryReading (1:N) - Device has many readings
  ├── UserSettings (1:1) - User has one settings record
  └── SolarConfig (1:1) - User has one solar configuration
        └── SolarGeneration (1:N) - Historical solar data
```

**Database Tables:**
- `devices_device`: Stores device metadata (name, room, type, device_token)
- `telemetry_telemetryreading`: Stores power measurements (voltage, current, power, energy_kwh)
- `user_settings_usersettings`: Stores user tariff rate
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
   - **Devices**: `listDevices()`, `createDevice()`, `deleteDevice()`
   - **Telemetry**: `getLatestTelemetry()`, `getTelemetryRange()`, `getTodaySummary()`
   - **Settings**: `getUserSettings()`, `updateUserSettings()`, `getTariffCalculator()`, `getMonthlyReports()`
   - **Solar**: `getSolarConfig()`, `updateSolarConfig()`, `getSolarStatus()`, `getSolarHistory()`

4. **TypeScript Type Definitions**
   - Exports TypeScript interfaces for all API responses
   - Ensures type safety across the frontend
   - Examples: `Device`, `TelemetryReading`, `SolarStatus`, `TodaySummary`

**Benefits:**
- **DRY Principle**: No duplicate fetch logic in components
- **Type Safety**: Centralized types prevent errors
- **Error Handling**: Consistent error extraction from DRF responses
- **Maintainability**: API changes only need updates in one place

### Other `/lib/` Files:
- `alerts.ts`: Alert/notification utilities
- `errors.ts`: Error handling utilities

---

## 4. Solar Calculation Logic

### Architecture Overview

The solar system integrates **real-time weather data** with **mathematical modeling** to estimate solar generation.

### Components

#### 4.1 Weather Service (`solar/weather_service.py`)

**Purpose**: Fetches and caches weather data from OpenWeatherMap API.

**Flow:**
1. Checks `WeatherCache` table for existing data (by lat/lon)
2. If cache is fresh (< 30 minutes old), returns cached data
3. Otherwise, calls OpenWeatherMap API:
   - Retrieves `cloud_cover` (percentage)
   - Retrieves `sunrise` and `sunset` times
4. Updates cache and returns `WeatherCache` object

**Caching Strategy**: Reduces API calls and improves performance.

#### 4.2 Solar Generation Estimation (`solar/solar_service.py`)

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

#### 4.3 Solar Status API (`solar/views.py` - `SolarStatusAPI`)

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

#### 4.4 Solar History API (`solar/views.py` - `SolarHistoryAPI`)

**Endpoint**: `GET /api/solar/history/?from=...&to=...&limit=200`

**Data Source Priority:**
1. **Primary**: Stored `SolarGeneration` records (accurate historical data)
2. **Fallback**: Recalculate from `TelemetryReading` + weather (for initial setup)

**Purpose**: Provides time-series data for charts showing solar vs. home vs. grid over time.

---

## 5. Tariff Calculation Logic

### Overview

The system implements **Pakistan's electricity tariff structure** with protection status tracking.

### Components

#### 5.1 Tariff Calculator API (`user_settings/views.py` - `TariffCalculatorAPI`)

**Endpoint**: `GET /api/settings/tariff-calculator/`

**Purpose**: Calculates the appropriate electricity tariff rate based on usage history.

#### 5.2 Protection Status Logic

**Definition**: A user is "protected" if **all of the last 6 months** had usage < 200 kWh.

```python
is_protected = all(month["kwh"] < 200 for month in monthly_usage)
```

**Why 6 months?**: Pakistan's tariff protection requires consistent low usage.

#### 5.3 Tariff Rate Calculation (`calculate_tariff()`)

**Tariff Structure (PKR per kWh):**

| Usage Range (kWh/month) | Protected Rate | Unprotected Rate |
|------------------------|----------------|------------------|
| 0-50 (Lifeline)        | 3.95           | N/A              |
| 51-100                 | 7.74           | 22.44            |
| 101-200                | 13.01          | 28.91            |
| 201-300                | N/A*           | 33.10            |
| 300+                   | 33.10          | 33.10            |

*Note: Protected users exceeding 200 kWh lose protection status.

**Algorithm:**
```python
def calculate_tariff(units, is_protected):
    if units <= 50:
        return 3.95 if is_protected else None
    elif units <= 100:
        return 7.74 if is_protected else 22.44
    elif units <= 200:
        return 13.01 if is_protected else 28.91
    elif units <= 300:
        return None if is_protected else 33.10
    else:
        return 33.10  # Highest rate
```

#### 5.4 Monthly Usage Calculation (`calc_monthly_kwh()`)

**Method**: Calculates energy consumption by computing **positive deltas** in cumulative `energy_kwh` readings.

**Algorithm:**
1. Query all `TelemetryReading` records for device in month range
2. Order by `created_at` (ascending)
3. Calculate deltas:
   ```python
   for each reading:
       delta = current_energy_kwh - previous_energy_kwh
       if delta > 0:
           total += delta
   ```
4. Sum across all devices for home total

**Why deltas?**: Handles meter resets and ensures accuracy even if device restarts.

#### 5.5 Cost Calculation

**Formula**: `cost = energy_kwh × tariff_pkr_per_kwh`

**Used in:**
- `TelemetryTodaySummaryAPI`: Today's cost per device
- `MonthlyReportsAPI`: Monthly cost reports
- `SolarStatusAPI`: Solar savings calculation

#### 5.6 Monthly Reports API (`MonthlyReportsAPI`)

**Endpoint**: `GET /api/settings/monthly-reports/`

**Returns:**
- Last 12 months of usage and cost
- Device breakdown (per-device totals)
- Solar vs. grid energy split
- Aggregated statistics (totals, averages)

**Solar Integration:**
- Estimates solar generation for period
- Calculates grid import: `grid_kwh = total_kwh - solar_kwh`
- Shows energy savings from solar

---

## 6. API Endpoint Summary

### Authentication (`/api/auth/`)
- `POST /api/auth/register/` - User registration
- `POST /api/auth/login/` - JWT token generation
- `GET /api/auth/me/` - Current user info

### Devices (`/api/devices/`)
- `GET /api/devices/` - List user's devices
- `POST /api/devices/` - Create device
- `DELETE /api/devices/{id}/` - Delete device

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

---

## 7. Security Architecture

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

## 8. Key Design Patterns

1. **Repository Pattern**: Django ORM abstracts database access
2. **Service Layer**: `solar_service.py` and `weather_service.py` separate business logic
3. **Serializer Pattern**: DRF serializers handle data transformation
4. **API Client Pattern**: `/lib/api.ts` centralizes HTTP communication
5. **Caching Strategy**: Weather data cached to reduce API calls

---

## 9. Technology Stack Summary

**Backend:**
- Django 6.0
- Django REST Framework
- JWT Authentication (SimpleJWT)
- SQLite (development) / PostgreSQL (production-ready)
- OpenWeatherMap API integration

**Frontend:**
- React 18
- TypeScript
- Vite (build tool)
- React Router (routing)

**Key Libraries:**
- `corsheaders`: CORS handling
- `rest_framework_simplejwt`: JWT tokens
- `requests`: HTTP client for weather API

---

This architecture provides a scalable, maintainable system for monitoring and managing home energy consumption with solar integration and intelligent tariff calculations.

