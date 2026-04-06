import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { resolveQuotaStatus } from "../src/core/quota/service.js";
import { createQuotaConfig, makeJsonResponse, withTempDir } from "./helpers.js";

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
