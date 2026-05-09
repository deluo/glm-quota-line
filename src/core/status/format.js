import {
  normalizeDisplayMode,
  normalizeStatusStyle,
  normalizeTheme,
  STATUS_BAR_CHARACTERS
} from "../../shared/constants.js";
import { applyTheme } from "./theme.js";
import { buildStatusViewModel } from "./viewModel.js";

export function buildBar(percent, characters = STATUS_BAR_CHARACTERS, width = 10) {
  const safePercent = Math.min(100, Math.max(0, percent));
  let filledUnits;

  if (safePercent <= 0) {
    filledUnits = 0;
  } else if (safePercent >= 100) {
    filledUnits = width;
  } else {
    filledUnits = Math.min(width - 1, Math.max(1, Math.floor((safePercent / 100) * width)));
  }

  return {
    width,
    filledUnits,
    emptyUnits: width - filledUnits,
    filledText: characters.filled.repeat(filledUnits),
    emptyText: characters.empty.repeat(width - filledUnits)
  };
}

export function buildWeeklyBar(usedPercent, theoreticalBudget, width = 10) {
  const safeUsed = Math.min(100, Math.max(0, usedPercent));
  const safeBudget = Math.min(100, Math.max(0, theoreticalBudget));

  let filledUnits;
  if (safeUsed <= 0) {
    filledUnits = 0;
  } else if (safeUsed >= 100) {
    filledUnits = width;
  } else {
    filledUnits = Math.min(width - 1, Math.max(1, Math.floor((safeUsed / 100) * width)));
  }

  const budgetUnits = Math.floor((safeBudget / 100) * width);
  const shadeUnits = Math.max(0, Math.min(width - filledUnits, budgetUnits - filledUnits));
  const emptyUnits = width - filledUnits - shadeUnits;

  return {
    width,
    filledUnits,
    shadeUnits,
    emptyUnits,
    filledText: STATUS_BAR_CHARACTERS.filled.repeat(filledUnits),
    shadeText: STATUS_BAR_CHARACTERS.shade.repeat(shadeUnits),
    emptyText: STATUS_BAR_CHARACTERS.empty.repeat(emptyUnits)
  };
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
    { text: model.secondaryQuota.leftText, tone: model.secondarySeverity }
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
      { text: model.secondaryQuota.leftText, tone: model.secondarySeverity }
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
    segments.push({ text: " | ", tone: "muted" });
    if (Number.isFinite(model.secondaryTheoreticalBudget)) {
      const wBar = buildWeeklyBar(model.secondaryQuota.usedPercent, model.secondaryTheoreticalBudget);
      segments.push(
        { text: `${model.secondaryQuota.compactLabel} `, tone: "muted" },
        { text: wBar.filledText, tone: model.secondarySeverity },
        { text: wBar.shadeText, tone: `shade_${model.secondarySeverity}` },
        { text: wBar.emptyText, tone: "barEmpty" },
        { text: " ", tone: "plain" },
        { text: model.secondaryQuota.leftText, tone: model.secondarySeverity }
      );
    } else {
      segments.push(
        { text: `${model.secondaryQuota.compactLabel} `, tone: "muted" },
        { text: model.secondaryQuota.leftText, tone: model.secondarySeverity }
      );
    }
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

function formatWindowKb(size) {
  if (!Number.isFinite(size) || size <= 0) {
    return null;
  }
  const kb = size / 1000;
  return `${kb >= 1000 ? `${Math.round(kb / 1000)}M` : `${kb}K`}`;
}

function appendCtxSegments(segments, ctxModel, style) {
  const severity = getCtxSeverity(ctxModel.usedPercent);
  const percentText = `${ctxModel.usedPercent}%`;
  const windowText = formatWindowKb(ctxModel.windowSize);

  const suffixParts = [];
  if (ctxModel.modelId) {
    suffixParts.push(ctxModel.modelId);
  }
  if (windowText) {
    suffixParts.push(windowText);
  }
  const suffix = suffixParts.length > 0 ? ` (${suffixParts.join("/")})` : "";

  if (style === "bar") {
    const bar = buildBar(ctxModel.usedPercent, undefined, 6);
    return [
      ...segments,
      { text: " | ctx ", tone: "muted" },
      { text: bar.filledText, tone: severity },
      { text: bar.emptyText, tone: "barEmpty" },
      { text: " ", tone: "plain" },
      { text: percentText, tone: severity },
      { text: suffix, tone: "muted" }
    ];
  }

  return [
    ...segments,
    { text: " | ctx ", tone: "muted" },
    { text: percentText, tone: severity },
    { text: suffix, tone: "muted" }
  ];
}

export function formatStatus(result, options = {}) {
  const theme = normalizeTheme(options.theme);
  const model = buildStatusViewModel(result, { workDays: options.workDays, now: options.now });

  if (model.kind === "unavailable") {
    return "";
  }

  if (model.kind !== "success") {
    return applyTheme(createErrorSegments(model), { theme });
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

  if (options.ctxModel) {
    segments = appendCtxSegments(segments, options.ctxModel, style);
  }

  return applyTheme(segments, { theme });
}
