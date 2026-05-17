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
import { buildWeeklyBar } from "../src/core/status/format.js";
import { formatQueryJson } from "../src/core/query/format.js";
import { isValidWorkDays } from "../src/shared/constants.js";
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
import {
  readCtxCache,
  writeCtxCache,
  clearCtxCache,
  writeSuccessCache,
  writeFailureCache,
  cleanupExpiredCache
} from "../src/core/quota/cache.js";
import { createQuotaConfig, makeJsonResponse, withTempDir } from "./helpers.js";

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function renderStatus(result, options = {}) {
  return stripAnsi(formatStatus(result, { theme: "dark", ...options }));
}

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
    assert.equal(renderStatus(result, { style: "text" }), "GLM Lite | 5h 91% | week 47% | reset 14:47");
    assert.equal(
      renderStatus(result, { style: "text", displayMode: "used" }),
      "GLM Lite | 5h used 9% | week 47% | reset 14:47"
    );
    assert.equal(renderStatus(result, { style: "compact" }), "GLM 5h 91% W 47% | 14:47");
    const barNow = new Date("2026-04-28T12:00:00").getTime();
    assert.equal(
      renderStatus(result, { style: "bar", now: barNow }),
      "GLM Lite █████████░ 91% | W █████▒▒▒░░ 47% | 14:47"
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
    assert.equal(renderStatus(result, { style: "text" }), "GLM Lite | 5h 98% | reset 04:35");
  });
});

test("returns auth error without fetching when Authorization is missing", async () => {
  await withTempDir(async (dir) => {
    let fetchCalls = 0;

    const result = await resolveQuotaStatus(createQuotaConfig(path.join(dir, "cache.json"), ""), {
      fetchImpl: async () => {
        fetchCalls += 1;
        return makeJsonResponse(SUCCESS_BODY);
      }
    });

    assert.equal(fetchCalls, 0);
    assert.equal(result.kind, "auth_error");
    assert.equal(renderStatus(result), "GLM | auth expired");
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
    assert.equal(renderStatus(result, { style: "text" }), "GLM Lite | 5h 88% | reset 14:47");
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

    assert.equal(renderStatus(result, { style: "text" }), "GLM Lite | 5h 77% | reset 14:47");
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

    assert.equal(renderStatus(result), "GLM | auth expired");
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

    assert.equal(renderStatus(result), "GLM | auth expired");
  });
});

