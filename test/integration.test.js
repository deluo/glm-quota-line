import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Readable } from "node:stream";

import { loadConfig } from "../src/shared/config.js";
import { formatStatus } from "../src/core/status/format.js";
import { parseArgs } from "../src/cli/args.js";
import { readStatusLineInput } from "../src/claude/input.js";
import { resolveQuotaStatus } from "../src/core/quota/service.js";
import {
  buildManagedSessionStartRefreshCommand,
  buildManagedStatusLineCommand,
  installClaudeStatusLine,
  uninstallClaudeStatusLine
} from "../src/claude/install.js";
import {
  readToolConfig,
  setToolConfigValue
} from "../src/claude/settings.js";
import { refreshQuotaOnSessionStart } from "../src/claude/sessionStart.js";
import { createQuotaConfig, makeJsonResponse, withTempDir } from "./helpers.js";

const SUCCESS_BODY = {
  code: 200,
  msg: "操作成功",
  data: {
    limits: [
      {
        type: "TOKENS_LIMIT",
        unit: 3,
        number: 5,
        percentage: 9,
        nextResetTime: 1774939627716
      },
      {
        type: "TOKENS_LIMIT",
        unit: 4,
        number: 1,
        percentage: 53,
        nextResetTime: 1777518607977
      }
    ],
    level: "lite"
  },
  success: true
};

const LEGACY_SUCCESS_BODY = {
  code: 200,
  msg: "操作成功",
  data: {
    limits: [
      {
        type: "TOKENS_LIMIT",
        unit: 3,
        number: 5,
        percentage: 2,
        nextResetTime: 1775334953513
      },
      {
        type: "TIME_LIMIT",
        unit: 5,
        number: 1,
        usage: 100,
        currentValue: 38,
        remaining: 62,
        percentage: 38,
        nextResetTime: 1777518607998
      }
    ],
    level: "lite"
  },
  success: true
};

test("formats a successful response and writes cache", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    let fetchCalls = 0;

    const result = await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1774936504000,
      fetchImpl: async () => {
        fetchCalls += 1;
        return makeJsonResponse(SUCCESS_BODY);
      }
    });

    assert.equal(fetchCalls, 1);
    assert.equal(result.kind, "success");
    assert.equal(result.display, "percent");
    assert.equal(result.primaryQuotaKey, "token_5h");
    assert.equal(result.quotas.length, 2);
    assert.equal(formatStatus(result, { theme: "plain" }), "GLM Lite | 5h 91% | week 47% | reset 14:47");
    assert.equal(
      formatStatus(result, { theme: "plain", displayMode: "used" }),
      "GLM Lite | 5h used 9% | week 47% | reset 14:47"
    );
    assert.equal(
      formatStatus(result, { theme: "plain", displayMode: "both" }),
      "GLM Lite | 5h left 91% used 9% | week 47% | reset 14:47"
    );
    assert.equal(formatStatus(result, { theme: "plain", style: "compact" }), "GLM 5h 91% W 47% | 14:47");
    assert.equal(
      formatStatus(result, { theme: "plain", style: "bar", barWidth: 10 }),
      "GLM Lite █░░░░░░░░░ 91% | W 47% | 14:47"
    );

    const cached = JSON.parse(await fs.readFile(cacheFilePath, "utf8"));
    assert.equal(cached.result.kind, "success");
    assert.equal(cached.result.leftPercent, 91);
    assert.equal(cached.result.quotas.length, 2);
  });
});

test("formats the legacy package response by ignoring TIME_LIMIT", async () => {
  await withTempDir(async (dir) => {
    const result = await resolveQuotaStatus(createQuotaConfig(path.join(dir, "cache.json")), {
      fetchImpl: async () => makeJsonResponse(LEGACY_SUCCESS_BODY)
    });

    assert.equal(result.kind, "success");
    assert.equal(result.quotas.length, 1);
    assert.equal(formatStatus(result, { theme: "plain" }), "GLM Lite | 5h 98% | reset 04:35");
  });
});

