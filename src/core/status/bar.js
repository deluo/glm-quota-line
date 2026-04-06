import { DEFAULT_BAR_WIDTH, STATUS_BAR_CHARACTERS } from "../../shared/constants.js";

function normalizeBarWidth(barWidth) {
  if (!Number.isFinite(barWidth)) {
    return DEFAULT_BAR_WIDTH;
  }

  return Math.min(20, Math.max(5, Math.round(barWidth)));
}

export function buildBar(usedPercent, barWidth, characters = STATUS_BAR_CHARACTERS) {
  const safePercent = Math.min(100, Math.max(0, usedPercent));
  const width = normalizeBarWidth(barWidth);
  let filledUnits;

  if (safePercent <= 0) {
    filledUnits = 0;
  } else if (safePercent >= 100) {
    filledUnits = width;
  } else {
    filledUnits = Math.min(width - 1, Math.max(1, Math.floor((safePercent / 100) * width)));
  }

  return {
    width,
    filledUnits,
    emptyUnits: width - filledUnits,
    filledText: characters.filled.repeat(filledUnits),
    emptyText: characters.empty.repeat(width - filledUnits)
  };
}

