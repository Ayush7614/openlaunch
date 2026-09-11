"use client";

import Link from "next/link";
import { useEffect } from "react";
import { btn } from "@/components/ui";
import { errorBody, errorRegionLabel, sanitizeDigest } from "@/lib/error-copy";

/** Route-level error boundary. Next.js injects `{ error, reset }`: `reset` re-renders the route segment so failed server data is fetched again. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = sanitizeDigest(error.digest);
  return (
    <main aria-label={errorRegionLabel("route")} className="mx-auto max-w-3xl px-4 py-24 text-center space-y-5">
      <h1 className="font-display font-bold text-7xl text-brand-soft [text-shadow:0_1px_0_#d6d3d1]">500</h1>
      <p role="alert" className="text-[15px] text-body">{errorBody("route")}</p>
      {digest ? (
        <p className="text-xs text-muted">Error ID: {digest}</p>
      ) : null}
      <div className="flex items-center justify-center gap-3">
        <button type="button" onClick={reset} className={btn.primary}>
          Try again
        </button>
        <Link href="/" className={btn.secondary}>
          Back to the launchpad
        </Link>
      </div>
    </main>
  );
}
