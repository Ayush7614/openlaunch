import type { CSSProperties } from "react";
import { walletHue, walletMark } from "@/lib/wallet-mark";
import styles from "./WalletAvatar.module.css";

/** Stable, decorative wallet identity shared by accounts and post authors. */
export default function WalletAvatar({ address, size = 28 }: { address: string; size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={styles.avatar} style={{ "--wallet-hue": walletHue(address) } as CSSProperties} aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="19.5" className={styles.base} />
      {walletMark(address).map(({ x, y }) => <rect key={`${x}:${y}`} x={x} y={y} width="3.5" height="3.5" rx="0.8" fill="currentColor" />)}
    </svg>
  );
}
