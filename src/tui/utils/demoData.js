// Demo data matching the API response shape expected by buildStatusViewModel
export const DEMO_QUOTA_DATA = {
  kind: "success",
  level: "Lite",
  quotas: [
    {
      key: "token_5h",
      leftPercent: 91,
      usedPercent: 9,
      nextResetTime: Date.now() + 3 * 60 * 60 * 1000
    },
    {
      key: "token_week",
      leftPercent: 47,
      usedPercent: 53,
      nextResetTime: Date.now() + 4 * 24 * 60 * 60 * 1000
    }
  ]
};

export const DEMO_CTX_MODEL = {
  usedPercent: 35,
  remainingPercent: 65,
  modelId: "glm-5.1",
  windowSize: 200_000,
  severity: "good"
};
