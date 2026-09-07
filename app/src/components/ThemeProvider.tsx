"use client";

import { ThemeProvider as NextThemes } from "next-themes";

/**
 * Light by default (the shipped design) with an explicit dark option behind the
 * header toggle. Two states, stored as "light" | "dark"; the OS preference is
 * not consulted so the first paint matches what everyone has seen so far.
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
export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
