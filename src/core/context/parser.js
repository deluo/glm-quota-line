import { asFiniteNumber } from "../../shared/utils.js";

export function parseTokenUsage(currentUsage) {
  if (!currentUsage || typeof currentUsage !== "object") {
    return null;
  }

  const input = asFiniteNumber(currentUsage.input_tokens);
  const output = asFiniteNumber(currentUsage.output_tokens);
  const cacheRead = asFiniteNumber(currentUsage.cache_read_input_tokens);
  const cacheCreation = asFiniteNumber(currentUsage.cache_creation_input_tokens);

  // Reject explicitly invalid (non-finite) values, but allow missing fields as 0
  if (input === null && currentUsage.input_tokens !== undefined) return null;
  if (output === null && currentUsage.output_tokens !== undefined) return null;
  if (cacheRead === null && currentUsage.cache_read_input_tokens !== undefined) return null;
  if (cacheCreation === null && currentUsage.cache_creation_input_tokens !== undefined) return null;

  const safeInput = input ?? 0;
  const safeOutput = output ?? 0;
  const safeCacheRead = cacheRead ?? 0;
  const safeCacheCreation = cacheCreation ?? 0;

  const total = safeInput + safeCacheRead + safeCacheCreation;

  if (total < 0) {
    return null;
  }

  return { input: safeInput, output: safeOutput, cacheRead: safeCacheRead, cacheCreation: safeCacheCreation, total };
}

export function parseApiPercentages(contextWindow) {
  if (!contextWindow || typeof contextWindow !== "object") {
    return null;
  }

  const usedRaw = contextWindow.used_percentage;
  const remainingRaw = contextWindow.remaining_percentage;

  const used = typeof usedRaw === "number" && Number.isFinite(usedRaw)
    ? Math.max(0, Math.min(100, usedRaw))
    : null;
  const remaining = typeof remainingRaw === "number" && Number.isFinite(remainingRaw)
    ? Math.max(0, Math.min(100, remainingRaw))
    : null;

  if (used === null && remaining === null) {
    return null;
  }

  return { used, remaining };
}

export function parseModelId(input) {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  return input?.model?.id;
}

export function parseContextInput(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const contextWindow = input.context_window;
  if (!contextWindow || typeof contextWindow !== "object") {
    return null;
  }

  const contextWindowSize =
    typeof contextWindow.context_window_size === "number" &&
    Number.isFinite(contextWindow.context_window_size) &&
    contextWindow.context_window_size > 0
      ? contextWindow.context_window_size
      : null;

  return {
    modelId: parseModelId(input),
    tokenUsage: parseTokenUsage(contextWindow.current_usage),
    apiPercentages: parseApiPercentages(contextWindow),
    contextWindowSize
  };
}
