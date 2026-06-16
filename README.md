<h1 align="center">glm-quota-line</h1>

<p align="center">
  为 Claude Code 打造的智谱 GLM Coding Plan 配额监控工具<br>
  <strong>让你专注编码而不用频繁切换窗口检查配额</strong>
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

## 核心价值

**数据精准同步官网** → **状态栏实时显示** → **智能配速警示**

安装后，Claude Code 底部状态栏会自动显示配额：

```
GLM Lite █████████░ 91% | W ▒▒▒▒░░░░░ 47% 11:10 | 14:47 | ctx ███░░░ 45% (glm-4.7/200K)
```

**一眼看清**：
- 套餐剩余量（91%）和进度条
- 周配额消耗情况（47%）+ 理论预算阴影（▒）
- 距离重置时间（14:47）
- 上下文窗口用量（45%）

超速时自动变色警示，避免配额耗尽中断工作流。

## 30 秒快速开始

**一次性查询（无需安装）：**

```bash
npx glm-quota-line
```

**状态栏集成（推荐）：**

```bash
npm install -g glm-quota-line
glm-quota-line install
```

安装完成。可以随时在终端运行 `glm-quota-line` 快速查看用量，无需启动 Claude Code。

升级版本：

```bash
npm install -g glm-quota-line
glm-quota-line check-update
```

## 常见工作流

### 📊 我想快速查看配额

```bash
glm-quota-line
```

### 🎨 我想定制状态栏样式

**推荐方式**：使用交互式配置（实时预览效果）

```bash
glm-quota-line configure
```

