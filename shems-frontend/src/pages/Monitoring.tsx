import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
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
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Brush,
} from "recharts";
import { Download, Filter, History, Loader2 } from "lucide-react";

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
  const [deviceId, setDeviceId] = useState<number | null>(null);

  const [preset, setPreset] = useState<Preset>("24h");
  const [fromLocal, setFromLocal] = useState<string>(() => toLocalInputValue(new Date(Date.now() - 24 * 60 * 60_000)));
  const [toLocal, setToLocal] = useState<string>(() => toLocalInputValue(new Date()));

  const [limit, setLimit] = useState<number>(2000);
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
        setDeviceId(d[0]?.id ?? null);
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

  async function fetchData(opts?: { appendOlder?: boolean }) {
    if (!deviceId) return;
    setLoading(true);
    setMsg(null);

    try {
      const data = await getTelemetryRange(deviceId, fromISO, toISO, limit);

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
    if (!deviceId) return;
    fetchData().catch(() => void 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, fromISO, toISO, limit]);

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

  const selectedDevice = useMemo(
    () => devices.find((d) => d.id === deviceId) ?? null,
    [devices, deviceId]
  );

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Navbar />

      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">Live Monitoring</h1>
              <p className="mt-1 text-sm text-slate-600">
                View history, filter by time, and explore the data with zoom.
              </p>
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
              className="rounded-xl bg-slate-900 text-white px-3 py-2 text-sm hover:bg-slate-800 inline-flex items-center gap-2"
              disabled={!items.length}
            >
              <Download className="h-4 w-4" />
              Download CSV
            </button>
          </div>

          {/* Filters */}
          <div className="mt-4 rounded-2xl bg-white ring-1 ring-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Filter className="h-4 w-4 text-slate-500" />
              Filters
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm text-slate-600">Device</div>
                <select
                  className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={deviceId ?? ""}
                  onChange={(e) => setDeviceId(Number(e.target.value))}
                  disabled={!devices.length}
                >
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.room ? `(${d.room})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-sm text-slate-600">Preset</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <PresetBtn active={preset === "1h"} onClick={() => setPreset("1h")}>Last 1h</PresetBtn>
                  <PresetBtn active={preset === "24h"} onClick={() => setPreset("24h")}>Last 24h</PresetBtn>
                  <PresetBtn active={preset === "7d"} onClick={() => setPreset("7d")}>Last 7d</PresetBtn>
                  <PresetBtn active={preset === "custom"} onClick={() => setPreset("custom")}>Custom</PresetBtn>
                </div>
              </div>

              <div>
                <div className="text-sm text-slate-600">From</div>
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                  value={fromLocal}
                  onChange={(e) => setFromLocal(e.target.value)}
                  disabled={preset !== "custom"}
                />
              </div>

              <div>
                <div className="text-sm text-slate-600">To</div>
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                  value={toLocal}
                  onChange={(e) => setToLocal(e.target.value)}
                  disabled={preset !== "custom"}
                />
              </div>

              <div>
                <div className="text-sm text-slate-600">Limit</div>
                <select
                  className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                >
                  <option value={500}>500</option>
                  <option value={1000}>1000</option>
                  <option value={2000}>2000</option>
                </select>
                <div className="text-xs text-slate-500 mt-1">
                  If you need more, use “Load older”.
                </div>
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => fetchData().catch(() => void 0)}
                  className="rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-500 inline-flex items-center gap-2 disabled:opacity-60"
                  disabled={loading || !deviceId}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
                  Refresh
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    // Load older by expanding the "from" backwards by the same preset window
                    if (!deviceId) return;

                    const windowMs =
                      preset === "1h" ? 60 * 60_000 :
                      preset === "24h" ? 24 * 60 * 60_000 :
                      preset === "7d" ? 7 * 24 * 60 * 60_000 :
                      24 * 60 * 60_000;

                    const currentFrom = fromISO ? new Date(fromISO).getTime() : Date.now() - windowMs;
                    const olderFromISO = new Date(currentFrom - windowMs).toISOString();

                    // fetch older slice up to currentFrom (avoid overlap) by using "to"
                    setLoading(true);
                    setMsg(null);
                    try {
                      const older = await getTelemetryRange(deviceId, olderFromISO, new Date(currentFrom).toISOString(), limit);
                      const existing = new Set(items.map((x) => x.id));
                      const merged = [...older.filter((x) => !existing.has(x.id)), ...items];
                      setItems(merged);

                      // also update inputs for custom view so user sees expanded window
                      setPreset("custom");
                      setFromLocal(toLocalInputValue(new Date(currentFrom - windowMs)));
                      setToLocal(toLocalInputValue(new Date()));
                    } catch (err: unknown) {
                      setMsg(getErrorMessage(err) || "Failed to load older data");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="rounded-xl bg-white text-slate-700 px-4 py-2 text-sm font-semibold ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60"
                  disabled={loading || !items.length}
                >
                  Load older
                </button>
              </div>
            </div>

            {/* Metric tabs */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Tab active={metric === "power"} onClick={() => setMetric("power")}>Power</Tab>
              <Tab active={metric === "voltage"} onClick={() => setMetric("voltage")}>Voltage</Tab>
              <Tab active={metric === "current"} onClick={() => setMetric("current")}>Current</Tab>
              <Tab active={metric === "energy"} onClick={() => setMetric("energy")}>Energy</Tab>
            </div>

            {msg ? (
              <div className="mt-4 rounded-xl bg-red-50 ring-1 ring-red-200 p-3 text-sm text-red-700">
                {msg}
              </div>
            ) : null}
          </div>

          {/* Summary */}
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <MiniCard label="Avg Power" value={summary ? `${summary.avgW.toFixed(1)} W` : "--"} />
            <MiniCard label="Min / Max" value={summary ? `${summary.minW.toFixed(1)} / ${summary.maxW.toFixed(1)} W` : "--"} />
            <MiniCard label="kWh Used (range)" value={summary ? `${summary.usedKwh.toFixed(4)} kWh` : "--"} />
            <MiniCard label="Readings" value={items.length ? String(items.length) : "--"} />
          </div>

          {/* Chart */}
          <div className="mt-4 rounded-2xl bg-white ring-1 ring-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{lineName}</div>
                <div className="text-sm text-slate-600">
                  {selectedDevice ? selectedDevice.name : "—"} • {preset === "custom" ? "Custom" : preset.toUpperCase()}
                  {summary?.first && summary?.last ? (
                    <> • {fmtLong.format(new Date(summary.first))} → {fmtLong.format(new Date(summary.last))}</>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-4 h-96">
              {chartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(v: number) => fmtShort.format(new Date(v))}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => (metric === "energy" ? v.toFixed(3) : v.toFixed(1))}
                      label={{ value: yLabel, angle: -90, position: "insideLeft" }}
                    />
                    <Tooltip
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
                    <Line
                      type="monotone"
                      dataKey={lineKey}
                      strokeWidth={2}
                      dot={false}
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
          <div className="mt-4 rounded-2xl bg-white ring-1 ring-slate-200 p-5 shadow-sm">
            <div className="font-semibold">Readings</div>
            <div className="text-sm text-slate-600 mt-1">
              Showing latest first (most recent on top)
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600">
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">Voltage (V)</th>
                    <th className="py-2 pr-4">Current (A)</th>
                    <th className="py-2 pr-4">Power (W)</th>
                    <th className="py-2 pr-4">Energy (kWh)</th>
                  </tr>
                </thead>
                <tbody>
                  {latestFirst.slice(0, 200).map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="py-2 pr-4 tabular-nums">{fmtLong.format(new Date(r.created_at))}</td>
                      <td className="py-2 pr-4 tabular-nums">{r.voltage.toFixed(1)}</td>
                      <td className="py-2 pr-4 tabular-nums">{r.current.toFixed(2)}</td>
                      <td className="py-2 pr-4 tabular-nums">{r.power.toFixed(1)}</td>
                      <td className="py-2 pr-4 tabular-nums">{r.energy_kwh.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {items.length > 200 ? (
              <div className="mt-3 text-xs text-slate-500">
                Table shows first 200 rows for performance. Download CSV for full.
              </div>
            ) : null}
          </div>

          <div className="h-10" />
        </div>
      </div>
    </div>
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
      className={`rounded-xl px-3 py-2 text-sm ring-1 transition ${
        active
          ? "bg-slate-900 text-white ring-slate-900"
          : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
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
      className={`rounded-xl px-3 py-2 text-sm ring-1 transition ${
        active
          ? "bg-indigo-600 text-white ring-indigo-600"
          : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function MiniCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 shadow-sm">
      <div className="text-sm text-slate-600">{label}</div>
      <div className="mt-2 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
