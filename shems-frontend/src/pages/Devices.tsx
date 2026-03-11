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

  // Per-device form state for limits & schedule (keyed by device id)
  const [limitsForm, setLimitsForm] = useState<Record<
    number,
    {
      power_limit_w: string;
      daily_energy_limit_kwh: string;
      schedule_enabled: boolean;
      schedule_on_time: string;
      schedule_off_time: string;
    }
  >>({});
  const [savingId, setSavingId] = useState<number | null>(null);

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
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <div className="p-6">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-2xl font-semibold">Devices</h1>
            <p className="mt-1 text-sm text-slate-600">
              Add devices and set limits or schedules. Use the device token with ESP32 + PZEM-004T for real data.
            </p>
            {msg && (
              <div className="mt-4 rounded-xl bg-red-50 ring-1 ring-red-200 p-3 text-sm text-red-700">
                {msg}
              </div>
            )}

            <form
              onSubmit={onCreate}
              className="mt-6 rounded-2xl bg-white ring-1 ring-slate-200 p-5 shadow-sm"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">Device name</label>
                  <input
                    className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Living Room Socket"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Room</label>
                  <input
                    className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    placeholder="e.g. Living Room"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">Type</label>
                  <input
                    className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={deviceType}
                    onChange={(e) => setDeviceType(e.target.value)}
                    placeholder="e.g. Light / Fan / PZEM sensor"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={isControllable}
                      onChange={(e) => setIsControllable(e.target.checked)}
                    />
                    Controllable (relay on/off)
                  </label>
                </div>
              </div>
              <button
                disabled={loading}
                className="mt-4 rounded-xl bg-indigo-600 text-white px-4 py-2 font-semibold hover:bg-indigo-500 disabled:opacity-60"
              >
                {loading ? "Creating..." : "Add device"}
              </button>
            </form>

            <div className="mt-8 space-y-4">
              {devices.map((d) => {
                const form = getForm(d);
                return (
                  <div
                    key={d.id}
                    className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold text-lg">{d.name}</div>
                        <div className="text-sm text-slate-600">
                          {d.room || "—"} · {d.device_type || "—"}
                          {d.is_controllable && (
                            <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">
                              Controllable
                            </span>
                          )}
                        </div>
                        <div className="mt-3 text-xs text-slate-500">Device token (for ESP32)</div>
                        <div className="mt-1 flex gap-2 flex-wrap">
                          <code className="flex-1 min-w-0 rounded-xl bg-slate-50 ring-1 ring-slate-200 px-3 py-2 text-xs overflow-x-auto">
                            {d.device_token}
                          </code>
                          <button
                            type="button"
                            className="rounded-xl bg-slate-900 text-white px-3 py-2 text-xs hover:bg-slate-800 shrink-0"
                            onClick={() => navigator.clipboard.writeText(d.device_token)}
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {d.is_controllable && (
                          <button
                            type="button"
                            onClick={() => onRelayToggle(d)}
                            className={`rounded-xl px-4 py-2 text-sm font-medium ${
                              d.relay_on
                                ? "bg-green-600 text-white hover:bg-green-500"
                                : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                            }`}
                          >
                            {d.relay_on ? "ON" : "OFF"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDelete(d.id)}
                          className="rounded-xl bg-red-600 text-white px-3 py-2 text-sm hover:bg-red-500"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-200">
                      <h3 className="text-sm font-medium text-slate-700 mb-3">Limits & schedule</h3>
                      <p className="text-xs text-slate-500 mb-3">
                        Optional. ESP32 can enforce these when you add hardware. Schedule = allowed on only between on/off times.
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <label className="text-xs font-medium text-slate-600">Power limit (W)</label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            className="mt-1 w-full rounded-lg ring-1 ring-slate-200 px-2 py-1.5 text-sm"
                            placeholder="e.g. 500"
                            value={form.power_limit_w}
                            onChange={(e) => setForm(d, { power_limit_w: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-600">Daily energy limit (kWh)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            className="mt-1 w-full rounded-lg ring-1 ring-slate-200 px-2 py-1.5 text-sm"
                            placeholder="e.g. 2.5"
                            value={form.daily_energy_limit_kwh}
                            onChange={(e) => setForm(d, { daily_energy_limit_kwh: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-600">Schedule on</label>
                          <input
                            type="time"
                            className="mt-1 w-full rounded-lg ring-1 ring-slate-200 px-2 py-1.5 text-sm"
                            value={form.schedule_on_time}
                            onChange={(e) => setForm(d, { schedule_on_time: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-600">Schedule off</label>
                          <input
                            type="time"
                            className="mt-1 w-full rounded-lg ring-1 ring-slate-200 px-2 py-1.5 text-sm"
                            value={form.schedule_off_time}
                            onChange={(e) => setForm(d, { schedule_off_time: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={form.schedule_enabled}
                            onChange={(e) => setForm(d, { schedule_enabled: e.target.checked })}
                          />
                          Schedule enabled
                        </label>
                        <button
                          type="button"
                          disabled={savingId === d.id}
                          onClick={() => onSaveLimits(d)}
                          className="rounded-xl bg-indigo-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-indigo-500 disabled:opacity-60"
                        >
                          {savingId === d.id ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {devices.length === 0 && (
                <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 text-slate-600">
                  No devices yet. Add one above. When you have ESP32 + PZEM-004T, use the device token to send real readings.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