test("returns quota unavailable when no cache exists and the response is malformed", async () => {
  await withTempDir(async (dir) => {
    const result = await resolveQuotaStatus(createQuotaConfig(path.join(dir, "cache.json")), {
      fetchImpl: async () => makeJsonResponse({ success: true, data: { limits: [] } })
    });

    assert.equal(renderStatus(result), "");
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
    assert.equal(renderStatus(result), "");
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

test("official domestic environment variables take priority and derive the quota URL", async () => {
  const config = await loadConfig({
    ANTHROPIC_AUTH_TOKEN: "official-token",
    ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic"
  }, {}, { claudeSettingsPath: "/nonexistent/settings.json" });

  assert.equal(config.authorization, "official-token");
  assert.equal(config.quotaUrl, "https://open.bigmodel.cn/api/monitor/usage/quota/limit");
  assert.ok(config.cacheFilePath.endsWith(".json"));
  assert.ok(!config.cacheFilePath.endsWith("cache.json"));
});

test("official international environment variables derive the z.ai quota URL", async () => {
  const config = await loadConfig({
    ANTHROPIC_AUTH_TOKEN: "official-token",
    ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic"
  }, {}, { claudeSettingsPath: "/nonexistent/settings.json" });

  assert.equal(config.authorization, "official-token");
  assert.equal(config.quotaUrl, "https://api.z.ai/api/monitor/usage/quota/limit");
});

test("default quota URL keeps the legacy domestic fallback when base url is absent", async () => {
  const config = await loadConfig({
    ANTHROPIC_AUTH_TOKEN: "official-token"
  }, {}, { claudeSettingsPath: "/nonexistent/settings.json" });

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
    assert.equal(renderStatus(result, { style: "text" }), "GLM Pro | 5h 91% | week 47% | reset 14:47");
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
    assert.equal(renderStatus(result, { style: "text" }), "GLM Lite | 5h 90% | reset 14:47");
  });
});

test("different tokens produce different cache file paths", async () => {
  const configA = await loadConfig({ ANTHROPIC_AUTH_TOKEN: "token-alpha" }, {}, { claudeSettingsPath: "/nonexistent/settings.json" });
  const configB = await loadConfig({ ANTHROPIC_AUTH_TOKEN: "token-beta" }, {}, { claudeSettingsPath: "/nonexistent/settings.json" });
  const configEmpty = await loadConfig({}, {}, { claudeSettingsPath: "/nonexistent/settings.json" });

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
    assert.equal(renderStatus(result, { style: "text" }), "GLM Lite | 5h 88% | reset 14:47");
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

test("bar style uses filled cells for left percentage by default", () => {
  const result = {
    kind: "success",
    level: "lite",
    display: "percent",
    leftPercent: 97,
    usedPercent: 3,
    nextResetTime: 1774939627716
  };

  assert.equal(renderStatus(result, { style: "bar" }), "GLM Lite █████████░ 97% | 14:47");
});

test("bar style uses filled cells for used percentage when display mode is used", () => {
  const result = {
    kind: "success",
    level: "lite",
    display: "percent",
    leftPercent: 97,
    usedPercent: 3,
    nextResetTime: 1774939627716
  };

  assert.equal(
    renderStatus(result, { style: "bar", displayMode: "used" }),
    "GLM Lite █░░░░░░░░░ 3% | 14:47"
  );
});

test("bar style fills completely only when left percentage reaches 100 in left mode", () => {
  const result = {
    kind: "success",
    level: "lite",
    display: "percent",
    leftPercent: 100,
    usedPercent: 0,
    nextResetTime: 1774939627716
  };

  assert.equal(renderStatus(result, { style: "bar" }), "GLM Lite ██████████ 100% | 14:47");
});

test("bar style fills completely only when used percentage reaches 100 in used mode", () => {
  const result = {
    kind: "success",
    level: "lite",
    display: "percent",
    leftPercent: 0,
    usedPercent: 100,
    nextResetTime: 1774939627716
  };

  assert.equal(
    renderStatus(result, { style: "bar", displayMode: "used" }),
    "GLM Lite ██████████ 100% | 14:47"
  );
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
      },
      {
        matcher: "compact",
        hooks: [{ type: "command", command: sessionStartHookCommand }]
      }
    ]);
    assert.deepEqual(toolConfig.install, {
      settingsPath,
      command,
      installed: true,
      sessionStartHook: {
        command: sessionStartHookCommand,
        matchers: ["startup", "resume", "clear", "compact"],
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
      },
      {
        matcher: "compact",
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

// --- formatQueryJson ---

test("formatQueryJson returns error for null input", () => {
  assert.deepEqual(formatQueryJson(null), { error: "quota unavailable" });
});

test("formatQueryJson returns error for auth_error", () => {
  assert.deepEqual(formatQueryJson({ kind: "auth_error" }), { error: "auth expired" });
});

test("formatQueryJson maps quotas and mcp with reset timestamps", () => {
  const result = {
    kind: "success",
    level: "lite",
    quotas: [
      { key: "token_5h", usedPercent: 9, leftPercent: 91, nextResetTime: 1774939627716 },
      { key: "token_week", usedPercent: 53, leftPercent: 47, nextResetTime: 1777518607977 }
    ],
    mcp: { usedPercent: 10, leftPercent: 90, nextResetTime: 1774939627716 }
  };

  const json = formatQueryJson(result);
  assert.equal(json.level, "lite");
  assert.equal(json.quotas.length, 2);
  assert.equal(json.quotas[0].window, "5h");
  assert.equal(json.quotas[0].usedPercent, 9);
  assert.equal(json.quotas[0].leftPercent, 91);
  assert.ok(json.quotas[0].resetTime);
  assert.equal(json.quotas[1].window, "week");
  assert.equal(json.mcp.usedPercent, 10);
  assert.equal(json.mcp.leftPercent, 90);
  assert.ok(json.mcp.resetTime);
});

test("formatQueryJson omits reset fields when nextResetTime is missing", () => {
  const result = {
    kind: "success",
    level: "pro",
    quotas: [
      { key: "token_5h", usedPercent: 5, leftPercent: 95 }
    ]
  };

  const json = formatQueryJson(result);
  assert.equal(json.quotas[0].window, "5h");
  assert.equal("resetTime" in json.quotas[0], false);
  assert.equal("mcp" in json, false);
});

// --- parseArgs --json ---

test("parseArgs parses --json flag", () => {
  const options = parseArgs(["--json"]);
  assert.equal(options.json, true);
});

test("parseArgs --json does not appear by default", () => {
  const options = parseArgs([]);
  assert.equal(options.json, undefined);
});

// --- isValidWorkDays ---

test("isValidWorkDays accepts 1 through 7", () => {
  for (let i = 1; i <= 7; i++) {
    assert.equal(isValidWorkDays(i), true, `expected ${i} to be valid`);
  }
});

test("isValidWorkDays rejects 0, 8, 1.5, NaN and non-numbers", () => {
  assert.equal(isValidWorkDays(0), false);
  assert.equal(isValidWorkDays(8), false);
  assert.equal(isValidWorkDays(1.5), false);
  assert.equal(isValidWorkDays(NaN), false);
  assert.equal(isValidWorkDays("5"), false);
});

// --- buildWeeklyBar ---

test("buildWeeklyBar shows filled + shade when budget exceeds usage", () => {
  // usedPercent=30 → 3 filled, theoreticalBudget=60 → 6 budget units → 3 shade, 4 empty
  const bar = buildWeeklyBar(30, 60);
  assert.equal(bar.filledUnits, 3);
  assert.equal(bar.shadeUnits, 3);
  assert.equal(bar.emptyUnits, 4);
  assert.equal(bar.filledText, "███");
  assert.equal(bar.shadeText, "▒▒▒");
  assert.equal(bar.emptyText, "░░░░");
});

test("buildWeeklyBar has no shade when usage meets budget", () => {
  const bar = buildWeeklyBar(50, 50);
  assert.equal(bar.filledUnits, 5);
  assert.equal(bar.shadeUnits, 0);
  assert.equal(bar.emptyUnits, 5);
});

test("buildWeeklyBar has no shade when usage exceeds budget", () => {
  const bar = buildWeeklyBar(70, 40);
  assert.equal(bar.filledUnits, 7);
  assert.equal(bar.shadeUnits, 0);
  assert.equal(bar.emptyUnits, 3);
});

test("buildWeeklyBar clamps values to 0-100", () => {
  const barNeg = buildWeeklyBar(-10, -5);
  assert.equal(barNeg.filledUnits, 0);

  const barOver = buildWeeklyBar(150, 200);
  assert.equal(barOver.filledUnits, 10);
});

// --- weekly pacing severity via formatStatus ---

test("weekly quota gets danger severity when over-pace", () => {
  // 2026-04-26 (Sunday) — countWorkDays from Apr 23 (Thu) to Apr 26 (Sun) + 1 day
  // Thu, Fri = 2 workdays (Sat/Sun excluded). budget = 2/5*100 = 40%
  // usedPercent = 53, pace = 53/40 = 1.325 > 1.3 → danger
  const result = {
    kind: "success",
    level: "lite",
    display: "percent",
    quotas: [
      { key: "token_5h", leftPercent: 91, usedPercent: 9, nextResetTime: 1774939627716 },
      { key: "token_week", leftPercent: 47, usedPercent: 53, nextResetTime: 1777518607977 }
    ],
    primaryQuotaKey: "token_5h"
  };

  const output = renderStatus(result, {
    style: "bar",
    now: new Date("2026-04-26T12:00:00").getTime()
  });
  // Weekly bar should show filled units for 53% used
  assert.ok(output.includes("47%"));
  assert.ok(output.includes("W"));
});

test("weekly quota gets good severity when under-pace", () => {
  // Same time, but only 10% used → pace = 10/40 = 0.25 → good
  const result = {
    kind: "success",
    level: "lite",
    display: "percent",
    quotas: [
      { key: "token_5h", leftPercent: 91, usedPercent: 9, nextResetTime: 1774939627716 },
      { key: "token_week", leftPercent: 90, usedPercent: 10, nextResetTime: 1777518607977 }
    ],
    primaryQuotaKey: "token_5h"
  };

  const output = renderStatus(result, {
    style: "text",
    now: new Date("2026-04-26T12:00:00").getTime()
  });
  assert.ok(output.includes("week"));
  assert.ok(output.includes("90%"));
});

test("weekly quota falls back when nextResetTime is in the past", () => {
  const pastReset = Date.now() - 10000;
  const result = {
    kind: "success",
    level: "lite",
    display: "percent",
    quotas: [
      { key: "token_5h", leftPercent: 91, usedPercent: 9, nextResetTime: 1774939627716 },
      { key: "token_week", leftPercent: 47, usedPercent: 53, nextResetTime: pastReset }
    ],
    primaryQuotaKey: "token_5h"
  };

  const output = renderStatus(result, { style: "bar" });
  // Should still render without crash, no shade
  assert.ok(output.includes("47%"));
  assert.ok(!output.includes("▒"));
});

test("weekly quota falls back to plain text when no theoretical budget", () => {
  const result = {
    kind: "success",
    level: "lite",
    display: "percent",
    quotas: [
      { key: "token_5h", leftPercent: 91, usedPercent: 9, nextResetTime: 1774939627716 },
      { key: "token_week", leftPercent: 47, usedPercent: 53 }
    ],
    primaryQuotaKey: "token_5h"
  };

  const output = renderStatus(result, { style: "bar" });
  assert.ok(output.includes("W 47%"));
  assert.ok(!output.includes("▒"));
});

// --- config set/unset work-days ---

test("config set work-days persists and reads back", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");
    // setToolConfigValue takes the property name and transformed value,
    // same as commands.js does via CONFIG_KEYS
    await setToolConfigValue("workDays", 5, configPath);

    const config = await readToolConfig(configPath);
    assert.equal(config.workDays, 5);
  });
});

test("config set work-days rejects invalid values", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");
    // Storing an invalid value — normalizeToolConfig should strip it
    await setToolConfigValue("workDays", 0, configPath);

    const config = await readToolConfig(configPath);
    assert.equal(config.workDays, undefined);
  });
});

