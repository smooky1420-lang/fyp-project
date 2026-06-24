import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import {
  clearTokens,
  listDevices,
  type Device,
  getTelemetryRange,
  getLatestTelemetry,
  type TelemetryReading,
} from "../lib/api";
import { getErrorMessage } from "../lib/errors";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  Download,
  Loader2,
  Zap,
  Gauge,
  Activity,
  Home,
  BarChart3,
  RefreshCw,
  PlusCircle,
  Wifi,
} from "lucide-react";

type Preset = "1h" | "24h" | "7d" | "30d" | "custom";
type Metric = "power" | "voltage" | "current" | "energy";

const PRESET_LABELS: Record<Preset, string> = {
  "1h": "Last hour",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  custom: "Custom range",
};

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function fromLocalInputValue(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isoFromNowMinus(ms: number) {
  return new Date(Date.now() - ms).toISOString();
}

function calcUsageKwh(readings: TelemetryReading[]): number {
  if (readings.length < 2) return 0;

  const sorted = [...readings].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  let total = 0;
  for (let i = 1; i < sorted.length; i++) {
    const delta = sorted[i].energy_kwh - sorted[i - 1].energy_kwh;
    if (Number.isFinite(delta) && delta > 0) total += delta;
  }
  return total;
}

function latestIsOffline(latest: TelemetryReading | null, offlineSeconds = 120) {
  if (!latest) return true;
  const t = new Date(latest.created_at).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > offlineSeconds * 1000;
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const escape = (val: string | number) => {
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const fmtShort = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const fmtLong = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

type ChartPoint = {
  t: number;
  time: string;
  voltage: number;
  current: number;
  power: number;
  energy_kwh: number;
};

const metricColors: Record<Metric, string> = {
  power: "#6366f1",
  voltage: "#3b82f6",
  current: "#f59e0b",
  energy: "#8b5cf6",
};

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20";

export default function Monitoring() {
  const nav = useNavigate();

  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState<number | "home" | null>(null);
  const [liveLatest, setLiveLatest] = useState<TelemetryReading | null>(null);

  const [preset, setPreset] = useState<Preset>("24h");
  const [fromLocal, setFromLocal] = useState<string>(() =>
    toLocalInputValue(new Date(Date.now() - 24 * 60 * 60_000))
  );
  const [toLocal, setToLocal] = useState<string>(() => toLocalInputValue(new Date()));
  const [metric, setMetric] = useState<Metric>("power");

  const [items, setItems] = useState<TelemetryReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tableOpen, setTableOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const d = await listDevices();
        setDevices(d);
        setDeviceId("home");
      } catch {
        clearTokens();
        nav("/login");
      }
    })();
  }, [nav]);

  useEffect(() => {
    if (preset === "custom") return;
    const now = new Date();

    if (preset === "1h") setFromLocal(toLocalInputValue(new Date(now.getTime() - 60 * 60_000)));
    if (preset === "24h") setFromLocal(toLocalInputValue(new Date(now.getTime() - 24 * 60 * 60_000)));
    if (preset === "7d") setFromLocal(toLocalInputValue(new Date(now.getTime() - 7 * 24 * 60 * 60_000)));
    if (preset === "30d") setFromLocal(toLocalInputValue(new Date(now.getTime() - 30 * 24 * 60 * 60_000)));

    setToLocal(toLocalInputValue(now));
  }, [preset]);

  const fromISO = useMemo(() => {
    if (preset === "custom") {
      const d = fromLocalInputValue(fromLocal);
      return d ? d.toISOString() : undefined;
    }
    if (preset === "1h") return isoFromNowMinus(60 * 60_000);
    if (preset === "24h") return isoFromNowMinus(24 * 60 * 60_000);
    if (preset === "7d") return isoFromNowMinus(7 * 24 * 60 * 60_000);
    if (preset === "30d") return isoFromNowMinus(30 * 24 * 60 * 60_000);
    return undefined;
  }, [preset, fromLocal]);

  const toISO = useMemo(() => {
    if (preset === "custom") {
      const d = fromLocalInputValue(toLocal);
      return d ? d.toISOString() : undefined;
    }
    return undefined;
  }, [preset, toLocal]);

  async function aggregateHomeTotal(allReadings: TelemetryReading[][]): Promise<TelemetryReading[]> {
    if (!allReadings.length) return [];

    const flat = allReadings.flat();
    if (!flat.length) return [];

    const timeMap = new Map<
      number,
      {
        count: number;
        voltage: number;
        current: number;
        power: number;
        created_at: string;
      }
    >();

    for (const reading of flat) {
      const t = new Date(reading.created_at).getTime();
      const rounded = Math.round(t / 5000) * 5000;

      if (!timeMap.has(rounded)) {
        timeMap.set(rounded, {
          count: 0,
          voltage: 0,
          current: 0,
          power: 0,
          created_at: reading.created_at,
        });
      }

      const agg = timeMap.get(rounded)!;
      agg.count++;
      agg.voltage += reading.voltage;
      agg.current += reading.current;
      agg.power += reading.power;
    }

    const perDeviceLast = new Map<number, number>();
    let cumulativeHomeKwh = 0;
    const energyByBucket = new Map<number, number>();

    const sorted = [...flat].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    for (const reading of sorted) {
      const last = perDeviceLast.get(reading.device);
      if (last !== undefined) {
        const delta = reading.energy_kwh - last;
        if (Number.isFinite(delta) && delta > 0) cumulativeHomeKwh += delta;
      }
      perDeviceLast.set(reading.device, reading.energy_kwh);
      const rounded = Math.round(new Date(reading.created_at).getTime() / 5000) * 5000;
      energyByBucket.set(rounded, cumulativeHomeKwh);
    }

    return Array.from(timeMap.entries())
      .map(([t, agg]) => ({
        id: t,
        device: 0,
        voltage: agg.voltage / agg.count,
        current: agg.current,
        power: agg.power,
        energy_kwh: energyByBucket.get(t) ?? 0,
        created_at: new Date(t).toISOString(),
      }))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  async function fetchData(opts?: { appendOlder?: boolean }) {
    if (!deviceId) return;
    setLoading(true);
    setMsg(null);

    try {
      let data: TelemetryReading[];

      if (deviceId === "home") {
        const allPromises = devices.map((d) => getTelemetryRange(d.id, fromISO, toISO, 2000));
        const allReadings = await Promise.all(allPromises);
        data = await aggregateHomeTotal(allReadings);
      } else {
        data = await getTelemetryRange(deviceId, fromISO, toISO, 2000);
      }

      if (opts?.appendOlder && items.length) {
        const existing = new Set(items.map((x) => x.id));
        const merged = [...data.filter((x) => !existing.has(x.id)), ...items];
        setItems(merged);
      } else {
        setItems(data);
      }
    } catch (err: unknown) {
      setMsg(getErrorMessage(err) || "Failed to load telemetry");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!deviceId || (deviceId === "home" && !devices.length)) return;
    fetchData().catch(() => void 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, fromISO, toISO, devices.length]);

  useEffect(() => {
    if (!deviceId || (deviceId === "home" && !devices.length)) return;
    let alive = true;

    async function pollLive() {
      const id = deviceId;
      if (!id) return;
      try {
        if (id === "home") {
          const readings = await Promise.all(
            devices.map(async (d) => {
              try {
                return await getLatestTelemetry(d.id);
              } catch {
                return null;
              }
            })
          );
          const valid = readings.filter((r): r is TelemetryReading => r != null);
          if (!alive || !valid.length) {
            if (alive) setLiveLatest(null);
            return;
          }
          const newest = valid.reduce((a, b) =>
            new Date(a.created_at) > new Date(b.created_at) ? a : b
          );
          const totalPower = valid.reduce((s, r) => s + (r.power ?? 0), 0);
          setLiveLatest({ ...newest, power: totalPower });
        } else {
          const r = await getLatestTelemetry(id);
          if (alive) setLiveLatest(r);
        }
      } catch {
        if (alive) setLiveLatest(null);
      }
    }

    pollLive();
    const t = setInterval(pollLive, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [deviceId, devices]);

  const chartData: ChartPoint[] = useMemo(() => {
    return items.map((r) => {
      const t = new Date(r.created_at).getTime();
      return {
        t,
        time: fmtShort.format(new Date(r.created_at)),
        voltage: r.voltage,
        current: r.current,
        power: r.power,
        energy_kwh: r.energy_kwh,
      };
    });
  }, [items]);

  const selectedDevice = useMemo(() => {
    if (deviceId === "home") return { id: 0, name: "All devices", room: "" };
    return devices.find((d) => d.id === deviceId) ?? null;
  }, [devices, deviceId]);

  const summary = useMemo(() => {
    if (!items.length) return null;

    const powers = items.map((x) => x.power).filter((v) => Number.isFinite(v));
    const avg = powers.reduce((a, b) => a + b, 0) / Math.max(1, powers.length);
    const min = Math.min(...powers);
    const max = Math.max(...powers);

    return {
      avgW: avg,
      minW: min,
      maxW: max,
      usedKwh: calcUsageKwh(items),
    };
  }, [items]);

  const yLabel = metric === "power" ? "W" : metric === "voltage" ? "V" : metric === "current" ? "A" : "kWh";
  const lineKey =
    metric === "power" ? "power" : metric === "voltage" ? "voltage" : metric === "current" ? "current" : "energy_kwh";
  const lineName =
    metric === "power"
      ? "Power"
      : metric === "voltage"
        ? "Voltage"
        : metric === "current"
          ? "Current"
          : deviceId === "home"
            ? "Home energy"
            : "Energy";

  const latestFirst = useMemo(() => [...items].reverse(), [items]);
  const isLive = !latestIsOffline(liveLatest);
  const liveKw = liveLatest?.power != null ? liveLatest.power / 1000 : null;

  function exportCsv() {
    const rows = items.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      voltage: r.voltage,
      current: r.current,
      power: r.power,
      energy_kwh: r.energy_kwh,
    }));
    const name = selectedDevice?.name?.replace(/\s+/g, "_") || "device";
    downloadCsv(`telemetry_${name}.csv`, rows);
  }

  if (!devices.length && deviceId !== null) {
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-3xl border border-dashed border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-slate-50 p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/30">
              <Activity className="h-7 w-7" />
            </div>
            <p className="mt-5 text-lg font-semibold text-slate-900">No meters to monitor</p>
            <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              Add a device first, then come back here for detailed charts and history.
            </p>
            <button
              type="button"
              onClick={() => nav("/devices")}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-5 py-2.5 text-sm font-semibold shadow-md shadow-indigo-500/25 hover:bg-indigo-500 transition-colors"
            >
              <PlusCircle className="h-4 w-4" />
              Add a device
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        {msg && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {msg}
            <button
              type="button"
              className="ml-3 font-medium text-red-700 underline hover:no-underline"
              onClick={() => setMsg(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900 text-white shadow-xl shadow-indigo-900/20">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/4 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" />
          <div className="relative p-6 md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-indigo-200">Live monitoring</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
                  {selectedDevice?.name ?? "Monitoring"}
                </h1>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                      isLive
                        ? "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/30"
                        : "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/30"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${isLive ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`}
                    />
                    {isLive ? "Live" : "Waiting for data"}
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-indigo-100 ring-1 ring-white/10">
                    {PRESET_LABELS[preset]}
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-indigo-100 ring-1 ring-white/10">
                    {lineName}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fetchData().catch(() => void 0)}
                  disabled={loading || deviceId === null}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={!items.length}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-950 shadow-sm hover:bg-indigo-50 disabled:opacity-50 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Live power</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {liveKw != null ? liveKw.toFixed(2) : "—"}
                  <span className="ml-1 text-lg font-semibold text-indigo-200">kW</span>
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Avg in range</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {summary ? (summary.avgW / 1000).toFixed(2) : "—"}
                  <span className="ml-1 text-lg font-semibold text-indigo-200">kW</span>
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Used in range</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {summary ? summary.usedKwh.toFixed(2) : "—"}
                  <span className="ml-1 text-lg font-semibold text-indigo-200">kWh</span>
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Peak power</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {summary ? (summary.maxW / 1000).toFixed(2) : "—"}
                  <span className="ml-1 text-lg font-semibold text-indigo-200">kW</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Meter picker */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/25">
              <Gauge className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-slate-900">Select meter</h2>
              <p className="text-xs text-slate-500">Choose what to chart below</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <button
              type="button"
              onClick={() => setDeviceId("home")}
              className={`rounded-xl border p-4 text-left transition-all ${
                deviceId === "home"
                  ? "border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                  : "border-slate-200 bg-slate-50/50 hover:border-indigo-200 hover:bg-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <Home className={`h-4 w-4 ${deviceId === "home" ? "text-indigo-100" : "text-slate-500"}`} />
                <p className="text-sm font-semibold">All devices</p>
              </div>
              <p className={`mt-1 text-xs ${deviceId === "home" ? "text-indigo-200" : "text-slate-500"}`}>
                Combined home load
              </p>
            </button>
            {devices.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDeviceId(d.id)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  deviceId === d.id
                    ? "border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                    : "border-slate-200 bg-slate-50/50 hover:border-indigo-200 hover:bg-white"
                }`}
              >
                <p className="truncate text-sm font-semibold">{d.name}</p>
                <p className={`mt-1 text-xs truncate ${deviceId === d.id ? "text-indigo-200" : "text-slate-500"}`}>
                  {d.room || "No room"} · {d.device_type || "Meter"}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* Filters */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Time range</p>
              <div className="flex flex-wrap gap-2">
                {(["1h", "24h", "7d", "30d", "custom"] as Preset[]).map((p) => (
                  <FilterPill key={p} active={preset === p} onClick={() => setPreset(p)}>
                    {p === "custom" ? "Custom" : p}
                  </FilterPill>
                ))}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Metric</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["power", "Power"],
                    ["voltage", "Voltage"],
                    ["current", "Current"],
                    ["energy", "Energy"],
                  ] as const
                ).map(([key, label]) => (
                  <FilterPill key={key} active={metric === key} onClick={() => setMetric(key)}>
                    {label}
                  </FilterPill>
                ))}
              </div>
            </div>
          </div>

          {preset === "custom" && (
            <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-slate-600">From</label>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={fromLocal}
                  onChange={(e) => setFromLocal(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">To</label>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={toLocal}
                  onChange={(e) => setToLocal(e.target.value)}
                />
              </div>
            </div>
          )}
        </section>

        {/* Chart */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
          <div className="mb-4 flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-md"
              style={{ backgroundColor: metricColors[metric], boxShadow: `0 4px 14px ${metricColors[metric]}40` }}
            >
              <BarChart3 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-slate-900">{lineName} over time</h2>
              <p className="text-xs text-slate-500">
                {items.length
                  ? `${items.length.toLocaleString()} readings · ${summary ? `${summary.minW.toFixed(0)}–${summary.maxW.toFixed(0)} W range` : ""}`
                  : "No data for this selection yet"}
              </p>
            </div>
          </div>

          <div className="h-80 sm:h-96">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 15, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`monitoring-${metric}Fill`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={metricColors[metric]} stopOpacity={0.35} />
                      <stop offset="70%" stopColor={metricColors[metric]} stopOpacity={0.1} />
                      <stop offset="100%" stopColor={metricColors[metric]} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(v: number) => fmtShort.format(new Date(v))}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748b", fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    tickFormatter={(v: number) => (metric === "energy" ? v.toFixed(2) : v.toFixed(0))}
                    label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e2e8f0",
                      borderRadius: "12px",
                      padding: "10px 12px",
                      fontSize: "13px",
                    }}
                    labelFormatter={(v: unknown) => {
                      if (typeof v === "number") return fmtLong.format(new Date(v));
                      return "";
                    }}
                    formatter={(v: unknown) => {
                      if (typeof v === "number") {
                        const n = metric === "energy" ? v.toFixed(3) : v.toFixed(1);
                        return [`${n} ${yLabel}`, lineName];
                      }
                      return [String(v), lineName];
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={lineKey}
                    stroke="none"
                    fill={`url(#monitoring-${metric}Fill)`}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={lineKey}
                    stroke={metricColors[metric]}
                    strokeWidth={2.25}
                    dot={false}
                    activeDot={{
                      r: 5,
                      stroke: metricColors[metric],
                      strokeWidth: 2,
                      fill: "#ffffff",
                    }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center px-6">
                {loading ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                    <p className="mt-3 text-sm text-slate-500">Loading chart…</p>
                  </>
                ) : (
                  <>
                    <Wifi className="h-8 w-8 text-slate-300" />
                    <p className="mt-3 text-sm font-medium text-slate-700">No readings in this range</p>
                    <p className="mt-1 text-xs text-slate-500 max-w-sm">
                      Try a longer time window or check that your meter is sending data.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Raw readings — collapsed by default for a cleaner page */}
        <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80 overflow-hidden">
          <button
            type="button"
            onClick={() => setTableOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/80 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Zap className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">Raw readings</h2>
                <p className="text-xs text-slate-500">
                  {items.length ? `${Math.min(100, items.length)} of ${items.length} rows` : "No data"}
                </p>
              </div>
            </div>
            <span className="text-xs font-medium text-indigo-600">{tableOpen ? "Hide" : "Show"}</span>
          </button>

          {tableOpen && items.length > 0 && (
            <div className="border-t border-slate-100 px-5 pb-5">
              <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Voltage</th>
                      <th className="px-4 py-3">Current</th>
                      <th className="px-4 py-3">Power</th>
                      <th className="px-4 py-3">Energy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {latestFirst.slice(0, 100).map((r) => (
                      <tr key={r.id} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="px-4 py-2.5 tabular-nums text-xs text-slate-600">
                          {fmtLong.format(new Date(r.created_at))}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums">{r.voltage.toFixed(1)} V</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.current.toFixed(2)} A</td>
                        <td className="px-4 py-2.5 tabular-nums font-medium text-slate-900">{r.power.toFixed(1)} W</td>
                        <td className="px-4 py-2.5 tabular-nums">{r.energy_kwh.toFixed(4)} kWh</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {items.length > 100 && (
                <p className="mt-3 text-xs text-slate-500">
                  Export CSV for the full dataset ({items.length} rows).
                </p>
              )}
            </div>
          )}
        </section>

        <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-xs text-slate-400">
          <Activity className="h-3.5 w-3.5" />
          Live power updates every few seconds · chart reloads when filters change
        </p>
      </div>
    </AppShell>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-3.5 py-2 text-sm font-medium ring-1 transition ${
        active
          ? "bg-indigo-600 text-white ring-indigo-600 shadow-sm shadow-indigo-500/20"
          : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}
