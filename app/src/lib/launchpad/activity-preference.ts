"use client";

import { useSyncExternalStore } from "react";

export const ACTIVITY_NOTIFICATIONS_KEY = "ol:activity-notifications";

const listeners = new Set<() => void>();
let inMemoryEnabled = false;
let memoryOnly = false;

/** Opt-in only. A denied storage write still takes effect for the current page. */
export function getActivityNotifications(): boolean {
  if (typeof window === "undefined") return false;
  if (memoryOnly) return inMemoryEnabled;
  try {
    inMemoryEnabled = window.localStorage.getItem(ACTIVITY_NOTIFICATIONS_KEY) === "1";
  } catch {
    memoryOnly = true;
  }
  return inMemoryEnabled;
}

export function getActivityNotificationsServer(): boolean {
  return false;
}

function onStorage(event: StorageEvent): void {
  if (event.key !== ACTIVITY_NOTIFICATIONS_KEY && event.key !== null) return;
  try {
    if (event.storageArea !== window.localStorage) return;
  } catch {
    return;
  }
  memoryOnly = false;
  inMemoryEnabled = event.key !== null && event.newValue === "1";
  for (const listener of listeners) listener();
}

export function subscribeActivityNotifications(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

export function setActivityNotifications(enabled: boolean): void {
  if (typeof window === "undefined") return;
  inMemoryEnabled = enabled;
  try {
    window.localStorage.setItem(ACTIVITY_NOTIFICATIONS_KEY, enabled ? "1" : "0");
    memoryOnly = false;
  } catch {
    memoryOnly = true;
  }
  for (const listener of listeners) listener();
}

/** The server and hydration snapshots stay off; the saved preference follows after hydration. */
export function useActivityNotifications(): boolean {
  return useSyncExternalStore(subscribeActivityNotifications, getActivityNotifications, getActivityNotificationsServer);
}
