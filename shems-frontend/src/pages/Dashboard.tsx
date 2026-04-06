import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import StatCard from "../components/StatCard";
import UsageChart, { type ChartRange } from "../components/UsageChart";

import { upsertAlerts, type AlertRecord } from "../lib/alerts";

import {
  clearTokens,
  listDevices,
  type Device,
  getLatestTelemetry,
  getTelemetryRange,
  type TelemetryReading,
  getTodaySummary,
  type TodaySummary,
  type TodaySummaryDevice,
  getSolarStatus,
  type SolarStatus,
} from "../lib/api";

import { Zap, Wallet, Wifi, Sun, PlusCircle, Gauge } from "lucide-react";

function isoFromDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();
}
function isoFromHoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60_000).toISOString();
}

function formatKwh(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  return v.toFixed(3);
}
function formatPkr(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  return `PKR ${v.toFixed(2)}`;
}
function formatKwFromWatts(w: number | null | undefined) {
  if (w === null || w === undefined || !Number.isFinite(w)) return "--";
  return `${(w / 1000).toFixed(2)} kW`;
}

function latestIsOffline(latest: TelemetryReading | null, offlineSeconds = 120) {
  if (!latest) return true;
  const t = new Date(latest.created_at).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > offlineSeconds * 1000;
}

function sumLatestHome(readings: TelemetryReading[]) {
  if (!readings.length) return null;
  const powerSum = readings.reduce((s, r) => s + r.power, 0);
  return { ...readings[0], power: powerSum };
}

function ymd() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}
function ymdHour() {
  const d = new Date();
  return `${d.toISOString().slice(0, 10)}T${String(d.getHours()).padStart(2, "0")}`; // YYYY-MM-DDTHH
}

