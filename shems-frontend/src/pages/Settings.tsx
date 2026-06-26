import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import {
  getUserSettings,
  updateUserSettings,
  getSolarConfig,
  updateSolarConfig,
  getTariffCalculator,
  type TariffCalculatorResult,
} from "../lib/api";
import { getErrorMessage } from "../lib/errors";
import {
  Save,
  Loader2,
  MapPin,
  Calculator,
  Shield,
  ShieldOff,
  Sun,
  Wallet,
  Activity,
  Zap,
} from "lucide-react";

const inputClass =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-50";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function StatusBanner({ msg, tone = "neutral" }: { msg: string; tone?: "success" | "error" | "neutral" }) {
  const styles =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-slate-200 bg-slate-50 text-slate-700";
  return <div className={`rounded-xl border px-3 py-2 text-sm ${styles}`}>{msg}</div>;
}

export default function Settings() {
  const [tariff, setTariff] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [solarEnabled, setSolarEnabled] = useState(false);
  const [solarCapacity, setSolarCapacity] = useState<string>("");
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [savingSolar, setSavingSolar] = useState(false);
  const [solarMsg, setSolarMsg] = useState<string | null>(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);

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

  async function onSaveTariff(value?: number) {
    const toSave = value ?? parsedTariff;
    setMsg(null);
    if (toSave === null || !Number.isFinite(toSave)) {
      setMsg("Please enter a valid number.");
      return;
    }

    setSaving(true);
    try {
      await updateUserSettings({ tariff_pkr_per_kwh: toSave });
      setTariff(String(toSave));
      setMsg("Tariff saved");
      setTimeout(() => setMsg(null), 2500);
    } catch (err: unknown) {
      setMsg(getErrorMessage(err) || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function applyCalculatedTariff() {
    const rate = tariffCalc?.effective_pkr_per_kwh ?? tariffCalc?.calculated_tariff;
    if (rate === null || rate === undefined) return;
    setUseCalculatedTariff(true);
    setTariff(String(rate));
    await onSaveTariff(rate);
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
        setSolarMsg("Location fetched");
        setTimeout(() => setSolarMsg(null), 2500);
        setFetchingLocation(false);
      },
      (error) => {
        setFetchingLocation(false);
        if (error.code === error.PERMISSION_DENIED) {
          setSolarMsg("Location access denied. Enter coordinates manually.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setSolarMsg("Location unavailable. Enter coordinates manually.");
        } else {
          setSolarMsg("Failed to get location. Enter coordinates manually.");
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
      setSolarMsg("Solar settings saved");
      setTimeout(() => setSolarMsg(null), 2500);
    } catch (err: unknown) {
      setSolarMsg(getErrorMessage(err) || "Failed to save solar settings");
    } finally {
      setSavingSolar(false);
    }
  }

  const maxMonthKwh = useMemo(() => {
    if (!tariffCalc?.monthly_usage.length) return 1;
    return Math.max(...tariffCalc.monthly_usage.map((m) => m.kwh), 1);
  }, [tariffCalc]);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white shadow-xl shadow-indigo-900/20">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-slate-500/15 blur-3xl" />
          <div className="relative p-6 md:p-8">
            <div className="min-w-0">
              <p className="text-sm font-medium text-indigo-200">Your account</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Settings</h1>
              <p className="mt-2 max-w-lg text-sm text-indigo-200/90 leading-relaxed">
                Tariff for cost estimates and solar panel setup for generation tracking.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {tariffCalc?.is_protected !== null && tariffCalc?.is_protected !== undefined && (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                      tariffCalc.is_protected
                        ? "bg-emerald-500/20 text-emerald-100 ring-emerald-400/30"
                        : "bg-amber-500/20 text-amber-100 ring-amber-400/30"
                    }`}
                  >
                    {tariffCalc.is_protected ? (
                      <Shield className="h-3.5 w-3.5" />
                    ) : (
                      <ShieldOff className="h-3.5 w-3.5" />
                    )}
                    {tariffCalc.is_protected ? "Protected tariff" : "Unprotected tariff"}
                  </span>
                )}
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                    solarEnabled
                      ? "bg-amber-500/20 text-amber-100 ring-amber-400/30"
                      : "bg-white/10 text-indigo-100 ring-white/10"
                  }`}
                >
                  Solar {solarEnabled ? "enabled" : "off"}
                </span>
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Your tariff</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {loading ? "—" : parsedTariff != null ? parsedTariff.toFixed(2) : "—"}
                  <span className="ml-1 text-lg font-semibold text-indigo-200">PKR/kWh</span>
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">Calculated</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {loadingTariffCalc
                    ? "—"
                    : tariffCalc?.calculated_tariff != null
                      ? tariffCalc.calculated_tariff.toFixed(2)
                      : "—"}
                  <span className="ml-1 text-lg font-semibold text-indigo-200">PKR/kWh</span>
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-indigo-200">This month</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {tariffCalc ? tariffCalc.current_month_units.toFixed(1) : "—"}
                  <span className="ml-1 text-lg font-semibold text-indigo-200">units</span>
                </p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-amber-400/20 to-orange-500/20 p-4 ring-1 ring-amber-300/30 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-amber-100">Solar capacity</p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">
                  {solarEnabled && parsedSolarCapacity != null ? parsedSolarCapacity.toFixed(1) : "—"}
                  <span className="ml-1 text-lg font-semibold text-amber-100">kW</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Tariff */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/25">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-slate-900">Electricity tariff</h2>
              <p className="text-xs text-slate-500">Used for daily cost on Dashboard and Reports</p>
            </div>
          </div>

          {tariffCalc && (
            <div className="mb-5 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4 md:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Calculator className="h-4 w-4 text-indigo-600" />
                    <span className="text-sm font-semibold text-indigo-900">IESCO-style calculator</span>
                  </div>
                  {tariffCalc.calculated_tariff !== null ? (
                    <div className="text-sm text-indigo-900 space-y-3">
                      <div className="flex flex-wrap gap-x-6 gap-y-1">
                        <p>
                          Effective rate:{" "}
                          <span className="font-bold tabular-nums">
                            {tariffCalc.effective_pkr_per_kwh?.toFixed(2) ?? tariffCalc.calculated_tariff.toFixed(2)} PKR/kWh
                          </span>
                        </p>
                        {tariffCalc.bill_total_pkr != null && (
                          <p>
                            This month:{" "}
                            <span className="font-bold tabular-nums">
                              PKR {tariffCalc.bill_total_pkr.toFixed(2)}
                            </span>
                          </p>
                        )}
                      </div>
                      {tariffCalc.tariff_plan_name && (
                        <p className="text-xs text-indigo-700/80">
                          {tariffCalc.tariff_plan_name}
                          {tariffCalc.tariff_source ? ` · ${tariffCalc.tariff_source}` : ""}
                        </p>
                      )}
                      {tariffCalc.bill_lines.length > 0 && (
                        <div className="rounded-xl bg-white/80 p-3 ring-1 ring-indigo-100">
                          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800 mb-2">
                            Bill calculation (estimated)
                          </p>
                          <table className="w-full text-xs">
                            <tbody>
                              {tariffCalc.bill_lines.map((line, idx) => (
                                <tr key={idx} className="border-b border-indigo-50 last:border-0">
                                  <td className="py-1.5 text-indigo-900">{line.label}</td>
                                  <td className="py-1.5 text-right tabular-nums text-indigo-800">
                                    {line.units} × {line.rate.toFixed(4)}
                                  </td>
                                  <td className="py-1.5 text-right tabular-nums font-semibold text-indigo-900 w-24">
                                    {line.amount.toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            {tariffCalc.bill_total_pkr != null && (
                              <tfoot>
                                <tr>
                                  <td colSpan={2} className="pt-2 text-right font-semibold text-indigo-900">
                                    Subtotal
                                  </td>
                                  <td className="pt-2 text-right tabular-nums font-bold text-indigo-900">
                                    {tariffCalc.bill_total_pkr.toFixed(2)}
                                  </td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      )}
                      {tariffCalc.message && (
                        <p className="text-xs text-indigo-700/90 leading-relaxed">{tariffCalc.message}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-indigo-800">
                      {tariffCalc.message || "Unable to calculate tariff yet. Need more usage history."}
                    </p>
                  )}
                </div>
                {tariffCalc.calculated_tariff !== null && (
                  <button
                    type="button"
                    onClick={() => applyCalculatedTariff()}
                    disabled={saving}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/25 hover:bg-indigo-500 disabled:opacity-60 transition-colors"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    Use & save rate
                  </button>
                )}
              </div>
            </div>
          )}

          {loadingTariffCalc && (
            <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Calculating tariff…
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Tariff (PKR/kWh)
              </label>
              <input
                className={inputClass}
                placeholder="e.g. 60"
                value={tariff}
                onChange={(e) => {
                  setTariff(e.target.value);
                  setUseCalculatedTariff(false);
                }}
                inputMode="decimal"
                disabled={loading}
              />
              <p className="mt-2 text-xs text-slate-500">
                Slab rates load from the active IESCO plan in Django Admin. Manual rate is fallback only.
              </p>
              {useCalculatedTariff && tariffCalc?.calculated_tariff !== null && (
                <p className="mt-1 text-xs font-medium text-indigo-600">Using calculated tariff</p>
              )}
            </div>

            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Preview</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                {parsedTariff === null ? "—" : `${parsedTariff} PKR/kWh`}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Example: 2.50 kWh →{" "}
                <span className="font-semibold tabular-nums text-indigo-700">
                  {parsedTariff === null ? "—" : `PKR ${(2.5 * parsedTariff).toFixed(2)}`}
                </span>
              </p>
            </div>
          </div>

          {tariffCalc && tariffCalc.monthly_usage.length > 0 && (
            <div className="mt-5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-3">
                Last 6 months (units)
              </p>
              <div className="space-y-3">
                {tariffCalc.monthly_usage.map((month, idx) => {
                  const pct = Math.min(100, (month.kwh / maxMonthKwh) * 100);
                  const over200 = month.kwh >= 200;
                  return (
                    <div key={idx}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-medium text-slate-700">{month.month}</span>
                        <span className={`tabular-nums font-semibold ${over200 ? "text-red-600" : "text-slate-800"}`}>
                          {month.kwh.toFixed(1)} units
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full transition-all ${over200 ? "bg-red-500" : "bg-indigo-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onSaveTariff()}
              disabled={loading || saving}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/25 hover:bg-indigo-500 disabled:opacity-60 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save tariff
            </button>
            {msg && (
              <StatusBanner
                msg={msg}
                tone={msg.includes("saved") || msg.includes("Saved") ? "success" : "error"}
              />
            )}
          </div>
        </section>

        {/* Solar */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/25">
              <Sun className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-slate-900">Solar panels</h2>
              <p className="text-xs text-slate-500">Enable tracking on the Solar page</p>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 w-fit">
            <input
              type="checkbox"
              checked={solarEnabled}
              onChange={(e) => setSolarEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-slate-800">Enable solar tracking</span>
          </label>

          {solarEnabled && (
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Installed capacity (kW)
                </label>
                <input
                  className={inputClass}
                  placeholder="e.g. 5.0"
                  value={solarCapacity}
                  onChange={(e) => setSolarCapacity(e.target.value)}
                  inputMode="decimal"
                  disabled={loading}
                />
                <p className="mt-2 text-xs text-slate-500">Total nameplate capacity of your array</p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Location
                  </label>
                  <button
                    type="button"
                    onClick={onFetchLocation}
                    disabled={fetchingLocation || loading}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
                  >
                    {fetchingLocation ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Fetching…
                      </>
                    ) : (
                      <>
                        <MapPin className="h-3 w-3" />
                        Use my location
                      </>
                    )}
                  </button>
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <input
                    className={inputClass}
                    placeholder="Latitude"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    inputMode="decimal"
                    disabled={loading}
                  />
                  <input
                    className={inputClass}
                    placeholder="Longitude"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    inputMode="decimal"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="rounded-xl bg-gradient-to-br from-amber-50 to-white p-4 ring-1 ring-amber-100 lg:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-amber-800">Preview</p>
                <div className="mt-2 flex flex-wrap gap-6 text-sm">
                  <p className="text-slate-700">
                    Capacity:{" "}
                    <span className="font-bold tabular-nums text-slate-900">
                      {parsedSolarCapacity === null ? "—" : `${parsedSolarCapacity} kW`}
                    </span>
                  </p>
                  <p className="text-slate-700">
                    Coordinates:{" "}
                    <span className="font-bold tabular-nums text-slate-900">
                      {parsedLatitude !== null && parsedLongitude !== null
                        ? `${parsedLatitude.toFixed(4)}, ${parsedLongitude.toFixed(4)}`
                        : "—"}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onSaveSolar}
              disabled={loading || savingSolar}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-amber-500/25 hover:bg-amber-400 disabled:opacity-60 transition-colors"
            >
              {savingSolar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save solar settings
            </button>
            {solarMsg && (
              <StatusBanner
                msg={solarMsg}
                tone={solarMsg.includes("saved") || solarMsg.includes("fetched") ? "success" : "error"}
              />
            )}
          </div>
        </section>

        <p className="flex items-center justify-center gap-1.5 pb-2 text-center text-xs text-slate-400">
          <Activity className="h-3.5 w-3.5" />
          Settings are saved to your WattGuard account
        </p>
      </div>
    </AppShell>
  );
}
