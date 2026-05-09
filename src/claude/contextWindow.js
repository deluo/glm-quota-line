import { clampRoundPercent } from "../shared/utils.js";

function tryCalculateFromRawTokens(ctx, modelWindowSize) {
  if (!Number.isFinite(modelWindowSize) || modelWindowSize <= 0) {
    return null;
  }

  const usage = ctx.current_usage;
  if (!usage || typeof usage !== "object") {
    return null;
  }

  const inputTokens = Number(usage.input_tokens) || 0;
  const cacheReadTokens = Number(usage.cache_read_input_tokens) || 0;
  const totalTokens = inputTokens + cacheReadTokens;

  if (!Number.isFinite(totalTokens) || totalTokens < 0) {
    return null;
  }

  const raw = (totalTokens / modelWindowSize) * 100;
  const clamped = Math.min(100, Math.max(0, raw));
  const used = Math.round(clamped);

  return { usedPercent: used, remainingPercent: 100 - used };
}

function fallbackToProvidedPercentages(ctx) {
  const usedPercent = clampRoundPercent(ctx.used_percentage);
  const remainingPercent = clampRoundPercent(ctx.remaining_percentage);

  if (usedPercent === null && remainingPercent === null) {
    return null;
  }

  const effectiveUsed = usedPercent !== null ? usedPercent : 100 - remainingPercent;
  const effectiveRemaining =
    remainingPercent !== null ? remainingPercent : 100 - effectiveUsed;

  return { usedPercent: effectiveUsed, remainingPercent: effectiveRemaining };
}

export function normalizeContextWindow(rawInput, modelContextWindow = {}) {
  if (!rawInput || typeof rawInput !== "object") {
    return null;
  }

  const ctx = rawInput.context_window;
  if (!ctx || typeof ctx !== "object") {
    return null;
  }

  const modelId = rawInput.model?.id;
  const modelWindowSize = modelContextWindow[modelId];

  const extras = {};
  if (modelId) {
    extras.modelId = modelId;
  }
  if (modelWindowSize) {
    extras.windowSize = modelWindowSize;
  }

  if (modelId && modelWindowSize) {
    const calculated = tryCalculateFromRawTokens(ctx, modelWindowSize);
    if (calculated) {
      return { ...calculated, ...extras };
    }
  }

  const fallback = fallbackToProvidedPercentages(ctx);
  if (!fallback) {
    return null;
  }
  return { ...fallback, ...extras };
}
