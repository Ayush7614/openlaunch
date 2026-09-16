import { createConfig, http } from "wagmi";
import { injected, coinbaseWallet } from "wagmi/connectors";
import { CHAINS, robinhood } from "./chainPublic";
import { browserRpc } from "./launchpad/config";
import { arc, arcBrowserRpc } from "./bridge/chains";

// Every chain reads through our read-only RPC proxy (or a dev override). Arc is
// registered for bridging only; wallet transactions use the wallet's provider.
export const wagmiConfig = createConfig({
  chains: [CHAINS.base, robinhood, arc],
  connectors: [injected(), coinbaseWallet({ appName: "openlaunch.lol", preference: { options: "all", telemetry: false } })],
  transports: {
    [CHAINS.base.id]: http(browserRpc("base"), { batch: true }),
    [robinhood.id]: http(browserRpc("robinhood"), { batch: true }),
    [arc.id]: http(arcBrowserRpc(), { batch: true }),
  },
  ssr: true,
});
