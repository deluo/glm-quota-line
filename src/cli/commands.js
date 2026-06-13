import {
  isValidDisplayMode,
  isValidResetFormat,
  isValidStatusStyle,
  isValidTheme,
  isValidWorkDays
} from "../shared/constants.js";
import {
  getDisplayToolConfig,
  getToolConfigPath,
  readToolConfig,
  resetToolConfig,
  setToolConfigValue,
  unsetToolConfigValue
} from "../claude/settings.js";
import { installClaudeStatusLine, uninstallClaudeStatusLine } from "../claude/install.js";
import { refreshQuotaOnSessionStart } from "../claude/sessionStart.js";
import { checkForUpdates } from "./update.js";
import { getPackageVersion } from "../shared/packageInfo.js";
import { getDefaultModels } from "../core/context/models.js";
import readline from "node:readline/promises";

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

function isValidBaseUrl(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }

  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const CONFIG_KEYS = {
  style: {
    property: "style",
    validate: isValidStatusStyle,
    invalidMessage: "Invalid style. Use: text, compact, or bar."
  },
  display: {
    property: "displayMode",
    validate: isValidDisplayMode,
    invalidMessage: "Invalid display. Use: left or used."
  },
  theme: {
    property: "theme",
    validate: isValidTheme,
    invalidMessage: "Invalid theme. Use: dark, light, or mono."
  },
  "auth-token": {
    property: "authToken",
    validate: isNonEmptyString,
    invalidMessage: "Invalid auth-token. Provide a non-empty token.",
    displayValue: "<stored>"
  },
  "base-url": {
    property: "baseUrl",
    validate: isValidBaseUrl,
    invalidMessage:
      "Invalid base-url. Provide a full URL such as https://open.bigmodel.cn/api/anthropic."
  },
  "work-days": {
    property: "workDays",
    validate: (v) => isValidWorkDays(parseInt(v, 10)),
    invalidMessage: "Invalid work-days. Use a number between 1 and 7.",
    transform: (v) => parseInt(v, 10)
  },
  "minimalist": {
    property: "minimalist",
    validate: (v) => v === "true" || v === "false",
    invalidMessage: "Invalid minimalist. Use: true or false.",
    transform: (v) => v === "true"
  },
  "raw-values": {
    property: "rawValues",
    validate: (v) => v === "true" || v === "false",
    invalidMessage: "Invalid raw-values. Use: true or false.",
    transform: (v) => v === "true"
  },
  "reset-format": {
    property: "resetFormat",
    validate: isValidResetFormat,
    invalidMessage: "Invalid reset-format. Use: time or countdown."
  }
};

export async function handleCommand(args, output = process.stdout, dependencies = {}) {
  const getVersion = dependencies.getVersion || getPackageVersion;
  const runUpdateCheck = dependencies.runUpdateCheck || checkForUpdates;
  const [command, subcommand, key, value] = args.positionals;

  if (command === "version") {
    output.write(`glm-quota-line ${await getVersion()}\n`);
    return true;
  }

  if (command === "check-update") {
    const result = await runUpdateCheck();
    output.write(`glm-quota-line ${result.currentVersion}\n`);

    if (result.status === "up-to-date") {
      output.write(`latest: ${result.latestVersion}\nstatus: up to date\n`);
      return true;
    }

    if (result.status === "update-available") {
      output.write(
        `latest: ${result.latestVersion}\nstatus: update available\nupgrade: ${result.upgradeCommand}\n`
      );
      return true;
    }

    output.write(`status: unable to check updates\nreason: ${result.errorMessage}\n`);
    return true;
  }

  if (command === "install") {
    const result = await installClaudeStatusLine(undefined, undefined, undefined, {
      force: Boolean(args.force)
    });
    if (!result.installed && result.reason === "unmanaged_exists") {
      output.write(
        `Skipped install because Claude Code already has an unmanaged statusLine.\nsettings: ${result.settingsPath}\nRun 'glm-quota-line install --force' to replace it and back it up.\n`
      );
      return true;
    }

    output.write(
      `Installed Claude Code status line and SessionStart hooks.\nsettings: ${result.settingsPath}\nstatusLine: ${result.command}\nsessionStart: ${result.sessionStartHookCommand}\n`
    );
    return true;
  }

  if (command === "uninstall") {
    const result = await uninstallClaudeStatusLine();
    if (result.removed) {
      output.write(`Removed Claude Code status line.\nsettings: ${result.settingsPath}\n`);
      return true;
    }

    if (result.reason === "unmanaged") {
      output.write(
        `Skipped uninstall because current statusLine is not managed by glm-quota-line.\nsettings: ${result.settingsPath}\n`
      );
      return true;
    }

    output.write(`No Claude Code status line was configured.\nsettings: ${result.settingsPath}\n`);
    return true;
  }

  if (command === "session-start-refresh") {
    try {
      await refreshQuotaOnSessionStart();
    } catch {}
    return true;
  }

  if (command === "config" && subcommand === "show") {
    const config = await readToolConfig();
    output.write(`${JSON.stringify(getDisplayToolConfig(config), null, 2)}\n`);
    return true;
  }

  if (command === "config" && subcommand === "set") {
    const configKey = CONFIG_KEYS[key];
    if (!configKey) {
      process.exitCode = 1;
      output.write("Supported config keys: style, display, theme, auth-token, base-url, work-days, minimalist, raw-values\n");
      return true;
    }

    if (!configKey.validate(value)) {
      process.exitCode = 1;
      output.write(`${configKey.invalidMessage}\n`);
      return true;
    }

    const config = await setToolConfigValue(
      configKey.property,
      configKey.transform ? configKey.transform(value) : value
    );
    output.write(
      `Saved ${key}=${configKey.displayValue || config[configKey.property]}\nconfig: ${getToolConfigPath()}\n`
    );
    return true;
  }

  if (command === "config" && subcommand === "unset") {
    const configKey = CONFIG_KEYS[key];
    if (!configKey) {
      process.exitCode = 1;
      output.write("Supported config keys: style, display, theme, auth-token, base-url, work-days, minimalist, raw-values\n");
      return true;
    }

    await unsetToolConfigValue(configKey.property);
    output.write(`Removed ${key}\nconfig: ${getToolConfigPath()}\n`);
    return true;
  }

  if (command === "config" && subcommand === "reset") {
    return handleConfigReset(args, output, dependencies.configPath);
  }

  if (command === "config") {
    process.exitCode = 1;
    output.write("Supported config subcommands: show, set, unset, reset\n");
    return true;
  }

  if (command === "model") {
    return handleModelCommand(subcommand, key, value, output, dependencies.configPath);
  }

  if (command === "configure") {
    return false;
  }

  if (command) {
    process.exitCode = 1;
    output.write(`Unknown command: ${command}\nRun 'glm-quota-line -h' for usage.\n`);
    return true;
  }

  return false;
}

