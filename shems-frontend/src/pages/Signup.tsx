import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, User, Lock, Mail } from "lucide-react";
import AuthSplit from "../components/AuthSplit";
import { registerUser } from "../lib/api";
import { getErrorMessage } from "../lib/errors";

export default function Signup() {
  const nav = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPass, setShowPass] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    if (password !== confirmPassword) {
      setMsg("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      await registerUser({ username, email, password });
      nav("/login");
    } catch (err: unknown) {
      setMsg(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplit
      title="Create account"
      subtitle="Start monitoring your home energy usage."
      showLeft={false}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Username */}
        <div>
          <label className="text-sm font-medium text-slate-700">Username</label>
          <div className="mt-1 relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="w-full rounded-xl bg-white ring-1 ring-slate-200 px-10 py-2.5 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Choose a username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="text-sm font-medium text-slate-700">Email</label>
          <div className="mt-1 relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="w-full rounded-xl bg-white ring-1 ring-slate-200 px-10 py-2.5 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="text-sm font-medium text-slate-700">Password</label>
          <div className="mt-1 relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="w-full rounded-xl bg-white ring-1 ring-slate-200 px-10 py-2.5 pr-11 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500"
              type={showPass ? "text" : "password"}
              placeholder="Create a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPass((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label={showPass ? "Hide password" : "Show password"}
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div>
          <label className="text-sm font-medium text-slate-700">Confirm Password</label>
          <div className="mt-1 relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="w-full rounded-xl bg-white ring-1 ring-slate-200 px-10 py-2.5 pr-11 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500"
              type={showPass ? "text" : "password"}
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPass((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              aria-label={showPass ? "Hide password" : "Show password"}
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {msg && (
          <div className="rounded-xl bg-red-50 ring-1 ring-red-200 p-3 text-sm text-red-700">
            {msg}
          </div>
        )}

        <button
          disabled={loading}
          className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-4 py-2.5 font-semibold text-white shadow-sm"
        >
          {loading ? "Creating..." : "Create account"}
        </button>

        <p className="text-sm text-slate-600">
          Already have an account?{" "}
          <Link className="font-medium text-emerald-600 hover:text-emerald-500" to="/login">
            Sign in
          </Link>
        </p>
      </form>
    </AuthSplit>
  );
}
