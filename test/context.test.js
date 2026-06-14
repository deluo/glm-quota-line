import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateFromTokens,
  getSeverity,
  calculateTokenCount
} from "../src/core/context/calculator.js";
import {
  parseTokenUsage,
  parseModelId,
  parseContextInput
} from "../src/core/context/parser.js";
import {
  getModelSize,
  setModelSize,
  removeModel,
  resetModels,
  mergeModelMap,
  getDefaultModels
} from "../src/core/context/models.js";
import { getContextData, createRenderData } from "../src/core/context/index.js";

const MOCK_TOKEN_USAGE = {
  input_tokens: 1000,
  output_tokens: 500,
  cache_read_input_tokens: 200,
  cache_creation_input_tokens: 100
};

const MOCK_CONTEXT_WINDOW = {
  used_percentage: 45,
  remaining_percentage: 55
};

const MOCK_STATUS_INPUT = {
  model: { id: "glm-4.7" },
  context_window: {
    current_usage: MOCK_TOKEN_USAGE,
    ...MOCK_CONTEXT_WINDOW
  }
};

// --- calculator tests ---

test("calculateFromTokens returns correct percentages", () => {
  const result = calculateFromTokens({ total: 1800 }, 200000);
  assert.equal(result.used, 1); // 1800 / 200000 = 0.9% → rounded to 1%
  assert.equal(result.remaining, 99);
});

test("calculateFromTokens clamps percentages to 0-100", () => {
  const hugeUsage = { total: 300000 };
  const result = calculateFromTokens(hugeUsage, 200000);
  assert.equal(result.used, 100);
  assert.equal(result.remaining, 0);
});

test("calculateFromTokens returns null for invalid input", () => {
  assert.equal(calculateFromTokens(null, 200000), null);
  assert.equal(calculateFromTokens(MOCK_TOKEN_USAGE, -1), null);
  assert.equal(calculateFromTokens(MOCK_TOKEN_USAGE, 0), null);
  assert.equal(calculateFromTokens({ total: -100 }, 200000), null);
  assert.equal(calculateFromTokens({ total: 0 }, 200000), null);
});

test("getSeverity returns correct severity levels", () => {
  assert.equal(getSeverity(50), "good");
  assert.equal(getSeverity(70), "warn");
  assert.equal(getSeverity(85), "danger");
  assert.equal(getSeverity(null), "neutral");
  assert.equal(getSeverity(NaN), "neutral");
});

test("calculateTokenCount computes correct token count", () => {
  assert.equal(calculateTokenCount(50, 200000), 100000);
  assert.equal(calculateTokenCount(100, 200000), 200000);
  assert.equal(calculateTokenCount(0, 200000), 0);
});

// --- parser tests ---

test("parseTokenUsage extracts and sums token values", () => {
  const result = parseTokenUsage(MOCK_TOKEN_USAGE);
  assert.equal(result.input, 1000);
  assert.equal(result.output, 500);
  assert.equal(result.cacheRead, 200);
  assert.equal(result.cacheCreation, 100);
  assert.equal(result.total, 1300);
});

test("parseTokenUsage handles missing fields", () => {
  const result = parseTokenUsage({ input_tokens: 100 });
  assert.equal(result.input, 100);
  assert.equal(result.output, 0);
  assert.equal(result.total, 100);
});

test("parseTokenUsage returns null for invalid input", () => {
  assert.equal(parseTokenUsage(null), null);
  // 注意：parseTokenUsage 不检查负的 total 值，它会将负值转换为 0
  const result = parseTokenUsage({ total: -100 });
  assert.deepEqual(result, { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 }); // output not in total
});

test("parseModelId extracts model ID from status input", () => {
  assert.equal(parseModelId(MOCK_STATUS_INPUT), "glm-4.7");
  assert.equal(parseModelId({}), undefined);
  assert.equal(parseModelId(null), undefined);
});

test("parseContextInput returns complete parsed structure", () => {
  const result = parseContextInput(MOCK_STATUS_INPUT);
  assert.equal(result.modelId, "glm-4.7");
  assert.deepEqual(result.tokenUsage, {
    input: 1000,
    output: 500,
    cacheRead: 200,
    cacheCreation: 100,
    total: 1300
  });
});

test("parseContextInput returns null for missing context_window", () => {
  assert.equal(parseContextInput({ model: { id: "test" } }), null);
  assert.equal(parseContextInput(null), null);
});

// --- models tests ---

test("getModelSize returns correct window size for known models", () => {
  assert.equal(getModelSize("glm-4.7"), 200000);
  assert.equal(getModelSize("glm-4.5-air"), 128000);
  assert.equal(getModelSize("unknown-model"), undefined);
});

