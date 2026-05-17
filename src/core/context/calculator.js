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

export function isValidPercentages(percentages) {
  if (!percentages || typeof percentages !== "object") {
    return false;
  }

  const { used, remaining } = percentages;

  if (used === null && remaining === null) {
    return false;
  }

  if (used !== null && !Number.isFinite(used)) {
    return false;
  }

  if (remaining !== null && !Number.isFinite(remaining)) {
    return false;
  }

  if (used !== null && (used < 0 || used > 100)) {
    return false;
  }

  if (remaining !== null && (remaining < 0 || remaining > 100)) {
    return false;
  }

  return true;
}

export function completePercentages(percentages) {
  const { used, remaining } = percentages;

  if (used !== null && remaining === null) {
    return { used, remaining: 100 - used };
  }

  if (used === null && remaining !== null) {
    return { used: 100 - remaining, remaining };
  }

  if (used !== null && remaining !== null && Math.abs(used + remaining - 100) > 1) {
    return { used, remaining: 100 - used };
  }

  return percentages;
}
