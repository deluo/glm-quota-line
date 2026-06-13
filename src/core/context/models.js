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
