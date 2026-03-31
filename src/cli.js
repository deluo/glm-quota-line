#!/usr/bin/env node

import { loadConfig } from "./config.js";
import { formatStatus } from "./formatStatus.js";
import { parseArgs } from "./parseArgs.js";
import { getSessionId, readStatusLineInput } from "./readStatusLineInput.js";
import { runQuotaLine } from "./runQuotaLine.js";
import {
  getToolConfigPath,
  installClaudeStatusLine,
  readToolConfig,
  setToolConfigValue,
  uninstallClaudeStatusLine
} from "./userConfig.js";

function printHelp() {
  process.stdout.write(`glm-quota-line

Usage:
  glm-quota-line [--style text|compact|bar] [--display left|used|both]
  glm-quota-line install [--force]
  glm-quota-line uninstall
  glm-quota-line config set style <text|compact|bar>
  glm-quota-line config set display <left|used|both>
  glm-quota-line config show

Environment:
  ANTHROPIC_AUTH_TOKEN
  ANTHROPIC_BASE_URL
  GLM_DISPLAY_MODE
  GLM_STYLE
  GLM_BAR_WIDTH
  GLM_TIMEOUT_MS
  GLM_CACHE_TTL_MS
`);
}

function validateStyle(value) {
  return value === "text" || value === "compact" || value === "bar";
}

function validateDisplay(value) {
  return value === "left" || value === "used" || value === "both";
}

async function handleCommand(args) {
  const [command, subcommand, key, value] = args.positionals;

  if (command === "install") {
    const result = await installClaudeStatusLine(undefined, undefined, undefined, {
      force: Boolean(args.force)
    });
    if (!result.installed && result.reason === "unmanaged_exists") {
      process.stdout.write(
        `Skipped install because Claude Code already has an unmanaged statusLine.\nsettings: ${result.settingsPath}\nRun 'glm-quota-line install --force' to replace it and back it up.\n`
      );
      return true;
    }

    process.stdout.write(
      `Installed Claude Code status line.\nsettings: ${result.settingsPath}\ncommand: ${result.command}\n`
    );
    return true;
  }

  if (command === "uninstall") {
    const result = await uninstallClaudeStatusLine();
    if (result.removed) {
      process.stdout.write(`Removed Claude Code status line.\nsettings: ${result.settingsPath}\n`);
      return true;
    }

    if (result.reason === "unmanaged") {
      process.stdout.write(
        `Skipped uninstall because current statusLine is not managed by glm-quota-line.\nsettings: ${result.settingsPath}\n`
      );
      return true;
    }

    process.stdout.write(`No Claude Code status line was configured.\nsettings: ${result.settingsPath}\n`);
    return true;
  }

  if (command === "config" && subcommand === "show") {
    const config = await readToolConfig();
    process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
    return true;
  }

  if (command === "config" && subcommand === "set") {
    if (key === "style") {
      if (!validateStyle(value)) {
        process.stdout.write("Invalid style. Use: text, compact, or bar.\n");
        return true;
      }

      const config = await setToolConfigValue("style", value);
      process.stdout.write(`Saved style=${config.style}\nconfig: ${getToolConfigPath()}\n`);
      return true;
    }

    if (key === "display") {
      if (!validateDisplay(value)) {
        process.stdout.write("Invalid display. Use: left, used, or both.\n");
        return true;
      }

      const config = await setToolConfigValue("displayMode", value);
      process.stdout.write(`Saved display=${config.displayMode}\nconfig: ${getToolConfigPath()}\n`);
      return true;
    }

    process.stdout.write("Supported config keys: style, display\n");
    return true;
  }

  return false;
}

async function main() {
  try {
    const args = parseArgs();
    if (args.help) {
      printHelp();
      return;
    }

    if (await handleCommand(args)) {
      return;
    }

    const statusLineInput = await readStatusLineInput();
    const userConfig = await readToolConfig();
    const config = {
      ...loadConfig(),
      ...(validateStyle(userConfig.style) ? { style: userConfig.style } : {}),
      ...(validateDisplay(userConfig.displayMode) ? { displayMode: userConfig.displayMode } : {}),
      ...args,
      threadId: getSessionId(statusLineInput)
    };
    const finalResult = await runQuotaLine(config);

    process.stdout.write(
      `${formatStatus(finalResult, {
        displayMode: config.displayMode,
        style: config.style,
        barWidth: config.barWidth
      })}\n`
    );
  } catch {
    process.stdout.write("GLM | quota unavailable\n");
  }
}

await main();
