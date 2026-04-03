export async function fetchQuota(config, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    return { kind: "unavailable" };
  }

  try {
    const response = await fetchImpl(config.quotaUrl, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        Authorization: config.authorization
      },
      signal: AbortSignal.timeout(config.timeoutMs)
    });

    const text = await response.text();
    let json = null;

    try {
      json = JSON.parse(text);
    } catch {}

    return { kind: "response", status: response.status, json, text };
  } catch {
    return { kind: "unavailable" };
  }
}
