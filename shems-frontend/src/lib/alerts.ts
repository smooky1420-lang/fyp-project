import {
  clearAllAlerts as clearAllAlertsApi,
  dismissAlerts as dismissAlertsApi,
  getLiveAlerts,
  markAlertsRead as markAlertsReadApi,
} from "./api";

export type AlertType = "offline" | "high" | "limit" | "daily_limit";

export type AlertRecord = {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  created_at: string;
  resolved_at: string | null;
  active: boolean;
  read: boolean;
  device_id?: number;
};

const CACHE_KEY = "wattguard_alerts_cache_v2";

/** Alert ids already seen this session — only brand-new ids trigger a desktop notification. */
let seenAlertIds = new Set<string>(readCacheIds());

function readCacheIds(): string[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((a) => (a && typeof a === "object" && "id" in a ? String((a as AlertRecord).id) : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
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
  window.dispatchEvent(new Event("shems-alerts-changed"));
}

function mapApiAlert(
  a: Awaited<ReturnType<typeof getLiveAlerts>>[number]
): AlertRecord {
  return {
    id: a.id,
    type: a.type as AlertType,
    title: a.title,
    message: a.message,
    created_at: a.created_at,
    resolved_at: a.resolved_at ?? null,
    active: a.active,
    read: a.read,
    device_id: a.device_id,
  };
}

export function canUseBrowserNotifications(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!canUseBrowserNotifications()) return "unsupported";
  return Notification.permission;
}

export function notificationsEnabled(): boolean {
  return notificationPermission() === "granted";
}

/** Ask the browser for notification permission (must be called from a user click). */
export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!canUseBrowserNotifications()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

function showBrowserNotification(alert: AlertRecord): boolean {
  if (!canUseBrowserNotifications()) return false;
  if (Notification.permission !== "granted") return false;
  if (!alert.active) return false;

  try {
    const n = new Notification(alert.title, {
      body: alert.message,
      tag: `wattguard-alert-${alert.id}`,
      icon: "/vite.svg",
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      window.location.assign("/alerts");
      n.close();
    };
    return true;
  } catch (err) {
    console.warn("WattGuard: could not show notification", err);
    return false;
  }
}

/** Confirm notifications work — call right after the user grants permission. */
export function showTestNotification(): boolean {
  if (!canUseBrowserNotifications() || Notification.permission !== "granted") return false;
  try {
    const n = new Notification("WattGuard alerts enabled", {
      body: "You'll get a desktop ping when a device goes offline or exceeds a limit.",
      tag: "wattguard-test",
      icon: "/vite.svg",
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch (err) {
    console.warn("WattGuard: test notification failed", err);
    return false;
  }
}

function processAlertNotifications(items: AlertRecord[]) {
  if (Notification.permission !== "granted") return;

  const brandNew = items.filter(
    (a) => a.active && !a.read && !seenAlertIds.has(a.id)
  );

  for (const alert of brandNew) {
    showBrowserNotification(alert);
  }

  seenAlertIds = new Set(items.map((a) => a.id));
}

/** Notify for all current active unread alerts (call once after the user grants permission). */
export function notifyActiveUnread(items: AlertRecord[]) {
  if (Notification.permission !== "granted") return;
  for (const alert of items) {
    if (alert.active && !alert.read) {
      showBrowserNotification(alert);
    }
  }
  seenAlertIds = new Set(items.map((a) => a.id));
}

/** After permission grant, treat active unread alerts as not yet announced. */
export function primeNotificationsForEnable() {
  const cached = readCache();
  seenAlertIds = new Set(
    cached.filter((a) => !a.active || a.read).map((a) => a.id)
  );
}

/** Fetch alerts from API, update cache, and fire desktop notifications for new active alerts. */
export async function refreshAlerts(): Promise<AlertRecord[]> {
  const fromApi = await getLiveAlerts();
  const items = fromApi.map(mapApiAlert).sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1
  );
  processAlertNotifications(items);
  writeCache(items);
  return items;
}

export function getAlerts(): AlertRecord[] {
  return readCache();
}

export function getUnreadAlertCount(): number {
  return readCache().filter((a) => !a.read).length;
}

export function getActiveAlertCount(): number {
  return readCache().filter((a) => a.active).length;
}

export async function markAlertsRead(ids: string[]) {
  if (!ids.length) return;
  await markAlertsReadApi(ids.map((id) => Number(id)));
  const idSet = new Set(ids);
  const updated = readCache().map((a) =>
    idSet.has(a.id) ? { ...a, read: true } : a
  );
  writeCache(updated);
}

export async function deleteAlerts(ids: string[]) {
  if (!ids.length) return;
  await dismissAlertsApi(ids.map((id) => Number(id)));
  const idSet = new Set(ids);
  writeCache(readCache().filter((a) => !idSet.has(a.id)));
}

export async function clearAllAlerts() {
  await clearAllAlertsApi();
  writeCache([]);
}

/** @deprecated Use refreshAlerts */
export function upsertAlerts(_newOnes: AlertRecord[]) {
  void refreshAlerts().catch(() => void 0);
}
