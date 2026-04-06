import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { resolveQuotaStatus } from "../src/core/quota/service.js";
import { createQuotaConfig, makeJsonResponse, withTempDir } from "./helpers.js";
import { LOW_QUOTA_THRESHOLD, REFRESH_TIERS } from "../src/shared/constants.js";

const SUCCESS_RESULT = Object.freeze({
  kind: "success",
  level: "lite",
  display: "percent",
  leftPercent: 91,
  usedPercent: 9,
  nextResetTime: 1774939627716
});

function successBody(leftPercent = 91) {
  return {
    code: 200,
    msg: "ok",
    data: {
      limits: [
        {
          type: "TOKENS_LIMIT",
          unit: 3,
          number: 5,
          percentage: 100 - leftPercent,
          nextResetTime: 1774939627716
        }
      ],
      level: "lite"
    },
    success: true
  };
}

function getTtl(tierIndex, leftPercent) {
  if (Number.isFinite(leftPercent) && leftPercent < LOW_QUOTA_THRESHOLD) {
    return REFRESH_TIERS[0].ttlMs;
  }
  return REFRESH_TIERS[tierIndex]?.ttlMs ?? REFRESH_TIERS[REFRESH_TIERS.length - 1].ttlMs;
}

function readCacheAt(cacheFilePath) {
  return fs.readFile(cacheFilePath, "utf8").then((r) => JSON.parse(r));
}

/**
 * Perform one successful refresh at exactly the TTL boundary.
 * Returns the updated cache.
 */
async function doRefresh(cacheFilePath, leftPercent = 91, sessionId = "") {
  let cached;
  try {
    cached = await readCacheAt(cacheFilePath);
  } catch {
    cached = null;
  }
  const ttl = getTtl(cached?.tierIndex ?? 0, cached?.result?.leftPercent);
  const now = (cached?.lastAttemptAt ?? 0) + ttl;
  await resolveQuotaStatus(
    { ...createQuotaConfig(cacheFilePath), sessionId },
    { now, fetchImpl: async () => makeJsonResponse(successBody(leftPercent)) }
  );
  return readCacheAt(cacheFilePath);
}

/**
 * Seed the cache at a specific tier / count state so tests skip the warm-up loop.
 */
async function seedCache(cacheFilePath, { tierIndex, refreshCount, leftPercent = 91, sessionId = "", lastAttemptAt = 1000 }) {
  await fs.writeFile(cacheFilePath, JSON.stringify({
    savedAt: lastAttemptAt,
    lastAttemptAt,
    sessionId,
    refreshCount,
    tierIndex,
    result: { ...SUCCESS_RESULT, leftPercent, usedPercent: 100 - leftPercent }
  }, null, 2));
}

// ---------------------------------------------------------------------------
// Tier progression
// ---------------------------------------------------------------------------

test("first fetch starts at tier 0 (3-minute TTL)", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");

    const cached = await doRefresh(cacheFilePath, 91);
    assert.equal(cached.refreshCount, 1);
    assert.equal(cached.tierIndex, 0);

    // Within tier 0 TTL → no refresh
    let calls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: cached.lastAttemptAt + REFRESH_TIERS[0].ttlMs - 1,
      fetchImpl: async () => { calls++; return makeJsonResponse(successBody()); }
    });
    assert.equal(calls, 0);

    // At tier 0 TTL → refresh
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: cached.lastAttemptAt + REFRESH_TIERS[0].ttlMs,
      fetchImpl: async () => { calls++; return makeJsonResponse(successBody()); }
    });
    assert.equal(calls, 1);
  });
});

test("5 refreshes at tier 0 advance to tier 1 (5-minute TTL)", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");

    // Seed at tier 0, count=4 — one more refresh triggers the advance
    await seedCache(cacheFilePath, { tierIndex: 0, refreshCount: 4 });

    const cached = await doRefresh(cacheFilePath);
    assert.equal(cached.tierIndex, 1);
    assert.equal(cached.refreshCount, 1);

    // Tier 0 TTL should NOT trigger at tier 1
    let calls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: cached.lastAttemptAt + REFRESH_TIERS[0].ttlMs,
      fetchImpl: async () => { calls++; return makeJsonResponse(successBody()); }
    });
    assert.equal(calls, 0);

    // Tier 1 TTL SHOULD trigger
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: cached.lastAttemptAt + REFRESH_TIERS[1].ttlMs,
      fetchImpl: async () => { calls++; return makeJsonResponse(successBody()); }
    });
    assert.equal(calls, 1);
  });
});

test("5 refreshes at tier 1 advance to tier 2 (10-minute TTL)", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");

    // Seed at tier 1, count=4 — one more triggers advance to tier 2
    await seedCache(cacheFilePath, { tierIndex: 1, refreshCount: 4 });

    const cached = await doRefresh(cacheFilePath);
    assert.equal(cached.tierIndex, 2);
    assert.equal(cached.refreshCount, 1);

    // Tier 1 TTL should NOT trigger at tier 2
    let calls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: cached.lastAttemptAt + REFRESH_TIERS[1].ttlMs,
      fetchImpl: async () => { calls++; return makeJsonResponse(successBody()); }
    });
    assert.equal(calls, 0);

    // Tier 2 TTL SHOULD trigger
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: cached.lastAttemptAt + REFRESH_TIERS[2].ttlMs,
      fetchImpl: async () => { calls++; return makeJsonResponse(successBody()); }
    });
    assert.equal(calls, 1);
  });
});

