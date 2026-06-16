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
  STALE_SUCCESS_MAX_AGE_MS,
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

// A cached success value bridges transient failures only while it is still
// fresh. Once it is older than STALE_SUCCESS_MAX_AGE_MS we stop masking the
// real (unavailable) state — otherwise an exhausted quota freezes the status
// bar at the pre-exhaustion percentage indefinitely.
function isStaleSuccessUsable(cached, now) {
  if (!cached?.result || !Number.isFinite(cached.savedAt)) {
    return false;
  }
  return now - cached.savedAt < STALE_SUCCESS_MAX_AGE_MS;
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
    // GLM signals quota exhaustion as HTTP 429, indistinguishable from a
    // genuine rate limit. Bridge with the stale value only while it is still
    // fresh; a sustained 429 past the stale window must surface the real
    // state rather than freeze the bar at a pre-exhaustion percentage.
    await writeFailureCache(config.cacheFilePath, cached, {
      now,
      sessionId,
      failureKind: "rate_limited"
    });
    if (isStaleSuccessUsable(cached, now)) {
      return cached.result;
    }
    // Stale value expired (or never existed). With an expired cache we must
    // NOT return the frozen old value — surface the real `rate_limited`.
    // With no prior cache at all, fall back to `unavailable` to preserve the
    // first-run contract (no quota has ever been seen).
    return cached?.result ? parsed : getCachedStatus(cached);
  }

  // Sustained unavailability: bridge with the stale success value only while
  // it is still fresh. Past the stale window, surface the real state so a
  // truly exhausted quota is not hidden behind a frozen old percentage.
  if (isStaleSuccessUsable(cached, now)) {
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
