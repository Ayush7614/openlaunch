import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ETH_FETCH_TIMEOUT_MS,
  ETH_PRICE_TTL_MS,
  ETH_SPOT_URL,
  ethUsd,
  parseEthSpot,
  resetEthPriceCache,
} from "./ethPrice.ts";

const okBody = (amount: string) => new Response(JSON.stringify({ data: { amount } }), { status: 200 });

function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

function mockFetch(res: Response, seen: { n: number; url?: string; signal?: unknown }) {
  return async (input: string, init?: RequestInit) => {
    seen.n += 1;
    seen.url = input;
    seen.signal = init?.signal;
    return res;
  };
}

test("parseEthSpot takes the live shape and rejects everything else", () => {
  assert.equal(parseEthSpot({ data: { amount: "2476.12" } }), 2476.12);
  assert.equal(parseEthSpot(null), null);
  assert.equal(parseEthSpot(undefined), null);
  assert.equal(parseEthSpot("2476"), null);
  assert.equal(parseEthSpot({}), null);
  assert.equal(parseEthSpot({ data: null }), null);
  assert.equal(parseEthSpot({ data: {} }), null);
  assert.equal(parseEthSpot({ data: { amount: 2476 } }), null, "number, not string");
  assert.equal(parseEthSpot({ data: { amount: "abc" } }), null);
  assert.equal(parseEthSpot({ data: { amount: "" } }), null);
  assert.equal(parseEthSpot({ data: { amount: "0" } }), null);
  assert.equal(parseEthSpot({ data: { amount: "-5" } }), null);
  assert.equal(parseEthSpot({ data: { amount: "Infinity" } }), null);
});

test("cold fetch publishes the price and memoizes within the TTL", async () => {
  resetEthPriceCache();
  const c = clock();
  const seen = { n: 0 };
  const v1 = await ethUsd({ fetchFn: mockFetch(okBody("2500"), seen), now: c.now });
  assert.equal(v1, 2500);
  assert.equal(seen.url, ETH_SPOT_URL);
  const v2 = await ethUsd({ fetchFn: mockFetch(okBody("9999"), seen), now: c.now });
  assert.equal(v2, 2500, "second call inside the TTL never hits the network");
  assert.equal(seen.n, 1);
});

test("non-200 keeps the last good price instead of blanking USD (poisoning guard)", async () => {
  resetEthPriceCache();
  const c = clock();
  const seen = { n: 0 };
  assert.equal(await ethUsd({ fetchFn: mockFetch(okBody("2500"), seen), now: c.now }), 2500);
  c.advance(ETH_PRICE_TTL_MS + 1);
  const v = await ethUsd({
    fetchFn: mockFetch(new Response("rate limited", { status: 429 }), seen),
    now: c.now,
  });
  assert.equal(v, 2500, "429 must not overwrite the good price with null");
  assert.equal(seen.n, 2);
});

test("200 with an unusable body keeps the last good price", async () => {
  resetEthPriceCache();
  const c = clock();
  const seen = { n: 0 };
  assert.equal(await ethUsd({ fetchFn: mockFetch(okBody("2500"), seen), now: c.now }), 2500);
  for (const bad of [
    new Response("{}", { status: 200 }),
    new Response("<html>error</html>", { status: 200, headers: { "content-type": "text/html" } }),
    new Response(JSON.stringify({ data: { amount: "nope" } }), { status: 200 }),
    new Response(JSON.stringify({ data: { amount: "-1" } }), { status: 200 }),
  ]) {
    c.advance(ETH_PRICE_TTL_MS + 1);
    const v = await ethUsd({ fetchFn: mockFetch(bad, seen), now: c.now });
    assert.equal(v, 2500, `bad shape must preserve stale, got ${v}`);
  }
});

test("network throw keeps stale; cold failure is null (UI shows ETH only)", async () => {
  resetEthPriceCache();
  const c = clock();
  const boom = async () => {
    throw new Error("dns down");
  };
  assert.equal(await ethUsd({ fetchFn: boom, now: c.now }), null);
  resetEthPriceCache();
  const seen = { n: 0 };
  assert.equal(await ethUsd({ fetchFn: mockFetch(okBody("2500"), seen), now: c.now }), 2500);
  c.advance(ETH_PRICE_TTL_MS + 1);
  assert.equal(await ethUsd({ fetchFn: boom, now: c.now }), 2500);
});

test("failures back off for one TTL and the request carries a timeout", async () => {
  resetEthPriceCache();
  const c = clock();
  const seen: { n: number; signal?: unknown } = { n: 0 };
  assert.equal(
    await ethUsd({
      fetchFn: mockFetch(new Response("x", { status: 500 }), seen),
      now: c.now,
    }),
    null,
  );
  assert.equal(seen.n, 1);
  assert.ok(seen.signal instanceof AbortSignal, "fetch runs under AbortSignal.timeout");
  assert.equal(
    await ethUsd({
      fetchFn: mockFetch(okBody("2500"), seen),
      now: c.now,
    }),
    null,
    "failure advances the timestamp: no retry until the TTL lapses",
  );
  assert.equal(seen.n, 1);
  c.advance(ETH_PRICE_TTL_MS + 1);
  assert.equal(
    await ethUsd({ fetchFn: mockFetch(okBody("2500"), seen), now: c.now }),
    2500,
    "recovers on the next attempt after the TTL",
  );
  assert.equal(ETH_FETCH_TIMEOUT_MS, 5_000);
});