test("setModelSize adds or updates model mapping", () => {
  resetModels();
  assert.equal(getModelSize("custom-model"), undefined);

  setModelSize("custom-model", 50000);
  assert.equal(getModelSize("custom-model"), 50000);

  setModelSize("glm-4.7", 250000); // update existing
  assert.equal(getModelSize("glm-4.7"), 250000);

  resetModels(); // reset to defaults
  assert.equal(getModelSize("glm-4.7"), 200000);
});

test("setModelSize validates inputs", () => {
  resetModels();
  setModelSize("", 1000); // invalid model ID
  setModelSize("test", -1); // invalid size
  setModelSize("test", 0); // invalid size
  assert.equal(getModelSize("test"), undefined);
});

test("mergeModelMap batch imports model mappings", () => {
  resetModels();
  const newMap = {
    "model-a": 10000,
    "model-b": 20000
  };
  mergeModelMap(newMap);
  assert.equal(getModelSize("model-a"), 10000);
  assert.equal(getModelSize("model-b"), 20000);
  resetModels();
});

test("getDefaultModels returns copy of default mappings", () => {
  const defaults = getDefaultModels();
  assert.equal(defaults["glm-4.7"], 200000);

  // Verify it's a copy
  defaults["glm-4.7"] = 999999;
  assert.equal(getModelSize("glm-4.7"), 200000); // original unchanged
});

test("removeModel deletes a custom model from runtime map", () => {
  resetModels();
  setModelSize("custom-model", 50000);
  assert.equal(getModelSize("custom-model"), 50000);
  assert.equal(removeModel("custom-model"), true);
  assert.equal(getModelSize("custom-model"), undefined);
  resetModels();
});

test("removeModel deletes a built-in model from runtime map", () => {
  resetModels();
  assert.equal(getModelSize("glm-4.7"), 200000);
  assert.equal(removeModel("glm-4.7"), true);
  assert.equal(getModelSize("glm-4.7"), undefined);
  resetModels();
});

test("removeModel returns false for unknown model", () => {
  resetModels();
  assert.equal(removeModel("nonexistent"), false);
});

test("removeModel validates input", () => {
  assert.equal(removeModel(""), false);
  assert.equal(removeModel(123), false);
});

// --- index (integration) tests ---

test("getContextData returns complete context data with token calculation", () => {
  const result = getContextData(MOCK_STATUS_INPUT);
  assert.equal(result.modelId, "glm-4.7");
  assert.equal(result.windowSize, 200000);
  assert.equal(result.usedPercent, 1);
  assert.equal(result.remainingPercent, 99);
  assert.equal(result.severity, "good");
});

test("getContextData strips [1M] suffix: resolves window size and normalizes modelId", () => {
  // Claude Code reports the model id with a trailing bracket suffix (glm-5.2[1M]);
  // the model map keys the bare id (glm-5.2). Lookup and the returned modelId
  // must both use the bare id so display reads "glm-5.2 / 1M".
  const input = {
    model: { id: "glm-5.2[1M]" },
    context_window: {
      // Token volume large enough that usage rounds above 0% against the 1M
      // window (otherwise the result is dropped as a 0% placeholder).
      current_usage: {
        input_tokens: 50000,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0
      },
      used_percentage: 45,
      remaining_percentage: 55
    }
  };
  const result = getContextData(input);
  assert.equal(result.modelId, "glm-5.2");
  assert.equal(result.windowSize, 1000000);
});

test("getContextData returns null when model id is not in the map (no stdin percentage fallback)", () => {
  // An unknown model id cannot resolve a window size, so no context segment is
  // shown. stdin-provided window percentages are intentionally NOT used as a
  // fallback — they are often inaccurate. The contract is: no model map hit,
  // no context segment.
  const inputWithoutTokenUsage = {
    model: { id: "unknown-model" },
    context_window: MOCK_CONTEXT_WINDOW
  };
  assert.equal(getContextData(inputWithoutTokenUsage), null);
});

test("getContextData returns null when no calculation is possible", () => {
  const emptyInput = {
    model: { id: "test" },
    context_window: {}
  };
  assert.equal(getContextData(emptyInput), null);
  assert.equal(getContextData(null), null);
});

test("getContextData respects debug mode", () => {
  let debugOutput = "";
  const originalStderrWrite = process.stderr.write;
  process.stderr.write = (chunk) => { debugOutput += chunk; };

  getContextData(MOCK_STATUS_INPUT, { debug: true });

  process.stderr.write = originalStderrWrite;
  assert.ok(debugOutput.includes("[ctx]"));
});

