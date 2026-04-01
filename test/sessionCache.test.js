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

function createQuotaConfig(cacheFilePath, authorization = "token") {
  return {
    quotaUrl: "https://bigmodel.cn/api/monitor/usage/quota/limit",
    authorization,
    timeoutMs: 5000,
    cacheTtlMs: 300_000,
    cacheFilePath
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

test("new Claude sessions bypass fresh cache and refresh the quota snapshot", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await fs.writeFile(
      cacheFilePath,
      JSON.stringify(
        {
          savedAt: 1774936504000,
          sessionId: "session-old",
          result: {
            kind: "success",
            level: "lite",
            display: "percent",
            leftPercent: 88,
            usedPercent: 12,
            nextResetTime: 1774939627716
          }
        },
        null,
        2
      )
    );

    let fetchCalls = 0;
    const result = await resolveQuotaStatus(
      {
        ...createQuotaConfig(cacheFilePath),
        sessionId: "session-new"
      },
      {
        now: 1774936505000,
        fetchImpl: async () => {
          fetchCalls += 1;
          return makeJsonResponse(SUCCESS_BODY);
        }
      }
    );

    const cached = JSON.parse(await fs.readFile(cacheFilePath, "utf8"));
    assert.equal(fetchCalls, 1);
    assert.equal(result.leftPercent, 91);
    assert.equal(cached.sessionId, "session-new");
  });
});
