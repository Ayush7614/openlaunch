"use client";

import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { tokenIdentity } from "@/lib/launchpad/token-identity";
import styles from "./TokenAvatar.module.css";

export { tokenHue as hueOf } from "@/lib/launchpad/token-identity";

/**
 * Uploaded logos first; otherwise a two-color mosaic from the complete address.
 * `chain` stays optional for callers, but does not change the token identity.
 */
export default function TokenAvatar({ token, symbol, image, size = 40, className = "" }: { chain?: string; token: string; symbol: string; image?: string | null; size?: number; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = image?.trim() || null;
  const dimensions = { width: size, height: size };
  if (src && src !== failedSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={src}
        src={src}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        data-token-avatar="image"
        onError={() => setFailedSrc(src)}
        className={cn("shrink-0 rounded-xl object-cover bg-paper border border-line", className)}
        style={dimensions}
      />
    );
  }
  const identity = tokenIdentity(token);
  return (
    <span
      aria-hidden="true"
      data-token-avatar="generated"
      title={`${symbol || "Token"} · generated icon`}
      className={cn("shrink-0", size < 32 ? "rounded-md" : "rounded-xl", styles.mosaic, className)}
      style={{
        ...dimensions,
        "--token-hue": identity.primaryHue,
        "--token-accent-hue": identity.secondaryHue,
        "--token-bg-hue": identity.backgroundHue.light,
        "--token-bg-dark-hue": identity.backgroundHue.dark,
      } as CSSProperties}
    >
      <svg viewBox="0 0 48 48" className={styles.drawing} aria-hidden="true" focusable="false">
        {identity.cells.map((cell, index) => <g key={index} transform={`translate(${cell.x} ${cell.y})`}>
          <path d={cell.path} transform={`rotate(${cell.rotation} 5.5 5.5)`} className={styles[cell.tone]} />
        </g>)}
      </svg>
    </span>
  );
}
