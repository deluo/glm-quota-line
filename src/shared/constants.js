export const DEFAULT_QUOTA_URL = "https://bigmodel.cn/api/monitor/usage/quota/limit";
export const DEFAULT_CN_BASE_URL = "https://open.bigmodel.cn";
export const DEFAULT_INTL_BASE_URL = "https://api.z.ai";
export const DEFAULT_TIMEOUT_MS = 5000;

export const REFRESH_BANDS = [
  { minLeftPercent: 80, ttlMs: 120_000 }, // 2 min
  { minLeftPercent: 30, ttlMs: 300_000 }, // 5 min
  { minLeftPercent: 0, ttlMs: 120_000 } // 2 min
];

export const LOW_QUOTA_THRESHOLD = 30;
export const RATE_LIMIT_RETRY_TTL_MS = 180_000;
export const UNAVAILABLE_RETRY_TTL_MS = 120_000;
export const DEFAULT_DISPLAY_MODE = "left";
export const DEFAULT_STYLE = "bar";
export const DEFAULT_THEME = "dark";

export const STATUS_BAR_CHARACTERS = {
  filled: "█",
  shade: "▒",
  empty: "░"
};

// GLM 模型上下文窗口大小映射（token 数）
export const MODEL_CONTEXT_WINDOW = {
  "glm-4.5-air": 128_000,
  "glm-4.7": 200_000,
  "glm-5-turbo": 200_000,
  "glm-5": 200_000,
  "glm-5.1": 200_000,
};

export const TOOL_CONFIG_SCHEMA_VERSION = 1;
export const TOOL_CONFIG_MANAGED_BY = "glm-quota-line";

export function isValidStatusStyle(value) {
  return value === "text" || value === "compact" || value === "bar";
}

export function isValidDisplayMode(value) {
  return value === "left" || value === "used";
}

export function isValidTheme(value) {
  return value === "dark" || value === "light" || value === "mono";
}

export function isValidWorkDays(value) {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

export function normalizeStatusStyle(value) {
  return isValidStatusStyle(value) ? value : DEFAULT_STYLE;
}

export function normalizeDisplayMode(value) {
  return isValidDisplayMode(value) ? value : DEFAULT_DISPLAY_MODE;
}

export function normalizeTheme(value) {
  return isValidTheme(value) ? value : DEFAULT_THEME;
}
