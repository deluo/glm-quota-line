export function padTwoDigits(value) {
  return String(value).padStart(2, "0");
}

export function formatLevel(level) {
  if (!level) {
    return "GLM";
  }

  return `GLM ${level.charAt(0).toUpperCase()}${level.slice(1)}`;
}

export function clampPercent(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }

  return Math.min(100, Math.max(0, n));
}

export function clampRoundPercent(value) {
  const percent = clampPercent(value);
  return percent !== null ? Math.round(percent) : null;
}

export function asFiniteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

export function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}
