"use client";

import Link from "next/link";

/**
 * Root-level error boundary. Must render its own <html>/<body>
 * (Next replaces the root layout when this renders).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error(error);
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <main className="mx-auto max-w-3xl px-4 py-24 text-center space-y-5">
          <div className="font-display font-bold text-7xl">500</div>
          <p className="text-[15px]">Something broke. Your funds are on-chain — this is only the site.</p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={reset}
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
