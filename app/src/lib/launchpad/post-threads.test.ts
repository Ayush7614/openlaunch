import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMENTS_PAGE, clearDraft, draftKey, groupReplies, initialPostsLoadState, loadCommentDraft, loadDraft, nextPostsLoadState, resolveReplyTarget, saveDraft, shouldIgnoreLoad, visibleTopIds } from "./post-threads.ts";
import type { PostRow } from "./postsServer.ts";

const post = (id: number, parent_id: number | null): PostRow => ({ id, chain: "base", token: "0xtoken", wallet: "0xwallet", parent_id, body: `body ${id}`, tag: null, created_at: "2026-01-01T00:00:00.000Z", reports: 0, hidden: false });

test("groupReplies splits top-level from one-level replies, newest reply last", () => {
  const posts = [post(3, null), post(2, 3), post(1, 3), post(4, null)];
  const { top, repliesById } = groupReplies(posts);
  assert.deepEqual(top.map((p) => p.id), [3, 4]);
  assert.deepEqual(repliesById.get(3)!.map((p) => p.id), [1, 2], "server order (newest first) reverses to oldest-first under the comment");
  assert.equal(repliesById.get(4), undefined);
});

test("groupReplies on empty / replies-only input", () => {
  assert.deepEqual(groupReplies([]).top, []);
  const { top, repliesById } = groupReplies([post(9, 7)]);
  assert.deepEqual(top, []);
  assert.deepEqual(repliesById.get(7)!.map((p) => p.id), [9]);
});

test("visibleTopIds paginates the top level", () => {
  const top = [post(1, null), post(2, null), post(3, null)];
  assert.deepEqual(visibleTopIds(top, 2).map((p) => p.id), [1, 2]);
  assert.deepEqual(visibleTopIds(top, 99).map((p) => p.id), [1, 2, 3]);
  assert.deepEqual(visibleTopIds(top, 0), []);
  assert.equal(COMMENTS_PAGE, 20);
});

test("draft key is per token and lowercase; node loads empty and saves are no-ops", () => {
  assert.equal(draftKey("base", "0xABC"), "ol:comment-draft:base:0xabc");
  assert.notEqual(draftKey("base", "0xabc"), draftKey("robinhood", "0xabc"));
  assert.equal(loadDraft("base", "0xabc"), "");
  saveDraft("base", "0xabc", "hello");
  clearDraft("base", "0xabc");
  assert.equal(loadDraft("base", "0xabc"), "", "no localStorage in node: always empty, never throws");
});

function withMemoryStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const g = globalThis as Record<string, unknown>;
  g.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  return store;
}

function withoutStorage(): void {
  const g = globalThis as Record<string, unknown>;
  delete g.localStorage;
}

test("draft restores both a top-level draft and a reply draft (PR #31)", () => {
  const store = withMemoryStorage();
  try {
    saveDraft("base", "0xabc", "top-level hello");
    assert.deepEqual(loadCommentDraft("base", "0xabc"), { body: "top-level hello", parentId: null });
    assert.equal(loadDraft("base", "0xabc"), "top-level hello");

    saveDraft("base", "0xabc", "reply hello", 42);
    assert.deepEqual(loadCommentDraft("base", "0xabc"), { body: "reply hello", parentId: 42 });

    clearDraft("base", "0xabc");
    assert.deepEqual(loadCommentDraft("base", "0xabc"), { body: "", parentId: null });
    assert.equal(store.size, 0);
  } finally {
    withoutStorage();
  }
});

test("draft understands legacy plain-text drafts and rejects bad parent ids", () => {
  const store = withMemoryStorage();
  try {
    store.set(draftKey("base", "0xabc"), "legacy hello");
    assert.deepEqual(loadCommentDraft("base", "0xabc"), { body: "legacy hello", parentId: null });

    store.set(draftKey("base", "0xabc"), JSON.stringify({ body: "x", parentId: -7 }));
    assert.deepEqual(loadCommentDraft("base", "0xabc"), { body: "x", parentId: null });

    store.set(draftKey("base", "0xabc"), JSON.stringify({ body: "x", parentId: "42" }));
    assert.deepEqual(loadCommentDraft("base", "0xabc"), { body: "x", parentId: null });
  } finally {
    withoutStorage();
  }
});

