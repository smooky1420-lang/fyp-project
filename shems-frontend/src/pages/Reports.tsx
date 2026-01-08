import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import StatCard from "../components/StatCard";
import { getMonthlyReports, type MonthlyReportsResult, clearTokens } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { FileText, Loader2, TrendingUp, Zap, Wallet, Download, Sun } from "lucide-react";

type ChartData = {
  month: string;
  month_name: string;
  kwh: number;
  cost_pkr: number;
};

const COLORS = ['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

function BarTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload as ChartData;
  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 shadow-lg p-3">
      <div className="text-sm font-semibold text-slate-900 mb-2">{data.month_name}</div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between items-center gap-4">
          <span className="text-slate-600">Usage:</span>
          <span className="font-semibold text-slate-900">{data.kwh.toFixed(2)} kWh</span>
        </div>
        <div className="flex justify-between items-center gap-4">
          <span className="text-slate-600">Cost:</span>
          <span className="font-semibold text-indigo-600">PKR {data.cost_pkr.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0];
  const total = data.payload?.total || (payload.reduce((sum: number, p: any) => sum + (p.value || 0), 0));
  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200 shadow-lg p-3">
      <div className="text-sm font-semibold text-slate-900 mb-2">{data.name}</div>
      <div className="space-y-1 text-xs">
        {data.payload?.kwh !== undefined ? (
          <>
            <div className="flex justify-between items-center gap-4">
              <span className="text-slate-600">Usage:</span>
              <span className="font-semibold text-slate-900">{data.payload.kwh.toFixed(2)} kWh</span>
            </div>
            <div className="flex justify-between items-center gap-4">
              <span className="text-slate-600">Cost:</span>
              <span className="font-semibold text-indigo-600">PKR {data.value.toFixed(2)}</span>
            </div>
          </>
        ) : (
          <div className="flex justify-between items-center gap-4">
            <span className="text-slate-600">Usage:</span>
            <span className="font-semibold text-slate-900">{data.value.toFixed(2)} kWh</span>
          </div>
        )}
        <div className="flex justify-between items-center gap-4">
          <span className="text-slate-600">Percentage:</span>
          <span className="font-semibold text-slate-900">{total > 0 ? ((data.value / total) * 100).toFixed(1) : 0}%</span>
        </div>
      </div>
    </div>
  );
}

