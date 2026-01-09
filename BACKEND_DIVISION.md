# Backend Components Division - 3 Member Presentation

## Overview
The backend is divided into **3 logical sections**, each covering a distinct aspect of the system. Each member should be able to explain their section independently while understanding how it connects to the others.

---

## 📋 **MEMBER 1: Authentication & Device Management**
**Focus**: Foundation & Infrastructure

### Components to Explain:

#### 1. **Users Module** (`users/`)
- **Purpose**: User authentication and account management
- **Files to Cover**:
  - `models.py`: User model (extends Django's built-in User)
  - `views.py`: 
    - `RegisterUserAPI`: User registration endpoint
    - `MeAPI`: Get current user info
  - `urls.py`: Authentication routes
  - `serializers.py`: User data serialization

- **Key Concepts**:
  - JWT Authentication setup (`rest_framework_simplejwt`)
  - Token generation on login (`/api/auth/login/`)
  - Token refresh mechanism
  - User registration flow
  - Permission classes (`AllowAny` vs `IsAuthenticated`)

#### 2. **Devices Module** (`devices/`)
- **Purpose**: Device registration and management
- **Files to Cover**:
  - `models.py`: 
    - `Device` model (name, room, type, device_token)
    - `generate_device_token()`: UUID-based token generation
    - Foreign key relationship to User
  - `views.py`: 
    - `DeviceViewSet`: CRUD operations (List, Create, Delete)
    - User-scoped queries (`filter(user=request.user)`)
  - `urls.py`: RESTful routing via Django Router
  - `serializers.py`: Device data transformation

- **Key Concepts**:
  - Device token authentication (for ESP32/IoT devices)
  - ViewSet pattern (DRF)
  - Data isolation (users only see their devices)
  - Device registration workflow

#### 3. **Configuration** (`config/`)
- **Files to Cover**:
  - `settings.py`: 
    - Django REST Framework configuration
    - JWT settings (token lifetime)
    - CORS configuration
    - Database setup
    - Installed apps
  - `urls.py`: Root URL routing

### **Presentation Points for Member 1**:
1. **Authentication Flow**: How users register, login, and receive JWT tokens
2. **Device Registration**: How devices are created and assigned tokens
3. **Security**: Two-tier authentication (JWT for users, device tokens for IoT)
4. **Data Isolation**: How Django ORM ensures users only access their data
5. **API Structure**: RESTful endpoints and routing

### **Demo Flow**:
```
User Registration → Login (Get JWT) → Create Device → Get Device Token
```

---

## 📊 **MEMBER 2: Data Collection & Telemetry**
**Focus**: Core Data Flow & Real-time Monitoring

### Components to Explain:

#### 1. **Telemetry Module** (`telemetry/`)
- **Purpose**: Power measurement data collection and retrieval
- **Files to Cover**:
  - `models.py`: 
    - `TelemetryReading` model
    - Fields: `voltage`, `current`, `power`, `energy_kwh`, `created_at`
    - Foreign key to Device
    - Database indexes for performance
  - `views.py`: 
    - `TelemetryUploadAPI`: Device upload endpoint (X-DEVICE-TOKEN auth)
    - `TelemetryLatestAPI`: Get latest reading for a device
    - `TelemetryRangeAPI`: Get time-series data for charts
    - `TelemetryTodaySummaryAPI`: Calculate today's usage and cost
  - `urls.py`: Telemetry routing
  - `serializers.py`: Data validation and transformation

- **Key Concepts**:
  - Device token authentication (different from JWT)
  - Time-range queries with filtering
  - Energy calculation (delta method for cumulative values)
  - Cost calculation integration
  - Data aggregation (today's summary)

#### 2. **Data Flow Architecture**
- **Upload Flow**: ESP32 → Device Token Auth → Database
- **Retrieval Flow**: Frontend → JWT Auth → Database → JSON Response
- **Query Optimization**: Indexes, filtering, pagination

### **Presentation Points for Member 2**:
1. **Data Collection**: How ESP32 devices upload telemetry data
2. **Dual Authentication**: Device tokens vs JWT tokens
3. **Data Retrieval**: Querying telemetry with time ranges
4. **Energy Calculation**: Delta method for accurate kWh calculation
5. **Real-time Monitoring**: Latest readings and today's summary
6. **Database Design**: Indexes and relationships

### **Demo Flow**:
```
ESP32 Uploads Data → Store in Database → Frontend Queries → Display Charts
```

### **Key Code to Explain**:
- `TelemetryUploadAPI.post()`: Device authentication and data storage
- `calc_today_kwh_for_device()`: Energy calculation algorithm
- Query filtering with time ranges

---

## 🧠 **MEMBER 3: Analytics & Smart Features**
**Focus**: Intelligent Calculations & Advanced Features

### Components to Explain:

#### 1. **User Settings Module** (`user_settings/`)
- **Purpose**: User preferences and tariff calculations
- **Files to Cover**:
  - `models.py`: 
    - `UserSettings` model (OneToOne with User)
    - `tariff_pkr_per_kwh` field
  - `views.py`: 
    - `UserSettingsAPI`: Get/Update user tariff
    - `TariffCalculatorAPI`: **Calculate tariff based on usage**
    - `MonthlyReportsAPI`: Generate 12-month reports
  - `urls.py`: Settings routes

- **Key Concepts**:
  - Tariff calculation algorithm (Pakistan's tiered structure)
  - Protection status logic (6-month history)
  - Monthly usage aggregation
  - Cost calculation
  - Device breakdown analysis

#### 2. **Solar Module** (`solar/`)
- **Purpose**: Solar panel integration and generation estimation
- **Files to Cover**:
  - `models.py`: 
    - `SolarConfig`: User's solar setup (capacity, location)
    - `WeatherCache`: Cached weather data
    - `SolarGeneration`: Historical solar data
  - `weather_service.py`: 
    - `get_weather()`: OpenWeatherMap API integration
    - Caching strategy (30-minute freshness)
  - `solar_service.py`: 
    - `estimate_solar_kw()`: **Solar generation algorithm**
  - `views.py`: 
    - `SolarConfigAPI`: Configure solar system
    - `SolarStatusAPI`: Real-time solar status
    - `SolarHistoryAPI`: Historical solar data
  - `urls.py`: Solar routes

- **Key Concepts**:
  - Weather API integration
  - Solar generation estimation (sine wave model)
  - Cloud cover impact calculation
  - Grid import calculation
  - Savings calculation
  - Historical data storage

### **Presentation Points for Member 3**:
1. **Tariff Calculation**: 
   - Pakistan's tiered tariff structure
   - Protection status determination
   - Monthly usage analysis
   - Rate calculation algorithm

2. **Solar Integration**:
   - Weather API integration and caching
   - Solar generation estimation (mathematical model)
   - Real-time status calculation
   - Grid import vs. solar usage
   - Cost savings calculation

3. **Analytics**:
   - Monthly reports generation
   - Device breakdown analysis
   - Solar vs. grid energy split
   - Historical data management

### **Demo Flow**:
```
Configure Solar → Get Weather → Calculate Generation → Calculate Savings
Calculate Tariff → Generate Reports → Show Analytics
```

### **Key Algorithms to Explain**:
1. **Tariff Calculation** (`calculate_tariff()`):
   ```python
   - Check protection status (6 months < 200 kWh)
   - Determine usage tier (0-50, 51-100, 101-200, 201-300, 300+)
   - Return appropriate rate based on tier and protection
   ```

2. **Solar Estimation** (`estimate_solar_kw()`):
   ```python
   - Calculate solar_factor using sine wave
   - Apply cloud_factor (1.0 - cloud_cover * 0.75)
   - Final: capacity_kw × solar_factor × cloud_factor
   ```

3. **Grid Import**:
   ```python
   grid_import_kw = max(home_kw - solar_kw, 0.0)
   ```

---

## 🔗 **Integration Points Between Sections**

### Member 1 → Member 2:
- Devices created by Member 1 are used by Member 2 for telemetry uploads
- Device tokens from Member 1 authenticate telemetry uploads

### Member 2 → Member 3:
- Telemetry data from Member 2 is used by Member 3 for:
  - Tariff calculations (monthly usage)
  - Solar status (home power consumption)
  - Monthly reports (energy aggregation)

### Member 1 → Member 3:
- User authentication from Member 1 secures all Member 3 endpoints
- User settings are tied to authenticated users

---

## 📝 **Presentation Structure Recommendation**

### **Order of Presentation**:
1. **Member 1** (Foundation) → Sets up the base
2. **Member 2** (Core Functionality) → Builds on foundation
3. **Member 3** (Advanced Features) → Adds intelligence

### **Each Member Should Cover**:
1. **Overview**: What their section does
2. **Models**: Database structure
3. **Views/Logic**: Business logic and algorithms
4. **API Endpoints**: Available routes
5. **Integration**: How it connects to other sections
6. **Demo**: Live example or walkthrough

### **Common Points All Should Mention**:
- Authentication (JWT or device tokens)
- Data isolation (user-scoped queries)
- Error handling
- API response format

---

## 🎯 **Quick Reference: File Locations**

### Member 1:
- `users/models.py`, `users/views.py`, `users/urls.py`
- `devices/models.py`, `devices/views.py`, `devices/urls.py`
- `config/settings.py`, `config/urls.py`

### Member 2:
- `telemetry/models.py`, `telemetry/views.py`, `telemetry/urls.py`
- `telemetry/serializers.py`

### Member 3:
- `user_settings/models.py`, `user_settings/views.py`, `user_settings/urls.py`
- `solar/models.py`, `solar/views.py`, `solar/urls.py`
- `solar/weather_service.py`, `solar/solar_service.py`

---

## 💡 **Tips for Each Member**

### Member 1:
- Emphasize security (JWT, device tokens)
- Show how data isolation works
- Explain the authentication flow diagram

### Member 2:
- Focus on data flow (upload → store → retrieve)
- Explain the energy calculation algorithm
- Show query optimization techniques

### Member 3:
- Highlight the mathematical models (solar, tariff)
- Explain business logic (protection status, tiered rates)
- Show integration with external APIs (weather)

---

Good luck with your presentation! 🚀

