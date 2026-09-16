import type { Chain } from "viem";
import { CHAINS } from "../chainPublic";
import { browserRpc } from "../launchpad/config";
import type { BridgeChainId } from "./types";

/** Arc is a launch chain like the others (chainPublic.ts); the bridge reuses that one definition. */
export const arc: Chain = CHAINS.arc;

export const BRIDGE_WALLET_CHAINS: Record<BridgeChainId, Chain> = {
  8453: CHAINS.base,
  4663: CHAINS.robinhood,
  5042: CHAINS.arc,
};

/**
 * Browser reads for Arc go through the same-origin proxy (or a dev override), never straight to a public node:
 * public Arc/Base RPCs rate-limit a single quote's burst of reads. Same helper as every other chain.
 */
export function arcBrowserRpc(): string {
  return browserRpc("arc");
}
