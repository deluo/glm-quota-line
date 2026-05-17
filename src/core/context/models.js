// GLM model context window sizes (tokens)
// Source: https://open.bigmodel.cn/dev/api#glm

const DEFAULT_MODEL_MAP = {
  "glm-4.5-air": 128_000,
  "glm-4.7": 200_000,
  "glm-5-turbo": 200_000,
  "glm-5": 200_000,
  "glm-5.1": 200_000
};

let modelMap = { ...DEFAULT_MODEL_MAP };

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

export function resetModels() {
  modelMap = { ...DEFAULT_MODEL_MAP };
}

export function getDefaultModels() {
  return { ...DEFAULT_MODEL_MAP };
}
