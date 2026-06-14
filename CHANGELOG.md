# Changelog

## 1.3.0

- Added `commands` subcommand: list every command with a machine-readable schema via `--json` (name / summary / sideEffect / args / examples), for AI agents and scripting
- Added per-subcommand `--help` (e.g. `model --help`, `config set --help`) — focused help derived from a single command registry
- **User-customizable model mapping table** — model context window sizes are now managed by the user at runtime. The bundled `data/models.json` is just a frozen base; your local `modelMap` overlays it, so adapting to a new model (e.g. `glm-5.2` with 1M context) needs only `model set <id> <size>` — no package update or upgrade required
- Added `model` subcommands: `list`, `get`, `set`, `remove` — manage model context window size mappings via CLI
- Added `modelMap` persistence in tool config — custom model sizes survive across sessions
- Added `config reset [--models] [--yes]` — restore user config to defaults. `--models` limits the reset to custom model mappings. Preserves install state; prompts unless `--yes` (required in non-interactive sessions)
- Model ids reported with a bracket suffix (e.g. `glm-5.2[1M]`) are now normalized to the bare id for lookup and display
- Updated default table: added `glm-5.2` (1M context), removed `glm-5` and `glm-5.1` (no longer in plan)
- Added `reset-format` config (`time` / `countdown`) — show reset time as countdown duration instead of time point
- Weekly quota now displays reset time (time point or countdown) alongside the progress bar
- Context window resolution now relies solely on the local model map: stdin `context_window_size` is ignored, and stdin-provided window percentages are no longer used as a fallback (they are often inaccurate). If the current model id is not in the map, the context segment is simply not shown rather than guessing
- ctx cache now keyed by session id + model id: token usage can be 0 or missing on individual status-line frames (session start, between requests), which would make the context segment flash. The cache falls back to the last valid value for the same session and model so the display stays stable — a stale value from a different session or model is never shown
- Refactored command dispatch into `configCommand.js` / `modelCommand.js`, and extracted a shared `bar.js` and a context-scoped `cache.js`. No behavior change
- Hardcoded `glm-4.7` fallback remains as a defensive guard against `data/models.json` I/O failure

## 1.2.0

- Added interactive TUI configuration: `glm-quota-line configure` — live preview, per-component toggle and style, global options
- Added component-level control: each display component (plan, 5h, week, reset, context) can be individually toggled and styled
- Added `minimalist` config to hide all labels, showing only progress bars and values
- Added `raw-values` config to hide labels and show raw values
- Added `--json` flag for structured JSON output in terminal mode (useful for scripting and automation)
- Added `work-days` config (1-7) to customize weekly working days for quota pacing calculation
- Added one-time query via `npx glm-quota-line` without global install
- Context window now displays model ID and window size (e.g., `glm-4.7 (200K)`)
- Context window usage is now calculated from raw tokens when model mapping is available
- Weekly quota bar now shows theoretical budget with shade segments (▒) when pacing data is available
- Weekly quota severity now uses pacing-based calculation: good (≤1.1x), warn (1.1-1.3x), danger (>1.3x)
- Added GLM provider detection to disable quota for non-Zhipu API endpoints
- Replaced `--ctx on|off` CLI flag and `config set/unset ctx` with TUI component config
- Consolidated duplicate utility functions into shared `utils.js` module

## 1.1.1

- Fixed MCP quota not displaying when API returns `TIME_LIMIT` type instead of `MCP_LIMIT`
- Updated severity colors: good `#4694AF`, warn `#FF8200`, danger `#DC3513`

## 1.1.0

- Added MCP quota extraction from API response (`MCP_LIMIT` type), shown in CLI query output alongside token quotas
- Added context window usage segment to Claude Code status line (percentage in text mode, mini bar in bar mode)
- Added `--ctx on|off` CLI flag and `config set/unset ctx` to toggle context window display (default: on)
- Context window severity colors: green (< 60%), yellow (60–79%), red (>= 80%)
- Added `formatQueryHuman` and `formatQueryJson` for structured CLI quota output with MCP support
- Made `buildBar` width configurable for compact ctx bar display
- Fixed MCP matching to use explicit `type === 'MCP_LIMIT'` instead of exclusion-based logic

## 1.0.0