test("returns auth expired without fetching when Authorization is missing", async () => {
  await withTempDir(async (dir) => {
    let fetchCalls = 0;

    const result = await resolveQuotaStatus(createQuotaConfig(path.join(dir, "cache.json"), ""), {
      fetchImpl: async () => {
        fetchCalls += 1;
        return makeJsonResponse(SUCCESS_BODY);
      }
    });

    assert.equal(fetchCalls, 0);
    assert.equal(formatStatus(result, { theme: "plain" }), "GLM | auth expired");
  });
});

test("returns fresh cached value without hitting the network", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await fs.writeFile(
      cacheFilePath,
      JSON.stringify(
        {
          savedAt: 1774936504000,
          result: {
            kind: "success",
            level: "lite",
            display: "percent",
            leftPercent: 88,
            nextResetTime: 1774939627716
          }
        },
        null,
        2
      )
    );

    let fetchCalls = 0;
    const result = await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1774936505000,
      fetchImpl: async () => {
        fetchCalls += 1;
        return makeJsonResponse(SUCCESS_BODY);
      }
    });

    assert.equal(fetchCalls, 0);
    assert.equal(formatStatus(result, { theme: "plain" }), "GLM Lite | 5h 88% | reset 14:47");
  });
});

test("falls back to stale cache on unavailable responses", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await fs.writeFile(
      cacheFilePath,
      JSON.stringify(
        {
          savedAt: 1774930000000,
          result: {
            kind: "success",
            level: "lite",
            display: "percent",
            leftPercent: 77,
            nextResetTime: 1774939627716
          }
        },
        null,
        2
      )
    );

    const result = await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1774936505000,
      fetchImpl: async () => ({
        status: 200,
        async text() {
          return "not-json";
        }
      })
    });

    assert.equal(formatStatus(result, { theme: "plain" }), "GLM Lite | 5h 77% | reset 14:47");
  });
});

test("auth failures do not reuse stale cache", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await fs.writeFile(
      cacheFilePath,
      JSON.stringify(
        {
          savedAt: 1774930000000,
          result: {
            kind: "success",
            level: "lite",
            display: "percent",
            leftPercent: 77,
            nextResetTime: 1774939627716
          }
        },
        null,
        2
      )
    );

    const result = await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1774936505000,
      fetchImpl: async () =>
        makeJsonResponse({
          code: 1001,
          msg: "Header中未收到Authorization参数，无法进行身份验证。",
          success: false
        })
    });

    assert.equal(formatStatus(result, { theme: "plain" }), "GLM | auth expired");
  });
});

test("invalid tokens are treated as auth failures", async () => {
  await withTempDir(async (dir) => {
    const result = await resolveQuotaStatus(createQuotaConfig(path.join(dir, "cache.json")), {
      fetchImpl: async () =>
        makeJsonResponse({
          code: 401,
          msg: "令牌已过期或验证不正确",
          success: false
        })
    });

    assert.equal(formatStatus(result, { theme: "plain" }), "GLM | auth expired");
  });
});

test("returns quota unavailable when no cache exists and the response is malformed", async () => {
  await withTempDir(async (dir) => {
    const result = await resolveQuotaStatus(createQuotaConfig(path.join(dir, "cache.json")), {
      fetchImpl: async () => makeJsonResponse({ success: true, data: { limits: [] } })
    });

    assert.equal(formatStatus(result, { theme: "plain" }), "GLM | quota unavailable");
  });
});

test("ignores TIME_LIMIT-only payloads and returns unavailable", async () => {
  await withTempDir(async (dir) => {
    const result = await resolveQuotaStatus(createQuotaConfig(path.join(dir, "cache.json")), {
      fetchImpl: async () =>
        makeJsonResponse({
          code: 200,
          msg: "操作成功",
          success: true,
          data: {
            level: "lite",
            limits: [
              {
                type: "TIME_LIMIT",
                unit: 5,
                usage: 100,
                currentValue: 10,
                remaining: 90,
                nextResetTime: 1777518607977
              }
            ]
          }
        })
    });

    assert.equal(result.kind, "unavailable");
    assert.equal(formatStatus(result, { theme: "plain" }), "GLM | quota unavailable");
  });
});

test("parses CLI args for style and display", () => {
  const options = parseArgs(["--force", "--style", "bar", "--display=used"]);

  assert.deepEqual(options, {
    force: true,
    style: "bar",
    displayMode: "used",
    positionals: []
  });
});

