import os from "node:os";
import path from "node:path";

import {
  TOOL_CONFIG_MANAGED_BY,
  TOOL_CONFIG_SCHEMA_VERSION,
  isValidDisplayMode,
  isValidStatusStyle,
  isValidTheme
} from "../shared/constants.js";
import { readJsonFile, writeJsonFile } from "../shared/jsonFile.js";
import { normalizeOptionalString } from "../shared/config.js";

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

  if (typeof base.ctxEnabled === "boolean") {
    normalized.ctxEnabled = base.ctxEnabled;
  }

  const authToken = normalizeOptionalString(base.authToken);
  if (authToken) {
    normalized.authToken = authToken;
  }

  const baseUrl = normalizeOptionalString(base.baseUrl);
  if (baseUrl) {
    normalized.baseUrl = baseUrl;
  }

  return normalized;
}

export async function readToolConfig(configPath = getToolConfigPath()) {
  const parsed = await readJsonFile(configPath, {});
  return normalizeToolConfig(parsed);
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
