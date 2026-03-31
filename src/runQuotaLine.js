import { readCache, readFreshCache, writeSuccessCache } from "./cache.js";
import { fetchQuota } from "./fetchQuota.js";
import { parseQuotaResponse } from "./parseQuota.js";

export async function runQuotaLine(config, options = {}) {
  const now = options.now ?? Date.now();
  const fetchImpl = options.fetchImpl;

  if (!config.authorization) {
    return { kind: "auth_error" };
  }

  const freshCache = await readFreshCache(
    config.cacheFilePath,
    config.cacheTtlMs,
    config.threadId,
    now
  );
  if (freshCache) {
    return freshCache.result;
  }

  const staleCache = await readCache(config.cacheFilePath);
  const response = await fetchQuota(config, fetchImpl);
  const parsed = parseQuotaResponse(response);

  if (parsed.kind === "success") {
    await writeSuccessCache(config.cacheFilePath, parsed, config.threadId, now);
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
