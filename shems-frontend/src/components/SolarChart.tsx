import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  Legend,
} from "recharts";
import type { SolarHistoryPoint } from "../lib/api";
import type { ChartRange } from "./UsageChart";

type SolarChartProps = {
  range: ChartRange;
  onRangeChange: (r: ChartRange) => void;
  data: SolarHistoryPoint[];
  title?: string;
};

const fmtTime = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const fmtDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const fmtMonth = new Intl.DateTimeFormat("en-GB", { month: "short" });

function safeTime(iso: string) {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfHour(d: Date) {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x;
}

function startOfWeekMonday(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

function endOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setMonth(x.getMonth() + 1, 1);
  x.setDate(1);
  return x;
}

function startOfYear(d: Date) {
  const x = startOfDay(d);
  x.setMonth(0, 1);
  return x;
}

type Bucket = {
  start: Date;
  end: Date;
  label: string;
  meta: string;
};

function buildBuckets(range: ChartRange): Bucket[] {
  const now = new Date();

  if (range === "hour") {
    const start = startOfHour(now);
    const stepMs = 5 * 60_000;
    return Array.from({ length: 12 }, (_, i) => {
      const a = new Date(start.getTime() + i * stepMs);
      const b = new Date(start.getTime() + (i + 1) * stepMs);
      return {
        start: a,
        end: b,
        label: `${String(a.getMinutes()).padStart(2, "0")}`,
        meta: `${fmtTime.format(a)} - ${fmtTime.format(b)}`,
      };
    });
  }

  if (range === "day") {
    const start = startOfDay(now);
    const stepMs = 60 * 60_000;
    return Array.from({ length: 24 }, (_, i) => {
      const a = new Date(start.getTime() + i * stepMs);
      const b = new Date(start.getTime() + (i + 1) * stepMs);
      return {
        start: a,
        end: b,
        label: fmtTime.format(a),
        meta: `${fmtTime.format(a)} - ${fmtTime.format(b)}`,
      };
    });
  }

  if (range === "week") {
    const start = startOfWeekMonday(now);
    return Array.from({ length: 7 }, (_, i) => {
      const a = new Date(start);
      a.setDate(start.getDate() + i);
      const b = new Date(a);
      b.setDate(a.getDate() + 1);
      return {
        start: a,
        end: b,
        label: a.toLocaleDateString("en-GB", { weekday: "short" }),
        meta: fmtDate.format(a),
      };
    });
  }

  if (range === "month") {
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    const days = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60_000));
    return Array.from({ length: days }, (_, i) => {
      const a = new Date(start);
      a.setDate(start.getDate() + i);
      const b = new Date(a);
      b.setDate(a.getDate() + 1);
      return {
        start: a,
        end: b,
        label: String(a.getDate()),
        meta: fmtDate.format(a),
      };
    });
  }

  const start = startOfYear(now);
  return Array.from({ length: 12 }, (_, i) => {
    const a = new Date(start);
    a.setMonth(i, 1);
    const b = new Date(a);
    b.setMonth(a.getMonth() + 1, 1);
    return {
      start: a,
      end: b,
      label: fmtMonth.format(a),
      meta: `${fmtMonth.format(a)} ${a.getFullYear()}`,
    };
  });
}

function aggregateIntoBuckets(data: SolarHistoryPoint[], buckets: Bucket[]) {
  const sorted = [...data].sort(
    (a, b) => (safeTime(a.timestamp) ?? 0) - (safeTime(b.timestamp) ?? 0)
  );

  const solar = new Array<number>(buckets.length).fill(0);
  const home = new Array<number>(buckets.length).fill(0);
  const grid = new Array<number>(buckets.length).fill(0);
  const counts = new Array<number>(buckets.length).fill(0);

  for (const point of sorted) {
    const t = safeTime(point.timestamp);
    if (t === null) continue;

    for (let i = 0; i < buckets.length; i++) {
      const a = buckets[i].start.getTime();
      const b = buckets[i].end.getTime();
      if (t >= a && t < b) {
        solar[i] += point.solar_kw;
        home[i] += point.home_kw;
        grid[i] += point.grid_import_kw;
        counts[i]++;
        break;
      }
    }
  }

  // Average the values
  return buckets.map((b, i) => ({
    label: b.label,
    meta: b.meta,
    solar_kw: counts[i] > 0 ? solar[i] / counts[i] : 0,
    home_kw: counts[i] > 0 ? home[i] / counts[i] : 0,
    grid_kw: counts[i] > 0 ? grid[i] / counts[i] : 0,
  }));
}

