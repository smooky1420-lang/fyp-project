import { useEffect, useState, useMemo } from "react";
import AppShell from "../components/AppShell";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Lightbulb,
  CheckCircle,
  Sparkles,
  ChevronDown,
  Activity,
  BarChart3,
  RefreshCw,
} from "lucide-react";
import {
  getUsagePrediction,
  getRecommendations,
  type PredictionDay,
  type Recommendation,
  type UsagePredictionResult,
  type PredictionModelInfo,
} from "../lib/api";

const priorityIcons: Record<string, React.ReactNode> = {
  savings: <Zap className="h-5 w-5" />,
  efficiency: <Lightbulb className="h-5 w-5" />,
  timing: <TrendingDown className="h-5 w-5" />,
  solar: <Sparkles className="h-5 w-5" />,
};

type ChartRow = {
  date: string;
  date_label: string;
  predicted_usage_kwh?: number;
  predicted_cost_pkr?: number;
  actual_usage_kwh?: number;
  actual_cost_pkr?: number;
};

function PredictionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 shadow-lg p-3 max-w-xs">
      <div className="text-sm font-semibold text-slate-900 mb-2">{data.date_label}</div>
      <div className="space-y-1 text-xs">
        {data.predicted_usage_kwh != null && data.predicted_usage_kwh > 0 && (
          <>
            <div className="flex justify-between items-center gap-4">
              <span className="text-slate-600">Predicted usage</span>
              <span className="font-semibold text-indigo-600">
                {data.predicted_usage_kwh.toFixed(2)} kWh
              </span>
            </div>
            <div className="flex justify-between items-center gap-4">
              <span className="text-slate-600">Predicted cost</span>
              <span className="font-semibold text-violet-600">
                PKR {data.predicted_cost_pkr?.toFixed(2) ?? "—"}
              </span>
            </div>
          </>
        )}
        {data.actual_usage_kwh != null && data.actual_usage_kwh > 0 && (
          <>
            <div
              className={`flex justify-between items-center gap-4 ${data.predicted_usage_kwh != null && data.predicted_usage_kwh > 0 ? "mt-2 pt-2 border-t border-slate-200" : ""}`}
            >
              <span className="text-slate-600">Actual usage</span>
              <span className="font-semibold text-emerald-600">
                {data.actual_usage_kwh.toFixed(2)} kWh
              </span>
            </div>
            <div className="flex justify-between items-center gap-4">
              <span className="text-slate-600">Actual cost</span>
              <span className="font-semibold text-emerald-600">
                PKR {(data.actual_cost_pkr ?? 0).toFixed(2)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatTrainedAt(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export default function Predictions() {
  const [predictionPeriod, setPredictionPeriod] = useState<"week" | "month">("week");
  const [predictions, setPredictions] = useState<PredictionDay[]>([]);
  const [actuals, setActuals] = useState<UsagePredictionResult["actuals"]>([]);
  const [predictionsMessage, setPredictionsMessage] = useState<string | null>(null);
  const [modelInfo, setModelInfo] = useState<PredictionModelInfo | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const periodDays = predictionPeriod === "week" ? 7 : 30;
  const periodLabel = predictionPeriod === "week" ? "Next 7 days" : "Next 30 days";

  function loadData() {
    setLoading(true);
    setError(null);
    return Promise.all([getUsagePrediction(periodDays as 7 | 30), getRecommendations()])
      .then(([predRes, recRes]) => {
        setPredictionsMessage(
          predRes.predictions.length === 0 ? predRes.message : null
        );
        setPredictions(predRes.predictions);
        setActuals(predRes.actuals);
        setModelInfo(predRes.model_info ?? null);
        setRecommendations(recRes.recommendations);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load forecast");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getUsagePrediction(periodDays as 7 | 30), getRecommendations()])
      .then(([predRes, recRes]) => {
        if (cancelled) return;
        setPredictionsMessage(
          predRes.predictions.length === 0 ? predRes.message : null
        );
        setPredictions(predRes.predictions);
        setActuals(predRes.actuals);
        setModelInfo(predRes.model_info ?? null);
        setRecommendations(recRes.recommendations);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load forecast");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [periodDays]);

  const chartData = useMemo((): ChartRow[] => {
    const byDate = new Map<string, ChartRow>();

    for (const a of actuals) {
      byDate.set(a.date, {
        date: a.date,
        date_label: a.date_label,
        actual_usage_kwh: a.actual_usage_kwh,
        actual_cost_pkr: a.actual_cost_pkr,
      });
    }

    for (const p of predictions) {
      const existing = byDate.get(p.date);
      byDate.set(p.date, {
        date: p.date,
        date_label: p.date_label,
        actual_usage_kwh: existing?.actual_usage_kwh,
        actual_cost_pkr: existing?.actual_cost_pkr,
        predicted_usage_kwh: p.predicted_usage_kwh ?? undefined,
        predicted_cost_pkr: p.predicted_cost_pkr ?? undefined,
      });
    }

    return Array.from(byDate.values()).sort(
      (x, y) => new Date(x.date).getTime() - new Date(y.date).getTime()
    );
  }, [predictions, actuals]);

  const summary = useMemo(() => {
    const periodData = predictions;
    const totalPredictedUsage = periodData.reduce((sum, p) => sum + (p.predicted_usage_kwh ?? 0), 0);
    const totalPredictedCost = periodData.reduce((sum, p) => sum + (p.predicted_cost_pkr ?? 0), 0);
    const avgDailyUsage = periodData.length ? totalPredictedUsage / periodData.length : 0;
    const avgDailyCost = periodData.length ? totalPredictedCost / periodData.length : 0;
    const mid = Math.floor(periodData.length / 2);
    const firstHalfAvg =
      mid > 0
        ? periodData.slice(0, mid).reduce((s, p) => s + (p.predicted_usage_kwh ?? 0), 0) / mid
        : 0;
    const secondHalfAvg =
      periodData.length - mid > 0
        ? periodData.slice(mid).reduce((s, p) => s + (p.predicted_usage_kwh ?? 0), 0) /
          (periodData.length - mid)
        : 0;
    const trend = secondHalfAvg > firstHalfAvg ? "increasing" : "decreasing";
    const trendPercent =
      firstHalfAvg > 0 ? Math.abs(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100) : 0;

    return {
      totalPredictedUsage: Math.round(totalPredictedUsage * 100) / 100,
      totalPredictedCost: Math.round(totalPredictedCost * 100) / 100,
      avgDailyUsage: Math.round(avgDailyUsage * 100) / 100,
      avgDailyCost: Math.round(avgDailyCost * 100) / 100,
      trend,
      trendPercent: Math.round(trendPercent * 10) / 10,
    };
  }, [predictions]);

  const totalSavings = useMemo(() => {
    return recommendations.reduce((sum, r) => {
      const match = r.impact.match(/PKR ([\d,]+)/);
      if (match) return sum + parseInt(match[1].replace(/,/g, ""), 10);
      return sum;
    }, 0);
  }, [recommendations]);

  const featureChips = modelInfo?.feature_names?.length
    ? modelInfo.feature_names
    : ["day_of_week", "is_weekend", "day_index", "prev_day_usage", "mean_7_kwh", "month"];

  if (error) {
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl">
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
            <button
              type="button"
              className="ml-3 font-medium text-red-700 underline hover:no-underline"
              onClick={() => void loadData()}
            >
              Retry
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-violet-950 to-indigo-900 text-white shadow-xl shadow-violet-900/20">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/4 h-48 w-48 rounded-full bg-indigo-500/15 blur-3xl" />
          <div className="relative p-6 md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-violet-200">Looking ahead</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Usage forecast</h1>
                <p className="mt-2 max-w-lg text-sm text-violet-200/90 leading-relaxed">
                  Estimated usage and cost based on your past consumption patterns.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-violet-100 ring-1 ring-white/10">
                    {periodLabel}
                  </span>
                  {modelInfo?.trained_at && (
                    <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-100 ring-1 ring-emerald-400/30">
                      Model ready
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                      summary.trend === "increasing"
                        ? "bg-amber-500/20 text-amber-100 ring-amber-400/30"
                        : "bg-emerald-500/20 text-emerald-100 ring-emerald-400/30"
                    }`}
                  >
                    {summary.trend === "increasing" ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    {loading ? "…" : `${summary.trend === "increasing" ? "Rising" : "Falling"} trend`}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void loadData()}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 disabled:opacity-50 transition-colors"
                >
                  {loading ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPredictionPeriod("week")}
                className={`rounded-xl px-3.5 py-2 text-sm font-semibold ring-1 transition ${
                  predictionPeriod === "week"
                    ? "bg-white text-indigo-950 ring-white shadow-sm"
                    : "bg-white/10 text-white ring-white/15 hover:bg-white/15"
                }`}
              >
                7 days
              </button>
              <button
                type="button"
                onClick={() => setPredictionPeriod("month")}
                className={`rounded-xl px-3.5 py-2 text-sm font-semibold ring-1 transition ${
                  predictionPeriod === "month"
                    ? "bg-white text-indigo-950 ring-white shadow-sm"
                    : "bg-white/10 text-white ring-white/15 hover:bg-white/15"
                }`}
              >
                30 days
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-violet-200">Predicted usage</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {loading ? "—" : summary.totalPredictedUsage.toFixed(1)}
                  <span className="ml-1 text-lg font-semibold text-violet-200">kWh</span>
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-violet-200">Predicted cost</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {loading ? "—" : summary.totalPredictedCost.toFixed(0)}
                  <span className="ml-1 text-lg font-semibold text-violet-200">PKR</span>
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-violet-200">Daily average</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {loading ? "—" : summary.avgDailyUsage.toFixed(2)}
                  <span className="ml-1 text-lg font-semibold text-violet-200">kWh</span>
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-violet-200">Daily cost avg</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {loading ? "—" : summary.avgDailyCost.toFixed(0)}
                  <span className="ml-1 text-lg font-semibold text-violet-200">PKR</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Chart */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/25">
              <BarChart3 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-slate-900">Forecast vs recent usage</h2>
              <p className="text-xs text-slate-500">
                Solid lines are predicted; dashed lines show measured history
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex h-80 flex-col items-center justify-center text-slate-500">
              <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
              <p className="mt-3 text-sm">Loading forecast…</p>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex h-80 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 text-center">
              <Sparkles className="h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">Not enough history yet</p>
              <p className="mt-1 max-w-sm text-xs text-slate-500 leading-relaxed">
                {predictionsMessage ??
                  "Keep your meters running for a few days. Forecasts appear once WattGuard has enough usage data."}
              </p>
            </div>
          ) : (
            <div className="h-[22rem] w-full min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 12, right: 12, left: 4, bottom: 8 }}>
                  <defs>
                    <linearGradient id="predUsageFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date_label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    angle={-40}
                    textAnchor="end"
                    height={64}
                  />
                  <YAxis
                    yAxisId="left"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748b", fontSize: 12 }}
                    tickFormatter={(v: number) => v.toFixed(1)}
                    label={{ value: "kWh", angle: -90, position: "insideLeft", fill: "#64748b" }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748b", fontSize: 12 }}
                    tickFormatter={(v: number) => `₨${v.toFixed(0)}`}
                    label={{ value: "PKR", angle: 90, position: "insideRight", fill: "#64748b" }}
                  />
                  <Tooltip content={<PredictionTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: 16 }} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="predicted_usage_kwh"
                    stroke="none"
                    fill="url(#predUsageFill)"
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="predicted_usage_kwh"
                    stroke="#4f46e5"
                    strokeWidth={2.5}
                    name="Predicted usage (kWh)"
                    dot={{ r: 3, fill: "#4f46e5" }}
                    connectNulls={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="predicted_cost_pkr"
                    stroke="#7c3aed"
                    strokeWidth={2}
                    name="Predicted cost (PKR)"
                    dot={{ r: 3, fill: "#7c3aed" }}
                    connectNulls={false}
                  />
                  {chartData.some((p) => p.actual_usage_kwh != null && p.actual_usage_kwh > 0) && (
                    <>
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="actual_usage_kwh"
                        stroke="#059669"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        name="Actual usage (kWh)"
                        dot={{ r: 3, fill: "#059669" }}
                        connectNulls
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="actual_cost_pkr"
                        stroke="#10b981"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        name="Actual cost (PKR)"
                        dot={{ r: 3, fill: "#10b981" }}
                        connectNulls
                      />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* Recommendations */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/25">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">Energy tips</h2>
                <p className="text-xs text-slate-500">Personalised suggestions from your usage</p>
              </div>
            </div>
            {totalSavings > 0 && (
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full ring-1 ring-emerald-100">
                Up to PKR {totalSavings.toLocaleString()}/mo potential savings
              </span>
            )}
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-500 text-sm">Loading tips…</div>
          ) : recommendations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center text-sm text-slate-500 max-w-md mx-auto">
              Tips will appear as more usage data comes in: heavy devices, peak hours, and trends.
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {recommendations.map((rec, idx) => (
                <li
                  key={`${rec.title}-${idx}`}
                  className={`rounded-xl border p-4 ${
                    rec.priority === "high"
                      ? "border-red-100 bg-gradient-to-br from-red-50/80 to-orange-50/40"
                      : rec.priority === "medium"
                        ? "border-amber-100 bg-gradient-to-br from-amber-50/80 to-yellow-50/30"
                        : "border-slate-100 bg-gradient-to-br from-slate-50 to-indigo-50/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        rec.priority === "high"
                          ? "bg-red-100 text-red-700"
                          : rec.priority === "medium"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-indigo-100 text-indigo-700"
                      }`}
                    >
                      {priorityIcons[rec.type] ?? <Lightbulb className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900">{rec.title}</h3>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                            rec.priority === "high"
                              ? "bg-red-200/90 text-red-900"
                              : rec.priority === "medium"
                                ? "bg-amber-200/90 text-amber-900"
                                : "bg-indigo-200/80 text-indigo-900"
                          }`}
                        >
                          {rec.priority}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed line-clamp-4">{rec.description}</p>
                      <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-emerald-800">
                        <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        {rec.impact}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Model details — collapsible for demos / viva */}
        {modelInfo && (
          <details className="group rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/80 overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-medium text-slate-700 hover:bg-slate-50/80 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-indigo-600" />
                How the forecast is built (accuracy & model info)
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
            </summary>
            <div className="border-t border-slate-100 px-5 py-5 space-y-4 bg-slate-50/50">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                  <p className="text-xs text-slate-500">Holdout R²</p>
                  <p className="text-xl font-semibold tabular-nums text-slate-900">
                    {modelInfo.r2_test != null ? modelInfo.r2_test.toFixed(3) : "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                  <p className="text-xs text-slate-500">Holdout MAE</p>
                  <p className="text-xl font-semibold tabular-nums text-slate-900">
                    {modelInfo.mae_test_kwh != null ? `${modelInfo.mae_test_kwh.toFixed(2)} kWh/d` : "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                  <p className="text-xs text-slate-500">Training samples</p>
                  <p className="text-xl font-semibold tabular-nums text-slate-900">
                    {modelInfo.n_samples ?? "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                  <p className="text-xs text-slate-500">Last updated</p>
                  <p className="text-sm font-semibold text-slate-900 leading-snug">
                    {formatTrainedAt(modelInfo.trained_at)}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{modelInfo.algorithm ?? "Random forest"}</p>
                </div>
              </div>
              {modelInfo.note && (
                <p className="text-sm text-amber-900 bg-amber-50 ring-1 ring-amber-200/80 rounded-xl px-4 py-3">
                  {modelInfo.note}
                </p>
              )}
              {modelInfo.feature_description && (
                <p className="text-sm text-slate-600 leading-relaxed">{modelInfo.feature_description}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {featureChips.map((f) => (
                  <span
                    key={f}
                    className="rounded-full bg-indigo-50 text-indigo-800 px-2.5 py-0.5 text-xs font-medium ring-1 ring-indigo-100"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </details>
        )}

        <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-xs text-slate-400">
          <Activity className="h-3.5 w-3.5" />
          Forecasts improve as you collect more daily usage
        </p>
      </div>
    </AppShell>
  );
}
