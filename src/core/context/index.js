import { getModelSize } from "./models.js";
import { parseContextInput } from "./parser.js";
import { calculateFromTokens, getSeverity, isValidPercentages, completePercentages } from "./calculator.js";
import { formatForRender } from "./formatter.js";

const STRATEGY = {
  TOKEN_FIRST: "token_first",
  API_ONLY: "api_only"
};

function resolveWindowSize(parsed, modelMap) {
  return parsed.contextWindowSize
    || (parsed.modelId ? (modelMap ? modelMap[parsed.modelId] : getModelSize(parsed.modelId)) : null);
}

export function getContextData(input, options = {}) {
  const {
    modelMap = null,
    strategy = STRATEGY.TOKEN_FIRST,
    debug = false
  } = options;

  const parsed = parseContextInput(input);
  if (!parsed) {
    if (debug) {
      process.stderr.write("[ctx] Failed to parse input\n");
    }
    return null;
  }

  const { modelId, tokenUsage, apiPercentages } = parsed;
  let result = null;
  let windowSize = null;

  if (strategy === STRATEGY.TOKEN_FIRST && modelId && tokenUsage) {
    windowSize = resolveWindowSize(parsed, modelMap);

    if (windowSize) {
      result = calculateFromTokens(tokenUsage, windowSize);
      if (result && debug) {
        process.stderr.write(`[ctx] Token calculation: ${result.used}% (model: ${modelId}, window: ${windowSize})\n`);
      }
    }
  }

  if (!result && apiPercentages) {
    if (isValidPercentages(apiPercentages)) {
      result = completePercentages(apiPercentages);
      if (result && debug) {
        process.stderr.write(`[ctx] API percentage fallback: ${result.used}%\n`);
      }
    }
  }

  if (!result || result.used === 0) {
    if (debug) {
      process.stderr.write(result ? "[ctx] Used is 0 — likely a placeholder, skipping\n" : "[ctx] No valid calculation result\n");
    }
    return null;
  }

  if (!windowSize) {
    windowSize = resolveWindowSize(parsed, modelMap);
  }

  return {
    usedPercent: result.used,
    remainingPercent: result.remaining,
    modelId,
    windowSize,
    severity: getSeverity(result.used)
  };
}

export function createRenderData(contextData, style = "bar") {
  if (!contextData) {
    return null;
  }
  return formatForRender(contextData, style);
}

export { getModelSize, setModelSize, mergeModelMap, getAllModels } from "./models.js";
export { getSeverity, calculateTokenCount } from "./calculator.js";
export { formatForRender, buildBar, formatWindowSize, formatModelSuffix } from "./formatter.js";
export const CALC_STRATEGY = STRATEGY;
