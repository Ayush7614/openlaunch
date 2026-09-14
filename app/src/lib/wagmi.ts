import { createConfig, http } from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
import type { Chain } from "viem";
import { CHAINS, CHAIN_KEYS, DEFAULT_CHAIN } from "./chainPublic";
import { browserRpc } from "./launchpad/config";
import { arc, arcBrowserRpc } from "./bridge/chains";

// Every launch chain in one config, the default first, plus Arc for bridging only. Reads/simulations go through
// our RPC proxy per chain (or a dev override); wallets send transactions through their own provider.
const keys = [DEFAULT_CHAIN, ...CHAIN_KEYS.filter((k) => k !== DEFAULT_CHAIN)];
const chains = [...keys.map((k) => CHAINS[k]), arc] as [Chain, ...Chain[]];

export const wagmiConfig = createConfig({
  chains,
  connectors: [injected(), coinbaseWallet({ appName: "openlaunch.lol", preference: { options: "all", telemetry: false } })],
  transports: { ...Object.fromEntries(keys.map((k) => [CHAINS[k].id, http(browserRpc(k), { batch: true })])), [arc.id]: http(arcBrowserRpc(), { batch: true }) },
  ssr: true,
});
