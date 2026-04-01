# SHEMS Frontend

React 18 + TypeScript + Vite client for **SHEMS** (Smart Home Energy Management System). Talks to the Django REST API in `../shems-backend`.

## Prerequisites

- Node.js 18+ (recommended)
- Backend running (default `http://127.0.0.1:8000`)

## Setup

```bash
cd shems-frontend
npm install
```

## Environment

Optional: create `.env` (or use defaults):

```env
VITE_API_BASE=http://127.0.0.1:8000
```

## Run (development)

```bash
npm run dev
```

Open the printed local URL (usually `http://localhost:5173`). Register or log in, add devices, then use **Monitoring** / **Predictions** / **Reports** as data appears.

## Build

```bash
npm run build
npm run preview
```

## Project layout (high level)

- `src/lib/api.ts` — Authenticated API client and types (devices, telemetry, settings, predictions, solar).
- `src/pages/` — Dashboard, Monitoring, Devices, Predictions, Reports, Settings, etc.
- `src/components/` — Layout (e.g. `AppShell`, `TopBar`), shared UI.

For architecture and backend commands (synthetic data, `train_predictor`), see the repo root **`ARCHITECTURE_SUMMARY.md`** and **`QUICK_CHEAT_SHEET.md`**.
