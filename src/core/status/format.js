import {
  isValidStatusStyle,
  normalizeDisplayMode,
  normalizeTheme,
  STATUS_BAR_CHARACTERS,
  COMPONENT_TYPES,
  normalizeConfig
} from "../../shared/constants.js";
import { applyTheme } from "./theme.js";
import { buildStatusViewModel } from "./viewModel.js";
import { createRenderData } from "../context/index.js";

class ComponentRenderer {
  constructor(model, globalConfig, style) {
    this.model = model;
    this.global = globalConfig;
    this.style = style;
  }

  shouldShowLabel() {
    return !this.global.minimalist && !this.global.rawValues;
  }

  barMetric(quota) {
    const mode = normalizeDisplayMode(this.global.displayMode);
    if (mode === "used") {
      return { percent: quota.usedPercent, text: quota.usedText };
    }
    return { percent: quota.leftPercent, text: quota.leftText };
  }
}

class ModelRenderer extends ComponentRenderer {
  render(config) {
    if (this.global.minimalist || this.global.rawValues) {
      return null;
    }

    return [
      { text: this.model.levelLabel, tone: "label" }
    ];
  }
}

class PrimaryQuotaRenderer extends ComponentRenderer {
  render(config, ctxModel, enabledTypes) {
    const quota = this.model.primaryQuota;
    if (!quota || !Number.isFinite(quota.leftPercent)) {
      return null;
    }

    const tone = this.model.severity;
    const style = this.style || "bar";
    const showLabel = this.shouldShowLabel();

    if (style === "bar") {
      const metric = this.barMetric(quota);
      const bar = buildBar(metric.percent);

      const showModelLabel = showLabel && this.model.levelLabel && !enabledTypes?.has(COMPONENT_TYPES.MODEL);

      const segments = [];
      if (showModelLabel) {
        segments.push({ text: this.model.levelLabel, tone: "label" });
        segments.push({ text: " ", tone: "plain" });
      }

      segments.push(
        { text: bar.filledText, tone },
        { text: bar.emptyText, tone: "barEmpty" },
        { text: " ", tone: "plain" },
        { text: metric.text, tone }
      );

      return segments;
    }

    if (style === "compact") {
      const segments = [];
      const showModelLabel = showLabel && this.model.compactLabel && !enabledTypes?.has(COMPONENT_TYPES.MODEL);

      if (showModelLabel) {
        segments.push({ text: this.model.compactLabel, tone: "label" });
        segments.push({ text: " ", tone: "plain" });
      }

      segments.push(
        { text: `${quota.label} `, tone: "muted" },
        { text: quota.leftText, tone }
      );
      return segments;
    }

    return this.renderText(quota, tone, showLabel);
  }

