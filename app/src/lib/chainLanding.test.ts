import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { CHAIN_KEYS, CHAIN_LABELS } from "./chainKeys.ts";
import { BRAND_DOMAIN } from "./brand.ts";
import { CHAIN_LANDING, chainLandingPath } from "./chainLanding.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("every chain has a landing page route wired to its own key", () => {
  for (const chain of CHAIN_KEYS) {
    const file = new URL(`../app/${chain}/page.tsx`, import.meta.url);
    assert.ok(existsSync(file), `src/app/${chain}/page.tsx is missing`);
    const src = readFileSync(file, "utf8");
    assert.ok(src.includes(`chainLandingMetadata("${chain}")`), `${chain} page must use its own metadata`);
    assert.ok(src.includes(`<ChainLanding chain="${chain}" />`), `${chain} page must render its own chain`);
    assert.equal(chainLandingPath(chain), `/${chain}`);
  }
});

test("landing copy fits search snippets and names its chain", () => {
  for (const chain of CHAIN_KEYS) {
    const c = CHAIN_LANDING[chain];
    // the root layout template appends " · openlaunch.lol"
    assert.ok(`${c.title} · ${BRAND_DOMAIN}`.length <= 60, `${chain} title too long for Google`);
    assert.ok(c.description.length <= 155, `${chain} description too long for the snippet`);
    for (const text of [c.title, c.description, c.heading, c.intro]) assert.ok(text.includes(CHAIN_LABELS[chain]), `${chain}: "${text}" must name the chain`);
    assert.doesNotMatch(JSON.stringify(c), /audited|guaranteed|safe investment|moon|profit|risk.free|best/i);
  }
});

test("landing pages canonicalise to themselves, not to / or ?chain=", () => {
  const comp = read("../components/launchpad/ChainLanding.tsx");
  assert.match(comp, /pageMetadata\(\{ path: chainLandingPath\(chain\)/);
  assert.doesNotMatch(comp, /id="launches-heading"/, "LaunchList already owns that id");
  assert.match(comp, /notFound\(\)/, "an unconfigured chain 404s instead of rendering an empty list");
});

test("/t/<chain> moves permanently to the landing page", () => {
  const legacy = read("../app/t/[chain]/page.tsx");
  assert.match(legacy, /if \(isChainKey\(chain\)\) permanentRedirect\(chainLandingPath\(chain\)\);/);
  assert.doesNotMatch(legacy, /\/\?chain=/);
});

test("footer and about page link each chain's landing page", () => {
  assert.match(read("../components/Footer.tsx"), /<Link href=\{chainLandingPath\(chain\)\}/);
  assert.match(read("../app/about/page.tsx"), /<Link href=\{chainLandingPath\(chain\)\}/);
});
