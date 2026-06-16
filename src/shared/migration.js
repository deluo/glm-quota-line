import { DEFAULT_GLOBAL_CONFIG } from "./constants.js";

export function migrateOldConfig(oldConfig) {
  const global = {
    theme: oldConfig.theme || DEFAULT_GLOBAL_CONFIG.theme,
    displayMode: oldConfig.displayMode || DEFAULT_GLOBAL_CONFIG.displayMode,
    separator: DEFAULT_GLOBAL_CONFIG.separator,
    padding: { ...DEFAULT_GLOBAL_CONFIG.padding },
    minimalist: false,
    rawValues: false
  };

  const defaultStyle = oldConfig.style || "bar";

  const lines = [
    {
      id: "main",
      components: [
        { type: "model", enabled: true },
        { type: "5h", style: defaultStyle },
        {
          type: "week",
          enabled: true,
          style: defaultStyle
        },
        { type: "reset", enabled: true },
        {
          type: "ctx",
          enabled: oldConfig.ctxEnabled !== false,
          style: defaultStyle
        }
      ]
    }
  ];

  return { global, lines };
}

export function needsMigration(config) {
  if (!config || typeof config !== "object") {
    return false;
  }

  // Legacy ctxEnabled without lines config requires migration
  return typeof config.ctxEnabled === "boolean" && !config.lines;
}
