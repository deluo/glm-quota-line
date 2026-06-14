export function calculateFromTokens(tokenUsage, windowSize) {
  if (!tokenUsage || typeof tokenUsage !== "object") {
    return null;
  }

  if (!Number.isFinite(windowSize) || windowSize <= 0) {
    return null;
  }

  const { total } = tokenUsage;
  if (!Number.isFinite(total) || total < 0) {
    return null;
  }

  // Zero total is a Claude Code placeholder, not real usage — fall through to API percentage
  if (total === 0) {
    return null;
  }

  const rawPercent = (total / windowSize) * 100;
  const used = Math.round(Math.min(100, Math.max(0, rawPercent)));
  const remaining = 100 - used;

  return { used, remaining };
}

export function calculateTokenCount(percent, windowSize) {
  if (!Number.isFinite(percent) || !Number.isFinite(windowSize)) {
    return 0;
  }
  return Math.round((percent / 100) * windowSize);
}

export function getSeverity(usedPercent) {
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
