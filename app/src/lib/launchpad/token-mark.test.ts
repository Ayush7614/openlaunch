import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { tokenMark } from "./token-mark.ts";

const address = "0xf9473202c0766b11f879806099d5e260b3e1a250";

test("mint marks are deterministic, case-insensitive and chain-scoped", () => {
  assert.deepEqual(tokenMark("base", address), tokenMark(" BASE ", address.toUpperCase()));
  assert.notDeepEqual(tokenMark("base", address), tokenMark("robinhood", address));
  assert.notDeepEqual(tokenMark("base", address), tokenMark("base", address.slice(0, -1) + "1"));
});

test("mint marks remain bounded, nonempty and use exactly one accent facet", () => {
  const families = new Set<number>();
  const designs = new Set<string>();
  for (let index = 0; index < 256; index++) {
    const mark = tokenMark("base", `0x${index.toString(16).padStart(40, "0")}`);
    families.add(mark.family);
    designs.add(JSON.stringify(mark));
    assert.ok([0, 90, 180, 270].includes(mark.rotation));
    assert.ok(mark.parts.length >= 3 && mark.parts.length <= 6);
    assert.equal(mark.parts.filter((part) => part.tone === "accent").length, 1);
    for (const part of mark.parts) {
      assert.match(part.points, /^[\d., ]+$/);
      for (const point of part.points.split(" ")) {
        const coordinates = point.split(",").map(Number);
        assert.equal(coordinates.length, 2);
        assert.ok(coordinates.every((value) => Number.isFinite(value) && value >= 5 && value <= 43));
      }
    }
    assert.equal(mark.ticks.length, 5);
    assert.ok(mark.ticks.every((height) => height >= 1 && height <= 4));
  }
  assert.equal(families.size, 4);
  assert.ok(designs.size > 240, "sampled identities should not collapse into a handful of placeholders");
});

test("empty and prelaunch identity inputs still produce safe geometry", () => {
  for (const input of ["", "0xTOKEN", "<script>alert(1)</script>", "💙", "A".repeat(300)]) {
    const mark = tokenMark("unknown", input);
    assert.ok(mark.parts.length > 0);
    assert.ok(mark.parts.every((part) => /^[\d., ]+$/.test(part.points)));
  }
});

test("avatar source contracts preserve logos, recover changed sources and keep marks quiet", () => {
  const source = readFileSync(new URL("../../components/launchpad/TokenAvatar.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../components/launchpad/TokenAvatar.module.css", import.meta.url), "utf8");
  assert.match(source, /src && src !== failedSrc/);
  assert.match(source, /key=\{src\}/);
  assert.match(source, /onError=\{\(\) => setFailedSrc\(src\)\}/);
  assert.match(source, /img\?\.complete && img\.naturalWidth === 0/);
  assert.match(source, /tokenMark\(chain, token\)/);
  assert.match(source, /data-token-avatar="generated"/);
  assert.match(source, /focusable="false"/);
  assert.match(source, /size >= 36/);
  assert.doesNotMatch(source + css, /linear-gradient|radial-gradient|Math\.random|hsl\(|animation:|filter:|box-shadow:/);
  assert.doesNotMatch(source, /symbol\.slice/);
});
