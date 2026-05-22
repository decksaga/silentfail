#!/usr/bin/env node

// ─── SilentFail MCP Server ───
// Claude uses these tools to diagnose MCP servers.
// All scanning modules are lazy-imported to avoid SDK client/server conflicts.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod/v4"
import type { ScanReport } from "./types.js"

// ─── Structured report for Claude to present ───

function buildReport(report: ScanReport): string {
  const sections: string[] = []

  // ── Overview
  const ok = report.servers.filter(s => s.status === "ok")
  const failed = report.servers.filter(s => s.status !== "ok")

  sections.push(`## OVERVIEW
- Configs scanned: ${report.configSources.length} (${report.configSources.map(s => s.name).join(", ")})
- Servers: ${ok.length} healthy${failed.length > 0 ? `, ${failed.length} failed` : ""}
- Total tools: ${report.totalTools}
- Schema tokens: ~${report.totalSchemaTokens.toLocaleString()} (consumed before user types anything)
- Conflicts: ${report.conflicts.length}
- Scan duration: ${report.scanDurationMs}ms`)

  // ── Server details
  const serverLines: string[] = ["## SERVERS"]
  for (const s of report.servers) {
    const icon = s.status === "ok" ? "🟢" : s.status === "timeout" ? "🟡" : "🔴"
    serverLines.push(`\n### ${icon} ${s.name} [${s.status.toUpperCase()}]`)
    serverLines.push(`- Source: ${s.source}`)
    serverLines.push(`- Command: \`${s.config.command} ${(s.config.args ?? []).join(" ")}\``)

    if (s.status !== "ok") {
      serverLines.push(`- Error: ${s.error}`)
      continue
    }

    serverLines.push(`- Response time: ${s.responseTimeMs}ms`)
    serverLines.push(`- Token cost: ~${s.totalSchemaTokens} tokens (${s.tools.length} tools, ~${Math.round(s.totalSchemaTokens / Math.max(s.tools.length, 1))} per tool)`)
    serverLines.push(`- Tools:`)

    for (const tool of s.tools) {
      const test = s.toolTests?.find(t => t.toolName === tool.name)
      let badge = ""
      if (test) {
        const map: Record<string, string> = {
          ok: "✅ passed",
          error: "🔴 BROKEN",
          input_error: "🟡 input rejected (normal — validation works)",
          skipped: "⏭️ skipped (couldn't infer params)",
          timeout: "⏱️ timeout",
        }
        badge = ` → ${map[test.status] ?? test.status}`
        if (test.status === "error" && test.error) badge += `: ${test.error.slice(0, 100)}`
        if (test.status === "ok" && test.detail) badge += ` (${test.detail})`
      }
      serverLines.push(`  - \`${tool.name}\` (${tool.schemaTokens} tok)${badge}`)
    }
  }
  sections.push(serverLines.join("\n"))

  // ── Token budget
  if (ok.length > 0) {
    const budgetLines: string[] = ["## TOKEN BUDGET"]
    const sorted = ok.sort((a, b) => b.totalSchemaTokens - a.totalSchemaTokens)
    for (const s of sorted) {
      const pct = report.totalSchemaTokens > 0
        ? Math.round((s.totalSchemaTokens / report.totalSchemaTokens) * 100)
        : 0
      budgetLines.push(`- ${s.name}: ~${s.totalSchemaTokens} tokens (${pct}%)`)
    }
    budgetLines.push(`- **TOTAL: ~${report.totalSchemaTokens} tokens**`)
    sections.push(budgetLines.join("\n"))
  }

  // ── Conflicts
  if (report.conflicts.length > 0) {
    const conflictLines: string[] = ["## ⚠️ CONFLICTS", "These tools exist in multiple servers — the model might call the wrong one:"]
    for (const c of report.conflicts) {
      conflictLines.push(`- \`${c.toolName}\` → ${c.servers.join(", ")}`)
    }
    sections.push(conflictLines.join("\n"))
  }

  // ── Security
  if (report.security) {
    const sec = report.security
    const riskIcons: Record<string, string> = { clean: "✅", low: "🟢", medium: "🟡", high: "🟠", critical: "🔴" }
    const secLines: string[] = [
      "## 🛡️ SECURITY",
      `- Risk level: ${riskIcons[sec.riskLevel] ?? ""} **${sec.riskLevel.toUpperCase()}**`,
      `- Scanned: ${sec.scannedServers} server(s), ${sec.scannedTools} tool(s)`,
    ]

    if (sec.findings.length === 0) {
      secLines.push("- ✅ No security issues detected.")
    } else {
      secLines.push(`- Found **${sec.findings.length} issue(s)**:`)
      const sevIcon: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "🔵" }
      for (const f of sec.findings) {
        const toolStr = f.tool ? ` → \`${f.tool}\`` : ""
        secLines.push(`\n  ${sevIcon[f.severity]} **[${f.severity.toUpperCase()}]** ${f.server}${toolStr}`)
        secLines.push(`  - ${f.message}`)
        secLines.push(`  - Evidence: \`${f.evidence.slice(0, 80)}\``)
        secLines.push(`  - Recommendation: ${f.recommendation}`)
      }
    }
    sections.push(secLines.join("\n"))
  }

  // ── Recommendations
  if (report.recommendations.length > 0) {
    const recLines: string[] = ["## 💡 RECOMMENDATIONS"]
    const iconMap: Record<string, string> = { critical: "🔴", warning: "🟡", info: "💬", ok: "✅" }
    for (const rec of report.recommendations) {
      recLines.push(`- ${iconMap[rec.type] ?? ""} **[${rec.server}]** ${rec.message}`)
      if (rec.action) recLines.push(`  → ${rec.action}`)
    }
    sections.push(recLines.join("\n"))
  }

  return sections.join("\n\n")
}

