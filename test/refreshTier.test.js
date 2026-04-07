import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { resolveQuotaStatus } from "../src/core/quota/service.js";
import { createQuotaConfig, makeJsonResponse, withTempDir } from "./helpers.js";
import {
  RATE_LIMIT_RETRY_TTL_MS,
  REFRESH_BANDS,
  UNAVAILABLE_RETRY_TTL_MS
} from "../src/shared/constants.js";

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

function getTtl(leftPercent) {
  if (!Number.isFinite(leftPercent)) {
    return REFRESH_BANDS[1].ttlMs;
  }
  const matchedBand = REFRESH_BANDS.find((band) => leftPercent >= band.minLeftPercent);
  return matchedBand ? matchedBand.ttlMs : REFRESH_BANDS[REFRESH_BANDS.length - 1].ttlMs;
}

function readCacheAt(cacheFilePath) {
  return fs.readFile(cacheFilePath, "utf8").then((raw) => JSON.parse(raw));
}

async function seedCache(
  cacheFilePath,
  { leftPercent = 91, sessionId = "", lastAttemptAt = 1000, lastFailureKind = null } = {}
) {
  await fs.writeFile(
    cacheFilePath,
    JSON.stringify(
      {
        savedAt: lastAttemptAt,
        lastAttemptAt,
        sessionId,
        ...(lastFailureKind ? { lastFailureKind } : {}),
        result: { ...SUCCESS_RESULT, leftPercent, usedPercent: 100 - leftPercent }
      },
      null,
      2
    )
  );
}

test("first fetch writes a success cache snapshot", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");

    const result = await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1000,
      fetchImpl: async () => makeJsonResponse(successBody(91))
    });

    const cached = await readCacheAt(cacheFilePath);
    assert.equal(result.leftPercent, 91);
    assert.equal(cached.result.leftPercent, 91);
    assert.equal(cached.lastAttemptAt, 1000);
    assert.equal("lastFailureKind" in cached, false);
  });
});

test("high quota refreshes after 2 minutes", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath, { leftPercent: 91 });
    const ttl = getTtl(91);

    let calls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1000 + ttl - 1,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(90));
      }
    });
    assert.equal(calls, 0);

    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1000 + ttl,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(90));
      }
    });
    assert.equal(calls, 1);
  });
});

test("middle quota refreshes after 5 minutes", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath, { leftPercent: 50 });
    const ttl = getTtl(50);

    let calls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1000 + ttl - 1,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(49));
      }
    });
    assert.equal(calls, 0);

    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1000 + ttl,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(49));
      }
    });
    assert.equal(calls, 1);
  });
});

test("low quota refreshes after 2 minutes", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath, { leftPercent: 20 });
    const ttl = getTtl(20);

    let calls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1000 + ttl - 1,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(19));
      }
    });
    assert.equal(calls, 0);

    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1000 + ttl,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(19));
      }
    });
    assert.equal(calls, 1);
  });
});

test("new session bypasses a fresh cache snapshot", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath, { leftPercent: 91, sessionId: "session-a" });

    let calls = 0;
    await resolveQuotaStatus(
      { ...createQuotaConfig(cacheFilePath), sessionId: "session-b" },
      {
        now: 1000 + 1,
        fetchImpl: async () => {
          calls += 1;
          return makeJsonResponse(successBody(85));
        }
      }
    );

    const cached = await readCacheAt(cacheFilePath);
    assert.equal(calls, 1);
    assert.equal(cached.result.leftPercent, 85);
    assert.equal(cached.sessionId, "session-b");
  });
});

test("empty sessionId does not bypass a fresh cache snapshot", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath, { leftPercent: 91, sessionId: "session-a" });

    let calls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1000 + 1,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(85));
      }
    });
    assert.equal(calls, 0);
  });
});

