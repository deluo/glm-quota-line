import { normalizeTheme } from "../../shared/constants.js";
import { ANSI } from "../../shared/ansi.js";

const THEMES = {
  dark: {
    label: [ANSI.darkAccent],
    reset: [ANSI.darkAccent],
    muted: [ANSI.gray],
    shade_good: [ANSI.green],
    shade_warn: [ANSI.yellow],
    shade_danger: [ANSI.red],
    barEmpty: [ANSI.dim, ANSI.gray],
    good: [ANSI.green],
    warn: [ANSI.yellow],
    danger: [ANSI.red],
    neutral: [ANSI.white]
  },
  light: {
    label: [ANSI.lightAccent],
    reset: [ANSI.lightAccent],
    muted: [ANSI.gray],
    shade_good: [ANSI.green],
    shade_warn: [ANSI.yellow],
    shade_danger: [ANSI.red],
    barEmpty: [ANSI.dim, ANSI.gray],
    good: [ANSI.green],
    warn: [ANSI.yellow],
    danger: [ANSI.red],
    neutral: [ANSI.black]
  },
  mono: {
    label: [ANSI.bold],
    reset: [ANSI.underline],
    muted: [ANSI.gray],
    shade_good: [ANSI.bold],
    shade_warn: [ANSI.bold],
    shade_danger: [ANSI.bold],
    barEmpty: [ANSI.dim, ANSI.gray],
    good: [ANSI.bold],
    warn: [ANSI.bold],
    danger: [ANSI.bold],
    neutral: [ANSI.bold]
  }
};

export function applyTheme(segments, options = {}) {
  const theme = normalizeTheme(options.theme);
  const palette = THEMES[theme] || THEMES.dark;

  return segments
    .map((segment) => {
      const codes = palette[segment.tone] || [];
      if (!codes.length) {
        return segment.text;
      }

      return `${codes.join("")}${segment.text}${ANSI.reset}`;
    })
    .join("");
}
