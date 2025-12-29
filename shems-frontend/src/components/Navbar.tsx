import { NavLink, useNavigate } from "react-router-dom";
import { clearTokens } from "../lib/api";
import { LayoutDashboard, Cpu, Settings, LogOut } from "lucide-react";

type Props = {
  title?: string;
};

function Item({
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
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-xl px-3 py-2 text-sm ring-1 transition
         ${isActive ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"}`
      }
    >
      <span className="text-slate-500">{icon}</span>
      <span className="font-medium">{label}</span>
    </NavLink>
  );
}

export default function Navbar({ title = "SHEMS" }: Props) {
  const nav = useNavigate();

  return (
    <div className="sticky top-0 z-50 bg-slate-50/80 backdrop-blur">
      <div className="mx-auto max-w-5xl px-6 pt-6">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-600 text-white grid place-items-center font-semibold">
              S
            </div>
            <div>
              <div className="font-semibold leading-tight">{title}</div>
              <div className="text-xs text-slate-500 leading-tight">Smart Home Energy Dashboard</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Item to="/dashboard" label="Dashboard" icon={<LayoutDashboard className="h-4 w-4" />} />
            <Item to="/devices" label="Devices" icon={<Cpu className="h-4 w-4" />} />
            <Item to="/settings" label="Settings" icon={<Settings className="h-4 w-4" />} />

            <button
              type="button"
              onClick={() => {
                clearTokens();
                nav("/login");
              }}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm ring-1 bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4 text-slate-500" />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
