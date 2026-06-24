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
  BookOpen,
  Zap,
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
        `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition
         ${
           isActive
             ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/25"
             : "text-slate-700 hover:bg-indigo-50 hover:text-indigo-900"
         }`
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
  if (pathname.startsWith("/predictions")) return "Forecast";
  if (pathname.startsWith("/help")) return "Help";
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
        <aside className="w-16 md:w-64 h-screen fixed top-0 left-0 bg-white ring-1 ring-slate-200/80 flex flex-col overflow-y-auto shadow-sm">
          {/* Brand — matches app hero gradient */}
          <div className="relative shrink-0 overflow-hidden border-b border-indigo-900/40">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900" />
            <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-indigo-500/25 blur-2xl" />
            <div className="relative p-4">
              <div className="flex items-center justify-center gap-3 md:justify-start">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-600 text-white shadow-lg shadow-indigo-950/50 ring-1 ring-white/20">
                  <Zap className="h-5 w-5" aria-hidden />
                </div>
                <div className="hidden md:block min-w-0">
                  <div className="font-bold tracking-tight text-white">WattGuard</div>
                  <div className="text-xs text-indigo-200/80 leading-tight">Energy Dashboard</div>
                </div>
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
            <SideItem to="/predictions" label="Forecast" icon={<Sparkles className="h-5 w-5" />} />
            <SideItem to="/alerts" label="Alerts" icon={<AlertCircle className="h-5 w-5" />} />
            <SideItem to="/settings" label="Settings" icon={<Settings className="h-5 w-5" />} />
            <SideItem to="/help" label="Help" icon={<BookOpen className="h-5 w-5" />} />
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
              className="w-full rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 text-white px-3 py-2 text-sm font-medium shadow-sm ring-1 ring-slate-700/50 hover:from-slate-700 hover:to-slate-800 flex items-center justify-center gap-2 transition-colors"
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
