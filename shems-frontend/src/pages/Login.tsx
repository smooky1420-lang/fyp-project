import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, User, Lock } from "lucide-react";
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

      // MVP: localStorage. If you later add "remember me" properly, you can switch to sessionStorage.
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Form Card */}
        <div className="rounded-2xl bg-white ring-1 ring-slate-200 shadow-lg p-6 sm:p-8">
          {/* Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-4">
              <div className="h-16 w-16 rounded-xl bg-indigo-600 text-white grid place-items-center font-semibold text-2xl">
                W
              </div>
              <div>
                <div className="font-semibold text-3xl text-slate-900">WattGuard</div>
                <div className="text-sm text-slate-500">Smart Energy Dashboard</div>
              </div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            {/* Username */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  className="w-full rounded-xl bg-slate-50 ring-1 ring-slate-200 px-10 py-3 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  className="w-full rounded-xl bg-slate-50 ring-1 ring-slate-200 px-10 py-3 pr-11 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
                  type={showPass ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 transition-colors"
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Row */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember me
              </label>

              <button
                type="button"
                className="text-sm font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
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
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-3 font-semibold text-white shadow-sm transition-colors"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>

            <p className="text-center text-sm text-slate-600">
              Don&apos;t have an account?{" "}
              <Link className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors" to="/signup">
                Create one
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
