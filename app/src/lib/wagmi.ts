import { createConfig, http } from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
import { CHAINS, robinhood } from "./chainPublic";
import { browserRpc } from "./launchpad/config";
import { arc } from "./bridge/chains";

// Launch chains use our read-only RPC proxy. Arc is registered for bridging
// only, using its official RPC; wallet transactions use the wallet's provider.
export const wagmiConfig = createConfig({
  chains: [CHAINS.base, robinhood, arc],
  connectors: [injected(), coinbaseWallet({ appName: "openlaunch.lol", preference: { options: "all", telemetry: false } })],
  transports: {
    [CHAINS.base.id]: http(browserRpc("base"), { batch: true }),
    [robinhood.id]: http(browserRpc("robinhood"), { batch: true }),
    [arc.id]: http(arc.rpcUrls.default.http[0], { batch: true }),
  },
  ssr: true,
});
