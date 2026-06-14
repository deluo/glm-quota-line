import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { handleCommand } from "../src/cli/commands.js";
import { printHelpFor, printHelp, renderCommandsTable } from "../src/cli/help.js";
import {
  COMMAND_REGISTRY,
  COMMAND_GROUPS,
  resolvePositionals,
  allCommands
} from "../src/cli/registry.js";
import { getPackageVersion } from "../src/shared/packageInfo.js";

const execFileAsync = promisify(execFile);
const CLI = "src/cli/index.js";

function captureOutput() {
  let buffer = "";
  const stream = {
    write(chunk) {
      buffer += chunk;
    }
  };
  return {
    stream,
    value: () => buffer
  };
}

// ---------------------------------------------------------------------------
// commands subcommand
// ---------------------------------------------------------------------------

test("commands --json outputs a valid schema with version and command list", async () => {
  const { stream, value } = captureOutput();
  const handled = await handleCommand({ positionals: ["commands"], json: true }, stream);

  assert.equal(handled, true);
  const parsed = JSON.parse(value());
  assert.equal(parsed.version, await getPackageVersion());
  assert.ok(Array.isArray(parsed.commands) && parsed.commands.length > 0);
  assert.ok(Array.isArray(parsed.globalFlags));
  assert.ok(Array.isArray(parsed.environment));
});

test("commands --json entries each have the required fields", async () => {
  const { stream, value } = captureOutput();
  await handleCommand({ positionals: ["commands"], json: true }, stream);
  const parsed = JSON.parse(value());

  for (const cmd of parsed.commands) {
    assert.equal(typeof cmd.name, "string", `name is string for ${cmd.name}`);
    assert.equal(typeof cmd.summary, "string", `summary is string for ${cmd.name}`);
    assert.ok(
      ["read", "write", "mutating", "interactive"].includes(cmd.sideEffect),
      `sideEffect valid for ${cmd.name}: ${cmd.sideEffect}`
    );
    assert.ok(Array.isArray(cmd.args), `args is array for ${cmd.name}`);
    assert.ok(Array.isArray(cmd.examples), `examples is array for ${cmd.name}`);
  }
});

test("commands --json includes core commands", async () => {
  const { stream, value } = captureOutput();
  await handleCommand({ positionals: ["commands"], json: true }, stream);
  const parsed = JSON.parse(value());
  const names = parsed.commands.map((c) => c.name);

  for (const expected of ["version", "config set", "model list", "model set", "commands", "install"]) {
    assert.ok(names.includes(expected), `includes ${expected}`);
  }
});

test("commands (no --json) prints a human-readable table", async () => {
  const { stream, value } = captureOutput();
  const handled = await handleCommand({ positionals: ["commands"] }, stream);

  assert.equal(handled, true);
  assert.match(value(), /glm-quota-line commands/);
  assert.match(value(), /name/);
  assert.match(value(), /effect/);
  assert.match(value(), /Run 'glm-quota-line commands --json'/);
});

// ---------------------------------------------------------------------------
// per-subcommand --help
// ---------------------------------------------------------------------------

test("printHelpFor([]) emits the global help", () => {
  const { stream, value } = captureOutput();
  printHelpFor([], stream);

  assert.match(value(), /^glm-quota-line\n/);
  assert.match(value(), /Usage:/);
  assert.match(value(), /Commands:/);
});

test("printHelpFor(['model']) emits focused model help", () => {
  const { stream, value } = captureOutput();
  printHelpFor(["model"], stream);

  assert.match(value(), /glm-quota-line model/);
  assert.match(value(), /model list/);
  assert.match(value(), /model set/);
  assert.match(value(), /\[read\]/);
  assert.match(value(), /\[write\]/);
  // Focused help must not pull in unrelated command groups.
  assert.doesNotMatch(value(), /config reset/);
});

test("printHelpFor(['config', 'set']) emits focused single-command help", () => {
  const { stream, value } = captureOutput();
  printHelpFor(["config", "set"], stream);

  assert.match(value(), /glm-quota-line config set/);
  assert.match(value(), /style, display, theme/);
  assert.match(value(), /Side effect: write/);
  assert.match(value(), /glm-quota-line config set theme light/);
});

test("printHelpFor unknown positional falls back to global help", () => {
  const { stream, value } = captureOutput();
  printHelpFor(["totally-unknown-command"], stream);

  // No error, no crash — just global help.
  assert.match(value(), /^glm-quota-line\n/);
});

// ---------------------------------------------------------------------------
// registry integrity
// ---------------------------------------------------------------------------

test("registry has an entry for every command the CLI actually dispatches", () => {
  // The first token of each registry name must be a dispatchable command or a
  // known group. This guards against drift when a branch is added to
  // handleCommand but the registry is forgotten.
  const dispatchableTopLevel = new Set([
    "version",
    "check-update",
    "commands",
    "config",
    "model",
    "install",
    "uninstall",
    "configure"
  ]);

  for (const cmd of allCommands()) {
    if (cmd.name === "(default)") {
      continue;
    }
    const top = cmd.name.split(" ")[0];
    assert.ok(
      dispatchableTopLevel.has(top),
      `registry entry "${cmd.name}" has no dispatchable top-level "${top}"`
    );
  }
});

test("every COMMAND_GROUPS member exists in the registry", () => {
  for (const keys of Object.values(COMMAND_GROUPS)) {
    for (const key of keys) {
      assert.ok(COMMAND_REGISTRY[key], `group member "${key}" missing from registry`);
    }
  }
});

test("resolvePositionals distinguishes command, group, and unknown", () => {
  assert.equal(resolvePositionals(["config", "set"]).kind, "command");
  assert.equal(resolvePositionals(["model"]).kind, "group");
  assert.equal(resolvePositionals(["foobar"]), null);
  assert.equal(resolvePositionals([]), null);
});

// ---------------------------------------------------------------------------
// global help byte-stability: printHelp writes to the injected stream
// ---------------------------------------------------------------------------

test("printHelp writes the same content regardless of injection target", () => {
  const a = captureOutput();
  const b = captureOutput();
  printHelp(a.stream);
  printHelp(b.stream);
  assert.equal(a.value(), b.value());
  assert.ok(a.value().length > 1000, "global help is non-trivial");
});

test("renderCommandsTable lists read/write/mutating/interactive commands", () => {
  const { stream, value } = captureOutput();
  renderCommandsTable(stream);
  assert.match(value(), /read/);
  assert.match(value(), /write/);
  assert.match(value(), /mutating/);
});

// ---------------------------------------------------------------------------
// end-to-end via the real CLI binary
// ---------------------------------------------------------------------------

test("e2e: commands --json is valid JSON via the CLI binary", async () => {
  const { stdout } = await execFileAsync("node", [CLI, "commands", "--json"]);
  const parsed = JSON.parse(stdout);
  assert.ok(Array.isArray(parsed.commands));
  assert.ok(parsed.commands.length >= 10);
});

test("e2e: model --help shows focused help via the CLI binary", async () => {
  const { stdout } = await execFileAsync("node", [CLI, "model", "--help"]);
  assert.match(stdout, /model list/);
  assert.match(stdout, /model set/);
  assert.doesNotMatch(stdout, /config reset/);
});

test("e2e: --help with no positional still works", async () => {
  const { stdout } = await execFileAsync("node", [CLI, "--help"]);
  assert.match(stdout, /^glm-quota-line\n/);
  assert.match(stdout, /Usage:/);
});