/** Human-readable age of a telemetry timestamp (browser local time). */
function formatReadingAge(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default function Dashboard() {
  const nav = useNavigate();

  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState<number | "home">("home");

  const [latest, setLatest] = useState<TelemetryReading | null>(null);
  const [rangeData, setRangeData] = useState<TelemetryReading[] | TelemetryReading[][]>([]);
  const [today, setToday] = useState<TodaySummary | null>(null);
  const [solarStatus, setSolarStatus] = useState<SolarStatus | null>(null);

  const [range, setRange] = useState<ChartRange>("day");
  const [statusText, setStatusText] = useState("Loading...");

  const selectedDevice = useMemo(() => {
    if (selectedId === "home") return null;
    return devices.find((d) => d.id === selectedId) || null;
  }, [devices, selectedId]);

  const selectedToday: TodaySummaryDevice | null = useMemo(() => {
    if (!today || selectedId === "home") return null;
    return today.devices.find((x) => x.device_id === selectedId) ?? null;
  }, [today, selectedId]);

  const todayKwh = selectedId === "home" ? today?.home_total_kwh : selectedToday?.today_kwh;
  const todayCost = selectedId === "home" ? today?.home_total_cost_pkr : selectedToday?.cost_pkr;

  useEffect(() => {
    (async () => {
      try {
        const d = await listDevices();
        setDevices(d);
        setSelectedId("home");
        setStatusText(d.length ? "All devices" : "No devices yet. Add devices first.");
      } catch {
        clearTokens();
        nav("/login");
      }
    })();
  }, [nav]);

  // Poll today summary
  useEffect(() => {
    let alive = true;

    async function poll() {
      try {
        const s = await getTodaySummary();
        if (!alive) return;
        setToday(s);
      } catch {
        if (!alive) return;
        setToday(null);
      }
    }

    poll();
    const t = setInterval(poll, 30_000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Poll solar status
  useEffect(() => {
    let alive = true;

    async function pollSolar() {
      try {
        const status = await getSolarStatus();
        if (!alive) return;
        if (status.enabled) {
          setSolarStatus(status);
        } else {
          setSolarStatus(null);
        }
      } catch {
        if (!alive) return;
        setSolarStatus(null);
      }
    }

    pollSolar();
    const t = setInterval(pollSolar, 30_000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Poll latest
  useEffect(() => {
    if (!devices.length) return;

    let alive = true;

    async function pollLatest() {
      try {
        if (selectedId === "home") {
          const results = await Promise.all(
            devices.map(async (d) => {
              try {
                return await getLatestTelemetry(d.id);
              } catch {
                return null;
              }
            })
          );
          if (!alive) return;
          const ok = results.filter((x): x is TelemetryReading => x !== null);
          const home = sumLatestHome(ok);
          setLatest(home);
          setStatusText(ok.length ? "All devices" : "No readings yet.");
        } else {
          const r = await getLatestTelemetry(selectedId);
          if (!alive) return;
          setLatest(r);
          const dev = devices.find((d) => d.id === selectedId);
          setStatusText(dev?.name ?? "Device");
        }
      } catch {
        if (!alive) return;
        setLatest(null);
        setStatusText("No readings yet.");
      }
    }

    pollLatest();
    const t = setInterval(pollLatest, 3000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [devices, selectedId]);

  // Load chart range data
  useEffect(() => {
    if (!devices.length) return;

    let alive = true;

    function calcFromISO(r: ChartRange) {
      if (r === "hour") return isoFromHoursAgo(1);
      if (r === "day") return isoFromHoursAgo(24);
      if (r === "week") return isoFromDaysAgo(7);
      if (r === "month") return isoFromDaysAgo(30);
      return isoFromDaysAgo(365);
    }

    async function loadRange() {
      try {
        const fromISO = calcFromISO(range);
        const limit = 20000; // ✅ matches backend cap now

        if (selectedId === "home") {
          const lists = await Promise.all(
            devices.map(async (d) => {
              try {
                return await getTelemetryRange(d.id, fromISO, undefined, limit);
              } catch {
                return [];
              }
            })
          );
          if (!alive) return;
          setRangeData(lists);
        } else {
          const items = await getTelemetryRange(selectedId, fromISO, undefined, limit);
          if (!alive) return;
          setRangeData(items);
        }
      } catch {
        if (!alive) return;
        setRangeData([]);
      }
    }

    loadRange();
    const t = setInterval(loadRange, 15_000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [devices, selectedId, range]);

  // ✅ Alerts generation (store for Alerts page + bell badge)
  useEffect(() => {
    // only generate once we have *some* context (devices loaded)
    if (!devices.length) return;

    const nowISO = new Date().toISOString();
    const scope =
      selectedId === "home" ? "home" : `device:${selectedId}`;

    const newAlerts: AlertRecord[] = [];

    // Offline (dedupe: one per day per scope)
    const offline = latestIsOffline(latest, 120);
    if (offline) {
      newAlerts.push({
        id: `offline:${scope}:${ymd()}`,
        type: "offline",
        title: selectedId === "home" ? "No live data" : "Device offline",
        message:
          selectedId === "home"
            ? "No recent telemetry received. Check device power/network."
            : "No telemetry in the last 2 minutes.",
        created_at: nowISO,
        read: false,
      });
    }

    // High usage (dedupe: once per hour per scope) — ignore stale readings when offline
    const kw = latest && Number.isFinite(latest.power) ? latest.power / 1000 : null;
    if (!offline && kw !== null && kw > 2.5) {
      newAlerts.push({
        id: `high:${scope}:${ymdHour()}`,
        type: "high",
        title: "High usage detected",
        message: `Current load is ${kw.toFixed(2)} kW. Consider turning off heavy appliances.`,
        created_at: nowISO,
        read: false,
      });
    }

    if (newAlerts.length) upsertAlerts(newAlerts);
  }, [devices.length, latest, selectedId]);

  const isOffline = latestIsOffline(latest, 120);

  /** Per-meter today kWh / % of home for chip selector (all registered devices). */
  const deviceScopeChips = useMemo(() => {
    const total = today?.home_total_kwh ?? 0;
    return devices.map((d) => {
      const row = today?.devices.find((t) => t.device_id === d.id);
      const kwh = row?.today_kwh ?? 0;
      const pct = total > 0 ? Math.round((kwh / total) * 100) : 0;
      return {
        id: d.id,
        name: d.name,
        room: d.room,
        kwh,
        pct,
      };
    });
  }, [devices, today]);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-5">
        {devices.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center">
            <p className="text-slate-600 font-medium">No meters yet</p>
            <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
              Add a device and use its token on your ESP32 or synthetic data script to see live power,
              costs, and forecasts.
            </p>
            <button
              type="button"
              onClick={() => nav("/devices")}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-indigo-500"
            >
              <PlusCircle className="h-4 w-4" />
              Add your first device
            </button>
          </div>
        ) : (
          <>
            {/* Compact status — not mixed with device picker */}
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    isOffline ? "bg-amber-50" : "bg-emerald-50"
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      isOffline ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                    style={
                      !isOffline
                        ? { boxShadow: "0 0 0 4px rgba(16, 185, 129, 0.2)" }
                        : undefined
                    }
                  />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                    Live view
                  </p>
                  <p className="truncate text-base font-semibold text-slate-900">{statusText}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500 sm:border-0 sm:pt-0 sm:text-right">
                {today ? (
                  <>
                    <span className="font-medium text-slate-600">{today.date}</span>
                    <span className="hidden sm:inline text-slate-300">·</span>
                    <span>{today.tariff_pkr_per_kwh ?? 0} PKR/kWh</span>
                    <span className="hidden sm:inline text-slate-300">·</span>
                    <span className="truncate">{today.timezone || "Local time"}</span>
                  </>
                ) : (
                  <span>Loading totals…</span>
                )}
              </div>
            </div>

            {/* Device scope — own panel, horizontal scroll on small screens */}
            <section className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                    <Gauge className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Today by meter</h2>
                    <p className="text-xs text-slate-500">Select a meter to filter cards and chart below</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId("home");
                    setStatusText("All devices");
                  }}
                  className={`min-w-[148px] shrink-0 snap-start rounded-xl border px-3 py-2.5 text-left transition sm:min-w-[160px] ${
                    selectedId === "home"
                      ? "border-indigo-500 bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                      : "border-slate-200/90 bg-white/90 text-slate-800 hover:border-indigo-200 hover:bg-white"
                  }`}
                >
                  <span className="block text-sm font-semibold">All devices</span>
                  <span
                    className={`mt-0.5 block text-xs tabular-nums ${
                      selectedId === "home" ? "text-indigo-100" : "text-slate-500"
                    }`}
                  >
                    {today ? `${formatKwh(today.home_total_kwh)} kWh total` : "—"}
                  </span>
                </button>
                {deviceScopeChips.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(d.id);
                      setStatusText(d.name);
                    }}
                    className={`min-w-[148px] shrink-0 snap-start rounded-xl border px-3 py-2.5 text-left transition sm:min-w-[160px] ${
                      selectedId === d.id
                        ? "border-indigo-500 bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                        : "border-slate-200/90 bg-white/90 text-slate-800 hover:border-indigo-200 hover:bg-white"
                    }`}
                  >
                    <span className="block truncate text-sm font-semibold">
                      {d.name}
                      {d.room ? (
                        <span
                          className={`font-normal ${
                            selectedId === d.id ? "text-indigo-200" : "text-slate-400"
                          }`}
                        >
                          {" "}
                          · {d.room}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`mt-0.5 flex items-baseline justify-between gap-2 text-xs tabular-nums ${
                        selectedId === d.id ? "text-indigo-100" : "text-slate-500"
                      }`}
                    >
                      <span>{d.kwh.toFixed(2)} kWh</span>
                      <span className="font-medium opacity-90">{d.pct}%</span>
                    </span>
                    <div
                      className={`mt-2 h-1 overflow-hidden rounded-full ${
                        selectedId === d.id ? "bg-indigo-500/40" : "bg-slate-200"
                      }`}
                    >
                      <div
                        className={`h-full rounded-full transition-all ${
                          selectedId === d.id ? "bg-white" : "bg-indigo-400"
                        }`}
                        style={{ width: `${Math.min(100, d.pct)}%` }}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <div className={`grid gap-4 ${solarStatus ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        <StatCard
          title="Usage"
          value={
            isOffline
              ? "--"
              : latest
                ? formatKwFromWatts(latest.power)
                : "--"
          }
          subValue={
            isOffline
              ? latest
                ? `No live data · last ${formatKwFromWatts(latest.power)} (${formatReadingAge(latest.created_at)})`
                : "No telemetry yet"
              : `Today: ${formatKwh(todayKwh)} kWh`
          }
          icon={<Zap className="h-5 w-5" />}
          color="blue"
        />

        <StatCard
          title="Cost"
          value={formatPkr(todayCost)}
          subValue={today ? `Tariff: ${today.tariff_pkr_per_kwh || 0} PKR/kWh` : "—"}
          icon={<Wallet className="h-5 w-5" />}
          color="indigo"
        />

        {solarStatus && (
          <button
            type="button"
            onClick={() => nav("/solar")}
            className="text-left rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100/50 ring-1 ring-orange-200 shadow-sm p-5 hover:ring-orange-300 hover:ring-2 transition-all"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-slate-700 font-medium">Solar</div>
              <div className="text-orange-600"><Sun className="h-5 w-5" /></div>
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
              {solarStatus.solar_kw.toFixed(2)} kW
            </div>
            <div className="mt-2 text-xs text-slate-600 tabular-nums">
              Savings: {formatPkr(solarStatus.savings_today_pkr)}
            </div>
          </button>
        )}

        <StatCard
          title="Connection"
          value={isOffline ? "Offline" : "Online"}
          subValue={
            selectedId === "home"
              ? "Home live status"
              : selectedDevice
                ? selectedDevice.name
                : "Selected device"
          }
          icon={<Wifi className="h-5 w-5" />}
          color="green"
        />
      </div>

      <div>
        <UsageChart
          range={range}
          onRangeChange={setRange}
          readings={rangeData}
          title="Energy usage"
          subtitle={
            selectedId === "home"
              ? "Combined power from all meters"
              : selectedDevice
                ? selectedDevice.name
                : "—"
          }
          rightAction={
            <button
              type="button"
              onClick={() => nav("/monitoring")}
              className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-medium hover:bg-slate-800"
            >
              Open monitoring
            </button>
          }
        />
      </div>

      <p className="text-center text-xs text-slate-400 pb-2">
        Forecasts use your daily history —{" "}
        <Link to="/predictions" className="text-indigo-600 hover:underline font-medium">
          view ML forecast
        </Link>
      </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
