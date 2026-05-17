#!/usr/bin/env node

import { readToolConfig, writeToolConfig } from "../claude/settings.js";
import {
  normalizeConfig,
  COMPONENT_TYPES,
  STYLEABLE_COMPONENTS,
  HIDABLE_COMPONENTS,
  REQUIRED_COMPONENTS,
  DEFAULT_GLOBAL_CONFIG
} from "../shared/constants.js";
import { formatStatus } from "../core/status/format.js";
import { DEMO_QUOTA_DATA, DEMO_CTX_MODEL } from "./utils/demoData.js";
import { ANSI, TUI_COLORS, getTuiColors } from "../shared/ansi.js";
import readline from "node:readline";

const COMP_NAMES = {
  [COMPONENT_TYPES.MODEL]: "level",
  [COMPONENT_TYPES.PRIMARY]: "5h",
  [COMPONENT_TYPES.WEEKLY]: "week",
  [COMPONENT_TYPES.RESET]: "reset",
  [COMPONENT_TYPES.CONTEXT]: "ctx"
};

const THEMES = ["dark", "light", "mono"];
const DISPLAY_MODES = ["left", "used"];

function render(config, compIndex, editMode, showGlobal, globalIndex, message) {
  const lines = [];
  const components = config.lines[0]?.components || [];
  const g = config.global;
  const colors = getTuiColors(g.theme);

  lines.push(`  ${ANSI.bold}${colors.title}glm-quota-line Configuration${ANSI.reset}`);
  lines.push("");

  let preview;
  try {
    preview = formatStatus(DEMO_QUOTA_DATA, { ...config, ctxModel: DEMO_CTX_MODEL }) || "Preview unavailable";
  } catch {
    preview = "Preview error";
  }
  lines.push(`  ${colors.title}Preview:${ANSI.reset}`);
  lines.push(`  ${ANSI.gray}┌─────────────────────────────────────────────────────┐${ANSI.reset}`);
  lines.push(`  ${ANSI.gray}│${ANSI.reset} ${preview}`);
  lines.push(`  ${ANSI.gray}└─────────────────────────────────────────────────────┘${ANSI.reset}`);
  lines.push("");

  if (showGlobal) {
    const opts = [
      { label: "Theme", value: g.theme },
      { label: "Display", value: g.displayMode },
      { label: "Minimalist", value: g.minimalist ? "ON" : "OFF" },
      { label: "Raw Values", value: g.rawValues ? "ON" : "OFF" }
    ];
    lines.push(`  ${colors.title}Global Options:${ANSI.reset}`);
    lines.push("");
    for (let i = 0; i < opts.length; i++) {
      const sel = i === globalIndex;
      const cursor = sel ? `${ANSI.blue}▸${ANSI.reset} ` : "  ";
      const labelColor = sel ? colors.selected : ANSI.white;
      lines.push(`  ${cursor}${labelColor}${opts[i].label.padEnd(14)}${ANSI.reset} ${colors.value}${opts[i].value}${ANSI.reset}`);
    }
  } else {
    lines.push(`  ${colors.title}Components:${ANSI.reset}`);
    lines.push("");
    for (let i = 0; i < components.length; i++) {
      const c = components[i];
      const name = COMP_NAMES[c.type] || c.type;
      const sel = i === compIndex;
      const editing = editMode && sel;
      const enabled = c.enabled !== false;
      const hasStyle = STYLEABLE_COMPONENTS.has(c.type);
      const canHide = HIDABLE_COMPONENTS.has(c.type);

      const cursor = sel ? `${ANSI.blue}▸${ANSI.reset} ` : "  ";
      const nameColor = editing ? colors.editing : sel ? colors.selected : ANSI.white;
      const showIcon = enabled ? `${colors.enabled}✓${ANSI.reset}` : `${colors.disabled}✗${ANSI.reset}`;
      const styleVal = hasStyle ? (c.style || "bar") : "-";
      const styleColor = hasStyle ? colors.value : colors.disabled;

      let line = `  ${cursor}${nameColor}${name.padEnd(8)}${ANSI.reset}`;
      line += `  show:${showIcon}`;
      line += `  style:${styleColor}${styleVal}${ANSI.reset}`;
      if (REQUIRED_COMPONENTS.has(c.type)) {
        line += `  ${ANSI.dim}(required)${ANSI.reset}`;
      }
      lines.push(line);
    }
  }

  if (message) {
    const color = message.color === "green" ? colors.success : colors.error;
    lines.push("");
    lines.push(`  ${color}${message.text}${ANSI.reset}`);
  }

  lines.push("");
  if (showGlobal) {
    lines.push(`  ${colors.title}[Space]${ANSI.reset} change   ${colors.enabled}[g]${ANSI.reset} back   ${colors.error}[q]${ANSI.reset} quit`);
  } else if (editMode) {
    lines.push(`  ${colors.title}[Tab]${ANSI.reset} style   ${colors.enabled}[Space]${ANSI.reset} show/hide   ${colors.error}[Esc]${ANSI.reset} done`);
  } else {
    lines.push(`  ${colors.title}[Enter]${ANSI.reset} edit   ${colors.enabled}[s]${ANSI.reset} save   ${colors.error}[q]${ANSI.reset} quit   ${ANSI.dim}[g]${ANSI.reset} global`);
  }

  return TUI_COLORS.clearScreen + TUI_COLORS.hideCursor + lines.join("\n") + "\n";
}

