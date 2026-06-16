import { getModelSize } from "./models.js";
import { parseContextInput } from "./parser.js";
import { calculateFromTokens, getSeverity } from "./calculator.js";
import { formatForRender } from "./formatter.js";

// Strip a trailing bracket suffix like [1M] from a model id so that
// `glm-5.2[1M]` resolves against the bare `glm-5.2` entry in the model map.
// Normalizing here (rather than inside resolveWindowSize) gives a single source
// of truth: lookup, returned data, cache, and display all use the bare id.
function normalizeModelId(modelId) {
  if (typeof modelId !== "string") {
    return modelId;
  }
  return modelId.replace(/\[[^\]]*\]$/i, "").trim();
}

function resolveWindowSize(parsed, modelMap) {
  if (parsed.modelId) {
    // User-provided modelMap takes precedence; match case-insensitively so a
    // user key of `GLM-5.2` still resolves stdin ids like `glm-5.2`.
    if (modelMap && typeof modelMap === "object") {
      const direct = modelMap[parsed.modelId];
      if (direct) {
        return direct;
      }
      const lower = parsed.modelId.toLowerCase();
      for (const [key, value] of Object.entries(modelMap)) {
        if (key.toLowerCase() === lower) {
          return value;
        }
      }
    }
    return getModelSize(parsed.modelId);
  }
  return null;
}

export function getContextData(input, options = {}) {
  const { modelMap = null, debug = false } = options;

  const parsed = parseContextInput(input);
  if (!parsed) {
    if (debug) {
      process.stderr.write("[ctx] Failed to parse input\n");
    }
    return null;
  }

  // Normalize once, up front: bare id is used for lookup, returned data,
  // cache, and display. `resolveWindowSize` reads parsed.modelId directly.
  if (parsed.modelId) {
    parsed.modelId = normalizeModelId(parsed.modelId);
  }

  const { modelId, tokenUsage } = parsed;
  let result = null;
  let windowSize = null;

  if (modelId && tokenUsage) {
    windowSize = resolveWindowSize(parsed, modelMap);

    if (windowSize) {
      result = calculateFromTokens(tokenUsage, windowSize);
      if (result && debug) {
        process.stderr.write(`[ctx] Token calculation: ${result.used}% (model: ${modelId}, window: ${windowSize})\n`);
      }
    } else if (debug) {
      // Model id not in the map: do not show the context segment. stdin-provided
      // window percentages are intentionally ignored (often inaccurate), so we
      // fall through to `return null` rather than guessing.
      process.stderr.write(`[ctx] model "${modelId}" not in modelMap — context segment hidden\n`);
    }
  }

  if (!result || result.used === 0) {
    if (debug) {
      process.stderr.write(result ? "[ctx] Used is 0 — likely a placeholder, skipping\n" : "[ctx] No valid calculation result\n");
    }
    return null;
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
