import { LOW_QUOTA_THRESHOLD } from "../../shared/constants.js";
import { asFiniteNumber, formatLevel, padTwoDigits } from "../../shared/utils.js";

const QUOTA_LABELS = {
  token_5h: { text: "5h", compact: "5h" },
  token_week: { text: "week", compact: "W" }
};

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

function formatResetCountdown(timestampMs, nowMs) {
  if (!Number.isFinite(timestampMs) || !Number.isFinite(nowMs)) {
    return null;
  }

  const remainingMs = timestampMs - nowMs;
  if (remainingMs <= 0) {
    return null;
  }

  const totalMinutes = Math.floor(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainHours = hours % 24;
    return `${days}d ${remainHours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${padTwoDigits(minutes)}m`;
  }

  return `${minutes}m`;
}

function getQuotaSeverity(leftPercent) {
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

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_WORK_DAYS = 5;
const PACE_WARN_THRESHOLD = 1.1;
const PACE_DANGER_THRESHOLD = 1.3;

function countWorkDays(startMs, endMs, totalDays = DEFAULT_WORK_DAYS) {
  let count = 0;
  const d = new Date(startMs);
  d.setHours(0, 0, 0, 0);
  const end = new Date(endMs);
  end.setHours(0, 0, 0, 0);
  // Include the current day as a full work day for pacing calculation
  end.setDate(end.getDate() + 1);
  while (d < end) {
    const dow = d.getDay();
    const isWorkDay = totalDays >= 7 || (totalDays >= 6 ? dow !== 0 : dow !== 0 && dow !== 6);
    if (isWorkDay) {
      count += 1;
    }
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function getWeeklyInfo(leftPercent, nextResetTime, workDays, now = Date.now()) {
  const totalDays = workDays || DEFAULT_WORK_DAYS;
  const fallback = { severity: getQuotaSeverity(leftPercent), theoreticalBudget: null };

  if (!Number.isFinite(leftPercent)) {
    return { severity: "neutral", theoreticalBudget: null };
  }

  if (!Number.isFinite(nextResetTime) || nextResetTime <= now) {
    return fallback;
  }

  const periodStart = nextResetTime - WEEK_MS;
  const workDaysElapsed = countWorkDays(periodStart, now, totalDays);

  if (workDaysElapsed <= 0) {
    return fallback;
  }

  const theoreticalBudget = workDaysElapsed * (100 / totalDays);
  const usedPercent = 100 - leftPercent;
  const pace = usedPercent / theoreticalBudget;

  let severity;
  if (pace > PACE_DANGER_THRESHOLD) {
    severity = "danger";
  } else if (pace > PACE_WARN_THRESHOLD) {
    severity = "warn";
  } else {
    severity = "good";
  }

  return { severity, theoreticalBudget };
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

export function buildStatusViewModel(result, options = {}) {
  const now = options.now || Date.now();

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

  const weeklyInfo = secondaryQuota
    ? getWeeklyInfo(secondaryQuota.leftPercent, secondaryQuota.nextResetTime, options.workDays, now)
    : { severity: "neutral", theoreticalBudget: null };

  const formatReset = options.resetFormat === "countdown"
    ? (ts) => formatResetCountdown(ts, now)
    : formatResetTime;

  return {
    kind: "success",
    levelLabel: formatLevel(result.level),
    compactLabel: "GLM",
    primaryQuota,
    secondaryQuota,
    secondarySeverity: weeklyInfo.severity,
    secondaryTheoreticalBudget: weeklyInfo.theoreticalBudget,
    resetText: formatReset(primaryQuota.nextResetTime),
    weeklyResetText: formatReset(secondaryQuota?.nextResetTime),
    severity: getQuotaSeverity(primaryQuota.leftPercent)
  };
}
