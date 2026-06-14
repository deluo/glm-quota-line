import { buildBar as buildBarBase } from "../../shared/bar.js";

export function formatWindowSize(size) {
  if (!Number.isFinite(size) || size <= 0) {
    return null;
  }

  const kb = size / 1000;
  if (kb >= 1000) {
    return `${Math.round(kb / 1000)}M`;
  }
  return `${kb}K`;
}

export function formatPercent(percent) {
  if (!Number.isFinite(percent)) {
    return "N/A";
  }
  return `${percent}%`;
}

export function buildBar(percent, options = {}) {
  const {
    filled = "█",
    empty = "░",
    width = 6
  } = options;

  return buildBarBase(percent, { filled, empty }, width);
}

export function formatModelSuffix(modelId, windowSize) {
  const parts = [];

  if (modelId && typeof modelId === "string") {
    parts.push(modelId);
  }

  const sizeText = formatWindowSize(windowSize);
  if (sizeText) {
    parts.push(sizeText);
  }

  if (parts.length === 0) {
    return "";
  }

  return ` (${parts.join("/")})`;
}

export function formatForRender(data, style = "bar") {
  if (!data || typeof data !== "object") {
    return null;
  }

  const { usedPercent, modelId, windowSize } = data;

  if (!Number.isFinite(usedPercent)) {
    return null;
  }

  const percentText = formatPercent(usedPercent);
  const suffix = formatModelSuffix(modelId, windowSize);

  if (style === "bar") {
    const bar = buildBar(usedPercent);
    return {
      style: "bar",
      percentText,
      suffix,
      bar: {
        filledText: bar.filledText,
        emptyText: bar.emptyText,
        filledUnits: bar.filledUnits,
        emptyUnits: bar.emptyUnits
      }
    };
  }

  return {
    style: "text",
    percentText,
    suffix
  };
}
