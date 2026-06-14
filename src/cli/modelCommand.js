import {
  getDisplayToolConfig,
  getToolConfigPath,
  readToolConfig,
  setToolConfigValue,
  unsetToolConfigValue
} from "../claude/settings.js";
import { getDefaultModels } from "../core/context/models.js";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function parseModelSize(raw) {
  if (typeof raw !== "string") {
    return null;
  }
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*[kK]$/);
  if (match) {
    return Math.round(Number(match[1]) * 1000);
  }
  const num = Number(raw);
  if (Number.isFinite(num) && num > 0 && Number.isInteger(num)) {
    return num;
  }
  return null;
}

function formatSize(size) {
  if (size >= 1000000 && size % 1000000 === 0) {
    return `${size / 1000000}M`;
  }
  if (size >= 1000 && size % 1000 === 0) {
    return `${size / 1000}K`;
  }
  return String(size);
}

export async function handleModelCommand(subcommand, modelId, value, output, configPath) {
  if (subcommand === "list") {
    const config = await readToolConfig(configPath);
    const defaults = getDefaultModels();
    const merged = { ...defaults, ...config.modelMap };
    const entries = Object.entries(merged).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) {
      output.write("No models configured.\n");
      return true;
    }
    const maxModelLen = Math.max(...entries.map(([id]) => id.length));
    for (const [id, size] of entries) {
      const source = id in (config.modelMap || {}) ? "custom" : "default";
      const marker = source === "custom" ? " *" : "";
      output.write(`${id.padEnd(maxModelLen)}  ${formatSize(size)}${marker}\n`);
    }
    output.write("\n* = user-configured\n");
    return true;
  }

  if (subcommand === "get") {
    if (!modelId) {
      process.exitCode = 1;
      output.write("Usage: glm-quota-line model get <model-id>\n");
      return true;
    }
    const config = await readToolConfig(configPath);
    const defaults = getDefaultModels();
    const size = config.modelMap?.[modelId] ?? defaults[modelId];
    if (size == null) {
      process.exitCode = 1;
      output.write(`Model "${modelId}" not found.\n`);
      return true;
    }
    const source = config.modelMap?.[modelId] != null ? "custom" : "default";
    output.write(`${modelId}  ${formatSize(size)}  (${source})\n`);
    return true;
  }

  if (subcommand === "set") {
    if (!modelId || !value) {
      process.exitCode = 1;
      output.write("Usage: glm-quota-line model set <model-id> <size>\n");
      return true;
    }
    const size = parseModelSize(value);
    if (size == null) {
      process.exitCode = 1;
      output.write("Invalid size. Use a positive integer or a value like 300K.\n");
      return true;
    }
    const config = await readToolConfig(configPath);
    const modelMap = { ...(config.modelMap || {}), [modelId]: size };
    await setToolConfigValue("modelMap", modelMap, configPath);
    output.write(`Set ${modelId} = ${formatSize(size)}\nconfig: ${configPath || getToolConfigPath()}\n`);
    return true;
  }

  if (subcommand === "remove") {
    if (!modelId) {
      process.exitCode = 1;
      output.write("Usage: glm-quota-line model remove <model-id>\n");
      return true;
    }
    const config = await readToolConfig(configPath);
    const modelMap = { ...(config.modelMap || {}) };
    const defaults = getDefaultModels();
    if (!(modelId in modelMap) && !(modelId in defaults)) {
      process.exitCode = 1;
      output.write(`Model "${modelId}" not found.\n`);
      return true;
    }
    delete modelMap[modelId];
    if (Object.keys(modelMap).length > 0) {
      await setToolConfigValue("modelMap", modelMap, configPath);
    } else {
      await unsetToolConfigValue("modelMap", configPath);
    }
    const reverted = modelId in defaults ? " (reverted to default)" : "";
    output.write(`Removed ${modelId}${reverted}\nconfig: ${configPath || getToolConfigPath()}\n`);
    return true;
  }

  process.exitCode = 1;
  output.write("Supported model subcommands: list, get, set, remove\n");
  return true;
}

export { isNonEmptyString };