test("old cache without failure metadata still uses quota-based ttl", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await fs.writeFile(
      cacheFilePath,
      JSON.stringify(
        {
          savedAt: 1000,
          lastAttemptAt: 1000,
          sessionId: "",
          result: { ...SUCCESS_RESULT, leftPercent: 50, usedPercent: 50 }
        },
        null,
        2
      )
    );

    let calls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1000 + getTtl(50) - 1,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(49));
      }
    });
    assert.equal(calls, 0);

    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1000 + getTtl(50),
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(49));
      }
    });
    assert.equal(calls, 1);
  });
});

test("rate limited response keeps stale quota and retries after 3 minutes", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath, { leftPercent: 50 });

    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1000 + getTtl(50),
      fetchImpl: async () => makeJsonResponse({ code: 429, msg: "too many requests", success: false }, 429)
    });

    const failedCache = await readCacheAt(cacheFilePath);
    assert.equal(failedCache.result.leftPercent, 50);
    assert.equal(failedCache.lastFailureKind, "rate_limited");

    let calls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: failedCache.lastAttemptAt + RATE_LIMIT_RETRY_TTL_MS - 1,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(49));
      }
    });
    assert.equal(calls, 0);

    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: failedCache.lastAttemptAt + RATE_LIMIT_RETRY_TTL_MS,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(49));
      }
    });
    assert.equal(calls, 1);
  });
});

test("band boundaries produce correct TTLs", () => {
  assert.equal(getTtl(100), REFRESH_BANDS[0].ttlMs);  // 2 min
  assert.equal(getTtl(80), REFRESH_BANDS[0].ttlMs);    // 2 min (boundary inclusive)
  assert.equal(getTtl(79), REFRESH_BANDS[1].ttlMs);    // 5 min
  assert.equal(getTtl(30), REFRESH_BANDS[1].ttlMs);    // 5 min (boundary inclusive)
  assert.equal(getTtl(29), REFRESH_BANDS[2].ttlMs);    // 2 min
  assert.equal(getTtl(0), REFRESH_BANDS[2].ttlMs);     // 2 min (boundary inclusive)
  assert.equal(getTtl(-1), REFRESH_BANDS[2].ttlMs);    // 2 min (below zero falls to last band)
  assert.equal(getTtl(NaN), REFRESH_BANDS[1].ttlMs);   // 5 min (non-finite default)
  assert.equal(getTtl(Infinity), REFRESH_BANDS[1].ttlMs); // 5 min (non-finite default)
});

test("quota drop from high to critical transitions TTL correctly", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath, { leftPercent: 91, lastAttemptAt: 0 });

    // High quota (91) → 2-min TTL
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: getTtl(91),
      fetchImpl: async () => makeJsonResponse(successBody(50))
    });

    // Medium quota (50) → 5-min TTL
    let calls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: getTtl(91) + getTtl(50) - 1,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(20));
      }
    });
    assert.equal(calls, 0);

    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: getTtl(91) + getTtl(50),
      fetchImpl: async () => makeJsonResponse(successBody(20))
    });

    // Low quota (20) → 2-min TTL
    const cached = await readCacheAt(cacheFilePath);
    assert.equal(cached.result.leftPercent, 20);

    calls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: cached.lastAttemptAt + getTtl(20) - 1,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(5));
      }
    });
    assert.equal(calls, 0);

    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: cached.lastAttemptAt + getTtl(20),
      fetchImpl: async () => makeJsonResponse(successBody(5))
    });

    // Low quota (5) → 2-min TTL
    const cached2 = await readCacheAt(cacheFilePath);
    assert.equal(cached2.result.leftPercent, 5);

    calls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: cached2.lastAttemptAt + getTtl(5) - 1,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(3));
      }
    });
    assert.equal(calls, 0);

    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: cached2.lastAttemptAt + getTtl(5),
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(3));
      }
    });
    assert.equal(calls, 1);
  });
});

