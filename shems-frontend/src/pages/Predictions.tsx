import { useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import StatCard from "../components/StatCard";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
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

// Dummy prediction data generator
function generatePredictions() {
  const now = new Date();
  const predictions = [];
  
  // Generate next 30 days
  for (let i = 1; i <= 30; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() + i);
    
    // Simulate usage with some variation
    const baseUsage = 25 + Math.sin(i / 5) * 5 + Math.random() * 3;
    const usage = Math.max(10, baseUsage);
    const cost = usage * 15; // Assuming ~15 PKR/kWh average
    
    predictions.push({
      date: date.toISOString().split('T')[0],
      dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      predicted_usage_kwh: Math.round(usage * 100) / 100,
      predicted_cost_pkr: Math.round(cost * 100) / 100,
      actual_usage_kwh: i <= 7 ? Math.round((usage + (Math.random() - 0.5) * 2) * 100) / 100 : null,
      actual_cost_pkr: i <= 7 ? Math.round((cost + (Math.random() - 0.5) * 30) * 100) / 100 : null,
    });
  }
  
  return predictions;
}

// Dummy recommendations
const recommendations = [
  {
    id: 1,
    type: "savings",
    priority: "high",
    title: "Optimize AC Usage",
    description: "Your AC consumption is 40% higher than average. Consider using it only during peak heat hours (2 PM - 6 PM) to save up to PKR 2,500/month.",
    impact: "Save up to PKR 2,500/month",
    icon: <Zap className="h-5 w-5" />,
  },
  {
    id: 2,
    type: "efficiency",
    priority: "medium",
    title: "Upgrade to LED Bulbs",
    description: "Replacing 10 incandescent bulbs with LEDs could reduce lighting costs by 80% and save approximately PKR 800/month.",
    impact: "Save up to PKR 800/month",
    icon: <Lightbulb className="h-5 w-5" />,
  },
  {
    id: 3,
    type: "timing",
    priority: "medium",
    title: "Shift Heavy Load Usage",
    description: "Running washing machine and dishwasher during off-peak hours (10 PM - 6 AM) could reduce costs by 15%.",
    impact: "Save up to PKR 600/month",
    icon: <TrendingDown className="h-5 w-5" />,
  },
  {
    id: 4,
    type: "solar",
    priority: "low",
    title: "Expand Solar Capacity",
    description: "Increasing solar capacity by 2 kW could cover 60% of your current usage and reduce grid dependency significantly.",
    impact: "Save up to PKR 3,000/month",
    icon: <Sparkles className="h-5 w-5" />,
  },
];

function PredictionTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  
  const data = payload[0].payload;
  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 shadow-lg p-3">
      <div className="text-sm font-semibold text-slate-900 mb-2">{data.dateLabel}</div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between items-center gap-4">
          <span className="text-slate-600">Predicted Usage:</span>
          <span className="font-semibold text-slate-900">{data.predicted_usage_kwh.toFixed(2)} kWh</span>
        </div>
        <div className="flex justify-between items-center gap-4">
          <span className="text-slate-600">Predicted Cost:</span>
          <span className="font-semibold text-indigo-600">PKR {data.predicted_cost_pkr.toFixed(2)}</span>
        </div>
        {data.actual_usage_kwh !== null && (
          <>
            <div className="flex justify-between items-center gap-4 mt-2 pt-2 border-t border-slate-200">
              <span className="text-slate-600">Actual Usage:</span>
              <span className="font-semibold text-green-600">{data.actual_usage_kwh.toFixed(2)} kWh</span>
            </div>
            <div className="flex justify-between items-center gap-4">
              <span className="text-slate-600">Actual Cost:</span>
              <span className="font-semibold text-green-600">PKR {data.actual_cost_pkr.toFixed(2)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function Predictions() {
  const [predictionPeriod, setPredictionPeriod] = useState<"week" | "month">("month");
  
  const predictions = useMemo(() => generatePredictions(), []);
  
  const filteredPredictions = useMemo(() => {
    return predictionPeriod === "week" ? predictions.slice(0, 7) : predictions;
  }, [predictions, predictionPeriod]);
  
  const summary = useMemo(() => {
    const periodData = filteredPredictions;
    const totalPredictedUsage = periodData.reduce((sum, p) => sum + p.predicted_usage_kwh, 0);
    const totalPredictedCost = periodData.reduce((sum, p) => sum + p.predicted_cost_pkr, 0);
    const avgDailyUsage = totalPredictedUsage / periodData.length;
    const avgDailyCost = totalPredictedCost / periodData.length;
    
    // Calculate trend (comparing first half vs second half)
    const mid = Math.floor(periodData.length / 2);
    const firstHalfAvg = periodData.slice(0, mid).reduce((sum, p) => sum + p.predicted_usage_kwh, 0) / mid;
    const secondHalfAvg = periodData.slice(mid).reduce((sum, p) => sum + p.predicted_usage_kwh, 0) / (periodData.length - mid);
    const trend = secondHalfAvg > firstHalfAvg ? "increasing" : "decreasing";
    const trendPercent = Math.abs(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100);
    
    return {
      totalPredictedUsage: Math.round(totalPredictedUsage * 100) / 100,
      totalPredictedCost: Math.round(totalPredictedCost * 100) / 100,
      avgDailyUsage: Math.round(avgDailyUsage * 100) / 100,
      avgDailyCost: Math.round(avgDailyCost * 100) / 100,
      trend,
      trendPercent: Math.round(trendPercent * 10) / 10,
    };
  }, [filteredPredictions]);
  
  const totalSavings = recommendations.reduce((sum, r) => {
    const match = r.impact.match(/PKR ([\d,]+)/);
    if (match) {
      return sum + parseInt(match[1].replace(/,/g, ''));
    }
    return sum;
  }, 0);

  return (
    <AppShell>
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Predicted Usage"
          value={`${summary.totalPredictedUsage.toFixed(2)} kWh`}
          subValue={`${predictionPeriod === "week" ? "Next 7 days" : "Next 30 days"}`}
          icon={<Zap className="h-5 w-5" />}
          color="indigo"
        />

        <StatCard
          title="Predicted Cost"
          value={`PKR ${summary.totalPredictedCost.toFixed(2)}`}
          subValue={`${predictionPeriod === "week" ? "Next 7 days" : "Next 30 days"}`}
          icon={<Wallet className="h-5 w-5" />}
          color="purple"
        />

        <StatCard
          title="Avg Daily Usage"
          value={`${summary.avgDailyUsage.toFixed(2)} kWh`}
          subValue={`Per day average`}
          icon={<TrendingUp className="h-5 w-5" />}
          color="blue"
        />

        <StatCard
          title="Usage Trend"
          value={summary.trend === "increasing" ? "↑ Increasing" : "↓ Decreasing"}
          subValue={`${summary.trendPercent}% ${summary.trend === "increasing" ? "increase" : "decrease"}`}
          icon={summary.trend === "increasing" ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          color="orange"
        />
      </div>

      {/* Prediction Chart */}
      <div className="mt-5">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Usage & Cost Prediction</h2>
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
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredPredictions} margin={{ top: 10, right: 15, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="dateLabel"
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
                  label={{ value: "kWh", angle: -90, position: "insideLeft", fill: "#64748b" }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  tickFormatter={(v: number) => `PKR ${v.toFixed(0)}`}
                  label={{ value: "PKR", angle: 90, position: "insideRight", fill: "#64748b" }}
                />
                <Tooltip content={<PredictionTooltip />} />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="predicted_usage_kwh"
                  stroke="#6366f1"
                  strokeWidth={2}
                  name="Predicted Usage (kWh)"
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="predicted_cost_pkr"
                  stroke="#22c55e"
                  strokeWidth={2}
                  name="Predicted Cost (PKR)"
                  dot={false}
                />
                {filteredPredictions.some(p => p.actual_usage_kwh !== null) && (
                  <>
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="actual_usage_kwh"
                      stroke="#10b981"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="Actual Usage (kWh)"
                      dot={{ r: 4 }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="actual_cost_pkr"
                      stroke="#059669"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="Actual Cost (PKR)"
                      dot={{ r: 4 }}
                    />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recommendations Section */}
      <div className="mt-5">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-500" />
              AI Recommendations
            </h2>
            <div className="text-sm text-slate-600">
              Potential savings: <span className="font-semibold text-green-600">PKR {totalSavings.toLocaleString()}/month</span>
            </div>
          </div>
          
          <div className="space-y-4">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
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
                    {rec.icon}
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
                        {rec.priority === "high" ? "High Priority" : rec.priority === "medium" ? "Medium Priority" : "Low Priority"}
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
          
          <div className="mt-6 p-4 rounded-xl bg-indigo-50 ring-1 ring-indigo-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-indigo-600 mt-0.5" />
              <div>
                <div className="font-semibold text-indigo-900 mb-1">AI Model Coming Soon</div>
                <p className="text-sm text-indigo-700">
                  These predictions and recommendations are currently based on dummy data. 
                  Advanced AI models for accurate predictions and personalized recommendations will be implemented in the next phase.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

