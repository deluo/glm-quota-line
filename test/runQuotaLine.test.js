import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { Readable } from "node:stream";

import { loadConfig } from "../src/config.js";
import { formatStatus } from "../src/formatStatus.js";
import { parseArgs } from "../src/parseArgs.js";
import { getSessionId, readStatusLineInput } from "../src/readStatusLineInput.js";
import { runQuotaLine } from "../src/runQuotaLine.js";
import {
  buildInstalledStatusLineCommand,
  installClaudeStatusLine,
  readToolConfig,
  setToolConfigValue,
  uninstallClaudeStatusLine
} from "../src/userConfig.js";

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
        type: "TIME_LIMIT",
        unit: 5,
        number: 1,
        usage: 100,
        currentValue: 0,
        remaining: 100,
        percentage: 0,
        nextResetTime: 1777518607977
      }
    ],
    level: "lite"
  },
  success: true
};

function createConfig(cacheFilePath, authorization = "token", threadId = "thread-1") {
  return {
    quotaUrl: "https://bigmodel.cn/api/monitor/usage/quota/limit",
    authorization,
    timeoutMs: 5000,
    cacheTtlMs: 300_000,
    cacheFilePath,
    threadId
  };
}

async function withTempDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "glm-quota-line-"));
  try {
    await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function makeJsonResponse(body, status = 200) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    }
  };
}

test("formats a successful response and writes cache", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    let fetchCalls = 0;

    const result = await runQuotaLine(createConfig(cacheFilePath), {
      now: 1774936504000,
      fetchImpl: async () => {
        fetchCalls += 1;
        return makeJsonResponse(SUCCESS_BODY);
      }
    });

    assert.equal(fetchCalls, 1);
    assert.equal(result.kind, "success");
    assert.equal(result.display, "percent");
    assert.equal(formatStatus(result), "GLM Lite | 5h left 91% | reset 14:47");
    assert.equal(formatStatus(result, { displayMode: "used" }), "GLM Lite | 5h used 9% | reset 14:47");
    assert.equal(formatStatus(result, { style: "compact" }), "GLM 91% | 14:47");
    assert.equal(formatStatus(result, { style: "bar", barWidth: 10 }), "GLM Lite ■□□□□□□□□□ 91% | 14:47");

    const cached = JSON.parse(await fs.readFile(cacheFilePath, "utf8"));
    assert.equal(cached.result.kind, "success");
    assert.equal(cached.result.leftPercent, 91);
    assert.equal(cached.threadId, "thread-1");
  });
});

test("returns auth expired without fetching when Authorization is missing", async () => {
  await withTempDir(async (dir) => {
    let fetchCalls = 0;

    const result = await runQuotaLine(createConfig(path.join(dir, "cache.json"), ""), {
      fetchImpl: async () => {
        fetchCalls += 1;
        return makeJsonResponse(SUCCESS_BODY);
      }
    });

    assert.equal(fetchCalls, 0);
    assert.equal(formatStatus(result), "GLM | auth expired");
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
          threadId: "thread-1",
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
    const result = await runQuotaLine(createConfig(cacheFilePath), {
      now: 1774936505000,
      fetchImpl: async () => {
        fetchCalls += 1;
        return makeJsonResponse(SUCCESS_BODY);
      }
    });

    assert.equal(fetchCalls, 0);
    assert.equal(formatStatus(result), "GLM Lite | 5h left 88% | reset 14:47");
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
          threadId: "thread-1",
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

    const result = await runQuotaLine(createConfig(cacheFilePath), {
      now: 1774936505000,
      fetchImpl: async () => ({
        status: 200,
        async text() {
          return "not-json";
        }
      })
    });

    assert.equal(formatStatus(result), "GLM Lite | 5h left 77% | reset 14:47");
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
          threadId: "thread-1",
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

    const result = await runQuotaLine(createConfig(cacheFilePath), {
      now: 1774936505000,
      fetchImpl: async () =>
        makeJsonResponse({
          code: 1001,
          msg: "Header中未收到Authorization参数，无法进行身份验证。",
          success: false
        })
    });

    assert.equal(formatStatus(result), "GLM | auth expired");
  });
});

test("invalid tokens are treated as auth failures", async () => {
  await withTempDir(async (dir) => {
    const result = await runQuotaLine(createConfig(path.join(dir, "cache.json")), {
      fetchImpl: async () =>
        makeJsonResponse({
          code: 401,
          msg: "令牌已过期或验证不正确",
          success: false
        })
    });

    assert.equal(formatStatus(result), "GLM | auth expired");
  });
});

test("returns quota unavailable when no cache exists and the response is malformed", async () => {
  await withTempDir(async (dir) => {
    const result = await runQuotaLine(createConfig(path.join(dir, "cache.json")), {
      fetchImpl: async () => makeJsonResponse({ success: true, data: { limits: [] } })
    });

    assert.equal(formatStatus(result), "GLM | quota unavailable");
  });
});

