import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createDevice,
  deleteDevice,
  listDevices,
  updateDevice,
  getLatestTelemetry,
  getTodaySummary,
  type Device,
  type DeviceUpdate,
  type TelemetryReading,
  type TodaySummary,
  clearTokens,
} from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import AppShell from "../components/AppShell";
import {
  Cpu,
  Plus,
  MapPin,
  Tag,
  KeyRound,
  Copy,
  Check,
  Trash2,
  Zap,
  Gauge,
  Clock,
  Save,
  Power,
  Activity,
  Wifi,
  X,
} from "lucide-react";

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20";

const limitsLabelClass =
  "flex h-5 shrink-0 items-center gap-1 text-xs font-medium text-slate-600";
const limitsInputClass =
  "h-10 w-full box-border rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20";

function timeToInput(t: string | null): string {
  if (!t) return "";
  return t.slice(0, 5);
}

function initialLimitsForm(d: Device) {
  return {
    power_limit_w: d.power_limit_w != null ? String(d.power_limit_w) : "",
    daily_energy_limit_kwh: d.daily_energy_limit_kwh != null ? String(d.daily_energy_limit_kwh) : "",
    schedule_enabled: d.schedule_enabled,
    schedule_on_time: timeToInput(d.schedule_on_time),
    schedule_off_time: timeToInput(d.schedule_off_time),
  };
}

function latestIsOffline(latest: TelemetryReading | null, offlineSeconds = 120) {
  if (!latest) return true;
  const t = new Date(latest.created_at).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > offlineSeconds * 1000;
}

