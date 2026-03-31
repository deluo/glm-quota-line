import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOOL_CONFIG_SCHEMA_VERSION = 1;
const TOOL_CONFIG_MANAGED_BY = "glm-quota-line";

function normalizePathForShell(value) {
  return value.replace(/\\/g, "/");
}

async function readJsonFile(filePath, fallback = {}) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

export function getClaudeDir() {
  return path.join(os.homedir(), ".claude");
}

export function getClaudeSettingsPath() {
  return path.join(getClaudeDir(), "settings.json");
}

export function getToolConfigPath() {
  return path.join(getClaudeDir(), "glm-quota-line.json");
}

export function getStatusLineScriptPath() {
  return path.resolve(__dirname, "..", "scripts", "status-line.js");
}

export function buildInstalledStatusLineCommand(nodePath = process.execPath) {
  return `"${normalizePathForShell(nodePath)}" "${normalizePathForShell(getStatusLineScriptPath())}"`;
}

function isManagedStatusLine(statusLine) {
  const command = statusLine?.command;
  if (typeof command !== "string") {
    return false;
  }

  return command.includes("glm-quota-line") || command.includes("status-line.js");
}

function normalizeToolConfig(config) {
  const base = config && typeof config === "object" ? config : {};

  return {
    schemaVersion: TOOL_CONFIG_SCHEMA_VERSION,
    managedBy: TOOL_CONFIG_MANAGED_BY,
    style: typeof base.style === "string" ? base.style : undefined,
    displayMode: typeof base.displayMode === "string" ? base.displayMode : undefined,
    install: base.install && typeof base.install === "object" ? base.install : {}
  };
}

export async function readToolConfig(configPath = getToolConfigPath()) {
  const parsed = await readJsonFile(configPath, {});
  return normalizeToolConfig(parsed);
}

export async function writeToolConfig(config, configPath = getToolConfigPath()) {
  await writeJsonFile(configPath, normalizeToolConfig(config));
}

export async function setToolConfigValue(key, value, configPath = getToolConfigPath()) {
  const current = await readToolConfig(configPath);
  current[key] = value;
  await writeToolConfig(current, configPath);
  return current;
}

export async function installClaudeStatusLine(
  command = buildInstalledStatusLineCommand(),
  settingsPath = getClaudeSettingsPath(),
  configPath = getToolConfigPath(),
  options = {}
) {
  const settings = await readJsonFile(settingsPath, {});
  const toolConfig = await readToolConfig(configPath);
  const existingStatusLine = settings.statusLine;

  if (existingStatusLine && !isManagedStatusLine(existingStatusLine) && !options.force) {
    return {
      installed: false,
      reason: "unmanaged_exists",
      settingsPath,
      command
    };
  }

  if (existingStatusLine && !isManagedStatusLine(existingStatusLine) && options.force) {
    toolConfig.install.previousStatusLine = existingStatusLine;
  }

  const nextStatusLine = {
    ...(existingStatusLine && typeof existingStatusLine === "object" ? existingStatusLine : {}),
    type: "command",
    command
  };

  settings.statusLine = nextStatusLine;
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

  if (!isManagedStatusLine(statusLine)) {
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
