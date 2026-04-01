import { readCache, readFreshCache, writeSuccessCache } from "./cache.js";
import { fetchQuota } from "./fetch.js";
import { parseQuotaResponse } from "./parse.js";

export async function resolveQuotaStatus(config, options = {}) {
  const now = options.now ?? Date.now();
  const fetchImpl = options.fetchImpl;
  const sessionId = config.sessionId || "";

  if (!config.authorization) {
    return { kind: "auth_error" };
  }

  const freshCache = await readFreshCache(config.cacheFilePath, config.cacheTtlMs, now, sessionId);
  if (freshCache) {
    return freshCache.result;
  }

  const staleCache = await readCache(config.cacheFilePath);
  const response = await fetchQuota(config, fetchImpl);
  const parsed = parseQuotaResponse(response);

  if (parsed.kind === "success") {
    await writeSuccessCache(config.cacheFilePath, parsed, now, sessionId);
    return parsed;
  }

  if (parsed.kind === "auth_error") {
    return parsed;
  }

  if (staleCache) {
    return staleCache.result;
  }

  return parsed;
}
