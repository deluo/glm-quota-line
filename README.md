<h1 align="center">glm-quota-line</h1>

<p align="center">
  Zero-dependency CLI for showing GLM Coding Plan quota in the Claude Code status line.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/glm-quota-line"><img alt="npm version" src="https://img.shields.io/npm/v/glm-quota-line?logo=npm&color=cb3837"></a>
  <a href="https://www.npmjs.com/package/glm-quota-line"><img alt="node version" src="https://img.shields.io/node/v/glm-quota-line?logo=node.js&color=339933"></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/npm/l/glm-quota-line"></a>
  <img alt="dependencies" src="https://img.shields.io/badge/dependencies-0-2ea44f">
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a>
</p>

## Overview

`glm-quota-line` reads the GLM quota endpoint, caches successful responses, and prints a single short line for `statusLine.command`.

It also installs a Claude Code `SessionStart` hook to pre-refresh the quota cache before a new session renders the status line.

It is intentionally scoped to one host only: Claude Code.

## Why

- Built for a single purpose: show GLM quota clearly in Claude Code
- Small and predictable: no runtime dependencies, no unnecessary abstraction
- Practical for real usage: cache-aware, session-aware, and easy to install

## Features

- Built for Claude Code `statusLine.command`
- No runtime dependencies
- Optional `text`, `compact`, and `bar` layouts
- Optional ANSI color themes for dark and light terminals
- Manual `auth-token` and `base-url` overrides for proxy or gateway setups
- Automatic install and uninstall for Claude Code status line integration
- SessionStart pre-refresh so a new Claude session does not briefly show stale quota

## Installation

Recommended:

```bash
npm install -g glm-quota-line
```

From a local clone:

```bash
npm install -g .
```

`npx` is fine for one-off previews, but global install is the better default for Claude Code integration because `install` writes stable executable paths into both `statusLine.command` and the managed `SessionStart` hooks.

## Quick Start

```bash
glm-quota-line install
glm-quota-line config set style bar
glm-quota-line config set theme ansi
glm-quota-line config set palette dark
```

For a one-off preview:

```bash
glm-quota-line --style compact
```

## Output

```text
GLM Lite | 5h left 91% | reset 14:47
GLM 91% | 14:47
GLM Lite ■□□□□□□□□□ 91% | 14:47
```

## Recommended Setups

| Use case | Config |
| --- | --- |
| Dark terminal | `style=bar`, `theme=ansi`, `palette=dark` |
| Light terminal | `style=compact`, `theme=ansi`, `palette=mono` |
| Plain fallback | any `style`, `theme=plain` |

## Color Presets

`style` controls layout. `theme` enables or disables ANSI color. `palette` only applies when `theme=ansi`.

- Dark terminal: `theme=ansi` + `palette=dark`
- Light terminal: `theme=ansi` + `palette=mono`
- Maximum compatibility: `theme=plain`

Examples:

```bash
glm-quota-line config set style text
glm-quota-line config set theme ansi
glm-quota-line config set palette dark

glm-quota-line config set style compact
glm-quota-line config set theme ansi
glm-quota-line config set palette mono

glm-quota-line config set theme plain
```

Set `NO_COLOR=1` to force plain output.

## Manual Credential Overrides

If Claude Code is running behind a gateway or proxy and the injected `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` are not the real values, store explicit overrides:

```bash
glm-quota-line config set auth-token <your-real-token>
glm-quota-line config set base-url https://open.bigmodel.cn/api/anthropic
```

Clear them later with:

```bash
glm-quota-line config unset auth-token
glm-quota-line config unset base-url
```

Stored overrides take precedence over Claude-injected environment variables. `config show` redacts the token, but the local config file still stores the real value in plain text.

## Commands

```bash
glm-quota-line [--style text|compact|bar] [--display left|used|both]
               [--theme plain|ansi] [--palette dark|mono]

glm-quota-line install [--force]
glm-quota-line uninstall
glm-quota-line config show
glm-quota-line config set style <text|compact|bar>
glm-quota-line config set display <left|used|both>
glm-quota-line config set theme <plain|ansi>
glm-quota-line config set palette <dark|mono>
glm-quota-line config set auth-token <token>
glm-quota-line config set base-url <url>
glm-quota-line config unset <style|display|theme|palette|auth-token|base-url>
```

Run `glm-quota-line --help` for the full command descriptions and examples.

## Notes

- Default output is plain text
- Missing or expired auth returns `GLM | auth expired`
- API or parsing failures return `GLM | quota unavailable`
- `install` wires both the status line command and managed `SessionStart` hooks
- `install` does not replace an unmanaged Claude status line unless `--force` is used
- `install --force` backs up the previous entry and `uninstall` restores it when possible

## License

[MIT](./LICENSE)
