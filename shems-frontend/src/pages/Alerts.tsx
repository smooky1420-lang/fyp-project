import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import {
  clearAllAlerts,
  deleteAlerts,
  getAlerts,
  getActiveAlertCount,
  markAlertsRead,
  notificationPermission,
  notificationsEnabled,
  primeNotificationsForEnable,
  refreshAlerts,
  requestNotificationPermission,
  showTestNotification,
  type AlertRecord,
  type AlertType,
} from "../lib/alerts";
import { getErrorMessage } from "../lib/errors";
import {
  Check,
  Trash2,
  Bell,
  Loader2,
  RefreshCw,
  WifiOff,
  Zap,
  Gauge,
  AlertTriangle,
  Activity,
  ShieldCheck,
} from "lucide-react";

type FilterMode = "all" | "unread" | "active" | "history" | "offline" | "high" | "limit";

const TYPE_META: Record<
  AlertType,
  { label: string; icon: React.ReactNode; accent: string; ring: string; bg: string }
> = {
  offline: {
    label: "Offline",
    icon: <WifiOff className="h-5 w-5" />,
    accent: "text-amber-700",
    ring: "ring-amber-200",
    bg: "bg-amber-50",
  },
  high: {
    label: "High usage",
    icon: <Zap className="h-5 w-5" />,
    accent: "text-orange-700",
    ring: "ring-orange-200",
    bg: "bg-orange-50",
  },
  limit: {
    label: "Power limit",
    icon: <Gauge className="h-5 w-5" />,
    accent: "text-red-700",
    ring: "ring-red-200",
    bg: "bg-red-50",
  },
  daily_limit: {
    label: "Daily limit",
    icon: <AlertTriangle className="h-5 w-5" />,
    accent: "text-rose-700",
    ring: "ring-rose-200",
    bg: "bg-rose-50",
  },
};

