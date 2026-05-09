import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeContextWindow } from "../src/claude/contextWindow.js";

const MODEL_MAP = { "glm-5.1": 200000, "glm-4.7": 128000 };

describe("normalizeContextWindow", () => {
  // --- null / invalid input ---

  it("returns null for null input", () => {
    assert.equal(normalizeContextWindow(null, MODEL_MAP), null);
  });

  it("returns null for undefined input", () => {
    assert.equal(normalizeContextWindow(undefined, MODEL_MAP), null);
  });

  it("returns null for non-object input", () => {
    assert.equal(normalizeContextWindow("string", MODEL_MAP), null);
    assert.equal(normalizeContextWindow(42, MODEL_MAP), null);
    assert.equal(normalizeContextWindow(true, MODEL_MAP), null);
  });

  it("returns null when context_window is missing", () => {
    assert.equal(normalizeContextWindow({ session_id: "test" }, MODEL_MAP), null);
  });

  it("returns null when context_window is null", () => {
    assert.equal(normalizeContextWindow({ context_window: null }, MODEL_MAP), null);
  });

  it("returns null when context_window is empty object", () => {
    assert.equal(normalizeContextWindow({ context_window: {} }, MODEL_MAP), null);
  });

  // --- self-calculation from raw tokens ---

  it("calculates from raw tokens using model mapping", () => {
    const result = normalizeContextWindow({
      model: { id: "glm-5.1" },
      context_window: {
        context_window_size: 200000,
        used_percentage: 99,
        remaining_percentage: 1,
        current_usage: {
          input_tokens: 4092,
          output_tokens: 289,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 18816
        }
      }
    }, MODEL_MAP);

    assert.equal(result.usedPercent, 11);
    assert.equal(result.remainingPercent, 89);
    assert.equal(result.modelId, "glm-5.1");
    assert.equal(result.windowSize, 200000);
  });

  it("uses different context window for different model", () => {
    const result = normalizeContextWindow({
      model: { id: "glm-4.7" },
      context_window: {
        context_window_size: 200000,
        used_percentage: 50,
        remaining_percentage: 50,
        current_usage: {
          input_tokens: 6400,
          cache_read_input_tokens: 0
        }
      }
    }, MODEL_MAP);

    assert.equal(result.usedPercent, 5);
    assert.equal(result.remainingPercent, 95);
    assert.equal(result.modelId, "glm-4.7");
    assert.equal(result.windowSize, 128000);
  });

  it("handles zero tokens", () => {
    const result = normalizeContextWindow({
      model: { id: "glm-5.1" },
      context_window: {
        context_window_size: 200000,
        used_percentage: 99,
        current_usage: { input_tokens: 0, cache_read_input_tokens: 0 }
      }
    }, MODEL_MAP);

    assert.equal(result.usedPercent, 0);
    assert.equal(result.remainingPercent, 100);
  });

  it("clamps to 100 when tokens exceed context window", () => {
    const result = normalizeContextWindow({
      model: { id: "glm-4.7" },
      context_window: {
        context_window_size: 128000,
        used_percentage: 80,
        current_usage: { input_tokens: 200000, cache_read_input_tokens: 0 }
      }
    }, MODEL_MAP);

    assert.equal(result.usedPercent, 100);
    assert.equal(result.remainingPercent, 0);
  });

  // --- fallback to Claude Code percentages ---

  it("falls back when model is not in mapping", () => {
    const result = normalizeContextWindow({
      model: { id: "unknown-model" },
      context_window: {
        used_percentage: 30,
        remaining_percentage: 70
      }
    }, MODEL_MAP);

    assert.equal(result.usedPercent, 30);
    assert.equal(result.remainingPercent, 70);
  });

  it("falls back when model.id is missing", () => {
    const result = normalizeContextWindow({
      context_window: { used_percentage: 45, remaining_percentage: 55 }
    }, MODEL_MAP);

    assert.equal(result.usedPercent, 45);
    assert.equal(result.remainingPercent, 55);
  });

  it("falls back when current_usage is missing", () => {
    const result = normalizeContextWindow({
      model: { id: "glm-5.1" },
      context_window: { used_percentage: 50, remaining_percentage: 50 }
    }, MODEL_MAP);

    assert.equal(result.usedPercent, 50);
    assert.equal(result.remainingPercent, 50);
  });

  it("falls back when mapping is empty", () => {
    const result = normalizeContextWindow({
      model: { id: "glm-5.1" },
      context_window: { used_percentage: 60, remaining_percentage: 40 }
    }, {});

    assert.equal(result.usedPercent, 60);
    assert.equal(result.remainingPercent, 40);
  });

  it("returns null when both percentages are null in fallback", () => {
    assert.equal(
      normalizeContextWindow({
        model: { id: "unknown" },
        context_window: { used_percentage: null, remaining_percentage: null }
      }, MODEL_MAP),
      null
    );
  });

  // --- fallback edge cases ---

  it("computes remaining from used when remaining is null in fallback", () => {
    const result = normalizeContextWindow({
      context_window: { used_percentage: 30 }
    }, MODEL_MAP);

    assert.equal(result.usedPercent, 30);
    assert.equal(result.remainingPercent, 70);
  });

  it("computes used from remaining when used is null in fallback", () => {
    const result = normalizeContextWindow({
      context_window: { remaining_percentage: 75 }
    }, MODEL_MAP);

    assert.equal(result.usedPercent, 25);
    assert.equal(result.remainingPercent, 75);
  });

  it("clamps percentage to 0-100 in fallback", () => {
    assert.equal(
      normalizeContextWindow({ context_window: { used_percentage: 150 } }, MODEL_MAP).usedPercent,
      100
    );
    assert.equal(
      normalizeContextWindow({ context_window: { used_percentage: -10 } }, MODEL_MAP).usedPercent,
      0
    );
  });

  it("handles NaN and Infinity percentages in fallback", () => {
    assert.equal(
      normalizeContextWindow({ context_window: { used_percentage: NaN } }, MODEL_MAP),
      null
    );
    assert.equal(
      normalizeContextWindow({ context_window: { used_percentage: Infinity } }, MODEL_MAP),
      null
    );
  });
});
