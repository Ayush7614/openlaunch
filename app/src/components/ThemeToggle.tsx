"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { AnimatedThemeToggler } from "@/components/vendor/animated-theme-toggler";

/**
 * Theme switch. Wraps MagicUI's AnimatedThemeToggler in CONTROLLED mode: it
 * owns the View Transitions wipe, next-themes owns persistence. Passing `theme`
 * is what stops the vendored component writing its own localStorage key.
 *
 * Renders a neutral placeholder until mounted — the resolved theme only exists
 * on the client, so drawing the real icon during SSR would mismatch.
 */
export default function ThemeToggle({ block = false }: { block?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const control = "h-9 w-9 inline-flex items-center justify-center rounded-xl border border-line bg-card text-body hover:text-ink hover:border-line-strong [&_svg]:size-4";

  if (!mounted) {
    return block ? <div className="min-h-12" aria-hidden /> : <div className={control} aria-hidden />;
  }

  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const next = theme === "dark" ? "light" : "dark";
  const toggler = (
    <AnimatedThemeToggler className={control} theme={theme} onThemeChange={setTheme} duration={400} variant="circle" title={`Switch to ${next} mode`} aria-label={`Switch to ${next} mode`} />
  );

  if (!block) return toggler;

  // In the mobile menu the toggler sits in a list of labelled rows, so it gets
  // a visible label too — a settings row, label left, control right.
  return (
    <div className="min-h-12 px-3 flex items-center justify-between gap-3 rounded-xl text-base font-medium text-ink">
      <span>
        Theme <span className="text-muted">· {theme === "dark" ? "Dark" : "Light"}</span>
      </span>
      {toggler}
    </div>
  );
}