function formatWhen(iso: string) {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  const sec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (sec < 60) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function AlertsPage() {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [alerts, setAlerts] = useState<AlertRecord[]>(() => getAlerts());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState(notificationPermission);
  const [notifOn, setNotifOn] = useState(() => notificationsEnabled());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await refreshAlerts();
      setAlerts(items);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Failed to load alerts");
      setAlerts(getAlerts());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => void 0);
    const id = window.setInterval(() => {
      load().catch(() => void 0);
    }, 10_000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onChange = () => setAlerts(getAlerts());
    window.addEventListener("shems-alerts-changed", onChange);
    return () => window.removeEventListener("shems-alerts-changed", onChange);
  }, []);

  const counts = useMemo(() => {
    const unread = alerts.filter((a) => !a.read).length;
    const active = alerts.filter((a) => a.active).length;
    const history = alerts.filter((a) => !a.active).length;
    const offline = alerts.filter((a) => a.type === "offline").length;
    const high = alerts.filter((a) => a.type === "high").length;
    const limits = alerts.filter((a) => a.type === "limit" || a.type === "daily_limit").length;
    return { total: alerts.length, unread, active, history, offline, high, limits };
  }, [alerts]);

  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (filter === "unread") return !a.read;
      if (filter === "active") return a.active;
      if (filter === "history") return !a.active;
      if (filter === "offline") return a.type === "offline";
      if (filter === "high") return a.type === "high";
      if (filter === "limit") return a.type === "limit" || a.type === "daily_limit";
      return true;
    });
  }, [alerts, filter]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected]
  );

  function toggle(id: string) {
    setSelected((p) => ({ ...p, [id]: !p[id] }));
  }

  function selectAllVisible() {
    const m: Record<string, boolean> = {};
    filtered.forEach((a) => (m[a.id] = true));
    setSelected(m);
  }

  function clearSelection() {
    setSelected({});
  }

  function afterMutation() {
    setAlerts(getAlerts());
    clearSelection();
  }

  async function handleMarkRead() {
    await markAlertsRead(selectedIds);
    afterMutation();
  }

  async function handleDismiss() {
    await deleteAlerts(selectedIds);
    afterMutation();
  }

  async function handleDismissAll() {
    await clearAllAlerts();
    afterMutation();
  }

  const allHealthy = !loading && getActiveAlertCount() === 0;

  async function enableNotifications() {
    const result = await requestNotificationPermission();
    setNotifPermission(result);
    const granted = result === "granted";
    setNotifOn(granted);
    if (!granted) return;

    primeNotificationsForEnable();
    showTestNotification();
    const items = await refreshAlerts();
    setAlerts(items);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-rose-950 to-red-950 text-white shadow-xl shadow-rose-900/20">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-rose-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/4 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />
          <div className="relative p-6 md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-rose-200">Stay informed</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Alerts</h1>
                <p className="mt-2 max-w-lg text-sm text-rose-200/90 leading-relaxed">
                  Stored alert history with desktop notifications when something needs attention. Refreshed every 10 seconds.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {allHealthy ? (
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-400/30">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      All clear
                    </span>
                  ) : counts.unread > 0 ? (
                    <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/25 px-3 py-1 text-xs font-semibold text-amber-100 ring-1 ring-amber-400/30">
                      <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                      {counts.unread} unread
                    </span>
                  ) : counts.active > 0 ? (
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-rose-100 ring-1 ring-white/10">
                      {counts.active} active
                    </span>
                  ) : counts.history > 0 ? (
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-rose-100 ring-1 ring-white/10">
                      {counts.history} in history
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                {notifPermission === "denied" && (
                  <span className="inline-flex max-w-xs items-center gap-2 rounded-xl bg-red-500/20 px-3 py-2 text-xs text-red-100 ring-1 ring-red-400/30">
                    Notifications blocked. Allow WattGuard in browser site settings.
                  </span>
                )}
                {notifPermission !== "unsupported" && notifPermission !== "granted" && notifPermission !== "denied" && (
                  <button
                    type="button"
                    onClick={() => void enableNotifications()}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-500/90 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 transition-colors"
                  >
                    <Bell className="h-4 w-4" />
                    Enable notifications
                  </button>
                )}
                {notifOn && notifPermission === "granted" && (
                  <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-100 ring-1 ring-emerald-400/30">
                    Desktop alerts on
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => load()}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-rose-200">Active</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">{counts.active}</p>
                <p className="mt-1 text-xs text-rose-200/80">need action now</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-rose-200">History</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">{counts.history}</p>
                <p className="mt-1 text-xs text-rose-200/80">resolved (7 days)</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-rose-200">Offline</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">{counts.offline}</p>
                <p className="mt-1 text-xs text-rose-200/80">device alerts</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-rose-200">Limits</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">{counts.limits + counts.high}</p>
                <p className="mt-1 text-xs text-rose-200/80">usage & caps</p>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
            {error}
          </div>
        )}

        {/* Filters & actions */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600 text-white shadow-md shadow-rose-500/25">
                <Bell className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">Notifications</h2>
                <p className="text-xs text-slate-500">
                  {filtered.length} shown · {selectedIds.length} selected
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "All"],
                  ["unread", "Unread"],
                  ["active", "Active"],
                  ["history", "History"],
                  ["offline", "Offline"],
                  ["high", "High usage"],
                  ["limit", "Limits"],
                ] as const
              ).map(([key, label]) => (
                <FilterPill key={key} active={filter === key} onClick={() => setFilter(key)}>
                  {label}
                </FilterPill>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={selectAllVisible}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Select visible
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={!selectedIds.length}
              onClick={() => void handleMarkRead()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 transition-colors"
            >
              <Check className="h-4 w-4" />
              Mark read
            </button>
            <button
              type="button"
              disabled={!selectedIds.length}
              onClick={() => void handleDismiss()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => void handleDismissAll()}
              className="ml-auto rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Dismiss all
            </button>
          </div>
        </section>

        {/* Alert list */}
        <div className="space-y-3">
          {loading && !filtered.length ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-16">
              <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
              <p className="mt-3 text-sm text-slate-500">Loading alerts…</p>
            </div>
          ) : filtered.length ? (
            filtered.map((a) => (
              <AlertRow key={a.id} a={a} checked={!!selected[a.id]} onToggle={() => toggle(a.id)} />
            ))
          ) : allHealthy ? (
            <div className="relative overflow-hidden rounded-3xl border border-dashed border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-slate-50 p-10 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-500/30">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <p className="mt-5 text-lg font-semibold text-slate-900">You&apos;re all caught up</p>
              <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                No active alerts right now. Past events stay in History for 7 days. Enable desktop notifications to catch issues while you work elsewhere.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
              <Bell className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">No alerts in this filter</p>
              <p className="mt-1 text-xs text-slate-500">Try another category or refresh.</p>
            </div>
          )}
        </div>

        <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-xs text-slate-400">
          <Activity className="h-3.5 w-3.5" />
          Alerts refresh automatically every 10 seconds
        </p>
      </div>
    </AppShell>
  );
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
      className={`rounded-xl px-3.5 py-2 text-sm font-medium ring-1 transition ${
        active
          ? "bg-indigo-600 text-white ring-indigo-600 shadow-sm shadow-indigo-500/20"
          : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function AlertRow({
  a,
  checked,
  onToggle,
}: {
  a: AlertRecord;
  checked: boolean;
  onToggle: () => void;
}) {
  const meta = TYPE_META[a.type] ?? TYPE_META.high;

  return (
    <article
      className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 transition-all ${
        a.read ? "ring-slate-200/80" : "ring-amber-300/80 shadow-amber-100/50"
      } ${!a.active ? "opacity-90" : ""}`}
    >
      <div className="flex gap-4 p-4 md:p-5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          aria-label={`Select alert: ${a.title}`}
        />
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${meta.bg} ${meta.ring} ${meta.accent}`}
        >
          {meta.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-900">{a.title}</h3>
              {!a.read && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                  New
                </span>
              )}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${meta.bg} ${meta.ring} ${meta.accent}`}>
                {meta.label}
              </span>
              {!a.active && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
                  Resolved
                </span>
              )}
            </div>
            <time className="shrink-0 text-xs text-slate-500" dateTime={a.created_at}>
              {formatWhen(a.created_at)}
              {a.resolved_at ? ` · cleared ${formatWhen(a.resolved_at)}` : ""}
            </time>
          </div>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">{a.message}</p>
        </div>
      </div>
      {!a.read && <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-400" />}
    </article>
  );
}
