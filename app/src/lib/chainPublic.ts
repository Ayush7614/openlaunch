import { base } from "viem/chains";
import { defineChain, type Chain } from "viem";

/**
 * CLIENT-SAFE chain registry. Two chains, one site. Only NEXT_PUBLIC_* vars are
 * read here so browser components can import it. Server bits live in chain.ts.
 */
export type ChainKey = "base" | "robinhood";
export const CHAIN_KEYS: ChainKey[] = ["base", "robinhood"];
export const DEFAULT_CHAIN: ChainKey = "base";

export const robinhood: Chain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

export const CHAINS: Record<ChainKey, Chain> = { base, robinhood };
export const CHAIN_LABELS: Record<ChainKey, string> = { base: "Base", robinhood: "Robinhood Chain" };
export const CHAIN_SHORT: Record<ChainKey, string> = { base: "Base", robinhood: "Robinhood" };
const EXPLORERS: Record<ChainKey, string> = { base: "https://basescan.org", robinhood: "https://robinhoodchain.blockscout.com" };

export function isChainKey(v: unknown): v is ChainKey {
  return v === "base" || v === "robinhood";
}
export function chainKeyOf(id: number | undefined | null): ChainKey | null {
  if (id === base.id) return "base";
  if (id === robinhood.id) return "robinhood";
  return null;
}
export function chainIdOf(key: ChainKey): number {
  return CHAINS[key].id;
}
export function explorerTx(key: ChainKey, hash: string): string {
  return `${EXPLORERS[key]}/tx/${hash}`;
}
export function explorerAddress(key: ChainKey, addr: string): string {
  return `${EXPLORERS[key]}/address/${addr}`;
}
export function explorerName(key: ChainKey): string {
  return key === "base" ? "Basescan" : "Blockscout";
}

/** Gitlawb's Base builder code (ERC-8021). Public — attribution only. */
export const BUILDER_CODE = "bc_ly9ism19";
/** ERC-8021 data suffix for BUILDER_CODE (asserted by src/lib/builderCode.test.ts). Harmless on chains that ignore it. */
export const BUILDER_DATA_SUFFIX = "0x62635f6c793969736d31390b0080218021802180218021802180218021" as const;

import { BRAND_DOMAIN } from "./brand.ts";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? `https://${BRAND_DOMAIN}`).replace(/\/$/, "");

export function shortAddr(addr: string | null | undefined): string {
  if (!addr) return "N/A";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