test("official domestic environment variables take priority and derive the quota URL", () => {
  const config = loadConfig({
    ANTHROPIC_AUTH_TOKEN: "official-token",
    ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic"
  });

  assert.equal(config.authorization, "official-token");
  assert.equal(config.quotaUrl, "https://open.bigmodel.cn/api/monitor/usage/quota/limit");
  assert.equal(config.cacheTtlMs, 600_000);
  assert.ok(config.cacheFilePath.endsWith(".json"));
  assert.ok(!config.cacheFilePath.endsWith("cache.json"));
});

test("official international environment variables derive the z.ai quota URL", () => {
  const config = loadConfig({
    ANTHROPIC_AUTH_TOKEN: "official-token",
    ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic"
  });

  assert.equal(config.authorization, "official-token");
  assert.equal(config.quotaUrl, "https://api.z.ai/api/monitor/usage/quota/limit");
});

test("default quota URL keeps the legacy domestic fallback when base url is absent", () => {
  const config = loadConfig({
    ANTHROPIC_AUTH_TOKEN: "official-token"
  });

  assert.equal(config.authorization, "official-token");
  assert.equal(config.quotaUrl, "https://bigmodel.cn/api/monitor/usage/quota/limit");
});

test("picks the earliest-reset non-5h token window as the weekly quota when extra token limits exist", async () => {
  await withTempDir(async (dir) => {
    const result = await resolveQuotaStatus(createQuotaConfig(path.join(dir, "cache.json")), {
      fetchImpl: async () =>
        makeJsonResponse({
          code: 200,
          msg: "操作成功",
          success: true,
          data: {
            level: "pro",
            limits: [
              {
                type: "TOKENS_LIMIT",
                unit: 3,
                number: 5,
                percentage: 9,
                nextResetTime: 1774939627716
              },
              {
                type: "TOKENS_LIMIT",
                unit: 4,
                number: 30,
                percentage: 60,
                nextResetTime: 1778118607977
              },
              {
                type: "TOKENS_LIMIT",
                unit: 4,
                number: 1,
                percentage: 53,
                nextResetTime: 1777518607977
              }
            ]
          }
        })
    });

    assert.equal(result.kind, "success");
    assert.equal(result.quotas.length, 2);
    assert.equal(result.quotas[0].key, "token_5h");
    assert.equal(result.quotas[1].key, "token_week");
    assert.equal(result.quotas[1].leftPercent, 47);
    assert.equal(formatStatus(result, { theme: "plain" }), "GLM Pro | 5h 91% | week 47% | reset 14:47");
  });
});

test("token quota prefers explicit remaining counters over ambiguous percentage semantics", async () => {
  await withTempDir(async (dir) => {
    const result = await resolveQuotaStatus(createQuotaConfig(path.join(dir, "cache.json")), {
      fetchImpl: async () =>
        makeJsonResponse({
          code: 200,
          msg: "操作成功",
          success: true,
          data: {
            level: "lite",
            limits: [
              {
                type: "TOKENS_LIMIT",
                unit: 3,
                number: 5,
                usage: 100,
                currentValue: 10,
                remaining: 90,
                percentage: 90,
                nextResetTime: 1774939627716
              }
            ]
          }
        })
    });

    assert.equal(result.kind, "success");
    assert.equal(result.leftPercent, 90);
    assert.equal(result.usedPercent, 10);
    assert.equal(formatStatus(result, { theme: "plain" }), "GLM Lite | 5h 90% | reset 14:47");
  });
});

test("different tokens produce different cache file paths", () => {
  const configA = loadConfig({ ANTHROPIC_AUTH_TOKEN: "token-alpha" });
  const configB = loadConfig({ ANTHROPIC_AUTH_TOKEN: "token-beta" });
  const configEmpty = loadConfig({});

  assert.notEqual(configA.cacheFilePath, configB.cacheFilePath);
  assert.notEqual(configA.cacheFilePath, configEmpty.cacheFilePath);
  assert.ok(configEmpty.cacheFilePath.includes("anonymous"));
});

