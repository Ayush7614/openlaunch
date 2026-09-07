import assert from "node:assert/strict";
import test from "node:test";
import { shouldAnimateLaunch } from "./hero-animation.ts";

test("launch autoplay respects every pause, visibility and accessibility combination", () => {
  for (let bits = 0; bits < 32; bits++) {
    const state = {
      paused: Boolean(bits & 1),
      inspecting: Boolean(bits & 2),
      motionAllowed: Boolean(bits & 4),
      inView: Boolean(bits & 8),
      pageVisible: Boolean(bits & 16),
    };
    assert.equal(shouldAnimateLaunch(state), bits === 28, JSON.stringify(state));
  }
});
