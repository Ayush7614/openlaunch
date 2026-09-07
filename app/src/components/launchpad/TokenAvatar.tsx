"use client";

import { useState } from "react";

/** Deterministic hue from an address — same identity trick as the tape dots. */
export function hueOf(addr: string): number {
  let h = 0;
  for (let i = 2; i < Math.min(addr.length, 18); i++) h = (h * 31 + addr.charCodeAt(i)) % 360;
  return h;
}

/** Token image with a graceful fallback: a soft gradient tile with the first letter of the symbol. */
export default function TokenAvatar({ token, symbol, image, size = 40, className = "" }: { token: string; symbol: string; image?: string | null; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const h = hueOf(token);
  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.42)) };
  if (image && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={`shrink-0 rounded-xl object-cover bg-paper border border-line ${className}`}
        style={style}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`shrink-0 rounded-xl grid place-items-center font-display font-bold text-white select-none ${className}`}
      style={{ ...style, background: `linear-gradient(135deg, hsl(${h} 70% 55%), hsl(${(h + 40) % 360} 75% 45%))` }}
    >
      {symbol.slice(0, 1).toUpperCase()}
    </div>
  );
}
