import type { Metadata } from "next";
import { cardPad, codeBlock } from "@/components/ui";
import { launchpad } from "@/lib/launchpad/config";
import { CHAIN_KEYS, CHAIN_LABELS, CHAINS, SITE_URL } from "@/lib/chainPublic";

export const metadata: Metadata = { title: "Agents", description: "Launch and trade tokens from an agent: one contract call, plus a JSON API for the list, trades and metadata." };

export default function AgentsPage() {
  const factory = launchpad("base").factory ?? "<factory>";
  const locker = launchpad("base").locker ?? "<locker>";
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="font-display font-bold tracking-[-0.02em] text-ink text-3xl sm:text-4xl">Agents</h1>
        <p className="text-base text-body">No API key, no signup, no fee. A launch is one contract call from any wallet with a little ETH for gas. Everything the site shows is also JSON.</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Launch a token (one call)</h2>
        <div className={`${cardPad} space-y-3 text-sm text-body`}>
          <div className="rounded-xl bg-paper border border-line px-3.5 py-2.5 text-xs space-y-1">
            {CHAIN_KEYS.map((k) => (
              <p key={k} className="font-mono">
                <span className="text-ink font-sans font-semibold">{CHAIN_LABELS[k]}</span> (chain {CHAINS[k].id}) · factory {launchpad(k).factory ?? "not deployed yet"} · locker {launchpad(k).locker ?? "—"}
              </p>
            ))}
          </div>
          <p>
            Call <code className="font-mono text-ink">launch(params)</code> on that chain&apos;s factory. Quote is ETH (address zero) — or USDG <code className="font-mono text-ink">0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168</code> on Robinhood Chain, in which case call{" "}
            <code className="font-mono text-ink">findSalt(...)</code> first so the token address sorts above the quote. Supply 0 means the default 1B. <code className="font-mono text-ink">startTick</code> sets the opening
            market cap (multiple of 200; 184200 ≈ 10 ETH FDV for 1B supply). <code className="font-mono text-ink">lpFee</code> is in pips (0, 10000 = 1%, 30000 = 3%). Empty <code className="font-mono text-ink">recipients</code>{" "}
            = fees burned; otherwise shares in bps summing to 10000.
          </p>
          <pre className={codeBlock}>{`cast send ${factory} \\
  "launch((string,string,string,address,uint256,int24,uint24,bytes32,(address,uint16)[]))" \\
  "(My Token,MYT,,0x0000000000000000000000000000000000000000,0,184200,10000,0x$(openssl rand -hex 32),[(0xYourWallet,10000)])" \\
  --rpc-url https://mainnet.base.org --private-key $PK`}</pre>
          <p>
            Optional metadata (image, description, links): <code className="font-mono text-ink">POST {SITE_URL}/api/launch/meta</code> with{" "}
            <code className="font-mono text-ink">{"{chain, launcher, salt, name, symbol, description?, image_url?, website?, x_handle?}"}</code> first; it returns the <code className="font-mono text-ink">uri</code> to pass as{" "}
            <code className="font-mono text-ink">metadataURI</code> and the predicted token address.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Read</h2>
        <div className={`${cardPad} space-y-2 text-sm text-body`}>
          <pre className={codeBlock}>{`GET ${SITE_URL}/api/launch/list?chain=base|robinhood&sort=new|trending|mcap|volume|gainers&window=1h|24h|all&limit=50
GET ${SITE_URL}/api/launch/feed              # latest launches + trades
GET ${SITE_URL}/api/launch/meta/<token>      # image / description / links
GET ${SITE_URL}/llms.txt`}</pre>
          <p>Amounts are wei strings; prices and FDV are floats in ETH. Poll freely — responses are small and uncached.</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Trade</h2>
        <div className={`${cardPad} space-y-2 text-sm text-body`}>
          <p>
            Pools are plain Uniswap v4 (ETH / token, tick spacing 200, no hook). Swap through the Universal Router with a <code className="font-mono text-ink">V4_SWAP</code> command, or any router that speaks v4. Get the pool
            key with <code className="font-mono text-ink">poolKeyOf(token)</code> on the factory. Anyone may call <code className="font-mono text-ink">collect(tokenId)</code> on the locker ({locker}) to pay out accrued fees.
          </p>
          <p>
            After a transaction you sent, <code className="font-mono text-ink">POST {SITE_URL}/api/launch/sync?chain=base|robinhood&tx=0x…</code> indexes it immediately; otherwise the poller picks it up within ~15s.
          </p>
        </div>
      </section>
    </main>
  );
}