test("fresh cache does not trigger a network request", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await fs.writeFile(
      cacheFilePath,
      JSON.stringify(
        {
          savedAt: 1774936504000,
          result: {
            kind: "success",
            level: "lite",
            display: "percent",
            leftPercent: 88,
            usedPercent: 12,
            nextResetTime: 1774939627716
          }
        },
        null,
        2
      )
    );

    let fetchCalls = 0;
    const result = await resolveQuotaStatus(createQuotaConfig(cacheFilePath), {
      now: 1774936505000,
      fetchImpl: async () => {
        fetchCalls += 1;
        return makeJsonResponse(SUCCESS_BODY);
      }
    });

    assert.equal(fetchCalls, 0);
    assert.equal(formatStatus(result, { theme: "plain" }), "GLM Lite | 5h 88% | reset 14:47");
  });
});

test("reads Claude status line input JSON from stdin", async () => {
  const stream = Readable.from([
    JSON.stringify({
      session_id: "claude-session-1",
      workspace: { current_dir: "D:/Code/claude-glm-quota-bar" }
    })
  ]);
  stream.isTTY = false;

  const input = await readStatusLineInput(stream);
  assert.equal(input.session_id, "claude-session-1");
});

test("bar style uses filled cells for used percentage and spaces for unused percentage", () => {
  const result = {
    kind: "success",
    level: "lite",
    display: "percent",
    leftPercent: 97,
    usedPercent: 3,
    nextResetTime: 1774939627716
  };

  assert.equal(formatStatus(result, { theme: "plain", style: "bar", barWidth: 10 }), "GLM Lite █░░░░░░░░░ 97% | 14:47");
});

test("bar style fills completely only when used percentage reaches 100", () => {
  const result = {
    kind: "success",
    level: "lite",
    display: "percent",
    leftPercent: 0,
    usedPercent: 100,
    nextResetTime: 1774939627716
  };

  assert.equal(formatStatus(result, { theme: "plain", style: "bar", barWidth: 10 }), "GLM Lite ██████████ 0% | 14:47");
});

test("writes tool config values for style and display", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");

    await setToolConfigValue("style", "bar", configPath);
    await setToolConfigValue("displayMode", "used", configPath);

    const config = await readToolConfig(configPath);
    assert.deepEqual(config, {
      schemaVersion: 1,
      managedBy: "glm-quota-line",
      style: "bar",
      displayMode: "used",
      install: {}
    });
  });
});

test("installClaudeStatusLine writes a managed statusLine command", async () => {
  await withTempDir(async (dir) => {
    const settingsPath = path.join(dir, "settings.json");
    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          theme: "dark"
        },
        null,
        2
      )
    );

    const command = buildManagedStatusLineCommand("C:\\Program Files\\nodejs\\node.exe");
    const sessionStartHookCommand = buildManagedSessionStartRefreshCommand("C:\\Program Files\\nodejs\\node.exe");
    const configPath = path.join(dir, "glm-quota-line.json");
    const result = await installClaudeStatusLine(command, settingsPath, configPath, {
      sessionStartHookCommand
    });
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    const toolConfig = await readToolConfig(configPath);

    assert.equal(result.installed, true);
    assert.equal(result.command, command);
    assert.equal(result.sessionStartHookCommand, sessionStartHookCommand);
    assert.equal(settings.theme, "dark");
    assert.deepEqual(settings.statusLine, {
      type: "command",
      command
    });
    assert.deepEqual(settings.hooks.SessionStart, [
      {
        matcher: "startup",
        hooks: [{ type: "command", command: sessionStartHookCommand }]
      },
      {
        matcher: "resume",
        hooks: [{ type: "command", command: sessionStartHookCommand }]
      },
      {
        matcher: "clear",
        hooks: [{ type: "command", command: sessionStartHookCommand }]
      }
    ]);
    assert.deepEqual(toolConfig.install, {
      settingsPath,
      command,
      installed: true,
      sessionStartHook: {
        command: sessionStartHookCommand,
        matchers: ["startup", "resume", "clear"],
        installed: true
      }
    });
  });
});

