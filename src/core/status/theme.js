import { normalizeTheme } from "../../shared/constants.js";

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  underline: "\u001b[4m",
  black: "\u001b[30m",
  gray: "\u001b[90m",
  white: "\u001b[37m",
  lightAccent: "\u001b[38;2;34;95;120m",
  darkAccent: "\u001b[38;2;119;209;208m",
  green: "\u001b[38;2;70;148;175m",
  yellow: "\u001b[38;2;255;130;0m",
  red: "\u001b[38;2;220;53;19m"
};

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
