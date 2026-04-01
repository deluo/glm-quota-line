import {
  DEFAULT_PALETTE,
  DEFAULT_THEME,
  normalizePalette,
  normalizeTheme
} from "../../shared/constants.js";

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  gray: "\u001b[90m",
  white: "\u001b[37m",
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m"
};

function shouldUseAnsi(theme, env = process.env) {
  // NO_COLOR is the explicit opt-out and wins over local config.
  if (env?.NO_COLOR) {
    return false;
  }

  return normalizeTheme(theme || DEFAULT_THEME) === "ansi";
}

function applyCodes(text, codes) {
  if (!text || !codes.length) {
    return text;
  }

  return `${codes.join("")}${text}${ANSI.reset}`;
}

function getDarkCodes(tone) {
  switch (tone) {
    case "label":
      return [ANSI.cyan];
    case "muted":
      return [ANSI.gray];
    case "barEmpty":
      return [ANSI.dim, ANSI.gray];
    case "good":
      return [ANSI.green];
    case "warn":
      return [ANSI.yellow];
    case "danger":
      return [ANSI.red];
    case "neutral":
      return [ANSI.white];
    default:
      return [];
  }
}

function getMonoCodes(tone) {
  switch (tone) {
    case "muted":
    case "barEmpty":
      return [ANSI.dim];
    case "label":
    case "good":
    case "warn":
    case "danger":
    case "neutral":
      return [ANSI.bold];
    default:
      return [];
  }
}

export function applyTheme(segments, options = {}) {
  const theme = normalizeTheme(options.theme || DEFAULT_THEME);
  const palette = normalizePalette(options.palette || DEFAULT_PALETTE);
  const env = options.env || process.env;

  if (!shouldUseAnsi(theme, env)) {
    return segments.map((segment) => segment.text).join("");
  }

  return segments
    .map((segment) => {
      const codes = palette === "mono" ? getMonoCodes(segment.tone) : getDarkCodes(segment.tone);
      return applyCodes(segment.text, codes);
    })
    .join("");
}
