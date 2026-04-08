export const DEFAULT_QUOTA_URL = "https://bigmodel.cn/api/monitor/usage/quota/limit";
export const DEFAULT_CN_BASE_URL = "https://open.bigmodel.cn";
export const DEFAULT_INTL_BASE_URL = "https://api.z.ai";
export const DEFAULT_TIMEOUT_MS = 5000;
export const DEFAULT_CACHE_TTL_MS = 600_000;

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
  empty: "░"
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

export function normalizeStatusStyle(value) {
  return isValidStatusStyle(value) ? value : DEFAULT_STYLE;
}

export function normalizeDisplayMode(value) {
  return isValidDisplayMode(value) ? value : DEFAULT_DISPLAY_MODE;
}

export function normalizeTheme(value) {
  return isValidTheme(value) ? value : DEFAULT_THEME;
}
