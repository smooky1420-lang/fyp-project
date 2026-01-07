import type { ReactNode } from "react";

const colorClasses = {
  green: "bg-gradient-to-br from-green-50 to-green-100/50 border-green-200",
  blue: "bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200",
  orange: "bg-gradient-to-br from-orange-50 to-orange-100/50 border-orange-200",
  purple: "bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-200",
  indigo: "bg-gradient-to-br from-indigo-50 to-indigo-100/50 border-indigo-200",
  yellow: "bg-gradient-to-br from-yellow-50 to-yellow-100/50 border-yellow-200",
};

const iconColors = {
  green: "text-green-600",
  blue: "text-blue-600",
  orange: "text-orange-600",
  purple: "text-purple-600",
  indigo: "text-indigo-600",
  yellow: "text-yellow-300",
};

export default function StatCard({
  title,
  value,
  subValue,
  icon,
  color = "yellow",
}: {
  title: string;
  value: string;
  subValue?: string;
  icon?: ReactNode;
  color?: keyof typeof colorClasses;
}) {
  return (
    <div className={`rounded-2xl ring-1 shadow-sm p-5 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-700 font-medium">{title}</div>
        {icon ? <div className={iconColors[color]}>{icon}</div> : null}
      </div>

      <div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>

      {subValue ? (
        <div className="mt-2 text-xs text-slate-600 tabular-nums">{subValue}</div>
      ) : (
        <div className="mt-2 text-xs text-slate-500">&nbsp;</div>
      )}
    </div>
  );
}
