"use client";

import Link from "next/link";
import "./globals.css";
import { inter, spaceMono, unbounded } from "./fonts";

/**
 * Root-level error boundary. Must render its own <html>/<body> — it replaces
 * the root layout when active, so it loads the global stylesheet and font
 * variables itself instead of inheriting them.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  console.error(error);
  return (
    <html lang="en" className={`${inter.variable} ${spaceMono.variable} ${unbounded.variable}`}>
      <body className="min-h-screen flex flex-col">
        <main className="mx-auto max-w-3xl px-4 py-24 text-center space-y-5">
          <div className="font-display font-bold text-7xl">500</div>
          <p className="text-[15px]">Something broke. Your funds are on-chain — this is only the site.</p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center justify-center rounded-xl px-5 min-h-11 bg-black text-white font-semibold text-sm"
            >
              Try again
            </button>
            <Link href="/" className="inline-flex items-center justify-center rounded-xl px-5 min-h-11 border font-semibold text-sm">
              Back to the launchpad
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
