#!/usr/bin/env node
// ─── MCP Scope ───
// DevTools for your MCP servers.
//
// Usage:
//   npx mcp-scope              → Scan and show CLI report
//   npx mcp-scope --test       → Also test each tool (calls them)
//   npx mcp-scope --dashboard  → Open web dashboard
//   npx mcp-scope --json       → Output raw JSON
import { discoverConfigs } from "./discovery.js";
import { runScan } from "./scanner.js";
import { serveDashboard } from "./dashboard.js";
const args = process.argv.slice(2);
const wantDashboard = args.includes("--dashboard") || args.includes("-d");
const wantTest = args.includes("--test") || args.includes("-t");
const wantJson = args.includes("--json");
// ─── CLI Report ───
function printReport(report) {
    const line = "─".repeat(50);
    console.log("");
    console.log(`  🔬 MCP Scope — Scan Report`);
    console.log(`  ${line}`);
    console.log("");
    // ─── Overview ───
    const ok = report.servers.filter(s => s.status === "ok").length;
    const failed = report.servers.filter(s => s.status !== "ok").length;
    console.log(`  OVERVIEW`);
    console.log(`  ${line}`);
    console.log(`  Configs found:    ${report.configSources.length} (${report.configSources.map(s => s.name).join(", ")})`);
    console.log(`  Servers:          ${ok} healthy${failed > 0 ? `, ${failed} failed` : ""}`);
    console.log(`  Total tools:      ${report.totalTools}`);
    console.log(`  Schema tokens:    ~${report.totalSchemaTokens.toLocaleString()} (consumed before you type anything)`);
    console.log(`  Conflicts:        ${report.conflicts.length > 0 ? `⚠️  ${report.conflicts.length}` : "0 ✅"}`);
    console.log(`  Scan time:        ${report.scanDurationMs}ms`);
    console.log("");
    // ─── Servers Detail ───
    for (const server of report.servers) {
        const icon = server.status === "ok" ? "🟢" : server.status === "timeout" ? "🟡" : "🔴";
        console.log(`  ${icon} ${server.name}`);
        console.log(`     Source:   ${server.source}`);
        console.log(`     Command:  ${server.config.command} ${(server.config.args ?? []).join(" ")}`);
        if (server.status !== "ok") {
            console.log(`     Error:    ${server.error}`);
            console.log("");
            continue;
        }
        console.log(`     Response: ${server.responseTimeMs}ms`);
        console.log(`     Tokens:   ~${server.totalSchemaTokens} (${server.tools.length} tools, ~${Math.round(server.totalSchemaTokens / Math.max(server.tools.length, 1))} per tool)`);
        console.log(`     Tools:`);
        for (const tool of server.tools) {
            const test = server.toolTests?.find(t => t.toolName === tool.name);
            let testIcon = "";
            if (test) {
                const icons = {
                    ok: " ✅",
                    error: " 🔴 BROKEN",
                    input_error: " 🟡 input rejected (normal)",
                    skipped: " ⏭️  skipped",
                    timeout: " ⏱️  timeout",
                };
                testIcon = icons[test.status] ?? "";
            }
            console.log(`       • ${tool.name} (${tool.schemaTokens} tok)${testIcon}`);
            if (test?.status === "error" && test.error) {
                console.log(`         └─ ${test.error.slice(0, 100)}`);
            }
            if (test?.detail && test.status === "ok") {
                console.log(`         └─ ${test.detail}`);
            }
        }
        console.log("");
    }
    // ─── Conflicts ───
    if (report.conflicts.length > 0) {
        console.log(`  ⚠️  CONFLICTS`);
        console.log(`  ${line}`);
        console.log(`  These tools exist in multiple servers — Claude might call the wrong one:`);
        console.log("");
        for (const c of report.conflicts) {
            console.log(`    "${c.toolName}" → ${c.servers.join(", ")}`);
        }
        console.log("");
    }
    // ─── Token Budget ───
    if (report.servers.filter(s => s.status === "ok").length > 0) {
        console.log(`  📊 TOKEN BUDGET`);
        console.log(`  ${line}`);
        console.log(`  Every connected MCP server costs tokens just by existing.`);
        console.log(`  Claude reads all tool schemas before your conversation starts.`);
        console.log("");
        const sorted = report.servers
            .filter(s => s.status === "ok")
            .sort((a, b) => b.totalSchemaTokens - a.totalSchemaTokens);
        for (const s of sorted) {
            const pct = report.totalSchemaTokens > 0
                ? Math.round((s.totalSchemaTokens / report.totalSchemaTokens) * 100)
                : 0;
            const bar = "█".repeat(Math.max(1, Math.round(pct / 5))) + "░".repeat(20 - Math.max(1, Math.round(pct / 5)));
            console.log(`    ${s.name.padEnd(25)} ${bar} ${String(s.totalSchemaTokens).padStart(6)} tok (${pct}%)`);
        }
        console.log(`    ${"TOTAL".padEnd(25)} ${"".padStart(20, "─")} ${String(report.totalSchemaTokens).padStart(6)} tok`);
        console.log("");
    }
    // ─── Recommendations ───
    if (report.recommendations.length > 0) {
        console.log(`  💡 RECOMMENDATIONS`);
        console.log(`  ${line}`);
        console.log("");
        const iconMap = {
            critical: "🔴",
            warning: "🟡",
            info: "💬",
            ok: "✅",
        };
        for (const rec of report.recommendations) {
            console.log(`    ${iconMap[rec.type]} [${rec.server}] ${rec.message}`);
            if (rec.action) {
                console.log(`       → ${rec.action}`);
            }
        }
        console.log("");
    }
}
// ─── Main ───
console.log("");
console.log("  🔬 MCP Scope");
console.log("");
// Step 1: Discover
console.log("  📂 Discovering configs...");
const sources = await discoverConfigs();
if (sources.length === 0) {
    console.log("  ⚠️  No MCP configurations found.");
    console.log("     Checked: Claude Desktop, Claude Code, Cursor, VS Code, Windsurf");
    console.log("");
    process.exit(0);
}
const totalServers = sources.reduce((sum, s) => sum + Object.keys(s.servers).length, 0);
console.log(`  ✅ Found ${sources.length} config(s) with ${totalServers} server(s)`);
console.log("");
// Step 2: Scan
console.log(`  🔍 Scanning${wantTest ? " + testing tools" : ""}...`);
const report = await runScan(sources, { testTools: wantTest });
// Step 3: Output
if (wantJson) {
    console.log(JSON.stringify(report, null, 2));
}
else {
    printReport(report);
}
// Step 4: Dashboard (optional)
if (wantDashboard) {
    await serveDashboard(report);
    console.log("  Press Ctrl+C to stop.");
    console.log("");
}
else {
    process.exit(0);
}
//# sourceMappingURL=index.js.map