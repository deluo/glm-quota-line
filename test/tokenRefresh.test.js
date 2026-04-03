import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveQuotaStatus } from "../src/core/quota/service.js";

const SUCCESS_BODY = {
  code: 200,
  msg: "ok",
  data: {
    limits: [
      {
        type: "TOKENS_LIMIT",
        unit: 3,
        number: 5,
        percentage: 9,
        nextResetTime: 1774939627716
      }
    ],
    level: "lite"
  },
  success: true
};

function createQuotaConfig(cacheFilePath, overrides = {}) {
  return {
    quotaUrl: "https://bigmodel.cn/api/monitor/usage/quota/limit",
    authorization: "token",
    timeoutMs: 5000,
    cacheTtlMs: 300_000,
    cacheFilePath,
    sessionId: "session-a",
    ...overrides
  };
}

async function withTempDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "glm-quota-line-"));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function makeJsonResponse(body, status = 200) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    }
  };
}

function makeTextResponse(text, status = 200) {
  return {
    status,
    async text() {
      return text;
    }
  };
}

async function seedCache(cacheFilePath, overrides = {}) {
  await fs.writeFile(
    cacheFilePath,
    JSON.stringify(
      {
        savedAt: 1_000,
        lastAttemptAt: 1_000,
        sessionId: "session-a",
        lastObservedTokensAtFetch: 100_000,
        result: {
          kind: "success",
          level: "lite",
          display: "percent",
          leftPercent: 88,
          usedPercent: 12,
          nextResetTime: 1774939627716
        },
        ...overrides
      },
      null,
      2
    )
  );
}

test("token delta below threshold reuses cache within ttl", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath);

    let fetchCalls = 0;
    const result = await resolveQuotaStatus(
      createQuotaConfig(cacheFilePath, { observedTokens: 399_999 }),
      {
        now: 60_000,
        fetchImpl: async () => {
          fetchCalls += 1;
          return makeJsonResponse(SUCCESS_BODY);
        }
      }
    );

    assert.equal(fetchCalls, 0);
    assert.equal(result.leftPercent, 88);
  });
});

test("token delta at threshold refreshes quota before ttl expires", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath);

    let fetchCalls = 0;
    const result = await resolveQuotaStatus(
      createQuotaConfig(cacheFilePath, { observedTokens: 400_000 }),
      {
        now: 60_000,
        fetchImpl: async () => {
          fetchCalls += 1;
          return makeJsonResponse(SUCCESS_BODY);
        }
      }
    );

    const cached = JSON.parse(await fs.readFile(cacheFilePath, "utf8"));
    assert.equal(fetchCalls, 1);
    assert.equal(result.leftPercent, 91);
    assert.equal(cached.lastObservedTokensAtFetch, 400_000);
    assert.equal(cached.lastAttemptAt, 60_000);
  });
});

test("ttl fallback refreshes quota when token delta stays below threshold", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath);

    let fetchCalls = 0;
    const result = await resolveQuotaStatus(
      createQuotaConfig(cacheFilePath, { observedTokens: 250_000 }),
      {
        now: 301_000,
        fetchImpl: async () => {
          fetchCalls += 1;
          return makeJsonResponse(SUCCESS_BODY);
        }
      }
    );

    assert.equal(fetchCalls, 1);
    assert.equal(result.leftPercent, 91);
  });
});

test("rate-limited responses keep stale cache and arm token-trigger skip", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath);

    let fetchCalls = 0;
    const result = await resolveQuotaStatus(
      createQuotaConfig(cacheFilePath, { observedTokens: 400_000 }),
      {
        now: 60_000,
        fetchImpl: async () => {
          fetchCalls += 1;
          return makeTextResponse("Too Many Requests", 429);
        }
      }
    );

    const cached = JSON.parse(await fs.readFile(cacheFilePath, "utf8"));
    assert.equal(fetchCalls, 1);
    assert.equal(result.leftPercent, 88);
    assert.equal(cached.lastAttemptAt, 60_000);
    assert.equal(cached.lastObservedTokensAtFetch, 400_000);
    assert.equal(cached.skipNextTokenTrigger, true);
  });
});

test("next token threshold is skipped once after rate limit, then token refresh resumes", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath);

    let fetchCalls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath, { observedTokens: 400_000 }), {
      now: 60_000,
      fetchImpl: async () => {
        fetchCalls += 1;
        return makeTextResponse("Too Many Requests", 429);
      }
    });

    const skipped = await resolveQuotaStatus(
      createQuotaConfig(cacheFilePath, { observedTokens: 700_000 }),
      {
        now: 120_000,
        fetchImpl: async () => {
          fetchCalls += 1;
          return makeJsonResponse(SUCCESS_BODY);
        }
      }
    );

    const afterSkip = JSON.parse(await fs.readFile(cacheFilePath, "utf8"));
    assert.equal(fetchCalls, 1);
    assert.equal(skipped.leftPercent, 88);
    assert.equal(Boolean(afterSkip.skipNextTokenTrigger), false);
    assert.equal(afterSkip.lastObservedTokensAtFetch, 700_000);

    const refreshed = await resolveQuotaStatus(
      createQuotaConfig(cacheFilePath, { observedTokens: 1_000_000 }),
      {
        now: 180_000,
        fetchImpl: async () => {
          fetchCalls += 1;
          return makeJsonResponse(SUCCESS_BODY);
        }
      }
    );

    assert.equal(fetchCalls, 2);
    assert.equal(refreshed.leftPercent, 91);
  });
});

test("ttl fallback still retries after a rate-limited response", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath);

    let fetchCalls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath, { observedTokens: 400_000 }), {
      now: 60_000,
      fetchImpl: async () => {
        fetchCalls += 1;
        return makeTextResponse("Too Many Requests", 429);
      }
    });

    const result = await resolveQuotaStatus(
      createQuotaConfig(cacheFilePath, { observedTokens: 450_000 }),
      {
        now: 360_001,
        fetchImpl: async () => {
          fetchCalls += 1;
          return makeJsonResponse(SUCCESS_BODY);
        }
      }
    );

    assert.equal(fetchCalls, 2);
    assert.equal(result.leftPercent, 91);
  });
});

test("missing token stats fall back to ttl-only refresh logic", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath);

    let fetchCalls = 0;
    const cachedResult = await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 60_000,
      fetchImpl: async () => {
        fetchCalls += 1;
        return makeJsonResponse(SUCCESS_BODY);
      }
    });

    const refreshedResult = await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 301_000,
      fetchImpl: async () => {
        fetchCalls += 1;
        return makeJsonResponse(SUCCESS_BODY);
      }
    });

    assert.equal(fetchCalls, 1);
    assert.equal(cachedResult.leftPercent, 88);
    assert.equal(refreshedResult.leftPercent, 91);
  });
});
