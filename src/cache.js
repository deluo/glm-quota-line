import fs from "node:fs/promises";
import path from "node:path";

function isSuccessCacheShape(value) {
  if (!value || value.kind !== "success" || typeof value.level !== "string") {
    return false;
  }

  if (!Number.isFinite(value.nextResetTime)) {
    return false;
  }

  if (value.display === "percent") {
    return Number.isFinite(value.leftPercent);
  }

  if (value.display === "absolute") {
    return Number.isFinite(value.remaining) && Number.isFinite(value.total);
  }

  return false;
}

export async function readCache(cacheFilePath) {
  try {
    const raw = await fs.readFile(cacheFilePath, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    if (
      !Number.isFinite(parsed.savedAt) ||
      !isSuccessCacheShape(parsed.result)
    ) {
      return null;
    }

    return parsed;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }

    return null;
  }
}

export async function readFreshCache(cacheFilePath, ttlMs, now = Date.now()) {
  const cached = await readCache(cacheFilePath);
  if (!cached) {
    return null;
  }

  return now - cached.savedAt <= ttlMs ? cached : null;
}

export async function writeSuccessCache(cacheFilePath, result, now = Date.now()) {
  const payload = JSON.stringify(
    {
      savedAt: now,
      result
    },
    null,
    2
  );

  await fs.mkdir(path.dirname(cacheFilePath), { recursive: true });
  await fs.writeFile(cacheFilePath, payload, "utf8");
}
