function asFiniteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function isAuthFailureMessage(value) {
  if (typeof value !== "string") {
    return false;
  }

  return /authorization|身份验证|鉴权|auth|令牌|token|过期|验证不正确/i.test(value);
}

function computeTotal(limit) {
  const usage = asFiniteNumber(limit.usage);
  if (usage !== null && usage >= 0) {
    return usage;
  }

  const remaining = asFiniteNumber(limit.remaining);
  const currentValue = asFiniteNumber(limit.currentValue);
  if (remaining !== null && currentValue !== null) {
    return remaining + currentValue;
  }

  return null;
}

function clampPercent(value) {
  const percent = asFiniteNumber(value);
  if (percent === null) {
    return null;
  }

  return Math.min(100, Math.max(0, percent));
}

export function parseQuotaResponse(response) {
  if (!response || response.kind !== "json") {
    return { kind: "unavailable" };
  }

  const payload = response.json;
  if (!payload || typeof payload !== "object") {
    return { kind: "unavailable" };
  }

  if (payload.success !== true) {
    if (payload.code === 1001 || payload.code === 401 || isAuthFailureMessage(payload.msg)) {
      return { kind: "auth_error" };
    }

    return { kind: "unavailable" };
  }

  const level = typeof payload.data?.level === "string" ? payload.data.level : "";
  const limits = Array.isArray(payload.data?.limits) ? payload.data.limits : [];
  const rollingWindowLimit = limits.find(
    (limit) => limit?.type === "TOKENS_LIMIT" && limit?.number === 5
  );

  if (rollingWindowLimit) {
    const usedPercent = clampPercent(rollingWindowLimit.percentage);
    const nextResetTime = asFiniteNumber(rollingWindowLimit.nextResetTime);

    if (usedPercent !== null && nextResetTime !== null) {
      return {
        kind: "success",
        level,
        display: "percent",
        leftPercent: 100 - usedPercent,
        usedPercent,
        nextResetTime
      };
    }
  }

  const timeLimit = limits.find((limit) => limit?.type === "TIME_LIMIT" && limit?.unit === 5);
  if (!timeLimit) {
    return { kind: "unavailable" };
  }

  const remaining = asFiniteNumber(timeLimit.remaining);
  const total = computeTotal(timeLimit);
  const nextResetTime = asFiniteNumber(timeLimit.nextResetTime);

  if (remaining === null || total === null || nextResetTime === null) {
    return { kind: "unavailable" };
  }

  return {
    kind: "success",
    level,
    display: "absolute",
    remaining,
    total,
    nextResetTime
  };
}
