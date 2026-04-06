import { useEffect, useState, useMemo } from "react";
import AppShell from "../components/AppShell";
import StatCard from "../components/StatCard";
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
  Wallet,
  Lightbulb,
  CheckCircle,
  Sparkles,
  ChevronDown,
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
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function Predictions() {
  const [predictionPeriod, setPredictionPeriod] = useState<"week" | "month">("month");
  const [predictions, setPredictions] = useState<PredictionDay[]>([]);
  const [actuals, setActuals] = useState<UsagePredictionResult["actuals"]>([]);
  const [predictionsMessage, setPredictionsMessage] = useState<string | null>(null);
  const [modelInfo, setModelInfo] = useState<PredictionModelInfo | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const periodDays = predictionPeriod === "week" ? 7 : 30;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getUsagePrediction(periodDays as 7 | 30),
      getRecommendations(),
    ])
      .then(([predRes, recRes]) => {
        if (cancelled) return;
        setPredictionsMessage(predRes.message);
        setPredictions(predRes.predictions);
        setActuals(predRes.actuals);
        setModelInfo(predRes.model_info ?? null);
        setRecommendations(recRes.recommendations);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [periodDays]);

  const chartData = useMemo((): ChartRow[] => {
    const actualPoints: ChartRow[] = actuals.map((a) => ({
      date: a.date,
      date_label: a.date_label,
      actual_usage_kwh: a.actual_usage_kwh,
      actual_cost_pkr: a.actual_cost_pkr,
    }));
    const predPoints: ChartRow[] = predictions.map((p) => ({
      date: p.date,
      date_label: p.date_label,
      predicted_usage_kwh: p.predicted_usage_kwh ?? undefined,
      predicted_cost_pkr: p.predicted_cost_pkr ?? undefined,
    }));
    return [...actualPoints, ...predPoints].sort(
      (x, y) => new Date(x.date).getTime() - new Date(y.date).getTime()
    );
  }, [predictions, actuals]);

  const summary = useMemo(() => {
    const periodData = predictions;
    const totalPredictedUsage = periodData.reduce(
      (sum, p) => sum + (p.predicted_usage_kwh ?? 0),
      0
    );
    const totalPredictedCost = periodData.reduce(
      (sum, p) => sum + (p.predicted_cost_pkr ?? 0),
      0
    );
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
        <div className="rounded-xl bg-red-50 ring-1 ring-red-200 p-4 text-red-700">{error}</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Usage forecast</h1>
          <p className="mt-1 text-sm text-slate-500 max-w-2xl">
            Next days&apos; kWh and cost from a <span className="text-slate-700">Random Forest</span>{" "}
            model trained on your home&apos;s daily history.
          </p>
        </div>

        {/* Full metrics live here so the main page stays clean; open for FYP / viva screenshots */}
        {modelInfo && (
          <details className="group rounded-xl bg-white ring-1 ring-slate-200 shadow-sm overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
              <span>Model details (R², MAE, features, last trained)</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180" />
            </summary>
            <div className="border-t border-slate-100 px-4 py-4 space-y-4 bg-slate-50/80">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-100">
                  <div className="text-xs text-slate-500">Holdout R²</div>
                  <div className="text-xl font-semibold tabular-nums text-slate-900">
                    {modelInfo.r2_test != null ? modelInfo.r2_test.toFixed(3) : "—"}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">Time-ordered test split</div>
                </div>
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-100">
                  <div className="text-xs text-slate-500">Holdout MAE</div>
                  <div className="text-xl font-semibold tabular-nums text-slate-900">
                    {modelInfo.mae_test_kwh != null
                      ? `${modelInfo.mae_test_kwh.toFixed(2)} kWh/d`
                      : "—"}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">Per day on holdout</div>
                </div>
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-100">
                  <div className="text-xs text-slate-500">Samples</div>
                  <div className="text-xl font-semibold tabular-nums text-slate-900">
                    {modelInfo.n_samples ?? "—"}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {modelInfo.n_train != null && modelInfo.n_test != null
                      ? `${modelInfo.n_train} train / ${modelInfo.n_test} test`
                      : "Pooled daily rows"}
                  </div>
                </div>
                <div className="rounded-lg bg-white p-3 ring-1 ring-slate-100">
                  <div className="text-xs text-slate-500">Last trained</div>
                  <div className="text-sm font-semibold text-slate-900 leading-snug">
                    {formatTrainedAt(modelInfo.trained_at)}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {modelInfo.algorithm ?? "RandomForestRegressor"}
                  </div>
                </div>
              </div>
              {modelInfo.note && (
                <p className="text-sm text-amber-900 bg-amber-50 ring-1 ring-amber-200/80 rounded-lg px-3 py-2">
                  {modelInfo.note}
                </p>
              )}
              {modelInfo.feature_description && (
                <p className="text-sm text-slate-600 leading-relaxed">{modelInfo.feature_description}</p>
              )}
              <p className="text-xs text-slate-500">
                Update the model after more data:{" "}
                <code className="rounded bg-slate-200/80 px-1.5 py-0.5 text-slate-800">
                  python manage.py train_predictor
                </code>
              </p>
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

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Predicted usage"
            value={loading ? "…" : `${summary.totalPredictedUsage.toFixed(2)} kWh`}
            subValue={predictionPeriod === "week" ? "Next 7 days" : "Next 30 days"}
            icon={<Zap className="h-5 w-5" />}
            color="indigo"
          />
          <StatCard
            title="Predicted cost"
            value={loading ? "…" : `PKR ${summary.totalPredictedCost.toFixed(2)}`}
            subValue={predictionPeriod === "week" ? "Next 7 days" : "Next 30 days"}
            icon={<Wallet className="h-5 w-5" />}
            color="purple"
          />
          <StatCard
            title="Avg daily usage"
            value={loading ? "…" : `${summary.avgDailyUsage.toFixed(2)} kWh`}
            subValue="Forecast window average"
            icon={<TrendingUp className="h-5 w-5" />}
            color="blue"
          />
          <StatCard
            title="Forecast shape"
            value={
              loading
                ? "…"
                : summary.trend === "increasing"
                  ? "↑ Rising"
                  : "↓ Falling"
            }
            subValue={
              loading
                ? ""
                : `${summary.trendPercent}% ${summary.trend === "increasing" ? "up" : "down"} first vs second half`
            }
            icon={
              summary.trend === "increasing" ? (
                <TrendingUp className="h-5 w-5" />
              ) : (
                <TrendingDown className="h-5 w-5" />
              )
            }
            color="orange"
          />
        </div>

        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 md:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Forecast vs recent actuals</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Solid fill shows predicted daily kWh; dashed lines are measured history.
              </p>
            </div>
            <div className="flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setPredictionPeriod("week")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  predictionPeriod === "week"
                    ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                7 days
              </button>
              <button
                type="button"
                onClick={() => setPredictionPeriod("month")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  predictionPeriod === "month"
                    ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                30 days
              </button>
            </div>
          </div>

          {loading ? (
            <div className="h-80 flex items-center justify-center text-slate-500">Loading…</div>
          ) : chartData.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-slate-500 text-center px-4 text-sm">
              {predictionsMessage ??
                "No prediction data. Add devices and collect a few days of usage, then run train_predictor."}
            </div>
          ) : (
            <div className="h-[22rem] w-full min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 12, right: 12, left: 4, bottom: 8 }}
                >
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
                    label={{
                      value: "kWh",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#64748b",
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748b", fontSize: 12 }}
                    tickFormatter={(v: number) => `₨${v.toFixed(0)}`}
                    label={{
                      value: "PKR",
                      angle: 90,
                      position: "insideRight",
                      fill: "#64748b",
                    }}
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
                    dot={false}
                    connectNulls
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="predicted_cost_pkr"
                    stroke="#7c3aed"
                    strokeWidth={2}
                    name="Predicted cost (PKR)"
                    dot={false}
                    connectNulls
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
        </div>

        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5 md:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Data-driven recommendations
            </h2>
            {totalSavings > 0 && (
              <div className="text-sm text-slate-600">
                Parsed savings hints:{" "}
                <span className="font-semibold text-emerald-600">
                  PKR {totalSavings.toLocaleString()}/mo
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-500">Loading…</div>
          ) : recommendations.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm max-w-md mx-auto">
              No recommendations yet. As usage grows, we surface trends, heavy devices, and peak
              hours automatically.
            </div>
          ) : (
            <ul className="space-y-3 list-none p-0 m-0">
              {recommendations.map((rec, idx) => (
                <li
                  key={`${rec.title}-${idx}`}
                  className={`rounded-2xl p-5 ring-1 transition hover:shadow-md ${
                    rec.priority === "high"
                      ? "bg-gradient-to-br from-red-50 to-orange-50/50 ring-red-200/80"
                      : rec.priority === "medium"
                        ? "bg-gradient-to-br from-amber-50 to-yellow-50/30 ring-amber-200/70"
                        : "bg-gradient-to-br from-slate-50 to-blue-50/40 ring-slate-200/80"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`p-3 rounded-xl shrink-0 ${
                        rec.priority === "high"
                          ? "bg-red-100 text-red-700"
                          : rec.priority === "medium"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {priorityIcons[rec.type] ?? <Lightbulb className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-900">{rec.title}</h3>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
                            rec.priority === "high"
                              ? "bg-red-200/90 text-red-900"
                              : rec.priority === "medium"
                                ? "bg-amber-200/90 text-amber-900"
                                : "bg-blue-200/80 text-blue-900"
                          }`}
                        >
                          {rec.priority}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed">{rec.description}</p>
                      <div className="mt-3 flex items-start gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span className="font-medium text-emerald-800">{rec.impact}</span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
