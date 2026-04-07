import fs from "node:fs/promises";
import path from "node:path";

import { asFiniteNumber } from "./parse.js";

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

function normalizeCache(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const result = isSuccessCacheShape(parsed.result) ? parsed.result : null;
  const savedAt = asFiniteNumber(parsed.savedAt);
  const lastAttemptAt = asFiniteNumber(parsed.lastAttemptAt) ?? savedAt;
  const sessionId = typeof parsed.sessionId === "string" ? parsed.sessionId : "";
  const lastFailureKind =
    parsed.lastFailureKind === "rate_limited" || parsed.lastFailureKind === "unavailable"
      ? parsed.lastFailureKind
      : null;

  if (result && savedAt === null) {
    return null;
  }

  if (!result && savedAt === null && lastAttemptAt === null) {
    return null;
  }

  return {
    savedAt,
    lastAttemptAt,
    sessionId,
    lastFailureKind,
    result
  };
}

async function writeCache(cacheFilePath, cache) {
  const payload = JSON.stringify(
    {
      ...(Number.isFinite(cache.savedAt) ? { savedAt: cache.savedAt } : {}),
      ...(Number.isFinite(cache.lastAttemptAt) ? { lastAttemptAt: cache.lastAttemptAt } : {}),
      ...(cache.sessionId ? { sessionId: cache.sessionId } : {}),
      ...(cache.lastFailureKind ? { lastFailureKind: cache.lastFailureKind } : {}),
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
    lastFailureKind: null,
    result
  });
}

export async function writeFailureCache(cacheFilePath, cached, options = {}) {
  const now = options.now ?? Date.now();

  await writeCache(cacheFilePath, {
    savedAt: cached?.savedAt ?? null,
    lastAttemptAt: now,
    sessionId: options.sessionId || cached?.sessionId || "",
    lastFailureKind: options.failureKind || "unavailable",
    result: cached?.result ?? null
  });
}
