import fs from "node:fs/promises";
import path from "node:path";

import { asFiniteNumber, getCacheRoot } from "../../shared/utils.js";

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

async function readExistingCache(cacheFilePath) {
  try {
    const raw = await fs.readFile(cacheFilePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeCache(cacheFilePath, cache) {
  const existing = await readExistingCache(cacheFilePath);
  const ctx = cache.ctx || (existing?.ctx) || undefined;

  const payload = JSON.stringify(
    {
      ...(Number.isFinite(cache.savedAt) ? { savedAt: cache.savedAt } : {}),
      ...(Number.isFinite(cache.lastAttemptAt) ? { lastAttemptAt: cache.lastAttemptAt } : {}),
      ...(cache.sessionId ? { sessionId: cache.sessionId } : {}),
      ...(cache.lastFailureKind ? { lastFailureKind: cache.lastFailureKind } : {}),
      ...(cache.result ? { result: cache.result } : {}),
      ...(ctx ? { ctx } : {})
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

/**
 * 清理过期的缓存文件
 * @param {Object} options - 清理选项
 * @param {number} options.maxAgeMs - 缓存文件最大保留时间（毫秒），默认 30 天
 * @param {number} options.now - 当前时间戳（用于测试）
 * @param {Function} options.getCacheRoot - 获取缓存目录的函数（用于测试）
 * @returns {Object} 清理结果统计
 */
export async function cleanupExpiredCache(options = {}) {
  const maxAgeMs = options.maxAgeMs ?? 30 * 24 * 60 * 60 * 1000;
  const now = options.now ?? Date.now();
  const getCacheRootFn = options.getCacheRoot ?? getCacheRoot;
  const cacheDir = path.join(getCacheRootFn(), "glm-quota-line");

  try {
    const entries = await fs.readdir(cacheDir, { withFileTypes: true });

    let deletedCount = 0;
    let totalSize = 0;
    const errors = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith("cache-") || !entry.name.endsWith(".json")) {
        continue;
      }

      const filePath = path.join(cacheDir, entry.name);

      try {
        const stats = await fs.stat(filePath);

        // Fast path: if mtime is recent enough, skip file read entirely
        if (now - stats.mtimeMs <= maxAgeMs) {
          continue;
        }

        // Slow path: check internal timestamp for accurate age
        let cacheAge = now - stats.mtimeMs;

        try {
          const raw = await fs.readFile(filePath, "utf8");
          const parsed = JSON.parse(raw);
          const savedAt = asFiniteNumber(parsed.savedAt) ?? asFiniteNumber(parsed.lastAttemptAt);

          if (savedAt !== null) {
            cacheAge = now - savedAt;
          }
        } catch {
          // parse failure — use mtime age already set above
        }

        if (cacheAge > maxAgeMs) {
          totalSize += stats.size;
          await fs.unlink(filePath);
          deletedCount++;
        }
      } catch (error) {
        errors.push({ file: entry.name, error: error.message });
      }
    }

    return {
      deletedCount,
      totalSize,
      errors,
      cacheDir
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { deletedCount: 0, totalSize: 0, errors: [], cacheDir };
    }
    throw error;
  }
}

function isValidCtxShape(value) {
  return value && typeof value === "object" && Number.isFinite(value.usedPercent);
}

export async function readCtxCache(cacheFilePath, sessionId) {
  const raw = await readExistingCache(cacheFilePath);
  if (!raw) return null;

  const ctx = raw.ctx;
  if (!isValidCtxShape(ctx)) return null;

  if (sessionId && raw.sessionId !== sessionId) return null;

  return ctx;
}

export async function writeCtxCache(cacheFilePath, ctxData) {
  const existing = await readExistingCache(cacheFilePath) || {};

  existing.ctx = ctxData;

  await fs.mkdir(path.dirname(cacheFilePath), { recursive: true });
  await fs.writeFile(cacheFilePath, JSON.stringify(existing, null, 2), "utf8");
}

export async function clearCtxCache(cacheFilePath) {
  const existing = await readExistingCache(cacheFilePath);
  if (!existing || !existing.ctx) return;
  delete existing.ctx;
  await fs.writeFile(cacheFilePath, JSON.stringify(existing, null, 2), "utf8");
}
