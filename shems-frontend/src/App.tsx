import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import DevicesPage from "./pages/Devices";
import Monitoring from "./pages/Monitoring";
import Settings from "./pages/Settings";
import AlertsPage from "./pages/Alerts";
import Solar from "./pages/Solar";
import Reports from "./pages/Reports";
import Predictions from "./pages/Predictions";
import Help from "./pages/Help";
import ProtectedRoute from "./components/ProtectedRoute";

function Guard({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/help" element={<Help />} />
      <Route path="/dashboard" element={<Guard><Dashboard /></Guard>} />
      <Route path="/devices" element={<Guard><DevicesPage /></Guard>} />
      <Route path="/monitoring" element={<Guard><Monitoring /></Guard>} />
      <Route path="/settings" element={<Guard><Settings /></Guard>} />
      <Route path="/alerts" element={<Guard><AlertsPage /></Guard>} />
      <Route path="/solar" element={<Guard><Solar /></Guard>} />
      <Route path="/reports" element={<Guard><Reports /></Guard>} />
      <Route path="/predictions" element={<Guard><Predictions /></Guard>} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
