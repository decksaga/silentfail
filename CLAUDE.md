# SilentFail

Diagnostic tool for MCP servers. Discovers, tests, audits tokens, and scans for security issues across all major MCP clients.

## Commands

- Build: `npm run build`
- CLI: `node dist/index.js` or `silentfail` (if linked via `npm link`)
- Flags: `--test` (test each tool), `--dashboard` (web UI), `--json` (machine output), `--help`

## Stack

TypeScript, Node.js 18+, ES modules, `@modelcontextprotocol/sdk` (client + server), `zod/v4`

## Modes

1. **MCP Server** (`src/server.ts`) — Claude Desktop calls `scan_mcp_servers` / `open_silentfail_dashboard`
2. **CLI** (`src/index.ts`) — Terminal diagnostic with `--test`, `--dashboard`, `--json`

## Key files

- `src/server.ts` — MCP server (two tools exposed to Claude). Uses lazy imports to avoid SDK client/server conflict.
- `src/index.ts` — CLI entry point
- `src/scanner.ts` — Connects to servers, lists tools, tests them. Self-excludes silentfail to avoid recursion.
- `src/security.ts` — Pattern-based scanner (50+ regex: injection, exfil, dangerous cmds, env vars, encoded payloads)
- `src/discovery.ts` — Finds configs across Claude Desktop, Code, Cursor, VS Code, Windsurf, project-level
- `src/dashboard.ts` — Web dashboard served on localhost with i18n (EN/ES)
- `src/types.ts` — All TypeScript interfaces

## Important

- Server mode uses `zod/v4` (NOT `zod` v3) — v3 silently fails to register tools
- Lazy dynamic imports in `server.ts` prevent MCP Client/Server SDK conflicts
- `process.stdout.write` is suppressed during scan in server mode to avoid corrupting JSON-RPC
- Self-exclusion: scanner skips servers named "silentfail" or with args containing "silentfail/dist/server"

## Skills

- `scan` — Run when user asks to scan/diagnose MCP servers