test("createRenderData returns render data for bar style", () => {
  const contextData = getContextData(MOCK_STATUS_INPUT);
  const renderData = createRenderData(contextData, "bar");
  assert.ok(renderData);
  assert.equal(renderData.percentText, "1%");
  assert.ok(renderData.bar);
  assert.equal(renderData.suffix, " (glm-4.7/200K)");
});

test("createRenderData returns render data for text style", () => {
  const contextData = getContextData(MOCK_STATUS_INPUT);
  const renderData = createRenderData(contextData, "text");
  assert.ok(renderData);
  assert.equal(renderData.percentText, "1%");
  assert.equal(renderData.bar, undefined);
});

test("createRenderData returns null for missing context data", () => {
  assert.equal(createRenderData(null), null);
  assert.equal(createRenderData(undefined), null);
});

// --- zero-total and fallback tests ---

test("calculateFromTokens returns null for zero total (Claude Code placeholder)", () => {
  assert.equal(calculateFromTokens({ total: 0 }, 200000), null);
});

test("parseTokenUsage total excludes output_tokens", () => {
  const result = parseTokenUsage({
    input_tokens: 1000,
    output_tokens: 500,
    cache_read_input_tokens: 200,
    cache_creation_input_tokens: 100
  });
  assert.equal(result.output, 500);
  assert.equal(result.total, 1300); // 1000 + 200 + 100, not 1800
});

test("parseTokenUsage total is input + cache only (no output_tokens)", () => {
  const result = parseTokenUsage({
    input_tokens: 50000,
    output_tokens: 10000,
    cache_read_input_tokens: 5000,
    cache_creation_input_tokens: 500
  });
  assert.equal(result.total, 55500); // 50000 + 5000 + 500
});

test("getContextData returns null when token calculation yields 0% (no stdin percentage fallback)", () => {
  // Zero token total is a Claude Code placeholder. Previously this fell back to
  // stdin used_percentage; now it returns null (context segment hidden) because
  // stdin window percentages are not trusted.
  const input = {
    model: { id: "glm-4.7" },
    context_window: {
      current_usage: { input_tokens: 0, output_tokens: 0 },
      used_percentage: 30,
      remaining_percentage: 70
    }
  };
  assert.equal(getContextData(input), null);
});

test("getContextData ignores stdin context_window_size, uses model map", () => {
  const input = {
    model: { id: "glm-4.7" },
    context_window: {
      context_window_size: 128000,
      current_usage: { input_tokens: 64000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      used_percentage: 50
    }
  };
  const result = getContextData(input);
  assert.equal(result.usedPercent, 32); // 64000 / 200000 (model map, not stdin)
  assert.equal(result.windowSize, 200000);
});

test("getContextData falls back to model map when stdin has no context_window_size", () => {
  const input = {
    model: { id: "glm-4.7" },
    context_window: {
      current_usage: { input_tokens: 60000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
    }
  };
  const result = getContextData(input);
  assert.equal(result.usedPercent, 30); // 60000 / 200000
  assert.equal(result.windowSize, 200000);
});

// --- regression tests for audit fixes ---

test("getContextData returns null for unknown model with no token usage", () => {
  // Unknown model (not in the map) and no usable token usage: no window size
  // can be resolved, so the context segment is hidden. stdin percentages are
  // irrelevant here — they are never used as a fallback.
  const input = {
    model: { id: "unknown-model" },
    context_window: {
      used_percentage: null,
      remaining_percentage: null
    }
  };
  const result = getContextData(input);
  assert.equal(result, null);
});

test("getContextData resolves windowSize for known models via helper", () => {
  const input = {
    model: { id: "glm-4.7" },
    context_window: {
      current_usage: { input_tokens: 60000 },
      used_percentage: 30
    }
  };
  const result = getContextData(input);
  assert.equal(result.usedPercent, 30);
  assert.equal(result.windowSize, 200000);
  assert.equal(result.modelId, "glm-4.7");
});

test("getContextData uses custom modelMap for windowSize", () => {
  const input = {
    model: { id: "custom-model" },
    context_window: {
      current_usage: { input_tokens: 50000 },
      used_percentage: 25
    }
  };
  const result = getContextData(input, {
    modelMap: { "custom-model": 100000 }
  });
  assert.equal(result.usedPercent, 50);
  assert.equal(result.windowSize, 100000);
});

test("getContextData uses model map for window size", () => {
  const input = {
    model: { id: "glm-4.7" },
    context_window: {
      context_window_size: 50000,
      current_usage: { input_tokens: 25000 },
      used_percentage: 50
    }
  };
  const result = getContextData(input);
  assert.equal(result.usedPercent, 13); // 25000 / 200000 (from model map)
  assert.equal(result.windowSize, 200000);
});
