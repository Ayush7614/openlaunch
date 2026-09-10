import Link from "next/link";
import { btn } from "@/components/ui";
import { errorBody, errorRegionLabel } from "@/lib/error-copy";

export default function NotFound() {
  return (
    <main aria-label={errorRegionLabel("not-found")} className="mx-auto max-w-3xl px-4 py-24 text-center space-y-5">
      <h1 className="font-display font-bold text-7xl text-brand-soft [text-shadow:0_1px_0_#d6d3d1]">404</h1>
      <p className="text-[15px] text-body">{errorBody("not-found")}</p>
      <div className="flex items-center justify-center gap-3">
        <Link href="/" className={btn.primary}>
          Back to the launchpad
        </Link>
        <Link href="/launch" className={btn.secondary}>
          Launch a token
        </Link>
      </div>
    </main>
  );
}