test("success after rate_limited clears failure state and uses quota-based TTL", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath, { leftPercent: 50 });

    // Trigger rate_limited
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1000 + getTtl(50),
      fetchImpl: async () => makeJsonResponse({ code: 429, msg: "too many requests", success: false }, 429)
    });

    const failedCache = await readCacheAt(cacheFilePath);
    assert.equal(failedCache.lastFailureKind, "rate_limited");

    // After retry TTL, succeed
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: failedCache.lastAttemptAt + RATE_LIMIT_RETRY_TTL_MS,
      fetchImpl: async () => makeJsonResponse(successBody(85))
    });

    const recoveredCache = await readCacheAt(cacheFilePath);
    assert.equal(recoveredCache.result.leftPercent, 85);
    assert.equal("lastFailureKind" in recoveredCache, false);

    // Next refresh uses quota-based TTL (85 → 2 min), not rate-limited retry (3 min)
    let calls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: recoveredCache.lastAttemptAt + getTtl(85) - 1,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(80));
      }
    });
    assert.equal(calls, 0);

    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: recoveredCache.lastAttemptAt + getTtl(85),
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(80));
      }
    });
    assert.equal(calls, 1);
  });
});

test("failure type changes from unavailable to rate_limited and uses correct retry TTL", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath, { leftPercent: 50 });

    // First: unavailable (malformed response)
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1000 + getTtl(50),
      fetchImpl: async () => ({ status: 200, async text() { return "bad"; } })
    });

    const cache1 = await readCacheAt(cacheFilePath);
    assert.equal(cache1.lastFailureKind, "unavailable");

    // Retries after unavailable TTL
    let calls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: cache1.lastAttemptAt + UNAVAILABLE_RETRY_TTL_MS,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse({ code: 429, msg: "too many requests", success: false }, 429);
      }
    });
    assert.equal(calls, 1);

    const cache2 = await readCacheAt(cacheFilePath);
    assert.equal(cache2.lastFailureKind, "rate_limited");

    // Now uses rate_limited retry TTL (3 min), not unavailable (2 min)
    calls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: cache2.lastAttemptAt + UNAVAILABLE_RETRY_TTL_MS - 1,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(49));
      }
    });
    assert.equal(calls, 0);

    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: cache2.lastAttemptAt + RATE_LIMIT_RETRY_TTL_MS,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(49));
      }
    });
    assert.equal(calls, 1);
  });
});

test("first-run rate limited writes failure cache with no result", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");

    const result = await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1000,
      fetchImpl: async () => makeJsonResponse({ code: 429, msg: "too many requests", success: false }, 429)
    });

    assert.equal(result.kind, "unavailable");

    const cached = await readCacheAt(cacheFilePath);
    assert.equal(cached.lastFailureKind, "rate_limited");
    assert.equal(cached.result, undefined);

    // Should retry after rate_limit TTL
    let calls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: cached.lastAttemptAt + RATE_LIMIT_RETRY_TTL_MS - 1,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(91));
      }
    });
    assert.equal(calls, 0);

    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: cached.lastAttemptAt + RATE_LIMIT_RETRY_TTL_MS,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(91));
      }
    });
    assert.equal(calls, 1);
  });
});

test("unavailable response keeps stale quota and retries after 2 minutes", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await seedCache(cacheFilePath, { leftPercent: 50 });

    const result = await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1000 + getTtl(50),
      fetchImpl: async () => ({
        status: 200,
        async text() {
          return "not-json";
        }
      })
    });

    const failedCache = await readCacheAt(cacheFilePath);
    assert.equal(result.leftPercent, 50);
    assert.equal(failedCache.result.leftPercent, 50);
    assert.equal(failedCache.lastFailureKind, "unavailable");

    let calls = 0;
    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: failedCache.lastAttemptAt + UNAVAILABLE_RETRY_TTL_MS - 1,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(49));
      }
    });
    assert.equal(calls, 0);

    await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: failedCache.lastAttemptAt + UNAVAILABLE_RETRY_TTL_MS,
      fetchImpl: async () => {
        calls += 1;
        return makeJsonResponse(successBody(49));
      }
    });
    assert.equal(calls, 1);
  });
});
