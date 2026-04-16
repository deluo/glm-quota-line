import {
  DEFAULT_THEME,
  normalizeTheme
} from "../../shared/constants.js";

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  underline: "\u001b[4m",
  black: "\u001b[30m",
  gray: "\u001b[90m",
  white: "\u001b[37m",
  lightAccent: "\u001b[38;2;34;95;120m",
  cyan: "\u001b[36m",
  darkAccent: "\u001b[38;2;119;209;208m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m"
};

function applyCodes(text, codes) {
  if (!text || !codes.length) {
    return text;
  }

  return `${codes.join("")}${text}${ANSI.reset}`;
}

function getDarkCodes(tone) {
  switch (tone) {
    case "label":
    case "reset":
      return [ANSI.darkAccent];
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
      return [ANSI.gray];
    case "barEmpty":
      return [ANSI.dim, ANSI.gray];
    case "reset":
      return [ANSI.underline];
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

function getLightCodes(tone) {
  switch (tone) {
    case "label":
    case "reset":
      return [ANSI.lightAccent];
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
      return [ANSI.black];
    default:
      return [];
  }
}

export function applyTheme(segments, options = {}) {
  const theme = normalizeTheme(options.theme || DEFAULT_THEME);

  return segments
    .map((segment) => {
      const codes =
        theme === "mono"
          ? getMonoCodes(segment.tone)
          : theme === "light"
            ? getLightCodes(segment.tone)
            : getDarkCodes(segment.tone);
      return applyCodes(segment.text, codes);
    })
    .join("");
}
