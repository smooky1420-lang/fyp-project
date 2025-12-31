import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import { getUserSettings, updateUserSettings } from "../lib/api";
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

  const parsedTariff = useMemo(() => {
    const n = Number(tariff);
    if (!Number.isFinite(n)) return null;
    return clamp(n, 0, 500);
  }, [tariff]);

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
        </div>
      </div>
    </div>
    </AppShell>
  );
}
