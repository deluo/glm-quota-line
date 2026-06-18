import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { readCtxCache, writeCtxCache, usableCached } from "../src/core/context/cache.js";
import { withTempDir } from "./helpers.js";

const VALID = {
  modelId: "glm-5.2",
  usedPercent: 42,
  remainingPercent: 58,
  windowSize: 1000000,
  severity: "warn",
  sessionId: "sess-1"
};

test("writeCtxCache then readCtxCache round-trips the value", async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, "ctx-cache.json");
    await writeCtxCache({ ...VALID }, file);

    const read = await readCtxCache(file);
    assert.equal(read.modelId, "glm-5.2");
    assert.equal(read.usedPercent, 42);
    assert.equal(read.remainingPercent, 58);
    assert.equal(read.windowSize, 1000000);
    assert.equal(read.severity, "warn");
    assert.equal(read.sessionId, "sess-1");
  });
});

test("writeCtxCache fills savedAt when the caller omits it", async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, "ctx-cache.json");
    const before = Date.now();
    // VALID has no savedAt — mimics getContextData's return shape, which
    // previously caused savedAt to be dropped entirely from the JSON.
    await writeCtxCache({ ...VALID }, file);
    const after = Date.now();

    const read = await readCtxCache(file);
    assert.ok(Number.isFinite(read.savedAt), "savedAt must be a finite number");
    assert.ok(read.savedAt >= before && read.savedAt <= after, "savedAt should be ~now");
  });
});

test("writeCtxCache honors an explicit savedAt passed by the caller", async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, "ctx-cache.json");
    await writeCtxCache({ ...VALID, savedAt: 12345 }, file);

    const read = await readCtxCache(file);
    assert.equal(read.savedAt, 12345);
  });
});

test("readCtxCache returns null when the file is missing", async () => {
  await withTempDir(async (dir) => {
    const read = await readCtxCache(path.join(dir, "missing.json"));
    assert.equal(read, null);
  });
});

test("readCtxCache returns null for invalid cached shape", async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, "ctx-cache.json");
    await writeCtxCache({ modelId: "glm-5.2" }, file); // missing usedPercent/windowSize
    const read = await readCtxCache(file);
    assert.equal(read, null);
  });
});

test("readCtxCache normalizes missing severity to neutral", async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, "ctx-cache.json");
    await writeCtxCache(
      { modelId: "glm-5.2", usedPercent: 10, remainingPercent: 90, windowSize: 200000, severity: "bogus", sessionId: "" },
      file
    );
    const read = await readCtxCache(file);
    assert.equal(read.severity, "neutral");
  });
});

test("usableCached returns null across a model switch", () => {
  const cached = { ...VALID };
  // Same model: usable (modelId arg null lets the caller match)
  assert.equal(usableCached(cached, "sess-1", null), cached);
  // Different session id blocks fallback
  assert.equal(usableCached(cached, "other-session", null), null);
});

test("usableCached returns null when sessionId differs", () => {
  const cached = { ...VALID, sessionId: "sess-1" };
  assert.equal(usableCached(cached, "sess-2", null), null);
  assert.equal(usableCached(cached, "sess-1", null), cached);
});

test("writeCtxCache ignores invalid input without throwing", async () => {
  await withTempDir(async (dir) => {
    const file = path.join(dir, "ctx-cache.json");
    await writeCtxCache({ modelId: "" }, file);
    const read = await readCtxCache(file);
    assert.equal(read, null);
  });
});