// Keys considered "user config" for the reset summary (install/schema/managedBy are preserved).
const RESET_USER_KEYS = [
  "style",
  "displayMode",
  "theme",
  "workDays",
  "minimalist",
  "rawValues",
  "resetFormat",
  "authToken",
  "baseUrl"
];

async function handleConfigReset(args, output, configPath) {
  const modelsOnly = Boolean(args.models);
  const skipConfirm = Boolean(args.yes);
  const targetPath = configPath || getToolConfigPath();
  const config = await readToolConfig(targetPath);

  if (modelsOnly) {
    const count = config.modelMap ? Object.keys(config.modelMap).length : 0;
    if (count === 0) {
      output.write("No custom model mappings to reset.\n");
      return true;
    }
    if (!skipConfirm && !(await confirmReset(`Reset ${count} custom model mapping(s)? [y/N] `, output))) {
      output.write("Aborted.\n");
      return true;
    }
    await resetToolConfig({ modelsOnly: true }, targetPath);
    output.write(`Reset ${count} custom model mapping(s).\nconfig: ${targetPath}\n`);
    return true;
  }

  const setKeys = RESET_USER_KEYS.filter((k) => config[k] !== undefined);
  const modelCount = config.modelMap ? Object.keys(config.modelMap).length : 0;
  const hasLines = Array.isArray(config.lines) && config.lines.length > 0;

  if (setKeys.length === 0 && modelCount === 0 && !hasLines) {
    output.write("Nothing to reset — config is already at defaults.\n");
    return true;
  }

  const parts = [];
  if (setKeys.length > 0) {
    parts.push(`${setKeys.length} config key(s) (${setKeys.join(", ")})`);
  }
  if (modelCount > 0) {
    parts.push(`${modelCount} custom model mapping(s)`);
  }
  if (hasLines) {
    parts.push("component layout (lines)");
  }

  if (!skipConfirm && !(await confirmReset(`This will remove: ${parts.join(", ")}. Continue? [y/N] `, output))) {
    output.write("Aborted.\n");
    return true;
  }

  await resetToolConfig({ modelsOnly: false }, targetPath);
  output.write(`Reset ${parts.join(", ")} to defaults.\nconfig: ${targetPath}\n`);
  return true;
}

async function confirmReset(prompt, output) {
  if (!process.stdin.isTTY) {
    process.exitCode = 1;
    output.write("config reset is destructive; pass --yes to skip confirmation in non-interactive sessions.\n");
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
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

async function handleModelCommand(subcommand, modelId, value, output, configPath) {
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

  if (subcommand === "import") {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    if (!raw) {
      process.exitCode = 1;
      output.write("No input received from stdin.\n");
      return true;
    }
    let imported;
    try {
      imported = JSON.parse(raw);
    } catch {
      process.exitCode = 1;
      output.write("Invalid JSON input.\n");
      return true;
    }
    if (!imported || typeof imported !== "object" || Array.isArray(imported)) {
      process.exitCode = 1;
      output.write("Input must be a JSON object, e.g. {\"glm-5.2\": 300000}.\n");
      return true;
    }
    const validMap = {};
    for (const [id, size] of Object.entries(imported)) {
      if (typeof id === "string" && id && typeof size === "number" && size > 0 && Number.isInteger(size)) {
        validMap[id] = size;
      }
    }
    if (Object.keys(validMap).length === 0) {
      process.exitCode = 1;
      output.write("No valid model entries found in input.\n");
      return true;
    }
    const config = await readToolConfig(configPath);
    const modelMap = { ...(config.modelMap || {}), ...validMap };
    await setToolConfigValue("modelMap", modelMap, configPath);
    output.write(`Imported ${Object.keys(validMap).length} model(s) into modelMap.\nconfig: ${configPath || getToolConfigPath()}\n`);
    return true;
  }

  process.exitCode = 1;
  output.write("Supported model subcommands: list, get, set, remove, import\n");
  return true;
}
