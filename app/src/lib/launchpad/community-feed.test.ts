import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { communityFingerprint, filterCommunityPosts } from "./community-feed.ts";

const posts = [
  { id: 1, chain: "base", token: "0xAbC", wallet: "0xWallet", symbol: "SKY", name: "Clear Sky", body: "A real conversation", tag: "creator", created_at: "2026-09-07T00:00:00Z" },
  { id: 2, chain: "robinhood", token: "0xAbC", wallet: "0xAnother", symbol: "MOON", name: "Moon", body: "Something different", tag: null, created_at: "2026-09-07T00:00:01Z" },
];
test("community filters stay chain-scoped and search loaded content without mutating posts", () => {
  assert.deepEqual(filterCommunityPosts(posts, "base", "  sky "), [posts[0]]);
  assert.deepEqual(filterCommunityPosts(posts, null, "0xabc"), posts);
  assert.deepEqual(filterCommunityPosts(posts, "robinhood", "conversation"), []);
  assert.deepEqual(filterCommunityPosts(posts, null, "wallet"), [posts[0]]);
  assert.deepEqual(filterCommunityPosts(posts, null, " "), posts);
  assert.equal(posts.length, 2);
});
test("community refresh compares the shared 30-post window while retaining full server results", () => {
  const rows = Array.from({ length: 100 }, (_, id) => ({ ...posts[0], id }));
  assert.equal(communityFingerprint(rows), communityFingerprint(rows.slice(0, 30)));
  assert.notEqual(communityFingerprint(posts), communityFingerprint(posts.slice(1)));
  assert.notEqual(communityFingerprint(posts), communityFingerprint([{ ...posts[0], body: "Changed" }, posts[1]]));
});
test("community remains read-only with token-thread links and shared refresh signals", () => {
  const source = readFileSync(new URL("../../components/sections/CommunityFeed.tsx", import.meta.url), "utf8");
  assert.match(source, /subscribe\(\(snap\)/);
  assert.match(source, /router\.refresh\(\)/);
  assert.match(source, /nowMs\(\) - fullWindowRefresh\.current < 60_000/);
  assert.match(source, /#comments/);
  assert.match(source, /Search covers only the recent posts loaded here/);
  assert.match(source, /aria-label="Search recent posts"/);
  assert.doesNotMatch(source, /signMessage|writeContract|dangerouslySetInnerHTML|setInterval/);
});
