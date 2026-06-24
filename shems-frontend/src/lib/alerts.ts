import { getLiveAlerts } from "./api";

export type AlertType = "offline" | "high" | "limit" | "daily_limit";

export type AlertRecord = {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  created_at: string;
  read: boolean;
  device_id?: number;
};

const READ_KEY = "wattguard_alerts_read_v1";
const DISMISSED_KEY = "wattguard_alerts_dismissed_v1";
const CACHE_KEY = "wattguard_alerts_cache_v1";

function readIdSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeIdSet(key: string, ids: Set<string>) {
  localStorage.setItem(key, JSON.stringify(Array.from(ids)));
}

function notifyChanged() {
  window.dispatchEvent(new Event("shems-alerts-changed"));
}

function readCache(): AlertRecord[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AlertRecord[]) : [];
  } catch {
    return [];
  }
}

function writeCache(items: AlertRecord[]) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(items));
  notifyChanged();
}

function mergeAlerts(fromApi: Array<Omit<AlertRecord, "read"> & { read?: boolean }>): AlertRecord[] {
  const readIds = readIdSet(READ_KEY);
  const dismissed = readIdSet(DISMISSED_KEY);
  return fromApi
    .filter((a) => !dismissed.has(a.id))
    .map((a) => ({
      ...a,
      type: a.type as AlertType,
      read: readIds.has(a.id),
    }));
}

/** Fetch live alerts from API and update local cache. */
export async function refreshAlerts(): Promise<AlertRecord[]> {
  const fromApi = await getLiveAlerts();
  const merged = mergeAlerts(
    fromApi.map((a) => ({ ...a, type: a.type as AlertType }))
  );
  writeCache(merged);
  return merged;
}

export function getAlerts(): AlertRecord[] {
  return readCache().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function getUnreadAlertCount(): number {
  return readCache().filter((a) => !a.read).length;
}

export function markAlertsRead(ids: string[]) {
  const readIds = readIdSet(READ_KEY);
  ids.forEach((id) => readIds.add(id));
  writeIdSet(READ_KEY, readIds);
  const updated = readCache().map((a) => (ids.includes(a.id) ? { ...a, read: true } : a));
  writeCache(updated);
}

export function deleteAlerts(ids: string[]) {
  const dismissed = readIdSet(DISMISSED_KEY);
  ids.forEach((id) => dismissed.add(id));
  writeIdSet(DISMISSED_KEY, dismissed);
  writeCache(readCache().filter((a) => !ids.includes(a.id)));
}

export function clearAllAlerts() {
  const dismissed = readIdSet(DISMISSED_KEY);
  readCache().forEach((a) => dismissed.add(a.id));
  writeIdSet(DISMISSED_KEY, dismissed);
  writeCache([]);
}

/** @deprecated Use refreshAlerts — kept for gradual migration */
export function upsertAlerts(_newOnes: AlertRecord[]) {
  void refreshAlerts().catch(() => void 0);
}
