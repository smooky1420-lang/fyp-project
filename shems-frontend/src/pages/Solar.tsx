import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import StatCard from "../components/StatCard";
import SolarChart from "../components/SolarChart";
import { getSolarStatus, getSolarConfig, getSolarHistory, type SolarStatus, type SolarConfig, type SolarHistoryPoint, clearTokens } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { Sun, Cloud, Zap, TrendingUp, MapPin, Settings } from "lucide-react";
import type { ChartRange } from "../components/UsageChart";

function formatKw(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  return `${v.toFixed(2)} kW`;
}

function formatPkr(v: number | null | undefined) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "--";
  return `PKR ${v.toFixed(2)}`;
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
      { headers: { "User-Agent": "SHEMS" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address;
    if (!addr) return null;
    
    // Build location name from address components
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
        const [status, config] = await Promise.all([
          getSolarStatus(),
          getSolarConfig(),
        ]);

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
    const interval = setInterval(loadData, 30_000); // Poll every 30 seconds

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [nav]);

  // Load solar history for chart
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
        const limit = 20000;
        const history = await getSolarHistory(fromISO, undefined, limit);
        if (!alive) return;
        setSolarHistory(history);
      } catch (err: unknown) {
        if (!alive) return;
        console.error("Failed to load solar history:", err);
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

  // Fetch location name from coordinates
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

  if (loading) {
    return (
      <AppShell title="Solar">
        <div className="min-h-screen bg-slate-50 text-slate-900">
          <div className="p-6">
            <div className="max-w-5xl mx-auto">
              <div className="text-center text-slate-600">Loading solar data...</div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (error || !solarStatus || !solarConfig) {
    return (
      <AppShell title="Solar">
        <div className="min-h-screen bg-slate-50 text-slate-900">
          <div className="p-6">
            <div className="max-w-5xl mx-auto">
              <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-8 text-center">
                <Sun className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Solar Tracking Not Enabled</h2>
                <p className="text-slate-600 mb-6">{error || "Please enable solar tracking in Settings to view solar information."}</p>
                <button
                  type="button"
                  onClick={() => nav("/settings")}
                  className="rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-500 inline-flex items-center gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Go to Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const solarCoverage = solarStatus.home_kw > 0 
    ? ((solarStatus.solar_kw / solarStatus.home_kw) * 100).toFixed(1)
    : "0";

  return (
    <AppShell title="Solar">
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <div className="p-6">
          <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-semibold">Solar Energy</h1>
                <p className="mt-1 text-sm text-slate-600">
                  Real-time solar generation and savings tracking
                </p>
              </div>
              <button
                type="button"
                onClick={() => nav("/settings")}
                className="rounded-xl bg-slate-900 text-white px-4 py-2 text-sm font-semibold hover:bg-slate-800 inline-flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                Configure
              </button>
            </div>

            {/* Main Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
              <StatCard
                title="Solar Generation"
                value={formatKw(solarStatus.solar_kw)}
                subValue={`${solarCoverage}% of home usage`}
                icon={<Sun className="h-5 w-5" />}
              />

              <StatCard
                title="Home Usage"
                value={formatKw(solarStatus.home_kw)}
                subValue="Current load"
                icon={<Zap className="h-5 w-5" />}
              />

              <StatCard
                title="Grid Import"
                value={formatKw(solarStatus.grid_import_kw)}
                subValue={solarStatus.grid_import_kw > 0 ? "From grid" : "Self-sufficient"}
                icon={<TrendingUp className="h-5 w-5" />}
              />

              <StatCard
                title="Today's Savings"
                value={formatPkr(solarStatus.savings_today_pkr)}
                subValue="Estimated savings"
                icon={<TrendingUp className="h-5 w-5" />}
              />
            </div>

            {/* Detailed Information */}
            <div className="grid gap-4 md:grid-cols-2 mb-6">
              {/* System Configuration */}
              <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <Settings className="h-4 w-4 text-slate-500" />
                  System Configuration
                </h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Installed Capacity</span>
                    <span className="font-semibold tabular-nums">
                      {solarConfig.installed_capacity_kw.toFixed(2)} kW
                    </span>
                  </div>
                  {solarConfig.latitude !== null && solarConfig.longitude !== null && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        Location
                      </span>
                      <span className="font-semibold text-xs text-right max-w-[60%]">
                        {locationName || `${solarConfig.latitude.toFixed(4)}, ${solarConfig.longitude.toFixed(4)}`}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Status</span>
                    <span className="px-2 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-semibold">
                      Active
                    </span>
                  </div>
                </div>
              </div>

              {/* Weather & Conditions */}
              <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
                <h2 className="font-semibold mb-4 flex items-center gap-2">
                  <Cloud className="h-4 w-4 text-slate-500" />
                  Weather Conditions
                </h2>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Cloud Cover</span>
                    <span className="font-semibold tabular-nums">
                      {solarStatus.cloud_cover}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Data Source</span>
                    <span className="text-xs text-slate-500 capitalize">
                      {solarStatus.source}
                    </span>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-200">
                    <div className="text-xs text-slate-500">
                      Solar generation is estimated based on installed capacity, weather conditions, and time of day.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Energy Flow Visualization */}
            <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
              <h2 className="font-semibold mb-4">Energy Flow</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-slate-600">Solar Generation</span>
                      <span className="font-semibold tabular-nums text-sm">
                        {formatKw(solarStatus.solar_kw)}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-400 rounded-full transition-all"
                        style={{
                          width: `${Math.min(solarConfig.installed_capacity_kw > 0 ? (solarStatus.solar_kw / solarConfig.installed_capacity_kw) * 100 : 0, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-slate-600">Home Usage</span>
                      <span className="font-semibold tabular-nums text-sm">
                        {formatKw(solarStatus.home_kw)}
                      </span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{
                          width: `${Math.min((solarStatus.home_kw / Math.max(solarStatus.solar_kw, solarStatus.home_kw, 1)) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {solarStatus.grid_import_kw > 0 && (
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-slate-600">Grid Import</span>
                        <span className="font-semibold tabular-nums text-sm">
                          {formatKw(solarStatus.grid_import_kw)}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-400 rounded-full transition-all"
                          style={{
                            width: `${Math.min((solarStatus.grid_import_kw / Math.max(solarStatus.home_kw, 1)) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Solar History Chart */}
            <div className="mt-6">
              <SolarChart
                range={chartRange}
                onRangeChange={setChartRange}
                data={solarHistory}
                title="Solar Generation History"
              />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

