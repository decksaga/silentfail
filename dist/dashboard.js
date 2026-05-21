// ─── Web Dashboard ───
// Starts a local HTTP server and serves a single-page dashboard
// with the scan results. Opens automatically in your default browser.
import { createServer } from "node:http";
import { exec } from "node:child_process";
function generateHTML(report) {
    const okServers = report.servers.filter(s => s.status === "ok");
    const failedServers = report.servers.filter(s => s.status !== "ok");
    const serverCards = report.servers.map(s => {
        const statusColor = s.status === "ok" ? "#6ee7b7" : s.status === "timeout" ? "#fbbf24" : "#f87171";
        const statusIcon = s.status === "ok" ? "●" : s.status === "timeout" ? "◐" : "○";
        const statusLabel = s.status.toUpperCase();
        const toolRows = s.tools.map(t => {
            const test = s.toolTests?.find(tt => tt.toolName === t.name);
            const testBadge = test ? {
                ok: '<span class="test-badge test-ok">✅ passed</span>',
                error: '<span class="test-badge test-error">🔴 broken</span>',
                input_error: '<span class="test-badge test-warn">🟡 input rejected</span>',
                skipped: '<span class="test-badge test-skip">⏭️ skipped</span>',
                timeout: '<span class="test-badge test-error">⏱️ timeout</span>',
            }[test.status] ?? "" : "";
            return `
        <div class="tool-row">
          <span class="tool-name">${t.name}</span>
          <span class="tool-meta">${testBadge}<span class="tool-tokens">${t.schemaTokens} tok</span></span>
        </div>`;
        }).join("");
        const toolSection = s.tools.length > 0 ? `
      <div class="tool-list">
        <div class="tool-header">
          <span>Tool</span>
          <span>Status / Cost</span>
        </div>
        ${toolRows}
      </div>
    ` : `<div class="no-tools">${s.error ?? "No tools found"}</div>`;
        return `
      <div class="server-card">
        <div class="server-header">
          <div class="server-status" style="color: ${statusColor}">
            <span class="status-dot">${statusIcon}</span>
            <span class="server-name">${s.name}</span>
          </div>
          <span class="status-badge" style="background: ${statusColor}15; color: ${statusColor}; border: 1px solid ${statusColor}30">${statusLabel}</span>
        </div>
        <div class="server-meta">
          <span>Source: ${s.source}</span>
          <span>${s.responseTimeMs}ms</span>
          <span>${s.tools.length} tools</span>
          <span>~${s.totalSchemaTokens.toLocaleString()} tokens</span>
        </div>
        <div class="server-command">${s.config.command} ${(s.config.args ?? []).join(" ")}</div>
        ${toolSection}
      </div>
    `;
    }).join("");
    const conflictSection = report.conflicts.length > 0 ? `
    <div class="section">
      <h2 class="section-title">⚠️ Tool Conflicts</h2>
      <p class="section-desc">These tool names appear in multiple servers. Claude may call the wrong one.</p>
      ${report.conflicts.map(c => `
        <div class="conflict-row">
          <span class="conflict-name">${c.toolName}</span>
          <span class="conflict-servers">${c.servers.join(" · ")}</span>
        </div>
      `).join("")}
    </div>
  ` : "";
    // Token budget breakdown
    const tokenBreakdown = report.servers
        .filter(s => s.status === "ok" && s.totalSchemaTokens > 0)
        .sort((a, b) => b.totalSchemaTokens - a.totalSchemaTokens)
        .map(s => {
        const pct = report.totalSchemaTokens > 0
            ? Math.round((s.totalSchemaTokens / report.totalSchemaTokens) * 100)
            : 0;
        return `
        <div class="budget-row">
          <span class="budget-name">${s.name}</span>
          <div class="budget-bar-bg">
            <div class="budget-bar" style="width: ${pct}%"></div>
          </div>
          <span class="budget-value">${s.totalSchemaTokens.toLocaleString()} tok (${pct}%)</span>
        </div>
      `;
    }).join("");
    // Recommendations section
    const recsSection = report.recommendations.length > 0 ? `
    <div class="section">
      <h2 class="section-title">💡 Recommendations</h2>
      <p class="section-desc">Actionable suggestions based on your scan results.</p>
      ${report.recommendations.map(r => {
        const icon = { critical: "🔴", warning: "🟡", info: "💬", ok: "✅" }[r.type];
        const borderColor = { critical: "rgba(248,113,113,0.2)", warning: "rgba(251,191,36,0.15)", info: "rgba(255,255,255,0.06)", ok: "rgba(110,231,183,0.15)" }[r.type];
        const bgColor = { critical: "rgba(248,113,113,0.04)", warning: "rgba(251,191,36,0.03)", info: "rgba(255,255,255,0.02)", ok: "rgba(110,231,183,0.03)" }[r.type];
        return `
          <div class="rec-row" style="background: ${bgColor}; border: 1px solid ${borderColor}">
            <span class="rec-icon">${icon}</span>
            <div class="rec-content">
              <span class="rec-server">[${r.server}]</span> ${r.message}
              ${r.action ? `<div class="rec-action">→ ${r.action}</div>` : ""}
            </div>
          </div>`;
    }).join("")}
    </div>
  ` : "";
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="SilentFail scan results — MCP server diagnostics">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔬</text></svg>">
<title>SilentFail — Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: #06070a;
    color: #e2e8f0;
    font-family: 'Inter', -apple-system, sans-serif;
    min-height: 100vh;
    padding: 0;
  }

  .top-bar {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.05));
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    padding: 20px 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .logo-icon {
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
  }

  .logo-text {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.5px;
  }

  .logo-text span {
    background: linear-gradient(135deg, #6366f1, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .scan-time {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
  }

  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 40px;
  }

  /* ─── Stats Row ─── */
  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 32px;
  }

  .stat-card {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 20px;
  }

  .stat-label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.35);
    margin-bottom: 8px;
  }

  .stat-value {
    font-size: 32px;
    font-weight: 800;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: -1px;
  }

  .stat-value.green { color: #6ee7b7; }
  .stat-value.red { color: #f87171; }
  .stat-value.purple { color: #a78bfa; }
  .stat-value.blue { color: #60a5fa; }

  .stat-sub {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
    margin-top: 4px;
    font-family: 'JetBrains Mono', monospace;
  }

  /* ─── Sections ─── */
  .section {
    margin-bottom: 32px;
  }

  .section-title {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 8px;
    letter-spacing: -0.3px;
  }

  .section-desc {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.4);
    margin-bottom: 16px;
  }

  /* ─── Server Cards ─── */
  .server-grid {
    display: grid;
    gap: 16px;
  }

  .server-card {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    padding: 20px;
    transition: border-color 0.2s;
  }

  .server-card:hover {
    border-color: rgba(255, 255, 255, 0.12);
  }

  .server-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .server-status {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-dot { font-size: 14px; }

  .server-name {
    font-size: 16px;
    font-weight: 700;
    color: #fff;
  }

  .status-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 100px;
    letter-spacing: 0.5px;
  }

  .server-meta {
    display: flex;
    gap: 16px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.35);
    margin-bottom: 8px;
  }

  .server-command {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.2);
    background: rgba(0, 0, 0, 0.3);
    padding: 6px 10px;
    border-radius: 6px;
    margin-bottom: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tool-list {
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    padding-top: 12px;
  }

  .tool-header {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.25);
    margin-bottom: 8px;
    padding: 0 4px;
  }

  .tool-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 4px;
    border-radius: 4px;
  }

  .tool-row:hover {
    background: rgba(255, 255, 255, 0.02);
  }

  .tool-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: #a78bfa;
  }

  .tool-tokens {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
  }

  .tool-meta {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .test-badge {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 100px;
    white-space: nowrap;
  }

  .test-ok { background: rgba(110, 231, 183, 0.1); color: #6ee7b7; }
  .test-error { background: rgba(248, 113, 113, 0.1); color: #f87171; }
  .test-warn { background: rgba(251, 191, 36, 0.1); color: #fbbf24; }
  .test-skip { background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.4); }

  .no-tools {
    padding: 12px 0;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.25);
    font-style: italic;
  }

  /* ─── Conflicts ─── */
  .conflict-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    background: rgba(251, 191, 36, 0.04);
    border: 1px solid rgba(251, 191, 36, 0.1);
    border-radius: 8px;
    margin-bottom: 8px;
  }

  .conflict-name {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    color: #fbbf24;
    font-weight: 600;
  }

  .conflict-servers {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
  }

  /* ─── Token Budget ─── */
  .budget-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 10px;
  }

  .budget-name {
    font-size: 13px;
    font-weight: 500;
    min-width: 160px;
    color: rgba(255, 255, 255, 0.7);
  }

  .budget-bar-bg {
    flex: 1;
    height: 8px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 4px;
    overflow: hidden;
  }

  .budget-bar {
    height: 100%;
    background: linear-gradient(90deg, #6366f1, #a78bfa);
    border-radius: 4px;
    min-width: 2px;
  }

  .budget-value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
    min-width: 140px;
    text-align: right;
  }

  /* ─── Footer ─── */
  .footer {
    text-align: center;
    padding: 40px 0;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.15);
    font-family: 'JetBrains Mono', monospace;
  }

  .footer a {
    color: rgba(255, 255, 255, 0.3);
    text-decoration: none;
  }

  .footer a:hover { color: #a78bfa; }

  /* ─── Recommendations ─── */
  .rec-row {
    display: flex;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 8px;
    align-items: flex-start;
  }

  .rec-icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }

  .rec-content {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.7);
    line-height: 1.5;
  }

  .rec-server {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    font-weight: 600;
  }

  .rec-action {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    margin-top: 4px;
  }
