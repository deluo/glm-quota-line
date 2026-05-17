import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { saveTUIConfig } from "../src/tui/index.js";
import { readToolConfig } from "../src/claude/settings.js";
import { DEFAULT_LINES, DEFAULT_GLOBAL_CONFIG } from "../src/shared/constants.js";
import { withTempDir } from "./helpers.js";

test("runTUI outputs message when stdin is not a TTY", async () => {
  const { runTUI } = await import("../src/tui/index.js");
  let output = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => { output += chunk; return true; };
  try {
    await runTUI();
  } finally {
    process.stdout.write = originalWrite;
  }
  assert.match(output, /interactive terminal/);
});

test("saveTUIConfig writes complete config in a single write", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");
    const config = {
      global: {
        theme: "light",
        displayMode: "used",
        minimalist: true,
        rawValues: false
      },
      lines: DEFAULT_LINES
    };
    await saveTUIConfig(config, configPath);

    const saved = await readToolConfig(configPath);
    assert.equal(saved.theme, "light");
    assert.equal(saved.displayMode, "used");
    assert.equal(saved.minimalist, true);
    assert.ok(saved.lines);
    assert.equal(saved.lines[0].components.length, DEFAULT_LINES[0].components.length);
  });
});

test("saveTUIConfig omits default values from config file", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");
    const config = {
      global: {
        theme: DEFAULT_GLOBAL_CONFIG.theme,
        displayMode: DEFAULT_GLOBAL_CONFIG.displayMode,
        minimalist: DEFAULT_GLOBAL_CONFIG.minimalist,
        rawValues: DEFAULT_GLOBAL_CONFIG.rawValues
      },
      lines: DEFAULT_LINES
    };
    await saveTUIConfig(config, configPath);

    const saved = await readToolConfig(configPath);
    assert.equal(saved.theme, undefined);
    assert.equal(saved.displayMode, undefined);
    assert.equal(saved.minimalist, undefined);
    assert.equal(saved.rawValues, undefined);
    assert.ok(saved.lines);
  });
});
