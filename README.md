<div align="center">

<img src="banner.svg" width="100%" alt="SILENTFAIL — Your MCP servers are failing. You just don't know it yet." />

<br /><br />

**Your MCP servers are failing. You just don't know it yet.**

Every tool you connect costs tokens *before you even type*. Broken servers fail silently.
SilentFail finds out — health checks, token audits, security scanning, all in one scan.

<br />

<a href="https://github.com/decksaga/silentfail/stargazers"><img src="https://img.shields.io/github/stars/decksaga/silentfail?style=for-the-badge&color=f87171&labelColor=0d1117" /></a>
<a href="https://github.com/decksaga/silentfail/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge&labelColor=0d1117" /></a>
<img src="https://img.shields.io/badge/TypeScript-blue?style=for-the-badge&labelColor=0d1117&logo=typescript&logoColor=white" />
<img src="https://img.shields.io/badge/Zero_Config-6ee7b7?style=for-the-badge&labelColor=0d1117" />
<img src="https://img.shields.io/badge/Node_%3E%3D18-339933?style=for-the-badge&labelColor=0d1117&logo=nodedotjs&logoColor=white" />

</div>

<br />

---

<br />

## The problem

You connect MCP servers to Claude, Cursor, VS Code. They break — no logs, no warnings, no clue which one is slow, dead, or eating your entire context window.

Every connected server has a **token cost**. Claude reads all tool schemas before your conversation even starts. Five servers with 20+ tools can burn **5,000+ tokens** just sitting there. And if one of those servers has a malicious tool description with a prompt injection? You'd never know.

<br />

## What SilentFail does

| | |
|:--|:--|
| **Discover** | Finds all MCP configs across Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, and project-level files |
| **Connect** | Spawns each server, measures startup time, lists all tools |
| **Test** | Calls each tool with smart inferred parameters to verify it actually works |
| **Audit** | Calculates exact token cost per server and per tool |
| **Detect** | Finds tool name conflicts across servers |
| **Scan** | 50+ security patterns — prompt injection, data exfiltration, dangerous commands, encoded payloads |
| **Report** | Clear, actionable output in CLI, chat, or visual dashboard |

<br />

## Quick start

```bash
git clone https://github.com/decksaga/silentfail.git
cd silentfail
npm install
npm run build
```

SilentFail works in two modes: **MCP Server** (Claude scans itself) or **CLI** (you run it from the terminal).

<br />

---

<br />

## Mode 1: MCP Server (recommended)

Add SilentFail to your Claude Desktop config and let Claude diagnose its own setup.

**`claude_desktop_config.json`**

```json
{
  "mcpServers": {
    "silentfail": {
      "command": "node",
      "args": ["/absolute/path/to/silentfail/dist/server.js"]
    }
  }
}
```

<details>
<summary><strong>Where is this file?</strong></summary>

| OS | Path |
|:---|:-----|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Linux | `~/.config/claude/claude_desktop_config.json` |

</details>

<br />

Then restart Claude Desktop and ask:

> *"Scan my MCP servers"*

Claude calls the scan tool, gets the full diagnostic report, and presents it in whatever language you used. On first use, it asks if you want results in chat or the visual web dashboard. It remembers your preference.

### Tools exposed

| Tool | Description |
|:-----|:------------|
| `scan_mcp_servers` | Full diagnostic: health, tokens, conflicts, security, recommendations. Set `test_tools: true` to verify each tool works. |
| `open_silentfail_dashboard` | Run scan + open interactive web dashboard on `localhost:3777` |

<br />

---

<br />

## Mode 2: CLI

Run it directly from the terminal for quick diagnostics or CI integration.

```bash
silentfail              # Quick health check
silentfail --test       # Full scan + call each tool to verify
silentfail --dashboard  # Open visual web dashboard
silentfail --json       # JSON output for scripts/CI
silentfail --help       # All options
```

To use `silentfail` as a global command:

```bash
npm link
```

### Example output

```
  SilentFail — Scan Report
  ──────────────────────────────────────────────────

  OVERVIEW
  ──────────────────────────────────────────────────
  Configs found:    3 (Claude Desktop, Claude Code, Cursor)
  Servers:          4 healthy, 1 failed
  Total tools:      23
  Schema tokens:    ~4,812 (consumed before you type anything)
  Conflicts:        1
  Scan time:        6204ms

  market-pulse                                    OK
     Response: 412ms
     Tokens:   ~651 (8 tools, ~81 per tool)
     Tools:
       get_price (110 tok) passed
       get_stock_price (94 tok) passed
       get_market_summary (69 tok) passed

  broken-server                                   ERROR
     Error: Script not found: /old/path/server.js

  TOKEN BUDGET
  ──────────────────────────────────────────────────
    browser-tools             ████████████░░░░░░░░  2,340 tok (49%)
    file-system               ██████░░░░░░░░░░░░░░  1,180 tok (25%)
    market-pulse              ███░░░░░░░░░░░░░░░░░    651 tok (14%)

  SECURITY SCAN
  ──────────────────────────────────────────────────
  Risk level: CLEAN
  Scanned: 4 server(s), 23 tool(s)
    No security issues detected.

  RECOMMENDATIONS
  ──────────────────────────────────────────────────
    [broken-server] Server is broken: Script not found.
       Fix the configuration or remove this server.
    [browser-tools] Heavy schema cost: ~2,340 tokens for 12 tools.
       Consider if you use all 12. Each unused tool wastes context.
    [market-pulse] Healthy and efficient. 8 tools, ~651 tokens.
```

