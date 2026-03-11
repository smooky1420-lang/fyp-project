import { useEffect, useState, useMemo } from "react";
import AppShell from "../components/AppShell";
import StatCard from "../components/StatCard";
import {
  ResponsiveContainer,
  LineChart,
  Line,
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
  AlertCircle,
  CheckCircle,
  Sparkles,
} from "lucide-react";
import {
  getUsagePrediction,
  getRecommendations,
  type PredictionDay,
  type Recommendation,
  type UsagePredictionResult,
} from "../lib/api";

const priorityIcons: Record<string, React.ReactNode> = {
  savings: <Zap className="h-5 w-5" />,
  efficiency: <Lightbulb className="h-5 w-5" />,
  timing: <TrendingDown className="h-5 w-5" />,
  solar: <Sparkles className="h-5 w-5" />,
};

function PredictionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: PredictionDay }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 shadow-lg p-3">
      <div className="text-sm font-semibold text-slate-900 mb-2">{data.date_label}</div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between items-center gap-4">
          <span className="text-slate-600">Predicted usage:</span>
          <span className="font-semibold text-slate-900">{data.predicted_usage_kwh.toFixed(2)} kWh</span>
        </div>
        <div className="flex justify-between items-center gap-4">
          <span className="text-slate-600">Predicted cost:</span>
          <span className="font-semibold text-indigo-600">PKR {data.predicted_cost_pkr.toFixed(2)}</span>
        </div>
        {data.actual_usage_kwh != null && (
          <>
            <div className="flex justify-between items-center gap-4 mt-2 pt-2 border-t border-slate-200">
              <span className="text-slate-600">Actual usage:</span>
              <span className="font-semibold text-green-600">{data.actual_usage_kwh.toFixed(2)} kWh</span>
            </div>
            <div className="flex justify-between items-center gap-4">
              <span className="text-slate-600">Actual cost:</span>
              <span className="font-semibold text-green-600">PKR {(data.actual_cost_pkr ?? 0).toFixed(2)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Predictions() {
  const [predictionPeriod, setPredictionPeriod] = useState<"week" | "month">("month");
  const [predictions, setPredictions] = useState<PredictionDay[]>([]);
  const [actuals, setActuals] = useState<UsagePredictionResult["actuals"]>([]);
  const [predictionsMessage, setPredictionsMessage] = useState<string | null>(null);
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

  // Chart: past actuals first, then future predictions (timeline order)
  const chartData = useMemo(() => {
    const actualPoints: PredictionDay[] = actuals.map((a) => ({
      date: a.date,
      date_label: a.date_label,
      predicted_usage_kwh: 0,
      predicted_cost_pkr: 0,
      actual_usage_kwh: a.actual_usage_kwh,
      actual_cost_pkr: a.actual_cost_pkr,
    }));
    const sorted = [...actualPoints, ...predictions].sort(
      (x, y) => new Date(x.date).getTime() - new Date(y.date).getTime()
    );
    return sorted;
  }, [predictions, actuals]);

  const filteredChartData = chartData;

  const summary = useMemo(() => {
    const periodData = predictions;
    const totalPredictedUsage = periodData.reduce((sum, p) => sum + p.predicted_usage_kwh, 0);
    const totalPredictedCost = periodData.reduce((sum, p) => sum + p.predicted_cost_pkr, 0);
    const avgDailyUsage = periodData.length ? totalPredictedUsage / periodData.length : 0;
    const avgDailyCost = periodData.length ? totalPredictedCost / periodData.length : 0;
    const mid = Math.floor(periodData.length / 2);
    const firstHalfAvg =
      mid > 0 ? periodData.slice(0, mid).reduce((s, p) => s + p.predicted_usage_kwh, 0) / mid : 0;
    const secondHalfAvg =
      periodData.length - mid > 0
        ? periodData.slice(mid).reduce((s, p) => s + p.predicted_usage_kwh, 0) / (periodData.length - mid)
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

  if (error) {
    return (
      <AppShell>
        <div className="rounded-xl bg-red-50 ring-1 ring-red-200 p-4 text-red-700">
          {error}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Summary Cards */}
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
          subValue="Per day average"
          icon={<TrendingUp className="h-5 w-5" />}
          color="blue"
        />
        <StatCard
          title="Usage trend"
          value={
            loading
              ? "…"
              : summary.trend === "increasing"
                ? "↑ Increasing"
                : "↓ Decreasing"
          }
          subValue={
            loading
              ? ""
              : `${summary.trendPercent}% ${summary.trend === "increasing" ? "increase" : "decrease"}`
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

      {/* Prediction Chart */}
      <div className="mt-5">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Usage & cost prediction</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPredictionPeriod("week")}
                className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                  predictionPeriod === "week"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Week
              </button>
              <button
                type="button"
                onClick={() => setPredictionPeriod("month")}
                className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                  predictionPeriod === "month"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                Month
              </button>
            </div>
          </div>

          {predictionsMessage && (
            <div className="mb-4 rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3 text-sm text-amber-800">
              {predictionsMessage}
            </div>
          )}

          {loading ? (
            <div className="h-80 flex items-center justify-center text-slate-500">Loading…</div>
          ) : filteredChartData.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-slate-500">
              No prediction data. Add devices and collect a few days of usage.
            </div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={filteredChartData}
                  margin={{ top: 10, right: 15, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date_label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
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
                    tickFormatter={(v: number) => `PKR ${v.toFixed(0)}`}
                    label={{
                      value: "PKR",
                      angle: 90,
                      position: "insideRight",
                      fill: "#64748b",
                    }}
                  />
                  <Tooltip content={<PredictionTooltip />} />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="predicted_usage_kwh"
                    stroke="#6366f1"
                    strokeWidth={2}
                    name="Predicted usage (kWh)"
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="predicted_cost_pkr"
                    stroke="#22c55e"
                    strokeWidth={2}
                    name="Predicted cost (PKR)"
                    dot={false}
                  />
                  {filteredChartData.some((p) => p.actual_usage_kwh != null) && (
                    <>
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="actual_usage_kwh"
                        stroke="#10b981"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="Actual usage (kWh)"
                        dot={{ r: 4 }}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="actual_cost_pkr"
                        stroke="#059669"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="Actual cost (PKR)"
                        dot={{ r: 4 }}
                      />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Recommendations */}
      <div className="mt-5">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              Recommendations
            </h2>
            {totalSavings > 0 && (
              <div className="text-sm text-slate-600">
                Potential savings:{" "}
                <span className="font-semibold text-green-600">
                  PKR {totalSavings.toLocaleString()}/month
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <div className="py-8 text-center text-slate-500">Loading…</div>
          ) : recommendations.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              No recommendations yet. Add devices and usage data to get personalized tips.
            </div>
          ) : (
            <div className="space-y-4">
              {recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl p-4 ring-1 ${
                    rec.priority === "high"
                      ? "bg-red-50 ring-red-200"
                      : rec.priority === "medium"
                        ? "bg-yellow-50 ring-yellow-200"
                        : "bg-blue-50 ring-blue-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        rec.priority === "high"
                          ? "bg-red-100 text-red-600"
                          : rec.priority === "medium"
                            ? "bg-yellow-100 text-yellow-600"
                            : "bg-blue-100 text-blue-600"
                      }`}
                    >
                      {priorityIcons[rec.type] ?? <Lightbulb className="h-5 w-5" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-slate-900">{rec.title}</h3>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            rec.priority === "high"
                              ? "bg-red-200 text-red-700"
                              : rec.priority === "medium"
                                ? "bg-yellow-200 text-yellow-700"
                                : "bg-blue-200 text-blue-700"
                          }`}
                        >
                          {rec.priority === "high"
                            ? "High"
                            : rec.priority === "medium"
                              ? "Medium"
                              : "Low"}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 mb-2">{rec.description}</p>
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <span className="font-medium text-green-700">{rec.impact}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 p-4 rounded-xl bg-indigo-50 ring-1 ring-indigo-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-indigo-600 mt-0.5" />
              <div>
                <div className="font-semibold text-indigo-900 mb-1">How predictions work</div>
                <p className="text-sm text-indigo-700">
                  Predictions use a moving average of your recent daily usage—no external AI. Recommendations
                  are based on your month-over-month trend, top-consuming devices, and solar setup. More
                  historical data improves accuracy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
