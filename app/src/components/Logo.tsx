"use client";

import { useState } from "react";

/**
 * Entry logo (favicon / DexScreener). Plain <img>: arbitrary remote hosts.
 * Client component so it can fall back when the image 404s / times out; fine
 * to render from server components. Fallback = first letter of `alt` (name or
 * host) as a brand-tinted tile. `src` null → tile straight away.
 */
export default function Logo({ src, alt, size = 40, className = "" }: { src: string | null; alt: string; size?: number; className?: string }) {
  // Keyed by src so a new url resets the fallback without an effect.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = src !== null && failedSrc === src;
  // Images that already errored before hydration never re-fire onError; check on attach.
  const attach = (img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth === 0 && src) setFailedSrc(src);
  };

  const radius = size < 32 ? "rounded-lg" : "rounded-xl";
  const letter = (alt.trim().slice(0, 1) || "·").toUpperCase();

  if (!src || failed) {
    return (
      <span
        role="img"
        aria-label={alt}
        style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.42)) }}
        className={`inline-flex shrink-0 items-center justify-center ${radius} bg-brand-soft text-brand font-semibold leading-none select-none ${className}`}
      >
        {letter}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={attach}
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
      className={`shrink-0 object-cover ${radius} border border-line bg-card ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
