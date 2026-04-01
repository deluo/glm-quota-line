import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_BAR_WIDTH,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_DISPLAY_MODE,
  DEFAULT_PALETTE,
  DEFAULT_QUOTA_URL,
  DEFAULT_STYLE,
  DEFAULT_THEME,
  DEFAULT_TIMEOUT_MS,
  normalizeDisplayMode,
  normalizePalette,
  normalizeStatusStyle,
  normalizeTheme
} from "./constants.js";

function parsePositiveInt(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getCacheRoot() {
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches");
  }

  if (process.platform === "win32") {
    return process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  }

  return process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
}

function deriveQuotaUrl(baseUrl) {
  if (!baseUrl) {
    return "";
  }

  try {
    const parsedBaseUrl = new URL(baseUrl);
    const baseDomain = `${parsedBaseUrl.protocol}//${parsedBaseUrl.host}`;

    if (
      parsedBaseUrl.host.includes("api.z.ai") ||
      parsedBaseUrl.host.includes("open.bigmodel.cn") ||
      parsedBaseUrl.host.includes("dev.bigmodel.cn")
    ) {
      return `${baseDomain}/api/monitor/usage/quota/limit`;
    }
  } catch {
    return "";
  }

  return "";
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export function loadConfig(env = process.env, overrides = {}) {
  const anthropicBaseUrl =
    normalizeOptionalString(overrides.baseUrl) || normalizeOptionalString(env.ANTHROPIC_BASE_URL);
  const derivedQuotaUrl = deriveQuotaUrl(anthropicBaseUrl);
  const authorization =
    normalizeOptionalString(overrides.authToken) ||
    normalizeOptionalString(env.ANTHROPIC_AUTH_TOKEN);
  const tokenHash = authorization
    ? crypto.createHash("sha256").update(authorization).digest("hex").slice(0, 12)
    : "anonymous";
  const cacheFileName = `cache-${tokenHash}.json`;

  return {
    quotaUrl: derivedQuotaUrl || DEFAULT_QUOTA_URL,
    authorization,
    anthropicBaseUrl,
    timeoutMs: parsePositiveInt(env.GLM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    cacheTtlMs: parsePositiveInt(env.GLM_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS),
    displayMode: normalizeDisplayMode(env.GLM_DISPLAY_MODE || DEFAULT_DISPLAY_MODE),
    style: normalizeStatusStyle(env.GLM_STYLE || DEFAULT_STYLE),
    theme: normalizeTheme(env.GLM_THEME || DEFAULT_THEME),
    palette: normalizePalette(env.GLM_PALETTE || DEFAULT_PALETTE),
    barWidth: parsePositiveInt(env.GLM_BAR_WIDTH, DEFAULT_BAR_WIDTH),
    cacheFilePath: path.join(getCacheRoot(), "glm-quota-line", cacheFileName)
  };
}
