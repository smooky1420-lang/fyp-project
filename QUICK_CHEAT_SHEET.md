# Quick cheat sheet

**All runnable commands** for SHEMS / **WattGuard** are summarized below. Tips for editing the React UI are further down.

> **Last update (2026-06-24):** IESCO slab billing, stored alerts + browser notifications, forecast spike handling, WiFi provisioning firmware — details in **`LAST_UPDATE.md`**.

---

## Where to run commands

| Place | Folder | Shell |
|--------|--------|--------|
| **Backend (Django)** | `shems-backend` | `cd shems-backend` |
| **Frontend (Vite)** | `shems-frontend` | `cd shems-frontend` |
| **Validate model script** | `shems-backend` | same as backend |

---

## Backend — first-time setup

Run from **`shems-backend`** (use your team’s Python version, e.g. 3.11+).

```powershell
# Windows — optional virtual environment
python -m venv .venv
.\.venv\Scripts\activate

# Install dependencies (use whatever your project uses: requirements.txt, pip install -e ., etc.)
# pip install django djangorestframework ...
```

```bash
# macOS / Linux — optional venv
python3 -m venv .venv
source .venv/bin/activate
```

```bash
# Apply database migrations (required once and after model changes)
python manage.py migrate

# Optional: create a Django admin superuser
python manage.py createsuperuser

# Optional: make migrations after you change models
python manage.py makemigrations
python manage.py migrate
```

---

## Backend — run the API (every day)

From **`shems-backend`**:

```bash
python manage.py runserver
```

- Default URL: `http://127.0.0.1:8000`
- **ESP32 / LAN demo:** `python manage.py runserver 0.0.0.0:8000` (required so devices on Wi‑Fi can reach your PC)

---

## Backend — demo data & telemetry

All from **`shems-backend`**.

| What | Command |
|------|---------|
| **Synthetic data (one device)** — ~1 year hourly readings | `python manage.py generate_synthetic_telemetry --device-token <TOKEN> --role ac` |
| Same, roles | `--role ac` \| `pc` \| `fan` \| `auto` (infer from name/type) |
| Replace existing readings for that device | Add `--clear` |
| Pick user / device without token | `--user <USER_ID>` and/or `--device <DEVICE_ID>` (see command help) |
| Reproducible randomness | `--seed 42` (default 42) |
| **Seed three demo devices** (built-in tokens; AC → PC → Fan) | `python manage.py seed_demo_devices` |
| Custom tokens (3), same role order | `python manage.py seed_demo_devices <token1> <token2> <token3>` |
| Keep existing readings when seeding | `python manage.py seed_demo_devices --no-clear` |

**Note:** `seed_demo_devices` maps the **1st** token → **AC**, **2nd** → **PC**, **3rd** → **Fan/Lights**. After seeding, use **Monitoring** and pick the device + range (e.g. 7d / 30d).

---

## Backend — train ML predictor

From **`shems-backend`** (needs enough `TelemetryReading` data in the DB):

```bash
python manage.py train_predictor
```

| Option | Meaning |
|--------|---------|
| `--days 730` | Days of history per user (default 730) |
| `--min-days 14` | Minimum days with data per user (default 14) |
| `--out path.joblib` | Output file (default: `models/predictor.joblib`) |

Output is used by **`GET /api/predictions/usage/`**.

---

## Backend — optional model check

From **`shems-backend`**:

```bash
python validate_model.py
```

(Offline R² / MAE sanity check; details in script / `ARCHITECTURE_SUMMARY.md`.)

---

## Backend — environment variables

Copy **`shems-backend/.env.example`** → **`.env`** (loaded by `manage.py` via python-dotenv).

| Variable | Purpose |
|----------|---------|
| `OPENWEATHER_API_KEY` | Optional — live cloud/sun for Solar; without it, API uses **estimated** weather |

---

## Backend — run tests

From **`shems-backend`**:

```bash
python manage.py test telemetry users user_settings predictions solar
```

(24 API tests as of 2026-06-24.)

---

## Frontend — install & run

From **`shems-frontend`**:

```bash
npm install
npm run dev
```

| Script | Command | Use |
|--------|---------|-----|
| Dev server | `npm run dev` | Hot reload (usually `http://localhost:5173`) |
| Production build | `npm run build` | Typecheck + Vite build → `dist/` |
| Preview build | `npm run preview` | Serve `dist/` locally |
| Lint | `npm run lint` | ESLint |

---

## Frontend — API URL

Copy **`shems-frontend/.env.example`** → **`.env`** if needed:

```env
VITE_API_BASE=http://127.0.0.1:8000
```

If unset, the app defaults to `http://127.0.0.1:8000` (see `src/lib/api.ts`).

---

## App routes (quick)

| URL | Page |
|-----|------|
| `/login`, `/signup` | Auth |
| `/dashboard` | Main overview |
| `/devices` | Meters + tokens + relay |
| `/monitoring` | Charts |
| `/reports` | Monthly analytics |
| `/predictions` | ML forecast |
| `/solar` | Solar status |
| `/alerts` | Live alerts |
| `/settings` | Tariff + solar config |
| **Help** | **`/help`** — user guide & FAQ (no developer commands) |

---

## Backend — live demo sender (no hardware)

From **repo root** (same WiFi/LAN as backend):

```bash
python demo_sender.py              # realistic loads — normal demo
python demo_sender.py --stress     # high load — alert/limit testing only
```

