import { useEffect, useMemo, useState } from "react";
import {
  listDevices,
  type Device,
  getLatestTelemetry,
  getTelemetryRange,
  type TelemetryReading,
  getTodaySummary,
  type TodaySummary,
  type TodaySummaryDevice,
  clearTokens,
} from "../lib/api";
import { useNavigate } from "react-router-dom";

import Navbar from "../components/Navbar";
import PowerUsageChart, { type RangeKey } from "../components/PowerUsageChart";
import { Zap, Activity, Gauge, Wallet } from "lucide-react";

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

function aggregateLatest(latests: TelemetryReading[]): TelemetryReading | null {
  if (!latests.length) return null;

  // Approx: avg voltage, sum current/power
  const vAvg = latests.reduce((s, r) => s + r.voltage, 0) / latests.length;
  const currentSum = latests.reduce((s, r) => s + r.current, 0);
  const powerSum = latests.reduce((s, r) => s + r.power, 0);

  return {
    ...latests[0],
    voltage: vAvg,
    current: currentSum,
    power: powerSum,
    energy_kwh: 0,
  };
}

export default function Dashboard() {
  const nav = useNavigate();

  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState<number | "all">("all");

  const [latest, setLatest] = useState<TelemetryReading | null>(null);
  const [range, setRange] = useState<TelemetryReading[] | TelemetryReading[][]>([]);
  const [status, setStatus] = useState<string>("Loading...");

  const [rangeKey, setRangeKey] = useState<RangeKey>("1h");
  const [today, setToday] = useState<TodaySummary | null>(null);

  const selected = useMemo(() => {
    if (selectedId === "all") return null;
    return devices.find((d) => d.id === selectedId) || null;
  }, [devices, selectedId]);

  const selectedToday: TodaySummaryDevice | null = useMemo(() => {
    if (!today || selectedId === "all") return null;
    return today.devices.find((x) => x.device_id === selectedId) ?? null;
  }, [today, selectedId]);

  const liveOk = status === "Live" || status === "Home (Live)";

  // Load devices
  useEffect(() => {
    (async () => {
      try {
        const d = await listDevices();
        setDevices(d);
        setSelectedId("all");
        setStatus(d.length ? "Home (All devices)" : "No devices yet. Add devices first.");
      } catch {
        clearTokens();
        nav("/login");
      }
    })();
  }, [nav]);

  // Poll today summary (slow)
  useEffect(() => {
    let alive = true;

    async function pollTodaySummary() {
      try {
        const s = await getTodaySummary();
        if (!alive) return;
        setToday(s);
      } catch {
        if (!alive) return;
        setToday(null);
      }
    }

    pollTodaySummary();
    const t = setInterval(pollTodaySummary, 30_000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // Poll live + chart depending on selection
  useEffect(() => {
    if (!devices.length) return;

    let alive = true;

    async function pollLatest() {
      try {
        if (selectedId === "all") {
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
          const agg = aggregateLatest(ok);

          setLatest(agg);
          setStatus(ok.length ? "Home (Live)" : "No readings yet (send telemetry).");
        } else {
          const r = await getLatestTelemetry(selectedId);
          if (!alive) return;
          setLatest(r);
          setStatus("Live");
        }
      } catch {
        if (!alive) return;
        setLatest(null);
        setStatus("No readings yet (send telemetry).");
      }
    }

    async function pollChart() {
      try {
        const fromISO = rangeKey === "1h" ? isoFromHoursAgo(1) : isoFromHoursAgo(24);
        const limit = rangeKey === "1h" ? 1800 : 4000;

        if (selectedId === "all") {
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
          setRange(lists); // ✅ chart supports TelemetryReading[][]
        } else {
          const items = await getTelemetryRange(selectedId, fromISO, undefined, limit);
          if (!alive) return;
          setRange(items); // ✅ single device
        }
      } catch {
        if (!alive) return;
        setRange([]);
      }
    }

    pollLatest();
    pollChart();

    const t1 = setInterval(pollLatest, 2000);
    const t2 = setInterval(pollChart, 8000);

    return () => {
      alive = false;
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [devices, selectedId, rangeKey]);

  // Dynamic totals (home vs selected device)
  const totalsLabel = selectedId === "all" ? "Home Today (kWh)" : "Device Today (kWh)";
  const totalsHint =
    selectedId === "all"
      ? "All devices"
      : selected
        ? selected.name
        : "Selected device";

  const costLabel = selectedId === "all" ? "Home Cost" : "Device Cost";
  const costHint = selectedId === "all" ? "Today total" : "Today (selected)";

  const totalsKwh = selectedId === "all" ? today?.home_total_kwh : selectedToday?.today_kwh;
  const totalsCost = selectedId === "all" ? today?.home_total_cost_pkr : selectedToday?.cost_pkr;

  const headerDeviceText =
    selectedId === "all"
      ? "Home (All devices)"
      : selected
        ? `${selected.name}${selected.room ? ` (${selected.room})` : ""}`
        : "Selected device";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Navbar />

      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          {/* Status + Device selector */}
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-sm text-slate-600">Status</div>
              <div className="font-semibold">{status}</div>
              <div className="text-xs text-slate-500 mt-1">
                {headerDeviceText}
                {today ? (
                  <> • Today: {today.date} • Tariff: {today.tariff_pkr_per_kwh || 0} PKR/kWh</>
                ) : (
                  <> • Today totals: loading…</>
                )}
              </div>
            </div>

            <div className="w-full md:w-80">
              <div className="text-sm text-slate-600">Device</div>
              <select
                className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                value={selectedId}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedId(v === "all" ? "all" : Number(v));
                }}
                disabled={devices.length === 0}
              >
                <option value="all">Home (All devices)</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.room ? `(${d.room})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cards */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card
              icon={<Gauge className="h-5 w-5" />}
              label="Voltage"
              value={latest ? `${latest.voltage.toFixed(1)} V` : "--"}
              badge={liveOk ? "Live" : undefined}
            />
            <Card
              icon={<Activity className="h-5 w-5" />}
              label="Current"
              value={latest ? `${latest.current.toFixed(2)} A` : "--"}
              badge={liveOk ? "Live" : undefined}
            />
            <Card
              icon={<Zap className="h-5 w-5" />}
              label="Power"
              value={latest ? `${latest.power.toFixed(1)} W` : "--"}
              badge={liveOk ? "Live" : undefined}
            />

            <Card
              icon={<Zap className="h-5 w-5" />}
              label={totalsLabel}
              value={formatKwh(totalsKwh)}
              hint={totalsHint}
            />
            <Card
              icon={<Wallet className="h-5 w-5" />}
              label={costLabel}
              value={formatPkr(totalsCost)}
              hint={costHint}
            />
          </div>

          {/* Chart */}
          <div className="mt-6">
            <div className="flex justify-end mb-3">
              <button
                onClick={() => nav("/monitoring")}
                className="rounded-xl bg-slate-900 text-white px-3 py-2 text-sm hover:bg-slate-800"
                type="button"
              >
                Live Monitoring
              </button>
            </div>

            <PowerUsageChart readings={range} rangeKey={rangeKey} onRangeChange={setRangeKey} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({
  icon,
  label,
  value,
  hint,
  badge,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  badge?: string;
}) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 shadow-sm">
      <div className="text-sm text-slate-600 flex items-center gap-2">
        {icon ? <span className="text-slate-500">{icon}</span> : null}
        <span>{label}</span>
      </div>

      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>

      {badge ? (
        <div className="mt-2 inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-medium text-emerald-600">{badge}</span>
        </div>
      ) : hint ? (
        <div className="mt-2 text-xs text-slate-500">{hint}</div>
      ) : null}
    </div>
  );
}
