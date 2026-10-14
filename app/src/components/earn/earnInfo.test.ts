import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { loadEarnInfo } from "./earnInfo.ts";

// loadEarnInfo is plain fetch logic; the global fetch is swapped for a counter so no request leaves the test.
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function serve(answers: (() => Promise<Response>)[]) {
  let calls = 0;
  globalThis.fetch = (async () => {
    const answer = answers[Math.min(calls, answers.length - 1)];
    calls++;
    return answer();
  }) as typeof fetch;
  return () => calls;
}
const json = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

test("callers asking at the same time share one request", async () => {
  const calls = serve([json({ enabled: true, vaults: [] })]);
  const [a, b] = await Promise.all([loadEarnInfo(), loadEarnInfo()]);
  assert.equal(calls(), 1);
  assert.deepEqual(a, { enabled: true, vaults: [] });
  assert.deepEqual(b, a);
});

test("a settled answer is not remembered: switching EARN off shows on the next ask, without a reload", async () => {
  const calls = serve([json({ enabled: true, vaults: [] }), json({ enabled: false })]);
  assert.deepEqual(await loadEarnInfo(), { enabled: true, vaults: [] });
  assert.deepEqual(await loadEarnInfo(), { enabled: false });
  assert.equal(calls(), 2);
});

test("a failed request reads as off, and the next ask tries again", async () => {
  const calls = serve([async () => new Response("down", { status: 502 }), json({ enabled: true, vaults: [] })]);
  assert.deepEqual(await loadEarnInfo(), { enabled: false });
  assert.deepEqual(await loadEarnInfo(), { enabled: true, vaults: [] });
  assert.equal(calls(), 2);
  serve([async () => { throw new TypeError("network down"); }]);
  assert.deepEqual(await loadEarnInfo(), { enabled: false });
});