Edit `DEVICES` list in `demo_sender.py` with tokens from **Devices** page.

---

## Backend — Django admin (tariff slabs)

```bash
python manage.py createsuperuser   # once
# Then http://127.0.0.1:8000/admin/ → Tariff plans / Slabs
```

---

## Firmware — ESP32 (flash once, configure via WiFi)

| Step | Action |
|------|--------|
| Libraries | Arduino: **WiFiManager** (tzapu), **PZEM004Tv30** (mandulaj) |
| Sketch | `firmware/wattguard_esp32/wattguard_esp32.ino` |
| First boot | Join WiFi **`WattGuard-Setup`** → enter home WiFi, server IP, port `8000`, **device token** |
| Re-pair | Hold **BOOT**, press **RESET** (~3 s) → portal opens with new token |
| Details | **`firmware/README.md`** |

Server must listen on LAN: `python manage.py runserver 0.0.0.0:8000`

---

## Typical “full demo” order

### Option A — Exam demo account (recommended)

1. `cd shems-backend` → `migrate` → `runserver 0.0.0.0:8000`
2. `cd shems-frontend` → `npm install` → `npm run dev`
3. **Sign up** a dedicated demo user (e.g. `demo`) — keep your test account separate
4. **Devices** → add meter(s) → copy token(s)
5. `python manage.py seed_demo_devices <t1> <t2> <t3>` (or one token + `generate_synthetic_telemetry`)
6. `python manage.py train_predictor`
7. Flash ESP32 once → WiFi portal → paste token; **or** `python demo_sender.py`
8. **Settings** → enable slab billing; open Dashboard, Reports, Predictions, Alerts

### Option B — Quick UI-only

Skip steps 5–7; use seeded data from an existing account.

---

## Frontend UI tweaks (exam / quick edits)

The sections below are **not** shell commands — they are pointers for common React/Tailwind edits.

---

## Frontend — common UI edits (copy-paste)

### **1. Change StatCard Color**
**File**: `src/pages/Dashboard.tsx`
```tsx
<StatCard
  title="Usage"
  color="purple"  // Change: blue, green, orange, indigo, yellow
/>
```

### **2. Change Heading Text**
**File**: `src/pages/Settings.tsx` (line 186)
```tsx
<h1 className="text-2xl font-semibold">Your New Title</h1>
```

### **3. Change Heading Size**
```tsx
// text-lg → text-xl → text-2xl → text-3xl → text-4xl
<h1 className="text-3xl font-semibold">Settings</h1>
```

### **4. Change Button Color**
```tsx
// Find: bg-indigo-600 hover:bg-indigo-500
// Replace with:
className="... bg-blue-600 ... hover:bg-blue-500"
// Or: bg-green-600 hover:bg-green-500
// Or: bg-red-600 hover:bg-red-500
```

### **5. Change Background Color**
```tsx
// Find: bg-white or bg-slate-50
// Replace with:
className="bg-blue-50"  // Light blue
className="bg-indigo-100"  // Light indigo
```

### **6. Change Text Color**
```tsx
// Find: text-slate-700 or text-slate-900
// Replace with:
className="text-blue-600"  // Blue text
className="text-red-600"   // Red text
className="text-green-700" // Green text
```

---

## 📍 **File Locations**

| Change | File | Line |
|--------|------|------|
| StatCard colors | `Dashboard.tsx` | ~342-390 |
| Page title | `TopBar.tsx` | 29 |
| Settings heading | `Settings.tsx` | 186 |
| Sidebar color | `AppShell.tsx` | 69 |
| Button colors | `Settings.tsx` | 321, 446 |

---

## 🎨 **Tailwind Colors**

```
red, orange, yellow, green, blue, indigo, purple, pink
slate (gray), gray, zinc, neutral, stone
```

**Shades**: `50` (lightest) → `500` (medium) → `900` (darkest)

**Examples**:
- `bg-blue-50` - Very light blue
- `bg-blue-500` - Medium blue
- `bg-blue-900` - Dark blue
- `text-blue-600` - Blue text
- `hover:bg-blue-700` - Darker blue on hover

---

## 🔍 **Quick Find (Ctrl+F)**

- **"Usage"** → StatCard title
- **"Settings"** → Page heading
- **"bg-indigo"** → Button/background colors
- **"text-2xl"** → Font sizes
- **"StatCard"** → Card components

---

## ✅ **Checklist Before Submitting**

- [ ] File saved (Ctrl+S)
- [ ] Browser refreshed
- [ ] No syntax errors (check console)
- [ ] Change is visible on screen

---

**Remember**: Most changes = Find the line → Change the class/prop → Save!

---

## Documentation index

| File | Use |
|------|-----|
| **`LAST_UPDATE.md`** | **What we changed recently** (dated sessions) |
| `PROJECT_REPORT_QUICK_SUMMARY.md` | Report writing, one-page overview |
| `ARCHITECTURE_SUMMARY.md` | Deep technical / data flow |
| `DATABASE_SCHEMA_SUMMARY.md` | Tables & ER for report |
| `FRONTEND_QUICK_REFERENCE.md` | Exam UI tweaks |
| `HARDWARE_CIRCUIT_GUIDE.md` | ESP32 + PZEM wiring |
| `firmware/README.md` | WiFi provisioning firmware (flash once) |

