"use client";

import { useState } from "react";

export default function CopyChip({ value, label, className = "" }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* clipboard blocked */
        }
      }}
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-line bg-card text-[11px] font-mono text-body hover:text-ink hover:border-line-strong ${className}`}
      title={value}
    >
      {label ?? `${value.slice(0, 6)}…${value.slice(-4)}`}
      <span className="text-faint">{done ? "✓" : "⧉"}</span>
    </button>
  );
}
