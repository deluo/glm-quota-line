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

function debugFallback(reason) {
  if (process.env.GLM_QUOTA_DEBUG === "1") {
    process.stderr.write(`[ctx] Bundled models fallback to glm-4.7: ${reason}\n`);
  }
}

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
    debugFallback("file unreadable or invalid JSON");
    return { ...FALLBACK_MODEL_MAP };
  }

  const models = parsed && typeof parsed === "object" && parsed.models;
  if (!models || typeof models !== "object" || Array.isArray(models)) {
    debugFallback("missing or non-object models field");
    return { ...FALLBACK_MODEL_MAP };
  }

  const valid = {};
  for (const [modelId, size] of Object.entries(models)) {
    if (isValidModelEntry(modelId, size)) {
      valid[modelId] = size;
    }
  }

  if (Object.keys(valid).length === 0) {
    debugFallback("no valid model entries");
    return { ...FALLBACK_MODEL_MAP };
  }

  if (filePath === BUNDLED_MODELS_PATH) {
    bundledCache = { ...valid };
  }
  return { ...valid };
}

let modelMap = { ...loadBundledModels() };

// Case-insensitive key lookup. Status-bar stdin can report model ids in
// varying case (e.g. `GLM-5.2` vs `glm-5.2`); matching case-insensitively
// keeps the context segment stable across frames. Storage and display
// preserve the original key casing.
function findByKey(map, modelId) {
  if (typeof modelId !== "string") {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(map, modelId)) {
    return { key: modelId, value: map[modelId] };
  }
  const lower = modelId.toLowerCase();
  for (const [key, value] of Object.entries(map)) {
    if (key.toLowerCase() === lower) {
      return { key, value };
    }
  }
  return undefined;
}

export function getModelSize(modelId) {
  return findByKey(modelMap, modelId)?.value;
}

export function setModelSize(modelId, size) {
  if (typeof modelId !== "string" || !modelId) {
    return;
  }
  if (
    typeof size !== "number" ||
    size <= 0 ||
    !Number.isFinite(size) ||
    !Number.isInteger(size)
  ) {
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

export function removeModel(modelId) {
  if (typeof modelId !== "string" || !modelId) {
    return false;
  }
  const found = findByKey(modelMap, modelId);
  if (found) {
    delete modelMap[found.key];
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