function downloadCSV(data: MonthlyReportsResult) {
  const csvRows = [];
  
  // Header
  csvRows.push("Month,Usage (kWh),Cost (PKR)");
  
  // Monthly data
  data.monthly_reports.forEach(report => {
    csvRows.push(`${report.month_name},${report.kwh},${report.cost_pkr}`);
  });
  
  // Summary
  csvRows.push("");
  csvRows.push("Summary");
  csvRows.push(`Total Usage (kWh),${data.total_kwh}`);
  csvRows.push(`Total Cost (PKR),${data.total_cost_pkr}`);
  csvRows.push(`Average Monthly Usage (kWh),${data.average_monthly_kwh}`);
  csvRows.push(`Average Monthly Cost (PKR),${data.average_monthly_cost}`);
  
  // Device breakdown
  if (data.device_breakdown.length > 0) {
    csvRows.push("");
    csvRows.push("Device Breakdown");
    csvRows.push("Device Name,Room,Usage (kWh),Cost (PKR)");
    data.device_breakdown.forEach(device => {
      csvRows.push(`${device.name},${device.room || 'N/A'},${device.kwh},${device.cost_pkr}`);
    });
  }
  
  // Solar vs Grid
  if (data.solar_kwh > 0 || data.grid_kwh > 0) {
    csvRows.push("");
    csvRows.push("Energy Source");
    csvRows.push(`Solar (kWh),${data.solar_kwh}`);
    csvRows.push(`Grid (kWh),${data.grid_kwh}`);
  }
  
  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `energy-reports-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export default function Reports() {
  const nav = useNavigate();
  const [reports, setReports] = useState<MonthlyReportsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadReports() {
      try {
        const data = await getMonthlyReports();
        if (!alive) return;
        setReports(data);
        setError(null);
      } catch (err: unknown) {
        if (!alive) return;
        const msg = getErrorMessage(err);
        if (msg?.includes("Not authenticated")) {
          clearTokens();
          nav("/login");
        } else {
          setError(msg || "Failed to load reports");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadReports();

    return () => {
      alive = false;
    };
  }, [nav]);

  const chartData: ChartData[] = useMemo(() => {
    if (!reports) return [];
    return [...reports.monthly_reports].reverse(); // Show oldest to newest
  }, [reports]);

  const maxKwh = useMemo(() => {
    if (!chartData.length) return 0;
    return Math.max(...chartData.map((d) => d.kwh));
  }, [chartData]);

  const deviceChartData = useMemo(() => {
    if (!reports || !reports.device_breakdown.length) return [];
    const total = reports.device_breakdown.reduce((sum, d) => sum + d.cost_pkr, 0);
    return reports.device_breakdown.map(d => ({
      name: d.name,
      value: d.cost_pkr,
      kwh: d.kwh,
      total,
    }));
  }, [reports]);

  const solarGridData = useMemo(() => {
    if (!reports) return [];
    const total = reports.solar_kwh + reports.grid_kwh;
    if (total === 0) return [];
    return [
      { name: "Solar", value: reports.solar_kwh, total },
      { name: "Grid", value: reports.grid_kwh, total },
    ];
  }, [reports]);

  if (loading) {
    return (
      <AppShell title="Reports">
        <div className="text-center text-slate-600 flex items-center justify-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading reports...
        </div>
      </AppShell>
    );
  }

  if (error || !reports) {
    return (
      <AppShell title="Reports">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-8 text-center">
          <FileText className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">No Reports Available</h2>
          <p className="text-slate-600">{error || "No data available. Please add devices and collect telemetry data."}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Usage"
          value={`${reports.total_kwh.toFixed(2)} kWh`}
          subValue="Last 12 months"
          icon={<Zap className="h-5 w-5" />}
          color="green"
        />

        <StatCard
          title="Total Cost"
          value={`PKR ${reports.total_cost_pkr.toFixed(2)}`}
          subValue="Last 12 months"
          icon={<Wallet className="h-5 w-5" />}
          color="indigo"
        />

        <StatCard
          title="Avg Monthly Usage"
          value={`${reports.average_monthly_kwh.toFixed(2)} kWh`}
          subValue="Per month average"
          icon={<TrendingUp className="h-5 w-5" />}
          color="blue"
        />

        <StatCard
          title="Avg Monthly Cost"
          value={`PKR ${reports.average_monthly_cost.toFixed(2)}`}
          subValue="Per month average"
          icon={<Wallet className="h-5 w-5" />}
          color="purple"
        />
      </div>

      {/* Usage Chart */}
      <div className="mt-5">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Monthly Energy Usage</h2>
            <button
              type="button"
              onClick={() => reports && downloadCSV(reports)}
              className="rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-500 inline-flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 15, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="month_name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  domain={[0, Math.max(0.01, maxKwh * 1.1)]}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  tickFormatter={(v: number) => v.toFixed(1)}
                  label={{ value: "kWh", angle: -90, position: "insideLeft", fill: "#64748b" }}
                />
                <Tooltip content={<BarTooltip />} />
                <Bar dataKey="kwh" fill="#22c55e" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill="#22c55e" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {/* Device Cost Breakdown - Pie Chart */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
          <h2 className="font-semibold mb-4">Cost Breakdown by Device</h2>
          {deviceChartData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={deviceChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${percent ? (percent * 100).toFixed(0) : 0}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {deviceChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center text-slate-500 text-sm">
              No device data available
            </div>
          )}
        </div>

        {/* Solar vs Grid - Donut Chart */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Sun className="h-5 w-5 text-yellow-500" />
            Solar vs Grid
          </h2>
          {solarGridData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={solarGridData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value, percent }) => `${name}: ${value.toFixed(1)} kWh (${percent ? (percent * 100).toFixed(0) : 0}%)`}
                    outerRadius={100}
                    innerRadius={60}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    <Cell fill="#fbbf24" />
                    <Cell fill="#6366f1" />
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center text-slate-500 text-sm">
              No solar data available
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

