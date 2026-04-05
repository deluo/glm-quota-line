import {
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

function createQuotaTextSegments(quota, displayMode, tone) {
  const mode = normalizeDisplayMode(displayMode);

  if (mode === "used") {
    return [
      { text: `${quota.label} used `, tone: "muted" },
      { text: quota.usedText, tone }
    ];
  }

  if (mode === "both") {
    return [
      { text: `${quota.label} left `, tone: "muted" },
      { text: quota.leftText, tone },
      { text: " used ", tone: "muted" },
      { text: quota.usedText, tone }
    ];
  }

  return [
    { text: `${quota.label} `, tone: "muted" },
    { text: quota.leftText, tone }
  ];
}

function appendSecondarySegments(segments, model) {
  if (!model.secondaryQuota) {
    return segments;
  }

  return [
    ...segments,
    { text: " | ", tone: "muted" },
    { text: `${model.secondaryQuota.label} `, tone: "muted" },
    { text: model.secondaryQuota.leftText, tone: "plain" }
  ];
}

function appendResetSegments(segments, model) {
  if (!model.resetText) {
    return segments;
  }

  return [
    ...segments,
    { text: " | reset ", tone: "muted" },
    { text: model.resetText, tone: "reset" }
  ];
}

function createTextSegments(model, displayMode) {
  const severityTone = getSeverityTone(model);

  return appendResetSegments(
    appendSecondarySegments(
      [
        { text: model.levelLabel, tone: "label" },
        { text: " | ", tone: "muted" },
        ...createQuotaTextSegments(model.primaryQuota, displayMode, severityTone)
      ],
      model
    ),
    model
  );
}

function createCompactSegments(model) {
  const severityTone = getSeverityTone(model);
  let segments;

  if (model.secondaryQuota) {
    segments = [
      { text: `${model.compactLabel} `, tone: "label" },
      { text: `${model.primaryQuota.compactLabel} `, tone: "muted" },
      { text: model.primaryQuota.leftText, tone: severityTone },
      { text: " ", tone: "plain" },
      { text: `${model.secondaryQuota.compactLabel} `, tone: "muted" },
      { text: model.secondaryQuota.leftText, tone: "plain" }
    ];
  } else {
    segments = [
      { text: `${model.compactLabel} `, tone: "label" },
      { text: model.primaryQuota.leftText, tone: severityTone }
    ];
  }

  if (model.resetText) {
    segments.push({ text: " | ", tone: "muted" }, { text: model.resetText, tone: "reset" });
  }

  return segments;
}

function createBarSegments(model, barWidth) {
  if (
    !Number.isFinite(model.primaryQuota?.leftPercent) ||
    !Number.isFinite(model.primaryQuota?.usedPercent)
  ) {
    return createErrorSegments({ kind: "unavailable" });
  }

  const bar = buildBar(model.primaryQuota.usedPercent, barWidth);
  const severityTone = getSeverityTone(model);
  const segments = [
    { text: model.levelLabel, tone: "label" },
    { text: " ", tone: "plain" },
    { text: bar.filledText, tone: severityTone },
    { text: bar.emptyText, tone: "barEmpty" },
    { text: " ", tone: "plain" },
    { text: model.primaryQuota.leftText, tone: severityTone }
  ];

  if (model.secondaryQuota) {
    segments.push(
      { text: " | ", tone: "muted" },
      { text: `${model.secondaryQuota.compactLabel} `, tone: "muted" },
      { text: model.secondaryQuota.leftText, tone: "plain" }
    );
  }

  if (model.resetText) {
    segments.push({ text: " | ", tone: "muted" }, { text: model.resetText, tone: "reset" });
  }

  return segments;
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
