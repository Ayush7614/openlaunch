import { test } from "node:test";
import assert from "node:assert/strict";
import { ago } from "./time.ts";

const NOW = new Date("2026-09-01T00:00:00.000Z").getTime();
const iso = (ms: number) => new Date(ms).toISOString();

test("ago buckets seconds, minutes, hours, days", () => {
  assert.equal(ago(iso(NOW - 12_000), NOW), "12s");
  assert.equal(ago(iso(NOW - 59_000), NOW), "59s");
  assert.equal(ago(iso(NOW - 60_000), NOW), "1m");
  assert.equal(ago(iso(NOW - 59 * 60_000), NOW), "59m");
  assert.equal(ago(iso(NOW - 3_600_000), NOW), "1h");
  assert.equal(ago(iso(NOW - 23 * 3_600_000), NOW), "23h");
  assert.equal(ago(iso(NOW - 86_400_000), NOW), "1d");
  assert.equal(ago(iso(NOW - 9 * 86_400_000), NOW), "9d");
});

test("ago clamps future timestamps to 0s", () => {
  assert.equal(ago(iso(NOW + 60_000), NOW), "0s", "clock skew never renders a negative age");
  assert.equal(ago(iso(NOW), NOW), "0s");
});

test("ago never renders NaN for garbage input", () => {
  for (const bad of ["", "nope", "2026-13-99", "null"]) assert.equal(ago(bad, NOW), "0s", `${JSON.stringify(bad)} → 0s, not NaNd`);
});
