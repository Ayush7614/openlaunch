"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Global navigation progress bar (thin brand-blue line at the top of the viewport).
 * Starts on any same-origin link click that will change the URL, or on a `bb:nav` event
 * (programmatic navigations dispatch it); completes when the pathname / query actually changes.
 * Reduced motion: the bar still shows, without the creeping animation.
 */
export const NAV_EVENT = "bb:nav";
export function startNav(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NAV_EVENT));
}

const SAFETY_MS = 15_000; // give up (finish) if the route never changes, e.g. navigation cancelled
const MIN_VISIBLE_MS = 250;

export default function RouteProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeKey = `${pathname}?${search?.toString() ?? ""}`;
  const lastRoute = useRef(routeKey);

  // start
  useEffect(() => {
    const start = () => {
      startedAt.current = Date.now();
      setState("running");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), SAFETY_MS);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.getAttribute("rel")?.includes("external")) return;
      let url: URL;
      try {
        url = new URL(a.href, location.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // hash / same page
      start();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener(NAV_EVENT, start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(NAV_EVENT, start);
    };
  }, []);

  // finish when the route changed
  useEffect(() => {
    if (routeKey === lastRoute.current) return;
    lastRoute.current = routeKey;
    if (timer.current) clearTimeout(timer.current);
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - startedAt.current));
    const t1 = setTimeout(() => setState("done"), wait);
    const t2 = setTimeout(() => setState("idle"), wait + 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [routeKey]);

  return <div aria-hidden className={`bb-progress ${state === "running" ? "bb-progress-run" : state === "done" ? "bb-progress-done" : ""}`} />;
}
