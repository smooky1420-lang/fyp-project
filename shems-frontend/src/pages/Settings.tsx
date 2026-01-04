import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import { getUserSettings, updateUserSettings, getSolarConfig, updateSolarConfig } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { Save, Loader2 } from "lucide-react";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function Settings() {
  const [tariff, setTariff] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Solar settings
  const [solarEnabled, setSolarEnabled] = useState(false);
  const [solarCapacity, setSolarCapacity] = useState<string>("");
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [savingSolar, setSavingSolar] = useState(false);
  const [solarMsg, setSolarMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await getUserSettings();
        setTariff(String(s.tariff_pkr_per_kwh));
      } catch (err: unknown) {
        setMsg(getErrorMessage(err) || "Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const solar = await getSolarConfig();
        setSolarEnabled(solar.enabled);
        setSolarCapacity(String(solar.installed_capacity_kw || ""));
        setLatitude(solar.latitude !== null ? String(solar.latitude) : "");
        setLongitude(solar.longitude !== null ? String(solar.longitude) : "");
      } catch (err: unknown) {
        setSolarMsg(getErrorMessage(err) || "Failed to load solar settings");
      }
    })();
  }, []);

  const parsedTariff = useMemo(() => {
    const n = Number(tariff);
    if (!Number.isFinite(n)) return null;
    return clamp(n, 0, 500);
  }, [tariff]);

  const parsedSolarCapacity = useMemo(() => {
    const n = Number(solarCapacity);
    if (!Number.isFinite(n)) return null;
    return clamp(n, 0, 1000);
  }, [solarCapacity]);

  const parsedLatitude = useMemo(() => {
    const n = Number(latitude);
    if (!Number.isFinite(n)) return null;
    return clamp(n, -90, 90);
  }, [latitude]);

  const parsedLongitude = useMemo(() => {
    const n = Number(longitude);
    if (!Number.isFinite(n)) return null;
    return clamp(n, -180, 180);
  }, [longitude]);

  async function onSave() {
    setMsg(null);
    if (parsedTariff === null) {
      setMsg("Please enter a valid number.");
      return;
    }

    setSaving(true);
    try {
      await updateUserSettings({ tariff_pkr_per_kwh: parsedTariff });
      setMsg("Saved ✓");
      setTimeout(() => setMsg(null), 2000);
    } catch (err: unknown) {
      setMsg(getErrorMessage(err) || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveSolar() {
    setSolarMsg(null);
    
    if (solarEnabled) {
      if (parsedSolarCapacity === null || parsedSolarCapacity <= 0) {
        setSolarMsg("Please enter a valid solar capacity (greater than 0).");
        return;
      }
      if (parsedLatitude === null || parsedLongitude === null) {
        setSolarMsg("Please enter valid latitude and longitude.");
        return;
      }
    }

    setSavingSolar(true);
    try {
      await updateSolarConfig({
        enabled: solarEnabled,
        installed_capacity_kw: solarEnabled ? (parsedSolarCapacity || 0) : 0,
        latitude: solarEnabled ? (parsedLatitude !== null ? parsedLatitude : null) : null,
        longitude: solarEnabled ? (parsedLongitude !== null ? parsedLongitude : null) : null,
      });
      setSolarMsg("Saved ✓");
      setTimeout(() => setSolarMsg(null), 2000);
    } catch (err: unknown) {
      setSolarMsg(getErrorMessage(err) || "Failed to save solar settings");
    } finally {
      setSavingSolar(false);
    }
  }

  return (
    <AppShell title="Settings">
    <div className="min-h-screen bg-slate-50 text-slate-900">

      <div className="p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">Settings</h1>
              <p className="mt-1 text-sm text-slate-600">
                These settings are saved to your account (DB).
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-white ring-1 ring-slate-200 p-5 shadow-sm">
            <div className="font-semibold">Electricity Tariff</div>
            <div className="text-sm text-slate-600 mt-1">PKR per kWh</div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm text-slate-600">Tariff (PKR/kWh)</label>
                <input
                  className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                  placeholder="e.g. 60"
                  value={tariff}
                  onChange={(e) => setTariff(e.target.value)}
                  inputMode="decimal"
                  disabled={loading}
                />

                <div className="mt-2 text-xs text-slate-500">
                  Used for cost calculation in Dashboard: <span className="font-medium">cost = kWh × tariff</span>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4">
                <div className="text-sm font-semibold">Preview</div>
                <div className="mt-2 text-sm text-slate-700">
                  Tariff:{" "}
                  <span className="font-semibold tabular-nums">
                    {parsedTariff === null ? "--" : `${parsedTariff} PKR/kWh`}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Example: 2.50 kWh →{" "}
                  <span className="font-medium tabular-nums">
                    {parsedTariff === null ? "--" : `PKR ${(2.5 * parsedTariff).toFixed(2)}`}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={onSave}
                disabled={loading || saving}
                className="rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-60 inline-flex items-center gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save
              </button>

              {msg ? <div className="text-sm text-slate-700">{msg}</div> : null}
            </div>
          </div>

          {loading ? (
            <div className="mt-4 text-sm text-slate-600">Loading settings…</div>
          ) : null}

          {/* Solar Configuration */}
          <div className="mt-6 rounded-2xl bg-white ring-1 ring-slate-200 p-5 shadow-sm">
            <div className="font-semibold">Solar Configuration</div>
            <div className="text-sm text-slate-600 mt-1">
              Configure your solar panel system for energy tracking
            </div>

            <div className="mt-4 flex items-center gap-3">
              <input
                type="checkbox"
                id="solar-enabled"
                checked={solarEnabled}
                onChange={(e) => setSolarEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="solar-enabled" className="text-sm font-medium text-slate-700">
                Enable Solar Tracking
              </label>
            </div>

            {solarEnabled && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm text-slate-600">Solar Capacity (kW)</label>
                  <input
                    className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                    placeholder="e.g. 5.0"
                    value={solarCapacity}
                    onChange={(e) => setSolarCapacity(e.target.value)}
                    inputMode="decimal"
                    disabled={loading}
                  />
                  <div className="mt-2 text-xs text-slate-500">
                    Total installed solar panel capacity
                  </div>
                </div>

                <div>
                  <label className="text-sm text-slate-600">Latitude</label>
                  <input
                    className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                    placeholder="e.g. 33.6844"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    inputMode="decimal"
                    disabled={loading}
                  />
                  <div className="mt-2 text-xs text-slate-500">
                    Your location latitude (-90 to 90)
                  </div>
                </div>

                <div>
                  <label className="text-sm text-slate-600">Longitude</label>
                  <input
                    className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                    placeholder="e.g. 73.0479"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    inputMode="decimal"
                    disabled={loading}
                  />
                  <div className="mt-2 text-xs text-slate-500">
                    Your location longitude (-180 to 180)
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4">
                  <div className="text-sm font-semibold">Preview</div>
                  <div className="mt-2 text-sm text-slate-700">
                    Capacity:{" "}
                    <span className="font-semibold tabular-nums">
                      {parsedSolarCapacity === null ? "--" : `${parsedSolarCapacity} kW`}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-slate-700">
                    Location:{" "}
                    <span className="font-semibold tabular-nums">
                      {parsedLatitude !== null && parsedLongitude !== null
                        ? `${parsedLatitude.toFixed(4)}, ${parsedLongitude.toFixed(4)}`
                        : "--"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={onSaveSolar}
                disabled={loading || savingSolar}
                className="rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-60 inline-flex items-center gap-2"
              >
                {savingSolar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Solar Settings
              </button>

              {solarMsg ? <div className="text-sm text-slate-700">{solarMsg}</div> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
    </AppShell>
  );
}
