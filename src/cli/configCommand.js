import readline from "node:readline/promises";

import {
  getToolConfigPath,
  readToolConfig,
  resetToolConfig
} from "../claude/settings.js";

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

export async function handleConfigReset(args, output, configPath) {
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
