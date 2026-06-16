<h1 align="center">glm-quota-line</h1>

<p align="center">
  A Zhipu GLM Coding Plan quota monitor built for Claude Code<br>
  <strong>Focus on coding without switching windows to check your quota</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/glm-quota-line"><img alt="npm version" src="https://img.shields.io/npm/v/glm-quota-line?logo=npm&color=cb3837"></a>
  <a href="https://www.npmjs.com/package/glm-quota-line"><img alt="node version" src="https://img.shields.io/node/v/glm-quota-line?logo=node.js&color=339933"></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/npm/l/glm-quota-line"></a>
  <img alt="dependencies" src="https://img.shields.io/badge/dependencies-0-2ea44f">
</p>

<p align="center">
  <a href="./README.md">简体中文</a>
</p>

## Core Value

**Accurate data from official site** → **Real-time status bar display** → **Smart pacing alerts**

After installation, the quota appears automatically in the Claude Code status bar:

```
GLM Lite █████████░ 91% | W ▒▒▒▒░░░░░ 47% 11:10 | 14:47 | ctx ███░░░ 45% (glm-4.7/200K)
```

**See at a glance**:
- Plan remaining quota (91%) with progress bar
- Weekly quota consumption (47%) + theoretical budget shadow (▒)
- Time until reset (14:47)
- Context window usage (45%)

Auto-color alerts when pacing exceeds budget, preventing workflow interruption.

## 30-Second Quick Start

**One-time query (no install needed):**

```bash
npx glm-quota-line
```

**Status line integration (recommended):**

```bash
npm install -g glm-quota-line
glm-quota-line install
```

Done. You can run `glm-quota-line` anytime in the terminal to check usage without launching Claude Code.

Upgrade:

```bash
npm install -g glm-quota-line
glm-quota-line check-update
```

## Common Workflows

### 📊 Quick quota check

```bash
glm-quota-line
```

### 🎨 Customize status bar style

**Recommended**: Use interactive configuration with live preview

```bash
glm-quota-line configure
```

