# 默认模型表外置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `src/core/context/models.js` 里写死的 `DEFAULT_MODEL_MAP` 外置成包内 `data/models.json`,使新模型发布时只需改 JSON、不必改代码/发版。

**Architecture:** 新增 `data/models.json` 作为包内默认模型表(随 npm 发布)。`models.js` 新增同步的 `loadBundledModels()` 读取它并模块级缓存;原硬编码表降级为 `glm-4.7` 单项兜底,仅在 `data/models.json` 读取失败时使用。三层合并优先级: 用户 `modelMap`(`~/.claude/glm-quota-line.json`) > 包内 `data/models.json` > 硬编码兜底。对外 API(`getModelSize` / `hasModel` / `getAllModels` / `getDefaultModels` 等)签名与同步语义不变。

**Tech Stack:** Node.js (>=18), 原生 `node:test`, ES modules, 无运行时依赖。

**Spec:** `docs/superpowers/specs/2026-06-13-externalize-default-model-map-design.md`

---

## File Structure

- **Create** `data/models.json` — 包内默认模型表,随 npm 发布。唯一职责: 存放内置模型的上下文窗口大小。
- **Modify** `src/core/context/models.js` — 降级硬编码表为兜底;新增 `loadBundledModels()` 同步读取 + 缓存 `data/models.json`;`getDefaultModels()` 改为返回 bundled ∪ fallback。职责不变: 模型映射的内存层与默认源。
- **Modify** `package.json:30-36` — `files` 数组加入 `"data"`,确保 `data/models.json` 随 npm 发布。
- **Modify** `test/context.test.js` — 新增 `loadBundledModels` / 降级路径的测试;保留现有 `getDefaultModels` 测试(数据源换了但 `glm-4.7` 仍在默认表)。
- **Create** `test/bundledModels.test.js` — 专门覆盖 `loadBundledModels` 的文件 I/O 失败分支(用临时目录隔离,避免污染真实 `data/models.json`)。
- **Modify** `README.md` — `model` 章节补一句默认表位置说明。
- **Modify** `CHANGELOG.md` — 新增条目。

---

### Task 1: 新增包内默认模型表 `data/models.json`

**Files:**
- Create: `data/models.json`

- [ ] **Step 1: 创建 `data/models.json`**

文件内容:

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

- [ ] **Step 2: 验证 JSON 合法**

Run: `node -e "JSON.parse(require('fs').readFileSync('data/models.json','utf8')); console.log('valid')"`
Expected: 输出 `valid`,无报错。

- [ ] **Step 3: Commit**

```bash
git add data/models.json
git commit -m "feat: add bundled default model table data/models.json"
```

---

### Task 2: 写 `loadBundledModels` 的失败测试

**Files:**
- Create: `test/bundledModels.test.js`

这个测试用真实 `data/models.json` 验证正常路径。失败分支(文件缺失/损坏)的测试在 Task 3 里通过注入路径完成 —— `loadBundledModels` 接受可选的 `filePath` 参数(默认指向包内文件),便于测试隔离。

- [ ] **Step 1: 写失败测试**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadBundledModels } from "../src/core/context/models.js";

test("loadBundledModels returns the bundled default table", () => {
  const models = loadBundledModels();
  assert.equal(models["glm-4.7"], 200000);
  assert.equal(models["glm-5.2"], 1000000);
  assert.equal(models["glm-4.5-air"], 128000);
});

