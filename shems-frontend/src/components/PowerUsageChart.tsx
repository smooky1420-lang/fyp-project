import {
  ResponsiveContainer,
  LineChart,
  Line,
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
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-xs text-slate-500 tabular-nums">{fmtTooltipTime(p.iso)}</div>
      <div className="text-sm font-semibold text-slate-900 tabular-nums">
        {val !== null ? `${val.toFixed(2)} kW` : "No data"}
      </div>
    </div>
  );
}

function SmallButton({
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
      className={`rounded-xl px-3 py-2 text-sm ring-1 ${
        active
          ? "bg-emerald-500 text-white ring-emerald-500"
          : "bg-slate-100 text-slate-700 ring-slate-100 hover:bg-slate-200"
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

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold">{title}</div>
          {subtitle ? <div className="text-sm text-slate-600">{subtitle}</div> : null}
        </div>

        {onRangeChange ? (
          <div className="flex gap-2">
            <SmallButton active={rangeKey === "1h"} onClick={() => onRangeChange("1h")}>
              Last 1h
            </SmallButton>
            <SmallButton active={rangeKey === "24h"} onClick={() => onRangeChange("24h")}>
              Last 24h
            </SmallButton>
          </div>
        ) : null}
      </div>

      <div className={`mt-4 ${heightClassName}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical horizontal />

            <XAxis
              dataKey="x"
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
              tick={{ fill: "#64748b", fontSize: 12 }}
              interval={0} // show ALL ticks (0m..60m or 0h..24h)
            />

            <YAxis
              width={40}
              tickLine={false}
              axisLine={{ stroke: "#e2e8f0" }}
              domain={[0, "auto"]}
              tick={{ fill: "#64748b", fontSize: 12 }}
              tickFormatter={(v: number) => v.toFixed(1)}
              label={{ value: "kW", angle: -90, position: "insideLeft", fill: "#64748b" }}
            />

            <Tooltip content={<CustomTooltip />} />

            <Line
              type="monotone"
              dataKey="kw"
              stroke="#22c55e"
              strokeWidth={2.5}
              dot={true}
              activeDot={{ stroke: "#22c55e", r: 4 }}
              connectNulls={false}
              isAnimationActive
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
