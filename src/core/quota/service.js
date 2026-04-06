import {
  readCache,
  writeRateLimitedCache,
  writeSuccessCache
} from "./cache.js";
import { fetchQuota } from "./fetch.js";
import { parseQuotaResponse } from "./parse.js";
import {
  LOW_QUOTA_THRESHOLD,
  REFRESH_TIERS
} from "../../shared/constants.js";

function getCachedStatus(cached) {
  return cached?.result ?? { kind: "unavailable" };
}

function getEffectiveTtlMs(tierIndex, leftPercent) {
  if (Number.isFinite(leftPercent) && leftPercent < LOW_QUOTA_THRESHOLD) {
    return REFRESH_TIERS[0].ttlMs;
  }

  const tier = REFRESH_TIERS[tierIndex];
  return tier ? tier.ttlMs : REFRESH_TIERS[REFRESH_TIERS.length - 1].ttlMs;
}

function advanceTier(refreshCount, tierIndex) {
  const nextCount = refreshCount + 1;
  const tier = REFRESH_TIERS[tierIndex] ?? REFRESH_TIERS[REFRESH_TIERS.length - 1];

  if (nextCount >= tier.maxRefreshes && tierIndex < REFRESH_TIERS.length - 1) {
    return { refreshCount: 1, tierIndex: tierIndex + 1 };
  }

  return { refreshCount: nextCount, tierIndex };
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
  const tierIndex = cached?.tierIndex ?? 0;
  const leftPercent = cached?.result?.leftPercent;
  const effectiveTtlMs = getEffectiveTtlMs(tierIndex, leftPercent);

  const shouldRefresh = options.forceRefresh
    ? true
    : shouldRefreshQuota(cached, effectiveTtlMs, now, sessionId);

  if (!shouldRefresh) {
    return getCachedStatus(cached);
  }

  const response = await fetchQuota(config, fetchImpl);
  const parsed = parseQuotaResponse(response);

  if (parsed.kind === "success") {
    const isNewSession = Boolean(sessionId) && cached?.sessionId !== sessionId;
    const isLowQuota = Number.isFinite(parsed.leftPercent) && parsed.leftPercent < LOW_QUOTA_THRESHOLD;

    let nextTier;
    if (isNewSession) {
      nextTier = { refreshCount: 1, tierIndex: 0 };
    } else if (isLowQuota) {
      nextTier = { refreshCount: cached?.refreshCount ?? 0, tierIndex };
    } else {
      nextTier = advanceTier(cached?.refreshCount ?? 0, tierIndex);
    }

    await writeSuccessCache(config.cacheFilePath, parsed, {
      now,
      sessionId,
      refreshCount: nextTier.refreshCount,
      tierIndex: nextTier.tierIndex
    });
    return parsed;
  }

  if (parsed.kind === "auth_error") {
    return parsed;
  }

  if (parsed.kind === "rate_limited") {
    await writeRateLimitedCache(config.cacheFilePath, cached, {
      now,
      sessionId
    });
    return getCachedStatus(cached);
  }

  if (cached?.result) {
    return cached.result;
  }

  return parsed;
}