// --- isGLM detection ---

test("isGLM is true when no base URL is set", async () => {
  const config = await loadConfig({
    ANTHROPIC_AUTH_TOKEN: "token"
  }, {}, { claudeSettingsPath: "/nonexistent/settings.json" });
  assert.equal(config.isGLM, true);
});

test("isGLM is true when base URL matches Zhipu endpoints", async () => {
  const config = await loadConfig({
    ANTHROPIC_AUTH_TOKEN: "token",
    ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic"
  }, {}, { claudeSettingsPath: "/nonexistent/settings.json" });
  assert.equal(config.isGLM, true);
});

test("isGLM is false when base URL points to a non-Zhipu provider", async () => {
  const config = await loadConfig({
    ANTHROPIC_AUTH_TOKEN: "token",
    ANTHROPIC_BASE_URL: "https://api.anthropic.com/v1"
  }, {}, { claudeSettingsPath: "/nonexistent/settings.json" });
  assert.equal(config.isGLM, false);
});

// --- ctx cache ---

test("writeCtxCache writes ctx data to existing cache file", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await writeSuccessCache(cacheFilePath, {
      kind: "success",
      level: "lite",
      display: "percent",
      leftPercent: 91,
      usedPercent: 9
    }, { now: Date.now(), sessionId: "session-1" });

    const ctxData = { usedPercent: 45, remainingPercent: 55, modelId: "glm-4.7", windowSize: 200000, severity: "good" };
    await writeCtxCache(cacheFilePath, ctxData);

    const raw = JSON.parse(await fs.readFile(cacheFilePath, "utf8"));
    assert.deepEqual(raw.ctx, ctxData);
    assert.equal(raw.result.kind, "success"); // quota data preserved
  });
});

