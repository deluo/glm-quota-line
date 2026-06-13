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

test("parseArgs accepts theme and version flags", () => {
  const options = parseArgs([
    "--force",
    "--style",
    "bar",
    "--display=used",
    "--theme",
    "mono",
    "--version"
  ]);

  assert.deepEqual(options, {
    force: true,
    style: "bar",
    displayMode: "used",
    theme: "mono",
    version: true,
    positionals: []
  });
});

test("stored auth token and base url override Claude environment values", async () => {
  const config = await loadConfig(
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
  assert.equal(config.quotaUrl, "https://open.bigmodel.cn/api/monitor/usage/quota/limit");
});

test("tool config persists theme when set", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");

    await setToolConfigValue("theme", "light", configPath);

    const config = await readToolConfig(configPath);
    assert.deepEqual(config, {
      schemaVersion: 1,
      managedBy: "glm-quota-line",
      theme: "light",
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
  assert.match(stdout, /--theme\s+Theme preset: dark, light, or mono/);
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

test("handleCommand returns false for configure command", async () => {
  const handled = await handleCommand(
    { positionals: ["configure"] },
    { write() {} }
  );
  assert.equal(handled, false);
});

test("readToolConfig auto-migrates legacy ctxEnabled to lines format", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");
    const fs = await import("node:fs/promises");
    await fs.writeFile(configPath, JSON.stringify({
      schemaVersion: 1,
      managedBy: "glm-quota-line",
      ctxEnabled: false,
      theme: "light",
      style: "text",
      install: {}
    }, null, 2));

    const config = await readToolConfig(configPath);
    assert.equal(config.ctxEnabled, undefined);
    assert.ok(config.lines);
    assert.strictEqual(config.lines[0].components[4].enabled, false);

    // Verify persisted file no longer has ctxEnabled
    const raw = JSON.parse(await fs.readFile(configPath, "utf8"));
    assert.equal("ctxEnabled" in raw, false);
  });
});

// --- model subcommand tests ---
// All write tests inject a temp configPath via dependencies so they never
// touch the user's real ~/.claude/glm-quota-line.json.

test("model list shows default models", async () => {
  let output = "";
  await handleCommand(
    { positionals: ["model", "list"] },
    { write(chunk) { output += chunk; } }
  );
  assert.match(output, /glm-4\.7\s+200K/);
  assert.match(output, /glm-5\.2\s+1M/);
});

test("model set writes to the injected config path", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");

    let output = "";
    await handleCommand(
      { positionals: ["model", "set", "glm-test", "300K"] },
      { write(chunk) { output += chunk; } },
      { configPath }
    );
    assert.match(output, /Set glm-test = 300K/);
    assert.match(output, new RegExp(`config: ${configPath}`));

    // persisted to the temp file, not the real config
    const config = await readToolConfig(configPath);
    assert.deepEqual(config.modelMap, { "glm-test": 300000 });
  });
});

test("model set formats 1M+ sizes with M suffix", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");

    let output = "";
    await handleCommand(
      { positionals: ["model", "set", "glm-1m", "1000000"] },
      { write(chunk) { output += chunk; } },
      { configPath }
    );
    assert.match(output, /Set glm-1m = 1M/);

    const config = await readToolConfig(configPath);
    assert.equal(config.modelMap["glm-1m"], 1000000);
  });
});

test("model set then get round-trip via injected config", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");

    await handleCommand(
      { positionals: ["model", "set", "glm-custom", "50000"] },
      { write() {} },
      { configPath }
    );

    let output = "";
    await handleCommand(
      { positionals: ["model", "get", "glm-custom"] },
      { write(chunk) { output += chunk; } },
      { configPath }
    );
    assert.match(output, /glm-custom\s+50K\s+\(custom\)/);
  });
});

test("model remove deletes a custom mapping", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");

    await handleCommand(
      { positionals: ["model", "set", "glm-temp", "100000"] },
      { write() {} },
      { configPath }
    );
    let output = "";
    await handleCommand(
      { positionals: ["model", "remove", "glm-temp"] },
      { write(chunk) { output += chunk; } },
      { configPath }
    );
    assert.match(output, /Removed glm-temp/);

    const config = await readToolConfig(configPath);
    assert.equal(config.modelMap, undefined);
  });
});

test("model remove on built-in reverts to default", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");

    let output = "";
    await handleCommand(
      { positionals: ["model", "remove", "glm-4.7"] },
      { write(chunk) { output += chunk; } },
      { configPath }
    );
    assert.match(output, /Removed glm-4\.7 \(reverted to default\)/);
  });
});

test("model get shows model size with source", async () => {
  let output = "";
  await handleCommand(
    { positionals: ["model", "get", "glm-4.7"] },
    { write(chunk) { output += chunk; } }
  );
  assert.match(output, /glm-4\.7\s+200K\s+\(default\)/);
});

test("model get returns error for unknown model", async () => {
  let output = "";
  await handleCommand(
    { positionals: ["model", "get", "nonexistent"] },
    { write(chunk) { output += chunk; } }
  );
  assert.match(output, /not found/);
  process.exitCode = 0;
});

test("model set rejects invalid size", async () => {
  let output = "";
  await handleCommand(
    { positionals: ["model", "set", "glm-test", "abc"] },
    { write(chunk) { output += chunk; } }
  );
  assert.match(output, /Invalid size/);
  process.exitCode = 0;
});

test("model set accepts K suffix case-insensitively", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");

    let output = "";
    await handleCommand(
      { positionals: ["model", "set", "glm-test", "300k"] },
      { write(chunk) { output += chunk; } },
      { configPath }
    );
    assert.match(output, /Set glm-test = 300K/);
  });
});

test("model subcommand shows help for unknown action", async () => {
  let output = "";
  await handleCommand(
    { positionals: ["model", "unknown"] },
    { write(chunk) { output += chunk; } }
  );
  assert.match(output, /Supported model subcommands/);
  process.exitCode = 0;
});
