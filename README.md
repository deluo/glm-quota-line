# glm-quota-line

`glm-quota-line` 是一个给 Claude Code 底部状态栏使用的轻量 CLI，用来显示智谱 GLM Coding Plan 的 5 小时配额状态。

它会读取配额接口、缓存成功结果，并输出一行适合状态栏展示的短文本。

## 功能

- 适配 Claude Code `statusLine.command`
- 优先读取 Claude 进程里的 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL`
- 新会话首次强制刷新，之后 5 分钟内走缓存
- 支持 `text`、`compact`、`bar` 三种样式
- 支持自动安装和卸载 Claude Code 的状态栏配置

## 展示效果

`text`

```text
GLM Lite | 5h left 91% | reset 14:47
```

`compact`

```text
GLM 91% | 14:47
```

`bar`

```text
GLM Lite ■□□□□□□□□□ 91% | 14:47
```

说明：

- `■` 表示已用
- `□` 表示未用

## 安装

本地仓库安装：

```bash
npm install -g .
```

npm 发布后安装：

```bash
npm install -g glm-quota-line
```

## 使用

安装 Claude Code 状态栏：

```bash
glm-quota-line install
```

切换样式：

```bash
glm-quota-line config set style text
glm-quota-line config set style compact
glm-quota-line config set style bar
```

切换显示模式：

```bash
glm-quota-line config set display left
glm-quota-line config set display used
glm-quota-line config set display both
```

查看当前配置：

```bash
glm-quota-line config show
```

卸载状态栏：

```bash
glm-quota-line uninstall
```

## 环境变量

优先使用：

- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_BASE_URL`

## 说明

- 默认只显示一行文本，适合底部状态栏
- 鉴权失效时显示 `GLM | auth expired`
- 接口异常时显示 `GLM | quota unavailable`
- `install` 默认不会覆盖已有的非本工具 `statusLine`
- `install --force` 会覆盖并备份原配置，`uninstall` 时可恢复
