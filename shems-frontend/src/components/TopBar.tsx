import { useNavigate } from "react-router-dom";
import { Bell, User } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getUnreadAlertCount,
  notificationPermission,
  notificationsEnabled,
  primeNotificationsForEnable,
  refreshAlerts,
  requestNotificationPermission,
  showTestNotification,
} from "../lib/alerts";

interface TopBarProps {
  pageTitle: string;
}

export default function TopBar({ pageTitle }: TopBarProps) {
  const nav = useNavigate();
  const [unread, setUnread] = useState<number>(() => getUnreadAlertCount());
  const [notifPermission, setNotifPermission] = useState(notificationPermission);

  useEffect(() => {
    const refresh = () => setUnread(getUnreadAlertCount());
    window.addEventListener("storage", refresh);
    window.addEventListener("shems-alerts-changed", refresh as EventListener);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("shems-alerts-changed", refresh as EventListener);
    };
  }, []);

  async function enableNotificationsFromBar() {
    const result = await requestNotificationPermission();
    setNotifPermission(result);
    if (result !== "granted") return;
    primeNotificationsForEnable();
    showTestNotification();
    await refreshAlerts();
  }

  const showEnableDot =
    notifPermission !== "granted" && notifPermission !== "unsupported" && unread > 0;

  return (
    <div className="sticky top-0 z-40 bg-slate-50/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-5 pt-5">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm px-5 py-4 flex items-center justify-between">
          <div className="font-semibold text-lg">{pageTitle}</div>

          <div className="flex items-center gap-2">
            {notifPermission === "default" && (
              <button
                type="button"
                onClick={() => void enableNotificationsFromBar()}
                className="hidden sm:inline-flex rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
                title="Enable desktop notifications"
              >
                Enable alerts
              </button>
            )}
            {notificationsEnabled() && (
              <span
                className="hidden sm:inline text-[10px] font-medium uppercase tracking-wide text-emerald-600"
                title="Desktop notifications on"
              >
                Alerts on
              </span>
            )}
            <button
              type="button"
              onClick={() => nav("/alerts")}
              className="relative rounded-xl bg-white ring-1 ring-slate-200 p-2 hover:bg-slate-50"
              title={
                showEnableDot
                  ? "Alerts — click Enable alerts in the bar to get desktop notifications"
                  : "Alerts"
              }
            >
              <Bell className="h-4 w-4 text-slate-600" />
              {unread > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] leading-[18px] text-center">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
              {showEnableDot ? (
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white" />
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => nav("/settings")}
              className="rounded-xl bg-white ring-1 ring-slate-200 p-2 hover:bg-slate-50"
              title="Account settings"
            >
              <User className="h-4 w-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
