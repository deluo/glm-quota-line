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

- **终端快速查询** — 直接运行 `glm-quota-line` 即可在终端查看配额（含 MCP），无需启动 Claude Code
- **Claude Code 状态栏** — 安装后自动嵌入状态栏，实时显示配额余额、重置时间和上下文窗口用量
- **进度条可视化** — 默认 bar 风格，一眼看清剩余比例；周配额显示理论预算阴影
- **智能配速分析** — 根据工作日和已过时间计算配额使用速度，超速时自动变色警示
- **JSON 输出** — 支持 `--json` 参数输出结构化数据，便于脚本调用
- **交互式配置** — `glm-quota-line configure` 启动 TUI 界面，实时预览、逐项调整组件开关与样式
- **组件级控制** — 每个显示组件（套餐、5h、周、重置、上下文）可单独开关和设置样式
- **智能缓存** — 按会话、TTL 和 token 用量分级刷新；`SessionStart` hook 预刷新，新会话不显示旧数据
- **国内 + 国际端点** — 自动识别 `open.bigmodel.cn` 和 `api.z.ai`
- **零依赖** — 无运行时依赖，单一用途

## 快速开始

**一次性查询（无需安装）：**

```bash
npx glm-quota-line
```

**状态栏集成（需要全局安装）：**

```bash
npm install -g glm-quota-line
glm-quota-line install
```

安装完成。Claude Code 底部状态栏会自动显示配额：