// ─── Lazy imports ───

async function lazyDiscover() {
  const { discoverConfigs } = await import("./discovery.js")
  return discoverConfigs()
}

async function lazyScan(sources: Awaited<ReturnType<typeof lazyDiscover>>, testTools: boolean) {
  const { runScan } = await import("./scanner.js")
  return runScan(sources, { testTools })
}

async function lazyDashboard(report: ScanReport) {
  const { serveDashboard } = await import("./dashboard.js")
  return serveDashboard(report)
}

// ─── MCP Server ───

const server = new McpServer({
  name: "silentfail",
  version: "1.0.0",
})

server.tool(
  "scan_mcp_servers",
  `Diagnose all MCP servers configured on this machine.

Discovers configs from Claude Desktop, Claude Code, Cursor, VS Code, and Windsurf. Connects to each server, lists its tools, measures response time, estimates token cost, detects conflicts, runs a security scan (prompt injection, data exfiltration, dangerous commands, sensitive env vars, encoded payloads), and generates recommendations.

IMPORTANT — How to present results to the user:
1. FIRST TIME ONLY: Before showing results, ask the user: "Do you want me to also open the visual web dashboard, or do you prefer results in chat only?" (ask in the same language the user used). Remember their answer — don't ask again in this conversation.
2. ALWAYS present the full report in chat, translated to the language the user wrote in. Do NOT just dump raw data — organize it clearly with sections, emojis, and formatting.
3. If the user wants the dashboard, call open_silentfail_dashboard after presenting the chat report.
4. Highlight critical issues prominently. If everything is healthy, celebrate it.
5. The token budget section is very important — explain that these tokens are consumed BEFORE the user types anything, just by having servers connected.`,
  {
    test_tools: z.boolean().default(true).describe("Call each tool with smart inferred params to verify it actually works. Recommended: true."),
  },
  async ({ test_tools }) => {
    try {
      const sources = await lazyDiscover()

      if (sources.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: "No MCP configurations found on this machine.\n\nChecked: Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, and project-level configs (.mcp.json).\n\nThis means either no MCP clients are installed, or none have servers configured yet.",
          }],
        }
      }

      const origWrite = process.stdout.write
      process.stdout.write = (() => true) as typeof process.stdout.write
      const report = await lazyScan(sources, test_tools)
      process.stdout.write = origWrite

      return {
        content: [{
          type: "text" as const,
          text: buildReport(report),
        }],
      }
    } catch (err) {
      return {
        content: [{
          type: "text" as const,
          text: `Scan failed: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      }
    }
  }
)

server.tool(
  "open_silentfail_dashboard",
  `Open the SilentFail visual web dashboard in the user's browser.

Runs a full scan and serves an interactive dashboard on localhost with:
- Server health cards with status indicators
- Token budget visualization with gradient bars
- Per-tool test results with badges
- Security findings with severity levels
- Recommendations
- Language toggle (English / Español)

Only call this tool if the user explicitly wants the dashboard. Tell the user the URL when it opens.`,
  {
    test_tools: z.boolean().default(true).describe("Also test each tool before showing dashboard"),
  },
  async ({ test_tools }) => {
    try {
      const sources = await lazyDiscover()

      if (sources.length === 0) {
        return {
          content: [{
            type: "text" as const,
            text: "No MCP configurations found. Nothing to show in the dashboard.",
          }],
        }
      }

      const origWrite = process.stdout.write
      process.stdout.write = (() => true) as typeof process.stdout.write
      const report = await lazyScan(sources, test_tools)
      process.stdout.write = origWrite

      const url = await lazyDashboard(report)

      const summary = [
        `Dashboard is live at **${url}**`,
        "",
        `Showing ${report.servers.length} server(s), ${report.totalTools} tool(s), ~${report.totalSchemaTokens.toLocaleString()} schema tokens.`,
        `Security: ${report.security?.riskLevel.toUpperCase() ?? "N/A"}`,
        "",
        "The dashboard has an EN/ES language toggle in the top right.",
        "It will stay open until you stop the process (Ctrl+C in the terminal where the server runs).",
      ].join("\n")

      return {
        content: [{
          type: "text" as const,
          text: summary,
        }],
      }
    } catch (err) {
      return {
        content: [{
          type: "text" as const,
          text: `Dashboard failed: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      }
    }
  }
)

// ─── Start ───

const transport = new StdioServerTransport()
await server.connect(transport)
