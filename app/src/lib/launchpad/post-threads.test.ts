import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMENTS_PAGE, clearDraft, draftKey, groupReplies, loadDraft, saveDraft, visibleTopIds } from "./post-threads.ts";
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