test("resolveReplyTarget blocks before first load and preserves reply when posts window is truncated (PR #31)", () => {
  assert.deepEqual(resolveReplyTarget(null, [], false), { target: null, pending: false, missing: false }, "top-level never blocks");
  assert.deepEqual(resolveReplyTarget(null, [], true), { target: null, pending: false, missing: false });
  assert.deepEqual(resolveReplyTarget(42, [], false), { target: 42, pending: true, missing: false }, "restored reply is pending before validation, never signed");
  // After a successful load the posts window is truncated (latest 100). Absence there is not proof the parent was deleted.
  assert.deepEqual(resolveReplyTarget(42, [], true), { target: 42, pending: false, missing: false }, "empty window is not proof parent is gone — preserve");
  assert.deepEqual(resolveReplyTarget(42, [{ id: 42 }], true), { target: 42, pending: false, missing: false }, "present parent stays a reply");
  assert.deepEqual(resolveReplyTarget(42, [{ id: 7 }], true), { target: 42, pending: false, missing: false }, "parent not in truncated window preserves target");
});

test("resolveReplyTarget preserves valid parent outside returned window (PR #31 regression)", () => {
  // Saved reply to 100, response contains only 200..101 — parent still exists but is outside the window.
  const window = Array.from({ length: 100 }, (_, i) => ({ id: 200 - i }));
  assert.equal(window.some((p) => p.id === 100), false, "100 is outside the latest-100 window");
  assert.deepEqual(resolveReplyTarget(100, window, true), { target: 100, pending: false, missing: false }, "valid parent outside window must not become top-level");
  // Before validation (postsLoaded false) the same draft stays pending even on failure (503 / network rejection) — no silent fallback
  assert.deepEqual(resolveReplyTarget(100, [], false), { target: 100, pending: true, missing: false }, "failed/no-load keeps pending so draft isn't lost");
  assert.deepEqual(resolveReplyTarget(100, window, false), { target: 100, pending: true, missing: false });
});

test("shouldIgnoreLoad drops stale/aborted responses so token A cannot overwrite token B (PR #31)", () => {
  // Token A starts load id 1; switching to B bumps generation to 2 and aborts A.
  assert.equal(shouldIgnoreLoad(1, 1, false), false, "current generation, live request: apply");
  assert.equal(shouldIgnoreLoad(1, 2, false), true, "older request resolving after token switch: ignore");
  assert.equal(shouldIgnoreLoad(1, 2, true), true, "aborted request: ignore");
  assert.equal(shouldIgnoreLoad(2, 2, true), true, "current generation but aborted: ignore");
  assert.equal(shouldIgnoreLoad(2, 2, false), false, "newer request for the current token: apply");
});

test("nextPostsLoadState keeps a restored reply pending with Retry after 503/network failure (PR #31)", () => {
  // Initial 503: postsLoaded stays false (reply stays pending, submit blocks), error arms Retry.
  const after503 = nextPostsLoadState(initialPostsLoadState, { kind: "http-error", status: 503 });
  assert.deepEqual(after503, { postsLoaded: false, loadError: "Could not load comments (503)." });
  assert.deepEqual(resolveReplyTarget(42, [], after503.postsLoaded), { target: 42, pending: true, missing: false }, "draft destination preserved, still pending — never silently top-level");

  // Network rejection: same shape, connection hint.
  const afterNet = nextPostsLoadState(initialPostsLoadState, { kind: "network-error" });
  assert.deepEqual(afterNet, { postsLoaded: false, loadError: "Could not load comments. Check your connection." });
  assert.deepEqual(resolveReplyTarget(42, [], afterNet.postsLoaded), { target: 42, pending: true, missing: false });

  // Retry succeeding clears the error and unblocks validation.
  const recovered = nextPostsLoadState(after503, { kind: "ok" });
  assert.deepEqual(recovered, { postsLoaded: true, loadError: null });

  // Abort/stale completion leaves failure state untouched (no error wipe, no phantom load).
  assert.equal(nextPostsLoadState(after503, { kind: "ignored" }), after503, "ignored outcomes return prev state");
});
