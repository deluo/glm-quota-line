<h1 align="center">glm-quota-line</h1>

<p align="center">
  为 Claude Code 打造的智谱 GLM Coding Plan 配额监控工具。数据精准同步官网，无需切换窗口，随时掌握用量。
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

## 功能

- **终端快速查询** — 直接运行 `glm-quota-line` 即可在终端查看配额，无需启动 Claude Code
- **Claude Code 状态栏** — 安装后自动嵌入状态栏，实时显示配额余额和重置时间
- **进度条可视化** — 默认 bar 风格，一眼看清剩余比例
- **智能缓存** — 按会话、TTL 和 token 用量分级刷新；`SessionStart` hook 预刷新，新会话不显示旧数据
- **国内 + 国际端点** — 自动识别 `open.bigmodel.cn` 和 `api.z.ai`
- **零依赖** — 无运行时依赖，单一用途

## 快速开始

```bash
npm install -g glm-quota-line
glm-quota-line install
```

安装完成。Claude Code 底部状态栏会自动显示配额：

```
GLM Lite █████████░ 91% | W 47% | 14:47
```

也可以直接在终端运行 `glm-quota-line` 快速查看用量，无需启动 Claude Code。

升级版本：

```bash
npm install -g glm-quota-line
glm-quota-line check-update
```

## 配置项

所有配置均为可选，按需调整。通过 `glm-quota-line config set` 持久化，或用 CLI 参数临时覆盖。

### style — 输出布局

| 值 | 说明 | 示例 |
|---|---|---|
| `bar`（默认） | 进度条可视化 | `GLM Lite █████████░ 91% \| W 47% \| 14:47` |
| `text` | 完整文本 | `GLM Lite \| 5h 91% \| week 47% \| reset 14:47` |
| `compact` | 紧凑模式 | `GLM 5h 91% W 47% \| 14:47` |

```bash
glm-quota-line config set style compact
```

### theme — 主题配色

| 值 | 说明 |
|---|---|
| `dark`（默认） | 深色终端，彩色对比最强 |
| `light` | 浅色/白色终端，蓝调配色 |
| `mono` | 灰阶，极简低干扰 |

```bash
glm-quota-line config set theme light
```

配额百分比会根据剩余量自动变色：

- 绿色 — 剩余 >= 60%
- 黄色 — 剩余 30%–60%
- 红色 — 剩余 < 30%

### display — 显示指标

| 值 | 说明 |
|---|---|
| `left`（默认） | 显示剩余量（进度条填充 = 剩余比例） |
| `used` | 显示已用量（进度条填充 = 已用比例） |

```bash
glm-quota-line config set display used
```

### auth-token / base-url — 自定义鉴权

当 Claude Code 运行在代理或网关后面时，注入的 `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` 可能不是实际值，可手动覆盖：

```bash
glm-quota-line config set auth-token <your-real-token>
glm-quota-line config set base-url https://open.bigmodel.cn/api/anthropic
# 或
glm-quota-line config set base-url https://api.z.ai/api/anthropic
```

清除：`glm-quota-line config unset auth-token` / `base-url`。

鉴权来源优先级（从高到低）：

1. `config set` 持久化的值
2. 环境变量 `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL`
3. `~/.claude/settings.json` 中的 `env` 字段

## 推荐搭配

| 使用场景 | 配置 |
|---|---|
| 深色终端（默认） | `style=bar`, `theme=dark` |
| 浅色终端 | `style=bar`, `theme=light` |
| 极简工作流 | `style=compact`, `theme=mono` |
| 关注已用量 | `style=bar`, `display=used` |

## 命令参考

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

运行 `glm-quota-line --help` 查看完整说明。

## 说明

- 只展示 `TOKENS_LIMIT` 配额，忽略 `TIME_LIMIT` / MCP 使用量
- 鉴权缺失返回 `GLM | auth expired`；接口异常返回 `GLM | quota unavailable`
- `install` 默认不会覆盖非本工具管理的状态栏，除非使用 `--force`
- `install --force` 会备份旧配置，`uninstall` 会在可能时恢复

## 许可证

[MIT](./LICENSE)
