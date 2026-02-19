/**
 * Notification utilities for OS (Tauri) and in-app toasts.
 * Handles permission requests and graceful fallbacks.
 */

function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}

let permissionChecked = false;
let permissionGranted: boolean | null = null;

/** Check if OS notification permission is granted. */
export async function isNotificationPermissionGranted(): Promise<boolean> {
  if (!isTauri()) return false;
  if (permissionChecked) return permissionGranted ?? false;
  try {
    const { isPermissionGranted } = await import(
      "@tauri-apps/plugin-notification"
    );
    permissionGranted = await isPermissionGranted();
    permissionChecked = true;
    return permissionGranted;
  } catch {
    permissionChecked = true;
    permissionGranted = false;
    return false;
  }
}

/** Request OS notification permission from the user. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { requestPermission, isPermissionGranted } = await import(
      "@tauri-apps/plugin-notification"
    );
    const result = await requestPermission();
    permissionChecked = true;
    const granted =
      result === "granted" || (result == null && (await isPermissionGranted()));
    permissionGranted = granted;
    return granted;
  } catch {
    permissionChecked = true;
    permissionGranted = false;
    return false;
  }
}

/** Ensure we have permission; request if not yet granted. Returns true if we can send. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const granted = await isNotificationPermissionGranted();
  if (granted) return true;
  return requestNotificationPermission();
}

/** Send an OS notification. Requests permission if needed. Silently no-ops if not Tauri. */
export async function sendOsNotification(
  title: string,
  body: string,
  options?: { requestPermissionIfNeeded?: boolean }
): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const canSend =
      options?.requestPermissionIfNeeded !== false
        ? await ensureNotificationPermission()
        : await isNotificationPermissionGranted();
    if (!canSend) return false;

    const { sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    );
    await sendNotification({ title, body });
    return true;
  } catch {
    return false;
  }
}
