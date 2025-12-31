export type AlertType = "offline" | "high";

export type AlertRecord = {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  created_at: string; // ISO
  read: boolean;
};

const KEY = "shems_alerts_v1";

function readAll(): AlertRecord[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is AlertRecord => typeof x === "object" && x !== null) as AlertRecord[];
  } catch {
    return [];
  }
}

function writeAll(items: AlertRecord[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("shems-alerts-changed"));
}

export function getAlerts(): AlertRecord[] {
  return readAll().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function getUnreadAlertCount(): number {
  return readAll().filter((a) => !a.read).length;
}

export function upsertAlerts(newOnes: AlertRecord[]) {
  const existing = readAll();
  const map = new Map(existing.map((a) => [a.id, a]));

  for (const a of newOnes) {
    if (!map.has(a.id)) map.set(a.id, a);
  }

  writeAll(Array.from(map.values()));
}

export function markAlertsRead(ids: string[]) {
  const items = readAll().map((a) => (ids.includes(a.id) ? { ...a, read: true } : a));
  writeAll(items);
}

export function deleteAlerts(ids: string[]) {
  const items = readAll().filter((a) => !ids.includes(a.id));
  writeAll(items);
}

export function clearAllAlerts() {
  writeAll([]);
}
