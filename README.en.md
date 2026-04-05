<h1 align="center">glm-quota-line</h1>

<p align="center">
  One-command install, zero dependencies. Shows accurate GLM quota balance and reset time in the Claude Code status line — data from the official API, not estimated.
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

`glm-quota-line` reads the GLM quota API, caches results, and prints a short status line for Claude Code's `statusLine.command`. A `SessionStart` hook pre-refreshes the cache so new sessions never show stale data.

## Features

- **One-command install** — `glm-quota-line install` wires status line and `SessionStart` hooks into Claude Code automatically
- **Accurate quota display** — reads directly from the official GLM quota API, not estimated; shows both 5-hour and weekly token quotas
- **Domestic + international endpoints** — auto-detects `open.bigmodel.cn` and `api.z.ai`
- **Zero dependencies** — no runtime deps, single-purpose CLI
- **Smart caching** — refreshes by session, TTL, and token usage; supports manual auth overrides for proxy/gateway setups

## Installation

```bash
npm install -g glm-quota-line
```

Global install is recommended because `install` writes stable executable paths into `statusLine.command` and `SessionStart` hooks. `npx` works for one-off previews.

Upgrade:

```bash
npm install -g glm-quota-line
glm-quota-line check-update
```

## Quick Start

```bash
glm-quota-line install
glm-quota-line config set style bar
glm-quota-line config set theme ansi
glm-quota-line config set palette dark
```

## Output

```text
GLM Lite | 5h 91% | week 47% | reset 14:47

GLM 5h 91% W 47% | 14:47

GLM Lite █░░░░░░░░░ 91% | W 47% | 14:47
```

Both the 5-hour quota (primary) and weekly quota (secondary) are shown with automatic reset time.

## Styles & Colors

| Use case       | Config                                        |
| -------------- | --------------------------------------------- |
| Dark terminal  | `style=bar`, `theme=ansi`, `palette=dark`     |
| Light terminal | `style=compact`, `theme=ansi`, `palette=mono` |
| Plain fallback | any `style`, `theme=plain`                    |

`style` controls layout (`text` / `compact` / `bar`). `theme` enables ANSI color. `palette` only applies when `theme=ansi`.

Set `NO_COLOR=1` to force plain output.

## Custom Auth

If Claude Code runs behind a gateway or proxy and the injected `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` are not the real values:

```bash
glm-quota-line config set auth-token <your-real-token>
glm-quota-line config set base-url https://open.bigmodel.cn/api/anthropic
# or
glm-quota-line config set base-url https://api.z.ai/api/anthropic
```

Clear with `glm-quota-line config unset auth-token` / `base-url`. Stored overrides take precedence over Claude-injected environment variables.

## Commands

```bash
glm-quota-line [--style text|compact|bar] [--display left|used|both]
               [--theme plain|ansi] [--palette dark|mono]

glm-quota-line install [--force]
glm-quota-line uninstall
glm-quota-line version
glm-quota-line check-update
glm-quota-line config show
glm-quota-line config set <style|display|theme|palette|auth-token|base-url> <value>
glm-quota-line config unset <key>
```

Run `glm-quota-line --help` for full descriptions.

Use `glm-quota-line --version` to print the installed version. `check-update` only checks and prints the suggested upgrade command; it does not modify your environment.

## Notes

- Only `TOKENS_LIMIT` quotas are shown; `TIME_LIMIT` / MCP usage is ignored
- Missing auth returns `GLM | auth expired`; API failures return `GLM | quota unavailable`
- `install` does not replace an unmanaged status line unless `--force` is used
- `install --force` backs up the previous entry; `uninstall` restores it when possible

## License

[MIT](./LICENSE)
