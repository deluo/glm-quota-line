# Changelog

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