test("installClaudeStatusLine preserves unrelated SessionStart hooks", async () => {
  await withTempDir(async (dir) => {
    const settingsPath = path.join(dir, "settings.json");
    const command = buildManagedStatusLineCommand("C:\\Program Files\\nodejs\\node.exe");
    const sessionStartHookCommand = buildManagedSessionStartRefreshCommand("C:\\Program Files\\nodejs\\node.exe");
    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          hooks: {
            SessionStart: [
              {
                matcher: "startup",
                hooks: [{ type: "command", command: "echo user-startup" }]
              },
              {
                matcher: "other",
                hooks: [{ type: "command", command: "echo untouched" }]
              }
            ]
          }
        },
        null,
        2
      )
    );

    await installClaudeStatusLine(command, settingsPath, path.join(dir, "glm-quota-line.json"), {
      sessionStartHookCommand
    });
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));

    assert.deepEqual(settings.hooks.SessionStart, [
      {
        matcher: "startup",
        hooks: [
          { type: "command", command: "echo user-startup" },
          { type: "command", command: sessionStartHookCommand }
        ]
      },
      {
        matcher: "other",
        hooks: [{ type: "command", command: "echo untouched" }]
      },
      {
        matcher: "resume",
        hooks: [{ type: "command", command: sessionStartHookCommand }]
      },
      {
        matcher: "clear",
        hooks: [{ type: "command", command: sessionStartHookCommand }]
      }
    ]);
  });
});

test("installClaudeStatusLine does not overwrite unmanaged statusLine without force", async () => {
  await withTempDir(async (dir) => {
    const settingsPath = path.join(dir, "settings.json");
    const command = buildManagedStatusLineCommand("C:\\Program Files\\nodejs\\node.exe");
    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          statusLine: {
            type: "command",
            command: "echo custom"
          },
          theme: "dark"
        },
        null,
        2
      )
    );

    const configPath = path.join(dir, "glm-quota-line.json");
    const result = await installClaudeStatusLine(command, settingsPath, configPath);
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    const toolConfig = await readToolConfig(configPath);

    assert.equal(result.installed, false);
    assert.equal(result.reason, "unmanaged_exists");
    assert.equal(settings.statusLine.command, "echo custom");
    assert.equal("hooks" in settings, false);
    assert.deepEqual(toolConfig.install, {});
  });
});

test("installClaudeStatusLine with force backs up existing unmanaged statusLine", async () => {
  await withTempDir(async (dir) => {
    const settingsPath = path.join(dir, "settings.json");
    const command = buildManagedStatusLineCommand("C:\\Program Files\\nodejs\\node.exe");
    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          statusLine: {
            type: "command",
            command: "echo custom"
          },
          theme: "dark"
        },
        null,
        2
      )
    );

    const configPath = path.join(dir, "glm-quota-line.json");
    const result = await installClaudeStatusLine(command, settingsPath, configPath, {
      force: true
    });
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    const toolConfig = await readToolConfig(configPath);

    assert.equal(result.installed, true);
    assert.equal(settings.statusLine.command, command);
    assert.deepEqual(toolConfig.install.previousStatusLine, {
      type: "command",
      command: "echo custom"
    });
  });
});

test("uninstallClaudeStatusLine restores previously backed up statusLine", async () => {
  await withTempDir(async (dir) => {
    const settingsPath = path.join(dir, "settings.json");
    const configPath = path.join(dir, "glm-quota-line.json");
    const command = buildManagedStatusLineCommand("C:\\Program Files\\nodejs\\node.exe");
    const sessionStartHookCommand = buildManagedSessionStartRefreshCommand("C:\\Program Files\\nodejs\\node.exe");

    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          statusLine: {
            type: "command",
            command
          },
          hooks: {
            SessionStart: [
              {
                matcher: "startup",
                hooks: [
                  { type: "command", command: "echo user-startup" },
                  { type: "command", command: sessionStartHookCommand }
                ]
              }
            ]
          }
        },
        null,
        2
      )
    );

    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          managedBy: "glm-quota-line",
          install: {
            previousStatusLine: {
              type: "command",
              command: "echo previous"
            },
            sessionStartHook: {
              command: sessionStartHookCommand,
              matchers: ["startup", "resume", "clear"],
              installed: true
            }
          }
        },
        null,
        2
      )
    );

    const result = await uninstallClaudeStatusLine(settingsPath, configPath);
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    const toolConfig = await readToolConfig(configPath);

    assert.equal(result.removed, true);
    assert.equal(settings.statusLine.command, "echo previous");
    assert.deepEqual(settings.hooks.SessionStart, [
      {
        matcher: "startup",
        hooks: [{ type: "command", command: "echo user-startup" }]
      }
    ]);
    assert.deepEqual(toolConfig.install, {});
  });
});

