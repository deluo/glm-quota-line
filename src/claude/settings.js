import os from "node:os";
import path from "node:path";

import {
  TOOL_CONFIG_MANAGED_BY,
  TOOL_CONFIG_SCHEMA_VERSION,
  isValidDisplayMode,
  isValidStatusStyle,
  isValidTheme,
  isValidWorkDays
} from "../shared/constants.js";
import { migrateOldConfig, needsMigration } from "../shared/migration.js";
import { normalizeOptionalString } from "../shared/utils.js";
import { readJsonFile, writeJsonFile } from "../shared/jsonFile.js";

function getClaudeDir() {
  return path.join(os.homedir(), ".claude");
}

export function getClaudeSettingsPath() {
  return path.join(getClaudeDir(), "settings.json");
}

export function getToolConfigPath() {
  return path.join(getClaudeDir(), "glm-quota-line.json");
}

function redactSecret(value) {
  if (!value) {
    return value;
  }

  if (value.length <= 8) {
    return "<stored>";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function normalizeToolConfig(config) {
  const base = config && typeof config === "object" ? config : {};
  const normalized = {
    schemaVersion: TOOL_CONFIG_SCHEMA_VERSION,
    managedBy: TOOL_CONFIG_MANAGED_BY,
    install: base.install && typeof base.install === "object" ? base.install : {}
  };

  if (isValidStatusStyle(base.style)) {
    normalized.style = base.style;
  }

  if (isValidDisplayMode(base.displayMode)) {
    normalized.displayMode = base.displayMode;
  }

  if (isValidTheme(base.theme)) {
    normalized.theme = base.theme;
  }

  if (isValidWorkDays(base.workDays)) {
    normalized.workDays = base.workDays;
  }

  if (typeof base.minimalist === "boolean") {
    normalized.minimalist = base.minimalist;
  }

  if (typeof base.rawValues === "boolean") {
    normalized.rawValues = base.rawValues;
  }

  const authToken = normalizeOptionalString(base.authToken);
  if (authToken) {
    normalized.authToken = authToken;
  }

  const baseUrl = normalizeOptionalString(base.baseUrl);
  if (baseUrl) {
    normalized.baseUrl = baseUrl;
  }

  // Preserve lines (component-level config) as-is
  if (base.lines && Array.isArray(base.lines)) {
    normalized.lines = base.lines;
  }

  return normalized;
}

export async function readToolConfig(configPath = getToolConfigPath()) {
  const parsed = await readJsonFile(configPath, {});
  const normalized = normalizeToolConfig(parsed);

  // Migrate legacy ctxEnabled to lines-based format
  if (needsMigration(parsed)) {
    const migrated = migrateOldConfig({
      ctxEnabled: parsed.ctxEnabled,
      theme: parsed.theme,
      displayMode: parsed.displayMode,
      style: parsed.style
    });
    normalized.lines = migrated.lines;
    await writeJsonFile(configPath, normalizeToolConfig({ ...parsed, lines: migrated.lines }));
  }

  return normalized;
}

export async function writeToolConfig(config, configPath = getToolConfigPath()) {
  await writeJsonFile(configPath, normalizeToolConfig(config));
}

export function getDisplayToolConfig(config) {
  const displayConfig = structuredClone(normalizeToolConfig(config));
  if (displayConfig.authToken) {
    displayConfig.authToken = redactSecret(displayConfig.authToken);
  }

  return displayConfig;
}

export async function setToolConfigValue(key, value, configPath = getToolConfigPath()) {
  const current = await readToolConfig(configPath);
  current[key] = value;
  await writeToolConfig(current, configPath);
  return current;
}

export async function unsetToolConfigValue(key, configPath = getToolConfigPath()) {
  const current = await readToolConfig(configPath);
  delete current[key];
  await writeToolConfig(current, configPath);
  return current;
}
