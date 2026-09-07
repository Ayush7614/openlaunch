import assert from "node:assert/strict";
import test from "node:test";
import { walletMark } from "./wallet-mark.ts";

const address = "0x49a5000000000000000000000000000000008576";

test("wallet fingerprints are deterministic and ignore address casing", () => {
  const expected = walletMark(address);
  assert.deepEqual(walletMark(address), expected);
  assert.deepEqual(walletMark(address.toUpperCase()), expected);
  assert.deepEqual(walletMark("0x49A5000000000000000000000000000000008576"), expected);
});

test("wallet fingerprints use the full address, not the shortened label", () => {
  const hiddenMiddleChanged = "0x49a5000000000000000100000000000000008576";
  assert.equal(address.slice(0, 6), hiddenMiddleChanged.slice(0, 6));
  assert.equal(address.slice(-4), hiddenMiddleChanged.slice(-4));
  assert.notDeepEqual(walletMark(address), walletMark(hiddenMiddleChanged));
});

test("wallet fingerprints have bounded, unique, mirrored cells and a populated center", () => {
  const designs = new Set<string>();
  for (let index = 0; index < 256; index++) {
    const cells = walletMark(`0x${index.toString(16).padStart(40, "0")}`);
    const positions = new Set(cells.map(({ x, y }) => `${x}:${y}`));
    designs.add(JSON.stringify(cells));
    assert.ok(cells.length > 0 && cells.length <= 25);
    assert.equal(positions.size, cells.length, "SVG cells need distinct React keys");
    assert.ok(positions.has("18:18"), "the center cell must always be present");
    for (const { x, y } of cells) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y));
      assert.ok(x >= 9 && x <= 27 && y >= 9 && y <= 27);
      assert.equal((x - 9) % 4.5, 0);
      assert.equal((y - 9) % 4.5, 0);
      assert.ok(positions.has(`${36 - x}:${y}`), "each row is horizontally mirrored");
    }
  }
  // This is decorative geometry, not a cryptographic identity guarantee.
  assert.ok(designs.size > 240, "sample wallets should not collapse into a handful of placeholders");
});

test("unusual fingerprint input stays bounded and does not become SVG markup", () => {
  for (const input of ["", "0x", "<script>alert(1)</script>", "💙", "A".repeat(300)]) {
    assert.ok(walletMark(input).every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && x >= 9 && x <= 27 && y >= 9 && y <= 27));
  }
});
