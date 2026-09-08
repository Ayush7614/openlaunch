"use client";

import { useEffect } from "react";
import { ThemeProvider as NextThemes, useTheme } from "next-themes";

const THEME_COLOR = { light: "#FAFAF8", dark: "#000000" } as const;

/** Keeps the browser chrome (mobile address bar, PWA title bar) in step with the toggled theme. */
function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const sync = () => {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      const color = resolvedTheme === "dark" ? THEME_COLOR.dark : THEME_COLOR.light;
      if (meta && meta.content !== color) meta.content = color;
    };
    sync();
    // App Router can reapply layout metadata after navigation without changing
    // the theme. Watch those replacements too; the equality guard avoids loops.
    const observer = new MutationObserver(sync);
    observer.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ["content"] });
    return () => observer.disconnect();
  }, [resolvedTheme]);
  return null;
}

/**
 * Light by default (the shipped design) with an explicit dark option behind the
 * header toggle. Two persisted states, "light" | "dark", independent of OS preference.
 *
 * Class-based: Tailwind's dark variant resolves against `.dark` on <html>
 * (see @custom-variant at the top of globals.css).
 *
 * Deliberately NO `value` mapping. next-themes writes `light` or `dark`, while
 * the animated toggler flips only `dark` — so mid-toggle you briefly get
 * `class="light dark"`. That renders correctly because light is the UNCLASSED
 * base and there is no `.light` rule: `dark` present wins, `dark` absent falls
 * back to light, and the stray `light` class is inert. (Mapping light to ""
 * would be the tidier model, but next-themes calls classList.remove(value) and
 * throws on an empty token.)
 */
export default function ThemeProvider({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <NextThemes attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange nonce={nonce}>
      <ThemeColorSync />
      {children}
    </NextThemes>
  );
}
