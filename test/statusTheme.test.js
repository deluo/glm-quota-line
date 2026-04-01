import test from "node:test";
import assert from "node:assert/strict";

import { formatStatus } from "../src/core/status/format.js";
import { buildStatusViewModel } from "../src/core/status/viewModel.js";
import { buildBar } from "../src/core/status/bar.js";

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

test("buildStatusViewModel normalizes absolute quota results", () => {
  const model = buildStatusViewModel({
    kind: "success",
    level: "lite",
    display: "absolute",
    remaining: 90,
    total: 100,
    nextResetTime: 1777518607977
  });

  assert.equal(model.kind, "success");
  assert.equal(model.levelLabel, "GLM Lite");
  assert.equal(model.leftPercent, 90);
  assert.equal(model.usedPercent, 10);
  assert.equal(model.leftText, "90/100");
  assert.equal(model.usedText, "10/100");
  assert.equal(model.severity, "good");
});

test("buildBar preserves partial-fill semantics", () => {
  const bar = buildBar(3, 10);
  assert.equal(bar.filledText, "■");
  assert.equal(bar.emptyText, "□□□□□□□□□");
});

test("ansi dark theme colors the bar without changing visible text", () => {
  const output = formatStatus(
    {
      kind: "success",
      level: "lite",
      display: "percent",
      leftPercent: 18,
      usedPercent: 82,
      nextResetTime: 1774939627716
    },
    {
      style: "bar",
      theme: "ansi",
      palette: "dark",
      barWidth: 10,
      env: {}
    }
  );

  assert.match(output, /\u001b\[/);
  assert.equal(stripAnsi(output), "GLM Lite ■■■■■■■■□□ 18% | 14:47");
});

test("ansi mono theme uses emphasis without changing visible text", () => {
  const output = formatStatus(
    {
      kind: "success",
      level: "lite",
      display: "percent",
      leftPercent: 91,
      usedPercent: 9,
      nextResetTime: 1774939627716
    },
    {
      style: "text",
      theme: "ansi",
      palette: "mono",
      env: {}
    }
  );

  assert.match(output, /\u001b\[/);
  assert.equal(stripAnsi(output), "GLM Lite | 5h left 91% | reset 14:47");
});

test("NO_COLOR forces plain output even when ansi theme is requested", () => {
  const output = formatStatus(
    {
      kind: "success",
      level: "lite",
      display: "percent",
      leftPercent: 91,
      usedPercent: 9,
      nextResetTime: 1774939627716
    },
    {
      style: "bar",
      theme: "ansi",
      palette: "dark",
      barWidth: 10,
      env: { NO_COLOR: "1" }
    }
  );

  assert.equal(output, "GLM Lite ■□□□□□□□□□ 91% | 14:47");
});
