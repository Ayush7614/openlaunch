import { test } from "node:test";
import assert from "node:assert/strict";
import { Attribution } from "ox/erc8021";
import { BUILDER_CODE, BUILDER_DATA_SUFFIX } from "./chainPublic.ts";

test("BUILDER_DATA_SUFFIX is the ERC-8021 schema-0 suffix for BUILDER_CODE", () => {
  assert.equal(BUILDER_DATA_SUFFIX, Attribution.toDataSuffix({ codes: [BUILDER_CODE] }));
  assert.deepEqual(Attribution.fromData(BUILDER_DATA_SUFFIX), { codes: [BUILDER_CODE], id: 0 });
});
