"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { tokenMark } from "@/lib/launchpad/token-mark";
import styles from "./TokenAvatar.module.css";

/** Uploaded logos take priority; missing/broken images get a chain-scoped mint mark. */
export default function TokenAvatar({ chain, token, symbol, image, size = 40, className = "" }: { chain: string; token: string; symbol: string; image?: string | null; size?: number; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = image?.trim() || null;
  const dimensions = { width: size, height: size };
  const radius = size < 40 ? "rounded-lg" : "rounded-xl";

  if (src && src !== failedSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img key={src} src={src} alt="" width={size} height={size} referrerPolicy="no-referrer"
        data-token-avatar="image"
        ref={(img) => { if (img?.complete && img.naturalWidth === 0) setFailedSrc(src); }}
        onError={() => setFailedSrc(src)}
        className={cn("shrink-0 object-cover bg-paper border border-line", radius, className)}
        style={dimensions} />
    );
  }

  const mark = tokenMark(chain, token);
  return (
    <span aria-hidden="true" data-token-avatar="generated" title={`${symbol || "Token"} · generated mark`}
      className={cn("shrink-0", styles.mark, radius, className)} style={dimensions}>
      <svg viewBox="0 0 48 48" className={styles.drawing} aria-hidden="true" focusable="false">
        {size >= 36 && <path d="M5 11V5H11M37 43H43V37" className={styles.registration} />}
        <g transform={`rotate(${mark.rotation} 24 24)`}>
          {mark.parts.map((part, index) => <polygon key={index} points={part.points} className={styles[part.tone]} />)}
        </g>
        {size >= 36 && <g className={styles.ticks}>
          {mark.ticks.map((height, index) => <path key={index} d={`M${5 + index * 2} 43v-${height}`} />)}
        </g>}
      </svg>
    </span>
  );
}
