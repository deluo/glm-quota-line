# 设计:默认模型表外置

日期: 2026-06-13
状态: 已确认,待写实现计划

## 背景与动机

`src/core/context/models.js` 中有一张写死的内置模型上下文窗口表 `DEFAULT_MODEL_MAP`:

```js
const DEFAULT_MODEL_MAP = {
  "glm-4.5-air": 128_000,
  "glm-4.7": 200_000,
  "glm-5-turbo": 200_000,
  "glm-5": 200_000,
  "glm-5.1": 200_000
};
```

开箱即用只认这 5 个旧模型,且已过时 —— 套餐中已移除 `glm-5.1`,而新模型 `glm-5.2`(1M 上下文)尚未收录。当智谱发布新模型时,用户必须**手动** `glm-quota-line model set glm-5.2 1000000` 才能让上下文窗口百分比算准,否则回退到 API 百分比或无法显示。

现状中**已经可配置**、本次**不动**的部分:

- 模型的上下文窗口大小: `glm-quota-line model set/import` 已能持久化到 `~/.claude/glm-quota-line.json` 的 `modelMap`。
- 当前显示的模型 ID: Claude Code 通过 stdin 的 `context_window.model.id` **运行时传入**(`src/core/context/parser.js:60`),代码并不写死当前模型。

## 目标

把写死的 `DEFAULT_MODEL_MAP` 外置成包内数据文件 `data/models.json`,使"新模型发布时只需改 JSON、不必改代码/发版"成为现实。

## 非目标 (YAGNI)

本次明确**不做**:

- 远程 / 官方 API 拉取最新模型列表
- TUI 里可视化增删模型
- 独立用户默认文件(用户默认表)
- 把 `getModelSize()` 等同步 API 改成异步(波及 `getContextData` 整条链路,代价过大)

## 三层模型来源(优先级从高到低)

```
用户本地完整表 (modelMap)    ←  ~/.claude/glm-quota-line.json  ← 运行时默认源
        ↑ 覆盖
包内种子表 (data/models.json) ←  仅用于初始化/重置,运行时几乎不触达
        ↑ 兜底
硬编码 fallback              ←  models.js 内保留 glm-4.7,文件读不到时用
```

**关键策略转向(本次澄清后):** 运行时默认源是**用户本地 `modelMap`**,不是包内表。新模型发布时用户直接编辑本地 `modelMap` 即可,完全不依赖 npm 更新。glm-quota-line **项目方后续不再维护包内模型映射的更新**,包内 `data/models.json` 仅作**初始化种子**,内容定稿后基本不动(可能仅改兜底 `glm-4.7`)。包内表的唯一用途: 新安装 / 重置 / 重新安装时,把这份种子写到用户本地。

## 改动点

### 1. `data/models.json`(包根目录)—— 初始化种子表

```json
{
  "schemaVersion": 1,
  "source": "https://open.bigmodel.cn/dev/api#glm",
  "models": {
    "glm-4.5-air": 128000,
    "glm-4.7": 200000,
    "glm-5-turbo": 200000,
    "glm-5.2": 1000000
  }
}
```

> 注: 套餐中已移除 `glm-5` 和 `glm-5.1`,故不收录;`glm-5.2` 上下文为 1M(1,000,000)。
> **此文件定稿后基本不再更新**,仅作初始化种子 + 文件丢失兜底。

### 1b. 初始化机制(新增)

**A. `install` 自动初始化**: `glm-quota-line install` 执行时,若用户本地 `~/.claude/glm-quota-line.json` 的 `modelMap` 为空(字段不存在或为空对象 `{}`),则自动把包内种子表写入 `modelMap`。已有非空 `modelMap` 时不覆盖(保留用户自定义)。

**B. `model init` 手动命令**: 用包内种子表**直接覆盖**本地 `modelMap`(本地自定义映射会丢失)。用于用户想从干净状态重新开始手编。语义: 重置覆盖。

```bash
glm-quota-line model init    # 用包内种子表重置本地 modelMap
```
> 后续新模型发布只需往 `models` 对象里加一行,改 JSON 即可。

### 2. 改 `src/core/context/models.js`

- `DEFAULT_MODEL_MAP` 降级为**极小兜底表** `FALLBACK_MODEL_MAP`,仅保留 `glm-4.7` 一项:

  ```js
  const FALLBACK_MODEL_MAP = {
    "glm-4.7": 200_000
  };
  ```

  > **兜底表的职责**: 仅作 **`data/models.json` 文件 I/O 失败时的防御性保险**(文件缺失 / 损坏 / 字段异常),保证代码不崩。它**不是**用来防"用户删光模型映射"的 —— 用户层的 `model remove` 只删 `~/.claude/glm-quota-line.json` 的 `modelMap`,删不掉包内 `data/models.json`,所以用户即便清空自定义映射,`getDefaultModels()` 仍返回完整的包内默认表。npm 包正常分发时 `data/models.json` 永远在,兜底几乎不会触发。

- 新增 `loadBundledModels()` —— **同步**读取 `data/models.json`(用 `fs.readFileSync` + `import.meta.url` 定位包根)。模块级缓存,首次读取后复用,零运行时开销。

  选择同步而非异步的原因: `getModelSize()` / `hasModel()` / `getAllModels()` 等现有 API 都是同步的,改成异步会波及 `getContextData` 整条调用链,代价过大。包内文件同步读一次并可缓存,无性能问题。

