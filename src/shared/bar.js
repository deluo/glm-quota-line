// Status-bar rendering primitive. Lives in shared/ (not a domain layer) because
// both the status domain (quota bars) and the context domain (ctx bars) render
// progress bars — having this here avoids the context -> status dependency
// inversion that existed when context/formatter.js imported buildBar from
// status/format.js.

export const DEFAULT_BAR_WIDTH = 10;

/**
 * Render a monospace progress bar.
 *
 * @param {number} percent - 0-100; clamped to range.
 * @param {{filled: string, empty: string}} characters - fill/empty glyphs.
 * @param {number} [width=10] - total cell count.
 * @returns {{width, filledUnits, emptyUnits, filledText, emptyText}}
 */
export function buildBar(percent, characters, width = DEFAULT_BAR_WIDTH) {
  const chars = characters && characters.filled && characters.empty
    ? characters
    : { filled: "█", empty: "░" };

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
    filledText: chars.filled.repeat(filledUnits),
    emptyText: chars.empty.repeat(width - filledUnits)
  };
}
