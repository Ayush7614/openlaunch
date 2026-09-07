import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const colors = (source: string) => Object.fromEntries(Array.from(source.matchAll(/--color-([\w-]+):\s*(#[\da-f]{6});/gi), ([, name, hex]) => [name, hex]));
const light = colors(css.split("@media (prefers-color-scheme: dark)")[0]);
const darkRule = css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]+)\}/)?.[1] ?? "";
const dark = { ...light, ...colors(darkRule) };

/** WCAG relative luminance for opaque sRGB theme colors. */
function luminance(hex: string) {
  assert.match(hex, /^#[\da-f]{6}$/i);
  const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = rgb.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

test("retains the existing light surfaces, branding, and filled-control foreground", () => {
  assert.equal(light.paper, "#fafaf8");
  assert.equal(light.card, "#ffffff");
  assert.equal(light.brand, "#0052ff");
  assert.equal(light.ink, "#0f172a");
  assert.equal(light.inverse, "#ffffff");
});

test("system dark preference changes native controls and surfaces through CSS", () => {
  assert.match(darkRule, /color-scheme:\s*dark/);
  assert.notEqual(dark.paper, light.paper);
  assert.notEqual(dark.skeleton, light.skeleton);
  assert.ok(luminance(dark.paper) < 0.01);
});

test("dark text, semantic labels, and filled controls maintain AA contrast", () => {
  const pairs = [
    ...["paper", "card"].flatMap((surface) => ["ink", "body", "muted", "faint", "brand", "up", "down-ink", "warm-ink"].map((text) => [text, surface])),
    ...["ink", "brand", "brand-strong", "up", "down", "warm"].map((fill) => ["inverse", fill]),
    ["brand", "brand-soft"], ["up", "up-soft"], ["down-ink", "down-soft"], ["warm-ink", "warm-soft"], ["up", "holder-good-bg"],
  ];
  for (const [foreground, background] of pairs) {
    const a = luminance(dark[foreground]);
    const b = luminance(dark[background]);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    assert.ok(ratio >= 4.5, `${foreground} on ${background}: ${ratio.toFixed(2)}:1`);
  }
});
