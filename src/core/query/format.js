import { normalizeDisplayMode } from "../../shared/constants.js";

const WINDOW_LABELS = {
  token_5h: "5h",
  token_week: "Week",
  mcp: "MCP"
};

function padTwoDigits(value) {
  return String(value).padStart(2, "0");
}

function formatFullResetTime(timestampMs) {
  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const y = date.getFullYear();
  const m = padTwoDigits(date.getMonth() + 1);
  const d = padTwoDigits(date.getDate());
  const h = padTwoDigits(date.getHours());
  const min = padTwoDigits(date.getMinutes());

  return `${y}-${m}-${d} ${h}:${min}`;
}

function formatLevel(level) {
  if (!level) {
    return "GLM";
  }

  return `GLM ${level.charAt(0).toUpperCase()}${level.slice(1)}`;
}

function formatQuotaLine(label, percent, displayMode, resetTime) {
  const tag = displayMode === "used" ? "used" : "left";
  const resetStr = resetTime ? `  |  reset ${resetTime}` : "";
  return `  ${label}:   ${tag} ${String(percent).padStart(2)}%${resetStr}`;
}

export function formatQueryHuman(result, displayMode) {
  if (!result || typeof result !== "object") {
    return "GLM | quota unavailable\n";
  }

  if (result.kind === "auth_error") {
    return "GLM | auth expired\n";
  }

  if (result.kind !== "success") {
    return "GLM | quota unavailable\n";
  }

  const mode = normalizeDisplayMode(displayMode);
  const levelLabel = formatLevel(result.level);
  const lines = [`${levelLabel} Quota Usage`, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"];

  const quotas = Array.isArray(result.quotas) ? result.quotas : [];
  for (const quota of quotas) {
    const label = WINDOW_LABELS[quota?.key] || quota?.key || "quota";
    const percent = mode === "used" ? quota.usedPercent : quota.leftPercent;
    if (!Number.isFinite(percent)) {
      continue;
    }

    const resetTime = formatFullResetTime(quota.nextResetTime);
    lines.push(formatQuotaLine(label, percent, mode, resetTime));
  }

  if (result.mcp && Number.isFinite(mode === "used" ? result.mcp.usedPercent : result.mcp.leftPercent)) {
    const percent = mode === "used" ? result.mcp.usedPercent : result.mcp.leftPercent;
    const resetTime = formatFullResetTime(result.mcp.nextResetTime);
    lines.push(formatQuotaLine("MCP", percent, mode, resetTime));
  }

  return `${lines.join("\n")}\n`;
}

function mapWindowKey(key) {
  if (key === "token_5h") {
    return "5h";
  }

  if (key === "token_week") {
    return "week";
  }

  return key || "unknown";
}

function formatResetTimestamp(timestampMs) {
  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function formatQueryJson(result) {
  if (!result || typeof result !== "object") {
    return { error: "quota unavailable" };
  }

  if (result.kind === "auth_error") {
    return { error: "auth expired" };
  }

  if (result.kind !== "success") {
    return { error: "quota unavailable" };
  }

  const quotas = Array.isArray(result.quotas) ? result.quotas : [];
  const json = {
    level: result.level || "",
    quotas: quotas.map((quota) => {
      const entry = {
        window: mapWindowKey(quota.key),
        usedPercent: quota.usedPercent,
        leftPercent: quota.leftPercent
      };

      const resetTime = formatResetTimestamp(quota.nextResetTime);
      if (resetTime) {
        entry.resetTime = resetTime;
        entry.resetTimestamp = quota.nextResetTime;
      }

      return entry;
    })
  };

  if (result.mcp) {
    const mcpEntry = {
      usedPercent: result.mcp.usedPercent,
      leftPercent: result.mcp.leftPercent
    };

    const mcpResetTime = formatResetTimestamp(result.mcp.nextResetTime);
    if (mcpResetTime) {
      mcpEntry.resetTime = mcpResetTime;
      mcpEntry.resetTimestamp = result.mcp.nextResetTime;
    }

    json.mcp = mcpEntry;
  }

  return json;
}
