export const ANSI = {
  reset: "[0m",
  bold: "[1m",
  dim: "[2m",
  underline: "[4m",
  black: "[30m",
  gray: "[90m",
  white: "[37m",
  lightAccent: "[38;2;34;95;120m",
  darkAccent: "[38;2;119;209;208m",
  green: "[38;2;70;148;175m",
  yellow: "[38;2;255;130;0m",
  red: "[38;2;220;53;19m",
  blue: "[34m",
  cyan: "[36m"
};

export const TUI_COLORS = {
  hideCursor: "[?25l",
  showCursor: "[?25h",
  clearScreen: "[2J[H"
};

const COLOR_PALETTE = {
  title: ANSI.cyan,
  label: ANSI.blue,
  selected: ANSI.bold + ANSI.blue,
  editing: ANSI.bold + ANSI.yellow,
  enabled: ANSI.green,
  disabled: ANSI.gray,
  value: ANSI.green,
  muted: ANSI.gray,
  success: ANSI.green,
  error: ANSI.red
};

const MONO_PALETTE = {
  title: ANSI.bold,
  label: ANSI.white,
  selected: ANSI.bold,
  editing: ANSI.bold,
  enabled: ANSI.bold,
  disabled: ANSI.dim,
  value: ANSI.bold,
  muted: ANSI.gray,
  success: ANSI.bold,
  error: ANSI.bold
};

export function getTuiColors(theme = "dark") {
  return theme === "mono" ? MONO_PALETTE : COLOR_PALETTE;
}