type CustomTooltipProps = {
  active?: boolean;
  payload?: {
    name?: string;
    value?: number;
    payload?: {
      meta?: string;
      solar_kw?: number;
      home_kw?: number;
      grid_kw?: number;
    };
  }[];
};

function TooltipContent({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const raw = payload[0].payload;
  const meta = raw?.meta ?? "";

  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 shadow-sm px-3 py-2">
      <div className="text-xs text-slate-600 mb-2">{meta}</div>
      {raw?.solar_kw !== undefined && (
        <div className="text-sm font-semibold tabular-nums text-yellow-600">
          Solar: {raw.solar_kw.toFixed(2)} kW
        </div>
      )}
      {raw?.home_kw !== undefined && (
        <div className="text-sm font-semibold tabular-nums text-indigo-600">
          Home: {raw.home_kw.toFixed(2)} kW
        </div>
      )}
      {raw?.grid_kw !== undefined && (
        <div className="text-sm font-semibold tabular-nums text-red-600">
          Grid: {raw.grid_kw.toFixed(2)} kW
        </div>
      )}
    </div>
  );
}

export default function SolarChart({
  range,
  onRangeChange,
  data,
  title = "Solar Generation History",
}: SolarChartProps) {
  const buckets = useMemo(() => buildBuckets(range), [range]);

  const points = useMemo(() => {
    if (!data.length) return [];
    return aggregateIntoBuckets(data, buckets);
  }, [data, buckets]);

  const maxKw = useMemo(() => {
    const maxSolar = Math.max(...points.map((p) => p.solar_kw), 0);
    const maxHome = Math.max(...points.map((p) => p.home_kw), 0);
    const maxGrid = Math.max(...points.map((p) => p.grid_kw), 0);
    return Math.max(maxSolar, maxHome, maxGrid, 0.01);
  }, [points]);

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-sm text-slate-600">
            <span className="font-medium text-slate-700">Power (kW)</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-wrap gap-2">
            <Toggle active={range === "hour"} onClick={() => onRangeChange("hour")}>
              Hour
            </Toggle>
            <Toggle active={range === "day"} onClick={() => onRangeChange("day")}>
              Day
            </Toggle>
            <Toggle active={range === "week"} onClick={() => onRangeChange("week")}>
              Week
            </Toggle>
            <Toggle active={range === "month"} onClick={() => onRangeChange("month")}>
              Month
            </Toggle>
            <Toggle active={range === "year"} onClick={() => onRangeChange("year")}>
              Year
            </Toggle>
          </div>
        </div>
      </div>

      <div className="mt-4 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 10, right: 15, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="solarFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#eab308" stopOpacity={0.4} />
                <stop offset="70%" stopColor="#eab308" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#eab308" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} />

            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={range === "month" ? 3 : "preserveEnd"}
              tick={{ fill: "#64748b", fontSize: 12 }}
            />

            <YAxis
              tickLine={false}
              axisLine={false}
              domain={[0, maxKw * 1.2]}
              tick={{ fill: "#64748b", fontSize: 12 }}
              tickFormatter={(v: number) => v.toFixed(2)}
              label={{ value: "kW", angle: -90, position: "insideLeft", fill: "#64748b" }}
            />

            <Tooltip content={<TooltipContent />} />

            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              iconType="line"
              formatter={(value) => (
                <span style={{ color: "#64748b", fontSize: "12px" }}>{value}</span>
              )}
            />

            {/* Solar Generation */}
            <Area
              type="monotoneX"
              dataKey="solar_kw"
              stroke="none"
              fill="url(#solarFill)"
              isAnimationActive={false}
            />
            <Line
              type="monotoneX"
              dataKey="solar_kw"
              name="Solar Generation"
              stroke="#eab308"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, stroke: "#eab308", strokeWidth: 1, fill: "#ffffff" }}
            />

            {/* Home Usage */}
            <Line
              type="monotoneX"
              dataKey="home_kw"
              name="Home Usage"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
              activeDot={{ r: 4, stroke: "#6366f1", strokeWidth: 1, fill: "#ffffff" }}
            />

            {/* Grid Import */}
            <Line
              type="monotoneX"
              dataKey="grid_kw"
              name="Grid Import"
              stroke="#f87171"
              strokeWidth={2}
              dot={false}
              strokeDasharray="3 3"
              activeDot={{ r: 4, stroke: "#f87171", strokeWidth: 1, fill: "#ffffff" }}
            />
          </LineChart>
        </ResponsiveContainer>
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

