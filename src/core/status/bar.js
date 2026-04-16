import { STATUS_BAR_CHARACTERS } from "../../shared/constants.js";

export function buildBar(percent, characters = STATUS_BAR_CHARACTERS, width = 10) {
  const safePercent = Math.min(100, Math.max(0, percent));
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
