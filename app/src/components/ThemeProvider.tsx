"use client";

import { ThemeProvider as NextThemes } from "next-themes";

/**
 * Dark by default with an explicit light option — the same two-state model as
 * gitlawb.com (which stores "light" | "dark" and never follows the OS).
 *
 * Class-based rather than gitlawb's `data-theme` attribute: Aceternity and
 * shadcn components ship `dark:` variants, and Tailwind's dark variant resolves
 * against a class (see @custom-variant at the top of globals.css).
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
    <NextThemes attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      {children}
    </NextThemes>
  );
}