```
GLM Lite █████████░ 91% | W ▒▒▒▒░░░░░ 47% 11:10 | 14:47 | ctx ███░░░ 45% (glm-4.7/200K)
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
| `bar`（默认） | 进度条可视化 | `GLM Lite █████████░ 91% \| W ▒▒▒▒░░░░░ 47% 11:10 \| 14:47 \| ctx ███░░░ 45%` |
| `text` | 完整文本 | `GLM Lite \| 5h 91% \| week 47% 11:10 \| reset 14:47 \| ctx 45%` |
| `compact` | 紧凑模式 | `GLM 5h 91% W 47% 11:10 \| 14:47` |

```bash
glm-quota-line config set style compact
```

### theme — 主题配色

| 值 | 说明 |
|---|---|
| `dark`（默认） | 深色终端，浅松绿配色 |
| `light` | 浅色/白色终端，天青蓝配色 |
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

### work-days — 每周工作日

设置每周工作日数量（1-7），用于计算周配额的理论预算和配速分析。默认 5 天。

```bash
glm-quota-line config set work-days 6
```

配速分析会根据已过工作日计算理论预算，并判断使用速度：
- 绿色 — 使用速度 ≤ 1.1x 理论值
- 黄色 — 使用速度 1.1x–1.3x 理论值
- 红色 — 使用速度 > 1.3x 理论值

### minimalist — 极简模式

隐藏所有标签文字，只保留进度条和数值。

```bash
glm-quota-line config set minimalist true
```

效果对比：
- 关闭：`GLM Lite █████████░ 91% | W ▒▒▒▒░░░░░ 47% 11:10 | 14:47`
- 开启：`█████████░ 91% | ▒▒▒▒░░░░░ 47% 11:10 | 14:47`

### raw-values — 原始数值

隐藏所有标签文字，直接显示原始数值。

```bash
glm-quota-line config set raw-values true
```

### reset-format — 重置时间格式

控制状态栏中重置时间的显示格式。

| 值 | 说明 | 示例 |
|---|---|---|
| `time`（默认） | 显示重置时间点 | `reset 14:47` |
| `countdown` | 显示剩余倒计时 | `reset 52m` / `reset 2d 5h` |

```bash
glm-quota-line config set reset-format countdown
```

周配额也会同步显示重置信息（时间点或倒计时）。

### --json — JSON 输出

输出结构化 JSON 格式（仅终端模式，状态栏模式忽略）：

```bash
glm-quota-line --json
```

输出示例：
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

### reset — 恢复出厂配置

一键重置用户配置,保留安装状态(不卸载状态栏/hook)。

```bash
glm-quota-line config reset            # 交互确认后重置全部用户配置
glm-quota-line config reset --models   # 只清空自定义模型映射(modelMap)
glm-quota-line config reset --yes      # 跳过确认(脚本/CI 用)
```

- 默认重置范围:所有全局配置项(theme/display/style/work-days/minimalist/raw-values/reset-format/auth-token/base-url)、组件布局(lines)、自定义模型映射(modelMap)。
- `--models` 限定只清 modelMap,其它配置不动。
- 非交互环境(无 TTY)必须加 `--yes`,否则报错退出,避免误删。
- 重置后状态栏仍正常工作——模型映射会回退到包内默认表(`data/models.json`)。

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

### configure — 交互式 TUI 配置

启动终端交互界面，实时预览状态栏效果，逐项调整组件开关、样式和全局选项。

```bash
glm-quota-line configure
```

操作方式：
- `↑↓` 选择组件，`Enter` 进入编辑，`Tab` 切换样式，`Space` 开关显示
- `g` 进入全局选项（主题、显示模式、极简模式、原始数值、重置时间格式）
- `s` 保存，`q` 退出

组件列表：

| 组件 | 说明 | 可设置样式 | 可隐藏 |
|---|---|---|---|
| `level` | 套餐级别（如 GLM Lite） | — | ✓ |
| `5h` | 5 小时配额 | ✓ (bar/text) | —（必需） |
| `week` | 周配额 | ✓ (bar/text) | ✓ |
| `reset` | 重置时间 | — | ✓ |
| `ctx` | 上下文窗口用量 | ✓ (bar/text) | ✓ |

### model — 模型上下文窗口管理

管理模型的上下文窗口大小映射。上下文窗口用量百分比基于此映射计算。

```bash
glm-quota-line model list                    # 查看所有模型及其上下文窗口大小
glm-quota-line model get <model-id>          # 查看指定模型的大小
glm-quota-line model set <model-id> <size>   # 设置模型大小（如 300K 或 300000）
glm-quota-line model remove <model-id>       # 移除自定义映射（内置模型恢复默认值）
echo '{"glm-5.2":300000}' | glm-quota-line model import  # 从 JSON 批量导入
```

`list` 输出示例：

```
glm-4.7        200K
glm-5.1        200K
glm-5.2        300K *
```

`*` 标记表示用户自定义的映射。

模型映射采用双层结构:包内 `data/models.json` 作为默认底层,`~/.claude/glm-quota-line.json` 里的 `modelMap` 作为用户覆盖层(运行时逐键覆盖)。**智谱发布新模型时,无需等待 npm 包更新——直接 `model set <新模型> <大小>` 写入本地覆盖层即可立刻生效。**

想清空所有自定义模型映射、回到包内默认表:执行 `glm-quota-line config reset --models --yes`。

## 推荐搭配

| 使用场景 | 配置 |
|---|---|
| 深色终端（默认） | `style=bar`, `theme=dark` |
| 浅色终端 | `style=bar`, `theme=light` |
| 极简工作流 | `style=compact`, `theme=mono` |
| 关注已用量 | `style=bar`, `display=used` |
| 倒计时重置 | `reset-format=countdown` |
| 脚本调用 | `--json` |
| 6 天工作制 | `work-days=6` |
| 极简数值 | `minimalist=true` |
| 自定义模型 | `glm-quota-line model set glm-5.2 300K` |
| 交互式配置 | `glm-quota-line configure` |

## 命令参考

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
echo '<json>' | glm-quota-line model import
```

运行 `glm-quota-line --help` 查看完整说明。

## 说明

- 展示 `TOKENS_LIMIT` 配额和 `MCP_LIMIT` / `TIME_LIMIT` 配额
- 周配额进度条中的阴影（▒）是每日应耗基准线：根据已过工作日计算的理论预算，已用部分（█）超过阴影越多，说明消耗越快
- 状态栏默认显示上下文窗口用量和模型信息，可通过 `glm-quota-line configure` 交互式关闭
- 每个组件可单独控制开关和样式，通过 `glm-quota-line configure` 交互式调整
- 上下文窗口使用率优先从原始 token 数计算，当模型映射不可用时回退到 API 提供的百分比
- 模型上下文窗口大小可通过 `glm-quota-line model` 命令自定义，支持查看、设置、移除和批量导入
- 鉴权缺失返回 `GLM | auth expired`；接口异常返回 `GLM | quota unavailable`
- 非 GLM 提供商（非智谱 AI 端点）会自动禁用配额查询
- `install` 默认不会覆盖非本工具管理的状态栏，除非使用 `--force`
- `install --force` 会备份旧配置，`uninstall` 会在可能时恢复
- 设置 `GLM_QUOTA_DEBUG=1` 可输出上下文窗口调试信息到 stderr

## 许可证

[MIT](./LICENSE)
