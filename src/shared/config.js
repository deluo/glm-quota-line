import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { normalizeOptionalString, getCacheRoot } from "./utils.js";
import {
  DEFAULT_CN_BASE_URL,
  DEFAULT_INTL_BASE_URL,
  DEFAULT_QUOTA_URL,
  DEFAULT_TIMEOUT_MS
} from "./constants.js";
import { getClaudeSettingsPath } from "../claude/settings.js";

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

function classifyHost(baseUrl) {
  if (!baseUrl) {
    return { isZhipu: true, quotaUrl: "" };
  }

  try {
    const host = new URL(baseUrl).host;
    const isIntl = host.includes("api.z.ai");
    const isCn =
      host.includes("open.bigmodel.cn") ||
      host.includes("dev.bigmodel.cn") ||
      host === "bigmodel.cn" ||
      host.endsWith(".bigmodel.cn");

    if (isIntl) {
      return { isZhipu: true, quotaUrl: `${DEFAULT_INTL_BASE_URL}/api/monitor/usage/quota/limit` };
    }
    if (isCn) {
      return { isZhipu: true, quotaUrl: `${DEFAULT_CN_BASE_URL}/api/monitor/usage/quota/limit` };
    }
    return { isZhipu: false, quotaUrl: "" };
  } catch {
    return { isZhipu: false, quotaUrl: "" };
  }
}

export async function loadConfig(env = process.env, overrides = {}, options = {}) {
  const claudeEnv = await readClaudeEnv(options.claudeSettingsPath);
  const anthropicBaseUrl =
    normalizeOptionalString(overrides.baseUrl) ||
    normalizeOptionalString(env.ANTHROPIC_BASE_URL) ||
    normalizeOptionalString(claudeEnv?.ANTHROPIC_BASE_URL);
  const { isZhipu: isGLM, quotaUrl: derivedQuotaUrl } = classifyHost(anthropicBaseUrl);
  const authorization =
    normalizeOptionalString(overrides.authToken) ||
    normalizeOptionalString(env.ANTHROPIC_AUTH_TOKEN) ||
    normalizeOptionalString(claudeEnv?.ANTHROPIC_AUTH_TOKEN);
  const tokenHash = authorization
    ? crypto.createHash("sha256").update(authorization).digest("hex").slice(0, 12)
    : "anonymous";
  const cacheFileName = `cache-${tokenHash}.json`;

  return {
    isGLM,
    quotaUrl: isGLM ? (derivedQuotaUrl || DEFAULT_QUOTA_URL) : "",
    authorization,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    cacheFilePath: path.join(getCacheRoot(), "glm-quota-line", cacheFileName)
  };
}