test("loadBundledModels returns a non-empty object", () => {
  const models = loadBundledModels();
  assert.equal(typeof models, "object");
  assert.ok(Object.keys(models).length > 0);
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `node --test test/bundledModels.test.js`
Expected: FAIL —— `loadBundledModels is not a function`(尚未导出)。

---

### Task 3: 写 `loadBundledModels` 的降级测试(失败分支)

**Files:**
- Modify: `test/bundledModels.test.js`

- [ ] **Step 1: 追加降级测试**

在 `test/bundledModels.test.js` 末尾追加:

```js
function writeTmpFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "glm-models-"));
  const filePath = path.join(dir, "models.json");
  if (content !== null) {
    fs.writeFileSync(filePath, content, "utf8");
  }
  return filePath; // content === null => file not created (missing)
}

test("loadBundledModels falls back to FALLBACK_MODEL_MAP when file is missing", () => {
  const filePath = writeTmpFile(null); // file does not exist
  const models = loadBundledModels(filePath);
  assert.equal(models["glm-4.7"], 200000);
  // bundled-only models are absent in fallback
  assert.equal(models["glm-5.2"], undefined);
});

test("loadBundledModels falls back when JSON is corrupt", () => {
  const filePath = writeTmpFile("{ not valid json ]]]");
  const models = loadBundledModels(filePath);
  assert.equal(models["glm-4.7"], 200000);
  assert.equal(models["glm-5.2"], undefined);
});

test("loadBundledModels falls back when models field is missing", () => {
  const filePath = writeTmpFile(JSON.stringify({ schemaVersion: 1 }));
  const models = loadBundledModels(filePath);
  assert.equal(models["glm-4.7"], 200000);
});

test("loadBundledModels falls back when models field is not an object", () => {
  const filePath = writeTmpFile(JSON.stringify({ models: ["array", "not", "object"] }));
  const models = loadBundledModels(filePath);
  assert.equal(models["glm-4.7"], 200000);
});

test("loadBundledModels skips invalid entries but keeps valid ones", () => {
  const filePath = writeTmpFile(
    JSON.stringify({
      models: {
        "glm-4.7": 200000,
        "bad-size": -50,
        "bad-type": "200000",
        "": 100000
      }
    })
  );
  const models = loadBundledModels(filePath);
  assert.equal(models["glm-4.7"], 200000);
  assert.equal(models["bad-size"], undefined);
  assert.equal(models["bad-type"], undefined);
  assert.equal(models[""], undefined);
});
```

- [ ] **Step 2: 运行测试,确认全部失败**

Run: `node --test test/bundledModels.test.js`
Expected: FAIL —— 7 个测试全部因 `loadBundledModels is not a function` 失败。

- [ ] **Step 3: Commit**

```bash
git add test/bundledModels.test.js
git commit -m "test: add loadBundledModels normal-path and fallback tests"
```

---

### Task 4: 实现 `loadBundledModels` 与 `FALLBACK_MODEL_MAP`

**Files:**
- Modify: `src/core/context/models.js`

- [ ] **Step 1: 重写 `src/core/context/models.js`**

完整替换文件内容为:

```js
// GLM model context window sizes (tokens)
// Bundled default table: data/models.json (ships with the package).
// Hardcoded fallback: only used if data/models.json cannot be read.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUNDLED_MODELS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../data/models.json"
);

// Defensive fallback ONLY for data/models.json I/O failure.
// Not a guard against users clearing their modelMap — the bundled
// file itself is the user-immovable default source.
const FALLBACK_MODEL_MAP = {
  "glm-4.7": 200_000
};

let bundledCache = null;

function isValidModelEntry(modelId, size) {
  return (
    typeof modelId === "string" &&
    modelId.length > 0 &&
    typeof size === "number" &&
    size > 0 &&
    Number.isFinite(size) &&
    Number.isInteger(size)
  );
}

export function loadBundledModels(filePath = BUNDLED_MODELS_PATH) {
  if (bundledCache && filePath === BUNDLED_MODELS_PATH) {
    return { ...bundledCache };
  }

  let parsed;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    parsed = JSON.parse(raw);
  } catch {
    return { ...FALLBACK_MODEL_MAP };
  }

  const models = parsed && typeof parsed === "object" && parsed.models;
  if (!models || typeof models !== "object" || Array.isArray(models)) {
    return { ...FALLBACK_MODEL_MAP };
  }

  const valid = {};
  for (const [modelId, size] of Object.entries(models)) {
    if (isValidModelEntry(modelId, size)) {
      valid[modelId] = size;
    }
  }

  if (Object.keys(valid).length === 0) {
    return { ...FALLBACK_MODEL_MAP };
  }

  if (filePath === BUNDLED_MODELS_PATH) {
    bundledCache = { ...valid };
  }
  return { ...valid };
}

let modelMap = { ...loadBundledModels() };

export function getModelSize(modelId) {
  return modelMap[modelId];
}

export function hasModel(modelId) {
  return modelId in modelMap;
}

export function setModelSize(modelId, size) {
  if (typeof modelId !== "string" || !modelId) {
    return;
  }
  if (typeof size !== "number" || size <= 0 || !Number.isFinite(size)) {
    return;
  }
  modelMap[modelId] = size;
}

export function mergeModelMap(newMap) {
  if (newMap && typeof newMap === "object") {
    for (const [modelId, size] of Object.entries(newMap)) {
      setModelSize(modelId, size);
    }
  }
}

export function getAllModels() {
  return { ...modelMap };
}

export function removeModel(modelId) {
  if (typeof modelId !== "string" || !modelId) {
    return false;
  }
  if (modelId in modelMap) {
    delete modelMap[modelId];
    return true;
  }
  return false;
}

export function resetModels() {
  modelMap = { ...loadBundledModels() };
}

export function getDefaultModels() {
  return { ...loadBundledModels() };
}
```

> 关键设计点:
> - `loadBundledModels` 是**同步**的(现有 `getModelSize` 等 API 都是同步,改异步会波及 `getContextData` 整条链路)。
> - 模块级 `bundledCache` 仅缓存包内真实文件(`filePath === BUNDLED_MODELS_PATH` 时),测试用临时路径不缓存,保证隔离。
> - `modelMap` 模块初始化时用 bundled 表填充;`resetModels()` 重新从 bundled 读取(原来用 `DEFAULT_MODEL_MAP`)。
> - `getDefaultModels()` 现在返回 bundled 表(原来返回 `DEFAULT_MODEL_MAP`)。

- [ ] **Step 2: 运行 bundledModels 测试,确认通过**

Run: `node --test test/bundledModels.test.js`
Expected: PASS —— 7 个测试全部通过。

- [ ] **Step 3: 运行 context.test.js 的模型部分,确认不回归**

Run: `node --test test/context.test.js`
Expected: PASS —— 所有现有测试通过。

> 说明: `glm-4.7`(200000)与 `glm-4.5-air`(128000)仍在 bundled 默认表中,现有断言(`getModelSize("glm-4.7") === 200000` 等)不受影响。`getDefaultModels` 测试(line 209-215)返回的副本仍包含 `glm-4.7`,断言 `getModelSize("glm-4.7") === 200000` 仍成立。

- [ ] **Step 4: Commit**

```bash
git add src/core/context/models.js
git commit -m "feat: load default models from bundled data/models.json with fallback"
```

---

### Task 5: 确保 `data/` 随 npm 发布

**Files:**
- Modify: `package.json:30-36`

- [ ] **Step 1: 在 `files` 数组加入 `"data"`**

把 `package.json` 的 `files` 字段改为:

```json
  "files": [
    "src",
    "data",
    "README.md",
    "README.en.md",
    "LICENSE",
    "CHANGELOG.md"
  ],
```

- [ ] **Step 2: 验证 npm 打包包含 `data/models.json`**

Run: `npm pack --dry-run 2>&1 | grep "data/models.json"`
Expected: 输出包含 `data/models.json` 一行(如 `npm notice 123.4kB  data/models.json`)。

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "build: include data/ in npm package files"
```

---

### Task 6: 全量回归测试

**Files:**
- (无文件改动,仅验证)

- [ ] **Step 1: 运行完整测试套件**

Run: `npm test`
Expected: 全部测试通过,无失败。

- [ ] **Step 2: 手动验证 `model list` 输出**

Run: `node src/cli/index.js model list`
Expected: 列出 `glm-4.5-air 128K`、`glm-4.7 200K`、`glm-5-turbo 200K`、`glm-5.2 1000K`,无 `*` 标记(均为包内默认)。结尾有 `* = user-configured` 说明行。

> 若本地 `~/.claude/glm-quota-line.json` 有自定义 `modelMap`,自定义项会标 `*`,属正常。

- [ ] **Step 3: 手动验证 `model get`**

Run: `node src/cli/index.js model get glm-5.2`
Expected: `glm-5.2  1000K  (default)`

---

### Task 7: 更新文档

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: README.md `model` 章节补一句**

在 `README.md` 第 249 行(`*` 标记说明那行)**之后**插入一段:

```markdown
内置默认模型表位于包内 `data/models.json`,随 npm 发布。智谱发布新模型时,升级 `glm-quota-line` 即可获得最新映射,无需手动 `model set`。
```

- [ ] **Step 2: CHANGELOG.md 顶部新增 1.3.1 条目**

在 `## 1.3.0` 之上插入:

```markdown
## 1.3.1

- Externalized default model table to bundled `data/models.json` — new models ship via JSON, no code/release needed
- Updated default table: added `glm-5.2` (1M context), removed `glm-5` and `glm-5.1` (no longer in plan)
- Hardcoded `glm-4.7` fallback remains as a defensive guard against `data/models.json` I/O failure
```

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document externalized default model table"
```

---

## 完成标准

- [ ] `npm test` 全绿
- [ ] `npm pack --dry-run` 输出包含 `data/models.json`
- [ ] `node src/cli/index.js model list` 列出 4 个包内默认模型(`glm-5.2` 为 1000K),无多余 `*`
- [ ] `node src/cli/index.js model get glm-5.2` 返回 `(default)`
- [ ] 现有 `model set/get/remove/import` 行为不变
- [ ] 用户已有 `~/.claude/glm-quota-line.json` 的 `modelMap` 不受影响
