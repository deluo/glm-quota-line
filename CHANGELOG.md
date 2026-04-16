# Changelog

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
