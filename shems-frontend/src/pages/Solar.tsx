import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import SolarChart from "../components/SolarChart";
import {
  getSolarStatus,
  getSolarConfig,
  getSolarHistory,
  type SolarStatus,
  type SolarConfig,
  type SolarHistoryPoint,
  clearTokens,
} from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import {
  Sun,
  Cloud,
  Zap,
  TrendingUp,
  MapPin,
  Settings,
  Activity,
  Leaf,
  ArrowRight,
} from "lucide-react";
import type { ChartRange } from "../components/UsageChart";

function formatKwNum(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  return v.toFixed(2);
}

function formatPkrNum(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  return v.toFixed(0);
}

function isoFromHoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60_000).toISOString();
}

function isoFromDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();
}

async function getLocationName(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
      { headers: { "User-Agent": "WattGuard" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address;
    if (!addr) return null;

    const parts: string[] = [];
    if (addr.city || addr.town || addr.village) parts.push(addr.city || addr.town || addr.village);
    if (addr.state || addr.region) parts.push(addr.state || addr.region);
    if (addr.country) parts.push(addr.country);

    return parts.length > 0 ? parts.join(", ") : data.display_name || null;
  } catch {
    return null;
  }
}

export default function Solar() {
  const nav = useNavigate();
  const [solarStatus, setSolarStatus] = useState<SolarStatus | null>(null);
  const [solarConfig, setSolarConfig] = useState<SolarConfig | null>(null);
  const [solarHistory, setSolarHistory] = useState<SolarHistoryPoint[]>([]);
  const [chartRange, setChartRange] = useState<ChartRange>("day");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadData() {
      try {
        const [status, config] = await Promise.all([getSolarStatus(), getSolarConfig()]);

        if (!alive) return;

        if (!status.enabled) {
          setError("Solar tracking is not enabled. Please enable it in Settings.");
          setSolarStatus(null);
          setSolarConfig(config);
        } else {
          setSolarStatus(status);
          setSolarConfig(config);
          setError(null);
        }
      } catch (err: unknown) {
        if (!alive) return;
        const msg = getErrorMessage(err);
        if (msg?.includes("Not authenticated")) {
          clearTokens();
          nav("/login");
        } else {
          setError(msg || "Failed to load solar data");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadData();
    const interval = setInterval(loadData, 30_000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [nav]);

  useEffect(() => {
    if (!solarConfig?.enabled) return;

    let alive = true;

    function calcFromISO(r: ChartRange) {
      if (r === "hour") return isoFromHoursAgo(1);
      if (r === "day") return isoFromHoursAgo(24);
      if (r === "week") return isoFromDaysAgo(7);
      if (r === "month") return isoFromDaysAgo(30);
      return isoFromDaysAgo(365);
    }

    async function loadHistory() {
      try {
        const fromISO = calcFromISO(chartRange);
        const history = await getSolarHistory(fromISO, undefined, 20000);
        if (!alive) return;
        setSolarHistory(history);
      } catch {
        if (!alive) return;
        setSolarHistory([]);
      }
    }

    loadHistory();
    const t = setInterval(loadHistory, 15_000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [solarConfig?.enabled, chartRange]);

  useEffect(() => {
    if (!solarConfig?.latitude || !solarConfig?.longitude) {
      setLocationName(null);
      return;
    }

    let alive = true;
    getLocationName(solarConfig.latitude, solarConfig.longitude).then((name) => {
      if (alive) setLocationName(name);
    });

    return () => {
      alive = false;
    };
  }, [solarConfig?.latitude, solarConfig?.longitude]);

  const solarCoverage = useMemo(() => {
    if (!solarStatus || solarStatus.home_kw <= 0) return "0";
    return ((solarStatus.solar_kw / solarStatus.home_kw) * 100).toFixed(1);
  }, [solarStatus]);

  const selfSufficient = solarStatus != null && solarStatus.grid_import_kw <= 0;

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl py-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-600 animate-pulse">
            <Sun className="h-6 w-6" />
          </div>
          <p className="mt-4 text-sm text-slate-500">Loading solar data…</p>
        </div>
      </AppShell>
    );
  }

  if (error || !solarStatus || !solarConfig) {
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-3xl border border-dashed border-amber-200 bg-gradient-to-br from-amber-50 via-white to-slate-50 p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/30">
              <Sun className="h-7 w-7" />
            </div>
            <p className="mt-5 text-lg font-semibold text-slate-900">Solar tracking is off</p>
            <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              {error || "Enable solar in Settings with your panel capacity and location to see generation and savings."}
            </p>
            <button
              type="button"
              onClick={() => nav("/settings")}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-5 py-2.5 text-sm font-semibold shadow-md shadow-indigo-500/25 hover:bg-indigo-500 transition-colors"
            >
              <Settings className="h-4 w-4" />
              Open Settings
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  const capacityPct =
    solarConfig.installed_capacity_kw > 0
      ? Math.min((solarStatus.solar_kw / solarConfig.installed_capacity_kw) * 100, 100)
      : 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-amber-950 to-orange-950 text-white shadow-xl shadow-amber-900/20">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/4 h-48 w-48 rounded-full bg-orange-500/15 blur-3xl" />
          <div className="relative p-6 md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-amber-200">Solar overview</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Generation & savings</h1>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-400/30">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    Tracking active
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                      selfSufficient
                        ? "bg-emerald-500/20 text-emerald-100 ring-emerald-400/30"
                        : "bg-white/10 text-amber-100 ring-white/10"
                    }`}
                  >
                    {selfSufficient ? "Self-sufficient now" : "Drawing from grid"}
                  </span>
                  {solarStatus.weather_source && solarStatus.weather_source !== "openweather" && (
                    <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs text-amber-100 ring-1 ring-amber-400/30">
                      {solarStatus.weather_source.replace("_", " ")} weather
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => nav("/settings")}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 transition-colors"
              >
                <Settings className="h-4 w-4" />
                Configure
              </button>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-gradient-to-br from-amber-400/20 to-orange-500/20 p-4 ring-1 ring-amber-300/30 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-amber-100">Solar now</p>
                  <Sun className="h-4 w-4 text-amber-200" />
                </div>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {formatKwNum(solarStatus.solar_kw)}
                  <span className="ml-1 text-lg font-semibold text-amber-200">kW</span>
                </p>
                <p className="mt-1 text-xs text-amber-100/80">{solarCoverage}% of home load</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-amber-100">Home usage</p>
                  <Zap className="h-4 w-4 text-indigo-200" />
                </div>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {formatKwNum(solarStatus.home_kw)}
                  <span className="ml-1 text-lg font-semibold text-indigo-200">kW</span>
                </p>
                <p className="mt-1 text-xs text-indigo-200/80">Current load</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-amber-100">Grid import</p>
                  <TrendingUp className="h-4 w-4 text-orange-200" />
                </div>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {formatKwNum(solarStatus.grid_import_kw)}
                  <span className="ml-1 text-lg font-semibold text-orange-200">kW</span>
                </p>
                <p className="mt-1 text-xs text-orange-100/80">
                  {selfSufficient ? "No grid draw" : "Supplementing solar"}
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-amber-100">Saved today</p>
                  <Leaf className="h-4 w-4 text-emerald-200" />
                </div>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {formatPkrNum(solarStatus.savings_today_pkr)}
                  <span className="ml-1 text-lg font-semibold text-emerald-200">PKR</span>
                </p>
                <p className="mt-1 text-xs text-emerald-100/80">Estimated savings</p>
              </div>
            </div>
          </div>
        </section>

        {/* Config + weather */}
        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/25">
                <Settings className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">System setup</h2>
                <p className="text-xs text-slate-500">Your installed solar configuration</p>
              </div>
            </div>
            <dl className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <dt className="text-sm text-slate-600">Installed capacity</dt>
                <dd className="font-semibold tabular-nums text-slate-900">
                  {solarConfig.installed_capacity_kw.toFixed(2)} kW
                </dd>
              </div>
              {solarConfig.latitude !== null && solarConfig.longitude !== null && (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                  <dt className="flex items-center gap-1.5 text-sm text-slate-600">
                    <MapPin className="h-3.5 w-3.5" />
                    Location
                  </dt>
                  <dd className="text-right text-sm font-medium text-slate-900 max-w-[55%] truncate">
                    {locationName || `${solarConfig.latitude.toFixed(4)}, ${solarConfig.longitude.toFixed(4)}`}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <dt className="text-sm text-slate-600">Output vs capacity</dt>
                <dd className="font-semibold tabular-nums text-amber-600">{capacityPct.toFixed(0)}%</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500 text-white shadow-md shadow-sky-500/25">
                <Cloud className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">Weather</h2>
                <p className="text-xs text-slate-500">Conditions affecting generation</p>
              </div>
            </div>
            <dl className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <dt className="text-sm text-slate-600">Cloud cover</dt>
                <dd className="font-semibold tabular-nums text-slate-900">{solarStatus.cloud_cover}%</dd>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <dt className="text-sm text-slate-600">Data source</dt>
                <dd className="text-sm font-medium capitalize text-slate-900">{solarStatus.source}</dd>
              </div>
            </dl>
            {solarStatus.weather_source && solarStatus.weather_source !== "openweather" && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 leading-relaxed">
                Using {solarStatus.weather_source.replace("_", " ")} weather data.
                {solarStatus.weather_source === "estimate"
                  ? " Add OPENWEATHER_API_KEY in backend .env for live weather."
                  : ""}
              </div>
            )}
            <p className="mt-4 text-xs text-slate-500 leading-relaxed">
              Generation is estimated from panel capacity, cloud cover, and time of day.
            </p>
          </section>
        </div>

        {/* Energy flow */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/25">
              <Activity className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-slate-900">Energy flow</h2>
              <p className="text-xs text-slate-500">How solar, home load, and grid relate right now</p>
            </div>
          </div>
          <div className="space-y-5">
            <FlowBar
              label="Solar generation"
              valueKw={solarStatus.solar_kw}
              pct={capacityPct}
              colorClass="bg-amber-400"
              textClass="text-amber-700"
            />
            <FlowBar
              label="Home usage"
              valueKw={solarStatus.home_kw}
              pct={Math.min(
                (solarStatus.home_kw / Math.max(solarStatus.solar_kw, solarStatus.home_kw, 1)) * 100,
                100
              )}
              colorClass="bg-indigo-500"
              textClass="text-indigo-700"
            />
            {solarStatus.grid_import_kw > 0 && (
              <FlowBar
                label="Grid import"
                valueKw={solarStatus.grid_import_kw}
                pct={Math.min((solarStatus.grid_import_kw / Math.max(solarStatus.home_kw, 1)) * 100, 100)}
                colorClass="bg-red-400"
                textClass="text-red-600"
              />
            )}
          </div>
        </section>

        <SolarChart
          range={chartRange}
          onRangeChange={setChartRange}
          data={solarHistory}
          title="Generation history"
          subtitle="Solar, home load, and grid import over time"
        />

        <section className="rounded-2xl bg-slate-900 text-white p-5 ring-1 ring-slate-800">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Tip</p>
          <p className="mt-2 text-sm text-slate-200 leading-relaxed">
            Update panel capacity and GPS coordinates in{" "}
            <button
              type="button"
              onClick={() => nav("/settings")}
              className="inline-flex items-center gap-1 font-medium text-amber-300 hover:text-amber-200"
            >
              Settings
              <ArrowRight className="h-3.5 w-3.5" />
            </button>{" "}
            for more accurate estimates.
          </p>
        </section>

        <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-xs text-slate-400">
          <Activity className="h-3.5 w-3.5" />
          Live data refreshes every 30 seconds
        </p>
      </div>
    </AppShell>
  );
}

function FlowBar({
  label,
  valueKw,
  pct,
  colorClass,
  textClass,
}: {
  label: string;
  valueKw: number;
  pct: number;
  colorClass: string;
  textClass: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className={`text-sm font-bold tabular-nums ${textClass}`}>{valueKw.toFixed(2)} kW</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }}
        />
      </div>
    </div>
  );
}
