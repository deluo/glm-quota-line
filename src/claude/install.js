import path from "node:path";
import { fileURLToPath } from "node:url";

import { readJsonFile, writeJsonFile } from "../shared/jsonFile.js";
import { SESSION_START_MATCHERS } from "./sessionStart.js";
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

function isToolManagedCommand(command) {
  if (typeof command !== "string") {
    return false;
  }

  return command.includes("glm-quota-line") || command.includes("status-line.js");
}

function isToolManagedStatusLine(statusLine) {
  // Global installs can resolve to different absolute paths, so ownership is
  // detected by the package/entrypoint identity instead of an exact command match.
  // The legacy script marker is kept so old installs can still be cleanly replaced.
  return isToolManagedCommand(statusLine?.command);
}

function getStatusLineEntryPath() {
  return path.resolve(__dirname, "..", "cli", "index.js");
}

function buildManagedCommand(commandArgs = [], nodePath = process.execPath) {
  const quotedArgs = commandArgs.map((arg) => ` "${arg}"`).join("");
  return `"${normalizePathForShell(nodePath)}" "${normalizePathForShell(getStatusLineEntryPath())}"${quotedArgs}`;
}

export function buildManagedStatusLineCommand(nodePath = process.execPath) {
  return buildManagedCommand([], nodePath);
}

export function buildManagedSessionStartRefreshCommand(nodePath = process.execPath) {
  return buildManagedCommand(["session-start-refresh"], nodePath);
}

function isToolManagedHook(hook) {
  return hook?.type === "command" && isToolManagedCommand(hook.command);
}

function filterManagedHooksFromGroups(groups) {
  let hadManaged = false;
  const filtered = [];

  for (const group of groups) {
    if (!group || typeof group !== "object" || !Array.isArray(group.hooks)) {
      filtered.push(group);
      continue;
    }

    const nextHooks = group.hooks.filter((hook) => !isToolManagedHook(hook));
    if (nextHooks.length !== group.hooks.length) {
      hadManaged = true;
    }

    if (nextHooks.length > 0) {
      filtered.push({ ...group, hooks: nextHooks });
    }
  }

  return { groups: filtered, hadManaged };
}

function removeManagedSessionStartHooks(settings) {
  if (!settings.hooks || typeof settings.hooks !== "object") {
    return false;
  }

  const existingGroups = Array.isArray(settings.hooks.SessionStart) ? settings.hooks.SessionStart : null;
  if (!existingGroups) {
    return false;
  }

  const { groups: nextGroups, hadManaged: removed } = filterManagedHooksFromGroups(existingGroups);

  if (nextGroups.length > 0) {
    settings.hooks.SessionStart = nextGroups;
  } else {
    delete settings.hooks.SessionStart;
  }

  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  return removed;
}

function installManagedSessionStartHooks(settings, command) {
  const existingGroups =
    settings.hooks && typeof settings.hooks === "object" && Array.isArray(settings.hooks.SessionStart)
      ? settings.hooks.SessionStart
      : [];

  const { groups: nextGroups } = filterManagedHooksFromGroups(existingGroups);

  for (const matcher of SESSION_START_MATCHERS) {
    const targetGroup = nextGroups.find(
      (group) => group && typeof group === "object" && group.matcher === matcher && Array.isArray(group.hooks)
    );

    if (targetGroup) {
      targetGroup.hooks.push({ type: "command", command });
      continue;
    }

    nextGroups.push({
      matcher,
      hooks: [{ type: "command", command }]
    });
  }

  settings.hooks = {
    ...(settings.hooks && typeof settings.hooks === "object" ? settings.hooks : {}),
    SessionStart: nextGroups
  };
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
  const sessionStartHookCommand =
    options.sessionStartHookCommand || buildManagedSessionStartRefreshCommand();

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
  installManagedSessionStartHooks(settings, sessionStartHookCommand);
  await writeJsonFile(settingsPath, settings);

  toolConfig.install.settingsPath = settingsPath;
  toolConfig.install.command = command;
  toolConfig.install.installed = true;
  toolConfig.install.sessionStartHook = {
    command: sessionStartHookCommand,
    matchers: [...SESSION_START_MATCHERS],
    installed: true
  };
  await writeToolConfig(toolConfig, configPath);

  return {
    installed: true,
    command,
    sessionStartHookCommand,
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
  const hasManagedStatusLine = Boolean(statusLine && isToolManagedStatusLine(statusLine));
  const removedHooks = removeManagedSessionStartHooks(settings);

  if (hasManagedStatusLine) {
    if (toolConfig.install.previousStatusLine) {
      settings.statusLine = toolConfig.install.previousStatusLine;
    } else {
      delete settings.statusLine;
    }
  }

  if (!hasManagedStatusLine && !removedHooks) {
    if (!statusLine) {
      return { removed: false, reason: "missing", settingsPath };
    }

    return { removed: false, reason: "unmanaged", settingsPath };
  }

  await writeJsonFile(settingsPath, settings);
  toolConfig.install = {};
  await writeToolConfig(toolConfig, configPath);
  return {
    removed: true,
    reason: "removed",
    settingsPath,
    removedHooks,
    removedStatusLine: hasManagedStatusLine
  };
}
