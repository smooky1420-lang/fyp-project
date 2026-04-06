import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import StatCard from "../components/StatCard";
import {
  getMonthlyReports,
  getUserSettings,
  type MonthlyReportsResult,
  type MonthlyReport,
  clearTokens,
} from "../lib/api";
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
import {
  FileText,
  Loader2,
  TrendingUp,
  TrendingDown,
  Zap,
  Wallet,
  Download,
  Sun,
  BarChart3,
  CalendarRange,
  Lightbulb,
  ArrowRight,
  ChevronDown,
} from "lucide-react";

type ChartRow = MonthlyReport;

type EnergyMetric = "kwh" | "cost";

const PIE_COLORS = [
  "#4f46e5",
  "#6366f1",
  "#818cf8",
  "#22c55e",
  "#0ea5e9",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
];

function formatDeltaPct(current: number, previous: number): { text: string; up: boolean } | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct > 0;
  return { text: `${up ? "+" : ""}${pct.toFixed(1)}%`, up };
}

function BarTooltipContent({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
  metric: EnergyMetric;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <div className="text-sm font-semibold text-slate-900">{row.month_name}</div>
      <div className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between gap-6">
          <span className="text-slate-500">Usage</span>
          <span className="font-medium tabular-nums text-slate-900">{row.kwh.toFixed(2)} kWh</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-slate-500">Cost</span>
          <span className="font-medium tabular-nums text-indigo-600">PKR {row.cost_pkr.toFixed(2)}</span>
        </div>
        {metric === "kwh" && row.kwh > 0 && (
          <div className="flex justify-between gap-6 border-t border-slate-100 pt-1">
            <span className="text-slate-500">PKR / kWh</span>
            <span className="tabular-nums text-slate-700">
              PKR {(row.cost_pkr / row.kwh).toFixed(2)}
            </span>
          </div>
        )}
      </div>
      <p className="mt-2 text-[10px] text-slate-400">Click the bar to inspect that month below.</p>
    </div>
  );
}

