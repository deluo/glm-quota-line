<h1 align="center">glm-quota-line</h1>

<p align="center">
  A Zhipu GLM Coding Plan quota monitor built for Claude Code. Accurate, real-time data from the official site — no window switching, just glance and go.
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

## Features

- **Terminal quick check** — run `glm-quota-line` in any terminal to view your quota (including MCP) without launching Claude Code
- **Claude Code status line** — auto-embeds in the status bar after install, shows quota balance, reset time, and context window usage in real time
- **Bar visualization** — default bar style shows remaining quota at a glance; weekly quota shows theoretical budget shadow
- **Weekly pacing analysis** — calculates usage speed based on work days, auto-highlights when exceeding theoretical budget
- **JSON output** — `--json` flag outputs structured data for scripting
- **Interactive configuration** — `glm-quota-line configure` launches a TUI with live preview and per-component controls
- **Component-level control** — each display component (plan, 5h, week, reset, context) can be individually toggled and styled
- **Smart caching** — tiered refresh by session, TTL, and token usage; `SessionStart` hook pre-refreshes so new sessions never show stale data
- **Domestic + international endpoints** — auto-detects `open.bigmodel.cn` and `api.z.ai`
- **Zero dependencies** — no runtime deps, single-purpose CLI

## Quick Start

```bash
npm install -g glm-quota-line
glm-quota-line install
```

Done. Your Claude Code status bar will now show the quota:

```
GLM Lite █████████░ 91% | W ▒▒▒▒░░░░░ 47% | 14:47 | ctx ███░░░ 45% (glm-4.7/200K)
```

You can also run `glm-quota-line` directly in the terminal to check your quota without launching Claude Code.

Upgrade:

```bash
npm install -g glm-quota-line
glm-quota-line check-update
```

## Configuration

All options are optional. Persist with `glm-quota-line config set`, or override per-invocation with CLI flags.

### style — Output layout

| Value | Description | Example |
|---|---|---|
| `bar` (default) | Progress bar | `GLM Lite █████████░ 91% \| W ▒▒▒▒░░░░░ 47% \| 14:47 \| ctx ███░░░ 45%` |
| `text` | Full text | `GLM Lite \| 5h 91% \| week 47% \| reset 14:47 \| ctx 45%` |
| `compact` | Compact mode | `GLM 5h 91% W 47% \| 14:47` |

```bash
glm-quota-line config set style compact
```

### theme — Color theme

| Value | Description |
|---|---|
| `dark` (default) | Dark terminal, light pine-green accents |
| `light` | White/light terminal, teal-blue accents |
| `mono` | Grayscale, minimal distraction |

```bash
glm-quota-line config set theme light
```

Quota percentage colors change automatically based on remaining amount:

- Green — remaining >= 60%
- Yellow — remaining 30%–60%
- Red — remaining < 30%

### display — Quota metric

| Value | Description |
|---|---|
| `left` (default) | Show remaining quota (bar fills with remaining) |
| `used` | Show used quota (bar fills with used) |

```bash
glm-quota-line config set display used
```

### work-days — Work days per week

Set the number of work days per week (1–7) for weekly quota theoretical budget and pacing analysis. Default: 5.

```bash
glm-quota-line config set work-days 6
```

Pacing analysis calculates theoretical budget based on elapsed work days:
- Green — usage speed ≤ 1.1x theoretical
- Yellow — usage speed 1.1x–1.3x theoretical
- Red — usage speed > 1.3x theoretical

### --json — JSON output

Output structured JSON format (terminal mode only, ignored in status line mode):

```bash
glm-quota-line --json
```

Example output:
```json
{
  "level": "Lite",
  "quotas": [
    {
      "label": "5h",
      "leftPercent": 91,
      "usedPercent": 9,
      "nextResetTime": 1715257200000
    },
    {
      "label": "week",
      "leftPercent": 47,
      "usedPercent": 53,
      "nextResetTime": 1715744400000
    }
  ],
  "mcp": {
    "leftPercent": 85,
    "usedPercent": 15
  }
}
```

### minimalist — Minimal mode

Hide all labels, show only progress bars and values.

```bash
glm-quota-line config set minimalist true
```

Effect:
- Off: `GLM Lite █████████░ 91% | W ▒▒▒▒░░░░░ 47% | 14:47`
- On: `█████████░ 91% | ▒▒▒▒░░░░░ 47% | 14:47`

### raw-values — Raw values

Hide all labels and show raw values directly.

```bash
glm-quota-line config set raw-values true
```

### auth-token / base-url — Custom auth

If Claude Code runs behind a gateway or proxy and the injected `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` are not the real values:

```bash
glm-quota-line config set auth-token <your-real-token>
glm-quota-line config set base-url https://open.bigmodel.cn/api/anthropic
# or
glm-quota-line config set base-url https://api.z.ai/api/anthropic
```

Clear with `glm-quota-line config unset auth-token` / `base-url`.

Auth source priority (highest to lowest):

1. Values persisted via `config set`
2. Environment variables `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL`
3. `env` field in `~/.claude/settings.json`

### configure — Interactive setup

Launch a terminal UI with live preview to adjust component toggles, styles, and global options.

```bash
glm-quota-line configure
```

Key bindings:
- `↑↓` select component, `Enter` to edit, `Tab` to cycle style, `Space` to toggle
- `g` to enter global options (theme, display mode, minimalist, raw-values)
- `s` to save, `q` to quit

Components:

| Component | Description | Styleable | Hideable |
|---|---|---|---|
| `level` | Plan level (e.g. GLM Lite) | — | ✓ |
| `5h` | 5-hour quota | ✓ (bar/text) | — (required) |
| `week` | Weekly quota | ✓ (bar/text) | ✓ |
| `reset` | Reset time | — | ✓ |
| `ctx` | Context window usage | ✓ (bar/text) | ✓ |

## Recommended Combinations

| Use case | Config |
|---|---|
| Dark terminal (default) | `style=bar`, `theme=dark` |
| Light terminal | `style=bar`, `theme=light` |
| Minimal setup | `style=compact`, `theme=mono` |
| Track usage | `style=bar`, `display=used` |
| Scripting | `--json` |
| 6-day work week | `work-days=6` |
| Minimal values | `minimalist=true` |
| Interactive setup | `glm-quota-line configure` |

## Command Reference

```bash
glm-quota-line [--style text|compact|bar] [--display left|used] [--theme dark|light|mono] [--json]
glm-quota-line install [--force]
glm-quota-line uninstall
glm-quota-line version
glm-quota-line check-update
glm-quota-line configure
glm-quota-line config show
glm-quota-line config set <style|display|theme|auth-token|base-url|work-days|minimalist|raw-values> <value>
glm-quota-line config unset <key>
```

Run `glm-quota-line --help` for full descriptions.

## Notes

- Shows `TOKENS_LIMIT` and `MCP_LIMIT` / `TIME_LIMIT` quotas
- Weekly quota progress bar shadow (▒) indicates theoretical budget, calculated from `work-days`
- Context window usage is shown by default; toggle via `glm-quota-line configure`
- Context window usage is calculated from raw tokens when model mapping is available, falls back to API-provided percentages
- Each component can be individually toggled and styled via `glm-quota-line configure`
- Missing auth returns `GLM | auth expired`; API failures return `GLM | quota unavailable`
- `install` does not replace an unmanaged status line unless `--force` is used
- `install --force` backs up the previous entry; `uninstall` restores it when possible

## License

[MIT](./LICENSE)
