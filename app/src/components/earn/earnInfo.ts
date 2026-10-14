"use client";

import { useEffect, useState } from "react";
import type { EarnInfo } from "@/lib/earn/info";

/**
 * GET /api/earn, once per page load and shared by everything that asks (the /me card, the ⌘K list). A failed request
 * reads as "off" and is not remembered, so the next caller tries again.
 */
let pending: Promise<EarnInfo> | null = null;

export function loadEarnInfo(): Promise<EarnInfo> {
  pending ??= fetch("/api/earn", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<EarnInfo>) : Promise.reject(new Error(String(r.status)))))
    .catch((): EarnInfo => {
      pending = null;
      return { enabled: false };
    });
  return pending;
}

/** The answer, or null until it arrives. `active` false skips the request (the ⌘K list asks only once opened). */
export function useEarnInfo(active = true): EarnInfo | null {
  const [info, setInfo] = useState<EarnInfo | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    void loadEarnInfo().then((i) => {
      if (alive) setInfo(i);
    });
    return () => {
      alive = false;
    };
  }, [active]);
  return info;
}
