import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { parseArgs } from "../src/cli/args.js";
import { loadConfig } from "../src/shared/config.js";
import { handleCommand } from "../src/cli/commands.js";
import { compareVersions } from "../src/cli/update.js";
import {
  getDisplayToolConfig,
  readToolConfig,
  setToolConfigValue,
  unsetToolConfigValue
} from "../src/claude/settings.js";
import { getPackageVersion } from "../src/shared/packageInfo.js";
import { withTempDir } from "./helpers.js";

const execFileAsync = promisify(execFile);

test("parseArgs accepts theme, palette, and version flags", () => {
  const options = parseArgs([
    "--force",
    "--style",
    "bar",
    "--display=used",
    "--theme",
    "ansi",
    "--palette=mono",
    "--version"
  ]);

  assert.deepEqual(options, {
    force: true,
    style: "bar",
    displayMode: "used",
    theme: "ansi",
    palette: "mono",
    version: true,
    positionals: []
  });
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

test("version command prints the installed package version", async () => {
  let output = "";
  const handled = await handleCommand(
    { positionals: ["version"] },
    {
      write(chunk) {
        output += chunk;
      }
    }
  );

  assert.equal(handled, true);
  assert.equal(output, `glm-quota-line ${await getPackageVersion()}\n`);
});

test("check-update prints upgrade instructions when a newer version exists", async () => {
  let output = "";
  const handled = await handleCommand(
    { positionals: ["check-update"] },
    {
      write(chunk) {
        output += chunk;
      }
    },
    {
      runUpdateCheck: async () => ({
        currentVersion: "0.6.0",
        latestVersion: "0.7.0",
        status: "update-available",
        upgradeCommand: "npm install -g glm-quota-line"
      })
    }
  );

  assert.equal(handled, true);
  assert.equal(
    output,
    "glm-quota-line 0.6.0\nlatest: 0.7.0\nstatus: update available\nupgrade: npm install -g glm-quota-line\n"
  );
});

test("check-update reports when the installed version is current", async () => {
  let output = "";
  const handled = await handleCommand(
    { positionals: ["check-update"] },
    {
      write(chunk) {
        output += chunk;
      }
    },
    {
      runUpdateCheck: async () => ({
        currentVersion: "0.6.0",
        latestVersion: "0.6.0",
        status: "up-to-date"
      })
    }
  );

  assert.equal(handled, true);
  assert.equal(output, "glm-quota-line 0.6.0\nlatest: 0.6.0\nstatus: up to date\n");
});

test("check-update prints a short failure reason when registry lookup fails", async () => {
  let output = "";
  const handled = await handleCommand(
    { positionals: ["check-update"] },
    {
      write(chunk) {
        output += chunk;
      }
    },
    {
      runUpdateCheck: async () => ({
        currentVersion: "0.6.0",
        latestVersion: null,
        status: "error",
        errorMessage: "npm registry request failed"
      })
    }
  );

  assert.equal(handled, true);
  assert.equal(
    output,
    "glm-quota-line 0.6.0\nstatus: unable to check updates\nreason: npm registry request failed\n"
  );
});

test("compareVersions prefers stable releases over prereleases", () => {
  assert.equal(compareVersions("0.6.0", "0.6.0"), 0);
  assert.ok(compareVersions("0.7.0", "0.6.9") > 0);
  assert.ok(compareVersions("0.7.0-beta.1", "0.7.0") < 0);
});

test("cli help includes command descriptions and examples", async () => {
  const scriptPath = path.resolve("src/cli/index.js");
  const { stdout } = await execFileAsync(process.execPath, [scriptPath, "--help"], {
    cwd: path.resolve(".")
  });

  assert.match(stdout, /Commands:/);
  assert.match(stdout, /Install glm-quota-line into Claude Code statusLine\.command and SessionStart hooks\./);
  assert.match(stdout, /version\s+Print the installed glm-quota-line version\./);
  assert.match(stdout, /check-update\s+Check npm for a newer version and print the upgrade command\./);
  assert.match(stdout, /Options:/);
  assert.match(stdout, /-v, --version\s+Show the installed version\./);
  assert.match(stdout, /--palette\s+ANSI palette: dark for dark terminals, mono for light terminals\./);
  assert.match(stdout, /Examples:/);
  assert.match(stdout, /glm-quota-line --version/);
  assert.match(stdout, /glm-quota-line check-update/);
  assert.match(stdout, /glm-quota-line config set auth-token <your-real-token>/);
});

test("cli --version prints the installed package version", async () => {
  const scriptPath = path.resolve("src/cli/index.js");
  const { stdout } = await execFileAsync(process.execPath, [scriptPath, "--version"], {
    cwd: path.resolve(".")
  });

  assert.equal(stdout, `glm-quota-line ${await getPackageVersion()}\n`);
});