</style>
</head>
<body>
  <div class="top-bar">
    <div class="logo">
      <div class="logo-icon">🔬</div>
      <div class="logo-text"><span>SilentFail</span></div>
    </div>
    <div class="scan-time">Scanned ${report.timestamp.split("T")[0]} · ${report.scanDurationMs.toLocaleString()}ms</div>
  </div>

  <div class="container">
    <div class="stats">
      <div class="stat-card">
        <div class="stat-label">Servers</div>
        <div class="stat-value green">${okServers.length}<span style="font-size: 18px; color: rgba(255,255,255,0.3)">/${report.servers.length}</span></div>
        <div class="stat-sub">${failedServers.length > 0 ? `${failedServers.length} failed` : "all healthy"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Tools</div>
        <div class="stat-value purple">${report.totalTools}</div>
        <div class="stat-sub">across all servers</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Schema Tokens</div>
        <div class="stat-value blue">${(report.totalSchemaTokens / 1000).toFixed(1)}k</div>
        <div class="stat-sub">consumed before you type</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Conflicts</div>
        <div class="stat-value ${report.conflicts.length > 0 ? "red" : "green"}">${report.conflicts.length}</div>
        <div class="stat-sub">${report.conflicts.length > 0 ? "tools with name collisions" : "no collisions"}</div>
      </div>
    </div>

    ${report.totalSchemaTokens > 0 ? `
    <div class="section">
      <h2 class="section-title">📊 Token Budget</h2>
      <p class="section-desc">How much of your context window each server consumes just by being connected.</p>
      ${tokenBreakdown}
    </div>
    ` : ""}

    ${conflictSection}

    ${recsSection}

    <div class="section">
      <h2 class="section-title">🖥️ Servers</h2>
      <p class="section-desc">Found ${report.configSources.length} config file${report.configSources.length !== 1 ? "s" : ""}: ${report.configSources.map(s => s.name).join(", ")}</p>
      <div class="server-grid">
        ${serverCards}
      </div>
    </div>
  </div>

  <div class="footer">
    <a href="https://github.com/decksaga/silentfail">github.com/decksaga/silentfail</a>
  </div>
</body>
</html>`;
}
export function serveDashboard(report, port = 3777) {
    return new Promise((resolve) => {
        const html = generateHTML(report);
        const server = createServer((req, res) => {
            // Serve JSON API for programmatic access
            if (req.url === "/api/report") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(report, null, 2));
                return;
            }
            // Serve dashboard
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(html);
        });
        server.listen(port, () => {
            const url = `http://localhost:${port}`;
            console.log(`\n  🔬 Dashboard: ${url}\n`);
            // Open browser
            const cmd = process.platform === "win32" ? "start"
                : process.platform === "darwin" ? "open" : "xdg-open";
            exec(`${cmd} ${url}`);
            resolve(url);
        });
    });
}
//# sourceMappingURL=dashboard.js.map