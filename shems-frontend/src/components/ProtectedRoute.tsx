import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearTokens, getAccess, me } from "../lib/api";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = getAccess();
    if (!token) {
      nav("/login", { replace: true });
      return;
    }

    me()
      .then(() => setReady(true))
      .catch(() => {
        clearTokens();
        nav("/login", { replace: true });
      });
  }, [nav]);

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-600">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
