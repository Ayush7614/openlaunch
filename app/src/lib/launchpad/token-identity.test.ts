import assert from "node:assert/strict";
import test from "node:test";
import { tokenHue, tokenIdentity } from "./token-identity.ts";

const address = "0x49a5000000000000000000000000000000008576";

test("token mosaics are deterministic and normalize complete addresses", () => {
  const expected = tokenIdentity(address);
  for (const value of [address, address.toUpperCase(), ` \t${address}\n`]) {
    assert.deepEqual(tokenIdentity(value), expected);
    assert.equal(tokenHue(value), expected.primaryHue);
  }
  const hiddenMiddleChanged = "0x49a5000000000000000100000000000000008576";
  assert.equal(address.slice(0, 6), hiddenMiddleChanged.slice(0, 6));
  assert.equal(address.slice(-4), hiddenMiddleChanged.slice(-4));
  assert.notDeepEqual(tokenIdentity(hiddenMiddleChanged), expected);
});

test("token mosaics use nine bounded cells and keep both palette tones visible", () => {
  const designs = new Set<string>();
  const palettes = new Set<string>();
  for (let index = 0; index < 512; index++) {
    const identity = tokenIdentity(`0x${index.toString(16).padStart(40, "0")}`);
    const { cells, primaryHue, secondaryHue } = identity;
    assert.equal(cells.length, 9);
    assert.equal(new Set(cells.map(({ x, y }) => `${x}:${y}`)).size, 9);
    assert.deepEqual(new Set(cells.map(({ tone }) => tone)), new Set(["primary", "secondary"]));
    for (const { x, y, path, rotation } of cells) {
      assert.ok(x >= 6 && x + 11 <= 42 && y >= 6 && y + 11 <= 42);
      assert.equal((x - 6) % 12, 0);
      assert.equal((y - 6) % 12, 0);
      assert.ok([0, 90, 180, 270].includes(rotation));
      assert.match(path, /^[MmAaVvHhQqZz\d.\s-]+$/);
      assert.ok(Array.from(path.matchAll(/-?\d+(?:\.\d+)?/g), (match) => Number(match[0])).every((number) => Math.abs(number) <= 11));
    }
    assert.ok(primaryHue >= 0 && primaryHue < 360 && secondaryHue >= 0 && secondaryHue < 360);
    assert.notEqual(primaryHue, secondaryHue);
    palettes.add(`${primaryHue}:${secondaryHue}`);
    designs.add(JSON.stringify(identity));
  }
  assert.equal(palettes.size, 8, "sample tokens should use every curated color pair");
  assert.ok(designs.size > 480, "decorative identities should not collapse into a handful of placeholders");
});

test("prelaunch names and unusual input produce stable, bounded local identities", () => {
  for (const input of ["", "0x", "preview:New token", "<script>alert(1)</script>", "💙", "A".repeat(300)]) {
    const identity = tokenIdentity(input);
    assert.deepEqual(tokenIdentity(input), identity);
    assert.equal(tokenHue(input), identity.primaryHue);
    assert.equal(identity.cells.length, 9);
    assert.ok(identity.cells.every(({ x, y, path }) => Number.isFinite(x) && Number.isFinite(y) && !/[<>]/.test(path)));
  }
});