test("writeCtxCache creates file if it does not exist", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    const ctxData = { usedPercent: 30, remainingPercent: 70, modelId: "glm-4.7", windowSize: 200000, severity: "good" };
    await writeCtxCache(cacheFilePath, ctxData);

    const raw = JSON.parse(await fs.readFile(cacheFilePath, "utf8"));
    assert.deepEqual(raw.ctx, ctxData);
  });
});

test("readCtxCache returns cached ctx for matching session", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    const ctxData = { usedPercent: 50, remainingPercent: 50, modelId: "glm-4.7", windowSize: 200000, severity: "warn" };

    await fs.writeFile(cacheFilePath, JSON.stringify({
      savedAt: Date.now(),
      sessionId: "session-abc",
      result: { kind: "success", level: "lite", display: "percent", leftPercent: 91 },
      ctx: ctxData
    }));

    const result = await readCtxCache(cacheFilePath, "session-abc");
    assert.deepEqual(result, ctxData);
  });
});

test("readCtxCache returns null for different session", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    const ctxData = { usedPercent: 50, remainingPercent: 50, modelId: "glm-4.7", windowSize: 200000, severity: "warn" };

    await fs.writeFile(cacheFilePath, JSON.stringify({
      sessionId: "session-old",
      ctx: ctxData
    }));

    const result = await readCtxCache(cacheFilePath, "session-new");
    assert.equal(result, null);
  });
});

