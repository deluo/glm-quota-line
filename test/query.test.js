import test from "node:test";
import assert from "node:assert/strict";

import { parseQuotaResponse } from "../src/core/quota/parse.js";
import { formatQueryHuman } from "../src/core/query/format.js";

// ── Parser: MCP extraction ──────────────────────────────────────

test("parser extracts MCP data from API response with MCP limit entry", () => {
  const response = {
    kind: "response",
    status: 200,
    json: {
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
            percentage: 9,
            nextResetTime: 1774939627716
          },
          {
            type: "TOKENS_LIMIT",
            unit: 4,
            number: 1,
            percentage: 53,
            nextResetTime: 1777518607977
          },
          {
            type: "MCP_LIMIT",
            unit: 6,
            number: 1,
            percentage: 20,
            nextResetTime: 1774950000000
          }
        ]
      }
    },
    text: "{}"
  };

  const result = parseQuotaResponse(response);
  assert.equal(result.kind, "success");
  assert.equal(result.quotas.length, 2);
  assert.ok(result.mcp);
  assert.equal(result.mcp.key, "mcp");
  assert.equal(result.mcp.usedPercent, 20);
  assert.equal(result.mcp.leftPercent, 80);
  assert.equal(result.mcp.nextResetTime, 1774950000000);
});

test("parser returns no mcp field when no MCP limit entries exist", () => {
  const response = {
    kind: "response",
    status: 200,
    json: {
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
            percentage: 9,
            nextResetTime: 1774939627716
          }
        ]
      }
    },
    text: "{}"
  };

  const result = parseQuotaResponse(response);
  assert.equal(result.kind, "success");
  assert.equal(result.mcp, undefined);
});

test("parser ignores MCP entries with unparseable percentage", () => {
  const response = {
    kind: "response",
    status: 200,
    json: {
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
            percentage: 9,
            nextResetTime: 1774939627716
          },
          {
            type: "MCP_LIMIT",
            unit: 6,
            number: 1
          }
        ]
      }
    },
    text: "{}"
  };

  const result = parseQuotaResponse(response);
  assert.equal(result.kind, "success");
  assert.equal(result.mcp, undefined);
});

test("parser extracts MCP data with remaining/currentValue fields", () => {
  const response = {
    kind: "response",
    status: 200,
    json: {
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
            type: "MCP_LIMIT",
            usage: 100,
            currentValue: 30,
            remaining: 70,
            nextResetTime: 1774950000000
          }
        ]
      }
    },
    text: "{}"
  };

  const result = parseQuotaResponse(response);
  assert.equal(result.mcp.usedPercent, 30);
  assert.equal(result.mcp.leftPercent, 70);
});

// ── formatQueryHuman ────────────────────────────────────────────

test("formatQueryHuman shows left mode with full date and MCP", () => {
  const result = {
    kind: "success",
    level: "lite",
    quotas: [
      { key: "token_5h", leftPercent: 91, usedPercent: 9, nextResetTime: 1774939627716 },
      { key: "token_week", leftPercent: 47, usedPercent: 53, nextResetTime: 1777518607977 }
    ],
    mcp: { key: "mcp", leftPercent: 80, usedPercent: 20, nextResetTime: 1774950000000 }
  };

  const output = formatQueryHuman(result, "left");
  assert.ok(output.includes("GLM Lite Quota Usage"));
  assert.ok(output.includes("5h:   left 91%"));
  assert.ok(output.includes("Week:   left 47%"));
  assert.ok(output.includes("MCP:   left 80%"));
  assert.ok(output.includes("reset"));
  assert.ok(output.includes("━━━━"));
});

test("formatQueryHuman shows used mode", () => {
  const result = {
    kind: "success",
    level: "lite",
    quotas: [
      { key: "token_5h", leftPercent: 91, usedPercent: 9, nextResetTime: 1774939627716 }
    ]
  };

  const output = formatQueryHuman(result, "used");
  assert.ok(output.includes("used  9%"));
  assert.ok(!output.includes("left"));
});

test("formatQueryHuman omits MCP line when no mcp data", () => {
  const result = {
    kind: "success",
    level: "lite",
    quotas: [
      { key: "token_5h", leftPercent: 91, usedPercent: 9, nextResetTime: 1774939627716 }
    ]
  };

  const output = formatQueryHuman(result, "left");
  assert.ok(!output.includes("MCP"));
});

test("formatQueryHuman handles auth error", () => {
  const output = formatQueryHuman({ kind: "auth_error" }, "left");
  assert.equal(output, "GLM | auth expired\n");
});

test("formatQueryHuman handles unavailable", () => {
  const output = formatQueryHuman({ kind: "unavailable" }, "left");
  assert.equal(output, "GLM | quota unavailable\n");
});

test("formatQueryHuman handles null result", () => {
  const output = formatQueryHuman(null, "left");
  assert.equal(output, "GLM | quota unavailable\n");
});
