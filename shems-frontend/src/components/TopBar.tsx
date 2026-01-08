import { useNavigate } from "react-router-dom";
import { Bell, User } from "lucide-react";
import { useEffect, useState } from "react";
import { getUnreadAlertCount } from "../lib/alerts";

interface TopBarProps {
  pageTitle: string;
}

export default function TopBar({ pageTitle }: TopBarProps) {
  const nav = useNavigate();
  const [unread, setUnread] = useState<number>(() => getUnreadAlertCount());

  // keep badge updated when localStorage changes / when our app triggers a refresh event
  useEffect(() => {
    const refresh = () => setUnread(getUnreadAlertCount());
    window.addEventListener("storage", refresh);
    window.addEventListener("shems-alerts-changed", refresh as EventListener);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("shems-alerts-changed", refresh as EventListener);
    };
  }, []);

  return (
    <div className="sticky top-0 z-40 bg-slate-50/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-5 pt-5">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm px-5 py-4 flex items-center justify-between">
          <div className="font-semibold text-lg">{pageTitle}</div>

          <div className="flex items-center gap-2">
            {/* Notifications */}
            <button
              type="button"
              onClick={() => nav("/alerts")}
              className="relative rounded-xl bg-white ring-1 ring-slate-200 p-2 hover:bg-slate-50"
              title="Alerts"
            >
              <Bell className="h-4 w-4 text-slate-600" />
              {unread > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] leading-[18px] text-center">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </button>

            {/* Profile placeholder */}
            <button
              type="button"
              className="rounded-xl bg-white ring-1 ring-slate-200 p-2 hover:bg-slate-50"
              title="Profile (coming soon)"
            >
              <User className="h-4 w-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
