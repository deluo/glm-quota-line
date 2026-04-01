import path from "node:path";
import { fileURLToPath } from "node:url";

import { readJsonFile, writeJsonFile } from "../shared/jsonFile.js";
import {
  getClaudeSettingsPath,
  getToolConfigPath,
  readToolConfig,
  writeToolConfig
} from "./settings.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizePathForShell(value) {
  return value.replace(/\\/g, "/");
}

function isToolManagedStatusLine(statusLine) {
  const command = statusLine?.command;
  if (typeof command !== "string") {
    return false;
  }

  // Global installs can resolve to different absolute paths, so ownership is
  // detected by the package/entrypoint identity instead of an exact command match.
  // The legacy script marker is kept so old installs can still be cleanly replaced.
  return command.includes("glm-quota-line") || command.includes("status-line.js");
}

export function getStatusLineEntryPath() {
  return path.resolve(__dirname, "..", "cli", "index.js");
}

export function buildManagedStatusLineCommand(nodePath = process.execPath) {
  return `"${normalizePathForShell(nodePath)}" "${normalizePathForShell(getStatusLineEntryPath())}"`;
}

export async function installClaudeStatusLine(
  command = buildManagedStatusLineCommand(),
  settingsPath = getClaudeSettingsPath(),
  configPath = getToolConfigPath(),
  options = {}
) {
  const settings = await readJsonFile(settingsPath, {});
  const toolConfig = await readToolConfig(configPath);
  const existingStatusLine = settings.statusLine;

  if (existingStatusLine && !isToolManagedStatusLine(existingStatusLine) && !options.force) {
    return {
      installed: false,
      reason: "unmanaged_exists",
      settingsPath,
      command
    };
  }

  if (existingStatusLine && !isToolManagedStatusLine(existingStatusLine) && options.force) {
    toolConfig.install.previousStatusLine = existingStatusLine;
  }

  settings.statusLine = {
    ...(existingStatusLine && typeof existingStatusLine === "object" ? existingStatusLine : {}),
    type: "command",
    command
  };
  await writeJsonFile(settingsPath, settings);

  toolConfig.install.settingsPath = settingsPath;
  toolConfig.install.command = command;
  toolConfig.install.installed = true;
  await writeToolConfig(toolConfig, configPath);

  return {
    installed: true,
    command,
    settingsPath
  };
}

export async function uninstallClaudeStatusLine(
  settingsPath = getClaudeSettingsPath(),
  configPath = getToolConfigPath()
) {
  const settings = await readJsonFile(settingsPath, {});
  const toolConfig = await readToolConfig(configPath);
  const statusLine = settings.statusLine;

  if (!statusLine) {
    return { removed: false, reason: "missing", settingsPath };
  }

  if (!isToolManagedStatusLine(statusLine)) {
    return { removed: false, reason: "unmanaged", settingsPath };
  }

  if (toolConfig.install.previousStatusLine) {
    settings.statusLine = toolConfig.install.previousStatusLine;
  } else {
    delete settings.statusLine;
  }

  await writeJsonFile(settingsPath, settings);
  toolConfig.install = {};
  await writeToolConfig(toolConfig, configPath);
  return { removed: true, reason: "removed", settingsPath };
}
