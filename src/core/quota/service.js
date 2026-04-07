import {
  readCache,
  writeFailureCache,
  writeSuccessCache
} from "./cache.js";
import { fetchQuota } from "./fetch.js";
import { parseQuotaResponse } from "./parse.js";
import {
  RATE_LIMIT_RETRY_TTL_MS,
  REFRESH_BANDS,
  UNAVAILABLE_RETRY_TTL_MS
} from "../../shared/constants.js";

function getCachedStatus(cached) {
  return cached?.result ?? { kind: "unavailable" };
}

function getRefreshTtlMs(leftPercent) {
  if (!Number.isFinite(leftPercent)) {
    return REFRESH_BANDS[1].ttlMs;
  }

  const matchedBand = REFRESH_BANDS.find((band) => leftPercent >= band.minLeftPercent);
  return matchedBand ? matchedBand.ttlMs : REFRESH_BANDS[REFRESH_BANDS.length - 1].ttlMs;
}

function getEffectiveTtlMs(cached) {
  if (cached?.lastFailureKind === "rate_limited") {
    return RATE_LIMIT_RETRY_TTL_MS;
  }

  if (cached?.lastFailureKind === "unavailable") {
    return UNAVAILABLE_RETRY_TTL_MS;
  }

  return getRefreshTtlMs(cached?.result?.leftPercent);
}

function shouldRefreshQuota(cached, cacheTtlMs, now, sessionId) {
  if (!cached) {
    return true;
  }

  if (sessionId && cached.sessionId !== sessionId) {
    return true;
  }

  if (cached.lastAttemptAt === null || now - cached.lastAttemptAt >= cacheTtlMs) {
    return true;
  }

  return false;
}

export async function resolveQuotaStatus(config, options = {}) {
  const now = options.now ?? Date.now();
  const fetchImpl = options.fetchImpl;
  const sessionId = config.sessionId || "";

  if (!config.authorization) {
    return { kind: "auth_error" };
  }

  const cached = await readCache(config.cacheFilePath);
  const effectiveTtlMs = getEffectiveTtlMs(cached);

  const shouldRefresh = options.forceRefresh
    ? true
    : shouldRefreshQuota(cached, effectiveTtlMs, now, sessionId);

  if (!shouldRefresh) {
    return getCachedStatus(cached);
  }

  const response = await fetchQuota(config, fetchImpl);
  const parsed = parseQuotaResponse(response);

  if (parsed.kind === "success") {
    await writeSuccessCache(config.cacheFilePath, parsed, {
      now,
      sessionId
    });
    return parsed;
  }

  if (parsed.kind === "auth_error") {
    return parsed;
  }

  if (parsed.kind === "rate_limited") {
    await writeFailureCache(config.cacheFilePath, cached, {
      now,
      sessionId,
      failureKind: "rate_limited"
    });
    return getCachedStatus(cached);
  }

  if (cached?.result) {
    await writeFailureCache(config.cacheFilePath, cached, {
      now,
      sessionId,
      failureKind: "unavailable"
    });
    return cached.result;
  }

  await writeFailureCache(config.cacheFilePath, cached, {
    now,
    sessionId,
    failureKind: "unavailable"
  });
  return parsed;
}
