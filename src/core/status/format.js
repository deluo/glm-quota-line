import {
  normalizeDisplayMode,
  normalizeStatusStyle,
  normalizeTheme
} from "../../shared/constants.js";
import { buildBar } from "./bar.js";
import { applyTheme } from "./theme.js";
import { buildStatusViewModel } from "./viewModel.js";

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

function createQuotaTextSegments(quota, displayMode, tone) {
  const mode = normalizeDisplayMode(displayMode);

  if (mode === "used") {
    return [
      { text: `${quota.label} used `, tone: "muted" },
      { text: quota.usedText, tone }
    ];
  }

  return [
    { text: `${quota.label} `, tone: "muted" },
    { text: quota.leftText, tone }
  ];
}

function appendSecondarySegments(segments, model, displayMode) {
  if (!model.secondaryQuota) {
    return segments;
  }

  const mode = normalizeDisplayMode(displayMode);
  const metric = mode === "used"
    ? { text: model.secondaryQuota.usedText }
    : { text: model.secondaryQuota.leftText };

  return [
    ...segments,
    { text: " | ", tone: "muted" },
    { text: `${model.secondaryQuota.compactLabel} `, tone: "muted" },
    { text: metric.text, tone: "plain" }
  ];
}

function appendMcpSegments(segments, model, displayMode) {
  if (!model.mcpQuota) {
    return segments;
  }

  const mode = normalizeDisplayMode(displayMode);
  const metric = mode === "used"
    ? { text: model.mcpQuota.usedText }
    : { text: model.mcpQuota.leftText };

  return [
    ...segments,
    { text: " | ", tone: "muted" },
    { text: `${model.mcpQuota.compactLabel} `, tone: "muted" },
    { text: metric.text, tone: "plain" }
  ];
}

function appendResetSegments(segments, model) {
  if (!model.resetText) {
    return segments;
  }

  return [
    ...segments,
    { text: " | ", tone: "muted" },
    { text: model.resetText, tone: "reset" }
  ];
}

function createTextSegments(model, displayMode) {
  const severityTone = model.severity;

  return appendResetSegments(
    appendMcpSegments(
      appendSecondarySegments(
        [
          { text: model.levelLabel, tone: "label" },
          { text: " | ", tone: "muted" },
          ...createQuotaTextSegments(model.primaryQuota, displayMode, severityTone)
        ],
        model,
        displayMode
      ),
      model,
      displayMode
    ),
    model
  );
}

function createCompactSegments(model, displayMode) {
  const severityTone = model.severity;
  const mode = normalizeDisplayMode(displayMode);
  let segments;

  const primaryMetric = mode === "used" ? model.primaryQuota.usedText : model.primaryQuota.leftText;

  if (model.secondaryQuota) {
    const secondaryMetric = mode === "used" ? model.secondaryQuota.usedText : model.secondaryQuota.leftText;
    segments = [
      { text: `${model.compactLabel} `, tone: "label" },
      { text: `${model.primaryQuota.compactLabel} `, tone: "muted" },
      { text: primaryMetric, tone: severityTone },
      { text: " ", tone: "plain" },
      { text: `${model.secondaryQuota.compactLabel} `, tone: "muted" },
      { text: secondaryMetric, tone: "plain" }
    ];
  } else {
    segments = [
      { text: `${model.compactLabel} `, tone: "label" },
      { text: primaryMetric, tone: severityTone }
    ];
  }

  if (model.mcpQuota) {
    const mcpMetric = mode === "used" ? model.mcpQuota.usedText : model.mcpQuota.leftText;
    if (model.secondaryQuota) {
      segments.push(
        { text: " ", tone: "plain" },
        { text: `${model.mcpQuota.compactLabel} `, tone: "muted" },
        { text: mcpMetric, tone: "plain" }
      );
    } else {
      segments.push(
        { text: " ", tone: "plain" },
        { text: `${model.mcpQuota.compactLabel} `, tone: "muted" },
        { text: mcpMetric, tone: "plain" }
      );
    }
  }

  if (model.resetText) {
    segments.push({ text: " | ", tone: "muted" }, { text: model.resetText, tone: "reset" });
  }

  return segments;
}

