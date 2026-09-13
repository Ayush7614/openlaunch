import type { ChainKey } from "@/lib/chainPublic";
import type { FeedItem } from "./queries";

export type ToastDetail = { kind: "launch" | "buy" | "sell" | "collect" | "info"; title: string; sub?: string; chain?: ChainKey; token?: string; symbol?: string; image?: string | null; celebrate?: boolean };
export type QueuedToast = ToastDetail & { id: string; source: "local" | "activity" };
export type ActiveToast = QueuedToast & { remainingMs: number; startedAt: number | null; leaving: boolean };
export type ToastQueue = { active: ActiveToast | null; pending: QueuedToast[]; hover: boolean; focus: boolean };

export const TOAST_TTL_MS = 6_000;
export const TOAST_EXIT_MS = 350;
export const MAX_PENDING_ACTIVITY = 20;

export function createToastQueue(): ToastQueue {
  return { active: null, pending: [], hover: false, focus: false };
}

function activate(item: QueuedToast, now: number, paused: boolean): ActiveToast {
  return { ...item, remainingMs: TOAST_TTL_MS, startedAt: paused ? null : now, leaving: false };
}

/** Local confirmations keep their order and take the next available slot. */
export function enqueueToast(state: ToastQueue, item: QueuedToast, now: number): ToastQueue {
  if (!state.active) return { ...state, active: activate(item, now, state.hover || state.focus) };
  const pending = [...state.pending, item];
  return {
    ...state,
    pending: [
      ...pending.filter((toast) => toast.source === "local"),
      ...pending.filter((toast) => toast.source === "activity").slice(-MAX_PENDING_ACTIVITY),
    ],
  };
}

export function dismissToast(state: ToastQueue, id: string, now: number): ToastQueue {
  if (state.active?.id !== id) return state;
  const [next, ...pending] = state.pending;
  // Removing a focused card does not reliably emit blur; its replacement starts unfocused.
  return { active: next ? activate(next, now, state.hover) : null, pending, hover: next ? state.hover : false, focus: false };
}

/** Muting community activity never dismisses or restarts one of your own updates. */
export function removeActivityToasts(state: ToastQueue, now: number): ToastQueue {
  const pending = state.pending.filter((toast) => toast.source === "local");
  if (state.active?.source === "activity") {
    return dismissToast({ ...state, pending }, state.active.id, now);
  }
  return pending.length === state.pending.length ? state : { ...state, pending };
}

/** Count only time on screen while neither the pointer nor keyboard is inspecting the card. */
export function pauseToast(state: ToastQueue, reason: "hover" | "focus", paused: boolean, now: number): ToastQueue {
  if (state[reason] === paused) return state;
  const next = { ...state, [reason]: paused };
  const active = state.active;
  if (!active || (state.hover || state.focus) === (next.hover || next.focus)) return next;
  next.active = {
    ...active,
    remainingMs: active.startedAt === null ? active.remainingMs : Math.max(0, active.remainingMs - (now - active.startedAt)),
    startedAt: next.hover || next.focus ? null : now,
  };
  return next;
}

export function toastDelay(active: ActiveToast, now: number): number | null {
  return active.startedAt === null ? null : Math.max(0, active.remainingMs - (now - active.startedAt));
}

export function expireToast(state: ToastQueue, id: string, now: number): ToastQueue {
  const active = state.active;
  if (!active || active.id !== id || toastDelay(active, now) !== 0) return state;
  if (active.leaving) return dismissToast(state, id, now);
  return { ...state, active: { ...active, leaving: true, remainingMs: TOAST_EXIT_MS, startedAt: now } };
}

function feedKey(item: FeedItem): string {
  return `${item.chain}:${item.kind}:${item.tx_hash}:${item.token}${item.kind === "swap" ? `:${item.quote_wei}` : ""}`;
}

/** Remember every arrival, including activity later dropped from the bounded queue. */
export function createToastFeedTracker(initial: FeedItem[]) {
  let seen = new Set(initial.map(feedKey));
  return (incoming: FeedItem[]): FeedItem[] => {
    const fresh: FeedItem[] = [];
    for (const item of [...incoming].reverse()) {
      const key = feedKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      fresh.push(item);
    }
    if (seen.size > 2_000) seen = new Set(incoming.map(feedKey));
    return fresh;
  };
}
