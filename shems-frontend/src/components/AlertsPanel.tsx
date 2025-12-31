import { AlertTriangle, WifiOff } from "lucide-react";

export type AlertItem = {
  type: "offline" | "high";
  title: string;
  message: string;
};

export default function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
      <div className="font-semibold">Alerts</div>
      <div className="text-sm text-slate-600 mt-1">Quick insights & warnings</div>

      <div className="mt-4 space-y-3">
        {alerts.length ? (
          alerts.map((a, idx) => (
            <div
              key={idx}
              className={`rounded-xl p-3 ring-1 ${
                a.type === "offline"
                  ? "bg-red-50 ring-red-200"
                  : "bg-amber-50 ring-amber-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  {a.type === "offline" ? (
                    <WifiOff className="h-4 w-4 text-red-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-700" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold">{a.title}</div>
                  <div className="text-xs text-slate-700 mt-1">{a.message}</div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3 text-sm text-slate-600">
            No alerts right now.
          </div>
        )}
      </div>
    </div>
  );
}