test("falls back to TIME_LIMIT absolute display when rolling-window data is missing", async () => {
  await withTempDir(async (dir) => {
    const result = await runQuotaLine(createConfig(path.join(dir, "cache.json")), {
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

    assert.equal(result.display, "absolute");
    assert.equal(formatStatus(result), "GLM Lite | 5h left 90/100 | reset 11:10");
    assert.equal(
      formatStatus(result, { displayMode: "used" }),
      "GLM Lite | 5h used 10/100 | reset 11:10"
    );
    assert.equal(formatStatus(result, { style: "compact" }), "GLM 90% | 11:10");
    assert.equal(formatStatus(result, { style: "bar", barWidth: 10 }), "GLM Lite ■□□□□□□□□□ 90% | 11:10");
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

test("official environment variables take priority and derive the quota URL", () => {
  const config = loadConfig({
    ANTHROPIC_AUTH_TOKEN: "official-token",
    ANTHROPIC_BASE_URL: "https://open.bigmodel.cn/api/anthropic",
    CODEX_THREAD_ID: "thread-9"
  });

  assert.equal(config.authorization, "official-token");
  assert.equal(config.quotaUrl, "https://open.bigmodel.cn/api/monitor/usage/quota/limit");
  assert.equal(config.cacheTtlMs, 300_000);
  assert.equal(config.threadId, "thread-9");
});

test("same thread and fresh cache do not trigger a network request", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await fs.writeFile(
      cacheFilePath,
      JSON.stringify(
        {
          savedAt: 1774936504000,
          threadId: "thread-1",
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
    const result = await runQuotaLine(createConfig(cacheFilePath), {
      now: 1774936505000,
      fetchImpl: async () => {
        fetchCalls += 1;
        return makeJsonResponse(SUCCESS_BODY);
      }
    });

    assert.equal(fetchCalls, 0);
    assert.equal(formatStatus(result), "GLM Lite | 5h left 88% | reset 14:47");
  });
});

test("a different thread id forces a refresh even when cache is fresh", async () => {
  await withTempDir(async (dir) => {
    const cacheFilePath = path.join(dir, "cache.json");
    await fs.writeFile(
      cacheFilePath,
      JSON.stringify(
        {
          savedAt: 1774936504000,
          threadId: "thread-old",
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
    const result = await runQuotaLine(createConfig(cacheFilePath, "token", "thread-new"), {
      now: 1774936505000,
      fetchImpl: async () => {
        fetchCalls += 1;
        return makeJsonResponse(SUCCESS_BODY);
      }
    });

    assert.equal(fetchCalls, 1);
    assert.equal(formatStatus(result), "GLM Lite | 5h left 91% | reset 14:47");
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

test("prefers Claude session_id over CODEX_THREAD_ID", () => {
  const sessionId = getSessionId(
    { session_id: "claude-session-2" },
    { CODEX_THREAD_ID: "codex-thread-1" }
  );

  assert.equal(sessionId, "claude-session-2");
});

test("falls back to CODEX_THREAD_ID when Claude session metadata is absent", () => {
  const sessionId = getSessionId(null, { CODEX_THREAD_ID: "codex-thread-2" });
  assert.equal(sessionId, "codex-thread-2");
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

  assert.equal(formatStatus(result, { style: "bar", barWidth: 10 }), "GLM Lite ■□□□□□□□□□ 97% | 14:47");
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

  assert.equal(formatStatus(result, { style: "bar", barWidth: 10 }), "GLM Lite ■■■■■■■■■■ 0% | 14:47");
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

    const command = buildInstalledStatusLineCommand("C:\\Program Files\\nodejs\\node.exe");
    const configPath = path.join(dir, "glm-quota-line.json");
    const result = await installClaudeStatusLine(command, settingsPath, configPath);
    const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
    const toolConfig = await readToolConfig(configPath);

    assert.equal(result.installed, true);
    assert.equal(result.command, command);
    assert.equal(settings.theme, "dark");
    assert.deepEqual(settings.statusLine, {
      type: "command",
      command
    });
    assert.deepEqual(toolConfig.install, {
      settingsPath,
      command,
      installed: true
    });
  });
});

test("installClaudeStatusLine does not overwrite unmanaged statusLine without force", async () => {
  await withTempDir(async (dir) => {
    const settingsPath = path.join(dir, "settings.json");
    const command = buildInstalledStatusLineCommand("C:\\Program Files\\nodejs\\node.exe");
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
    assert.deepEqual(toolConfig.install, {});
  });
});

test("installClaudeStatusLine with force backs up existing unmanaged statusLine", async () => {
  await withTempDir(async (dir) => {
    const settingsPath = path.join(dir, "settings.json");
    const command = buildInstalledStatusLineCommand("C:\\Program Files\\nodejs\\node.exe");
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
    const command = buildInstalledStatusLineCommand("C:\\Program Files\\nodejs\\node.exe");

    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          statusLine: {
            type: "command",
            command
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
    assert.deepEqual(toolConfig.install, {});
  });
});

test("uninstallClaudeStatusLine removes only managed statusLine entries when no backup exists", async () => {
  await withTempDir(async (dir) => {
    const settingsPath = path.join(dir, "settings.json");
    const configPath = path.join(dir, "glm-quota-line.json");
    const command = buildInstalledStatusLineCommand("C:\\Program Files\\nodejs\\node.exe");
    await fs.writeFile(
      settingsPath,
      JSON.stringify(
        {
          statusLine: {
            type: "command",
            command
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
