import Link from "next/link";
import { btn } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-24 text-center space-y-5">
      <div className="font-display font-bold text-7xl text-brand-soft [text-shadow:0_1px_0_#d6d3d1]">404</div>
      <p className="text-[15px] text-body">Nothing here. That token has not been launched here.</p>
      <Link href="/" className={btn.primary}>
        Back to the launchpad
      </Link>
    </main>
  );
}