function createBarMetric(quota, displayMode) {
  if (normalizeDisplayMode(displayMode) === "used") {
    return {
      percent: quota.usedPercent,
      text: quota.usedText
    };
  }

  return {
    percent: quota.leftPercent,
    text: quota.leftText
  };
}

function createBarSegments(model, displayMode) {
  if (
    !Number.isFinite(model.primaryQuota?.leftPercent) ||
    !Number.isFinite(model.primaryQuota?.usedPercent)
  ) {
    return createErrorSegments({ kind: "unavailable" });
  }

  const metric = createBarMetric(model.primaryQuota, displayMode);
  const bar = buildBar(metric.percent);
  const severityTone = model.severity;
  const segments = [
    { text: model.levelLabel, tone: "label" },
    { text: " ", tone: "plain" },
    { text: bar.filledText, tone: severityTone },
    { text: bar.emptyText, tone: "barEmpty" },
    { text: " ", tone: "plain" },
    { text: metric.text, tone: severityTone }
  ];

  if (model.secondaryQuota) {
    const mode = normalizeDisplayMode(displayMode);
    const secondaryMetric = mode === "used" ? model.secondaryQuota.usedText : model.secondaryQuota.leftText;
    segments.push(
      { text: " | ", tone: "muted" },
      { text: `${model.secondaryQuota.compactLabel} `, tone: "muted" },
      { text: secondaryMetric, tone: "plain" }
    );
  }

  if (model.mcpQuota) {
    const mode = normalizeDisplayMode(displayMode);
    const mcpMetric = mode === "used" ? model.mcpQuota.usedText : model.mcpQuota.leftText;
    segments.push(
      { text: " | ", tone: "muted" },
      { text: `${model.mcpQuota.compactLabel} `, tone: "muted" },
      { text: mcpMetric, tone: "plain" }
    );
  }

  if (model.resetText) {
    segments.push({ text: " | ", tone: "muted" }, { text: model.resetText, tone: "reset" });
  }

  return segments;
}

function getCtxSeverity(usedPercent) {
  if (!Number.isFinite(usedPercent)) {
    return "neutral";
  }

  if (usedPercent >= 80) {
    return "danger";
  }

  if (usedPercent >= 60) {
    return "warn";
  }

  return "good";
}

function appendCtxSegments(segments, ctxModel, style) {
  const severity = getCtxSeverity(ctxModel.usedPercent);
  const percentText = `${ctxModel.usedPercent}%`;

  if (style === "bar") {
    const bar = buildBar(ctxModel.usedPercent, undefined, 6);
    return [
      ...segments,
      { text: " | ctx ", tone: "muted" },
      { text: bar.filledText, tone: severity },
      { text: bar.emptyText, tone: "barEmpty" },
      { text: " ", tone: "plain" },
      { text: percentText, tone: severity }
    ];
  }

  return [
    ...segments,
    { text: " | ctx ", tone: "muted" },
    { text: percentText, tone: severity }
  ];
}

export function formatStatus(result, options = {}) {
  const theme = normalizeTheme(options.theme);
  const model = buildStatusViewModel(result);

  if (model.kind !== "success") {
    return applyTheme(createErrorSegments(model), { theme });
  }

  const style = normalizeStatusStyle(options.style);
  let segments;

  if (style === "compact") {
    segments = createCompactSegments(model, options.displayMode);
  } else if (style === "bar") {
    segments = createBarSegments(model, options.displayMode);
  } else {
    segments = createTextSegments(model, options.displayMode);
  }

  if (options.ctxModel) {
    segments = appendCtxSegments(segments, options.ctxModel, style);
  }

  return applyTheme(segments, { theme });
}
