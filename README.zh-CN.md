<h1 align="center">glm-quota-line</h1>

<p align="center">
  用于在 Claude Code 状态栏显示 GLM Coding Plan 配额的零依赖 CLI。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/glm-quota-line"><img alt="npm version" src="https://img.shields.io/npm/v/glm-quota-line?logo=npm&color=cb3837"></a>
  <a href="https://www.npmjs.com/package/glm-quota-line"><img alt="node version" src="https://img.shields.io/node/v/glm-quota-line?logo=node.js&color=339933"></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/npm/l/glm-quota-line"></a>
  <img alt="dependencies" src="https://img.shields.io/badge/dependencies-0-2ea44f">
</p>

<p align="center">
  <a href="./README.md">English</a>
</p>

## 简介

`glm-quota-line` 会读取 GLM 配额接口、缓存成功结果，并输出一行适合 `statusLine.command` 的短文本。

它也会安装 Claude Code 的 `SessionStart` hook，在新会话渲染状态栏之前预刷新 quota 缓存。

项目只面向一个宿主：Claude Code。

## 为什么用它

- 目标单一：只解决 Claude Code 里显示 GLM 配额这件事
- 足够小：无运行时依赖，没有多余抽象
- 面向实际使用：带缓存、识别新会话、安装简单

## 功能

- 专为 Claude Code `statusLine.command` 设计
- 无运行时依赖
- 支持 `text`、`compact`、`bar` 三种样式
- 支持适合深色和浅色终端的 ANSI 颜色主题
- 支持手动设置 `auth-token` 和 `base-url`，覆盖代理或网关环境
- 支持自动安装和卸载 Claude Code 状态栏配置
- 通过 SessionStart 预刷新，减少新会话首屏短暂显示旧配额的情况

## 安装

推荐：

```bash
npm install -g glm-quota-line
```

本地仓库调试安装：

```bash
npm install -g .
```

`npx` 适合一次性试跑，但 Claude Code 的正式集成更适合全局安装，因为 `install` 会把稳定的可执行路径写入 `statusLine.command` 和受工具管理的 `SessionStart` hooks。

## 快速开始

```bash
glm-quota-line install
glm-quota-line config set style bar
glm-quota-line config set theme ansi
glm-quota-line config set palette dark
```

临时预览：

```bash
glm-quota-line --style compact
```

## 输出示例

```text
GLM Lite | 5h left 91% | reset 14:47
GLM 91% | 14:47
GLM Lite ■□□□□□□□□□ 91% | 14:47
```

## 推荐搭配

| 使用场景 | 配置 |
| --- | --- |
| 深色终端 | `style=bar`, `theme=ansi`, `palette=dark` |
| 浅色终端 | `style=compact`, `theme=ansi`, `palette=mono` |
| 纯文本回退 | 任意 `style`，`theme=plain` |

## 颜色搭配

`style` 控制布局，`theme` 控制是否启用 ANSI，`palette` 只在 `theme=ansi` 时生效。

- 深色终端：`theme=ansi` + `palette=dark`
- 浅色终端：`theme=ansi` + `palette=mono`
- 最大兼容性：`theme=plain`

示例：

```bash
glm-quota-line config set style text
glm-quota-line config set theme ansi
glm-quota-line config set palette dark

glm-quota-line config set style compact
glm-quota-line config set theme ansi
glm-quota-line config set palette mono

glm-quota-line config set theme plain
```

设置 `NO_COLOR=1` 可强制关闭颜色。

## 手动凭证覆盖

如果 Claude Code 运行在代理或网关后面，注入的 `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL` 不是实际值，可以显式保存覆盖值：

```bash
glm-quota-line config set auth-token <your-real-token>
glm-quota-line config set base-url https://open.bigmodel.cn/api/anthropic
```

清除覆盖值：

```bash
glm-quota-line config unset auth-token
glm-quota-line config unset base-url
```

手动保存的覆盖值优先于 Claude 注入的环境变量。`config show` 会脱敏显示 token，但本地配置文件仍会明文保存真实值。

## 命令

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

完整说明和示例可运行：

```bash
glm-quota-line --help
```

## 说明

- 默认输出为纯文本
- 鉴权缺失或失效时返回 `GLM | auth expired`
- 接口异常或解析失败时返回 `GLM | quota unavailable`
- `install` 会同时接入状态栏命令和受工具管理的 `SessionStart` hooks
- `install` 默认不会覆盖非本工具管理的 Claude 状态栏，除非显式使用 `--force`
- `install --force` 会备份旧配置，`uninstall` 会在可能时恢复

## 许可证

[MIT](./LICENSE)
