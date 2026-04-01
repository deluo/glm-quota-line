import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { parseArgs } from "../src/cli/args.js";
import { loadConfig } from "../src/shared/config.js";
import {
  getDisplayToolConfig,
  readToolConfig,
  setToolConfigValue,
  unsetToolConfigValue
} from "../src/claude/settings.js";

const execFileAsync = promisify(execFile);

async function withTempDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "glm-quota-line-"));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("parseArgs accepts theme and palette flags", () => {
  const options = parseArgs(["--force", "--style", "bar", "--display=used", "--theme", "ansi", "--palette=mono"]);

  assert.deepEqual(options, {
    force: true,
    style: "bar",
    displayMode: "used",
    theme: "ansi",
    palette: "mono",
    positionals: []
  });
});

test("loadConfig reads theme and palette environment variables", () => {
  const config = loadConfig({
    ANTHROPIC_AUTH_TOKEN: "official-token",
    GLM_THEME: "ansi",
    GLM_PALETTE: "mono"
  });

  assert.equal(config.theme, "ansi");
  assert.equal(config.palette, "mono");
});

test("stored auth token and base url override Claude environment values", () => {
  const config = loadConfig(
    {
      ANTHROPIC_AUTH_TOKEN: "gateway-token",
      ANTHROPIC_BASE_URL: "https://gateway.example.com/api/anthropic"
    },
    {
      authToken: "real-token",
      baseUrl: "https://open.bigmodel.cn/api/anthropic"
    }
  );

  assert.equal(config.authorization, "real-token");
  assert.equal(config.anthropicBaseUrl, "https://open.bigmodel.cn/api/anthropic");
  assert.equal(config.quotaUrl, "https://open.bigmodel.cn/api/monitor/usage/quota/limit");
});

test("tool config persists theme and palette when set", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");

    await setToolConfigValue("theme", "ansi", configPath);
    await setToolConfigValue("palette", "mono", configPath);

    const config = await readToolConfig(configPath);
    assert.deepEqual(config, {
      schemaVersion: 1,
      managedBy: "glm-quota-line",
      theme: "ansi",
      palette: "mono",
      install: {}
    });
  });
});

test("tool config persists and clears manual auth overrides", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");

    await setToolConfigValue("authToken", "real-token", configPath);
    await setToolConfigValue("baseUrl", "https://open.bigmodel.cn/api/anthropic", configPath);

    let config = await readToolConfig(configPath);
    assert.equal(config.authToken, "real-token");
    assert.equal(config.baseUrl, "https://open.bigmodel.cn/api/anthropic");

    await unsetToolConfigValue("authToken", configPath);
    config = await readToolConfig(configPath);
    assert.equal("authToken" in config, false);
    assert.equal(config.baseUrl, "https://open.bigmodel.cn/api/anthropic");
  });
});

test("display config redacts stored auth tokens", () => {
  const displayConfig = getDisplayToolConfig({
    schemaVersion: 1,
    managedBy: "glm-quota-line",
    authToken: "real-secret-token",
    baseUrl: "https://open.bigmodel.cn/api/anthropic",
    install: {}
  });

  assert.equal(displayConfig.authToken, "real...oken");
  assert.equal(displayConfig.baseUrl, "https://open.bigmodel.cn/api/anthropic");
});

test("cli help includes command descriptions and examples", async () => {
  const scriptPath = path.resolve("src/cli/index.js");
  const { stdout } = await execFileAsync(process.execPath, [scriptPath, "--help"], {
    cwd: path.resolve(".")
  });

  assert.match(stdout, /Commands:/);
  assert.match(stdout, /Install glm-quota-line into Claude Code statusLine\.command\./);
  assert.match(stdout, /Options:/);
  assert.match(stdout, /--palette\s+ANSI palette: dark for dark terminals, mono for light terminals\./);
  assert.match(stdout, /Examples:/);
  assert.match(stdout, /glm-quota-line config set auth-token <your-real-token>/);
});