- `getDefaultModels()` 返回 **bundled ∪ fallback**: 优先用 `data/models.json` 的 `models` 字段;读取失败(文件缺失 / JSON 损坏 / 缺 `models` 字段 / 非对象)时退回 `FALLBACK_MODEL_MAP`。

- `getModelSize` / `hasModel` / `getAllModels` / `resetModels` 对外行为不变,只是底层数据源从硬编码表换成 `getDefaultModels()` 的结果。

- `mergeModelMap` / `setModelSize` / `removeModel` 等操作用户层的 `modelMap` 的 API 行为不变。

### 3. `package.json`

在 `files` 数组中加入 `"data"`,确保 `data/models.json` 随 npm 发布:

```json
"files": [
  "src",
  "data",
  "README.md",
  "README.en.md",
  "LICENSE",
  "CHANGELOG.md"
]
```

### 4. `src/cli/commands.js` —— 新增 `model init` 子命令

新增 `init` 子命令: 用包内种子表(`getDefaultModels()`)直接覆盖本地 `modelMap`。

```bash
glm-quota-line model init
```

行为:
- 读取 `getDefaultModels()`(包内 `data/models.json`,失败时 `glm-4.7` 兜底)
- 直接写入 `~/.claude/glm-quota-line.json` 的 `modelMap`,**覆盖**已有值(本地自定义映射丢失)
- 输出写入的条目数与配置路径

`list` / `get` / `set` / `remove` / `import` 其余逻辑不变。

### 5. `src/claude/install.js` —— install 时自动初始化

在 `installClaudeStatusLine` 写回 `toolConfig` 前,插入自动初始化逻辑:

```js
// 若用户本地 modelMap 为空(不存在或 {}),用包内种子表初始化
if (!toolConfig.modelMap || Object.keys(toolConfig.modelMap).length === 0) {
  toolConfig.modelMap = getDefaultModels();
}
```

已有非空 `modelMap` 时**不覆盖**(保留用户自定义)。这保证新安装的用户开箱即有一份完整本地表。

### 6. `src/cli/index.js` —— help 文本补 `model init`

在 `model` 命令的 usage 段落加入 `init` 说明。

### 7. 文档

- `README.md` 的 `model` 章节: 说明运行时默认源是用户本地 `modelMap`,新模型发布时直接编辑该文件即可;`model init` 可用包内种子表重置。
- `CHANGELOG.md` 新增条目。

## 数据流(改动后)

```
status line 渲染
  └─ getContextData(input, { modelMap })            // src/core/context/index.js
       └─ resolveWindowSize(parsed, modelMap)        // 先查传入的 user modelMap (运行时默认源)
            └─ getModelSize(modelId)                 // user 没有则查 getDefaultModels() (包内种子,极少触达)
                 └─ loadBundledModels() 优先,fallback 兜底
```

`model list` 命令:
```
readToolConfig() → config.modelMap (用户本地完整表,运行时默认源)
getDefaultModels() → bundled ∪ fallback (种子表)
合并: { ...defaults, ...config.modelMap },标记 * 仅对 config.modelMap 中的项
```

`model init` / install 初始化:
```
getDefaultModels() → 包内种子表 → 写入 ~/.claude/glm-quota-line.json 的 modelMap
```

## 错误处理

`loadBundledModels()` 对以下情况都**不抛异常**,优雅降级到 `FALLBACK_MODEL_MAP`:

- `data/models.json` 文件不存在
- 文件存在但 JSON 解析失败(损坏)
- 解析成功但缺少 `models` 字段
- `models` 字段存在但非对象(如数组、字符串)
- `models` 内某项 size 非正整数(该项跳过,其余仍可用)

降级时若 `GLM_QUOTA_DEBUG=1`,向 stderr 输出一条说明(复用现有调试机制)。

## 测试

新增 / 更新测试覆盖:

- `data/models.json` 正常解析: `getDefaultModels()` 返回包内表内容
- 三层合并优先级: 用户 `modelMap` 覆盖包内默认覆盖 fallback
- 文件缺失: 回退到 `glm-4.7` 兜底,不抛异常
- JSON 损坏 / 缺 `models` 字段 / `models` 非对象: 回退兜底
- `models` 内部分项非法: 非法项跳过,合法项保留
- `model init`: 用包内种子表覆盖本地 `modelMap`(已有自定义被覆盖)
- install 自动初始化: 本地 `modelMap` 为空时写入种子表;非空时不覆盖
- `model list` 三态: 包内默认无标记,用户自定义标 `*`
- 现有 `test/context.test.js` 仍通过(数据源换了但 `getContextData` 语义一致)

## 兼容性

- 用户已有的 `~/.claude/glm-quota-line.json` 中的非空 `modelMap` 完全保留,install 不覆盖
- 现有 `model set/get/remove/import/list` 命令行为与输出格式不变
- 现有 `getContextData` / 状态栏渲染行为不变
- 老用户(空 `modelMap`)重装/升级时会被 install 自动初始化出本地表
