import { useMemo } from "react";
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
import type { TelemetryReading } from "../lib/api";

export type RangeKey = "1h" | "24h";

type ChartPoint = {
  x: string;   // "0m".."60m" or "0h".."24h"
  kw: number;  // avg kW in bucket (or summed kW for "all devices")
  iso: string; // bucket time (tooltip)
};

type ReadingsInput = TelemetryReading[] | TelemetryReading[][];

const fmtHMS = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
function fmtTooltipTime(iso: string) {
  return fmtHMS.format(new Date(iso));
}

/**
 * Fixed, equally spaced buckets:
 * - 1h: 5-minute steps => 0m..60m (13 points)
 * - 24h: 2-hour steps => 0h..24h (13 points)
 *
 * For a single device: bucket average kW
 * For multiple devices (TelemetryReading[][]): bucket average per-device then SUM across devices
 */
function buildFixedPowerSeries(readings: ReadingsInput, rangeKey: RangeKey): ChartPoint[] {
  const now = Date.now();

  const stepMs = rangeKey === "1h" ? 5 * 60_000 : 2 * 60 * 60_000;
  const totalMs = rangeKey === "1h" ? 60 * 60_000 : 24 * 60 * 60_000;
  const startMs = now - totalMs;

  const alignedStart = Math.floor(startMs / stepMs) * stepMs;

  // 13 bins => labels 0..12
  const labels: string[] = [];
  const centersIso: string[] = [];

  for (let i = 0; i <= 12; i++) {
    const t = alignedStart + i * stepMs;
    labels.push(rangeKey === "1h" ? `${i * 5}m` : `${i * 2}h`);
    centersIso.push(new Date(t).toISOString());
  }

  const isMulti = Array.isArray(readings) && readings.length > 0 && Array.isArray(readings[0]);
  const groups: TelemetryReading[][] = isMulti ? (readings as TelemetryReading[][]) : [readings as TelemetryReading[]];

  // For each device group, compute avg kW per bin
  const perDeviceBinKw: number[][] = [];

  for (const items of groups) {
    const sum = new Array<number>(13).fill(0);
    const cnt = new Array<number>(13).fill(0);

    for (const r of items) {
      const t = new Date(r.created_at).getTime();
      if (!Number.isFinite(t)) continue;
      if (t < alignedStart || t > alignedStart + 12 * stepMs) continue;

      const kw = r.power / 1000;
      if (!Number.isFinite(kw) || kw < 0) continue;

      const idx = Math.min(12, Math.max(0, Math.floor((t - alignedStart) / stepMs)));
      sum[idx] += kw;
      cnt[idx] += 1;
    }

    const avg = sum.map((s, i) => (cnt[i] ? s / cnt[i] : Number.NaN));
    perDeviceBinKw.push(avg);
  }

  // Merge bins:
  // - single: just use first device avg
  // - multi: sum across devices (ignoring NaNs)
  const merged: number[] = new Array<number>(13).fill(Number.NaN);

  for (let i = 0; i < 13; i++) {
    if (perDeviceBinKw.length === 1) {
      merged[i] = perDeviceBinKw[0][i];
    } else {
      let total = 0;
      let any = false;
      for (const dev of perDeviceBinKw) {
        const v = dev[i];
        if (Number.isFinite(v)) {
          total += v;
          any = true;
        }
      }
      merged[i] = any ? total : Number.NaN;
    }
  }

  return labels.map((lab, i) => ({
    x: lab,
    kw: Number.isFinite(merged[i]) ? Number(merged[i].toFixed(2)) : Number.NaN,
    iso: centersIso[i],
  }));
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: ChartPoint }>;
}) {
  if (!active || !payload?.length) return null;

  const p = payload[0]?.payload;
  if (!p) return null;

  const val = typeof p.kw === "number" && Number.isFinite(p.kw) ? p.kw : null;

  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 shadow-lg p-3">
      <div className="text-xs text-slate-500 tabular-nums mb-1">{fmtTooltipTime(p.iso)}</div>
      <div className="text-sm font-semibold text-slate-900 tabular-nums">
        {val !== null ? `${val.toFixed(2)} kW` : "No data"}
      </div>
    </div>
  );
}

function Toggle({
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

type Props = {
  title?: string;
  subtitle?: string;

  // ✅ single device: TelemetryReading[]
  // ✅ all devices: TelemetryReading[][]
  readings: ReadingsInput;

  rangeKey: RangeKey;
  onRangeChange?: (k: RangeKey) => void;

  heightClassName?: string; // e.g. "h-80"
};

export default function PowerUsageChart({
  title = "Energy Usage",
  subtitle = "Real-time consumption tracking",
  readings,
  rangeKey,
  onRangeChange,
  heightClassName = "h-80",
}: Props) {
  const points = buildFixedPowerSeries(readings, rangeKey);

  const maxKw = useMemo(() => {
    const values = points.map((p) => p.kw).filter((v) => Number.isFinite(v));
    return values.length > 0 ? Math.max(...values) : 0;
  }, [points]);

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-sm text-slate-600">
            {subtitle ? `${subtitle} • ` : ""}
            <span className="font-medium text-slate-700">Power (kW)</span>
          </div>
        </div>

        {onRangeChange ? (
          <div className="flex gap-2">
            <Toggle active={rangeKey === "1h"} onClick={() => onRangeChange("1h")}>
              Last 1h
            </Toggle>
            <Toggle active={rangeKey === "24h"} onClick={() => onRangeChange("24h")}>
              Last 24h
            </Toggle>
          </div>
        ) : null}
      </div>

      <div className={`mt-4 ${heightClassName}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 10, right: 15, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="kwFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4} />
                <stop offset="70%" stopColor="#22c55e" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} />

            <XAxis
              dataKey="x"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#64748b", fontSize: 12 }}
              interval={0}
            />

            <YAxis
              tickLine={false}
              axisLine={false}
              domain={[0, Math.max(0.01, maxKw * 1.2)]}
              tick={{ fill: "#64748b", fontSize: 12 }}
              tickFormatter={(v: number) => v.toFixed(1)}
              label={{ value: "kW", angle: -90, position: "insideLeft", fill: "#64748b" }}
            />

            <Tooltip content={<CustomTooltip />} />

            <Area
              type="monotone"
              dataKey="kw"
              stroke="none"
              fill="url(#kwFill)"
              isAnimationActive={false}
            />

            <Line
              type="monotone"
              dataKey="kw"
              stroke="#22c55e"
              strokeWidth={2.5}
              filter="url(#glow)"
              dot={false}
              activeDot={{
                r: 4,
                stroke: "#22c55e",
                strokeWidth: 1,
                fill: "#ffffff",
              }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