export async function runTUI() {
  if (!process.stdin.isTTY) {
    process.stdout.write("  configure command requires an interactive terminal.\n");
    return;
  }

  const raw = await readToolConfig();
  const config = normalizeConfig(raw);
  const components = config.lines[0]?.components || [];

  let compIndex = 0;
  let editMode = false;
  let showGlobal = false;
  let globalIndex = 0;
  let message = null;
  let dirty = false;

  function draw() {
    process.stdout.write(render(config, compIndex, editMode, showGlobal, globalIndex, message));
  }

  draw();

  await new Promise((resolve) => {

    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(TUI_COLORS.showCursor);
    }

    process.stdin.on("keypress", function onKey(str, key) {
      message = null;

      if (key.name === "q") {
        cleanup();
        if (dirty) {
          process.stdout.write(TUI_COLORS.clearScreen + "  Quit without saving.\n");
        }
        resolve();
        return;
      }

      if (key.name === "escape") {
        if (editMode) {
          editMode = false;
          draw();
        }
        return;
      }

      if (key.name === "s" && !showGlobal && !editMode) {
        (async () => {
          try {
            await saveTUIConfig(config);

            message = { text: "Configuration saved!", color: "green" };
            dirty = false;
            draw();
            setTimeout(() => { cleanup(); resolve(); }, 800);
          } catch {
            message = { text: "Save failed!", color: "red" };
            draw();
          }
        })();
        return;
      }

      if (showGlobal) {
        if (key.name === "g") {
          showGlobal = false;
          draw();
          return;
        }
        if (key.name === "up") {
          globalIndex = Math.max(0, globalIndex - 1);
          draw();
          return;
        }
        if (key.name === "down") {
          globalIndex = Math.min(3, globalIndex + 1);
          draw();
          return;
        }
        if (key.name === "space" || str === " ") {
          dirty = true;
          const opts = ["theme", "displayMode", "minimalist", "rawValues"];
          const k = opts[globalIndex];
          if (k === "theme") {
            config.global.theme = THEMES[(THEMES.indexOf(config.global.theme) + 1) % THEMES.length];
          } else if (k === "displayMode") {
            config.global.displayMode = DISPLAY_MODES[(DISPLAY_MODES.indexOf(config.global.displayMode) + 1) % DISPLAY_MODES.length];
          } else if (k === "minimalist") {
            config.global.minimalist = !config.global.minimalist;
          } else if (k === "rawValues") {
            config.global.rawValues = !config.global.rawValues;
          }
          draw();
          return;
        }
        return;
      }

      if (editMode) {
        const c = components[compIndex];
        if (key.name === "tab" || str === "\t") {
          if (c && STYLEABLE_COMPONENTS.has(c.type)) {
            dirty = true;
            c.style = c.style === "bar" ? "text" : "bar";
            draw();
          }
          return;
        }
        if (key.name === "space" || str === " ") {
          if (c && HIDABLE_COMPONENTS.has(c.type)) {
            dirty = true;
            c.enabled = !c.enabled;
            draw();
          }
          return;
        }
        return;
      }

      if (key.name === "g") {
        showGlobal = true;
        draw();
        return;
      }
      if (key.name === "up") {
        compIndex = Math.max(0, compIndex - 1);
        draw();
        return;
      }
      if (key.name === "down") {
        compIndex = Math.min(components.length - 1, compIndex + 1);
        draw();
        return;
      }
      if (key.name === "return" || str === "\r") {
        editMode = true;
        draw();
        return;
      }
    });
  });
}

export async function saveTUIConfig(config, configPath) {
  const toolConfig = { lines: config.lines };
  if (config.global.theme !== DEFAULT_GLOBAL_CONFIG.theme) toolConfig.theme = config.global.theme;
  if (config.global.displayMode !== DEFAULT_GLOBAL_CONFIG.displayMode) toolConfig.displayMode = config.global.displayMode;
  if (config.global.minimalist !== DEFAULT_GLOBAL_CONFIG.minimalist) toolConfig.minimalist = config.global.minimalist;
  if (config.global.rawValues !== DEFAULT_GLOBAL_CONFIG.rawValues) toolConfig.rawValues = config.global.rawValues;
  await writeToolConfig(toolConfig, configPath);
}