<br />

---

<br />

## Smart tool testing

SilentFail doesn't just check if servers respond — **it calls each tool**.

It reads the schema, infers valid test inputs (`AAPL` for stocks, `USD`/`EUR` for forex, `bitcoin` for crypto), calls the tool, and categorizes the result:

| Result | Meaning |
|:-------|:--------|
| **Passed** | Tool works, returned data |
| **Broken** | Runtime error — tool is dead |
| **Rejected** | Tool works but rejected the test input (validation is working correctly) |
| **Skipped** | Couldn't infer safe params — manual test recommended |
| **Timeout** | Took too long to respond |

If it says broken, it's broken. No false positives.

<br />

## Security scanning

Every scan automatically checks all server configs and tool schemas against 50+ patterns:

| Category | Examples |
|:---------|:---------|
| **Prompt injection** | `ignore previous instructions`, fake system prompts, role hijacking, prompt leaking |
| **Data exfiltration** | Suspicious URLs, POST requests, webhook endpoints, base64-encode-then-send |
| **Dangerous commands** | `eval()`, `rm -rf`, reverse shells, `child_process` spawns |
| **Sensitive env vars** | AWS keys, API tokens, database credentials in server configs |
| **Encoded payloads** | Base64, hex, unicode, HTML entities hiding malicious content |

```
  SECURITY SCAN
  ──────────────────────────────────────────────────
  Risk level: CRITICAL
  Scanned: 3 server(s), 15 tool(s)

    [CRITICAL] shady-server -> execute_query
      Tells the model to ignore previous instructions
      Evidence: "ignore all previous instructions and..."
      Remove this server immediately.
```

<br />

## Token budget explained

Every MCP tool you connect has a JSON schema that Claude reads **before your conversation starts**. This is invisible — there's no UI for it, no warning.

SilentFail measures the exact token cost of each server and each tool, so you can see:

- Which servers cost the most context
- Which tools are worth keeping
- Where you're wasting tokens on tools you never use

A clean setup with low token overhead means more context for your actual work.

<br />

## Visual dashboard

Run with `--dashboard` (CLI) or ask Claude to `open_silentfail_dashboard` (MCP mode) to get an interactive web UI:

- Server health cards with status indicators
- Token budget visualization with gradient bars
- Per-tool test results with pass/fail badges
- Security findings with severity levels
- Language toggle (English / Espa&ntilde;ol)

Served on `localhost:3777`. Dark theme. No external dependencies.

<br />

## Supported clients

SilentFail auto-discovers configs from all major MCP clients:

| Client | Config path |
|:-------|:------------|
| Claude Desktop | `%APPDATA%/Claude/claude_desktop_config.json` |
| Claude Code | `~/.claude/settings.json` |
| Cursor | `~/.cursor/mcp.json` |
| VS Code | `~/.vscode/mcp.json` |
| Windsurf | `~/.windsurf/mcp.json` |
| Project-level | `.mcp.json`, `.claude/settings.json` |

<br />

## Architecture

```
  Discovery         Connect          Test Tools        Security          Report
 ┌─────────────┐   ┌──────────────┐  ┌───────────────┐ ┌──────────────┐  ┌──────────────┐
 │ Find configs │──>│ Spawn each   │─>│ Infer params  │>│ 50+ patterns │─>│ CLI output   │
 │ across all   │   │ MCP server   │  │ from schema   │ │ Injection,   │  │ MCP report   │
 │ clients      │   │ via stdio    │  │ Call & verify  │ │ exfil, etc.  │  │ Dashboard    │
 └─────────────┘   └──────────────┘  └───────────────┘ └──────────────┘  └──────────────┘
```

**Key files:**

```
src/
  discovery.ts   — Config auto-detection across all clients
  scanner.ts     — Server connection, tool listing, testing
  security.ts    — Pattern-based security analysis (50+ rules)
  server.ts      — MCP server mode (Claude Desktop integration)
  dashboard.ts   — Web dashboard with i18n (EN/ES)
  index.ts       — CLI entry point
  types.ts       — TypeScript interfaces
```

<br />

## FAQ

<details>
<summary><strong>Does SilentFail scan itself?</strong></summary>

No. When running as an MCP server, SilentFail automatically excludes itself from the scan to avoid recursion.
</details>

<details>
<summary><strong>Is it safe to run tool tests?</strong></summary>

Yes. SilentFail only calls tools with read-only, minimal test inputs (stock tickers, currency codes). It never sends destructive operations. If it can't infer safe params, it skips the tool.
</details>

<details>
<summary><strong>Can I use it in CI?</strong></summary>

Yes. Use `silentfail --test --json` for machine-readable output. Parse the JSON for automated checks.
</details>

<details>
<summary><strong>What Node version do I need?</strong></summary>

Node 18 or higher. Uses ES modules and the MCP SDK.
</details>

<br />

## License

MIT — do whatever you want with it.

<br />

<div align="center">

Built by [@decksaga](https://github.com/decksaga)

*Stop guessing. Start scanning.*

</div>
