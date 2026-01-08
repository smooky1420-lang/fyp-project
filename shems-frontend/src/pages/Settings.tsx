import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import { getUserSettings, updateUserSettings, getSolarConfig, updateSolarConfig, getTariffCalculator, type TariffCalculatorResult } from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import { Save, Loader2, MapPin, Calculator, Shield, ShieldOff } from "lucide-react";

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
  const [fetchingLocation, setFetchingLocation] = useState(false);
  
  // Tariff calculator
  const [tariffCalc, setTariffCalc] = useState<TariffCalculatorResult | null>(null);
  const [loadingTariffCalc, setLoadingTariffCalc] = useState(false);
  const [useCalculatedTariff, setUseCalculatedTariff] = useState(false);

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

  // Load tariff calculator
  useEffect(() => {
    (async () => {
      setLoadingTariffCalc(true);
      try {
        const calc = await getTariffCalculator();
        setTariffCalc(calc);
      } catch (err: unknown) {
        console.error("Failed to load tariff calculator:", err);
      } finally {
        setLoadingTariffCalc(false);
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

  async function onFetchLocation() {
    if (!navigator.geolocation) {
      setSolarMsg("Geolocation is not supported by your browser.");
      return;
    }

    setFetchingLocation(true);
    setSolarMsg(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(String(position.coords.latitude));
        setLongitude(String(position.coords.longitude));
        setSolarMsg("Location fetched ✓");
        setTimeout(() => setSolarMsg(null), 2000);
        setFetchingLocation(false);
      },
      (error) => {
        setFetchingLocation(false);
        if (error.code === error.PERMISSION_DENIED) {
          setSolarMsg("Location access denied. Please enter coordinates manually.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setSolarMsg("Location unavailable. Please enter coordinates manually.");
        } else {
          setSolarMsg("Failed to get location. Please enter coordinates manually.");
        }
      },
      { timeout: 10000 }
    );
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
    <AppShell>
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
            <div className="text-sm text-slate-600 mt-1">PKR per kWh - Auto-calculated based on your usage</div>

            {/* Tariff Calculator Info */}
            {tariffCalc && (
              <div className="mt-4 rounded-xl bg-indigo-50 ring-1 ring-indigo-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Calculator className="h-4 w-4 text-indigo-600" />
                      <span className="text-sm font-semibold text-indigo-900">Calculated Tariff</span>
                      {tariffCalc.is_protected !== null && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-indigo-100 text-indigo-700">
                          {tariffCalc.is_protected ? (
                            <>
                              <Shield className="h-3 w-3" />
                              Protected
                            </>
                          ) : (
                            <>
                              <ShieldOff className="h-3 w-3" />
                              Unprotected
                            </>
                          )}
                        </span>
                      )}
                    </div>
                    {tariffCalc.calculated_tariff !== null ? (
                      <div className="text-sm text-indigo-800">
                        <div>
                          Current month: <span className="font-semibold">{tariffCalc.current_month_units.toFixed(2)} units</span>
                        </div>
                        <div className="mt-1">
                          Calculated rate: <span className="font-semibold">{tariffCalc.calculated_tariff.toFixed(2)} PKR/kWh</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setTariff(String(tariffCalc.calculated_tariff));
                            setUseCalculatedTariff(true);
                          }}
                          className="mt-2 text-xs text-indigo-600 hover:text-indigo-700 font-medium underline"
                        >
                          Use this tariff
                        </button>
                      </div>
                    ) : (
                      <div className="text-sm text-indigo-700">
                        {tariffCalc.message || "Unable to calculate tariff"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {loadingTariffCalc && (
              <div className="mt-4 text-sm text-slate-600 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Calculating tariff...
              </div>
            )}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm text-slate-600">Tariff (PKR/kWh)</label>
                <input
                  className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50"
                  placeholder="e.g. 60"
                  value={tariff}
                  onChange={(e) => {
                    setTariff(e.target.value);
                    setUseCalculatedTariff(false);
                  }}
                  inputMode="decimal"
                  disabled={loading}
                />

                <div className="mt-2 text-xs text-slate-500">
                  Used for cost calculation in Dashboard: <span className="font-medium">cost = kWh × tariff</span>
                </div>
                {useCalculatedTariff && tariffCalc?.calculated_tariff !== null && (
                  <div className="mt-1 text-xs text-indigo-600">
                    Using calculated tariff
                  </div>
                )}
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

            {/* Monthly Usage History */}
            {tariffCalc && tariffCalc.monthly_usage.length > 0 && (
              <div className="mt-4 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4">
                <div className="text-xs font-semibold text-slate-700 mb-2">Last 6 Months Usage</div>
                <div className="space-y-1">
                  {tariffCalc.monthly_usage.map((month, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <span className="text-slate-600">{month.month}</span>
                      <span className={`font-semibold ${month.kwh >= 200 ? "text-red-600" : "text-slate-700"}`}>
                        {month.kwh.toFixed(2)} units
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm text-slate-600">Location</label>
                    <button
                      type="button"
                      onClick={onFetchLocation}
                      disabled={fetchingLocation || loading}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      {fetchingLocation ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Fetching...
                        </>
                      ) : (
                        <>
                          <MapPin className="h-3 w-3" />
                          Get My Location
                        </>
                      )}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <input
                        className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 text-sm"
                        placeholder="Latitude"
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value)}
                        inputMode="decimal"
                        disabled={loading}
                      />
                    </div>
                    <div>
                      <input
                        className="mt-1 w-full rounded-xl ring-1 ring-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 text-sm"
                        placeholder="Longitude"
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value)}
                        inputMode="decimal"
                        disabled={loading}
                      />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    Click "Get My Location" or enter manually
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