test("tier 2 stays at 10 minutes indefinitely", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath, { tierIndex: 2, refreshCount: 10 });

    for (let i = 0; i < 20; i++) {
      await doRefresh(cacheFilePath);
    }

    const cached = await readCacheAt(cacheFilePath);
    assert.equal(cached.tierIndex, 2);
  });
});

// ---------------------------------------------------------------------------
// Low-quota override
// ---------------------------------------------------------------------------

test("low quota forces tier 0 TTL even at tier 2", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");

    // At tier 2 with low quota
    await seedCache(cacheFilePath, { tierIndex: 2, refreshCount: 5, leftPercent: 20 });

    const cached = await readCacheAt(cacheFilePath);
    const tier0Ttl = REFRESH_TIERS[0].ttlMs;

    let calls = 0;
    // Tier 0 TTL should trigger refresh (low quota override)
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: cached.lastAttemptAt + tier0Ttl,
      fetchImpl: async () => { calls++; return makeJsonResponse(successBody(15)); }
    });
    assert.equal(calls, 1);
  });
});

test("low quota refreshes do not advance tier", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");

    // At tier 1, count=3, with high quota
    await seedCache(cacheFilePath, { tierIndex: 1, refreshCount: 3 });

    // Multiple low-quota refreshes — tier should freeze
    let cached;
    for (let i = 0; i < 5; i++) {
      cached = await doRefresh(cacheFilePath, 10);
    }

    assert.equal(cached.tierIndex, 1);
    assert.equal(cached.refreshCount, 3);
  });
});

test("tier resumes from where it was after quota recovers", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");

    // At tier 1, count=3, low quota
    await seedCache(cacheFilePath, { tierIndex: 1, refreshCount: 3, leftPercent: 10 });

    // Quota recovers
    const cached = await doRefresh(cacheFilePath, 85);
    assert.equal(cached.tierIndex, 1);
    assert.equal(cached.refreshCount, 4); // 3 + 1
  });
});

// ---------------------------------------------------------------------------
// Session reset
// ---------------------------------------------------------------------------

test("new session resets tier to 0", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");

    // At tier 2 in session A
    await seedCache(cacheFilePath, { tierIndex: 2, refreshCount: 5, sessionId: "session-a" });

    // New session B forces a refresh
    let calls = 0;
    await resolveQuotaStatus(
      { ...createQuotaConfig(cacheFilePath), sessionId: "session-b" },
      {
        now: 1000 + REFRESH_TIERS[0].ttlMs,
        fetchImpl: async () => { calls++; return makeJsonResponse(successBody(85)); }
      }
    );

    const cached = await readCacheAt(cacheFilePath);
    assert.equal(calls, 1);
    assert.equal(cached.tierIndex, 0);
    assert.equal(cached.refreshCount, 1);
    assert.equal(cached.sessionId, "session-b");
  });
});

test("empty sessionId does not trigger session reset", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");

    // At tier 1, count=3 in session A
    await seedCache(cacheFilePath, { tierIndex: 1, refreshCount: 3, sessionId: "session-a" });

    // Call with empty sessionId
    const cached = await doRefresh(cacheFilePath, 85, "");

    assert.equal(cached.tierIndex, 1);
    assert.equal(cached.refreshCount, 4); // 3 + 1, same session logic
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test("old cache without tier fields defaults to tier 0", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await fs.writeFile(cacheFilePath, JSON.stringify({
      savedAt: 1000,
      lastAttemptAt: 1000,
      sessionId: "",
      result: { ...SUCCESS_RESULT }
    }));

    let calls = 0;

    // Within tier 0 TTL → no refresh
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1000 + REFRESH_TIERS[0].ttlMs - 1,
      fetchImpl: async () => { calls++; return makeJsonResponse(successBody()); }
    });
    assert.equal(calls, 0);

    // Past tier 0 TTL → refresh
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1000 + REFRESH_TIERS[0].ttlMs,
      fetchImpl: async () => { calls++; return makeJsonResponse(successBody()); }
    });
    assert.equal(calls, 1);

    const cached = await readCacheAt(cacheFilePath);
    assert.equal(cached.refreshCount, 1);
    assert.equal(cached.tierIndex, 0);
  });
});

test("rate limited response does not advance tier", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");

    // At tier 0, count=1
    await seedCache(cacheFilePath, { tierIndex: 0, refreshCount: 1 });

    // Fetch that returns rate limited
    const cached = await readCacheAt(cacheFilePath);
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: cached.lastAttemptAt + REFRESH_TIERS[0].ttlMs,
      fetchImpl: async () => makeJsonResponse({ code: 429, msg: "too many requests", success: false }, 429)
    });

    const updated = await readCacheAt(cacheFilePath);
    assert.equal(updated.refreshCount, 1);
    assert.equal(updated.tierIndex, 0);
    assert.equal(updated.result.leftPercent, 91); // old result preserved
  });
});
