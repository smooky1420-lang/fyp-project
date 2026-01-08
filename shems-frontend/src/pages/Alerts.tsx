import { useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import {
  clearAllAlerts,
  deleteAlerts,
  getAlerts,
  markAlertsRead,
  type AlertRecord,
} from "../lib/alerts";
import { Check, Trash2, Bell } from "lucide-react";

type FilterMode = "all" | "unread" | "offline" | "high";

export default function AlertsPage() {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const alerts = useMemo(() => getAlerts(), []);
  const filtered = useMemo(() => {
    return alerts.filter((a) => {
      if (filter === "unread") return !a.read;
      if (filter === "offline") return a.type === "offline";
      if (filter === "high") return a.type === "high";
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

  return (
    <AppShell>
      <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="font-semibold flex items-center gap-2">
              <Bell className="h-4 w-4 text-slate-500" />
              Notifications & Alerts
            </div>
            <div className="text-sm text-slate-600 mt-1">
              Filter, mark as read, or delete alerts.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterBtn active={filter === "all"} onClick={() => setFilter("all")}>All</FilterBtn>
            <FilterBtn active={filter === "unread"} onClick={() => setFilter("unread")}>Unread</FilterBtn>
            <FilterBtn active={filter === "offline"} onClick={() => setFilter("offline")}>Offline</FilterBtn>
            <FilterBtn active={filter === "high"} onClick={() => setFilter("high")}>High Usage</FilterBtn>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={selectAllVisible}
            className="rounded-xl bg-white ring-1 ring-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Select visible
          </button>

          <button
            type="button"
            onClick={clearSelection}
            className="rounded-xl bg-white ring-1 ring-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Clear selection
          </button>

          <button
            type="button"
            disabled={!selectedIds.length}
            onClick={() => {
              markAlertsRead(selectedIds);
              window.location.reload(); // simple refresh (deadline-safe)
            }}
            className="rounded-xl bg-emerald-600 text-white px-3 py-2 text-sm hover:bg-emerald-500 disabled:opacity-60 inline-flex items-center gap-2"
          >
            <Check className="h-4 w-4" />
            Mark read
          </button>

          <button
            type="button"
            disabled={!selectedIds.length}
            onClick={() => {
              deleteAlerts(selectedIds);
              window.location.reload();
            }}
            className="rounded-xl bg-red-600 text-white px-3 py-2 text-sm hover:bg-red-500 disabled:opacity-60 inline-flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>

          <button
            type="button"
            onClick={() => {
              clearAllAlerts();
              window.location.reload();
            }}
            className="ml-auto rounded-xl bg-slate-900 text-white px-3 py-2 text-sm hover:bg-slate-800"
          >
            Clear all
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {filtered.length ? (
            filtered.map((a) => (
              <AlertRow key={a.id} a={a} checked={!!selected[a.id]} onToggle={() => toggle(a.id)} />
            ))
          ) : (
            <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4 text-sm text-slate-600">
              No alerts found for this filter.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function FilterBtn({
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

function AlertRow({
  a,
  checked,
  onToggle,
}: {
  a: AlertRecord;
  checked: boolean;
  onToggle: () => void;
}) {
  const date = new Date(a.created_at);
  const when = isNaN(date.getTime()) ? a.created_at : date.toLocaleString();

  return (
    <div
      className={`rounded-2xl ring-1 p-4 shadow-sm flex gap-3 ${
        a.read ? "bg-white ring-slate-200" : "bg-amber-50 ring-amber-200"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1 h-4 w-4" />
      <div className="flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold">{a.title}</div>
          <div className="text-xs text-slate-500">{when}</div>
        </div>
        <div className="text-sm text-slate-700 mt-1">{a.message}</div>
        <div className="text-xs text-slate-500 mt-2">
          Type: <span className="font-medium">{a.type}</span> • Status:{" "}
          <span className="font-medium">{a.read ? "Read" : "Unread"}</span>
        </div>
      </div>
    </div>
  );
}
