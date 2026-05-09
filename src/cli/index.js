#!/usr/bin/env node

import { handleCommand } from "./commands.js";
import { parseArgs } from "./args.js";
import { loadConfig } from "../shared/config.js";
import { formatStatus } from "../core/status/format.js";
import { formatQueryHuman, formatQueryJson } from "../core/query/format.js";
import { readStatusLineInput } from "../claude/input.js";
import { normalizeContextWindow } from "../claude/contextWindow.js";
import { readToolConfig } from "../claude/settings.js";
import { resolveQuotaStatus } from "../core/quota/service.js";
import { getPackageVersion } from "../shared/packageInfo.js";
import {
  isValidDisplayMode,
  isValidStatusStyle,
  isValidTheme,
  isValidWorkDays,
  MODEL_CONTEXT_WINDOW,
  normalizeDisplayMode
} from "../shared/constants.js";

function printHelp() {
  process.stdout.write(`glm-quota-line

Usage:
  glm-quota-line [--display left|used] [--json]
  glm-quota-line [--style text|compact|bar] [--theme dark|light|mono] [--ctx on|off]
  glm-quota-line --version
  glm-quota-line install [--force]
  glm-quota-line uninstall
  glm-quota-line version
  glm-quota-line check-update
  glm-quota-line config set style <text|compact|bar>
  glm-quota-line config set display <left|used>
  glm-quota-line config set theme <dark|light|mono>
  glm-quota-line config set ctx <on|off>
  glm-quota-line config set auth-token <token>
  glm-quota-line config set base-url <url>
  glm-quota-line config set work-days <1-7>
  glm-quota-line config unset <style|display|theme|ctx|auth-token|base-url|work-days>
  glm-quota-line config show

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

Options:
  --style                 Output layout: text, compact, or bar (status line mode only).
  --display               Quota metric: left or used.
  --theme                 Theme preset: dark, light, or mono (status line mode only).
  --ctx on|off            Show context window usage (default: on, status line mode only).
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
  glm-quota-line config set ctx on
  glm-quota-line config set auth-token <your-real-token>
  glm-quota-line install

Environment:
  ANTHROPIC_AUTH_TOKEN          Auth token for Zhipu GLM API (required).
  ANTHROPIC_BASE_URL            Base URL for quota API endpoint.
`);
}

function getStoredDisplayOverrides(userConfig) {
  return {
    ...(isValidStatusStyle(userConfig.style) ? { style: userConfig.style } : {}),
    ...(isValidDisplayMode(userConfig.displayMode) ? { displayMode: userConfig.displayMode } : {}),
    ...(isValidTheme(userConfig.theme) ? { theme: userConfig.theme } : {}),
    ...(userConfig.ctxEnabled === false ? { ctxEnabled: false } : {})
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

  const ctxModel = config.ctxEnabled !== false
    ? normalizeContextWindow(statusLineInput, MODEL_CONTEXT_WINDOW)
    : null;

  const statusOutput = formatStatus(quotaStatus, {
    displayMode: config.displayMode,
    style: config.style,
    theme: config.theme,
    workDays: isValidWorkDays(userConfig.workDays) ? userConfig.workDays : undefined,
    ctxModel
  });
  process.stdout.write(
    `${statusOutput || "GLM | quota unavailable"}\n`
  );
}

export async function main() {
  try {
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
  } catch {
    process.stdout.write("GLM | quota unavailable\n");
  }
}

await main();
