import fs from "node:fs/promises";
import path from "node:path";

function isValidQuotaShape(value) {
  if (!value || typeof value.key !== "string") {
    return false;
  }

  if (!Number.isFinite(value.leftPercent)) {
    return false;
  }

  if (!Number.isFinite(value.usedPercent)) {
    return false;
  }

  if ("nextResetTime" in value && !Number.isFinite(value.nextResetTime)) {
    return false;
  }

  return true;
}

function isLegacyPercentSuccessCacheShape(value) {
  if (!value || value.kind !== "success" || typeof value.level !== "string") {
    return false;
  }

  if (value.display !== "percent") {
    return false;
  }

  if (!Number.isFinite(value.leftPercent)) {
    return false;
  }

  if ("usedPercent" in value && !Number.isFinite(value.usedPercent)) {
    return false;
  }

  if ("nextResetTime" in value && !Number.isFinite(value.nextResetTime)) {
    return false;
  }

  return true;
}

function isMultiQuotaSuccessCacheShape(value) {
  if (!value || value.kind !== "success" || typeof value.level !== "string") {
    return false;
  }

  if (!Array.isArray(value.quotas) || value.quotas.length === 0) {
    return false;
  }

  if (!value.quotas.every(isValidQuotaShape)) {
    return false;
  }

  if ("primaryQuotaKey" in value && typeof value.primaryQuotaKey !== "string") {
    return false;
  }

  return true;
}

function isSuccessCacheShape(value) {
  return isMultiQuotaSuccessCacheShape(value) || isLegacyPercentSuccessCacheShape(value);
}

function asFiniteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function normalizeCache(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const result = isSuccessCacheShape(parsed.result) ? parsed.result : null;
  const savedAt = asFiniteNumber(parsed.savedAt);
  const lastAttemptAt = asFiniteNumber(parsed.lastAttemptAt) ?? savedAt;
  const lastObservedTokensAtFetch = asFiniteNumber(parsed.lastObservedTokensAtFetch);
  const sessionId = typeof parsed.sessionId === "string" ? parsed.sessionId : "";
  const skipNextTokenTrigger = parsed.skipNextTokenTrigger === true;

  if (result && savedAt === null) {
    return null;
  }

  if (!result && savedAt === null && lastAttemptAt === null) {
    return null;
  }

  return {
    savedAt,
    lastAttemptAt,
    lastObservedTokensAtFetch,
    sessionId,
    skipNextTokenTrigger,
    result
  };
}

async function writeCache(cacheFilePath, cache) {
  const payload = JSON.stringify(
    {
      ...(Number.isFinite(cache.savedAt) ? { savedAt: cache.savedAt } : {}),
      ...(Number.isFinite(cache.lastAttemptAt) ? { lastAttemptAt: cache.lastAttemptAt } : {}),
      ...(cache.sessionId ? { sessionId: cache.sessionId } : {}),
      ...(Number.isFinite(cache.lastObservedTokensAtFetch)
        ? { lastObservedTokensAtFetch: cache.lastObservedTokensAtFetch }
        : {}),
      ...(cache.skipNextTokenTrigger ? { skipNextTokenTrigger: true } : {}),
      ...(cache.result ? { result: cache.result } : {})
    },
    null,
    2
  );

  await fs.mkdir(path.dirname(cacheFilePath), { recursive: true });
  await fs.writeFile(cacheFilePath, payload, "utf8");
}

export async function readCache(cacheFilePath) {
  try {
    const raw = await fs.readFile(cacheFilePath, "utf8");
    return normalizeCache(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeSuccessCache(cacheFilePath, result, options = {}) {
  const now = options.now ?? Date.now();

  await writeCache(cacheFilePath, {
    savedAt: now,
    lastAttemptAt: now,
    sessionId: options.sessionId || "",
    lastObservedTokensAtFetch: asFiniteNumber(options.observedTokens),
    skipNextTokenTrigger: false,
    result
  });
}

export async function writeRateLimitedCache(cacheFilePath, cached, options = {}) {
  const now = options.now ?? Date.now();

  await writeCache(cacheFilePath, {
    savedAt: cached?.savedAt ?? null,
    lastAttemptAt: now,
    sessionId: options.sessionId || cached?.sessionId || "",
    lastObservedTokensAtFetch:
      asFiniteNumber(options.observedTokens) ?? cached?.lastObservedTokensAtFetch ?? null,
    skipNextTokenTrigger: true,
    result: cached?.result ?? null
  });
}

export async function writeSkippedTokenTriggerCache(cacheFilePath, cached, options = {}) {
  await writeCache(cacheFilePath, {
    savedAt: cached?.savedAt ?? null,
    lastAttemptAt: cached?.lastAttemptAt ?? null,
    sessionId: options.sessionId || cached?.sessionId || "",
    lastObservedTokensAtFetch:
      asFiniteNumber(options.observedTokens) ?? cached?.lastObservedTokensAtFetch ?? null,
    skipNextTokenTrigger: false,
    result: cached?.result ?? null
  });
}
