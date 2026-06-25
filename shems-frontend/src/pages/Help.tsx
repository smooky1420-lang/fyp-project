import { useState } from "react";
import { Link } from "react-router-dom";
import AppShell from "../components/AppShell";
import { getAccess } from "../lib/api";
import {
  BookOpen,
  ChevronDown,
  Cpu,
  LayoutDashboard,
  Activity,
  FileText,
  Sparkles,
  Sun,
  Bell,
  Settings,
  HelpCircle,
  Gauge,
  ArrowRight,
  Zap,
} from "lucide-react";

const PAGE_GUIDES = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    text: "See live power, today's energy (kWh), estimated cost, and quick tips. Switch between all meters or one device.",
    color: "indigo",
  },
  {
    icon: Cpu,
    title: "Devices",
    text: "Add or edit meters. Turn relay on/off for controllable loads, set power or daily limits, and copy setup tokens.",
    color: "indigo",
  },
  {
    icon: Activity,
    title: "Monitoring",
    text: "View power, voltage, current, or energy over custom time ranges. Download a CSV if you need a record.",
    color: "indigo",
  },
  {
    icon: FileText,
    title: "Reports",
    text: "Compare the last 12 months of usage and cost. See which devices used the most and export a summary.",
    color: "indigo",
  },
  {
    icon: Sparkles,
    title: "Forecast",
    text: "View predicted usage for the next 7 or 30 days based on your past consumption, plus personalised savings tips.",
    color: "violet",
  },
  {
    icon: Sun,
    title: "Solar",
    text: "If you have solar panels, enable them in Settings with your location and capacity to see estimated generation and savings.",
    color: "amber",
  },
  {
    icon: Bell,
    title: "Alerts",
    text: "Notifications when a device goes offline or a power/daily limit you set on that device is exceeded. Mark as read or dismiss.",
    color: "rose",
  },
  {
    icon: Settings,
    title: "Settings",
    text: "Set your tariff, run the cost calculator, and configure solar (on/off, capacity, map location).",
    color: "slate",
  },
] as const;

const COLOR_STYLES: Record<string, { icon: string; ring: string }> = {
  indigo: { icon: "bg-indigo-600 text-white shadow-indigo-500/25", ring: "ring-indigo-100" },
  violet: { icon: "bg-violet-600 text-white shadow-violet-500/25", ring: "ring-violet-100" },
  amber: { icon: "bg-amber-500 text-white shadow-amber-500/25", ring: "ring-amber-100" },
  rose: { icon: "bg-rose-600 text-white shadow-rose-500/25", ring: "ring-rose-100" },
  slate: { icon: "bg-slate-700 text-white shadow-slate-500/25", ring: "ring-slate-200" },
};

function FaqItem({ q, a }: { q: string; a: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200/80 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-medium text-slate-900 hover:bg-slate-50/80 transition-colors"
      >
        <span className="pr-2">{q}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 text-sm text-slate-600 leading-relaxed">{a}</div>
      )}
    </div>
  );
}

