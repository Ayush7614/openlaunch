import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Lints the token layer in globals.css. It reads CSS text, so it proves the
 * palette is internally consistent — it cannot prove a component uses the right
 * token. A pass means "the ramp is sane", not "the UI is fine".
 *
 * Structure: the unclassed base (@theme) is LIGHT and `.dark` overrides it,
 * even though dark is what everyone sees by default. The animated toggler flips
 * themes with a bare `classList.toggle("dark")`, so "no class" must mean light.
 */
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const themeBlock = css.match(/@theme(?:\s+static)?\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
const darkBlock = css.match(/\n\.dark\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
const printBlock = css.match(/@media print\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
const colors = (source: string) => Object.fromEntries(Array.from(source.matchAll(/--color-([\w-]+):\s*(#[\da-f]{3,8});/gi), ([, name, hex]) => [name, hex]));

const light = colors(themeBlock);
const dark = { ...light, ...colors(darkBlock) };
const THEMES: [string, Record<string, string>][] = [
  ["light", light],
  ["dark", dark],
];

/** WCAG relative luminance for opaque sRGB theme colors. */
function luminance(hex: string) {
  assert.match(hex, /^#[\da-f]{6}$/i, `expected a 6-digit hex, got ${hex}`);
  const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = rgb.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
const ratio = (fg: string, bg: string) => {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

test("dark carries the gitlawb palette: black ground, white ink", () => {
  assert.equal(dark.paper, "#000000");
  assert.equal(dark.ink, "#ffffff");
  assert.equal(dark.inverse, "#000000");
});

test("light is the unclassed base, so `no class` means light", () => {
  // The animated toggler does classList.toggle("dark") and never writes a
  // `light` class — if light lived in its own class this would break.
  assert.equal(light.paper, "#ffffff");
  assert.equal(light.ink, "#000000");
  assert.equal(css.includes("\n.light {"), false, "light must not live in a class");
  assert.match(css, /:root\s*\{[^}]*color-scheme:\s*light/);
  assert.match(darkBlock, /color-scheme:\s*dark/);
});

test("typography is unchanged — only the palette came from gitlawb", () => {
  assert.match(themeBlock, /--font-sans:\s*var\(--font-inter\)/);
  assert.match(themeBlock, /--font-mono:\s*var\(--font-space-mono\)/);
  assert.match(themeBlock, /--font-display:\s*var\(--font-unbounded\)/);
});

test("the dark: variant resolves against a class, not a media query", () => {
  assert.match(css, /@custom-variant dark \(&:is\(\.dark \*\)\)/);
  assert.doesNotMatch(css, /@media \(prefers-color-scheme/, "theming is by explicit choice, never by OS preference");
});

test("greys are near-achromatic in both themes, like gitlawb.com", () => {
  for (const [name, palette] of THEMES) {
    for (const token of ["paper", "card", "line", "line-strong", "ink", "body", "muted", "faint"]) {
      const hex = palette[token];
      const [r, g, b] = [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16));
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      assert.ok(spread <= 8, `${name}: --color-${token} (${hex}) should be neutral, channel spread is ${spread}`);
    }
  }
});

test("the surface ramp steps away from the ground monotonically", () => {
  for (const [name, palette] of THEMES) {
    const steps = ["paper", "card", "line", "line-strong"].map((n) => luminance(palette[n]));
    const rising = steps[1] > steps[0];
    for (let i = 1; i < steps.length; i++) {
      assert.equal(steps[i] > steps[i - 1], rising, `${name}: surface ramp reverses at index ${i}`);
    }
  }
});

test("text, semantic labels, and filled controls maintain AA contrast in both themes", () => {
  const pairs = [
    ...["paper", "card"].flatMap((surface) => ["ink", "body", "muted", "brand", "up", "down-ink", "warm-ink"].map((text) => [text, surface])),
    ...["ink", "brand", "brand-strong", "up", "down", "warm-ink"].map((fill) => ["inverse", fill]),
    ["brand", "brand-soft"], ["up", "up-soft"], ["down-ink", "down-soft"], ["warm-ink", "warm-soft"], ["up", "holder-good-bg"],
  ];
  for (const [name, palette] of THEMES) {
    for (const [foreground, background] of pairs) {
      const r = ratio(palette[foreground], palette[background]);
      assert.ok(r >= 4.5, `${name}: ${foreground} on ${background} is ${r.toFixed(2)}:1`);
    }
  }
});

test("runtime chart tokens survive Tailwind tree-shaking", () => {
  assert.match(css, /@theme static\s*\{/);
  assert.equal(light["chart-grid"], "#f1f0ee");
  assert.equal(dark["chart-grid"], "#1a1a1a");
});

test("every base token has a dark counterpart", () => {
  const darkOnly = colors(darkBlock);
  const missing = Object.keys(light).filter((name) => !(name in darkOnly));
  assert.deepEqual(missing, [], `tokens with no dark value: ${missing.join(", ")}`);
});

test("the surface system is flat: hairlines, never drop shadows", () => {
  const shadows = Array.from(css.matchAll(/--shadow-([\w-]+):\s*([^;]+);/g));
  assert.ok(shadows.length >= 4, "the shadow tokens must stay declared so the utilities remain valid");
  for (const [, name, value] of shadows) assert.equal(value.trim(), "none", `--shadow-${name} should be flat`);
  assert.doesNotMatch(css, /--tint-/, "tint vars are unused once shadows are flat");
});

test("no decorative colour wash behind the hero", () => {
  assert.doesNotMatch(css, /\.bb-sky/, "the hero wash is gone");
});

test("market highlights are token-based, finite and flat", () => {
  assert.doesNotMatch(css, /\.bb-hot|@keyframes bb-hot/, "trending has no looping glow");
  const freshRow = css.match(/@keyframes bb-row-new\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(freshRow, /var\(--color-brand-soft\)/);
  assert.doesNotMatch(freshRow, /box-shadow|rgba\(/);
  assert.match(css, /\.bb-tape-enter \{ animation: bb-tape-enter 240ms ease-out both; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.bb-tape-enter \{ animation: none; \} \}/);
});

test("the modal scrim darkens in both themes rather than inverting", () => {
  for (const [name, palette] of THEMES) {
    assert.ok(luminance(palette.scrim) < 0.05, `${name}: scrim must be dark`);
  }
});

test("the view-transition wipe is disabled under reduced motion", () => {
  // The toggler skips startViewTransition, and the pseudo-elements are pinned
  // too in case a transition is already in flight.
  assert.match(css, /::view-transition-new\(root\)/, "the wipe needs its own transition CSS");
  const reduced = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}\n/g)?.join("\n") ?? "";
  assert.match(reduced, /view-transition/, "reduced motion must also stop the theme wipe");
});

test("theme persistence and browser chrome follow the current explicit palette", () => {
  const provider = readFileSync(new URL("./ThemeProvider.tsx", import.meta.url), "utf8");
  assert.match(provider, /defaultTheme="dark" enableSystem=\{false\}/);
  assert.match(provider, /<ThemeColorSync \/>/);
  assert.match(provider, /light: "#ffffff", dark: "#000000"/);
  assert.match(provider, /resolvedTheme === "dark" \? THEME_COLOR\.dark : THEME_COLOR\.light/);
  assert.match(provider, /meta\.content !== color/);
  assert.match(provider, /observer\.observe\(document\.head/);
  assert.match(provider, /observer\.disconnect\(\)/);
});

test("print falls back to ink on white", () => {
  const print = colors(printBlock);
  assert.equal(print.paper, "#ffffff", "black paper does not print");
  assert.equal(print.ink, "#000000");
});
