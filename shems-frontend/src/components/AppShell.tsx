import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  User,
  LayoutDashboard,
  Cpu,
  Activity,
  Settings,
  LogOut,
  AlertCircle,
} from "lucide-react";
import { clearTokens } from "../lib/api";
import { useEffect, useState } from "react";
import { getUnreadAlertCount } from "../lib/alerts";

function SideItem({
  to,
  label,
  icon,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition
         ${isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`
      }
    >
      <span className="shrink-0">{icon}</span>
      {/* hide labels on small screens, show on md+ */}
      <span className="hidden md:inline font-medium">{label}</span>
    </NavLink>
  );
}

function pageTitleFromPath(pathname: string) {
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/devices")) return "Devices";
  if (pathname.startsWith("/monitoring")) return "Monitoring";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/alerts")) return "Alerts";
  return "SHEMS";
}

export default function AppShell({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const nav = useNavigate();
  const loc = useLocation();

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

  const pageTitle = title ?? pageTitleFromPath(loc.pathname);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex">
        {/* Full-height Sidebar (icons only on small, labels on md+) */}
        <aside className="w-16 md:w-64 min-h-screen sticky top-0 bg-white ring-1 ring-slate-200 flex flex-col">
          {/* Brand */}
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-600 text-white grid place-items-center font-semibold">
                S
              </div>
              <div className="hidden md:block">
                <div className="font-semibold leading-tight">SHEMS</div>
                <div className="text-xs text-slate-500 leading-tight">Energy Dashboard</div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="p-3 flex flex-col gap-2">
            <SideItem to="/dashboard" label="Dashboard" icon={<LayoutDashboard className="h-5 w-5" />} />
            <SideItem to="/devices" label="Devices" icon={<Cpu className="h-5 w-5" />} />
            <SideItem to="/monitoring" label="Monitoring" icon={<Activity className="h-5 w-5" />} />
            <SideItem to="/alerts" label="Alerts" icon={<AlertCircle className="h-5 w-5" />} />
            <SideItem to="/settings" label="Settings" icon={<Settings className="h-5 w-5" />} />
          </nav>

          {/* Logout at bottom */}
          <div className="mt-auto p-3 border-t border-slate-100">
            <button
              type="button"
              title="Logout"
              onClick={() => {
                clearTokens();
                nav("/login");
              }}
              className="w-full rounded-xl bg-slate-900 text-white px-3 py-2 text-sm hover:bg-slate-800 flex items-center justify-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden md:inline">Logout</span>
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1">
          {/* Topbar */}
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

          {/* Content */}
          <div className="mx-auto max-w-6xl px-5 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
