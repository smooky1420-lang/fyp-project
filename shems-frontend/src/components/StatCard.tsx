import type { ReactNode } from "react";

export default function StatCard({
  title,
  value,
  subValue,
  icon,
}: {
  title: string;
  value: string;
  subValue?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-sm p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-600">{title}</div>
        {icon ? <div className="text-slate-500">{icon}</div> : null}
      </div>

      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>

      {subValue ? (
        <div className="mt-2 text-xs text-slate-500 tabular-nums">{subValue}</div>
      ) : (
        <div className="mt-2 text-xs text-slate-500">&nbsp;</div>
      )}
    </div>
  );
}
