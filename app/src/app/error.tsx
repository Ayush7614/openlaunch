"use client";

import Link from "next/link";
import { useEffect } from "react";
import { btn } from "@/components/ui";

/** Route-level error boundary. Mirrors not-found.tsx styling. */
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
  return (
    <main className="mx-auto max-w-3xl px-4 py-24 text-center space-y-5">
      <div className="font-display font-bold text-7xl text-brand-soft [text-shadow:0_1px_0_#d6d3d1]">500</div>
      <p className="text-[15px] text-body">Something broke on this page. Your funds are on-chain — this is only the site.</p>
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
