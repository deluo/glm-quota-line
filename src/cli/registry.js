// Single source of truth for the command surface. Both the per-subcommand
// --help text (help.js) and the `commands` self-describing command derive from
// this registry, so adding/removing a command only needs one edit here.
//
// When you add a branch to handleCommand in commands.js (or a subcommand in
// modelCommand.js / configCommand.js), add a matching entry here. The
// integration test asserts every registry entry maps to a real dispatch branch.

// sideEffect: read | write | interactive | mutating
//   read        — no persisted state change, safe for automation
//   write       — persists user config / model map
//   mutating    — modifies Claude Code integration (install/uninstall)
//   interactive — requires a TTY

export const COMMAND_REGISTRY = {
  "(default)": {
    name: "(default)",
    summary:
      "Run without a command: display comprehensive quota usage (5h, week, MCP) in the terminal, or a compact status line when invoked by Claude Code.",
    sideEffect: "read",
    args: [],
    flags: [{ name: "--json", required: false, description: "Output quota as structured JSON (terminal mode only)." }],
    examples: ["glm-quota-line", "glm-quota-line --json", "glm-quota-line --display used"],
    json: true
  },

  version: {
    name: "version",
    summary: "Print the installed glm-quota-line version.",
    sideEffect: "read",
    args: [],
    examples: ["glm-quota-line version"],
    json: false
  },

  "check-update": {
    name: "check-update",
    summary: "Check npm for a newer version and print the upgrade command.",
    sideEffect: "read",
    args: [],
    examples: ["glm-quota-line check-update"],
    json: false
  },

  commands: {
    name: "commands",
    summary:
      "List every command with its name, summary, side effect, args, and examples. Pass --json for a machine-readable schema (for AI agents and scripting).",
    sideEffect: "read",
    args: [],
    flags: [{ name: "--json", required: false, description: "Output the full command schema as JSON." }],
    examples: ["glm-quota-line commands", "glm-quota-line commands --json"],
    json: true
  },

  install: {
    name: "install",
    summary:
      "Install glm-quota-line into Claude Code statusLine.command and SessionStart hooks.",
    sideEffect: "mutating",
    args: [],
    flags: [{ name: "--force", required: false, description: "Replace an existing unmanaged status line (backs it up first)." }],
    examples: ["glm-quota-line install", "glm-quota-line install --force"],
    json: false
  },

  uninstall: {
    name: "uninstall",
    summary:
      "Remove the managed status line and SessionStart hooks; restore a backup if one exists.",
    sideEffect: "mutating",
    args: [],
    examples: ["glm-quota-line uninstall"],
    json: false
  },

  configure: {
    name: "configure",
    summary:
      "Launch an interactive TUI to adjust component toggles, styles, and global options. Requires a TTY.",
    sideEffect: "interactive",
    args: [],
    examples: ["glm-quota-line configure"],
    json: false
  },

  "config show": {
    name: "config show",
    summary: "Print the current persisted config. Stored tokens are redacted.",
    sideEffect: "read",
    args: [],
    examples: ["glm-quota-line config show"],
    json: false
  },

  "config set": {
    name: "config set",
    summary: "Persist a display option or manual credential override.",
    sideEffect: "write",
    args: [
      {
        name: "key",
        required: true,
        choices: ["style", "display", "theme", "auth-token", "base-url", "work-days", "minimalist", "raw-values", "reset-format"]
      },
      { name: "value", required: true }
    ],
    examples: [
      "glm-quota-line config set theme light",
      "glm-quota-line config set display used",
      "glm-quota-line config set auth-token <your-real-token>"
    ],
    json: false
  },

  "config unset": {
    name: "config unset",
    summary: "Remove one persisted config key.",
    sideEffect: "write",
    args: [
      {
        name: "key",
        required: true,
        choices: ["style", "display", "theme", "auth-token", "base-url", "work-days", "minimalist", "raw-values", "reset-format"]
      }
    ],
    examples: ["glm-quota-line config unset theme"],
    json: false
  },

  "config reset": {
    name: "config reset",
    summary:
      "Reset user config to defaults. Preserves install state. Prompts unless --yes (required in non-interactive sessions).",
    sideEffect: "write",
    args: [],
    flags: [
      { name: "--models", required: false, description: "Limit the reset to custom model mappings (modelMap) only." },
      { name: "--yes", required: false, description: "Skip the confirmation prompt (required in non-interactive sessions)." }
    ],
    examples: ["glm-quota-line config reset", "glm-quota-line config reset --models --yes"],
    json: false
  },

  "model list": {
    name: "model list",
    summary: "List all models and their context window sizes. Custom mappings are marked with *.",
    sideEffect: "read",
    args: [],
    examples: ["glm-quota-line model list"],
    json: false
  },

  "model get": {
    name: "model get",
    summary: "Show the context window size for a model, with its source (default or custom).",
    sideEffect: "read",
    args: [{ name: "model-id", required: true }],
    examples: ["glm-quota-line model get glm-5.2"],
    json: false
  },

  "model set": {
    name: "model set",
    summary: "Set a model's context window size (e.g. 300K or 300000). Overlays the bundled default table.",
    sideEffect: "write",
    args: [
      { name: "model-id", required: true },
      { name: "size", required: true, format: "300K | 300000 | 1M" }
    ],
    examples: ["glm-quota-line model set glm-5.2 300K"],
    json: false
  },

  "model remove": {
    name: "model remove",
    summary: "Remove a custom model mapping. Built-in models revert to their bundled default.",
    sideEffect: "write",
    args: [{ name: "model-id", required: true }],
    examples: ["glm-quota-line model remove glm-5.2"],
    json: false
  }
};

