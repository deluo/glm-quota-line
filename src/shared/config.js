import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_CN_BASE_URL,
  DEFAULT_CTX_ENABLED,
  DEFAULT_INTL_BASE_URL,
  DEFAULT_DISPLAY_MODE,
  DEFAULT_QUOTA_URL,
  DEFAULT_STYLE,
  DEFAULT_THEME,
  DEFAULT_TIMEOUT_MS
} from "./constants.js";

function getClaudeSettingsPath() {
  return path.join(os.homedir(), ".claude", "settings.json");
}

async function readClaudeEnv(claudeSettingsPath) {
  try {
    const filePath = claudeSettingsPath || getClaudeSettingsPath();
    const raw = await fs.readFile(filePath, "utf8");
    const settings = JSON.parse(raw);
    return settings?.env && typeof settings.env === "object" ? settings.env : null;
  } catch {
    return null;
  }
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
    const host = parsedBaseUrl.host;

    if (host.includes("api.z.ai")) {
      return `${DEFAULT_INTL_BASE_URL}/api/monitor/usage/quota/limit`;
    }

    if (
      host.includes("open.bigmodel.cn") ||
      host.includes("dev.bigmodel.cn") ||
      host === "bigmodel.cn" ||
      host.endsWith(".bigmodel.cn")
    ) {
      return `${DEFAULT_CN_BASE_URL}/api/monitor/usage/quota/limit`;
    }
  } catch {
    return "";
  }

  return "";
}

export function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export async function loadConfig(env = process.env, overrides = {}, options = {}) {
  const claudeEnv = await readClaudeEnv(options.claudeSettingsPath);
  const anthropicBaseUrl =
    normalizeOptionalString(overrides.baseUrl) ||
    normalizeOptionalString(env.ANTHROPIC_BASE_URL) ||
    normalizeOptionalString(claudeEnv?.ANTHROPIC_BASE_URL);
  const derivedQuotaUrl = deriveQuotaUrl(anthropicBaseUrl);
  const authorization =
    normalizeOptionalString(overrides.authToken) ||
    normalizeOptionalString(env.ANTHROPIC_AUTH_TOKEN) ||
    normalizeOptionalString(claudeEnv?.ANTHROPIC_AUTH_TOKEN);
  const tokenHash = authorization
    ? crypto.createHash("sha256").update(authorization).digest("hex").slice(0, 12)
    : "anonymous";
  const cacheFileName = `cache-${tokenHash}.json`;

  return {
    quotaUrl: derivedQuotaUrl || DEFAULT_QUOTA_URL,
    authorization,
    anthropicBaseUrl,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    cacheTtlMs: DEFAULT_CACHE_TTL_MS,
    displayMode: DEFAULT_DISPLAY_MODE,
    style: DEFAULT_STYLE,
    theme: DEFAULT_THEME,
    ctxEnabled: DEFAULT_CTX_ENABLED,
    cacheFilePath: path.join(getCacheRoot(), "glm-quota-line", cacheFileName)
  };
}
