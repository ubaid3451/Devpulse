"use client";

/**
 * Lightweight helpers for native browser desktop notifications.
 * Wraps the standard Notification API with safety checks — SSR guard
 * (Notification doesn't exist server-side), permission-state checks, and
 * silent no-ops if the browser doesn't support notifications at all.
 */

/** Requests permission to show notifications. Safe to call multiple times — the browser only prompts once per origin until the user resets it. */
export function requestNotificationPermission(): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

export interface ShowNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string; // groups/replaces notifications sharing the same tag (e.g. per-conversation)
  onClick?: () => void;
}

/** Shows a native desktop notification, if permission has been granted. */
export function showDesktopNotification({ title, body, icon, tag, onClick }: ShowNotificationOptions): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  console.log("Creating Notification:", title, body);

  try {
    const notification = new Notification(title, {
      body,
      icon: icon || "/favicon.ico",
      tag,
    });

    if (onClick) {
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    }
  } catch (err) {
    console.error("Notification constructor threw:", err);
  }
}

/** True if the tab is currently backgrounded — use this to decide whether to show a notification instead of relying on in-app UI. */
export function isTabHidden(): boolean {
  return typeof document !== "undefined" && document.hidden;
}