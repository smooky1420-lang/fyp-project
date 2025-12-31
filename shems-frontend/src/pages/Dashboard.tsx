import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
} from "../lib/api";

import { Zap, Wallet, Wifi } from "lucide-react";

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

export default function Dashboard() {
  const nav = useNavigate();

  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState<number | "home">("home");

  const [latest, setLatest] = useState<TelemetryReading | null>(null);
  const [rangeData, setRangeData] = useState<TelemetryReading[] | TelemetryReading[][]>([]);
  const [today, setToday] = useState<TodaySummary | null>(null);

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

  // Load devices
  useEffect(() => {
    (async () => {
      try {
        const d = await listDevices();
        setDevices(d);
        setSelectedId("home");
        setStatusText(d.length ? "Home Total selected" : "No devices yet. Add devices first.");
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
          setStatusText(ok.length ? "Home (Live)" : "No readings yet.");
        } else {
          const r = await getLatestTelemetry(selectedId);
          if (!alive) return;
          setLatest(r);
          setStatusText("Live");
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

    // High usage (dedupe: once per hour per scope)
    const kw = latest && Number.isFinite(latest.power) ? latest.power / 1000 : null;
    if (kw !== null && kw > 2.5) {
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

  return (
    <AppShell title="Dashboard">
      {/* Device selector */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm text-slate-600">Status</div>
            <div className="font-semibold">{statusText}</div>
            <div className="text-xs text-slate-500 mt-1">
              {today ? (
                <>Today: {today.date} • Tariff: {today.tariff_pkr_per_kwh || 0} PKR/kWh</>
              ) : (
                <>Today totals: loading…</>
              )}
            </div>
          </div>

          <div className="w-full sm:w-96">
            <div className="text-sm text-slate-600">Device</div>
            <select
              className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              value={selectedId}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedId(v === "home" ? "home" : Number(v));
              }}
              disabled={!devices.length}
            >
              <option value="home">Home Total</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.room ? `(${d.room})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <StatCard
          title="Usage"
          value={latest ? formatKwFromWatts(latest.power) : "--"}
          subValue={`Today: ${formatKwh(todayKwh)} kWh`}
          icon={<Zap className="h-5 w-5" />}
        />

        <StatCard
          title="Cost"
          value={formatPkr(todayCost)}
          subValue={today ? `Tariff: ${today.tariff_pkr_per_kwh || 0} PKR/kWh` : "—"}
          icon={<Wallet className="h-5 w-5" />}
        />

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
        />
      </div>

      {/* Chart */}
      <div className="mt-5">
        <UsageChart
          range={range}
          onRangeChange={setRange}
          readings={rangeData}
          title="Energy Usage"
          subtitle={selectedId === "home" ? "Home Total" : selectedDevice ? selectedDevice.name : "—"}
          rightAction={
            <button
              type="button"
              onClick={() => nav("/monitoring")}
              className="rounded-xl bg-slate-900 text-white px-3 py-2 text-sm hover:bg-slate-800"
            >
              Live Monitoring
            </button>
          }
        />
      </div>
    </AppShell>
  );
}