test("uninstallClaudeStatusLine removes only managed statusLine entries when no backup exists", async () => {
  await withTempDir(async (dir) => {
    const settingsPath = path.join(dir, "settings.json");
    const configPath = path.join(dir, "glm-quota-line.json");
    const command = buildManagedStatusLineCommand("C:\\Program Files\\nodejs\\node.exe");
    const sessionStartHookCommand = buildManagedSessionStartRefreshCommand("C:\\Program Files\\nodejs\\node.exe");
    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          statusLine: {
            type: "command",
            command
          },
          hooks: {
            SessionStart: [
              {
                matcher: "startup",
                hooks: [{ type: "command", command: sessionStartHookCommand }]
              }
            ]
          },
          theme: "dark"
        },
        null,
        2
      )
    );

    const removed = await uninstallClaudeStatusLine(settingsPath, configPath);
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));

    assert.equal(removed.removed, true);
    assert.equal(settings.theme, "dark");
    assert.equal("statusLine" in settings, false);
    assert.equal("hooks" in settings, false);
  });
});

test("uninstallClaudeStatusLine leaves unrelated statusLine entries untouched", async () => {
  await withTempDir(async (dir) => {
    const settingsPath = path.join(dir, "settings.json");
    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          statusLine: {
            type: "command",
            command: "echo custom"
          }
        },
        null,
        2
      )
    );

    const result = await uninstallClaudeStatusLine(settingsPath, path.join(dir, "glm-quota-line.json"));
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));

    assert.equal(result.removed, false);
    assert.equal(result.reason, "unmanaged");
    assert.equal(settings.statusLine.command, "echo custom");
  });
});

test("uninstallClaudeStatusLine removes managed hooks even if statusLine is already gone", async () => {
  await withTempDir(async (dir) => {
    const settingsPath = path.join(dir, "settings.json");
    const sessionStartHookCommand = buildManagedSessionStartRefreshCommand("C:\\Program Files\\nodejs\\node.exe");
    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          hooks: {
            SessionStart: [
              {
                matcher: "startup",
                hooks: [
                  { type: "command", command: "echo user-startup" },
                  { type: "command", command: sessionStartHookCommand }
                ]
              }
            ]
          }
        },
        null,
        2
      )
    );

    const result = await uninstallClaudeStatusLine(settingsPath, path.join(dir, "glm-quota-line.json"));
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));

    assert.equal(result.removed, true);
    assert.deepEqual(settings.hooks.SessionStart, [
      {
        matcher: "startup",
        hooks: [{ type: "command", command: "echo user-startup" }]
      }
    ]);
  });
});

test("refreshQuotaOnSessionStart forces a quota refresh and updates the session cache", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");
    const cacheFilePath = path.join(dir, "cache.json");
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          managedBy: "glm-quota-line",
          install: {}
        },
        null,
        2
      )
    );
    await fs.writeFile(
      cacheFilePath,
      JSON.stringify(
        {
          savedAt: 1774936504000,
          lastAttemptAt: 1774936504000,
          sessionId: "session-old",
          result: {
            kind: "success",
            level: "lite",
            display: "percent",
            leftPercent: 88,
            usedPercent: 12,
            nextResetTime: 1774939627716
          }
        },
        null,
        2
      )
    );

    const stream = Readable.from([
      JSON.stringify({
        session_id: "session-new",
        source: "startup"
      })
    ]);
    stream.isTTY = false;

    let fetchCalls = 0;
    const result = await refreshQuotaOnSessionStart({
      stdin: stream,
      configPath,
      loadConfigFn: () => ({
        quotaUrl: "https://bigmodel.cn/api/monitor/usage/quota/limit",
        authorization: "token",
        timeoutMs: 5000,
        cacheTtlMs: 600_000,
        cacheFilePath
      }),
      fetchImpl: async () => {
        fetchCalls += 1;
        return makeJsonResponse(SUCCESS_BODY);
      },
      now: 1774936505000
    });

    const cached = JSON.parse(await fs.readFile(cacheFilePath, "utf8"));
    assert.equal(fetchCalls, 1);
    assert.equal(result.kind, "success");
    assert.equal(cached.sessionId, "session-new");
  });
});
