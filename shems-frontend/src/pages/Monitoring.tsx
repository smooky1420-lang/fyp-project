import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import {
  clearTokens,
  listDevices,
  type Device,
  getTelemetryRange,
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
  Brush,
} from "recharts";
import { Download, History, Loader2, Zap } from "lucide-react";
import StatCard from "../components/StatCard";

type Preset = "1h" | "24h" | "7d" | "custom";
type Metric = "power" | "voltage" | "current" | "energy";

function toLocalInputValue(d: Date) {
  // yyyy-MM-ddTHH:mm (for <input type="datetime-local" />)
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function fromLocalInputValue(v: string): Date | null {
  // v is "yyyy-MM-ddTHH:mm"
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
  t: number; // ms
  time: string;
  voltage: number;
  current: number;
  power: number;
  energy_kwh: number;
};

export default function Monitoring() {
  const nav = useNavigate();

  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState<number | "home" | null>(null);

  const [preset, setPreset] = useState<Preset>("24h");
  const [fromLocal, setFromLocal] = useState<string>(() => toLocalInputValue(new Date(Date.now() - 24 * 60 * 60_000)));
  const [toLocal, setToLocal] = useState<string>(() => toLocalInputValue(new Date()));
  const [metric, setMetric] = useState<Metric>("power");

  const [items, setItems] = useState<TelemetryReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Load devices on mount
  useEffect(() => {
    (async () => {
      try {
        const d = await listDevices();
        setDevices(d);
        setDeviceId("home"); // Default to home total
      } catch {
        clearTokens();
        nav("/login");
      }
    })();
  }, [nav]);

  // Apply preset -> updates from/to local
  useEffect(() => {
    if (preset === "custom") return;
    const now = new Date();

    if (preset === "1h") setFromLocal(toLocalInputValue(new Date(now.getTime() - 60 * 60_000)));
    if (preset === "24h") setFromLocal(toLocalInputValue(new Date(now.getTime() - 24 * 60 * 60_000)));
    if (preset === "7d") setFromLocal(toLocalInputValue(new Date(now.getTime() - 7 * 24 * 60 * 60_000)));

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
    return undefined;
  }, [preset, fromLocal]);

  const toISO = useMemo(() => {
    if (preset === "custom") {
      const d = fromLocalInputValue(toLocal);
      return d ? d.toISOString() : undefined;
    }
    return undefined; // "now"
  }, [preset, toLocal]);

  async function aggregateHomeTotal(allReadings: TelemetryReading[][]): Promise<TelemetryReading[]> {
    if (!allReadings.length || !allReadings[0]?.length) return [];

    // Create a map of timestamp -> aggregated reading
    const timeMap = new Map<number, {
      count: number;
      voltage: number;
      current: number;
      power: number;
      energy_kwh: number;
      created_at: string;
    }>();

    // Collect all readings and group by time (rounded to nearest 5 seconds for aggregation)
    for (const deviceReadings of allReadings) {
      for (const reading of deviceReadings) {
        const t = new Date(reading.created_at).getTime();
        const rounded = Math.round(t / 5000) * 5000; // Round to 5-second buckets

        if (!timeMap.has(rounded)) {
          timeMap.set(rounded, {
            count: 0,
            voltage: 0,
            current: 0,
            power: 0,
            energy_kwh: 0,
            created_at: reading.created_at,
          });
        }

        const agg = timeMap.get(rounded)!;
        agg.count++;
        agg.voltage += reading.voltage;
        agg.current += reading.current;
        agg.power += reading.power;
        agg.energy_kwh += reading.energy_kwh;
      }
    }

    // Convert to TelemetryReading format
    const aggregated: TelemetryReading[] = Array.from(timeMap.entries())
      .map(([t, agg]) => ({
        id: t, // Use timestamp as ID
        device: 0, // Placeholder for home total
        voltage: agg.voltage / agg.count, // Average voltage
        current: agg.current, // Sum current
        power: agg.power, // Sum power
        energy_kwh: agg.energy_kwh, // Sum energy
        created_at: new Date(t).toISOString(),
      }))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return aggregated;
  }

  async function fetchData(opts?: { appendOlder?: boolean }) {
    if (!deviceId) return;
    setLoading(true);
    setMsg(null);

    try {
      let data: TelemetryReading[];

      if (deviceId === "home") {
        // Fetch from all devices and aggregate
        const allPromises = devices.map((d) => getTelemetryRange(d.id, fromISO, toISO, 2000));
        const allReadings = await Promise.all(allPromises);
        data = await aggregateHomeTotal(allReadings);
      } else {
        data = await getTelemetryRange(deviceId, fromISO, toISO, 2000);
      }

      // Range API already returns ascending time
      if (opts?.appendOlder && items.length) {
        // merge unique by id (avoid duplicates)
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

  // Auto fetch whenever filters change
  useEffect(() => {
    if (!deviceId || (deviceId === "home" && !devices.length)) return;
    fetchData().catch(() => void 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, fromISO, toISO, devices.length]);

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
    if (deviceId === "home") return { id: 0, name: "Home Total", room: "" };
    return devices.find((d) => d.id === deviceId) ?? null;
  }, [devices, deviceId]);

  const summary = useMemo(() => {
    if (!items.length) return null;

    const powers = items.map((x) => x.power).filter((v) => Number.isFinite(v));
    const avg = powers.reduce((a, b) => a + b, 0) / Math.max(1, powers.length);
    const min = Math.min(...powers);
    const max = Math.max(...powers);

    const used = calcUsageKwh(items);

    return {
      avgW: avg,
      minW: min,
      maxW: max,
      usedKwh: used,
      first: items[0]?.created_at,
      last: items[items.length - 1]?.created_at,
    };
  }, [items]);

  const yLabel = metric === "power" ? "W" : metric === "voltage" ? "V" : metric === "current" ? "A" : "kWh";
  const lineKey = metric === "power" ? "power" : metric === "voltage" ? "voltage" : metric === "current" ? "current" : "energy_kwh";
  const lineName = metric === "power" ? "Power" : metric === "voltage" ? "Voltage" : metric === "current" ? "Current" : "Energy (cumulative)";

  const latestFirst = useMemo(() => [...items].reverse(), [items]);

  const metricColors: Record<Metric, string> = {
    power: "#22c55e",
    voltage: "#3b82f6",
    current: "#f59e0b",
    energy: "#8b5cf6",
  };

  return (
    <AppShell title="Monitoring">
      {/* Device Selector & Quick Actions */}
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm text-slate-600">Device</div>
            <select
              className="mt-1 w-full sm:w-96 rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              value={deviceId === "home" ? "home" : deviceId ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setDeviceId(val === "home" ? "home" : Number(val));
              }}
              disabled={!devices.length}
            >
              <option value="home">🏠 Home Total (All Sensors)</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.room ? `(${d.room})` : ""}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
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
            }}
            className="rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-500 inline-flex items-center gap-2 disabled:opacity-60"
            disabled={!items.length}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Time Range & Metric Selector */}
      <div className="mt-5 rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <PresetBtn active={preset === "1h"} onClick={() => setPreset("1h")}>1h</PresetBtn>
            <PresetBtn active={preset === "24h"} onClick={() => setPreset("24h")}>24h</PresetBtn>
            <PresetBtn active={preset === "7d"} onClick={() => setPreset("7d")}>7d</PresetBtn>
            <PresetBtn active={preset === "custom"} onClick={() => setPreset("custom")}>Custom</PresetBtn>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <Tab active={metric === "power"} onClick={() => setMetric("power")}>Power</Tab>
            <Tab active={metric === "voltage"} onClick={() => setMetric("voltage")}>Voltage</Tab>
            <Tab active={metric === "current"} onClick={() => setMetric("current")}>Current</Tab>
            <Tab active={metric === "energy"} onClick={() => setMetric("energy")}>Energy</Tab>
          </div>
        </div>

        {preset === "custom" && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-sm text-slate-600">From</div>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                value={fromLocal}
                onChange={(e) => setFromLocal(e.target.value)}
              />
            </div>
            <div>
              <div className="text-sm text-slate-600">To</div>
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                value={toLocal}
                onChange={(e) => setToLocal(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2">
            <button
            type="button"
            onClick={() => fetchData().catch(() => void 0)}
            className="rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-500 inline-flex items-center gap-2 disabled:opacity-60"
            disabled={loading || deviceId === null}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
            Refresh
          </button>
          {msg && (
            <div className="text-sm text-red-600">{msg}</div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mt-5 grid gap-4 md:grid-cols-4">
        <StatCard
          title="Avg Power"
          value={summary ? `${summary.avgW.toFixed(1)} W` : "--"}
          subValue="Average"
          icon={<Zap className="h-5 w-5" />}
          color="green"
        />
        <StatCard
          title="Range"
          value={summary ? `${summary.minW.toFixed(1)} - ${summary.maxW.toFixed(1)} W` : "--"}
          subValue="Min - Max"
          icon={<Zap className="h-5 w-5" />}
          color="blue"
        />
        <StatCard
          title="Usage"
          value={summary ? `${summary.usedKwh.toFixed(3)} kWh` : "--"}
          subValue="Total in range"
          icon={<Zap className="h-5 w-5" />}
          color="orange"
        />
        <StatCard
          title="Readings"
          value={items.length ? String(items.length) : "--"}
          subValue="Data points"
          icon={<Zap className="h-5 w-5" />}
          color="purple"
        />
      </div>

      {/* Chart */}
      <div className="mt-5 rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
        <div className="font-semibold mb-1">{lineName}</div>
        <div className="text-sm text-slate-600 mb-4">
          {selectedDevice ? selectedDevice.name : "—"} • {preset === "custom" ? "Custom" : preset.toUpperCase()}
        </div>

        <div className="h-96">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 15, left: 10, bottom: 60 }}>
                <defs>
                  <linearGradient id={`${metric}Fill`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={metricColors[metric]} stopOpacity={0.4} />
                    <stop offset="70%" stopColor={metricColors[metric]} stopOpacity={0.12} />
                    <stop offset="100%" stopColor={metricColors[metric]} stopOpacity={0.02} />
                  </linearGradient>
                  <filter id={`${metric}Glow`}>
                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v: number) => fmtShort.format(new Date(v))}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  tickFormatter={(v: number) => (metric === "energy" ? v.toFixed(3) : v.toFixed(1))}
                  label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "#64748b" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    padding: "12px",
                  }}
                  labelFormatter={(v: unknown) => {
                    if (typeof v === "number") return fmtLong.format(new Date(v));
                    return "";
                  }}
                  formatter={(v: unknown) => {
                    if (typeof v === "number") {
                      const n = metric === "energy" ? v.toFixed(4) : v.toFixed(2);
                      return [n, yLabel];
                    }
                    return [String(v), yLabel];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey={lineKey}
                  stroke="none"
                  fill={`url(#${metric}Fill)`}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey={lineKey}
                  stroke={metricColors[metric]}
                  strokeWidth={2.5}
                  filter={`url(#${metric}Glow)`}
                  dot={false}
                  activeDot={{
                    r: 4,
                    stroke: metricColors[metric],
                    strokeWidth: 1,
                    fill: "#ffffff",
                  }}
                  isAnimationActive={false}
                />
                <Brush
                  dataKey="t"
                  height={28}
                  travellerWidth={10}
                  tickFormatter={(v: number) => fmtShort.format(new Date(v))}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full grid place-items-center text-slate-500">
              {loading ? "Loading chart..." : "No data for this range. Try a larger window or send telemetry."}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="mt-5 rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
        <div className="font-semibold mb-1">Recent Readings</div>
        <div className="text-sm text-slate-600 mb-4">
          Latest first (showing up to 100 rows)
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600 border-b border-slate-200">
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Voltage (V)</th>
                <th className="py-2 pr-4">Current (A)</th>
                <th className="py-2 pr-4">Power (W)</th>
                <th className="py-2 pr-4">Energy (kWh)</th>
              </tr>
            </thead>
            <tbody>
              {latestFirst.slice(0, 100).map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 pr-4 tabular-nums text-xs">{fmtShort.format(new Date(r.created_at))}</td>
                  <td className="py-2 pr-4 tabular-nums">{r.voltage.toFixed(1)}</td>
                  <td className="py-2 pr-4 tabular-nums">{r.current.toFixed(2)}</td>
                  <td className="py-2 pr-4 tabular-nums">{r.power.toFixed(1)}</td>
                  <td className="py-2 pr-4 tabular-nums">{r.energy_kwh.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {items.length > 100 && (
          <div className="mt-3 text-xs text-slate-500">
            Showing 100 of {items.length} readings. Export CSV for complete data.
          </div>
        )}
      </div>
    </AppShell>
  );
}

function PresetBtn({
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
      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function Tab({
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
      className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
