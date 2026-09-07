import type { Metadata } from "next";
import MeDashboard from "@/components/launchpad/MeDashboard";

export const metadata: Metadata = { title: "Me", description: "Your launches, fees, holdings and trades on Base and Robinhood Chain." };
export const dynamic = "force-dynamic";

export default function MePage() {
  return (
    <main className="mx-auto max-w-4xl px-4 pt-8 sm:pt-10 pb-16 space-y-6">
      <header>
        <h1 className="font-display font-bold tracking-[-0.02em] text-ink text-3xl sm:text-4xl">Me</h1>
        <p className="mt-2 text-base text-body">Your launches and the fees they earn, your holdings, your trades. Collect fees, edit token details.</p>
      </header>
      <MeDashboard />
    </main>
  );
}
