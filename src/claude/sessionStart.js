import { loadConfig } from "../shared/config.js";
import { resolveQuotaStatus } from "../core/quota/service.js";
import { readStatusLineInput } from "./input.js";
import { readToolConfig } from "./settings.js";

export const SESSION_START_MATCHERS = ["startup", "resume", "clear"];

export async function refreshQuotaOnSessionStart(options = {}) {
  const hookInput = await readStatusLineInput(options.stdin ?? process.stdin);
  const userConfig = await readToolConfig(options.configPath);
  const loadConfigFn = options.loadConfigFn ?? loadConfig;
  const resolveQuotaStatusFn = options.resolveQuotaStatusFn ?? resolveQuotaStatus;
  const config = {
    ...loadConfigFn(options.env ?? process.env, userConfig),
    sessionId: hookInput?.session_id || ""
  };

  return resolveQuotaStatusFn(config, {
    now: options.now,
    fetchImpl: options.fetchImpl,
    forceRefresh: true
  });
}
