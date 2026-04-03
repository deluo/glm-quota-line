import {
  AUTH_EXPIRED_TEXT,
  QUOTA_UNAVAILABLE_TEXT,
  normalizeDisplayMode,
  normalizePalette,
  normalizeStatusStyle,
  normalizeTheme
} from "../../shared/constants.js";
import { buildBar } from "./bar.js";
import { applyTheme } from "./theme.js";
import { buildStatusViewModel } from "./viewModel.js";

function getSeverityTone(model) {
  return model.severity || "neutral";
}

function createErrorSegments(model) {
  const tone = model.kind === "auth_error" ? "danger" : "warn";
  return [
    { text: "GLM", tone: "label" },
    { text: " | ", tone: "muted" },
    {
      text: model.kind === "auth_error" ? "auth expired" : "quota unavailable",
      tone
    }
  ];
}

function createTextSegments(model, displayMode) {
  const mode = normalizeDisplayMode(displayMode);
  const severityTone = getSeverityTone(model);

  if (mode === "used" && model.usedText) {
    return [
      { text: model.levelLabel, tone: "label" },
      { text: " | 5h used ", tone: "muted" },
      { text: model.usedText, tone: severityTone },
      { text: " | reset ", tone: "muted" },
      { text: model.resetText, tone: "reset" }
    ];
  }

  if (mode === "both" && model.leftText && model.usedText) {
    return [
      { text: model.levelLabel, tone: "label" },
      { text: " | 5h left ", tone: "muted" },
      { text: model.leftText, tone: severityTone },
      { text: " used ", tone: "muted" },
      { text: model.usedText, tone: severityTone },
      { text: " | reset ", tone: "muted" },
      { text: model.resetText, tone: "reset" }
    ];
  }

  if (model.leftText) {
    return [
      { text: model.levelLabel, tone: "label" },
      { text: " | 5h left ", tone: "muted" },
      { text: model.leftText, tone: severityTone },
      { text: " | reset ", tone: "muted" },
      { text: model.resetText, tone: "reset" }
    ];
  }

  return createErrorSegments({ kind: "unavailable" });
}

function createCompactSegments(model) {
  if (!Number.isFinite(model.leftPercent)) {
    return createErrorSegments({ kind: "unavailable" });
  }

  return [
    { text: `${model.compactLabel} `, tone: "label" },
    { text: `${model.leftPercent}%`, tone: getSeverityTone(model) },
    { text: " | ", tone: "muted" },
    { text: model.resetText, tone: "reset" }
  ];
}

function createBarSegments(model, barWidth) {
  if (!Number.isFinite(model.leftPercent) || !Number.isFinite(model.usedPercent)) {
    return createErrorSegments({ kind: "unavailable" });
  }

  const bar = buildBar(model.usedPercent, barWidth);
  const severityTone = getSeverityTone(model);

  return [
    { text: model.levelLabel, tone: "label" },
    { text: " ", tone: "plain" },
    { text: bar.filledText, tone: severityTone },
    { text: bar.emptyText, tone: "barEmpty" },
    { text: " ", tone: "plain" },
    { text: `${model.leftPercent}%`, tone: severityTone },
    { text: " | ", tone: "muted" },
    { text: model.resetText, tone: "reset" }
  ];
}

export function formatStatus(result, options = {}) {
  const model = buildStatusViewModel(result);

  if (model.kind !== "success") {
    return applyTheme(createErrorSegments(model), {
      theme: normalizeTheme(options.theme),
      palette: normalizePalette(options.palette),
      env: options.env
    });
  }

  const style = normalizeStatusStyle(options.style);
  let segments;

  if (style === "compact") {
    segments = createCompactSegments(model);
  } else if (style === "bar") {
    segments = createBarSegments(model, options.barWidth);
  } else {
    segments = createTextSegments(model, options.displayMode);
  }

  return applyTheme(segments, {
    theme: normalizeTheme(options.theme),
    palette: normalizePalette(options.palette),
    env: options.env
  });
}
