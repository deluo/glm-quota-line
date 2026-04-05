<h1 align="center">glm-quota-line</h1>

<p align="center">
  一行命令安装、零依赖，在 Claude Code 状态栏实时显示 GLM 配额余额与重置时间。数据来自官方接口，精准非估算。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/glm-quota-line"><img alt="npm version" src="https://img.shields.io/npm/v/glm-quota-line?logo=npm&color=cb3837"></a>
  <a href="https://www.npmjs.com/package/glm-quota-line"><img alt="node version" src="https://img.shields.io/node/v/glm-quota-line?logo=node.js&color=339933"></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/npm/l/glm-quota-line"></a>
  <img alt="dependencies" src="https://img.shields.io/badge/dependencies-0-2ea44f">
</p>

<p align="center">
  <a href="./README.en.md">English</a>
</p>

`glm-quota-line` 读取 GLM 配额接口、缓存结果，并输出一行适合 Claude Code `statusLine.command` 的状态文本。通过 `SessionStart` hook 预刷新缓存，新会话不会显示旧配额。

## 功能

- **一行命令安装** — `glm-quota-line install` 自动接入 Claude Code 状态栏和 `SessionStart` hook
- **精准配额显示** — 数据来自官方配额接口，非估算；同时展示 5 小时和周 token 配额
- **国内 + 国际端点** — 自动识别 `open.bigmodel.cn` 和 `api.z.ai`
- **零依赖** — 无运行时依赖，单一用途
- **智能缓存** — 按会话、TTL 和 token 用量刷新；支持代理/网关手动覆盖鉴权

## 安装

```bash
npm install -g glm-quota-line
```

推荐全局安装，`install` 会将稳定的可执行路径写入 `statusLine.command` 和 `SessionStart` hooks。`npx` 适合一次性试跑。

## 快速开始

```bash
glm-quota-line install
glm-quota-line config set style bar
glm-quota-line config set theme ansi
glm-quota-line config set palette dark
```

## 输出示例

```text
GLM Lite | 5h 91% | week 47% | reset 14:47

GLM 5h 91% W 47% | 14:47

GLM Lite █░░░░░░░░░ 91% | W 47% | 14:47
```

同时显示 5 小时配额（主要）和周配额（次要），并自动展示重置时间。

## 样式与配色

| 使用场景   | 配置                                          |
| ---------- | --------------------------------------------- |
| 深色终端   | `style=bar`, `theme=ansi`, `palette=dark`     |
| 浅色终端   | `style=compact`, `theme=ansi`, `palette=mono` |
| 纯文本回退 | 任意 `style`，`theme=plain`                   |

`style` 控制布局（`text` / `compact` / `bar`），`theme` 控制是否启用 ANSI 颜色，`palette` 仅在 `theme=ansi` 时生效。

设置 `NO_COLOR=1` 可强制关闭颜色。

## 自定义鉴权

如果 Claude Code 运行在代理或网关后面，注入的 `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` 不是实际值：

```bash
glm-quota-line config set auth-token <your-real-token>
glm-quota-line config set base-url https://open.bigmodel.cn/api/anthropic
# 或
glm-quota-line config set base-url https://api.z.ai/api/anthropic
```

清除：`glm-quota-line config unset auth-token` / `base-url`。手动保存的值优先于 Claude 注入的环境变量。

## 命令

```bash
glm-quota-line [--style text|compact|bar] [--display left|used|both]
               [--theme plain|ansi] [--palette dark|mono]

glm-quota-line install [--force]
glm-quota-line uninstall
glm-quota-line config show
glm-quota-line config set <style|display|theme|palette|auth-token|base-url> <value>
glm-quota-line config unset <key>
```

完整说明运行 `glm-quota-line --help`。

## 说明

- 只展示 `TOKENS_LIMIT` 配额，忽略 `TIME_LIMIT` / MCP 使用量
- 鉴权缺失返回 `GLM | auth expired`；接口异常返回 `GLM | quota unavailable`
- `install` 默认不会覆盖非本工具管理的状态栏，除非使用 `--force`
- `install --force` 会备份旧配置，`uninstall` 会在可能时恢复

## 许可证

[MIT](./LICENSE)
