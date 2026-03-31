function padTwoDigits(value) {
  return String(value).padStart(2, "0");
}

function formatLevel(level) {
  if (!level) {
    return "GLM";
  }

  return `GLM ${level.charAt(0).toUpperCase()}${level.slice(1)}`;
}

function formatCompactLabel() {
  return "GLM";
}

function formatResetTime(timestampMs) {
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${padTwoDigits(date.getHours())}:${padTwoDigits(date.getMinutes())}`;
}

function normalizeDisplayMode(displayMode) {
  return displayMode === "used" || displayMode === "both" ? displayMode : "left";
}

function normalizeStyle(style) {
  return style === "compact" || style === "bar" ? style : "text";
}

function normalizeBarWidth(barWidth) {
  if (!Number.isFinite(barWidth)) {
    return 10;
  }

  return Math.min(20, Math.max(5, Math.round(barWidth)));
}

function buildBar(usedPercent, barWidth) {
  const safePercent = Math.min(100, Math.max(0, usedPercent));
  const width = normalizeBarWidth(barWidth);
  let filled;
  if (safePercent <= 0) {
    filled = 0;
  } else if (safePercent >= 100) {
    filled = width;
  } else {
    filled = Math.min(width - 1, Math.max(1, Math.floor((safePercent / 100) * width)));
  }
  return `${"■".repeat(filled)}${"□".repeat(width - filled)}`;
}

function formatPercentStatus(result, resetTime, displayMode) {
  const mode = normalizeDisplayMode(displayMode);

  if (mode === "used" && Number.isFinite(result.usedPercent)) {
    return `${formatLevel(result.level)} | 5h used ${result.usedPercent}% | reset ${resetTime}`;
  }

  if (
    mode === "both" &&
    Number.isFinite(result.leftPercent) &&
    Number.isFinite(result.usedPercent)
  ) {
    return `${formatLevel(result.level)} | 5h left ${result.leftPercent}% used ${result.usedPercent}% | reset ${resetTime}`;
  }

  if (Number.isFinite(result.leftPercent)) {
    return `${formatLevel(result.level)} | 5h left ${result.leftPercent}% | reset ${resetTime}`;
  }

  return "GLM | quota unavailable";
}

function formatAbsoluteStatus(result, resetTime, displayMode, style, barWidth) {
  const mode = normalizeDisplayMode(displayMode);
  const usedValue =
    Number.isFinite(result.total) && Number.isFinite(result.remaining)
      ? result.total - result.remaining
      : null;
  const leftPercent =
    Number.isFinite(result.total) && result.total > 0 && Number.isFinite(result.remaining)
      ? Math.round((result.remaining / result.total) * 100)
      : null;
  const usedPercent =
    Number.isFinite(leftPercent) ? Math.max(0, Math.min(100, 100 - leftPercent)) : null;

  if (style === "compact" && Number.isFinite(leftPercent)) {
    return `${formatCompactLabel()} ${leftPercent}% | ${resetTime}`;
  }

  if (style === "bar" && Number.isFinite(leftPercent) && Number.isFinite(usedPercent)) {
    return `${formatLevel(result.level)} ${buildBar(usedPercent, barWidth)} ${leftPercent}% | ${resetTime}`;
  }

  if (mode === "used" && Number.isFinite(usedValue) && Number.isFinite(result.total)) {
    return `${formatLevel(result.level)} | 5h used ${usedValue}/${result.total} | reset ${resetTime}`;
  }

  if (
    mode === "both" &&
    Number.isFinite(result.remaining) &&
    Number.isFinite(result.total) &&
    Number.isFinite(usedValue)
  ) {
    return `${formatLevel(result.level)} | 5h left ${result.remaining}/${result.total} used ${usedValue}/${result.total} | reset ${resetTime}`;
  }

  if (Number.isFinite(result.remaining) && Number.isFinite(result.total)) {
    return `${formatLevel(result.level)} | 5h left ${result.remaining}/${result.total} | reset ${resetTime}`;
  }

  return "GLM | quota unavailable";
}

export function formatStatus(result, options = {}) {
  if (!result || typeof result !== "object") {
    return "GLM | quota unavailable";
  }

  if (result.kind === "auth_error") {
    return "GLM | auth expired";
  }

  if (result.kind !== "success") {
    return "GLM | quota unavailable";
  }

  const resetTime = formatResetTime(result.nextResetTime);
  if (!resetTime) {
    return "GLM | quota unavailable";
  }

  const style = normalizeStyle(options.style);

  if (result.display === "percent") {
    if (style === "compact" && Number.isFinite(result.leftPercent)) {
      return `${formatCompactLabel()} ${result.leftPercent}% | ${resetTime}`;
    }

    if (style === "bar" && Number.isFinite(result.leftPercent) && Number.isFinite(result.usedPercent)) {
      return `${formatLevel(result.level)} ${buildBar(result.usedPercent, options.barWidth)} ${result.leftPercent}% | ${resetTime}`;
    }

    return formatPercentStatus(result, resetTime, options.displayMode);
  }

  if (result.display === "absolute") {
    return formatAbsoluteStatus(result, resetTime, options.displayMode, style, options.barWidth);
  }

  return "GLM | quota unavailable";
}