function PieTooltip({
  active,
  payload,
  mode,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    payload?: { kwh?: number; total?: number };
  }>;
  mode: "device" | "source";
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const name = p.name ?? "—";
  const value = p.value ?? 0;
  const total = p.payload?.total ?? value;
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg text-xs">
      <div className="font-semibold text-slate-900">{name}</div>
      {mode === "device" && p.payload?.kwh !== undefined && (
        <div className="mt-1 flex justify-between gap-4">
          <span className="text-slate-500">Usage</span>
          <span className="font-medium tabular-nums">{p.payload.kwh.toFixed(2)} kWh</span>
        </div>
      )}
      <div className="mt-1 flex justify-between gap-4">
        <span className="text-slate-500">{mode === "device" ? "Cost" : "kWh"}</span>
        <span className="font-medium tabular-nums text-indigo-600">
          {mode === "device" ? `PKR ${value.toFixed(2)}` : `${value.toFixed(2)} kWh`}
        </span>
      </div>
      <div className="mt-1 flex justify-between gap-4 border-t border-slate-100 pt-1">
        <span className="text-slate-500">Share</span>
        <span className="font-medium tabular-nums">{pct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

function downloadCSV(data: MonthlyReportsResult, selectedMonth: string | null) {
  const csvRows: string[] = [];
  csvRows.push("Month,Usage (kWh),Cost (PKR)");
  data.monthly_reports.forEach((report) => {
    csvRows.push(`${report.month_name},${report.kwh},${report.cost_pkr}`);
  });
  csvRows.push("");
  csvRows.push("Summary");
  csvRows.push(`Total Usage (kWh),${data.total_kwh}`);
  csvRows.push(`Total Cost (PKR),${data.total_cost_pkr}`);
  csvRows.push(`Average Monthly Usage (kWh),${data.average_monthly_kwh}`);
  csvRows.push(`Average Monthly Cost (PKR),${data.average_monthly_cost}`);

  if (data.device_breakdown.length > 0) {
    csvRows.push("");
    csvRows.push("Device breakdown (12-month totals)");
    csvRows.push("Device Name,Room,Usage (kWh),Cost (PKR)");
    data.device_breakdown.forEach((device) => {
      csvRows.push(`${device.name},${device.room || "N/A"},${device.kwh},${device.cost_pkr}`);
    });
  }

  if (selectedMonth && data.device_monthly_breakdown?.length) {
    const entry = data.device_monthly_breakdown.find((m) => m.month === selectedMonth);
    if (entry?.devices.length) {
      csvRows.push("");
      csvRows.push(`Device breakdown for ${entry.month_name}`);
      csvRows.push("Device Name,Room,Usage (kWh),Cost (PKR)");
      entry.devices.forEach((device) => {
        csvRows.push(`${device.name},${device.room || "N/A"},${device.kwh},${device.cost_pkr}`);
      });
    }
  }

  if (data.solar_kwh > 0 || data.grid_kwh > 0) {
    csvRows.push("");
    csvRows.push("Energy source (estimated 12-mo)");
    csvRows.push(`Solar (kWh),${data.solar_kwh}`);
    csvRows.push(`Grid (kWh),${data.grid_kwh}`);
  }

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `energy-reports-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

type SortKey = "name" | "kwh" | "cost";

export default function Reports() {
  const nav = useNavigate();
  const [reports, setReports] = useState<MonthlyReportsResult | null>(null);
  const [tariffPkrPerKwh, setTariffPkrPerKwh] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [energyMetric, setEnergyMetric] = useState<EnergyMetric>("kwh");
  const [sortKey, setSortKey] = useState<SortKey>("cost");
  const [sortDesc, setSortDesc] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, settings] = await Promise.all([
        getMonthlyReports(),
        getUserSettings().catch(() => null),
      ]);
      setReports(data);
      setSelectedMonth((prev) => prev ?? data.monthly_reports[0]?.month ?? null);
      if (settings) {
        const t = Number(settings.tariff_pkr_per_kwh);
        setTariffPkrPerKwh(Number.isFinite(t) ? t : null);
      }
    } catch (err: unknown) {
      const msg = getErrorMessage(err);
      if (msg?.includes("Not authenticated")) {
        clearTokens();
        nav("/login");
      } else {
        setError(msg || "Failed to load reports");
      }
    } finally {
      setLoading(false);
    }
  }, [nav]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartRowsChrono = useMemo(() => {
    if (!reports) return [];
    return [...reports.monthly_reports].reverse();
  }, [reports]);

  const maxBarKwh = useMemo(() => {
    if (!chartRowsChrono.length) return 0;
    return Math.max(...chartRowsChrono.map((d) => d.kwh), 0.01);
  }, [chartRowsChrono]);

  const maxBarCost = useMemo(() => {
    if (!chartRowsChrono.length) return 0;
    return Math.max(...chartRowsChrono.map((d) => d.cost_pkr), 0.01);
  }, [chartRowsChrono]);

  const selectedReport = useMemo(() => {
    if (!reports || !selectedMonth) return null;
    return reports.monthly_reports.find((m) => m.month === selectedMonth) ?? null;
  }, [reports, selectedMonth]);

  const prevMonthReport = useMemo(() => {
    if (!selectedReport || !chartRowsChrono.length) return null;
    const idx = chartRowsChrono.findIndex((r) => r.month === selectedReport.month);
    if (idx <= 0) return null;
    return chartRowsChrono[idx - 1];
  }, [selectedReport, chartRowsChrono]);

  const deviceRowsRaw = useMemo(() => {
    if (!reports) return [];
    const monthKey = selectedMonth;
    let devices = reports.device_breakdown;
    if (monthKey && reports.device_monthly_breakdown?.length) {
      const entry = reports.device_monthly_breakdown.find((m) => m.month === monthKey);
      if (entry?.devices.length) devices = entry.devices;
    }
    return devices;
  }, [reports, selectedMonth]);

  const deviceKwhTotal = useMemo(
    () => deviceRowsRaw.reduce((s, d) => s + d.kwh, 0),
    [deviceRowsRaw],
  );

  const deviceChartData = useMemo(() => {
    if (!deviceRowsRaw.length) return [];
    const total = deviceRowsRaw.reduce((sum, d) => sum + d.cost_pkr, 0);
    return deviceRowsRaw.map((d) => ({
      name: d.name,
      value: d.cost_pkr,
      kwh: d.kwh,
      total,
    }));
  }, [deviceRowsRaw]);

  const deviceTableRows = useMemo(() => {
    const rows = deviceRowsRaw.map((d) => ({
      ...d,
      pctKwh: deviceKwhTotal > 0 ? (d.kwh / deviceKwhTotal) * 100 : 0,
    }));
    const mul = sortDesc ? -1 : 1;
    return [...rows].sort((a, b) => {
      if (sortKey === "name") return mul * a.name.localeCompare(b.name);
      if (sortKey === "kwh") return mul * (a.kwh - b.kwh);
      return mul * (a.cost_pkr - b.cost_pkr);
    });
  }, [deviceRowsRaw, deviceKwhTotal, sortKey, sortDesc]);

  const solarGridData = useMemo(() => {
    if (!reports) return [];
    const total = reports.solar_kwh + reports.grid_kwh;
    if (total === 0) return [];
    return [
      { name: "Solar (est.)", value: reports.solar_kwh, total },
      { name: "Grid", value: reports.grid_kwh, total },
    ];
  }, [reports]);

  const insights = useMemo(() => {
    if (!reports || !chartRowsChrono.length) return [];
    const items: { title: string; detail: string }[] = [];
    let peak = chartRowsChrono[0];
    for (const r of chartRowsChrono) {
      if (r.kwh > peak.kwh) peak = r;
    }
    items.push({
      title: "Peak usage month",
      detail: `${peak.month_name}: ${peak.kwh.toFixed(1)} kWh (PKR ${peak.cost_pkr.toFixed(0)})`,
    });
    if (chartRowsChrono.length >= 2) {
      const last = chartRowsChrono[chartRowsChrono.length - 1];
      const prev = chartRowsChrono[chartRowsChrono.length - 2];
      const d = formatDeltaPct(last.kwh, prev.kwh);
      if (d) {
        const pct = Math.abs(parseFloat(d.text));
        items.push({
          title: "Latest vs previous month",
          detail: `${d.up ? "Usage rose" : "Usage fell"} ${Number.isFinite(pct) ? pct.toFixed(1) : d.text}% from ${prev.month_name} to ${last.month_name}.`,
        });
      }
    }
    if (deviceRowsRaw.length) {
      const top = [...deviceRowsRaw].sort((a, b) => b.kwh - a.kwh)[0];
      const label = selectedReport?.month_name ?? "this period";
      items.push({
        title: "Largest consumer",
        detail: `${top.name} — ${top.kwh.toFixed(2)} kWh in ${label} (${deviceKwhTotal > 0 ? ((top.kwh / deviceKwhTotal) * 100).toFixed(0) : 0}% of usage shown in this view).`,
      });
    }
    return items;
  }, [reports, chartRowsChrono, deviceRowsRaw, deviceKwhTotal, selectedReport]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(key !== "name");
    }
  };

  const barDataKey = energyMetric === "kwh" ? "kwh" : "cost_pkr";
  const barMax = energyMetric === "kwh" ? maxBarKwh : maxBarCost;
  const yTickFormatter = (v: number) =>
    energyMetric === "kwh" ? v.toFixed(0) : `₨${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`;

  if (loading) {
    return (
      <AppShell title="Reports">
        <div className="flex items-center justify-center gap-2 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Loading reports…
        </div>
      </AppShell>
    );
  }

  if (error || !reports) {
    return (
      <AppShell title="Reports">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <FileText className="mx-auto mb-4 h-12 w-12 text-slate-400" aria-hidden />
          <h2 className="mb-2 text-xl font-semibold text-slate-900">No reports available</h2>
          <p className="text-slate-600">{error || "Add devices and collect telemetry to see monthly summaries."}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-6 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Retry
          </button>
        </div>
      </AppShell>
    );
  }

  const kwhDelta = selectedReport && prevMonthReport ? formatDeltaPct(selectedReport.kwh, prevMonthReport.kwh) : null;
  const costDelta =
    selectedReport && prevMonthReport ? formatDeltaPct(selectedReport.cost_pkr, prevMonthReport.cost_pkr) : null;
  const vsAvgKwh =
    selectedReport && reports.average_monthly_kwh > 0
      ? ((selectedReport.kwh - reports.average_monthly_kwh) / reports.average_monthly_kwh) * 100
      : null;

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Intro */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-slate-500">
              Your home&apos;s energy and cost over the last twelve months, using your tariff. Pick a month with the
              chips below to see how usage splits across devices.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              {tariffPkrPerKwh != null && Number.isFinite(tariffPkrPerKwh) && (
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600">
                  Tariff: PKR {tariffPkrPerKwh.toFixed(2)} / kWh
                </span>
              )}
              <Link
                to="/settings"
                className="inline-flex items-center gap-1 rounded-full text-indigo-600 hover:text-indigo-500"
              >
                Edit in settings
                <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={() => downloadCSV(reports, selectedMonth)}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/20 hover:bg-indigo-500"
          >
            <Download className="h-4 w-4" aria-hidden />
            Export CSV
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total usage"
            value={`${reports.total_kwh.toFixed(2)} kWh`}
            subValue="Rolling 12 months"
            icon={<Zap className="h-5 w-5" />}
            color="green"
          />
          <StatCard
            title="Total cost"
            value={`PKR ${reports.total_cost_pkr.toFixed(2)}`}
            subValue="Rolling 12 months"
            icon={<Wallet className="h-5 w-5" />}
            color="indigo"
          />
          <StatCard
            title="Avg monthly usage"
            value={`${reports.average_monthly_kwh.toFixed(2)} kWh`}
            subValue="Mean per month in window"
            icon={<TrendingUp className="h-5 w-5" />}
            color="blue"
          />
          <StatCard
            title="Avg monthly cost"
            value={`PKR ${reports.average_monthly_cost.toFixed(2)}`}
            subValue="Mean per month in window"
            icon={<Wallet className="h-5 w-5" />}
            color="purple"
          />
        </div>

        {/* Month spotlight */}
        {selectedReport && (
          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-indigo-50/30 to-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                  Selected month
                </div>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">{selectedReport.month_name}</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-slate-500">Energy</div>
                    <div className="text-xl font-semibold tabular-nums text-slate-900">
                      {selectedReport.kwh.toFixed(2)} kWh
                    </div>
                    {kwhDelta && prevMonthReport && (
                      <div
                        className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${
                          kwhDelta.up ? "text-amber-700" : "text-emerald-700"
                        }`}
                      >
                        {kwhDelta.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {kwhDelta.text} vs {prevMonthReport.month_name}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Cost</div>
                    <div className="text-xl font-semibold tabular-nums text-indigo-700">
                      PKR {selectedReport.cost_pkr.toFixed(2)}
                    </div>
                    {costDelta && prevMonthReport && (
                      <div
                        className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${
                          costDelta.up ? "text-amber-700" : "text-emerald-700"
                        }`}
                      >
                        {costDelta.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {costDelta.text} vs {prevMonthReport.month_name}
                      </div>
                    )}
                  </div>
                </div>
                {vsAvgKwh != null && Number.isFinite(vsAvgKwh) && (
                  <p className="mt-4 text-sm text-slate-600">
                    {vsAvgKwh >= 0 ? "Above" : "Below"} your 12-month average by{" "}
                    <span className="font-semibold tabular-nums text-slate-900">{Math.abs(vsAvgKwh).toFixed(1)}%</span>{" "}
                    on usage.
                  </p>
                )}
              </div>

              <div className="flex w-full flex-col gap-2 lg:max-w-md">
                <span className="text-xs font-medium text-slate-500">Jump to month</span>
                <div className="flex flex-wrap gap-2">
                  {reports.monthly_reports.map((m) => (
                    <button
                      key={m.month}
                      type="button"
                      onClick={() => setSelectedMonth(m.month)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        selectedMonth === m.month
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "border border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/50"
                      }`}
                    >
                      {m.month_name}
                    </button>
                  ))}
                </div>
                <label className="mt-2 flex flex-col gap-1.5 text-xs text-slate-500 sm:flex-row sm:items-center sm:gap-2">
                  <span className="shrink-0 font-medium text-slate-600">Or choose</span>
                  <div className="relative min-w-0 flex-1">
                    <select
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-9 text-sm text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
                      value={selectedMonth ?? reports.monthly_reports[0]?.month ?? ""}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                    >
                      {reports.monthly_reports.map((m) => (
                        <option key={m.month} value={m.month}>
                          {m.month_name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  </div>
                </label>
              </div>
            </div>
          </section>
        )}

        {/* Insights */}
        {insights.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                <Lightbulb className="h-4 w-4" aria-hidden />
              </span>
              <h3 className="text-sm font-semibold text-slate-900">Quick insights</h3>
            </div>
            <ul className="space-y-2 text-sm text-slate-600">
              {insights.map((item) => (
                <li key={item.title} className="flex gap-2 border-l-2 border-indigo-200 pl-3">
                  <span className="shrink-0 font-medium text-slate-800">{item.title}:</span>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Main chart */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-600" aria-hidden />
              <h2 className="font-semibold text-slate-900">Monthly trend</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="inline-flex rounded-xl border border-slate-200 p-0.5 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setEnergyMetric("kwh")}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    energyMetric === "kwh" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  kWh
                </button>
                <button
                  type="button"
                  onClick={() => setEnergyMetric("cost")}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    energyMetric === "cost" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Cost (PKR)
                </button>
              </div>
            </div>
          </div>
          <p className="mb-4 text-xs text-slate-500">
            Bars are oldest → newest. Click a bar to select that month for the device table and pie.
          </p>
          <div className="h-80 w-full min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRowsChrono} margin={{ top: 8, right: 8, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="month_name"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={56}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  domain={[0, barMax * 1.08]}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  tickFormatter={yTickFormatter}
                  width={52}
                  label={{
                    value: energyMetric === "kwh" ? "kWh" : "PKR",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#94a3b8",
                    style: { fontSize: 11 },
                  }}
                />
                <Tooltip content={<BarTooltipContent metric={energyMetric} />} />
                <Bar
                  dataKey={barDataKey}
                  radius={[6, 6, 0, 0]}
                  cursor="pointer"
                  onClick={(cellData: { payload?: ChartRow } & Partial<ChartRow>) => {
                    const month = cellData.payload?.month ?? cellData.month;
                    if (month) setSelectedMonth(month);
                  }}
                >
                  {chartRowsChrono.map((d) => (
                    <Cell
                      key={d.month}
                      fill={selectedMonth === d.month ? "#4f46e5" : energyMetric === "kwh" ? "#a5b4fc" : "#818cf8"}
                      opacity={selectedMonth === d.month ? 1 : 0.92}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Device table + pie */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">By device</h2>
                <p className="text-xs text-slate-500">
                  {selectedReport
                    ? `Shares for ${selectedReport.month_name} (or 12-mo totals if no per-month data).`
                    : "Breakdown by device."}
                </p>
              </div>
            </div>

            {deviceTableRows.length > 0 ? (
              <div className="grid gap-6 lg:grid-cols-5">
                <div className="overflow-x-auto lg:col-span-3">
                  <table className="w-full min-w-[320px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                        <th className="pb-2 pr-2">
                          <button type="button" className="hover:text-indigo-600" onClick={() => toggleSort("name")}>
                            Device {sortKey === "name" ? (sortDesc ? "↓" : "↑") : ""}
                          </button>
                        </th>
                        <th className="pb-2 pr-2">Room</th>
                        <th className="pb-2 pr-2 text-right">
                          <button type="button" className="hover:text-indigo-600" onClick={() => toggleSort("kwh")}>
                            kWh {sortKey === "kwh" ? (sortDesc ? "↓" : "↑") : ""}
                          </button>
                        </th>
                        <th className="pb-2 text-right">
                          <button type="button" className="hover:text-indigo-600" onClick={() => toggleSort("cost")}>
                            Cost {sortKey === "cost" ? (sortDesc ? "↓" : "↑") : ""}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {deviceTableRows.map((d) => (
                        <tr key={d.device_id} className="border-b border-slate-100 last:border-0">
                          <td className="py-2.5 pr-2 font-medium text-slate-900">{d.name}</td>
                          <td className="py-2.5 pr-2 text-slate-600">{d.room || "—"}</td>
                          <td className="py-2.5 pr-2 text-right tabular-nums text-slate-800">{d.kwh.toFixed(2)}</td>
                          <td className="py-2.5 text-right tabular-nums text-indigo-700">
                            PKR {d.cost_pkr.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-4 space-y-2">
                    {deviceTableRows.map((d) => (
                      <div key={`bar-${d.device_id}`}>
                        <div className="mb-0.5 flex justify-between text-xs text-slate-500">
                          <span className="truncate pr-2">{d.name}</span>
                          <span className="shrink-0 tabular-nums">{d.pctKwh.toFixed(0)}% of usage</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-indigo-500 transition-all"
                            style={{ width: `${Math.min(100, d.pctKwh)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="min-h-[260px] lg:col-span-2">
                  <h3 className="mb-2 text-center text-xs font-medium text-slate-500">Cost mix</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={deviceChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={88}
                        paddingAngle={1}
                        dataKey="value"
                        nameKey="name"
                      >
                        {deviceChartData.map((_, index) => (
                          <Cell key={`c-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip mode="device" />} />
                      <Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 py-12 text-center text-sm text-slate-500">
                No per-device usage for this view. Check that devices are online and sending readings for the selected
                month.
              </div>
            )}
          </section>

          {/* Solar vs grid */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
            <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
              <Sun className="h-5 w-5 text-amber-500" aria-hidden />
              Solar vs grid (estimated)
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Solar share uses your saved capacity and a simple yield model; grid is the remainder of total usage.
            </p>
            {solarGridData.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={solarGridData}
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={88}
                        dataKey="value"
                        nameKey="name"
                      >
                        <Cell fill="#fbbf24" />
                        <Cell fill="#4f46e5" />
                      </Pie>
                      <Tooltip content={<PieTooltip mode="source" />} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col justify-center space-y-3 text-sm">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="text-xs text-slate-500">Solar (estimated)</div>
                    <div className="text-lg font-semibold tabular-nums text-amber-700">
                      {reports.solar_kwh.toFixed(2)} kWh
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="text-xs text-slate-500">From grid</div>
                    <div className="text-lg font-semibold tabular-nums text-indigo-700">
                      {reports.grid_kwh.toFixed(2)} kWh
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 py-10 text-center text-sm text-slate-500">
                Enable solar in settings to see an estimated split.
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