For manual configuration, see [Quick Customization](#quick-customization)

### 🤖 Change model or adjust context window

```bash
# When Zhipu releases a new model, no need to wait for npm updates — write the local overlay immediately:
glm-quota-line model set glm-5.3 400K
# View all models and their context window sizes
glm-quota-line model list
```

### 🔧 Script integration

```bash
glm-quota-line --json
```

Outputs structured JSON data:

```json
{
  "level": "Lite",
  "quotas": [
    {
      "label": "5h",
      "leftPercent": 91,
      "usedPercent": 9,
      "nextResetTime": 1715257200000
    }
  ],
  "mcp": {
    "leftPercent": 85,
    "usedPercent": 15
  }
}
```

### ⚠️ Quota exhausted or display issues

See [Troubleshooting](#troubleshooting)

## Quick Customization

### Recommended: Interactive configuration

```bash
glm-quota-line configure  # Live preview, WYSIWYG
```

**Key bindings**:
- `↑↓` select component, `Enter` to edit, `Tab` to cycle style, `Space` to toggle
- `g` for global options (theme, display mode, minimalist, raw-values, reset format)
- `s` to save, `q` to quit

### Common config (non-interactive)

#### Style & theme

```bash
glm-quota-line config set style compact  # Compact mode
glm-quota-line config set theme light    # Light theme
glm-quota-line config set theme mono     # Grayscale minimal
```

**Style comparison**:

| Style | Description | Example |
|---|---|---|
| `bar` (default) | Progress bar | `GLM Lite █████████░ 91% \| W ▒▒▒▒░░░░░ 47% 11:10 \| 14:47 \| ctx ███░░░ 45%` |
| `text` | Full text | `GLM Lite \| 5h 91% \| week 47% 11:10 \| reset 14:47 \| ctx 45%` |
| `compact` | Compact mode | `GLM 5h 91% W 47% 11:10 \| 14:47` |

#### Display options

```bash
glm-quota-line config set display used           # Show used instead of remaining
glm-quota-line config set reset-format countdown  # Countdown mode (e.g., reset 52m)
glm-quota-line config set minimalist true         # Hide label text
```

**Color logic**:

Quota percentage auto-colors based on remaining amount:
- 🟢 Green — remaining >= 60%
- 🟡 Yellow — remaining 30%–60%
- 🔴 Red — remaining < 30%

Pacing analysis auto-colors based on usage speed:
- 🟢 Green — usage speed ≤ 1.1x theoretical
- 🟡 Yellow — usage speed 1.1x–1.3x theoretical
- 🔴 Red — usage speed > 1.3x theoretical

<details>
<summary><b>Advanced configuration options</b> (click to expand)</summary>

### Work days setting

Set the number of work days per week (1–7) for weekly quota theoretical budget and pacing analysis. Default: 5.

```bash
glm-quota-line config set work-days 6
```

### Raw values mode

Display raw values directly, without percentages.

```bash
glm-quota-line config set raw-values true
```

### Custom authentication

If Claude Code runs behind a gateway or proxy, you can override auth credentials:

```bash
glm-quota-line config set auth-token <your-real-token>
glm-quota-line config set base-url https://open.bigmodel.cn/api/anthropic
# or
glm-quota-line config set base-url https://api.z.ai/api/anthropic
```

Clear with `glm-quota-line config unset auth-token` / `base-url`.

**Auth priority** (highest to lowest):
1. Values persisted via `config set`
2. Environment variables `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL`
3. `env` field in `~/.claude/settings.json`

### Factory reset

One-shot reset of user config. Install state is preserved (status line/hook not removed).

```bash
glm-quota-line config reset            # Reset all user config (interactive confirm)
glm-quota-line config reset --models   # Reset only custom model mappings (modelMap)
glm-quota-line config reset --yes      # Skip confirmation (scripts/CI)
```

- Default scope: all global config, component layout, custom model mappings
- `--models` limits reset to modelMap only; other config untouched
- Non-interactive sessions (no TTY) require `--yes` or error out
- After reset, status line still works — model mappings fall back to bundled defaults

</details>

## Advanced Features

<details>
<summary><b>Model mapping management</b> (new model support)</summary>

Manage context window size mapping per model. Context window usage percentage is computed from this mapping.

```bash
glm-quota-line model list                    # List all models and their context window size
glm-quota-line model get <model-id>          # Show the size of a given model
glm-quota-line model set <model-id> <size>   # Set model size (e.g., 300K or 300000)
glm-quota-line model remove <model-id>       # Remove custom mapping (built-in reverts to default)
```

**Example `list` output**:

```
glm-4.5-air  128K
glm-4.7      200K
glm-5-turbo  200K
glm-5.2      1M *
```

The `*` marker indicates a user-configured mapping.

**Two-layer design**:
- Bundled `data/models.json` as default base
- `modelMap` in `~/.claude/glm-quota-line.json` as user overlay (merged key-by-key at runtime)

**Advantage**: When Zhipu releases a new model, no need to wait for npm package updates — just run `model set <new-model> <size>` to write the local overlay and it takes effect immediately.

To clear all custom model mappings and return to bundled defaults: `glm-quota-line config reset --models --yes`.

</details>

<details>
<summary><b>Agent / Automation interface</b></summary>

If you are an AI agent (Claude Code / Cursor / Codex) or script author, the following interface is guaranteed stable:

```bash
# Get full machine-readable schema of all commands in one call
glm-quota-line commands --json

# Focused help for a single command or command group
glm-quota-line model --help
glm-quota-line config set --help
```

**Conventions**:
- **Exit codes**: `0` on success, `1` on error
- **Side-effect tags**: Each command tagged `read` (safe for automation), `write` (persists config/model map), `mutating` (modifies Claude Code integration), or `interactive` (requires TTY)
- **Non-blocking**: No command blocks waiting for input
- **Read query**: `glm-quota-line --json` emits structured quota data

Typical agent workflow: Run `commands --json` to discover capabilities → invoke command → parse stdout.

</details>

<details>
<summary><b>Component-level control</b></summary>

Through component mode in `glm-quota-line configure`, each display component can be individually toggled and styled. See [Quick Customization](#quick-customization) for key bindings; component capabilities:

| Component | Description | Styleable | Hideable |
|---|---|---|---|
| `level` | Plan level (e.g. GLM Lite) | — | ✓ |
| `5h` | 5-hour quota | ✓ (bar/text) | — (required) |
| `week` | Weekly quota | ✓ (bar/text) | ✓ |
| `reset` | Reset time | — | ✓ |
| `ctx` | Context window usage | ✓ (bar/text) | ✓ |

</details>

## Troubleshooting

### Quota not displaying

**Possible causes**:
1. Auth info missing or expired
2. Non-GLM provider (endpoint not `open.bigmodel.cn` or `api.z.ai`)
3. Network connection issues

**Solutions**:
```bash
# Check auth status
glm-quota-line

# If shows "auth expired", update auth info
glm-quota-line config set auth-token <your-token>
glm-quota-line config set base-url https://open.bigmodel.cn/api/anthropic
```

### Shows "quota unavailable"

**Possible causes**:
- Zhipu API interface issues
- Network connection problems

**Solutions**:
- Retry later (tool auto-retries)
- Check network connection
- If persistent, may be Zhipu service issues

### Install/uninstall issues

**Status bar not updating**:
```bash
glm-quota-line uninstall
glm-quota-line install --force
```

`install --force` backs up previous config; `uninstall` restores when possible.

### Debug mode

Set `GLM_QUOTA_DEBUG=1` to output context window debug info to stderr:

```bash
GLM_QUOTA_DEBUG=1 glm-quota-line
```

## Command Reference

```bash
glm-quota-line [--style text|compact|bar] [--display left|used] [--theme dark|light|mono] [--json]
glm-quota-line install [--force]
glm-quota-line uninstall
glm-quota-line version
glm-quota-line check-update
glm-quota-line configure
glm-quota-line config show
glm-quota-line config set <style|display|theme|auth-token|base-url|work-days|minimalist|raw-values|reset-format> <value>
glm-quota-line config unset <key>
glm-quota-line config reset [--models] [--yes]
glm-quota-line model list
glm-quota-line model get <model-id>
glm-quota-line model set <model-id> <size>
glm-quota-line model remove <model-id>
glm-quota-line commands --json
```

Run `glm-quota-line --help` for full descriptions.

## Technical Notes

- Shows `TOKENS_LIMIT` and `MCP_LIMIT` / `TIME_LIMIT` quotas
- Weekly quota progress bar shadow (▒) is the daily pacing baseline: theoretical budget based on elapsed work days
- Context window usage computed from raw tokens using local model map; falls back to API-provided percentage when mapping unavailable
- Smart caching: tiered refresh by session, TTL, and token usage; `SessionStart` hook pre-refreshes so new sessions never show stale data
- Auto-detects domestic (`open.bigmodel.cn`) and international (`api.z.ai`) endpoints
- Non-GLM providers automatically disable quota queries
- Zero runtime dependencies

## License

[MIT](./LICENSE)
