import {
  readCache,
  writeRateLimitedCache,
  writeSkippedTokenTriggerCache,
  writeSuccessCache
} from "./cache.js";
import { fetchQuota } from "./fetch.js";
import { parseQuotaResponse } from "./parse.js";

const TOKEN_REFRESH_THRESHOLD = 300_000;

function normalizeObservedTokens(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function getCachedStatus(cached) {
  return cached?.result ?? { kind: "unavailable" };
}

function shouldRefreshQuota(cached, cacheTtlMs, now, sessionId, observedTokens) {
  if (!cached) {
    return { kind: "fetch" };
  }

  if (sessionId && cached.sessionId !== sessionId) {
    return { kind: "fetch" };
  }

  if (cached.lastAttemptAt === null || now - cached.lastAttemptAt >= cacheTtlMs) {
    return { kind: "fetch" };
  }

  if (observedTokens === null || cached.lastObservedTokensAtFetch === null) {
    return { kind: "cache" };
  }

  if (observedTokens - cached.lastObservedTokensAtFetch < TOKEN_REFRESH_THRESHOLD) {
    return { kind: "cache" };
  }

  if (cached.skipNextTokenTrigger) {
    return { kind: "skip_token_trigger" };
  }

  return { kind: "fetch" };
}

export async function resolveQuotaStatus(config, options = {}) {
  const now = options.now ?? Date.now();
  const fetchImpl = options.fetchImpl;
  const sessionId = config.sessionId || "";
  const observedTokens = normalizeObservedTokens(config.observedTokens);

  if (!config.authorization) {
    return { kind: "auth_error" };
  }

  const cached = await readCache(config.cacheFilePath);
  const refreshDecision = options.forceRefresh
    ? { kind: "fetch" }
    : shouldRefreshQuota(cached, config.cacheTtlMs, now, sessionId, observedTokens);

  if (refreshDecision.kind === "cache") {
    return getCachedStatus(cached);
  }

  if (refreshDecision.kind === "skip_token_trigger") {
    await writeSkippedTokenTriggerCache(config.cacheFilePath, cached, {
      sessionId,
      observedTokens
    });
    return getCachedStatus(cached);
  }

  const response = await fetchQuota(config, fetchImpl);
  const parsed = parseQuotaResponse(response);

  if (parsed.kind === "success") {
    await writeSuccessCache(config.cacheFilePath, parsed, {
      now,
      sessionId,
      observedTokens
    });
    return parsed;
  }

  if (parsed.kind === "auth_error") {
    return parsed;
  }

  if (parsed.kind === "rate_limited") {
    await writeRateLimitedCache(config.cacheFilePath, cached, {
      now,
      sessionId,
      observedTokens
    });
    return getCachedStatus(cached);
  }

  if (cached?.result) {
    return cached.result;
  }

  return parsed;
}
