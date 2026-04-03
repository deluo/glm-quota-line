function asFiniteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function isAuthFailureMessage(value) {
  if (typeof value !== "string") {
    return false;
  }

  return /authorization|auth|token/i.test(value);
}

function isRateLimitedMessage(value) {
  if (typeof value !== "string") {
    return false;
  }

  return /rate\s*limit|too many requests|too frequent|frequency|\u9650\u6d41|\u9891\u7387|\u8fc7\u4e8e\u9891\u7e41|\u7a0d\u540e\u518d\u8bd5/i.test(value);
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
  if (!response || response.kind !== "response") {
    return { kind: "unavailable" };
  }

  if (response.status === 429 || isRateLimitedMessage(response.text)) {
    return { kind: "rate_limited" };
  }

  const payload = response.json;
  if (!payload || typeof payload !== "object") {
    return { kind: "unavailable" };
  }

  if (payload.success !== true) {
    if (payload.code === 1001 || payload.code === 401 || isAuthFailureMessage(payload.msg)) {
      return { kind: "auth_error" };
    }

    if (isRateLimitedMessage(payload.msg)) {
      return { kind: "rate_limited" };
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