function formatReadingAge(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default function DevicesPage() {
  const nav = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [today, setToday] = useState<TodaySummary | null>(null);
  const [latestByDevice, setLatestByDevice] = useState<Record<number, TelemetryReading | null>>({});

  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [isControllable, setIsControllable] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const [limitsForm, setLimitsForm] = useState<
    Record<
      number,
      {
        power_limit_w: string;
        daily_energy_limit_kwh: string;
        schedule_enabled: boolean;
        schedule_on_time: string;
        schedule_off_time: string;
      }
    >
  >({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [addDeviceOpen, setAddDeviceOpen] = useState(false);

  const liveCount = useMemo(
    () => devices.filter((d) => !latestIsOffline(latestByDevice[d.id] ?? null)).length,
    [devices, latestByDevice]
  );

  const controllableCount = useMemo(() => devices.filter((d) => d.is_controllable).length, [devices]);

  async function load() {
    try {
      const d = await listDevices();
      setDevices(d);
    } catch {
      clearTokens();
      nav("/login");
    }
  }

  useEffect(() => {
    load();
  }, [nav]);

  useEffect(() => {
    if (!devices.length) return;
    let alive = true;

    async function pollToday() {
      try {
        const s = await getTodaySummary();
        if (alive) setToday(s);
      } catch {
        if (alive) setToday(null);
      }
    }

    pollToday();
    const t = setInterval(pollToday, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [devices.length]);

  useEffect(() => {
    if (!devices.length) return;
    let alive = true;

    async function pollLatest() {
      const entries = await Promise.all(
        devices.map(async (d) => {
          try {
            const r = await getLatestTelemetry(d.id);
            return [d.id, r] as const;
          } catch {
            return [d.id, null] as const;
          }
        })
      );
      if (!alive) return;
      setLatestByDevice(Object.fromEntries(entries));
    }

    pollLatest();
    const t = setInterval(pollLatest, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [devices]);

  function getForm(d: Device) {
    return limitsForm[d.id] ?? initialLimitsForm(d);
  }

  function setForm(d: Device, patch: Partial<ReturnType<typeof initialLimitsForm>>) {
    setLimitsForm((prev) => ({
      ...prev,
      [d.id]: { ...(prev[d.id] ?? initialLimitsForm(d)), ...patch },
    }));
  }

  function todayForDevice(deviceId: number) {
    return today?.devices.find((x) => x.device_id === deviceId);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      await createDevice({
        name,
        room,
        device_type: deviceType,
        is_controllable: isControllable,
      });
      setName("");
      setRoom("");
      setDeviceType("");
      setIsControllable(false);
      setAddDeviceOpen(false);
      await load();
    } catch (err: unknown) {
      setMsg(getErrorMessage(err) || "Failed to create device");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(id: number) {
    if (!confirm("Delete this device?")) return;
    try {
      await deleteDevice(id);
      await load();
    } catch (err: unknown) {
      setMsg(getErrorMessage(err) || "Failed to delete");
    }
  }

  async function onRelayToggle(d: Device) {
    if (!d.is_controllable) return;
    setMsg(null);
    try {
      await updateDevice(d.id, { relay_on: !d.relay_on });
      await load();
    } catch (err: unknown) {
      setMsg(getErrorMessage(err) || "Failed to update relay");
    }
  }

  async function copyToken(id: number, token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedId(id);
      setTimeout(() => setCopiedId((x) => (x === id ? null : x)), 2000);
    } catch {
      setMsg("Could not copy to clipboard");
    }
  }

  async function onSaveLimits(d: Device) {
    const form = getForm(d);
    setSavingId(d.id);
    setMsg(null);
    try {
      const payload: DeviceUpdate = {
        schedule_enabled: form.schedule_enabled,
        schedule_on_time: form.schedule_on_time ? `${form.schedule_on_time}:00` : null,
        schedule_off_time: form.schedule_off_time ? `${form.schedule_off_time}:00` : null,
        power_limit_w: form.power_limit_w === "" ? null : parseFloat(form.power_limit_w),
        daily_energy_limit_kwh: form.daily_energy_limit_kwh === "" ? null : parseFloat(form.daily_energy_limit_kwh),
      };
      if (Number.isNaN(payload.power_limit_w!)) payload.power_limit_w = null;
      if (Number.isNaN(payload.daily_energy_limit_kwh!)) payload.daily_energy_limit_kwh = null;
      await updateDevice(d.id, payload);
      await load();
    } catch (err: unknown) {
      setMsg(getErrorMessage(err) || "Failed to save limits/schedule");
    } finally {
      setSavingId(null);
    }
  }

  function renderAddForm(labelClass: string, checkboxClass: string) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide ${labelClass}`}>
            <Cpu className="h-3.5 w-3.5" aria-hidden />
            Name
          </label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Main AC circuit"
            required
          />
        </div>
        <div>
          <label className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide ${labelClass}`}>
            <MapPin className="h-3.5 w-3.5" aria-hidden />
            Room
          </label>
          <input
            className={inputClass}
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="e.g. Living room"
          />
        </div>
        <div>
          <label className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide ${labelClass}`}>
            <Tag className="h-3.5 w-3.5" aria-hidden />
            Type
          </label>
          <input
            className={inputClass}
            value={deviceType}
            onChange={(e) => setDeviceType(e.target.value)}
            placeholder="e.g. PZEM-004T"
          />
        </div>
        <div className="flex items-end pb-1">
          <label className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-3 text-sm sm:w-auto ${checkboxClass}`}>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={isControllable}
              onChange={(e) => setIsControllable(e.target.checked)}
            />
            <span className="flex items-center gap-2">
              <Power className="h-4 w-4 opacity-70" aria-hidden />
              Controllable load (relay)
            </span>
          </label>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        {msg && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            {msg}
            <button
              type="button"
              className="ml-3 font-medium text-red-700 underline hover:no-underline"
              onClick={() => setMsg(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Hero */}
        {devices.length > 0 ? (
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900 text-white shadow-xl shadow-indigo-900/20">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 left-1/4 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" />
            <div className="relative p-6 md:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-indigo-200">Manage meters</p>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Your devices</h1>
                  <p className="mt-2 max-w-lg text-sm text-indigo-200/90 leading-relaxed">
                    Register smart meters, copy tokens for firmware, and set power limits or schedules.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAddDeviceOpen((o) => !o)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 transition-colors"
                >
                  {addDeviceOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {addDeviceOpen ? "Cancel" : "Add device"}
                </button>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                  <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Registered</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums">{devices.length}</p>
                  <p className="mt-1 text-xs text-indigo-300/80">meters in your home</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                  <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Live now</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums">{liveCount}</p>
                  <p className="mt-1 text-xs text-indigo-300/80">sending telemetry</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                  <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Controllable</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums">{controllableCount}</p>
                  <p className="mt-1 text-xs text-indigo-300/80">relay-enabled loads</p>
                </div>
              </div>

              {addDeviceOpen && (
                <form
                  onSubmit={onCreate}
                  className="mt-6 rounded-2xl bg-white/10 p-5 ring-1 ring-white/10 backdrop-blur-sm"
                >
                  <p className="mb-4 text-sm font-medium text-indigo-100">Register a new meter</p>
                  {renderAddForm(
                    "text-indigo-200",
                    "border-white/20 bg-white/10 text-indigo-100"
                  )}
                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-950 shadow-sm hover:bg-indigo-50 disabled:opacity-60 transition-colors"
                  >
                    {loading ? "Creating…" : "Create device"}
                  </button>
                </form>
              )}
            </div>
          </section>
        ) : (
          <div className="relative overflow-hidden rounded-3xl border border-dashed border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-slate-50 p-8 md:p-10">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/30">
                <Cpu className="h-7 w-7" />
              </div>
              <p className="mt-5 text-lg font-semibold text-slate-900">No devices yet</p>
              <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                Register your first meter below, then paste the device token into your ESP32 firmware.
              </p>
            </div>
            <form onSubmit={onCreate} className="mx-auto mt-8 max-w-2xl rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 text-left">
              {renderAddForm("text-slate-500", "border-slate-200 bg-slate-50/80 text-slate-700")}
              <button
                type="submit"
                disabled={loading}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/25 transition hover:bg-indigo-500 disabled:opacity-60"
              >
                {loading ? "Creating…" : "Create device"}
              </button>
            </form>
          </div>
        )}

        {/* Device cards */}
        <div className="space-y-6">
          {devices.map((d) => {
            const form = getForm(d);
            const latest = latestByDevice[d.id] ?? null;
            const offline = latestIsOffline(latest);
            const todayRow = todayForDevice(d.id);
            const liveKw = !offline && latest?.power != null ? latest.power / 1000 : null;

            return (
              <article
                key={d.id}
                className="overflow-hidden rounded-3xl bg-white shadow-lg shadow-slate-200/50 ring-1 ring-slate-200/80"
              >
                {/* Card header — dark gradient */}
                <div className="relative bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900 text-white">
                  <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-indigo-500/15 blur-2xl" />
                  <div className="relative p-5 md:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 gap-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                          <Cpu className="h-6 w-6 text-indigo-100" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-xl font-bold tracking-tight">{d.name}</h3>
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                offline
                                  ? "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/30"
                                  : "bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/30"
                              }`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${offline ? "bg-amber-400" : "bg-emerald-400 animate-pulse"}`}
                              />
                              {offline ? "Offline" : "Live"}
                            </span>
                            {d.is_controllable && (
                              <span className="rounded-full bg-violet-500/25 px-2.5 py-0.5 text-xs font-medium text-violet-100 ring-1 ring-violet-400/30">
                                Controllable
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-indigo-200/90">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 text-indigo-300/70" aria-hidden />
                              {d.room || "No room set"}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Tag className="h-3.5 w-3.5 text-indigo-300/70" aria-hidden />
                              {d.device_type || "Unspecified type"}
                            </span>
                          </p>
                          {offline && latest && (
                            <p className="mt-1 text-xs text-indigo-300/70">
                              Last seen {formatReadingAge(latest.created_at)}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {d.is_controllable && (
                          <button
                            type="button"
                            onClick={() => onRelayToggle(d)}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition ring-1 ${
                              d.relay_on
                                ? "bg-emerald-500 text-white ring-emerald-400/50 hover:bg-emerald-400"
                                : "bg-white/10 text-white ring-white/20 hover:bg-white/15"
                            }`}
                          >
                            <Zap className="h-4 w-4" aria-hidden />
                            {d.relay_on ? "Relay ON" : "Relay OFF"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDelete(d.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-2 text-sm font-medium text-red-200 ring-1 ring-red-400/20 hover:bg-red-500/20 transition-colors"
                          aria-label={`Delete ${d.name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          <span className="hidden sm:inline">Delete</span>
                        </button>
                      </div>
                    </div>

                    {/* Live stats row */}
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl bg-white/10 p-3 ring-1 ring-white/10">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-indigo-200">Today</p>
                        <p className="mt-1 text-xl font-bold tabular-nums">
                          {todayRow ? todayRow.today_kwh.toFixed(2) : "—"}
                          <span className="ml-1 text-sm font-medium text-indigo-200">kWh</span>
                        </p>
                      </div>
                      <div className="rounded-xl bg-white/10 p-3 ring-1 ring-white/10">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-indigo-200">Live power</p>
                        <p className="mt-1 text-xl font-bold tabular-nums">
                          {liveKw != null ? liveKw.toFixed(2) : "—"}
                          <span className="ml-1 text-sm font-medium text-indigo-200">kW</span>
                        </p>
                      </div>
                      <div className="rounded-xl bg-white/10 p-3 ring-1 ring-white/10">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-indigo-200">Connection</p>
                        <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                          <Wifi className={`h-4 w-4 ${offline ? "text-amber-300" : "text-emerald-300"}`} />
                          {offline ? "Waiting for data" : "Connected"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Token */}
                <div className="border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-white px-5 py-4 md:px-6">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <KeyRound className="h-3.5 w-3.5" aria-hidden />
                    Device token
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Paste in firmware as header <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">X-DEVICE-TOKEN</code>
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                    <code className="min-h-[2.75rem] flex-1 overflow-x-auto rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-800 shadow-inner shadow-slate-100">
                      {d.device_token}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToken(d.id, d.device_token)}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
                    >
                      {copiedId === d.id ? (
                        <>
                          <Check className="h-4 w-4" aria-hidden />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" aria-hidden />
                          Copy token
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Limits & schedule */}
                <div className="px-5 py-5 md:px-6">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/25">
                      <Gauge className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <h4 className="font-semibold text-slate-900">Limits & schedule</h4>
                      <p className="text-xs text-slate-500">
                        Optional caps and allowed window — firmware enforces when connected.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label className={limitsLabelClass}>Power limit (W)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className={limitsInputClass}
                        placeholder="e.g. 2000"
                        value={form.power_limit_w}
                        onChange={(e) => setForm(d, { power_limit_w: e.target.value })}
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label className={limitsLabelClass}>Daily energy (kWh)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        className={limitsInputClass}
                        placeholder="e.g. 10"
                        value={form.daily_energy_limit_kwh}
                        onChange={(e) => setForm(d, { daily_energy_limit_kwh: e.target.value })}
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label className={limitsLabelClass}>
                        <Clock className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
                        Schedule on
                      </label>
                      <input
                        type="time"
                        className={limitsInputClass}
                        value={form.schedule_on_time}
                        onChange={(e) => setForm(d, { schedule_on_time: e.target.value })}
                      />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label className={limitsLabelClass}>
                        <Clock className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
                        Schedule off
                      </label>
                      <input
                        type="time"
                        className={limitsInputClass}
                        value={form.schedule_off_time}
                        onChange={(e) => setForm(d, { schedule_off_time: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={form.schedule_enabled}
                        onChange={(e) => setForm(d, { schedule_enabled: e.target.checked })}
                      />
                      Schedule enabled
                    </label>
                    <button
                      type="button"
                      disabled={savingId === d.id}
                      onClick={() => onSaveLimits(d)}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-500/25 hover:bg-indigo-500 disabled:opacity-60 transition-colors"
                    >
                      <Save className="h-4 w-4" aria-hidden />
                      {savingId === d.id ? "Saving…" : "Save limits"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {devices.length > 0 && (
          <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-xs text-slate-400">
            <Activity className="h-3.5 w-3.5" />
            Live stats refresh every few seconds
          </p>
        )}
      </div>
    </AppShell>
  );
}
