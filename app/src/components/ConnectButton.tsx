"use client";

import { useSyncExternalStore } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { CHAINS } from "@/lib/chainPublic";
import WalletMenu from "./WalletMenu";

/**
 * Wallet chip. `block` renders a full-width row for the mobile menu sheet;
 * default is the compact inline chip for the desktop header.
 */
export default function ConnectButton({ block = false, onNavigate }: { block?: boolean; onNavigate?: () => void }) {
  const { address, isConnected, chainId, connector: activeConnector } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnectAsync, isPending: disconnecting } = useDisconnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  // Wallet state only exists on the client; render a neutral pill during SSR/hydration.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // pill in the header strip, rounded-xl as a row in the mobile menu list
  const base = `${block ? "w-full min-h-12 px-4 text-sm rounded-xl" : "h-9 px-3.5 text-[13px] rounded-full"} inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 whitespace-nowrap`;

  if (!mounted) return <div className={`${base} border border-line text-faint`}>Wallet</div>;

  if (!isConnected || !address) {
    const connector = connectors.find((c) => c.id === "coinbaseWallet") ?? connectors[0];
    return (
      <button
        onClick={() => connector && connect({ connector })}
        disabled={isPending || !connector}
        // a quiet hairline utility (the ThemeToggle recipe): only the launch CTA is loud
        className={`${base} border border-line text-body hover:text-ink hover:border-line-strong`}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }
  return (
    <WalletMenu address={address} chainId={chainId} connectorName={activeConnector?.name}
      block={block} switching={switching} disconnecting={disconnecting} onNavigate={onNavigate}
      onSwitchChain={(chain) => switchChainAsync({ chainId: CHAINS[chain].id })}
      onDisconnect={() => disconnectAsync()} />
  );
}
