export const DEFAULT_QUOTA_URL = "https://bigmodel.cn/api/monitor/usage/quota/limit";
export const DEFAULT_CN_BASE_URL = "https://open.bigmodel.cn";
export const DEFAULT_INTL_BASE_URL = "https://api.z.ai";
export const DEFAULT_TIMEOUT_MS = 5000;
export const DEFAULT_CACHE_TTL_MS = 600_000;

export const REFRESH_TIERS = [
  { ttlMs: 180_000, maxRefreshes: 5 },   // 3 min × 5
  { ttlMs: 300_000, maxRefreshes: 5 },   // 5 min × 5
  { ttlMs: 600_000, maxRefreshes: Infinity } // 10 min (cap)
];

export const LOW_QUOTA_THRESHOLD = 30;
export const DEFAULT_DISPLAY_MODE = "left";
export const DEFAULT_STYLE = "text";
export const DEFAULT_BAR_WIDTH = 10;
export const DEFAULT_THEME = "ansi";
export const DEFAULT_PALETTE = "dark";

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
  return value === "left" || value === "used" || value === "both";
}

export function isValidTheme(value) {
  return value === "plain" || value === "ansi";
}

export function isValidPalette(value) {
  return value === "dark" || value === "mono";
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

export function normalizePalette(value) {
  return isValidPalette(value) ? value : DEFAULT_PALETTE;
}
