import { defineChain, type Chain } from "viem";
import { CHAINS } from "../chainPublic";
import type { BridgeChainId } from "./types";

/** Wallet/RPC registration for bridging only; Arc is not a launchpad network. */
export const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
});

export const BRIDGE_WALLET_CHAINS: Record<BridgeChainId, Chain> = {
  8453: CHAINS.base,
  4663: CHAINS.robinhood,
  5042: arc,
};
