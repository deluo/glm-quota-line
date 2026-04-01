# Changelog

## 0.2.0

- 移除 Codex CLI (`CODEX_THREAD_ID`) 支持，该环境无法使用智谱 Coding Plan
- 缓存文件改为按 API key 隔离，使用 token 哈希生成独立缓存路径
- 支持多 Coding Plan 用户同时使用不同 API key

## 0.1.0

- Initial public release of `glm-quota-line`
- Added Claude Code status line integration with `install` and `uninstall`
- Added `text`, `compact`, and `bar` styles
- Added `config set` and `config show`
- Added official auth variable compatibility for `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL`
- Added 5 minute lazy refresh with per-session first refresh
