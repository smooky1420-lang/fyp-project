import { useId, useMemo } from "react";
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
  pctOfTotal: number; // share of energy in this chart window
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
    // Rolling last 24 hours (matches Dashboard fetch: isoFromHoursAgo(24))
    const stepMs = 60 * 60_000;
    const start = new Date(now.getTime() - 24 * stepMs);

    const buckets: Bucket[] = Array.from({ length: 24 }, (_, i) => {
      const a = new Date(start.getTime() + i * stepMs);
      const b = new Date(start.getTime() + (i + 1) * stepMs);
      return {
        start: a,
        end: b,
        label: fmtTime.format(a),
        meta: `${fmtTime.format(a)} – ${fmtTime.format(b)}`,
      };
    });

    return { buckets };
  }

  if (range === "week") {
    // Rolling last 7 days including today (matches Dashboard: isoFromDaysAgo(7))
    const endDay = startOfDay(now);
    const startDay = new Date(endDay);
    startDay.setDate(endDay.getDate() - 6);

    const buckets: Bucket[] = Array.from({ length: 7 }, (_, i) => {
      const a = new Date(startDay);
      a.setDate(startDay.getDate() + i);
      const b = new Date(a);
      b.setDate(a.getDate() + 1);

      return {
        start: a,
        end: b,
        label: a.toLocaleDateString("en-GB", { weekday: "short" }),
        meta: fmtDate.format(a),
      };
    });

    return { buckets };
  }

  if (range === "month") {
    // Rolling last 30 days (matches Dashboard: isoFromDaysAgo(30))
    const endDay = startOfDay(now);
    const startDay = new Date(endDay);
    startDay.setDate(endDay.getDate() - 29);

    const buckets: Bucket[] = Array.from({ length: 30 }, (_, i) => {
      const a = new Date(startDay);
      a.setDate(startDay.getDate() + i);
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
      pctOfTotal?: number;
    };
  }[];
};

function TooltipContent({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const raw = payload[0].payload;

  const meta = raw?.meta ?? "";
  const kwh = typeof raw?.kwh === "number" ? raw.kwh : null;
  const pct = typeof raw?.pctOfTotal === "number" ? raw.pctOfTotal : null;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-lg shadow-slate-200/50 backdrop-blur-sm">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {meta}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
        {kwh === null ? "—" : kwh < 0.01 ? `${kwh.toFixed(4)}` : `${kwh.toFixed(3)}`}{" "}
        <span className="text-sm font-medium text-slate-500">kWh</span>
      </div>
      {pct !== null && kwh !== null && kwh > 0 && (
        <div className="mt-1 text-xs text-slate-500">{pct.toFixed(1)}% of energy in this view</div>
      )}
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
  const gradId = useId().replace(/:/g, "");
  const fillGradientId = `kwhFill-${gradId}`;

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

    const sumWindow = total.reduce((s, v) => s + v, 0);

    return buckets.map((b, i) => {
      const kwh = Number(total[i].toFixed(4));
      const pctOfTotal = sumWindow > 0 ? (kwh / sumWindow) * 100 : 0;
      return {
        label: b.label || String(i),
        kwh,
        meta: b.meta || "",
        pctOfTotal,
      };
    });
  }, [readings, buckets]);

  const maxKwh = useMemo(() => {
    const m = Math.max(...points.map((p) => p.kwh));
    return Number.isFinite(m) ? m : 0;
  }, [points]);

  const totalKwhInView = useMemo(
    () => Number(points.reduce((s, p) => s + p.kwh, 0).toFixed(3)),
    [points]
  );

  const yTickDecimals = maxKwh < 1 ? 3 : maxKwh < 10 ? 2 : 1;

  const xAxisInterval =
    range === "month" ? 2 : range === "day" ? 3 : range === "hour" ? 1 : "preserveEnd";

  const chartBottom = range === "month" ? 28 : 8;

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-base font-semibold text-slate-900">{title}</div>
          <div className="mt-0.5 text-sm text-slate-600">
            {subtitle ? <span className="text-slate-700">{subtitle}</span> : null}
            {subtitle ? <span className="text-slate-300"> · </span> : null}
            <span className="font-medium text-slate-700">Energy (kWh)</span>
            {range === "day" && (
              <span className="text-slate-500"> · last 24 hours</span>
            )}
            {range === "week" && (
              <span className="text-slate-500"> · last 7 days</span>
            )}
            {range === "month" && (
              <span className="text-slate-500"> · last 30 days</span>
            )}
          </div>
          <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1 text-xs text-slate-600 ring-1 ring-slate-100">
            <span className="font-medium text-slate-500">Total in view</span>
            <span className="font-semibold tabular-nums text-indigo-700">
              {totalKwhInView.toFixed(3)} kWh
            </span>
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <div className="flex flex-wrap justify-end gap-1.5">
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
          {rightAction ? <div className="flex justify-end">{rightAction}</div> : null}
        </div>
      </div>

      <div className="mt-5 h-72 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 8, right: 8, left: 4, bottom: chartBottom }}
          >
            <defs>
              <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="55%" stopColor="#6366f1" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />

            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={xAxisInterval as number | "preserveEnd"}
              tick={{
                fill: "#64748b",
                fontSize: 11,
                ...(range === "month" ? { angle: -35, textAnchor: "end" } : {}),
              }}
              height={range === "month" ? 36 : undefined}
            />

            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              domain={[0, (dataMax: number) => Math.max(0.01, dataMax * 1.15)]}
              tick={{ fill: "#64748b", fontSize: 11 }}
              tickFormatter={(v: number) => v.toFixed(yTickDecimals)}
              label={{
                value: "kWh",
                angle: -90,
                position: "insideLeft",
                fill: "#94a3b8",
                fontSize: 11,
              }}
            />

            <Tooltip
              content={<TooltipContent />}
              cursor={{ stroke: "#c7d2fe", strokeWidth: 1, strokeDasharray: "4 4" }}
            />

            <Area
              type="monotone"
              dataKey="kwh"
              stroke="none"
              fill={`url(#${fillGradientId})`}
              isAnimationActive={false}
            />

            <Line
              type="monotone"
              dataKey="kwh"
              stroke="#4f46e5"
              strokeWidth={2.25}
              dot={false}
              activeDot={{
                r: 5,
                stroke: "#4f46e5",
                strokeWidth: 2,
                fill: "#ffffff",
              }}
              isAnimationActive={false}
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
      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition sm:text-sm sm:px-3 sm:py-2 ${
        active
          ? "bg-indigo-600 text-white ring-indigo-600 shadow-sm"
          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}
