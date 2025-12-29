import type { ReactNode } from "react";
import { Bolt, LineChart, ShieldCheck, BellRing } from "lucide-react";

export default function AuthSplit({
  title,
  subtitle,
  children,
  showLeft = true,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  showLeft?: boolean;
}) {
  const features = [
    { Icon: Bolt, title: "Real-time Monitoring", desc: "Live voltage, current, power & energy." },
    { Icon: LineChart, title: "AI Predictions", desc: "Next-day usage + monthly bill estimate." },
    { Icon: ShieldCheck, title: "Safe Automation", desc: "Idle device protection & overload safety." },
    { Icon: BellRing, title: "Smart Alerts", desc: "Voltage drops, spikes & peak-hour warnings." },
  ];

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <div className={`min-h-screen grid ${showLeft ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
        {/* Left side */}
        {showLeft && (
          <div className="hidden lg:flex flex-col p-10 text-white relative overflow-hidden
                          bg-blue-600">
            <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-white/15 blur-3xl" />
            <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-black/20 blur-3xl" />

            <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-white/15 ring-1 ring-white/20 grid place-items-center font-bold">
                    S
                  </div>
                  <div>
                    <div className="text-sm font-semibold tracking-wide">SHEMS</div>
                    <div className="text-xs text-white/80">Smart Energy Dashboard</div>
                  </div>
                </div>

            <div className="relative flex-1 flex items-center">
              <div className="w-full">

                <h1 className="mt-6 text-4xl font-bold leading-tight">
                  Monitor, predict, and control energy usage.
                </h1>

                <p className="mt-4 text-white/85 max-w-xl">
                  Real-time analytics, AI predictions, and safe automation — built for Pakistan.
                </p>

                <div className="mt-8 grid gap-4">
                  {features.map(({ Icon, title, desc }) => (
                    <div
                      key={title}
                      className="flex gap-3 rounded-2xl bg-white/10 ring-1 ring-white/15 p-4 backdrop-blur-sm"
                    >
                      <div className="mt-1 rounded-xl bg-black/15 ring-1 ring-white/15 p-2">
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <div className="font-semibold">{title}</div>
                        <div className="text-sm text-white/80">{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative text-xs text-white/75">
              © {new Date().getFullYear()} SHEMS (FYP)
            </div>
          </div>
        )}

        {/* Right side */}
        <div className={`flex items-center justify-center p-6 lg:p-10 ${showLeft ? "" : "min-h-screen"}`}>
          <div className="w-full max-w-md rounded-2xl bg-white ring-1 ring-slate-200 p-6 sm:p-8 shadow-lg">
            <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
