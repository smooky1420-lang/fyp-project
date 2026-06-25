import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import UsageChart, { type ChartRange } from "../components/UsageChart";

import { refreshAlerts } from "../lib/alerts";

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
  getRecommendations,
  type Recommendation,
} from "../lib/api";

import { Zap, Sun, PlusCircle, Gauge, Sparkles, ArrowRight, Activity, FileText, Cpu, TrendingUp } from "lucide-react";

/** Revert UI: replace this file with `Dashboard.legacy.tsx` */

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
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

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

  // Refresh stored alerts for bell badge + desktop notifications
  useEffect(() => {
    if (!devices.length) return;

    const tick = () => {
      refreshAlerts().catch(() => void 0);
    };
    tick();
    const id = window.setInterval(tick, 10_000);
    return () => window.clearInterval(id);
  }, [devices.length]);

  // Top recommendations on dashboard
  useEffect(() => {
    if (!devices.length) return;
    getRecommendations()
      .then((res) => setRecommendations(res.recommendations.slice(0, 3)))
      .catch(() => setRecommendations([]));
  }, [devices.length]);

  const isOffline = latestIsOffline(latest, 120);

  const livePowerKw = useMemo(() => {
    if (isOffline || !latest?.power) return null;
    return latest.power / 1000;
  }, [isOffline, latest]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }, []);

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
      <div className="mx-auto max-w-6xl space-y-6">
        {devices.length === 0 ? (
          <div className="relative overflow-hidden rounded-3xl border border-dashed border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-slate-50 p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/30">
              <Zap className="h-7 w-7" />
            </div>
            <p className="mt-5 text-lg font-semibold text-slate-900">No meters connected yet</p>
            <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              Add a device in WattGuard and link your smart meter to see live power, daily costs, and forecasts.
            </p>
            <button
              type="button"
              onClick={() => nav("/devices")}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-5 py-2.5 text-sm font-semibold shadow-md shadow-indigo-500/25 hover:bg-indigo-500 transition-colors"
            >
              <PlusCircle className="h-4 w-4" />
              Add your first device
            </button>
          </div>
        ) : (
          <>
            {/* Hero — today's headline */}
            <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900 text-white shadow-xl shadow-indigo-900/20">
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 left-1/4 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" />
              <div className="relative p-6 md:p-8">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-indigo-200">{greeting}</p>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Energy overview</h1>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                          isOffline
                            ? "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/30"
                            : "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/30"
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${isOffline ? "bg-amber-400" : "bg-emerald-400 animate-pulse"}`}
                        />
                        {isOffline ? "Waiting for live data" : "Live"}
                      </span>
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-indigo-100 ring-1 ring-white/10">
                        {statusText}
                      </span>
                      {today?.date && (
                        <span className="text-xs text-indigo-300/90">{today.date}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {[
                      { to: "/monitoring", label: "Monitoring", icon: <Activity className="h-3.5 w-3.5" /> },
                      { to: "/reports", label: "Reports", icon: <FileText className="h-3.5 w-3.5" /> },
                      { to: "/devices", label: "Devices", icon: <Cpu className="h-3.5 w-3.5" /> },
                      { to: "/predictions", label: "Forecast", icon: <TrendingUp className="h-3.5 w-3.5" /> },
                    ].map((link) => (
                      <button
                        key={link.to}
                        type="button"
                        onClick={() => nav(link.to)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-white ring-1 ring-white/15 hover:bg-white/15 transition-colors"
                      >
                        {link.icon}
                        {link.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                    <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Today&apos;s usage</p>
                    <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                      {formatKwh(todayKwh)}
                      <span className="ml-1 text-lg font-semibold text-indigo-200">kWh</span>
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                    <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Today&apos;s cost</p>
                    <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                      {todayCost != null && Number.isFinite(todayCost)
                        ? todayCost.toFixed(0)
                        : "--"}
                      <span className="ml-1 text-lg font-semibold text-indigo-200">PKR</span>
                    </p>
                    {today && (
                      <p className="mt-1 text-xs text-indigo-300/80">@ {today.tariff_pkr_per_kwh} PKR/kWh</p>
                    )}
                  </div>
                  <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                    <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Live power</p>
                    <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                      {livePowerKw != null ? livePowerKw.toFixed(2) : "--"}
                      <span className="ml-1 text-lg font-semibold text-indigo-200">kW</span>
                    </p>
                    <p className="mt-1 text-xs text-indigo-300/80 truncate">
                      {isOffline && latest
                        ? `Last seen ${formatReadingAge(latest.created_at)}`
                        : selectedId === "home"
                          ? "All meters combined"
                          : selectedDevice?.name ?? "Selected meter"}
                    </p>
                  </div>
                  {solarStatus ? (
                    <button
                      type="button"
                      onClick={() => nav("/solar")}
                      className="rounded-2xl bg-gradient-to-br from-amber-400/20 to-orange-500/20 p-4 text-left ring-1 ring-amber-300/30 hover:ring-amber-200/50 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium uppercase tracking-wider text-amber-100">Solar now</p>
                        <Sun className="h-4 w-4 text-amber-200" />
                      </div>
                      <p className="mt-2 text-3xl font-bold tabular-nums">{solarStatus.solar_kw.toFixed(2)} kW</p>
                      <p className="mt-1 text-xs text-amber-100/80">
                        Saving {formatPkr(solarStatus.savings_today_pkr)} today
                      </p>
                    </button>
                  ) : (
                    <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                      <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Meters</p>
                      <p className="mt-2 text-3xl font-bold tabular-nums">{devices.length}</p>
                      <p className="mt-1 text-xs text-indigo-300/80">Connected to your home</p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Meter picker */}
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/25">
                    <Gauge className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-semibold text-slate-900">Meters</h2>
                    <p className="text-xs text-slate-500">Filter dashboard by device</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId("home");
                    setStatusText("All devices");
                  }}
                  className={`rounded-xl border p-4 text-left transition-all ${
                    selectedId === "home"
                      ? "border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 scale-[1.02]"
                      : "border-slate-200 bg-slate-50/50 hover:border-indigo-200 hover:bg-white"
                  }`}
                >
                  <p className="text-sm font-semibold">All devices</p>
                  <p className={`mt-1 text-2xl font-bold tabular-nums ${selectedId === "home" ? "text-white" : "text-slate-900"}`}>
                    {today ? formatKwh(today.home_total_kwh) : "—"}
                    <span className={`ml-1 text-sm font-medium ${selectedId === "home" ? "text-indigo-100" : "text-slate-500"}`}>kWh</span>
                  </p>
                </button>
                {deviceScopeChips.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(d.id);
                      setStatusText(d.name);
                    }}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      selectedId === d.id
                        ? "border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 scale-[1.02]"
                        : "border-slate-200 bg-slate-50/50 hover:border-indigo-200 hover:bg-white"
                    }`}
                  >
                    <p className="truncate text-sm font-semibold">
                      {d.name}
                      {d.room && (
                        <span className={selectedId === d.id ? "font-normal text-indigo-200" : "font-normal text-slate-400"}>
                          {" "}· {d.room}
                        </span>
                      )}
                    </p>
                    <p className={`mt-1 text-2xl font-bold tabular-nums ${selectedId === d.id ? "text-white" : "text-slate-900"}`}>
                      {d.kwh.toFixed(2)}
                      <span className={`ml-1 text-sm font-medium ${selectedId === d.id ? "text-indigo-100" : "text-slate-500"}`}>kWh</span>
                    </p>
                    <div className={`mt-3 h-1.5 overflow-hidden rounded-full ${selectedId === d.id ? "bg-indigo-400/40" : "bg-slate-200"}`}>
                      <div
                        className={`h-full rounded-full transition-all ${selectedId === d.id ? "bg-white" : "bg-indigo-500"}`}
                        style={{ width: `${Math.min(100, d.pct)}%` }}
                      />
                    </div>
                    <p className={`mt-1 text-xs ${selectedId === d.id ? "text-indigo-100" : "text-slate-500"}`}>
                      {d.pct}% of home today
                    </p>
                  </button>
                ))}
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <UsageChart
                  range={range}
                  onRangeChange={setRange}
                  readings={rangeData}
                  title="Power over time"
                  subtitle={
                    selectedId === "home"
                      ? "Combined load from all meters"
                      : selectedDevice?.name ?? "—"
                  }
                  rightAction={
                    <button
                      type="button"
                      onClick={() => nav("/monitoring")}
                      className="rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-medium shadow-sm shadow-indigo-500/20 hover:bg-indigo-500 transition-colors"
                    >
                      Full monitoring
                    </button>
                  }
                />
              </div>

              <div className="space-y-4">
                {recommendations.length > 0 ? (
                  <section className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 h-fit">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-amber-500" />
                        Energy tips
                      </h2>
                      <Link
                        to="/predictions"
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-500 inline-flex items-center gap-1"
                      >
                        More
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                    <ul className="space-y-3 list-none p-0 m-0">
                      {recommendations.map((rec, idx) => (
                        <li
                          key={`${rec.title}-${idx}`}
                          className="rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50 to-indigo-50/30 px-4 py-3"
                        >
                          <div className="text-sm font-medium text-slate-900">{rec.title}</div>
                          <p className="mt-1 text-xs text-slate-600 leading-relaxed line-clamp-3">{rec.description}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : (
                  <section className="rounded-2xl bg-gradient-to-br from-indigo-50 to-white ring-1 ring-indigo-100 p-5">
                    <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-indigo-600" />
                      Usage forecast
                    </h2>
                    <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                      See predicted usage for the next week based on your history.
                    </p>
                    <Link
                      to="/predictions"
                      className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-500"
                    >
                      Open forecast
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </section>
                )}

                <section className="rounded-2xl bg-slate-900 text-white p-5 ring-1 ring-slate-800">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Quick tip</p>
                  <p className="mt-2 text-sm text-slate-200 leading-relaxed">
                    Tap a meter above to focus the chart on one circuit, or keep <strong className="text-white">All devices</strong> for whole-home view.
                  </p>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