手动配置参见[快速定制](#快速定制)

### 🤖 我想更换模型或调整上下文窗口

```bash
# 智谱发布新模型时，无需等 npm 更新，立即写入本地覆盖：
glm-quota-line model set glm-5.3 400K
# 查看当前所有模型及其上下文窗口
glm-quota-line model list
```

### 🔧 我想在脚本中调用

```bash
glm-quota-line --json
```

输出结构化 JSON 数据：

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

### ⚠️ 配额用完了或显示异常

参见[故障排查](#故障排查)

## 快速定制

### 推荐方式：交互式配置

```bash
glm-quota-line configure  # 实时预览，所见即所得
```

**操作方式**：
- `↑↓` 选择组件，`Enter` 进入编辑，`Tab` 切换样式，`Space` 开关显示
- `g` 进入全局选项（主题、显示模式、极简模式、原始数值、重置时间格式）
- `s` 保存，`q` 退出

### 常用配置（非交互式）

#### 风格主题

```bash
glm-quota-line config set style compact  # 紧凑模式
glm-quota-line config set theme light    # 浅色主题
glm-quota-line config set theme mono     # 灰阶极简
```

**风格对比**：

| 风格 | 说明 | 示例 |
|---|---|---|
| `bar`（默认） | 进度条可视化 | `GLM Lite █████████░ 91% \| W ▒▒▒▒░░░░░ 47% 11:10 \| 14:47 \| ctx ███░░░ 45%` |
| `text` | 完整文本 | `GLM Lite \| 5h 91% \| week 47% 11:10 \| reset 14:47 \| ctx 45%` |
| `compact` | 紧凑模式 | `GLM 5h 91% W 47% 11:10 \| 14:47` |

#### 显示内容

```bash
glm-quota-line config set display used           # 显示已用量而非剩余量
glm-quota-line config set reset-format countdown  # 倒计时模式（如 reset 52m）
glm-quota-line config set minimalist true         # 极简模式（隐藏标签文字）
```

**配色逻辑**：

配额百分比会根据剩余量自动变色：
- 🟢 绿色 — 剩余 >= 60%
- 🟡 黄色 — 剩余 30%–60%
- 🔴 红色 — 剩余 < 30%

配速分析会根据使用速度变色：
- 🟢 绿色 — 使用速度 ≤ 1.1x 理论值
- 🟡 黄色 — 使用速度 1.1x–1.3x 理论值
- 🔴 红色 — 使用速度 > 1.3x 理论值

<details>
<summary><b>高级配置选项</b>（点击展开）</summary>

### 工作日设置

设置每周工作日数量（1-7），用于计算周配额的理论预算和配速分析。默认 5 天。

```bash
glm-quota-line config set work-days 6
```

### 原始数值模式

直接显示原始数值，不显示百分比。

```bash
glm-quota-line config set raw-values true
```

### 自定义鉴权

当 Claude Code 运行在代理或网关后面时，可手动覆盖鉴权信息：

```bash
glm-quota-line config set auth-token <your-real-token>
glm-quota-line config set base-url https://open.bigmodel.cn/api/anthropic
# 或
glm-quota-line config set base-url https://api.z.ai/api/anthropic
```

清除：`glm-quota-line config unset auth-token` / `base-url`。

**鉴权优先级**（从高到低）：
1. `config set` 持久化的值
2. 环境变量 `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL`
3. `~/.claude/settings.json` 中的 `env` 字段

### 恢复出厂配置

一键重置用户配置，保留安装状态（不卸载状态栏/hook）。

```bash
glm-quota-line config reset            # 交互确认后重置全部用户配置
glm-quota-line config reset --models   # 只清空自定义模型映射(modelMap)
glm-quota-line config reset --yes      # 跳过确认(脚本/CI 用)
```

- 默认重置范围：所有全局配置项、组件布局、自定义模型映射
- `--models` 限定只清 modelMap，其它配置不动
- 非交互环境(无 TTY)必须加 `--yes`，否则报错退出
- 重置后状态栏仍正常工作——模型映射会回退到包内默认表

</details>

## 高级功能

<details>
<summary><b>模型映射管理</b>（新模型支持）</summary>

管理模型的上下文窗口大小映射。上下文窗口用量百分比基于此映射计算。

```bash
glm-quota-line model list                    # 查看所有模型及其上下文窗口大小
glm-quota-line model get <model-id>          # 查看指定模型的大小
glm-quota-line model set <model-id> <size>   # 设置模型大小（如 300K 或 300000）
glm-quota-line model remove <model-id>       # 移除自定义映射（内置模型恢复默认值）
```

**`list` 输出示例**：

```
glm-4.5-air  128K
glm-4.7      200K
glm-5-turbo  200K
glm-5.2      1M *
```

`*` 标记表示用户自定义的映射。

**双层结构设计**：
- 包内 `data/models.json` 作为默认底层
- `~/.claude/glm-quota-line.json` 里的 `modelMap` 作为用户覆盖层（运行时逐键覆盖）

**优势**：智谱发布新模型时，无需等待 npm 包更新——直接 `model set <新模型> <大小>` 写入本地覆盖层即可立刻生效。

想清空所有自定义模型映射、回到包内默认表：执行 `glm-quota-line config reset --models --yes`。

</details>

<details>
<summary><b>Agent / 自动化接口</b></summary>

如果你是 AI agent（Claude Code / Cursor / Codex）或脚本作者，以下接口保证稳定：

```bash
# 一次调用拿到所有命令的 machine-readable schema
glm-quota-line commands --json

# 查看单个命令或命令组的聚焦帮助
glm-quota-line model --help
glm-quota-line config set --help
```

**约定**：
- **退出码**：成功 `0`，失败 `1`
- **副作用标注**：每个命令标为 `read`（只读）、`write`（改配置）、`mutating`（改 Claude Code 集成）、`interactive`（需 TTY）
- **非阻塞**：所有命令都不会卡住等待输入
- **只读查询**：`glm-quota-line --json` 输出结构化配额数据

典型 agent 工作流：先 `commands --json` 了解能力 → 调用需要的命令 → 读取 stdout 解析结果。

</details>

<details>
<summary><b>组件级控制</b></summary>

通过 `glm-quota-line configure` 的组件模式，可单独控制每个显示组件的开关和样式。操作键见[快速定制](#快速定制)，各组件能力如下：

| 组件 | 说明 | 可设置样式 | 可隐藏 |
|---|---|---|---|
| `level` | 套餐级别（如 GLM Lite） | — | ✓ |
| `5h` | 5 小时配额 | ✓ (bar/text) | —（必需） |
| `week` | 周配额 | ✓ (bar/text) | ✓ |
| `reset` | 重置时间 | — | ✓ |
| `ctx` | 上下文窗口用量 | ✓ (bar/text) | ✓ |

</details>

## 故障排查

### 配额不显示

**可能原因**：
1. 鉴权信息缺失或过期
2. 非 GLM 提供商（端点不是 `open.bigmodel.cn` 或 `api.z.ai`）
3. 网络连接问题

**解决方法**：
```bash
# 检查鉴权状态
glm-quota-line

# 如果显示 "auth expired"，更新鉴权信息
glm-quota-line config set auth-token <your-token>
glm-quota-line config set base-url https://open.bigmodel.cn/api/anthropic
```

### 显示 "quota unavailable"

**可能原因**：
- 智谱 API 接口异常
- 网络连接问题

**解决方法**：
- 稍后重试（工具会自动重试）
- 检查网络连接
- 如果持续出现，可能是智谱服务问题

### 安装/卸载问题

**状态栏没有更新**：
```bash
glm-quota-line uninstall
glm-quota-line install --force
```

`install --force` 会备份旧配置，`uninstall` 会在可能时恢复。

### 调试模式

设置 `GLM_QUOTA_DEBUG=1` 可输出上下文窗口调试信息到 stderr：

```bash
GLM_QUOTA_DEBUG=1 glm-quota-line
```

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
glm-quota-line commands --json
```

运行 `glm-quota-line --help` 查看完整说明。

## 技术说明

- 展示 `TOKENS_LIMIT` 配额和 `MCP_LIMIT` / `TIME_LIMIT` 配额
- 周配额进度条中的阴影（▒）是每日应耗基准线：根据已过工作日计算的理论预算
- 上下文窗口使用率优先从原始 token 数计算，当模型映射不可用时回退到 API 提供的百分比
- 智能缓存：按会话、TTL 和 token 用量分级刷新；`SessionStart` hook 预刷新，新会话不显示旧数据
- 支持国内（`open.bigmodel.cn`）和国际（`api.z.ai`）端点自动识别
- 非 GLM 提供商会自动禁用配额查询
- 零运行时依赖

## 许可证

[MIT](./LICENSE)
