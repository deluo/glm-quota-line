import test from "node:test";
import assert from "node:assert/strict";

import { formatStatus } from "../src/core/status/format.js";
import { buildBar } from "../src/core/status/bar.js";
import { buildStatusViewModel } from "../src/core/status/viewModel.js";
import { STATUS_BAR_CHARACTERS } from "../src/shared/constants.js";

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

test("buildStatusViewModel prioritizes the 5h token quota and exposes weekly summary", () => {
  const model = buildStatusViewModel({
    kind: "success",
    level: "lite",
    primaryQuotaKey: "token_5h",
    quotas: [
      {
        key: "token_5h",
        leftPercent: 91,
        usedPercent: 9,
        nextResetTime: 1774939627716
      },
      {
        key: "token_week",
        leftPercent: 47,
        usedPercent: 53,
        nextResetTime: 1777518607977
      }
    ]
  });

  assert.equal(model.kind, "success");
  assert.equal(model.levelLabel, "GLM Lite");
  assert.equal(model.leftPercent, 91);
  assert.equal(model.usedPercent, 9);
  assert.equal(model.primaryQuota.label, "5h");
  assert.equal(model.secondaryQuota.label, "week");
  assert.equal(model.primaryQuota.leftText, "91%");
  assert.equal(model.secondaryQuota.leftText, "47%");
  assert.equal(model.resetText, "14:47");
  assert.equal(model.severity, "good");
});

test("severity boundaries at 30 and 60 percent", () => {
  const base = { kind: "success", level: "lite", display: "percent", nextResetTime: 1774939627716 };

  assert.equal(buildStatusViewModel({ ...base, leftPercent: 60, usedPercent: 40 }).severity, "good");
  assert.equal(buildStatusViewModel({ ...base, leftPercent: 59, usedPercent: 41 }).severity, "warn");
  assert.equal(buildStatusViewModel({ ...base, leftPercent: 30, usedPercent: 70 }).severity, "warn");
  assert.equal(buildStatusViewModel({ ...base, leftPercent: 29, usedPercent: 71 }).severity, "danger");
});

test("buildBar preserves partial-fill semantics", () => {
  const bar = buildBar(3, 10);

  assert.equal(bar.filledText, STATUS_BAR_CHARACTERS.filled);
  assert.equal(bar.emptyText, STATUS_BAR_CHARACTERS.empty.repeat(9));
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
      barWidth: 10
    }
  );
  const bar = buildBar(82, 10);

  assert.match(output, /\u001b\[/);
  assert.match(output, /\u001b\[36m14:47\u001b\[0m/);
  assert.equal(stripAnsi(output), `GLM Lite ${bar.filledText}${bar.emptyText} 18% | 14:47`);
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
      palette: "mono"
    }
  );

  assert.match(output, /\u001b\[/);
  assert.match(output, /\u001b\[1m14:47\u001b\[0m/);
  assert.equal(stripAnsi(output), "GLM Lite | 5h 91% | reset 14:47");
});
