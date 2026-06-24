import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
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
  TrendingUp,
  TrendingDown,
  Zap,
  Download,
  Sun,
  BarChart3,
  CalendarRange,
  Lightbulb,
  ArrowRight,
  Activity,
  RefreshCw,
} from "lucide-react";

type ChartRow = MonthlyReport;
type EnergyMetric = "kwh" | "cost";
type SortKey = "name" | "kwh" | "cost";

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
            <span className="tabular-nums text-slate-700">PKR {(row.cost_pkr / row.kwh).toFixed(2)}</span>
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

function FilterPill({
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
      className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-medium ring-1 transition ${
        active
          ? "bg-indigo-600 text-white ring-indigo-600 shadow-sm shadow-indigo-500/20"
          : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

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
    [deviceRowsRaw]
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
        detail: `${top.name} — ${top.kwh.toFixed(2)} kWh in ${label} (${deviceKwhTotal > 0 ? ((top.kwh / deviceKwhTotal) * 100).toFixed(0) : 0}% of usage shown).`,
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
      <AppShell>
        <div className="mx-auto max-w-6xl py-16 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-600 animate-pulse">
            <FileText className="h-6 w-6" />
          </div>
          <p className="mt-4 text-sm text-slate-500">Loading reports…</p>
        </div>
      </AppShell>
    );
  }

  if (error || !reports) {
    return (
      <AppShell>
        <div className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-3xl border border-dashed border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-slate-50 p-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/30">
              <FileText className="h-7 w-7" />
            </div>
            <p className="mt-5 text-lg font-semibold text-slate-900">No reports yet</p>
            <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              {error || "Add devices and collect telemetry to see monthly usage and cost summaries."}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-5 py-2.5 text-sm font-semibold shadow-md shadow-indigo-500/25 hover:bg-indigo-500 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
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
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Hero — 12-month summary */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900 text-white shadow-xl shadow-indigo-900/20">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/4 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" />
          <div className="relative p-6 md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-indigo-200">Usage history</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Energy reports</h1>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-indigo-100 ring-1 ring-white/10">
                    Rolling 12 months
                  </span>
                  {tariffPkrPerKwh != null && Number.isFinite(tariffPkrPerKwh) && (
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-indigo-100 ring-1 ring-white/10">
                      PKR {tariffPkrPerKwh.toFixed(2)} / kWh
                    </span>
                  )}
                  {selectedReport && (
                    <span className="rounded-full bg-indigo-500/30 px-3 py-1 text-xs font-medium text-indigo-100 ring-1 ring-indigo-400/30">
                      Viewing {selectedReport.month_name}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void load()}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => downloadCSV(reports, selectedMonth)}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-950 shadow-sm hover:bg-indigo-50 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Total usage</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {reports.total_kwh.toFixed(1)}
                  <span className="ml-1 text-lg font-semibold text-indigo-200">kWh</span>
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Total cost</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {reports.total_cost_pkr.toFixed(0)}
                  <span className="ml-1 text-lg font-semibold text-indigo-200">PKR</span>
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Avg monthly</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {reports.average_monthly_kwh.toFixed(1)}
                  <span className="ml-1 text-lg font-semibold text-indigo-200">kWh</span>
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Avg cost</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {reports.average_monthly_cost.toFixed(0)}
                  <span className="ml-1 text-lg font-semibold text-indigo-200">PKR</span>
                </p>
              </div>
            </div>

            {selectedReport && (
              <div className="mt-6 rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Selected month</p>
                    <p className="mt-1 text-xl font-bold">{selectedReport.month_name}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 sm:gap-8">
                    <div>
                      <p className="text-xs text-indigo-200/80">Energy</p>
                      <p className="text-2xl font-bold tabular-nums">{selectedReport.kwh.toFixed(2)} kWh</p>
                      {kwhDelta && prevMonthReport && (
                        <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${kwhDelta.up ? "text-amber-200" : "text-emerald-200"}`}>
                          {kwhDelta.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          {kwhDelta.text} vs {prevMonthReport.month_name}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-indigo-200/80">Cost</p>
                      <p className="text-2xl font-bold tabular-nums">PKR {selectedReport.cost_pkr.toFixed(0)}</p>
                      {costDelta && prevMonthReport && (
                        <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${costDelta.up ? "text-amber-200" : "text-emerald-200"}`}>
                          {costDelta.up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          {costDelta.text} vs {prevMonthReport.month_name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                {vsAvgKwh != null && Number.isFinite(vsAvgKwh) && (
                  <p className="mt-3 text-sm text-indigo-200/90">
                    {vsAvgKwh >= 0 ? "Above" : "Below"} your 12-month average by{" "}
                    <span className="font-semibold text-white">{Math.abs(vsAvgKwh).toFixed(1)}%</span> on usage.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Month picker */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/25">
                <CalendarRange className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">Pick a month</h2>
                <p className="text-xs text-slate-500">Tap a month to update device breakdown below</p>
              </div>
            </div>
            <Link
              to="/settings"
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500"
            >
              Edit tariff
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto pb-1 px-1">
            {reports.monthly_reports.map((m) => (
              <button
                key={m.month}
                type="button"
                onClick={() => setSelectedMonth(m.month)}
                className={`shrink-0 rounded-xl border px-4 py-3 text-left transition-all min-w-[7rem] ${
                  selectedMonth === m.month
                    ? "border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                    : "border-slate-200 bg-slate-50/50 hover:border-indigo-200 hover:bg-white"
                }`}
              >
                <p className={`text-sm font-semibold ${selectedMonth === m.month ? "text-white" : "text-slate-900"}`}>
                  {m.month_name.split(" ")[0]}
                </p>
                <p className={`mt-0.5 text-xs tabular-nums ${selectedMonth === m.month ? "text-indigo-100" : "text-slate-500"}`}>
                  {m.kwh.toFixed(1)} kWh
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* Insights */}
        {insights.length > 0 && (
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/25">
                <Lightbulb className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">Quick insights</h2>
                <p className="text-xs text-slate-500">Highlights from your usage history</p>
              </div>
            </div>
            <ul className="grid gap-3 sm:grid-cols-3">
              {insights.map((item) => (
                <li
                  key={item.title}
                  className="rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50 to-indigo-50/30 px-4 py-3"
                >
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">{item.detail}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Monthly trend chart */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/25">
                <BarChart3 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">Monthly trend</h2>
                <p className="text-xs text-slate-500">Click a bar to select that month</p>
              </div>
            </div>
            <div className="flex gap-2">
              <FilterPill active={energyMetric === "kwh"} onClick={() => setEnergyMetric("kwh")}>
                kWh
              </FilterPill>
              <FilterPill active={energyMetric === "cost"} onClick={() => setEnergyMetric("cost")}>
                Cost (PKR)
              </FilterPill>
            </div>
          </div>

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

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Device breakdown */}
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 lg:col-span-2">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/25">
                <Zap className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">By device</h2>
                <p className="text-xs text-slate-500">
                  {selectedReport
                    ? `Usage split for ${selectedReport.month_name}`
                    : "Breakdown by device"}
                </p>
              </div>
            </div>

            {deviceTableRows.length > 0 ? (
              <div className="grid gap-6 lg:grid-cols-5">
                <div className="lg:col-span-3 space-y-4">
                  <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
                    <table className="w-full min-w-[320px] text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                          <th className="px-4 py-3">
                            <button type="button" className="hover:text-indigo-600" onClick={() => toggleSort("name")}>
                              Device {sortKey === "name" ? (sortDesc ? "↓" : "↑") : ""}
                            </button>
                          </th>
                          <th className="px-4 py-3">Room</th>
                          <th className="px-4 py-3 text-right">
                            <button type="button" className="hover:text-indigo-600" onClick={() => toggleSort("kwh")}>
                              kWh {sortKey === "kwh" ? (sortDesc ? "↓" : "↑") : ""}
                            </button>
                          </th>
                          <th className="px-4 py-3 text-right">
                            <button type="button" className="hover:text-indigo-600" onClick={() => toggleSort("cost")}>
                              Cost {sortKey === "cost" ? (sortDesc ? "↓" : "↑") : ""}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {deviceTableRows.map((d) => (
                          <tr key={d.device_id} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="px-4 py-2.5 font-medium text-slate-900">{d.name}</td>
                            <td className="px-4 py-2.5 text-slate-600">{d.room || "—"}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{d.kwh.toFixed(2)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-medium text-indigo-700">
                              PKR {d.cost_pkr.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-3">
                    {deviceTableRows.map((d) => (
                      <div key={`bar-${d.device_id}`}>
                        <div className="mb-1 flex justify-between text-xs text-slate-500">
                          <span className="truncate pr-2 font-medium text-slate-700">{d.name}</span>
                          <span className="shrink-0 tabular-nums">{d.pctKwh.toFixed(0)}%</span>
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
                  <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500">Cost mix</p>
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
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center text-sm text-slate-500">
                No per-device usage for this month. Check that meters are online and sending readings.
              </div>
            )}
          </section>

          {/* Solar vs grid */}
          <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 lg:col-span-2">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/25">
                <Sun className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">Solar vs grid</h2>
                <p className="text-xs text-slate-500">Estimated 12-month energy source split</p>
              </div>
            </div>

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
                <div className="flex flex-col justify-center gap-3">
                  <div className="rounded-xl bg-gradient-to-br from-amber-50 to-white p-4 ring-1 ring-amber-100">
                    <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Solar (estimated)</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-amber-800">
                      {reports.solar_kwh.toFixed(2)} kWh
                    </p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-white p-4 ring-1 ring-indigo-100">
                    <p className="text-xs font-medium uppercase tracking-wide text-indigo-700">From grid</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-indigo-800">
                      {reports.grid_kwh.toFixed(2)} kWh
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/30 py-10 text-center text-sm text-slate-600">
                Enable solar in Settings to see an estimated split.
              </div>
            )}
          </section>
        </div>

        <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-xs text-slate-400">
          <Activity className="h-3.5 w-3.5" />
          Costs use your saved tariff · click chart bars or month chips to explore
        </p>
      </div>
    </AppShell>
  );
}
