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

## 模型映射的双层结构(优先级从高到低)

```
本地覆盖层 (modelMap)         ←  ~/.claude/glm-quota-line.json  ← 用户拥有,逐键覆盖
        ↑ 覆盖
包内种子表 (data/models.json) ←  冻结底层,运行时自动生效,不写进用户文件
        ↑ 兜底
硬编码 fallback              ←  models.js 内保留 glm-4.7,文件读不到时用
```

**关键策略(最终澄清):** 运行时解析为"包内种子打底 + 本地 `modelMap` 逐键覆盖"(`src/cli/index.js` 模块初始化 `loadBundledModels()` 后 `mergeModelMap(userConfig.modelMap)`)。**新模型发布时,用户 `model set <id> <size>` 写入本地覆盖层即可,无需 npm 更新、无需新文件。** glm-quota-line **项目方后续不再维护包内模型映射的内容更新**,`data/models.json` 是冻结的底层种子(可能仅改兜底 `glm-4.7`)。

**install / reset 都不把种子写进本地 `modelMap`** —— 种子始终在运行时自动生效,写进本地只会制造 npm 更新后的过期快照,并让 `model list` 所有模型误显自定义标记 `*`。清空本地覆盖层(经 `config reset --models`)即回到纯种子状态。

真正缺的不是初始化机制,而是**一个"恢复出厂"的重置入口** —— 见下文 `config reset`。

## 改动点

### 1. `data/models.json`(包根目录)—— 冻结的底层种子表

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
> **此文件定稿后基本不再更新**,仅作冻结底层种子 + 文件丢失兜底。

### 1b. `config reset` 命令(新增,复用 config 命名空间,不新增顶层命令)

```
glm-quota-line config reset [--models] [--yes]
```
- **默认**:重置全部用户配置(9 个全局键 + `lines` 组件布局 + `modelMap`),保留 `install` 元数据、`schemaVersion`、`managedBy`。
- **`--models`**:只清 `modelMap`(本地覆盖层),回到纯种子状态。其它配置不动。
- **`--yes`**:跳过交互确认(脚本/CI 用)。非交互环境(非 TTY)且未传 `--yes` 时报错退出。
- **不触碰** `~/.claude/settings.json`(那是 `uninstall` 的职责)。

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

### 4. `src/cli/commands.js` —— 新增 `config reset` 分支

新增 `config reset` 子命令(见上文 1b),在 `config unset` 与 catch-all `config` 分支之间。配套 `handleConfigReset` 与 `confirmReset` 辅助函数:摘要构造、TTY 检测、`readline` 交互确认、非交互环境强制 `--yes`。catch-all 错误信息更新为 `show, set, unset, reset`。

`model list/get/set/remove/import` 其余逻辑不变。

### 5. `src/claude/settings.js` —— 新增 `resetToolConfig`

新增 `resetToolConfig({ modelsOnly }, configPath)`:全量重置只留 `schemaVersion`/`managedBy`/`install`;`modelsOnly` 复刻当前配置仅删 `modelMap`。复用现有 `readToolConfig`/`writeToolConfig`。

### 6. `src/claude/install.js` —— 无需改动

**install 不写种子到本地**。种子在运行时由 `models.js` 模块初始化自动加载,无需 install 介入。可选:加一行注释说明此不变量,防止后续贡献者误"修复"。

### 7. `src/cli/args.js` —— 注册 `--yes` / `--models` 布尔 flag

仿现有 `--force`/`--json` 模式。

### 8. 文档

- `README.md`:新增 `reset` 章节;`model` 章节改为双层说明(新模型 `model set` 写本地即可,无需 npm 更新)。
- `CHANGELOG.md`:1.3.1 条目改为双层说明 + `config reset`。
- help 文本(`src/cli/index.js`):Usage + Commands 补 `config reset`。

## 数据流(改动后)

```
status line 渲染
  └─ getContextData(input, { modelMap })            // src/core/context/index.js
       └─ resolveWindowSize(parsed, modelMap)        // 先查传入的 user modelMap (本地覆盖层)
            └─ getModelSize(modelId)                 // user 没有则查 getDefaultModels() (包内种子)
                 └─ loadBundledModels() 优先,fallback 兜底
```

`model list` 命令:
```
readToolConfig() → config.modelMap (本地覆盖层)
getDefaultModels() → bundled ∪ fallback (冻结种子)
合并: { ...defaults, ...config.modelMap },标记 * 仅对 config.modelMap 中的项
```

`config reset`:
```
全量: resetToolConfig({ modelsOnly: false }) → 只留 schemaVersion/managedBy/install
限定: resetToolConfig({ modelsOnly: true })  → 删 modelMap,保留其余
```

## 错误处理

`loadBundledModels()` 对以下情况都**不抛异常**,优雅降级到 `FALLBACK_MODEL_MAP`:

- `data/models.json` 文件不存在
- 文件存在但 JSON 解析失败(损坏)
- 解析成功但缺少 `models` 字段
- `models` 字段存在但非对象(如数组、字符串)
- `models` 内某项 size 非正整数(该项跳过,其余仍可用)

降级时若 `GLM_QUOTA_DEBUG=1`,向 stderr 输出一条说明(复用现有调试机制)。

`config reset` 非交互环境(非 TTY)且未传 `--yes`:报错退出,不写文件。

## 测试

新增 / 更新测试覆盖:

- `data/models.json` 正常解析: `getDefaultModels()` 返回包内表内容
- 双层合并优先级: 用户 `modelMap` 覆盖包内种子覆盖 fallback
- 文件缺失: 回退到 `glm-4.7` 兜底,不抛异常
- JSON 损坏 / 缺 `models` 字段 / `models` 非对象: 回退兜底
- `models` 内部分项非法: 非法项跳过,合法项保留
- `resetToolConfig` 全量重置: 清全局键/lines/modelMap,保留 install
- `resetToolConfig` modelsOnly: 只删 modelMap,保留其余
- `config reset --yes`: 全量清空并报告;`--models --yes`: 只清 modelMap
- `config reset` 非 TTY 无 `--yes`: 报错退出,不写文件
- `config reset` 空配置: 提示无需重置
- `model list` 双态: 包内默认无标记,用户自定义标 `*`
- 现有 `test/context.test.js` 仍通过

## 兼容性

- 用户已有的 `~/.claude/glm-quota-line.json` 中的非空 `modelMap` 完全保留
- 现有 `model set/get/remove/import/list`、`config set/unset/show`、`install/uninstall`、`configure` 行为不变
- 现有 `getContextData` / 状态栏渲染行为不变
- 老用户开箱即用:种子在运行时自动生效,无需 install 写入