  renderText(quota, tone, showLabel) {
    const mode = normalizeDisplayMode(this.global.displayMode);

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
}

class WeeklyQuotaRenderer extends ComponentRenderer {
  render(config) {
    if (!this.model.secondaryQuota) {
      return null;
    }

    const quota = this.model.secondaryQuota;
    const tone = this.model.secondarySeverity;
    const style = this.style || "bar";
    const showLabel = this.shouldShowLabel();

    if (style === "bar") {
      const metric = this.barMetric(quota);

      if (Number.isFinite(this.model.secondaryTheoreticalBudget)) {
        const barData = buildWeeklyBar(quota.usedPercent, this.model.secondaryTheoreticalBudget);
        return [
          { text: `${quota.compactLabel} `, tone: "muted" },
          { text: barData.filledText, tone },
          { text: barData.shadeText, tone: `shade_${tone}` },
          { text: barData.emptyText, tone: "barEmpty" },
          { text: " ", tone: "plain" },
          { text: metric.text, tone }
        ];
      }

      // No theoretical budget: plain text fallback
      return [
        { text: `${quota.compactLabel} `, tone: "muted" },
        { text: quota.leftText, tone }
      ];
    }

    if (style === "compact") {
      return [
        { text: `${quota.compactLabel} `, tone: "muted" },
        { text: quota.leftText, tone }
      ];
    }

    return [
      { text: `${quota.label} `, tone: "muted" },
      { text: quota.leftText, tone }
    ];
  }
}

class ResetTimeRenderer extends ComponentRenderer {
  render(config) {
    if (!this.model.resetText) {
      return null;
    }

    const style = this.style;
    const showLabel = this.shouldShowLabel() && style !== "bar" && style !== "compact";

    if (showLabel) {
      return [
        { text: " | reset ", tone: "muted" },
        { text: this.model.resetText, tone: "reset" }
      ];
    }

    return [
      { text: " | ", tone: "muted" },
      { text: this.model.resetText, tone: "reset" }
    ];
  }
}

class ContextRenderer extends ComponentRenderer {
  render(config, ctxModel) {
    if (!ctxModel || this.style === "compact") {
      return null;
    }

    const style = this.style || "bar";
    const renderData = createRenderData(ctxModel, style);
    if (!renderData) {
      return null;
    }

    const { percentText, suffix, bar } = renderData;
    const severity = ctxModel.severity || "neutral";

    if (style === "bar" && bar) {
      return [
        { text: " | ctx ", tone: "muted" },
        { text: bar.filledText, tone: severity },
        { text: bar.emptyText, tone: "barEmpty" },
        { text: " ", tone: "plain" },
        { text: percentText, tone: severity },
        { text: suffix, tone: "muted" }
      ];
    }

    return [
      { text: " | ctx ", tone: "muted" },
      { text: percentText, tone: severity },
      { text: suffix, tone: "muted" }
    ];
  }
}

class StatusLineRenderer {
  constructor(model, globalConfig, style) {
    this.model = model;
    this.global = globalConfig;
    this.renderers = {
      [COMPONENT_TYPES.MODEL]: new ModelRenderer(model, globalConfig, style),
      [COMPONENT_TYPES.PRIMARY]: new PrimaryQuotaRenderer(model, globalConfig, style),
      [COMPONENT_TYPES.WEEKLY]: new WeeklyQuotaRenderer(model, globalConfig, style),
      [COMPONENT_TYPES.RESET]: new ResetTimeRenderer(model, globalConfig, style),
      [COMPONENT_TYPES.CONTEXT]: new ContextRenderer(model, globalConfig, style)
    };
  }

  renderLine(lineConfig, ctxModel) {
    const segments = [];
    let prevHadContent = false;
    const enabledTypes = new Set(
      lineConfig.components
        .filter(c => c.enabled !== false)
        .map(c => c.type)
    );

    for (const compConfig of lineConfig.components) {
      if (compConfig.enabled === false) continue;

      const renderer = this.renderers[compConfig.type];
      if (!renderer) continue;

      const compSegments = renderer.render(compConfig, ctxModel, enabledTypes);

      if (compSegments && compSegments.length > 0) {
        if (prevHadContent && !this.hasLeadingSeparator(compSegments)) {
          segments.push({ text: this.global.separator, tone: "muted" });
        }

        segments.push(...compSegments);
        prevHadContent = true;
      }
    }

    return segments;
  }

  hasLeadingSeparator(segments) {
    return segments[0].text.trim().startsWith("|");
  }
}

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

export function formatStatus(result, options = {}) {
  const style = isValidStatusStyle(options.global?.style || options.style)
    ? (options.global?.style || options.style)
    : undefined;
  const theme = normalizeTheme(options.global?.theme || options.theme);
  const model = buildStatusViewModel(result, {
    workDays: options.global?.workDays || options.workDays,
    now: options.now
  });

  if (model.kind === "unavailable") return "";
  if (model.kind !== "success") {
    return applyTheme(createErrorSegments(model), { theme });
  }

  const normalizedConfig = normalizeConfig(options);
  const resolvedStyle = style || normalizedConfig.global._style || "bar";

  if (resolvedStyle === "bar" || resolvedStyle === "compact") {
    for (const line of normalizedConfig.lines) {
      const modelComp = line.components.find(c => c.type === COMPONENT_TYPES.MODEL);
      if (modelComp) modelComp.enabled = false;
    }
  }

  if (resolvedStyle === "compact") {
    normalizedConfig.global.separator = " ";
  }

  const renderer = new StatusLineRenderer(model, normalizedConfig.global, resolvedStyle);
  const lineConfig = normalizedConfig.lines[0];
  const segments = renderer.renderLine(lineConfig, options.ctxModel);

  return applyTheme(segments, { theme });
}
