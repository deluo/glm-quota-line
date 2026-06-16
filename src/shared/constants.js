export const COMPONENT_TYPES = {
  MODEL: "model",
  PRIMARY: "5h",
  WEEKLY: "week",
  RESET: "reset",
  CONTEXT: "ctx"
};

export const STYLEABLE_COMPONENTS = new Set([
  COMPONENT_TYPES.PRIMARY,
  COMPONENT_TYPES.WEEKLY,
  COMPONENT_TYPES.CONTEXT
]);

export const HIDABLE_COMPONENTS = new Set([
  COMPONENT_TYPES.MODEL,
  COMPONENT_TYPES.WEEKLY,
  COMPONENT_TYPES.RESET,
  COMPONENT_TYPES.CONTEXT
]);

export const REQUIRED_COMPONENTS = new Set([COMPONENT_TYPES.PRIMARY]);

export const DEFAULT_GLOBAL_CONFIG = {
  theme: "dark",
  displayMode: "left",
  separator: " | ",
  padding: { left: 0, right: 0 },
  minimalist: false,
  rawValues: false,
  resetFormat: "time"
};

export const DEFAULT_LINES = [
  {
    id: "main",
    components: [
      { type: COMPONENT_TYPES.MODEL, enabled: true },
      { type: COMPONENT_TYPES.PRIMARY, style: "bar" },
      { type: COMPONENT_TYPES.WEEKLY, enabled: true, style: "bar" },
      { type: COMPONENT_TYPES.RESET, enabled: true },
      { type: COMPONENT_TYPES.CONTEXT, enabled: true, style: "bar" }
    ]
  }
];

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
// A cached *success* value is only trusted to bridge transient failures for
// this long. Past it, a sustained `unavailable` must surface instead of
// freezing the status bar at a pre-exhaustion percentage. 10 min.
export const STALE_SUCCESS_MAX_AGE_MS = 600_000;
export const DEFAULT_DISPLAY_MODE = "left";
export const DEFAULT_STYLE = "bar";
export const DEFAULT_THEME = "dark";

export const STATUS_BAR_CHARACTERS = {
  filled: "█",
  shade: "▒",
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

export function isValidWorkDays(value) {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

export function isValidResetFormat(value) {
  return value === "time" || value === "countdown";
}

export function normalizeDisplayMode(value) {
  return isValidDisplayMode(value) ? value : DEFAULT_DISPLAY_MODE;
}

export function normalizeTheme(value) {
  return isValidTheme(value) ? value : DEFAULT_THEME;
}

export function validateComponent(comp) {
  if (!comp.type || typeof comp.type !== "string") {
    return false;
  }

  if (comp.type === COMPONENT_TYPES.PRIMARY && comp.enabled === false) {
    return false;
  }

  if (comp.style !== undefined && !STYLEABLE_COMPONENTS.has(comp.type)) {
    return false;
  }

  if (comp.style !== undefined && !["bar", "text"].includes(comp.style)) {
    return false;
  }

  if (comp.enabled !== undefined && typeof comp.enabled !== "boolean") {
    return false;
  }

  if (comp.rawValue !== undefined && typeof comp.rawValue !== "boolean") {
    return false;
  }

  return true;
}

export function validateLine(line) {
  if (!line || !line.components || !Array.isArray(line.components)) {
    return false;
  }

  const types = line.components.map(c => c.type);
  if (!types.includes(COMPONENT_TYPES.PRIMARY)) {
    return false;
  }

  return line.components.every(validateComponent);
}

export function validateConfig(config) {
  if (!config || !config.lines || !Array.isArray(config.lines)) {
    return false;
  }

  if (config.global) {
    if (config.global.theme && !isValidTheme(config.global.theme)) {
      return false;
    }
    if (config.global.displayMode && !isValidDisplayMode(config.global.displayMode)) {
      return false;
    }
  }

  return config.lines.every(validateLine);
}

export function normalizeComponent(comp, defaults = {}) {
  const normalized = { type: comp.type };

  if (!REQUIRED_COMPONENTS.has(comp.type)) {
    normalized.enabled = comp.enabled !== false;
  } else {
    normalized.enabled = true;
  }

  if (STYLEABLE_COMPONENTS.has(comp.type)) {
    normalized.style = comp.style || defaults.style || "bar";
  }

  return normalized;
}

export function normalizeConfig(config) {
  if (!config || !validateConfig(config)) {
    const fallbackStyle = isValidStatusStyle(config?.style) ? config.style : DEFAULT_STYLE;
    const global = {
      ...DEFAULT_GLOBAL_CONFIG,
      ...(isValidTheme(config?.theme) ? { theme: config.theme } : {}),
      ...(isValidDisplayMode(config?.displayMode) ? { displayMode: config.displayMode } : {}),
      ...(typeof config?.global?.minimalist === "boolean" ? { minimalist: config.global.minimalist } : {}),
      ...(typeof config?.global?.rawValues === "boolean" ? { rawValues: config.global.rawValues } : {}),
      ...(isValidResetFormat(config?.resetFormat) ? { resetFormat: config.resetFormat } : {}),
      ...(isValidResetFormat(config?.global?.resetFormat) ? { resetFormat: config.global.resetFormat } : {})
    };
    const lines = structuredClone(DEFAULT_LINES).map(line => ({
      ...line,
      components: line.components.map(comp => ({
        ...comp,
        ...(STYLEABLE_COMPONENTS.has(comp.type) ? { style: fallbackStyle } : {})
      }))
    }));
    return { global, lines };
  }

  const global = { ...DEFAULT_GLOBAL_CONFIG, ...config.global };
  if (!isValidResetFormat(global.resetFormat)) {
    global.resetFormat = DEFAULT_GLOBAL_CONFIG.resetFormat;
  }
  const lines = config.lines.map(line => ({
    ...line,
    components: line.components.map(comp =>
      normalizeComponent(comp, { style: "bar", rawValue: global.rawValues })
    )
  }));

  return { global, lines };
}

// Re-exported for test imports
export { migrateOldConfig } from "./migration.js";

