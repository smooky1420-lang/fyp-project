import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createDevice, deleteDevice, listDevices, type Device, clearTokens } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import AppShell from "../components/AppShell";

export default function DevicesPage() {
  const nav = useNavigate();

  const [devices, setDevices] = useState<Device[]>([]);
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [isControllable, setIsControllable] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <AppShell>
    <div className="min-h-screen bg-slate-50 text-slate-900">

      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-semibold">Devices</h1>
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
                  placeholder="e.g. Bulb Socket"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Room</label>
                <input
                  className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  placeholder="e.g. Demo Box"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Type</label>
                <input
                  className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value)}
                  placeholder="e.g. Light / Fan / Heater"
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
                  Controllable (relay)
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

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {devices.map((d) => (
              <div key={d.id} className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold text-lg">{d.name}</div>
                    <div className="text-sm text-slate-600">
                      {d.room || "No room"} • {d.device_type || "No type"}
                      {d.is_controllable ? " • Controllable" : ""}
                    </div>

                    <div className="mt-3 text-xs text-slate-500">Device Token (for ESP32 later)</div>
                    <div className="mt-1 flex gap-2">
                      <code className="flex-1 rounded-xl bg-slate-50 ring-1 ring-slate-200 px-3 py-2 text-xs overflow-x-auto">
                        {d.device_token}
                      </code>
                      <button
                        type="button"
                        className="rounded-xl bg-slate-900 text-white px-3 py-2 text-xs hover:bg-slate-800"
                        onClick={() => navigator.clipboard.writeText(d.device_token)}
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => onDelete(d.id)}
                    className="rounded-xl bg-red-600 text-white px-3 py-2 text-sm hover:bg-red-500"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {devices.length === 0 && (
              <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-6 text-slate-600">
                No devices yet. Add your first device above (for your demo box: Bulb/Fan/Heater).
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </AppShell>
  );
}
