import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeContextWindow } from "../src/claude/contextWindow.js";

describe("normalizeContextWindow", () => {
  it("returns null for null input", () => {
    assert.equal(normalizeContextWindow(null), null);
  });

  it("returns null for undefined input", () => {
    assert.equal(normalizeContextWindow(undefined), null);
  });

  it("returns null for non-object input", () => {
    assert.equal(normalizeContextWindow("string"), null);
    assert.equal(normalizeContextWindow(42), null);
    assert.equal(normalizeContextWindow(true), null);
  });

  it("returns null when context_window is missing", () => {
    assert.equal(normalizeContextWindow({ session_id: "test" }), null);
  });

  it("returns null when context_window is null", () => {
    assert.equal(normalizeContextWindow({ context_window: null }), null);
  });

  it("returns null when both percentages are null", () => {
    assert.equal(
      normalizeContextWindow({ context_window: { used_percentage: null, remaining_percentage: null } }),
      null
    );
  });

  it("returns null when context_window is empty object", () => {
    assert.equal(normalizeContextWindow({ context_window: {} }), null);
  });

  it("parses used and remaining percentages", () => {
    const result = normalizeContextWindow({
      context_window: {
        used_percentage: 82,
        remaining_percentage: 18
      }
    });

    assert.equal(result.usedPercent, 82);
    assert.equal(result.remainingPercent, 18);
  });

  it("computes remaining from used when remaining is null", () => {
    const result = normalizeContextWindow({
      context_window: { used_percentage: 30 }
    });

    assert.equal(result.usedPercent, 30);
    assert.equal(result.remainingPercent, 70);
  });

  it("computes used from remaining when used is null", () => {
    const result = normalizeContextWindow({
      context_window: { remaining_percentage: 75 }
    });

    assert.equal(result.usedPercent, 25);
    assert.equal(result.remainingPercent, 75);
  });

  it("clamps percentage to 0-100", () => {
    assert.equal(normalizeContextWindow({ context_window: { used_percentage: 150 } }).usedPercent, 100);
    assert.equal(normalizeContextWindow({ context_window: { used_percentage: -10 } }).usedPercent, 0);
  });

  it("rounds fractional percentages", () => {
    assert.equal(normalizeContextWindow({ context_window: { used_percentage: 82.6 } }).usedPercent, 83);
  });

  it("handles NaN percentages", () => {
    assert.equal(
      normalizeContextWindow({ context_window: { used_percentage: NaN } }),
      null
    );
  });

  it("handles Infinity percentages", () => {
    assert.equal(
      normalizeContextWindow({ context_window: { used_percentage: Infinity } }),
      null
    );
  });

  it("returns only usedPercent and remainingPercent", () => {
    const result = normalizeContextWindow({
      context_window: { used_percentage: 50 }
    });

    assert.equal(Object.keys(result).length, 2);
    assert.ok("usedPercent" in result);
    assert.ok("remainingPercent" in result);
  });

  it("handles zero used percentage", () => {
    const result = normalizeContextWindow({
      context_window: { used_percentage: 0 }
    });
    assert.equal(result.usedPercent, 0);
    assert.equal(result.remainingPercent, 100);
  });

  it("handles 100 used percentage", () => {
    const result = normalizeContextWindow({
      context_window: { used_percentage: 100 }
    });
    assert.equal(result.usedPercent, 100);
    assert.equal(result.remainingPercent, 0);
  });
});
