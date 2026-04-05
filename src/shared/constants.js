export const DEFAULT_QUOTA_URL = "https://bigmodel.cn/api/monitor/usage/quota/limit";
export const DEFAULT_CN_BASE_URL = "https://open.bigmodel.cn";
export const DEFAULT_INTL_BASE_URL = "https://api.z.ai";
export const DEFAULT_TIMEOUT_MS = 5000;
export const DEFAULT_CACHE_TTL_MS = 300_000;
export const DEFAULT_DISPLAY_MODE = "left";
export const DEFAULT_STYLE = "text";
export const DEFAULT_BAR_WIDTH = 10;
export const DEFAULT_THEME = "plain";
export const DEFAULT_PALETTE = "dark";

export const STATUS_STYLES = ["text", "compact", "bar"];
export const DISPLAY_MODES = ["left", "used", "both"];
export const THEMES = ["plain", "ansi"];
export const PALETTES = ["dark", "mono"];

export const STATUS_BAR_CHARACTERS = {
  filled: "█",
  empty: "░"
};

export const TOOL_CONFIG_SCHEMA_VERSION = 1;
export const TOOL_CONFIG_MANAGED_BY = "glm-quota-line";

export const QUOTA_UNAVAILABLE_TEXT = "GLM | quota unavailable";
export const AUTH_EXPIRED_TEXT = "GLM | auth expired";

export function isValidStatusStyle(value) {
  return STATUS_STYLES.includes(value);
}

export function isValidDisplayMode(value) {
  return DISPLAY_MODES.includes(value);
}

export function isValidTheme(value) {
  return THEMES.includes(value);
}

export function isValidPalette(value) {
  return PALETTES.includes(value);
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