- Replaced `theme`/`palette` two-config system with unified `theme` presets: `dark`, `light`, `mono`
- Removed `palette` config and CLI flag entirely
- Removed `display=both` option; display now supports only `left` (default) and `used`
- Removed `bar-width` config option; bar width is fixed at 10
- Changed default style from `text` to `bar`
- Bar fill now represents remaining quota by default (was used); `display=used` fills by usage
- Added `light` theme with blue accents for light terminals
- `loadConfig` now reads `~/.claude/settings.json` env as a fallback auth source
- `loadConfig` changed from sync to async; all callers updated
- Updated README with complete config reference, display docs, and terminal quick-check usage

## 0.9.0

- Replaced progressive tier-based backoff with diamond-shaped refresh strategy: high quota (80–100%) refreshes every 2 min, medium (30–79%) every 5 min, low (0–29%) every 2 min — frequent updates when usage is active or quota is near exhaustion, relaxed in between
- Added failure-type-aware retry TTLs: rate-limited (429) retries after 3 min, unavailable retries after 2 min, instead of reusing the quota-based TTL
- Removed `refreshCount`/`tierIndex` cache fields and `advanceTier()` — cache format is now simpler, and TTL is derived purely from quota percentage
- Aligned severity threshold (danger/warn boundary) from hardcoded 25% to `LOW_QUOTA_THRESHOLD` (30%), consistent with the refresh band boundary
- Unknown CLI commands and invalid config subcommands now print an error and exit with code 1 instead of silently showing quota status

## 0.8.0

- Added progressive refresh backoff: new sessions start at 3-minute intervals, advance to 5 minutes after 5 refreshes, and cap at 10 minutes after 5 more — giving new users fast feedback while reducing API pressure in long sessions
- Added low-quota override: when remaining quota drops below 30%, the refresh interval is forced back to 3 minutes regardless of current tier, so users see accurate data when it matters most
- Low-quota refreshes do not advance the tier counter, preserving the previous tier when quota recovers
- SessionStart (startup / resume / clear) resets the tier to level 0, ensuring fresh sessions always start responsive
- Rate-limited and failed responses no longer advance the tier counter
- Old cache files without tier fields automatically migrate to tier 0
- Simplified README quick start to two commands with style config clearly marked as optional

## 0.7.0

- Added `--version` and `version` so the installed CLI version is visible directly from the command line
- Added `check-update` to compare the installed version with npm and print a suggested upgrade command without auto-updating
- Improved CLI help and README docs with upgrade and version-check examples
- Corrected published package metadata to include `README.en.md` in the npm file list

## 0.6.0

- Added official international GLM quota endpoint support for `api.z.ai` while preserving domestic `open.bigmodel.cn` detection
- Added dual-token status rendering for the new package shape, showing both the 5h quota and weekly quota in `text`, `compact`, and `bar` styles
- Kept old packages compatible by continuing to read the legacy `TOKENS_LIMIT(number=5)` quota and ignoring `TIME_LIMIT` / MCP usage
- Updated cache compatibility so existing cached percent-based results still render after upgrading
- Refreshed English and Chinese README examples to document international setup and the new token-only display behavior

## 0.5.0

- Changed bar characters from `■□` (discrete squares) to `█░` (continuous blocks) to match Claude Code official statusline style

## 0.4.0

- Added managed Claude Code `SessionStart` hooks to pre-refresh quota on `startup`, `resume`, `clear`, and `compact`
- Added token-aware refresh logic so long sessions can refresh before the cache TTL expires
- Added rate-limit aware cache fallback that skips one token-triggered retry after a limited response
- Improved install and uninstall so unrelated `SessionStart` hooks are preserved while managed hooks are cleaned up
- Highlighted reset time in ANSI palettes for better visibility

## 0.3.0

- Refactored the codebase into clear `cli`, `claude`, `core`, and `shared` layers
- Added optional ANSI themes with `dark` and `mono` palettes
- Added persisted manual overrides for `auth-token` and `base-url`
- Improved `--help` output with command descriptions and examples
- Reworked the README into bilingual project documentation

## 0.2.0

- Removed Codex CLI specific support
- Isolated cache files by API key hash
- Improved support for multiple Coding Plan accounts using different keys

## 0.1.0

- Initial public release
- Added Claude Code status line integration with `install` and `uninstall`
- Added `text`, `compact`, and `bar` styles
- Added `config set` and `config show`
- Added support for `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL`
- Added a 5 minute cache with per-session first refresh
