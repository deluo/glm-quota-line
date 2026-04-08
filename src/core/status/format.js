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
  const severityTone = model.severity;

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
  const severityTone = model.severity;
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
      theme: normalizeTheme(options.theme)
    });
  }

  const style = normalizeStatusStyle(options.style);
  let segments;

  if (style === "compact") {
    segments = createCompactSegments(model);
  } else if (style === "bar") {
    segments = createBarSegments(model, options.displayMode);
  } else {
    segments = createTextSegments(model, options.displayMode);
  }

  return applyTheme(segments, {
    theme: normalizeTheme(options.theme)
  });
}
