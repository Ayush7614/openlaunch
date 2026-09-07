import type { Metadata } from "next";
import Link from "next/link";
import { btn, cardPad } from "@/components/ui";
import { launchpad } from "@/lib/launchpad/config";
import { CHAIN_KEYS, CHAIN_LABELS, explorerAddress } from "@/lib/chainPublic";
import { BRAND_GITHUB } from "@/lib/brand";

export const metadata: Metadata = { title: "How it works", description: "What a launch does on-chain, what it costs (gas), and what can never happen to your liquidity." };

const STEPS = [
  ["Deploys your token", "A plain ERC-20 with EIP-2612 permit. Fixed supply of 1,000,000,000. No mint, no pause, no blacklist, no transfer tax, no owner."],
  ["Opens a Uniswap v4 pool", "ETH / your token — or a tokenized stock / your token (Coinbase stocks on Base, Robinhood Stock Tokens on Robinhood Chain), or USDG on Robinhood Chain — no hook. The pool starts at the market cap you pick."],
  ["Locks 100% of supply as liquidity", "The whole supply goes into one single-sided position. Its NFT is minted to an ownerless locker that has no function to withdraw, transfer or shrink it. Ever."],
  ["Registers the fee routing", "The trading fee you chose (0%, 1% or 3%) goes 100% to the beneficiaries you named, or is burned if you named none. Fixed at launch, unchangeable."],
] as const;

const NEVER = [
  ["No platform fee", "There is no fee address, fee variable or treasury anywhere in the factory or the locker. Nothing to switch on later — it cannot be added to immutable code."],
  ["No rug", "Nobody can remove liquidity: not the creator, not us. Collecting fees removes zero liquidity."],
  ["No pre-mine", "Every token starts inside the pool. The only way to hold any is to buy."],
  ["No admin", "No owner, no pause, no upgrade, no allowlist. The contracts are the same for everyone, forever."],
] as const;

export default function RulesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-10">
      <header className="space-y-2">
        <h1 className="font-display font-bold tracking-[-0.02em] text-ink text-3xl sm:text-4xl">How it works</h1>
        <p className="text-base text-body">One transaction on Base or Robinhood Chain. Gas is the only cost — usually a few cents.</p>
      </header>

      <section className="space-y-3" id="launchpad">
        <h2 className="text-lg font-semibold text-ink">What a launch does</h2>
        <ol className="space-y-2">
          {STEPS.map(([t, d], i) => (
            <li key={t} className={`${cardPad} flex gap-4`}>
              <span className="font-mono font-bold text-brand tnum shrink-0">{i + 1}</span>
              <div>
                <div className="font-semibold text-ink">{t}</div>
                <p className="mt-1 text-sm text-body leading-relaxed">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Trading fees, in plain words</h2>
        <div className={`${cardPad} space-y-3 text-sm text-body leading-relaxed`}>
          <p>
            <span className="font-semibold text-ink">0%</span> — a feeless pool. Trades cost only Uniswap gas. Nobody earns from volume, including the creator.
          </p>
          <p>
            <span className="font-semibold text-ink">1% or 3%</span> — Uniswap charges it on every trade and it accrues to the locked position. Anyone can press <em>Collect</em> on the token page: the accrued fees leave
            the pool and are <span className="text-ink font-medium">paid straight to the beneficiaries</span> in that same transaction (or burned to 0x…dEaD if the launch has no beneficiary). If a beneficiary cannot
            receive the payment, their share is credited to them and can be claimed any time; it is never lost and never blocks the others.
          </p>
          <p>Beneficiaries and shares are set at launch and can never be changed — a promise like &ldquo;half the fees go to this address&rdquo; is enforced by the contract, not by us.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">What can never happen</h2>
        <ul className="grid sm:grid-cols-2 gap-2.5">
          {NEVER.map(([t, d]) => (
            <li key={t} className={cardPad}>
              <div className="font-semibold text-up">{t}</div>
              <p className="mt-1 text-sm text-body leading-relaxed">{d}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">What you should know</h2>
        <div className={`${cardPad} space-y-2 text-sm text-body leading-relaxed`}>
          <p>Price follows a single-sided Uniswap v4 curve: the first buyers get the most tokens per ETH, and every buy moves the price up. Sells move it down. There is no anti-snipe mechanism; bots can buy in the first block like anyone else.</p>
          <p>Nothing is refundable and nothing can be edited after launch — not the name, not the fee, not the beneficiaries. Metadata (image, description, links) is stored by this site and can change; the token itself cannot.</p>
          <p>Tokens launched here are created by their launchers, not by openlaunch. Do your own research; a locked pool does not make a token valuable.</p>
          <p>Stock-quoted pools use tokenized stocks as the quote asset: Coinbase tokenized stocks (B20) on Base, recognised here only from Base&apos;s official list and priced from Chainlink&apos;s on-chain feeds; Robinhood Stock Tokens on Robinhood Chain, recognised only from Robinhood&apos;s own registry. Both are securities issued by third parties under Regulation S and are not offered to US persons (Coinbase&apos;s also exclude the UK, Canada, Australia, Singapore and Switzerland); their issuers can pause transfers or freeze wallets in restricted jurisdictions. Holding or trading them is subject to the issuer&apos;s terms, not ours.</p>
        </div>
      </section>

      <section className="space-y-3" id="contracts">
        <h2 className="text-lg font-semibold text-ink">Contracts</h2>
        <div className={`${cardPad} text-sm text-body space-y-2`}>
          {CHAIN_KEYS.map((k) => {
            const c = launchpad(k);
            return (
              <div key={k} className="space-y-1">
                <p className="font-semibold text-ink">{CHAIN_LABELS[k]}</p>
                <p>
                  Factory:{" "}
                  {c.factory ? (
                    <a href={explorerAddress(k, c.factory)} target="_blank" rel="noreferrer" className="font-mono text-ink underline underline-offset-2 break-all">
                      {c.factory}
                    </a>
                  ) : (
                    <span className="font-mono">not deployed yet</span>
                  )}
                </p>
                <p>
                  Locker:{" "}
                  {c.locker ? (
                    <a href={explorerAddress(k, c.locker)} target="_blank" rel="noreferrer" className="font-mono text-ink underline underline-offset-2 break-all">
                      {c.locker}
                    </a>
                  ) : (
                    <span className="font-mono">not deployed yet</span>
                  )}
                </p>
              </div>
            );
          })}
          <p>Identical bytecode on both chains. Uniswap v4&apos;s PoolManager, PositionManager, Permit2 and Universal Router are Uniswap&apos;s canonical deployments. MIT-licensed source on{" "}
            <a href={BRAND_GITHUB} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">GitHub ↗</a>, verified on Basescan, Blockscout and Sourcify on both chains.
          </p>
        </div>
      </section>

      <div className="pt-2">
        <Link href="/launch" className={btn.primary}>
          Launch a token
        </Link>
      </div>
    </main>
  );
}
