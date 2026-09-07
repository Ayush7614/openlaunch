import { createConfig, http } from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
import { CHAINS, robinhood } from "./chainPublic";
import { browserRpc } from "./launchpad/config";

// Two chains, one config. Reads/simulations go through our RPC proxy per chain
// (or a dev override); wallets send transactions through their own provider.
export const wagmiConfig = createConfig({
  chains: [CHAINS.base, robinhood],
  connectors: [injected(), coinbaseWallet({ appName: "openlaunch.lol", preference: { options: "all", telemetry: false } })],
  transports: {
    [CHAINS.base.id]: http(browserRpc("base"), { batch: true }),
    [robinhood.id]: http(browserRpc("robinhood"), { batch: true }),
  },
  ssr: true,
});