test("readCtxCache returns null when no ctx in cache", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await fs.writeFile(cacheFilePath, JSON.stringify({
      savedAt: Date.now(),
      sessionId: "session-1",
      result: { kind: "success", level: "lite", display: "percent", leftPercent: 91 }
    }));

    const result = await readCtxCache(cacheFilePath, "session-1");
    assert.equal(result, null);
  });
});

test("readCtxCache returns null for invalid ctx shape", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await fs.writeFile(cacheFilePath, JSON.stringify({
      sessionId: "session-1",
      ctx: { remainingPercent: 50 } // missing usedPercent
    }));

    const result = await readCtxCache(cacheFilePath, "session-1");
    assert.equal(result, null);
  });
});

test("readCtxCache returns null for missing file", async () => {
  const result = await readCtxCache("/nonexistent/cache.json", "session-1");
  assert.equal(result, null);
});

test("writeCache preserves existing ctx field", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    const ctxData = { usedPercent: 40, remainingPercent: 60, modelId: "glm-4.7", windowSize: 200000, severity: "good" };

    // Write ctx first
    await fs.writeFile(cacheFilePath, JSON.stringify({ ctx: ctxData }));

    // Quota write should preserve ctx
    await writeSuccessCache(cacheFilePath, {
      kind: "success",
      level: "lite",
      display: "percent",
      leftPercent: 80,
      usedPercent: 20
    }, { now: Date.now(), sessionId: "session-1" });

    const raw = JSON.parse(await fs.readFile(cacheFilePath, "utf8"));
    assert.deepEqual(raw.ctx, ctxData);
    assert.equal(raw.result.leftPercent, 80);
  });
});

