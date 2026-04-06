import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createDevice,
  deleteDevice,
  listDevices,
  updateDevice,
  type Device,
  type DeviceUpdate,
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
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20";

/** Limits row: fixed label + input heights so number and time fields line up across columns. */
const limitsLabelClass =
  "flex h-5 shrink-0 items-center gap-1 text-xs font-medium text-slate-600";
const limitsInputClass =
  "h-10 w-full box-border rounded-xl border border-slate-200 bg-white px-2.5 text-sm text-slate-900 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20";

// "HH:MM:SS" or null -> "HH:MM" for <input type="time">
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

export default function DevicesPage() {
  const nav = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
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
  /** Collapsed by default when you already have devices; opens when list is empty or user expands. */
  const [addDeviceOpen, setAddDeviceOpen] = useState(false);

  async function load() {
    try {
      const d = await listDevices();
      setDevices(d);
      if (d.length === 0) setAddDeviceOpen(true);
    } catch {
      clearTokens();
      nav("/login");
    }
  }

  useEffect(() => {
    load();
  }, [nav]);

  function getForm(d: Device) {
    return limitsForm[d.id] ?? initialLimitsForm(d);
  }

  function setForm(d: Device, patch: Partial<ReturnType<typeof initialLimitsForm>>) {
    setLimitsForm((prev) => ({
      ...prev,
      [d.id]: { ...(prev[d.id] ?? initialLimitsForm(d)), ...patch },
    }));
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

  return (
    <AppShell>
      <div className="space-y-5">
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

        {/* Add device — compact until you expand (most visits are manage, not register) */}
        <section className="rounded-2xl border border-slate-200/90 bg-white shadow-sm">
          <button
            type="button"
            aria-expanded={addDeviceOpen}
            onClick={() => setAddDeviceOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left transition hover:bg-slate-50 sm:px-5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Plus className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-900">Add device</h2>
                <p className="truncate text-xs text-slate-500 sm:whitespace-normal">
                  {addDeviceOpen
                    ? "Fill in details, then use the device token in firmware."
                    : "Only when you wire a new meter or outlet — expand to register."}
                </p>
              </div>
            </div>
            <span className="shrink-0 text-slate-400">
              {addDeviceOpen ? <ChevronUp className="h-5 w-5" aria-hidden /> : <ChevronDown className="h-5 w-5" aria-hidden />}
            </span>
          </button>
          {addDeviceOpen && (
            <form onSubmit={onCreate} className="border-t border-slate-100 px-4 pb-5 pt-4 sm:px-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
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
                  <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
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
                  <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
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
                  <label className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700 sm:w-auto">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      checked={isControllable}
                      onChange={(e) => setIsControllable(e.target.checked)}
                    />
                    <span className="flex items-center gap-2">
                      <Power className="h-4 w-4 text-slate-500" aria-hidden />
                      Controllable load (relay)
                    </span>
                  </label>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/25 transition hover:bg-indigo-500 disabled:opacity-60"
              >
                {loading ? "Creating…" : "Create device"}
              </button>
            </form>
          )}
        </section>

        {devices.length > 0 && (
          <div className="flex items-baseline justify-between gap-2 px-0.5">
            <h2 className="text-sm font-semibold text-slate-900">Your devices</h2>
            <span className="text-xs text-slate-500">
              {devices.length} {devices.length === 1 ? "device" : "devices"}
            </span>
          </div>
        )}

        {/* Device list */}
        <div className="space-y-4">
          {devices.map((d) => {
            const form = getForm(d);
            return (
              <article
                key={d.id}
                className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm"
              >
                <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/50 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-900">{d.name}</h3>
                      {d.is_controllable && (
                        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
                          Controllable
                        </span>
                      )}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                        {d.room || "—"}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Tag className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                        {d.device_type || "—"}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {d.is_controllable && (
                      <button
                        type="button"
                        onClick={() => onRelayToggle(d)}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                          d.relay_on
                            ? "bg-emerald-600 text-white shadow-sm hover:bg-emerald-500"
                            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <Zap className="h-4 w-4" aria-hidden />
                        {d.relay_on ? "Relay ON" : "Relay OFF"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDelete(d.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                      Delete
                    </button>
                  </div>
                </div>

                <div className="px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <KeyRound className="h-3.5 w-3.5" aria-hidden />
                    Device token
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Use in firmware header <code className="rounded bg-slate-100 px-1 py-0.5">X-DEVICE-TOKEN</code>
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                    <code className="min-h-[2.75rem] flex-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-800">
                      {d.device_token}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToken(d.id, d.device_token)}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 sm:w-auto"
                    >
                      {copiedId === d.id ? (
                        <>
                          <Check className="h-4 w-4" aria-hidden />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" aria-hidden />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-100 bg-gradient-to-b from-slate-50/80 to-white px-5 py-5 sm:px-6">
                  <div className="mb-4 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-indigo-600 ring-1 ring-slate-200">
                      <Gauge className="h-4 w-4" aria-hidden />
                    </span>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">Limits & schedule</h4>
                      <p className="text-xs text-slate-500">
                        Optional caps and allowed window — firmware can enforce when connected.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label className={limitsLabelClass}>
                        <span className="inline-flex w-3 shrink-0 justify-center" aria-hidden />
                        Power limit (W)
                      </label>
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
                      <label className={limitsLabelClass}>
                        <span className="inline-flex w-3 shrink-0 justify-center" aria-hidden />
                        Daily energy (kWh)
                      </label>
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
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" aria-hidden />
                      {savingId === d.id ? "Saving…" : "Save limits"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          {devices.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-6 py-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-200/80 text-slate-500">
                <Cpu className="h-6 w-6" aria-hidden />
              </div>
              <p className="mt-4 font-medium text-slate-700">No devices yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                Complete the form above, then paste the device token into your ESP32 sketch to stream telemetry.
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
