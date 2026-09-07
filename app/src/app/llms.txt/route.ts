import { SITE_URL } from "@/lib/chainPublic";
import { launchpad } from "@/lib/launchpad/config";
import { BRAND_DOMAIN } from "@/lib/brand";

export const dynamic = "force-dynamic";

export function GET() {
  const b = launchpad("base");
  const r = launchpad("robinhood");
  const body = `# ${BRAND_DOMAIN}

> Open-source (MIT — https://github.com/Gitlawb/openlaunch), zero-fee token launchpad on Base (8453) and Robinhood Chain (4663). One transaction deploys a token and locks 100% of its supply as
> Uniswap v4 liquidity, forever. No platform fee: the factory and locker have no fee address at all.

## Source verification
- Base (8453): Basescan https://basescan.org/address/${b.factory}#code (factory), https://basescan.org/address/${b.locker}#code (locker); Blockscout https://base.blockscout.com/address/${b.factory}?tab=contract; Sourcify https://repo.sourcify.dev/8453/${b.factory}
- Robinhood Chain (4663): Blockscout https://robinhoodchain.blockscout.com/address/${r.factory}?tab=contract (factory), https://robinhoodchain.blockscout.com/address/${r.locker}?tab=contract (locker); Sourcify https://repo.sourcify.dev/4663/${r.factory}

## What a launch does
1. deploys a fixed-supply ERC-20 (1,000,000,000; no mint/pause/blacklist/tax/owner)
2. initializes a Uniswap v4 pool quote/token (quote = ETH, or USDG on Robinhood Chain; tick spacing 200, no hook) at the chosen start tick
3. mints one single-sided position holding 100% of supply to an ownerless locker (no withdraw path exists)
4. registers fee routing: lpFee 0 | 10000 (1%) | 30000 (3%) pips; recipients [] = fees burned,
   else {payout,bps}[] summing to 10000. Fixed forever.
Anyone may call locker.collect(tokenId): accrued fees are paid straight to recipients (or burned).

## Contracts
Base (8453):            LaunchFactory ${b.factory ?? "(not deployed yet)"} · LaunchLocker ${b.locker ?? "(not deployed yet)"}
Robinhood Chain (4663): LaunchFactory ${r.factory ?? "(not deployed yet)"} · LaunchLocker ${r.locker ?? "(not deployed yet)"}
Uniswap v4: Base PoolManager 0x498581fF718922c3f8e6A244956aF099B2652b2b, Universal Router 0x6fF5693b99212Da76ad316178A184AB56D299b43;
            Robinhood PoolManager 0x8366a39CC670B4001A1121B8F6A443A643e40951, Universal Router 0x8876789976decbfcbbbe364623c63652db8c0904
USDG (Robinhood, 6 dec): 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168

## Launch (contract call)
factory.launch((name, symbol, metadataURI, quote, supply=0, startTick, lpFee, salt, recipients))
startTick 184200 ≈ 10 ETH FDV for 1B supply (raw price = 1.0001^tick token-wei per quote unit; for USDG use ~391400 ≈ $10k FDV).
ERC20 quote: token must sort above the quote address → call factory.findSalt(launcher, baseSalt, name, symbol, 0, metadataURI, quote, 64) first.
Optional metadata: POST ${SITE_URL}/api/launch/meta {chain, launcher, salt, name, symbol, description?, image_url?, website?, x_handle?} → {uri, token}; pass uri as metadataURI.

## API
- GET  ${SITE_URL}/api/launch/list?chain=base|robinhood&sort=new|trending|mcap|volume|gainers&window=1h|24h|all&limit=50
- GET  ${SITE_URL}/api/launch/feed
- GET  ${SITE_URL}/api/launch/meta/<token>
- POST ${SITE_URL}/api/launch/sync?chain=base|robinhood&tx=0x…   (index a tx you just sent)
- GET  ${SITE_URL}/api/health
Pages: / (list, ?chain=), /launch (?chain=), /t/<chain>/<token> (trade + fees), /rules, /agents.
`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}