test("writeFailureCache preserves existing ctx field", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    const ctxData = { usedPercent: 55, remainingPercent: 45, modelId: "glm-4.7", windowSize: 200000, severity: "warn" };

    await fs.writeFile(cacheFilePath, JSON.stringify({
      savedAt: Date.now() - 1000,
      sessionId: "session-1",
      result: { kind: "success", level: "lite", display: "percent", leftPercent: 75 },
      ctx: ctxData
    }));

    await writeFailureCache(cacheFilePath, {
      savedAt: Date.now() - 1000,
      sessionId: "session-1",
      result: { kind: "success", level: "lite", display: "percent", leftPercent: 75 }
    }, {
      now: Date.now(),
      sessionId: "session-1",
      failureKind: "unavailable"
    });

    const raw = JSON.parse(await fs.readFile(cacheFilePath, "utf8"));
    assert.deepEqual(raw.ctx, ctxData);
    assert.equal(raw.lastFailureKind, "unavailable");
  });
});

test("writeCtxCache overwrites previous ctx data", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");

    const ctx1 = { usedPercent: 30, remainingPercent: 70, modelId: "glm-4.7", windowSize: 200000, severity: "good" };
    await writeCtxCache(cacheFilePath, ctx1);

    const ctx2 = { usedPercent: 60, remainingPercent: 40, modelId: "glm-4.7", windowSize: 200000, severity: "warn" };
    await writeCtxCache(cacheFilePath, ctx2);

    const raw = JSON.parse(await fs.readFile(cacheFilePath, "utf8"));
    assert.deepEqual(raw.ctx, ctx2);
  });
});

test("readCtxCache ignores session when sessionId is empty", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    const ctxData = { usedPercent: 50, remainingPercent: 50, modelId: "glm-4.7", windowSize: 200000, severity: "warn" };

    await fs.writeFile(cacheFilePath, JSON.stringify({
      sessionId: "session-old",
      ctx: ctxData
    }));

    // Empty sessionId should still return cached ctx
    const result = await readCtxCache(cacheFilePath, "");
    assert.deepEqual(result, ctxData);
  });
});

// --- clearCtxCache ---

test("clearCtxCache removes ctx from existing cache file", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    const ctxData = { usedPercent: 80, remainingPercent: 20, modelId: "glm-4.7", windowSize: 200000, severity: "danger" };

    await fs.writeFile(cacheFilePath, JSON.stringify({
      savedAt: Date.now(),
      sessionId: "session-1",
      result: { kind: "success", level: "lite", display: "percent", leftPercent: 50 },
      ctx: ctxData
    }));

    await clearCtxCache(cacheFilePath);

    const raw = JSON.parse(await fs.readFile(cacheFilePath, "utf8"));
    assert.equal("ctx" in raw, false);
    assert.equal(raw.result.kind, "success"); // quota data preserved
  });
});

test("clearCtxCache is no-op when no ctx exists", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await fs.writeFile(cacheFilePath, JSON.stringify({
      savedAt: Date.now(),
      result: { kind: "success", level: "lite", display: "percent", leftPercent: 50 }
    }));

    await clearCtxCache(cacheFilePath);

    const raw = JSON.parse(await fs.readFile(cacheFilePath, "utf8"));
    assert.equal(raw.result.kind, "success");
  });
});

test("clearCtxCache is no-op when cache file does not exist", async () => {
  await clearCtxCache("/nonexistent/cache.json"); // should not throw
});

// --- compact source clears ctx cache ---

