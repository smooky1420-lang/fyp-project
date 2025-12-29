import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, User, Lock } from "lucide-react";
import AuthSplit from "../components/AuthSplit";
import { loginUser, setTokens } from "../lib/api";
import { getErrorMessage } from "../lib/errors";

export default function Login() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const t = await loginUser({ username, password });

      // MVP: localStorage. If you later add “remember me” properly, you can switch to sessionStorage.
      if (!remember) {
        // quick behavior: store in sessionStorage instead
        sessionStorage.setItem("access", t.access);
        sessionStorage.setItem("refresh", t.refresh);
        localStorage.removeItem("access");
        localStorage.removeItem("refresh");
      } else {
        setTokens(t);
        sessionStorage.removeItem("access");
        sessionStorage.removeItem("refresh");
      }

      nav("/dashboard");
    } catch (err: unknown) {
      setMsg(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplit title="Welcome back" subtitle="Sign in to access your dashboard.">
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Username */}
        <div>
          <label className="text-sm font-medium text-slate-700">Username</label>
          <div className="mt-1 relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="w-full rounded-xl bg-white ring-1 ring-slate-200 px-10 py-2.5 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. testuser2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
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
              className="w-full rounded-xl bg-white ring-1 ring-slate-200 px-10 py-2.5 pr-11 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
              type={showPass ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
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

        {/* Row */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember me
          </label>

          <button
            type="button"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
            onClick={() => setMsg("Password reset can be added in future.")}
          >
            Forgot password?
          </button>
        </div>

        {msg && (
          <div className="rounded-xl bg-red-50 ring-1 ring-red-200 p-3 text-sm text-red-700">
            {msg}
          </div>
        )}

        <button
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 px-4 py-2.5 font-semibold text-white shadow-sm"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <p className="text-sm text-slate-600">
          Don&apos;t have an account?{" "}
          <Link className="font-medium text-indigo-600 hover:text-indigo-500" to="/signup">
            Create one
          </Link>
        </p>
      </form>
    </AuthSplit>
  );
}
