<div align="center">

<img src="https://capsule-render.vercel.app/api?type=venom&color=0:0d1117,50:1a1a3a,100:6366f1&height=200&section=header&text=MCP%20SCOPE&fontSize=70&fontColor=ffffff&animation=twinkling&stroke=6366f1&strokeWidth=1" width="100%" />

<br />

<h3>DevTools for your MCP servers.</h3>

<p>
  <a href="https://github.com/decksaga/mcp-scope/stargazers"><img src="https://img.shields.io/github/stars/decksaga/mcp-scope?style=for-the-badge&color=6366f1&labelColor=0d1117" /></a>
  <a href="https://github.com/decksaga/mcp-scope/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge&labelColor=0d1117" /></a>
  <img src="https://img.shields.io/badge/MCP-Compatible-6366f1?style=for-the-badge&labelColor=0d1117" />
  <img src="https://img.shields.io/badge/API_Keys-None-ff6b6b?style=for-the-badge&labelColor=0d1117" />
</p>

</div>

<br />

## The problem

You connect 5 MCP servers to Claude. Something breaks. You get zero info — no logs, no errors, no idea which server is slow, broken, or wasting tokens.

MCP Scope fixes that. One command, full visibility.

<br />

## What it does

```
npx mcp-scope --test
```

```
  🔬 MCP Scope — Scan Report
  ──────────────────────────────────────────────────

  OVERVIEW
  ──────────────────────────────────────────────────
  Configs found:    3 (Claude Desktop, Claude Code, Cursor)
  Servers:          4 healthy, 1 failed
  Total tools:      23
  Schema tokens:    ~4,812 (consumed before you type anything)
  Conflicts:        1 ⚠️
  Scan time:        6204ms

  🟢 market-pulse
     Tools:
       • get_price (110 tok) ✅
       • get_stock_price (94 tok) ✅
       • get_market_summary (69 tok) ✅

  🔴 broken-server
     Error: Script not found: /old/path/server.js

  📊 TOKEN BUDGET
  ──────────────────────────────────────────────────
    browser-tools             ████████████░░░░░░░░  2,340 tok (49%)
    market-pulse              ███░░░░░░░░░░░░░░░░░    651 tok (14%)
    file-system               ██████░░░░░░░░░░░░░░  1,180 tok (25%)
    ...

  ⚠️  CONFLICTS
  ──────────────────────────────────────────────────
    "read_file" → file-system, browser-tools

  💡 RECOMMENDATIONS
  ──────────────────────────────────────────────────
    🔴 [broken-server] Server is broken: Script not found
       → Fix the configuration or remove this server.
    🟡 [browser-tools] Heavy schema cost: ~2,340 tokens for 12 tools.
       → Consider if you use all 12. Each unused tool wastes context.
    ✅ [market-pulse] Healthy and efficient. 8 tools, ~651 tokens.
```

<br />

## What it scans

| | Feature | |
|:--|:--------|:--|
| 🔍 | **Auto-discovery** | Finds all your MCP configs: Claude Desktop, Claude Code, Cursor, VS Code, Windsurf |
| 🏥 | **Health check** | Connects to each server, verifies it responds |
| 🧪 | **Tool testing** | Calls each tool with smart params to verify it actually works |
| 📦 | **Token budget** | Shows how many tokens each server consumes just by existing |
| ⚠️ | **Conflict detection** | Finds tools with the same name across servers |
| 💡 | **Recommendations** | Tells you what to fix, remove, or optimize |
| 📊 | **Web dashboard** | Optional visual dashboard at localhost |

<br />

## Setup

```bash
git clone https://github.com/decksaga/mcp-scope.git
cd mcp-scope
npm install
```

<br />

## Usage

```bash
# Quick scan — health + tokens + conflicts
node dist/index.js

# Full scan — also tests every tool
node dist/index.js --test

# Open web dashboard
node dist/index.js --dashboard

# JSON output (for scripting)
node dist/index.js --json
```

<br />

## How tool testing works

MCP Scope doesn't just check if servers respond — it actually calls each tool to verify it works.

It reads the tool's schema (param names, types, descriptions) and infers valid test inputs. A param called `symbol` with description "stock ticker" gets `AAPL`. A param called `from` with description "currency" gets `USD`.

Results are categorized:
- **✅ Passed** — Tool works, returned data
- **🔴 Broken** — Runtime/code error (tool is fundamentally broken)
- **🟡 Input rejected** — Tool works but rejected test input (normal — means validation works)
- **⏭️ Skipped** — Couldn't infer valid params (test manually)
- **⏱️ Timeout** — Tool took too long

No false positives. If it says broken, it's broken.

<br />

## Where it looks for configs

| Client | Path |
|:-------|:-----|
| Claude Desktop | `%APPDATA%/Claude/claude_desktop_config.json` |
| Claude Code | `~/.claude/settings.json` |
| Cursor | `~/.cursor/mcp.json` |
| VS Code | `~/.vscode/mcp.json` |
| Windsurf | `~/.windsurf/mcp.json` |
| Project | `./.mcp.json`, `./.claude/settings.json` |

<br />

## 📁 Structure

```
mcp-scope/
├── src/
│   ├── index.ts       # CLI entry point
│   ├── discovery.ts   # Config file discovery
│   ├── scanner.ts     # Server scanning + tool testing
│   ├── dashboard.ts   # Optional web dashboard
│   └── types.ts       # Shared types
├── dist/              # Ready to run
├── package.json
└── tsconfig.json
```

<br />

## License

MIT — do whatever you want with it.

<br />

<div align="center">

Made by [@decksaga](https://github.com/decksaga)

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0d1117,50:1a1a3a,100:6366f1&height=100&section=footer" width="100%" />

</div>
