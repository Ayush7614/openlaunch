"use client";

import { useState } from "react";
import WalletPicker from "./WalletPicker";

/**
 * A "Connect wallet" button in the caller's own styling that opens the wallet picker.
 * Every connect entry point (header, trade panel, launch form, posts, dashboard) goes through
 * this so wallet choice and error handling live in one place.
 */
export default function ConnectWallet({ className, children, disabled = false }: { className?: string; children: React.ReactNode; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={disabled} aria-haspopup="dialog" aria-expanded={open} className={className}>
        {children}
      </button>
      {open ? <WalletPicker onClose={() => setOpen(false)} /> : null}
    </>
  );
}