export const GLOBAL_FLAGS = [
  { name: "--json", description: "Output structured JSON. Applies to: terminal query and the commands subcommand." },
  { name: "--style <text|compact|bar>", description: "Output layout (status line mode only)." },
  { name: "--display <left|used>", description: "Quota metric." },
  { name: "--theme <dark|light|mono>", description: "Theme preset (status line mode only)." },
  { name: "--force", description: "Allow install to replace an unmanaged Claude status line." },
  { name: "--yes", description: "Skip confirmation prompts (config reset)." },
  { name: "--models", description: "Limit config reset to model mappings." },
  { name: "-v, --version", description: "Show the installed version." },
  { name: "-h, --help", description: "Show help. Pass a command for focused help (e.g. model --help)." }
];

export const ENVIRONMENT = [
  { name: "ANTHROPIC_AUTH_TOKEN", description: "Auth token for Zhipu GLM API (required)." },
  { name: "ANTHROPIC_BASE_URL", description: "Base URL for the quota API endpoint." },
  { name: "GLM_QUOTA_DEBUG", description: "Set to 1 to enable debug logging for context window data (writes to stderr)." }
];

// Commands grouped by their first token, for focused subcommand help.
export const COMMAND_GROUPS = {
  model: ["model list", "model get", "model set", "model remove"],
  config: ["config show", "config set", "config unset", "config reset"]
};

export function getCommand(key) {
  return COMMAND_REGISTRY[key] || null;
}

export function allCommands() {
  return Object.values(COMMAND_REGISTRY);
}

// Resolve a positional list (e.g. ["model"] or ["config", "set"]) to either a
// single registry entry or a group prefix. Returns {kind: "command", entry} or
// {kind: "group", prefix, keys} or null if nothing matches.
export function resolvePositionals(positionals) {
  if (!positionals || positionals.length === 0) {
    return null;
  }

  const joined = positionals.join(" ");
  if (COMMAND_REGISTRY[joined]) {
    return { kind: "command", entry: COMMAND_REGISTRY[joined] };
  }

  const prefix = positionals[0];
  if (COMMAND_GROUPS[prefix]) {
    return { kind: "group", prefix, keys: COMMAND_GROUPS[prefix] };
  }

  return null;
}
