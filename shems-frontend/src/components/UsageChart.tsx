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
} from "recharts";
import type { TelemetryReading } from "../lib/api";

export type ChartRange = "hour" | "day" | "week" | "month" | "year";

type ReadingsInput = TelemetryReading[] | TelemetryReading[][];

type Point = {
  label: string;
  kwh: number;
  meta: string; // tooltip label
};

type Bucket = {
  start: Date;
  end: Date;
  label: string;
  meta: string;
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

// Monday = 1 ... Sunday = 7
function startOfWeekMonday(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun, 1=Mon
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
  x.setMonth(x.getMonth() + 1, 1); // first of next month
  x.setDate(1);
  return x;
}

function startOfYear(d: Date) {
  const x = startOfDay(d);
  x.setMonth(0, 1);
  return x;
}

function buildBuckets(range: ChartRange): { buckets: Bucket[] } {
  const now = new Date();

  if (range === "hour") {
    // current hour aligned to :00 with 5-min buckets
    const start = startOfHour(now);
    const stepMs = 5 * 60_000; // 5 minutes

    const buckets: Bucket[] = Array.from({ length: 12 }, (_, i) => {
      const a = new Date(start.getTime() + i * stepMs);
      const b = new Date(start.getTime() + (i + 1) * stepMs);
      return {
        start: a,
        end: b,
        label: `${String(a.getMinutes()).padStart(2, "0")}`, // 00,05,10...
        meta: `${fmtTime.format(a)} - ${fmtTime.format(b)}`,
      };
    });

    return { buckets };
  }

  if (range === "day") {
    // today 00:00 -> 24:00
    const start = startOfDay(now);
    const stepMs = 60 * 60_000; // 1 hour

    const buckets: Bucket[] = Array.from({ length: 24 }, (_, i) => {
      const a = new Date(start.getTime() + i * stepMs);
      const b = new Date(start.getTime() + (i + 1) * stepMs);
      return {
        start: a,
        end: b,
        label: fmtTime.format(a), // 00:00 ... 23:00
        meta: `${fmtTime.format(a)} - ${fmtTime.format(b)}`,
      };
    });

    return { buckets };
  }

  if (range === "week") {
    // Monday -> Sunday (7 daily buckets)
    const start = startOfWeekMonday(now);

    const buckets: Bucket[] = Array.from({ length: 7 }, (_, i) => {
      const a = new Date(start);
      a.setDate(start.getDate() + i);
      const b = new Date(a);
      b.setDate(a.getDate() + 1);

      return {
        start: a,
        end: b,
        label: a.toLocaleDateString("en-GB", { weekday: "short" }), // Mon Tue ...
        meta: fmtDate.format(a),
      };
    });

    return { buckets };
  }

  if (range === "month") {
    // 1st -> end of current month
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    const days = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60_000));

    const buckets: Bucket[] = Array.from({ length: days }, (_, i) => {
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

    return { buckets };
  }

  // year: Jan -> Dec (12 monthly buckets)
  const start = startOfYear(now);

  const buckets: Bucket[] = Array.from({ length: 12 }, (_, i) => {
    const a = new Date(start);
    a.setMonth(i, 1); // month i, day 1
    const b = new Date(a);
    b.setMonth(a.getMonth() + 1, 1);

    return {
      start: a,
      end: b,
      label: fmtMonth.format(a), // Jan Feb ...
      meta: `${fmtMonth.format(a)} ${a.getFullYear()}`,
    };
  });

  return { buckets };
}

function accumulateKwhIntoBuckets(readings: TelemetryReading[], buckets: Bucket[]) {
  const sorted = [...readings].sort(
    (a, b) => (safeTime(a.created_at) ?? 0) - (safeTime(b.created_at) ?? 0)
  );

  const sums = new Array<number>(buckets.length).fill(0);

  let prev: TelemetryReading | null = null;
  for (const r of sorted) {
    const t = safeTime(r.created_at);
    if (t === null) continue;

    if (prev) {
      const delta = r.energy_kwh - prev.energy_kwh;
      if (Number.isFinite(delta) && delta > 0) {
        for (let i = 0; i < buckets.length; i++) {
          const a = buckets[i].start.getTime();
          const b = buckets[i].end.getTime();
          if (t >= a && t < b) {
            sums[i] += delta;
            break;
          }
        }
      }
    }
    prev = r;
  }

  return sums.map((v) => Number(v.toFixed(4)));
}

type CustomTooltipProps = {
  active?: boolean;
  payload?: {
    payload?: {
      meta?: string;
      kwh?: number;
    };
  }[];
};

function TooltipContent({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const raw = payload[0].payload;

  const meta = raw?.meta ?? "";
  const kwh = typeof raw?.kwh === "number" ? raw.kwh : null;

  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 shadow-sm px-3 py-2">
      <div className="text-xs text-slate-600">{meta}</div>
      <div className="text-sm font-semibold tabular-nums">
        {kwh === null ? "--" : `${kwh.toFixed(4)} kWh`}
      </div>
    </div>
  );
}


export default function UsageChart({
  range,
  onRangeChange,
  readings,
  title = "Energy Usage",
  subtitle,
  rightAction,
}: {
  range: ChartRange;
  onRangeChange: (r: ChartRange) => void;
  readings: ReadingsInput;
  title?: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
}) {
  const { buckets } = useMemo(() => buildBuckets(range), [range]);

  const points: Point[] = useMemo(() => {
    const groups: TelemetryReading[][] =
      Array.isArray(readings) && readings.length > 0 && Array.isArray(readings[0])
        ? (readings as TelemetryReading[][])
        : [readings as TelemetryReading[]];

    const total = new Array<number>(buckets.length).fill(0);

    for (const g of groups) {
      const sums = accumulateKwhIntoBuckets(g, buckets);
      for (let i = 0; i < total.length; i++) total[i] += sums[i];
    }

    return buckets.map((b, i) => ({
      label: b.label || String(i),
      kwh: Number(total[i].toFixed(4)),
      meta: b.meta || "",
    }));
  }, [readings, buckets]);

  const maxKwh = useMemo(() => {
    const m = Math.max(...points.map((p) => p.kwh));
    return Number.isFinite(m) ? m : 0;
  }, [points]);

  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-sm text-slate-600">
            {subtitle ? `${subtitle} • ` : ""}
            <span className="font-medium text-slate-700">Energy (kWh)</span>
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

          {rightAction ? <div className="ml-2">{rightAction}</div> : null}
        </div>
      </div>

      <div className="mt-4 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 10, right: 15, left: 10, bottom: 0 }}>
            <defs>
                <linearGradient id="kwhFill" x1="0" y1="0" x2="0" y2="1">
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
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={range === "month" ? 3 : "preserveEnd"}
              tick={{ fill: "#64748b", fontSize: 12 }}
            />

            <YAxis
              tickLine={false}
              axisLine={false}
              domain={[0, Math.max(0.01, maxKwh * 1.2)]}
              tick={{ fill: "#64748b", fontSize: 12 }}
              tickFormatter={(v: number) => v.toFixed(2)}
              label={{ value: "kWh", angle: -90, position: "insideLeft", fill: "#64748b" }}
            />

            <Tooltip content={<TooltipContent />} />

            <Area
              type="monotoneX"
              dataKey="kwh"
              stroke="none"
              fill="url(#kwhFill)"
              isAnimationActive={false}
            />

           <Line
            type="monotoneX"
            dataKey="kwh"
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