test("refreshQuotaOnSessionStart clears ctx cache on compact source", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");
    const cacheFilePath = path.join(dir, "cache.json");
    const ctxData = { usedPercent: 75, remainingPercent: 25, modelId: "glm-4.7", windowSize: 200000, severity: "danger" };

    await fs.writeFile(configPath, JSON.stringify({ schemaVersion: 1, managedBy: "glm-quota-line", install: {} }));
    await fs.writeFile(cacheFilePath, JSON.stringify({
      savedAt: Date.now(),
      sessionId: "session-1",
      result: { kind: "success", level: "lite", display: "percent", leftPercent: 50 },
      ctx: ctxData
    }));

    const stream = Readable.from([
      JSON.stringify({ session_id: "session-1", source: "compact" })
    ]);
    stream.isTTY = false;

    await refreshQuotaOnSessionStart({
      stdin: stream,
      configPath,
      loadConfigFn: () => ({
        quotaUrl: "https://bigmodel.cn/api/monitor/usage/quota/limit",
        authorization: "token",
        timeoutMs: 5000,
        cacheFilePath
      }),
      fetchImpl: async () => makeJsonResponse(SUCCESS_BODY),
      now: Date.now()
    });

    const raw = JSON.parse(await fs.readFile(cacheFilePath, "utf8"));
    assert.equal("ctx" in raw, false, "ctx should be cleared after compact");
  });
});

test("refreshQuotaOnSessionStart clears ctx cache on clear source", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");
    const cacheFilePath = path.join(dir, "cache.json");
    const ctxData = { usedPercent: 75, remainingPercent: 25, modelId: "glm-4.7", windowSize: 200000, severity: "danger" };

    await fs.writeFile(configPath, JSON.stringify({ schemaVersion: 1, managedBy: "glm-quota-line", install: {} }));
    await fs.writeFile(cacheFilePath, JSON.stringify({
      savedAt: Date.now(),
      sessionId: "session-1",
      result: { kind: "success", level: "lite", display: "percent", leftPercent: 50 },
      ctx: ctxData
    }));

    const stream = Readable.from([
      JSON.stringify({ session_id: "session-1", source: "clear" })
    ]);
    stream.isTTY = false;

    await refreshQuotaOnSessionStart({
      stdin: stream,
      configPath,
      loadConfigFn: () => ({
        quotaUrl: "https://bigmodel.cn/api/monitor/usage/quota/limit",
        authorization: "token",
        timeoutMs: 5000,
        cacheFilePath
      }),
      fetchImpl: async () => makeJsonResponse(SUCCESS_BODY),
      now: Date.now()
    });

    const raw = JSON.parse(await fs.readFile(cacheFilePath, "utf8"));
    assert.equal("ctx" in raw, false, "ctx should be cleared after clear");
  });
});

test("refreshQuotaOnSessionStart clears ctx cache on startup source", async () => {
  await withTempDir(async (dir) => {
    const configPath = path.join(dir, "glm-quota-line.json");
    const cacheFilePath = path.join(dir, "cache.json");
    const ctxData = { usedPercent: 50, remainingPercent: 50, modelId: "glm-4.7", windowSize: 200000, severity: "warn" };

    await fs.writeFile(configPath, JSON.stringify({ schemaVersion: 1, managedBy: "glm-quota-line", install: {} }));
    await fs.writeFile(cacheFilePath, JSON.stringify({
      savedAt: Date.now() - 10000,
      sessionId: "session-old",
      result: { kind: "success", level: "lite", display: "percent", leftPercent: 88 },
      ctx: ctxData
    }));

    const stream = Readable.from([
      JSON.stringify({ session_id: "session-new", source: "startup" })
    ]);
    stream.isTTY = false;

    await refreshQuotaOnSessionStart({
      stdin: stream,
      configPath,
      loadConfigFn: () => ({
        quotaUrl: "https://bigmodel.cn/api/monitor/usage/quota/limit",
        authorization: "token",
        timeoutMs: 5000,
        cacheFilePath
      }),
      fetchImpl: async () => makeJsonResponse(SUCCESS_BODY),
      now: Date.now()
    });

    const raw = JSON.parse(await fs.readFile(cacheFilePath, "utf8"));
    assert.equal("ctx" in raw, false, "ctx should be cleared on startup to avoid stale data from previous session");
  });
});
