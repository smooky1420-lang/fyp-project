import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import DevicesPage from "./pages/Devices";
import Monitoring from "./pages/Monitoring";
import Settings from "./pages/Settings";
import AlertsPage from "./pages/Alerts";



export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/devices" element={<DevicesPage />} />
      <Route path="/monitoring" element={<Monitoring />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/alerts" element={<AlertsPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
