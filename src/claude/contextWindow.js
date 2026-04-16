function clampPercent(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }

  return Math.min(100, Math.max(0, Math.round(n)));
}

export function normalizeContextWindow(rawInput) {
  if (!rawInput || typeof rawInput !== "object") {
    return null;
  }

  const ctx = rawInput.context_window;
  if (!ctx || typeof ctx !== "object") {
    return null;
  }

  const usedPercent = clampPercent(ctx.used_percentage);
  const remainingPercent = clampPercent(ctx.remaining_percentage);

  if (usedPercent === null && remainingPercent === null) {
    return null;
  }

  const effectiveUsed = usedPercent !== null ? usedPercent : 100 - remainingPercent;
  const effectiveRemaining =
    remainingPercent !== null ? remainingPercent : 100 - effectiveUsed;

  return {
    usedPercent: effectiveUsed,
    remainingPercent: effectiveRemaining
  };
}
