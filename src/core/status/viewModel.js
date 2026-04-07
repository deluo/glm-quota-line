import { LOW_QUOTA_THRESHOLD } from "../../shared/constants.js";

function padTwoDigits(value) {
  return String(value).padStart(2, "0");
}

const QUOTA_LABELS = {
  token_5h: { text: "5h", compact: "5h" },
  token_week: { text: "week", compact: "W" }
};

function formatLevel(level) {
  if (!level) {
    return "GLM";
  }

  return `GLM ${level.charAt(0).toUpperCase()}${level.slice(1)}`;
}

function formatResetTime(timestampMs) {
  if (!Number.isFinite(timestampMs)) {
    return null;
  }

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

  if (leftPercent >= LOW_QUOTA_THRESHOLD) {
    return "warn";
  }

  return "danger";
}

function getQuotaLabels(key) {
  return QUOTA_LABELS[key] || { text: key || "quota", compact: key || "Q" };
}

function normalizeQuota(quota) {
  if (!quota || typeof quota !== "object" || !Number.isFinite(quota.leftPercent)) {
    return null;
  }

  const usedPercent = Number.isFinite(quota.usedPercent)
    ? quota.usedPercent
    : Math.max(0, Math.min(100, 100 - quota.leftPercent));
  const labels = getQuotaLabels(quota.key);

  return {
    key: quota.key || "token_5h",
    label: labels.text,
    compactLabel: labels.compact,
    leftPercent: quota.leftPercent,
    usedPercent,
    leftText: `${quota.leftPercent}%`,
    usedText: `${usedPercent}%`,
    nextResetTime: Number.isFinite(quota.nextResetTime) ? quota.nextResetTime : null
  };
}

function normalizeQuotasFromResult(result) {
  if (Array.isArray(result.quotas) && result.quotas.length > 0) {
    return result.quotas.map(normalizeQuota).filter(Boolean);
  }

  if (result.display === "percent" && Number.isFinite(result.leftPercent)) {
    return [
      normalizeQuota({
        key: "token_5h",
        leftPercent: result.leftPercent,
        usedPercent: result.usedPercent,
        nextResetTime: result.nextResetTime
      })
    ].filter(Boolean);
  }

  return [];
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

  const quotas = normalizeQuotasFromResult(result);
  if (quotas.length === 0) {
    return { kind: "unavailable" };
  }

  const primaryQuota =
    quotas.find((quota) => quota.key === result.primaryQuotaKey) ||
    quotas.find((quota) => quota.key === "token_5h") ||
    quotas[0];
  const secondaryQuota = quotas.find((quota) => quota !== primaryQuota) || null;

  return {
    kind: "success",
    levelLabel: formatLevel(result.level),
    compactLabel: "GLM",
    primaryQuota,
    secondaryQuota,
    leftPercent: primaryQuota.leftPercent,
    usedPercent: primaryQuota.usedPercent,
    resetText: formatResetTime(primaryQuota.nextResetTime),
    severity: getSeverity(primaryQuota.leftPercent)
  };
}
