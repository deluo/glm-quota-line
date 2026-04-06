import { DEFAULT_TIMEOUT_MS } from "../shared/constants.js";
import { readPackageInfo } from "../shared/packageInfo.js";

const DEFAULT_REGISTRY_URL = "https://registry.npmjs.org";

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version);
  if (!match) {
    return null;
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] || ""
  };
}

export function compareVersions(left, right) {
  const parsedLeft = parseVersion(left);
  const parsedRight = parseVersion(right);

  if (!parsedLeft || !parsedRight) {
    return left === right ? 0 : left.localeCompare(right);
  }

  for (const key of ["major", "minor", "patch"]) {
    if (parsedLeft[key] !== parsedRight[key]) {
      return parsedLeft[key] - parsedRight[key];
    }
  }

  if (parsedLeft.prerelease === parsedRight.prerelease) {
    return 0;
  }

  if (!parsedLeft.prerelease) {
    return 1;
  }

  if (!parsedRight.prerelease) {
    return -1;
  }

  return parsedLeft.prerelease.localeCompare(parsedRight.prerelease);
}

function normalizeRegistryUrl(value) {
  return value.replace(/\/+$/u, "");
}

function toErrorMessage(error) {
  if (error?.name === "AbortError") {
    return "npm registry request timed out";
  }

  if (error?.name === "TypeError" && error?.message === "fetch failed") {
    return "npm registry request failed";
  }

  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  return "npm registry request failed";
}

export async function checkForUpdates(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this Node.js runtime");
  }

  const packageInfo = options.packageInfo || (await readPackageInfo());
  const packageName = packageInfo.name || "glm-quota-line";
  const currentVersion = packageInfo.version || "0.0.0";
  const registryUrl = normalizeRegistryUrl(options.registryUrl || DEFAULT_REGISTRY_URL);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${registryUrl}/${encodeURIComponent(packageName)}/latest`, {
      headers: {
        accept: "application/json"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`npm registry returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    const latestVersion = typeof payload?.version === "string" ? payload.version.trim() : "";
    if (!latestVersion) {
      throw new Error("npm registry response did not include a version");
    }

    return {
      packageName,
      currentVersion,
      latestVersion,
      status: compareVersions(currentVersion, latestVersion) < 0 ? "update-available" : "up-to-date",
      upgradeCommand: `npm install -g ${packageName}`
    };
  } catch (error) {
    return {
      packageName,
      currentVersion,
      latestVersion: null,
      status: "error",
      errorMessage: toErrorMessage(error)
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
