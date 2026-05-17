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

function printHelp() {
  process.stdout.write(`glm-quota-line

Usage:
  glm-quota-line [--display left|used] [--json]
  glm-quota-line [--style text|compact|bar] [--theme dark|light|mono]
  glm-quota-line --version
  glm-quota-line install [--force]
  glm-quota-line uninstall
  glm-quota-line version
  glm-quota-line check-update
  glm-quota-line config set style <text|compact|bar>
  glm-quota-line config set display <left|used>
  glm-quota-line config set theme <dark|light|mono>
  glm-quota-line config set auth-token <token>
  glm-quota-line config set base-url <url>
  glm-quota-line config set work-days <1-7>
  glm-quota-line config set minimalist <true|false>
  glm-quota-line config set raw-values <true|false>
  glm-quota-line config unset <style|display|theme|auth-token|base-url|work-days|minimalist|raw-values>
  glm-quota-line config show
  glm-quota-line configure

When run without arguments, displays comprehensive quota usage (5h, week, MCP)
with full reset dates. Use --display to choose left or used metric.
Use --json to output structured JSON for scripting and automation.

When used as a Claude Code status line, displays a compact one-line status bar.

Commands:
  install                 Install glm-quota-line into Claude Code statusLine.command and SessionStart hooks.
  install --force         Replace an existing unmanaged status line and back it up.
  uninstall               Remove the managed status line and SessionStart hooks, and restore a backup if one exists.
  version                 Print the installed glm-quota-line version.
  check-update            Check npm for a newer version and print the upgrade command.
  config show             Print the current persisted config. Stored tokens are redacted.
  config set ...          Persist a display option or manual credential override.
  config unset ...        Remove one persisted config key.
  configure               Launch interactive TUI for component and global configuration.

Options:
  --style                 Output layout: text, compact, or bar (status line mode only).
  --display               Quota metric: left or used.
  --theme                 Theme preset: dark, light, or mono (status line mode only).
  --json                  Output quota as JSON (terminal mode only).
  --force                 Allow install to replace an unmanaged Claude status line.
  -v, --version           Show the installed version.
  -h, --help              Show this help text.

Examples:
  glm-quota-line
  glm-quota-line --display used
  glm-quota-line --version
  glm-quota-line check-update
  glm-quota-line config set display used
  glm-quota-line config set theme light
  glm-quota-line config set auth-token <your-real-token>
  glm-quota-line configure
  glm-quota-line install

Environment:
  ANTHROPIC_AUTH_TOKEN          Auth token for Zhipu GLM API (required).
  ANTHROPIC_BASE_URL            Base URL for quota API endpoint.
  GLM_QUOTA_DEBUG=1             Enable debug logging for context window data (writes to stderr).
`);
}

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

function handleStatusLine(args, userConfig, config, statusLineInput, quotaStatus) {
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
  const ctxModel = !ctxDisabled
    ? getContextData(statusLineInput, { debug: DEBUG })
    : null;

  if (DEBUG && ctxModel) {
    process.stderr.write(`[DEBUG] ctxModel: ${JSON.stringify(ctxModel)}\n`);
  }

  const statusOutput = formatStatus(quotaStatus, {
    global: {
      theme: config.theme,
      displayMode: config.displayMode,
      minimalist: userConfig.minimalist || false,
      rawValues: userConfig.rawValues || false
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
      printHelp();
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
      handleStatusLine(args, userConfig, config, statusLineInput, quotaStatus);
    }
  } catch (error) {
    if (process.env.GLM_QUOTA_DEBUG === "1") {
      process.stderr.write(`[ERROR] ${error.message}\n${error.stack}\n`);
    }
    process.stdout.write("GLM | quota unavailable\n");
  }
}

await main();