function HelpContent() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-indigo-900 text-white shadow-xl shadow-indigo-900/20">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-1/4 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="relative p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 shadow-lg">
              <BookOpen className="h-7 w-7 text-indigo-100" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-indigo-200">User guide</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">How to use WattGuard</h1>
              <p className="mt-3 max-w-2xl text-sm text-indigo-200/90 leading-relaxed">
                WattGuard helps you see how much electricity your home uses, what it costs, and how to save energy —
                with optional solar tracking and usage forecasts.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["Live monitoring", "Cost tracking", "Solar & forecasts", "Smart alerts"].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs text-indigo-100 ring-1 ring-white/10"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Getting started */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 md:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/25">
            <HelpCircle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">Getting started</h2>
            <p className="text-xs text-slate-500">Five steps to go from signup to live data</p>
          </div>
        </div>
        <ol className="space-y-3">
          {[
            {
              step: "1",
              title: "Create an account",
              text: "Sign up and sign in. Your data is private to your account only.",
            },
            {
              step: "2",
              title: "Set your tariff",
              text: "Open Settings and enter your electricity rate (PKR per kWh), or use the built-in calculator for an estimated Pakistan-style rate.",
            },
            {
              step: "3",
              title: "Add your meters",
              text: "Go to Devices and register each circuit you want to track — name, room, and type.",
            },
            {
              step: "4",
              title: "Link your hardware",
              text: "Copy the device token from the Devices page into your smart meter setup. Your installer or device manual will walk you through this.",
            },
            {
              step: "5",
              title: "Monitor usage",
              text: "Open Dashboard for today's totals, or Monitoring for detailed charts over time.",
            },
          ].map((item) => (
            <li
              key={item.step}
              className="flex gap-4 rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50 to-indigo-50/20 px-4 py-3"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
                {item.step}
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="mt-0.5 text-sm text-slate-600 leading-relaxed">{item.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Page guide */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 md:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white shadow-md shadow-violet-500/25">
            <LayoutDashboard className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">What each page does</h2>
            <p className="text-xs text-slate-500">Quick reference for every section of WattGuard</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {PAGE_GUIDES.map((item) => {
            const Icon = item.icon;
            const styles = COLOR_STYLES[item.color] ?? COLOR_STYLES.indigo;
            return (
              <div
                key={item.title}
                className={`rounded-xl border border-slate-100 bg-white p-4 ring-1 ${styles.ring} hover:shadow-sm transition-shadow`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-md ${styles.icon}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <h3 className="font-semibold text-slate-900">{item.title}</h3>
                </div>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{item.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Smart meters */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 md:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-500/25">
            <Gauge className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">Smart meters & relays</h2>
            <p className="text-xs text-slate-500">How devices connect and what limits do</p>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            "Each device has a unique token — used only to link your physical meter to your account.",
            "For controllable devices, turn the relay on or off from Devices; hardware should follow within a short time.",
            "Set a maximum power or daily energy limit; WattGuard alerts you if those limits are exceeded.",
            "If a device shows offline on the Dashboard, it has not sent data recently — check power, Wi‑Fi, and the token.",
          ].map((text, idx) => (
            <li
              key={idx}
              className="flex gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 leading-relaxed ring-1 ring-slate-100"
            >
              <Zap className="h-4 w-4 shrink-0 text-indigo-500 mt-0.5" />
              {text}
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ */}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/80 md:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500 text-white shadow-md shadow-sky-500/25">
            <HelpCircle className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">Frequently asked questions</h2>
            <p className="text-xs text-slate-500">Common issues and quick answers</p>
          </div>
        </div>
        <div className="space-y-2">
          <FaqItem
            q="Why does Dashboard say Offline?"
            a="WattGuard has not received new readings from your meter in the last 2 minutes. Make sure the device is powered on, connected to your network, and linked to the correct token on the Devices page."
          />
          <FaqItem
            q="Why is my cost wrong or showing zero?"
            a="Set your tariff in Settings (PKR per kWh). Costs are calculated as: energy used today × your tariff rate."
          />
          <FaqItem
            q="Why is the Forecast page empty?"
            a="Forecasts need several days of usage history first. Keep your meters running and check back after you have more data."
          />
          <FaqItem
            q="How do I enable solar tracking?"
            a="Open Settings, turn on solar, enter your panel capacity (kW), and set your location (use the location button or enter coordinates). Then open the Solar page."
          />
          <FaqItem
            q="Can other people see my electricity data?"
            a="No. Each account only sees its own devices and readings. Sign out on shared computers when you are done."
          />
          <FaqItem
            q="What do Alerts mean?"
            a="Offline — no recent data from a device. High usage — current load is above normal. Limits — you exceeded a power or daily energy cap you set on Devices."
          />
        </div>
      </section>

      <section className="rounded-2xl bg-slate-900 text-white p-5 ring-1 ring-slate-800">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Need more?</p>
        <p className="mt-2 text-sm text-slate-200 leading-relaxed">
          Start on the Dashboard once your meters are linked. If something still looks wrong, check Devices for offline
          status and Settings for your tariff.
        </p>
        <Link
          to="/dashboard"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-300 hover:text-indigo-200"
        >
          Go to Dashboard
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}

function StandaloneShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link to="/login" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-md shadow-indigo-500/25">
              W
            </div>
            <span className="font-semibold text-slate-900">WattGuard</span>
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
          >
            Sign in
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>
      <main className="px-5 py-8">{children}</main>
    </div>
  );
}

export default function Help() {
  const loggedIn = Boolean(getAccess());

  if (loggedIn) {
    return (
      <AppShell>
        <HelpContent />
      </AppShell>
    );
  }

  return (
    <StandaloneShell>
      <HelpContent />
    </StandaloneShell>
  );
}
