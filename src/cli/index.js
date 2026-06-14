#!/usr/bin/env node

import { handleCommand } from "./commands.js";
import { parseArgs } from "./args.js";
import { loadConfig } from "../shared/config.js";
import { formatStatus } from "../core/status/format.js";
import { formatQueryHuman, formatQueryJson } from "../core/query/format.js";
import { readStatusLineInput } from "../claude/input.js";
import { readToolConfig } from "../claude/settings.js";
import { resolveQuotaStatus } from "../core/quota/service.js";
import { getPackageVersion } from "../shared/packageInfo.js";
import { getContextData } from "../core/context/index.js";
import { mergeModelMap } from "../core/context/models.js";
import { readCtxCache, writeCtxCache, usableCached } from "../core/context/cache.js";
import { cleanupExpiredCache } from "../core/quota/cache.js";
import { getCacheRoot } from "../shared/utils.js";
import {
  isValidDisplayMode,
  isValidStatusStyle,
  isValidTheme,
  isValidWorkDays,
  normalizeDisplayMode
} from "../shared/constants.js";
import fs from "node:fs/promises";
import path from "node:path";
import { printHelpFor } from "./help.js";

function scheduleCacheCleanup() {
  const markerPath = path.join(getCacheRoot(), "glm-quota-line", ".last-cleanup");
  const now = Date.now();

  (async () => {
    try {
      const raw = await fs.readFile(markerPath, "utf8");
      if (now - Number(raw) < 24 * 60 * 60 * 1000) return;
    } catch {
      // marker missing or unreadable — proceed with cleanup
    }

    await cleanupExpiredCache();
    await fs.mkdir(path.dirname(markerPath), { recursive: true });
    await fs.writeFile(markerPath, String(now), "utf8");
  })().catch(() => {});
}

function getStoredDisplayOverrides(userConfig) {
  return {
    ...(isValidStatusStyle(userConfig.style) ? { style: userConfig.style } : {}),
    ...(isValidDisplayMode(userConfig.displayMode) ? { displayMode: userConfig.displayMode } : {}),
    ...(isValidTheme(userConfig.theme) ? { theme: userConfig.theme } : {})
  };
}

function handleTerminalQuery(args, userConfig, quotaStatus) {
  if (args.json) {
    process.stdout.write(`${JSON.stringify(formatQueryJson(quotaStatus), null, 2)}\n`);
    return;
  }

  const displayMode = normalizeDisplayMode(
    isValidDisplayMode(args.displayMode) ? args.displayMode : userConfig.displayMode
  );
  const humanOutput = formatQueryHuman(quotaStatus, displayMode);
  process.stdout.write(humanOutput || "GLM | quota unavailable\n");
}

async function handleStatusLine(args, userConfig, config, statusLineInput, quotaStatus) {
  if (args.json) {
    process.stderr.write("Warning: --json is ignored in status-line mode.\n");
  }

  const DEBUG = process.env.GLM_QUOTA_DEBUG === "1";
  if (DEBUG && statusLineInput) {
    process.stderr.write(`[DEBUG] stdin context_window: ${JSON.stringify(statusLineInput.context_window)}\n`);
    process.stderr.write(`[DEBUG] stdin model: ${JSON.stringify(statusLineInput.model)}\n`);
  }

  // Context window defaults to on. Only skip when a ctx component is explicitly disabled.
  const ctxDisabled = userConfig.lines?.[0]?.components?.some(
    c => c.type === "ctx" && c.enabled === false
  );
  let ctxModel = null;

  if (!ctxDisabled) {
    // The status line is a short-lived process invoked on every refresh.
    // Token usage can be 0 or missing on individual frames (session start,
    // between requests), which would make the ctx segment flash. We cache the
    // last valid value for the session and fall back to it when the current
    // frame has no usable data — but only if modelId matches, so a stale value
    // from another model is never shown.
    ctxModel = getContextData(statusLineInput, { debug: DEBUG });
    const sessionId = config.sessionId || "";
    const stdinModelId = statusLineInput?.model?.id;
    // Cache stores the bare id (e.g. `glm-5.2`); stdin may report a suffixed
    // form like `glm-5.2[1M]`. Match after stripping a trailing bracket suffix.
    const bareStdinModelId = typeof stdinModelId === "string"
      ? stdinModelId.replace(/\[[^\]]*\]$/i, "").trim()
      : stdinModelId;

    if (ctxModel) {
      await writeCtxCache({ ...ctxModel, sessionId });
    } else {
      const cached = usableCached(await readCtxCache(), sessionId, null);
      if (cached && (!bareStdinModelId || cached.modelId === bareStdinModelId)) {
        ctxModel = {
          usedPercent: cached.usedPercent,
          remainingPercent: cached.remainingPercent,
          modelId: cached.modelId,
          windowSize: cached.windowSize,
          severity: cached.severity,
          fromCache: true
        };
        if (DEBUG) {
          process.stderr.write(`[ctx] using cached value (model: ${cached.modelId}, ${cached.usedPercent}%)\n`);
        }
      }
    }
  }

  if (DEBUG && ctxModel) {
    process.stderr.write(`[DEBUG] ctxModel: ${JSON.stringify(ctxModel)}\n`);
  }

  const statusOutput = formatStatus(quotaStatus, {
    global: {
      theme: config.theme,
      displayMode: config.displayMode,
      minimalist: userConfig.minimalist || false,
      rawValues: userConfig.rawValues || false,
      resetFormat: userConfig.resetFormat
    },
    style: config.style,
    workDays: isValidWorkDays(userConfig.workDays) ? userConfig.workDays : undefined,
    lines: userConfig.lines,
    ctxModel
  });
  process.stdout.write(
    `${statusOutput || "GLM | quota unavailable"}\n`
  );
}

export async function main() {
  try {
    scheduleCacheCleanup();

    const args = parseArgs();
    if (args.help) {
      printHelpFor(args.positionals);
      return;
    }

    if (args.version) {
      process.stdout.write(`glm-quota-line ${await getPackageVersion()}\n`);
      return;
    }

    if (await handleCommand(args)) {
      return;
    }

    if (args.positionals[0] === "configure") {
      const { runTUI } = await import("../tui/index.js");
      await runTUI();
      return;
    }

    const statusLineInput = await readStatusLineInput();
    const userConfig = await readToolConfig();
    if (userConfig.modelMap && typeof userConfig.modelMap === "object") {
      mergeModelMap(userConfig.modelMap);
    }
    const config = {
      // Stored auth/base-url must override Claude's injected env so users can
      // bypass gateway/proxy credentials when necessary.
      ...(await loadConfig(process.env, userConfig)),
      // Display config precedence is env defaults -> persisted config -> CLI flags.
      ...getStoredDisplayOverrides(userConfig),
      ...args,
      sessionId: statusLineInput?.session_id || ""
    };
    if (!config.isGLM) {
      if (args.json) {
        process.stdout.write(`${JSON.stringify({ error: "GLM quota is not available for the configured provider." }, null, 2)}\n`);
      } else {
        process.stderr.write("GLM quota is not available for the configured provider.\n");
      }
      return;
    }

    const quotaStatus = await resolveQuotaStatus(config);

    if (!statusLineInput) {
      handleTerminalQuery(args, userConfig, quotaStatus);
    } else {
      await handleStatusLine(args, userConfig, config, statusLineInput, quotaStatus);
    }
  } catch (error) {
    if (process.env.GLM_QUOTA_DEBUG === "1") {
      process.stderr.write(`[ERROR] ${error.message}\n${error.stack}\n`);
    }
    process.stdout.write("GLM | quota unavailable\n");
  }
}

await main();
