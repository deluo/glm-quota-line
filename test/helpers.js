import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function withTempDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "glm-quota-line-"));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export function createQuotaConfig(cacheFilePath, authorization = "token") {
  return {
    quotaUrl: "https://bigmodel.cn/api/monitor/usage/quota/limit",
    authorization,
    timeoutMs: 5000,
    cacheTtlMs: 600_000,
    cacheFilePath
  };
}

export function makeJsonResponse(body, status = 200) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    }
  };
}
