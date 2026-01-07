const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

export type Tokens = { access: string; refresh: string };

export function setTokens(t: Tokens) {
  localStorage.setItem("access", t.access);
  localStorage.setItem("refresh", t.refresh);
}
export function getAccess() {
  return sessionStorage.getItem("access") || localStorage.getItem("access");
}

export function clearTokens() {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
}

function extractErrorMessage(data: unknown): string | null {
  if (!data) return null;

  // DRF often returns: { detail: "..." }
  if (typeof data === "object" && data !== null && "detail" in data) {
    const d = (data as { detail?: unknown }).detail;
    if (typeof d === "string") return d;
  }

  // DRF validation: { field: ["msg1", "msg2"], other: ["msg"] }
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    const msgs: string[] = [];

    for (const [key, val] of Object.entries(obj)) {
      if (Array.isArray(val)) {
        const first = val.find((x) => typeof x === "string");
        if (typeof first === "string") msgs.push(`${key}: ${first}`);
      } else if (typeof val === "string") {
        msgs.push(`${key}: ${val}`);
      }
    }

    if (msgs.length) return msgs.join(" • ");
  }

  return null;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg = extractErrorMessage(data) || text || "Request failed";
    throw new Error(msg);
  }

  return data as T;
}

export const registerUser = (body: { username: string; email: string; password: string }) =>
  postJson("/api/auth/register/", body);

export const loginUser = (body: { username: string; password: string }) =>
  postJson<Tokens>("/api/auth/login/", body);

export async function me() {
  const token = getAccess();
  const res = await fetch(`${API_BASE}/api/auth/me/`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Not authenticated");
  return res.json() as Promise<{ id: number; username: string; email: string }>;
}
//sort later these functions are used in Devices.tsx

export type Device = {
  id: number;
  name: string;
  room: string;
  device_type: string;
  is_controllable: boolean;
  device_token: string;
  created_at: string;
};

async function authFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccess();
  const headers = new Headers(init?.headers || {});
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  const text = await res.text();
  let data: unknown = null;

  try {
    data = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    // handle DRF {detail:"..."} or plain string
    if (typeof data === "object" && data !== null && "detail" in data) {
      const d = (data as { detail?: unknown }).detail;
      if (typeof d === "string") throw new Error(d);
    }
    throw new Error("Request failed");
  }

  return data as T;
}


export async function listDevices(): Promise<Device[]> {
  return authFetch<Device[]>("/api/devices/", { method: "GET" });
}

export async function createDevice(input: {
  name: string;
  room: string;
  device_type: string;
  is_controllable: boolean;
}): Promise<Device> {
  return authFetch<Device>("/api/devices/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteDevice(id: number): Promise<void> {
  await authFetch<void>(`/api/devices/${id}/`, { method: "DELETE" });
}


//sort later these functions are used in telemetry pages

export type TelemetryReading = {
  id: number;
  device: number;
  voltage: number;
  current: number;
  power: number;
  energy_kwh: number;
  created_at: string;
};


export async function getLatestTelemetry(deviceId: number): Promise<TelemetryReading> {
  return authFetch<TelemetryReading>(`/api/telemetry/latest/?device_id=${deviceId}`, { method: "GET" });
}

export async function getTelemetryRange(
  deviceId: number,
  from?: string,
  to?: string,
  limit = 200
): Promise<TelemetryReading[]> {
  const params = new URLSearchParams({ device_id: String(deviceId), limit: String(limit) });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return authFetch<TelemetryReading[]>(`/api/telemetry/range/?${params.toString()}`, { method: "GET" });
}

export type TodaySummaryDevice = {
  device_id: number;
  name: string;
  today_kwh: number;
  cost_pkr: number;
};

export type TodaySummary = {
  date: string; // "YYYY-MM-DD"
  timezone: string;
  tariff_pkr_per_kwh: number;
  devices: TodaySummaryDevice[];
  home_total_kwh: number;
  home_total_cost_pkr: number;
};

export async function getTodaySummary(): Promise<TodaySummary> {
  return authFetch<TodaySummary>(`/api/telemetry/today-summary/`, { method: "GET" });
}
export type UserSettings = {
  tariff_pkr_per_kwh: number;
  updated_at: string;
};

export async function getUserSettings(): Promise<UserSettings> {
  return authFetch<UserSettings>("/api/settings/", { method: "GET" });
}

export async function updateUserSettings(input: { tariff_pkr_per_kwh: number }): Promise<UserSettings> {
  return authFetch<UserSettings>("/api/settings/", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export type TariffCalculatorResult = {
  calculated_tariff: number | null;
  is_protected: boolean | null;
  current_month_units: number;
  monthly_usage: Array<{ month: string; kwh: number }>;
  message: string | null;
};

export async function getTariffCalculator(): Promise<TariffCalculatorResult> {
  return authFetch<TariffCalculatorResult>("/api/settings/tariff-calculator/", { method: "GET" });
}

export type MonthlyReport = {
  month: string;
  month_name: string;
  kwh: number;
  cost_pkr: number;
};

export type DeviceBreakdown = {
  device_id: number;
  name: string;
  room: string;
  kwh: number;
  cost_pkr: number;
};

export type MonthlyReportsResult = {
  monthly_reports: MonthlyReport[];
  total_kwh: number;
  total_cost_pkr: number;
  average_monthly_kwh: number;
  average_monthly_cost: number;
  device_breakdown: DeviceBreakdown[];
  solar_kwh: number;
  grid_kwh: number;
};

export async function getMonthlyReports(): Promise<MonthlyReportsResult> {
  return authFetch<MonthlyReportsResult>("/api/settings/monthly-reports/", { method: "GET" });
}

// Solar API
export type SolarConfig = {
  enabled: boolean;
  installed_capacity_kw: number;
  latitude: number | null;
  longitude: number | null;
};

export type SolarStatus = {
  enabled: boolean;
  solar_kw: number;
  home_kw: number;
  grid_import_kw: number;
  savings_today_pkr: number;
  cloud_cover: number;
  source: string;
};

export type SolarHistoryPoint = {
  timestamp: string;
  solar_kw: number;
  home_kw: number;
  grid_import_kw: number;
};

export async function getSolarConfig(): Promise<SolarConfig> {
  return authFetch<SolarConfig>("/api/solar/config/", { method: "GET" });
}

export async function updateSolarConfig(input: {
  enabled: boolean;
  installed_capacity_kw: number;
  latitude: number | null;
  longitude: number | null;
}): Promise<{ status: string }> {
  return authFetch<{ status: string }>("/api/solar/config/", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function getSolarStatus(): Promise<SolarStatus> {
  return authFetch<SolarStatus>("/api/solar/status/", { method: "GET" });
}

export async function getSolarHistory(
  from?: string,
  to?: string,
  limit = 200
): Promise<SolarHistoryPoint[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return authFetch<SolarHistoryPoint[]>(`/api/solar/history/?${params.toString()}`, { method: "GET" });
}