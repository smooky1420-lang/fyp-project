import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Cpu,
  Activity,
  Settings,
  LogOut,
  AlertCircle,
  Sun,
  FileText,
  Sparkles,
} from "lucide-react";
import { clearTokens } from "../lib/api";
import TopBar from "./TopBar";

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
  if (pathname.startsWith("/solar")) return "Solar";
  if (pathname.startsWith("/reports")) return "Reports";
  if (pathname.startsWith("/predictions")) return "AI Predictions";
  return "WattGuard";
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

  const pageTitle = title ?? pageTitleFromPath(loc.pathname);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex">
        {/* Fixed Sidebar (icons only on small, labels on md+) */}
        <aside className="w-16 md:w-64 h-screen fixed top-0 left-0 bg-white ring-1 ring-slate-200 flex flex-col overflow-y-auto">
          {/* Brand */}
          <div className="p-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-indigo-600 text-white grid place-items-center font-semibold">
                W
              </div>
              <div className="hidden md:block">
                <div className="font-semibold leading-tight">WattGuard</div>
                <div className="text-xs text-slate-500 leading-tight">Energy Dashboard</div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="p-3 flex flex-col gap-2 flex-1 overflow-y-auto">
            <SideItem to="/dashboard" label="Dashboard" icon={<LayoutDashboard className="h-5 w-5" />} />
            <SideItem to="/devices" label="Devices" icon={<Cpu className="h-5 w-5" />} />
            <SideItem to="/solar" label="Solar" icon={<Sun className="h-5 w-5" />} />
            <SideItem to="/monitoring" label="Monitoring" icon={<Activity className="h-5 w-5" />} />
            <SideItem to="/reports" label="Reports" icon={<FileText className="h-5 w-5" />} />
            <SideItem to="/predictions" label="AI Predictions" icon={<Sparkles className="h-5 w-5" />} />
            <SideItem to="/alerts" label="Alerts" icon={<AlertCircle className="h-5 w-5" />} />
            <SideItem to="/settings" label="Settings" icon={<Settings className="h-5 w-5" />} />
          </nav>

          {/* Logout at bottom */}
          <div className="p-3 border-t border-slate-100 shrink-0">
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
        <main className="flex-1 ml-16 md:ml-64">
          <TopBar pageTitle={pageTitle} />

          {/* Content */}
          <div className="mx-auto max-w-6xl px-5 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
