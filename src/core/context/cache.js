import fs from "node:fs/promises";
import path from "node:path";

import { getCacheRoot } from "../../shared/utils.js";

const CACHE_DIR = path.join(getCacheRoot(), "glm-quota-line");
const CACHE_FILE = path.join(CACHE_DIR, "ctx-cache.json");

// Persisted last-known-good ctx value for a session. The status line is a
// short-lived process invoked on every refresh; token usage can be 0 or
// missing on individual frames (session start, between requests), which would
// make the ctx segment flash on and off. This cache lets us fall back to the
// previous valid value for the same session + model so the display stays stable.
//
// modelId is part of the cache key: we never fall back across a model switch,
// since a stale value from another model would be misleading.

function isValidCached(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (typeof value.modelId !== "string" || !value.modelId) {
    return false;
  }
  if (!Number.isFinite(value.usedPercent)) {
    return false;
  }
  if (!Number.isFinite(value.windowSize)) {
    return false;
  }
  return true;
}

const VALID_SEVERITIES = new Set(["good", "warn", "danger", "neutral"]);

export async function readCtxCache(filePath = CACHE_FILE) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!isValidCached(parsed)) {
      return null;
    }
    const severity = VALID_SEVERITIES.has(parsed.severity) ? parsed.severity : "neutral";
    return {
      modelId: parsed.modelId,
      usedPercent: parsed.usedPercent,
      remainingPercent: Number.isFinite(parsed.remainingPercent)
        ? parsed.remainingPercent
        : 100 - parsed.usedPercent,
      windowSize: parsed.windowSize,
      severity,
      sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : "",
      savedAt: Number.isFinite(parsed.savedAt) ? parsed.savedAt : null
    };
  } catch {
    return null;
  }
}

export async function writeCtxCache(data, filePath = CACHE_FILE) {
  if (!isValidCached(data)) {
    return;
  }
  // Fill savedAt here (not at call sites): getContextData's return shape has no
  // savedAt, so callers would otherwise write `undefined` and the field would
  // vanish from the JSON. Centralizing it mirrors quota cache's writeSuccessCache
  // and keeps the timestamp reliable for future staleness checks.
  const payload = {
    modelId: data.modelId,
    usedPercent: data.usedPercent,
    remainingPercent: data.remainingPercent,
    windowSize: data.windowSize,
    severity: VALID_SEVERITIES.has(data.severity) ? data.severity : "neutral",
    sessionId: data.sessionId || "",
    savedAt: Number.isFinite(data.savedAt) ? data.savedAt : Date.now()
  };
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    // Cache write is best-effort; a failure just means we lose the fallback.
  }
}

/**
 * Returns the cached value if it is usable for the current session + model,
 * otherwise null. A cached value is usable only when sessionId and modelId
 * both match — this prevents falling back to data from a different session or
 * a different model.
 */
export function usableCached(cached, sessionId, modelId) {
  if (!cached) {
    return null;
  }
  if (sessionId && cached.sessionId && cached.sessionId !== sessionId) {
    return null;
  }
  if (modelId && cached.modelId !== modelId) {
    return null;
  }
  return cached;
}
