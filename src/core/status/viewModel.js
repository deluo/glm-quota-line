function padTwoDigits(value) {
  return String(value).padStart(2, "0");
}

function formatLevel(level) {
  if (!level) {
    return "GLM";
  }

  return `GLM ${level.charAt(0).toUpperCase()}${level.slice(1)}`;
}

function formatResetTime(timestampMs) {
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${padTwoDigits(date.getHours())}:${padTwoDigits(date.getMinutes())}`;
}

function getSeverity(leftPercent) {
  if (!Number.isFinite(leftPercent)) {
    return "neutral";
  }

  if (leftPercent >= 60) {
    return "good";
  }

  if (leftPercent >= 25) {
    return "warn";
  }

  return "danger";
}

export function buildStatusViewModel(result) {
  if (!result || typeof result !== "object") {
    return { kind: "unavailable" };
  }

  if (result.kind === "auth_error") {
    return { kind: "auth_error" };
  }

  if (result.kind !== "success") {
    return { kind: "unavailable" };
  }

  const resetText = formatResetTime(result.nextResetTime);
  if (!resetText) {
    return { kind: "unavailable" };
  }

  if (result.display === "percent") {
    return {
      kind: "success",
      display: "percent",
      levelLabel: formatLevel(result.level),
      compactLabel: "GLM",
      resetText,
      leftPercent: result.leftPercent,
      usedPercent: result.usedPercent,
      leftText: Number.isFinite(result.leftPercent) ? `${result.leftPercent}%` : null,
      usedText: Number.isFinite(result.usedPercent) ? `${result.usedPercent}%` : null,
      severity: getSeverity(result.leftPercent)
    };
  }

  if (result.display === "absolute") {
    // Absolute quota responses are normalized into the same percent-oriented
    // view model so the renderer can stay display-format-focused.
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

    return {
      kind: "success",
      display: "absolute",
      levelLabel: formatLevel(result.level),
      compactLabel: "GLM",
      resetText,
      leftPercent,
      usedPercent,
      leftText:
        Number.isFinite(result.remaining) && Number.isFinite(result.total)
          ? `${result.remaining}/${result.total}`
          : null,
      usedText:
        Number.isFinite(usedValue) && Number.isFinite(result.total)
          ? `${usedValue}/${result.total}`
          : null,
      severity: getSeverity(leftPercent)
    };
  }

  return { kind: "unavailable" };
}
