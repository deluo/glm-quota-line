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

- **Terminal quick check** — run `glm-quota-line` in any terminal to view your quota without launching Claude Code
- **Claude Code status line** — auto-embeds in the status bar after install, shows quota balance and reset time in real time
- **Bar visualization** — default bar style shows remaining quota at a glance
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
GLM Lite █████████░ 91% | W 47% | 14:47
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
| `bar` (default) | Progress bar | `GLM Lite █████████░ 91% \| W 47% \| 14:47` |
| `text` | Full text | `GLM Lite \| 5h 91% \| week 47% \| reset 14:47` |
| `compact` | Compact mode | `GLM 5h 91% W 47% \| 14:47` |

```bash
glm-quota-line config set style compact
```

### theme — Color theme

| Value | Description |
|---|---|
| `dark` (default) | Dark terminal, strongest color contrast |
| `light` | White/light terminal, blue-tinted accents |
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

## Recommended Combinations

| Use case | Config |
|---|---|
| Dark terminal (default) | `style=bar`, `theme=dark` |
| Light terminal | `style=bar`, `theme=light` |
| Minimal setup | `style=compact`, `theme=mono` |
| Track usage | `style=bar`, `display=used` |

## Command Reference

```bash
glm-quota-line [--style text|compact|bar] [--display left|used] [--theme dark|light|mono]
glm-quota-line install [--force]
glm-quota-line uninstall
glm-quota-line version
glm-quota-line check-update
glm-quota-line config show
glm-quota-line config set <style|display|theme|auth-token|base-url> <value>
glm-quota-line config unset <key>
```

Run `glm-quota-line --help` for full descriptions.

## Notes

- Only `TOKENS_LIMIT` quotas are shown; `TIME_LIMIT` / MCP usage is ignored
- Missing auth returns `GLM | auth expired`; API failures return `GLM | quota unavailable`
- `install` does not replace an unmanaged status line unless `--force` is used
- `install --force` backs up the previous entry; `uninstall` restores it when possible

## License

[MIT](./LICENSE)
