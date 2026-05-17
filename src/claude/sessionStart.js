import { loadConfig } from "../shared/config.js";
import { clearCtxCache } from "../core/quota/cache.js";
import { resolveQuotaStatus } from "../core/quota/service.js";
import { readStatusLineInput } from "./input.js";
import { readToolConfig } from "./settings.js";

export const SESSION_START_MATCHERS = ["startup", "resume", "clear", "compact"];

export async function refreshQuotaOnSessionStart(options = {}) {
  const hookInput = await readStatusLineInput(options.stdin ?? process.stdin);
  const userConfig = await readToolConfig(options.configPath);
  const loadConfigFn = options.loadConfigFn ?? loadConfig;
  const resolveQuotaStatusFn = options.resolveQuotaStatusFn ?? resolveQuotaStatus;
  const config = {
    ...(await loadConfigFn(options.env ?? process.env, userConfig)),
    sessionId: hookInput?.session_id || ""
  };

  if (hookInput?.source === "compact" || hookInput?.source === "clear" || hookInput?.source === "startup") {
    await clearCtxCache(config.cacheFilePath).catch(() => {});
  }

  return resolveQuotaStatusFn(config, {
    now: options.now,
    fetchImpl: options.fetchImpl,
    forceRefresh: true
  });
}
