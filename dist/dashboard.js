// ─── Web Dashboard ───
// Starts a local HTTP server and serves a single-page dashboard
// with the scan results. Opens automatically in your default browser.
import { createServer } from "node:http";
import { exec } from "node:child_process";
function generateHTML(report) {
    const okServers = report.servers.filter(s => s.status === "ok");
    const failedServers = report.servers.filter(s => s.status !== "ok");
    // ─── Server cards ───
    const serverCards = report.servers.map((s, idx) => {
        const statusColor = s.status === "ok" ? "var(--green)" : s.status === "timeout" ? "var(--amber)" : "var(--red)";
        const statusLabel = s.status.toUpperCase();
        const toolRows = s.tools.map(t => {
            const test = s.toolTests?.find(tt => tt.toolName === t.name);
            let badge = "";
            if (test) {
                const map = {
                    ok: ["passed", "badge-green"],
                    error: ["broken", "badge-red"],
                    input_error: ["rejected", "badge-amber"],
                    skipped: ["skipped", "badge-muted"],
                    timeout: ["timeout", "badge-red"],
                };
                const [label, cls] = map[test.status] ?? ["", ""];
                badge = label ? `<span class="badge ${cls}" data-i18n="test_${test.status}">${label}</span>` : "";
            }
            return `<div class="tool-row">
        <div class="tool-name-wrap">
          <svg class="tool-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          <span class="tool-name">${t.name}</span>
        </div>
        <div class="tool-right">${badge}<span class="tool-cost">${t.schemaTokens}<span class="tok-label"> tok</span></span></div>
      </div>`;
        }).join("");
        const toolSection = s.tools.length > 0 ? `
      <div class="tool-list">
        <div class="tool-list-header">
          <span data-i18n="tool">Tool</span>
          <span data-i18n="cost">Cost</span>
        </div>
        ${toolRows}
      </div>` : `<div class="no-tools">${s.error ?? "No tools found"}</div>`;
        const statusSvg = s.status === "ok"
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="status-icon si-ok"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>'
            : s.status === "timeout"
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="status-icon si-amber"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="status-icon si-red"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>';
        return `
      <div class="card server-card" style="--delay: ${idx * 60}ms">
        <div class="server-top">
          <div class="server-id">
            ${statusSvg}
            <div>
              <h3 class="server-name">${s.name}</h3>
              <span class="server-source">${s.source}</span>
            </div>
          </div>
          <span class="badge" style="--badge-color: ${statusColor}">${statusLabel}</span>
        </div>

        <div class="server-stats-row">
          <div class="mini-stat"><span class="mini-val">${s.responseTimeMs}</span><span class="mini-unit">ms</span></div>
          <div class="mini-stat"><span class="mini-val">${s.tools.length}</span><span class="mini-unit" data-i18n="tools_label">tools</span></div>
          <div class="mini-stat"><span class="mini-val">~${s.totalSchemaTokens.toLocaleString()}</span><span class="mini-unit">tokens</span></div>
        </div>

        <div class="cmd-bar"><code>${s.config.command} ${(s.config.args ?? []).join(" ")}</code></div>

        ${toolSection}
      </div>`;
    }).join("");
    // ─── Conflicts ───
    const conflictRows = report.conflicts.map(c => `
    <div class="conflict-row">
      <code class="conflict-name">${c.toolName}</code>
      <span class="conflict-servers">${c.servers.join(" → ")}</span>
    </div>`).join("");
    // ─── Token budget ───
    const maxTokens = Math.max(...report.servers.filter(s => s.status === "ok").map(s => s.totalSchemaTokens), 1);
    const budgetRows = report.servers
        .filter(s => s.status === "ok" && s.totalSchemaTokens > 0)
        .sort((a, b) => b.totalSchemaTokens - a.totalSchemaTokens)
        .map(s => {
        const pct = report.totalSchemaTokens > 0 ? Math.round((s.totalSchemaTokens / report.totalSchemaTokens) * 100) : 0;
        const width = Math.round((s.totalSchemaTokens / maxTokens) * 100);
        return `
        <div class="budget-row">
          <span class="budget-name">${s.name}</span>
          <div class="budget-track"><div class="budget-fill" style="width: ${width}%"></div></div>
          <span class="budget-val">${s.totalSchemaTokens.toLocaleString()} <span class="dimmed">(${pct}%)</span></span>
        </div>`;
    }).join("");
    // ─── Recommendations ───
    const recRows = report.recommendations.map(r => {
        const cls = { critical: "rec-critical", warning: "rec-warning", info: "rec-info", ok: "rec-ok" }[r.type];
        const icon = { critical: "alert-circle", warning: "alert-triangle", info: "info", ok: "check-circle" }[r.type];
        const svgMap = {
            "alert-circle": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
            "alert-triangle": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            "info": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
            "check-circle": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>',
        };
        return `
      <div class="rec-row ${cls}">
        <div class="rec-icon">${svgMap[icon]}</div>
        <div class="rec-body">
          <span class="rec-server">${r.server}</span>
          <p class="rec-msg">${r.message}</p>
          ${r.action ? `<p class="rec-action">${r.action}</p>` : ""}
        </div>
      </div>`;
    }).join("");
    const scanDate = report.timestamp.split("T")[0];
    const scanTime = report.timestamp.split("T")[1]?.split(".")[0] ?? "";
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="SilentFail — MCP server diagnostics dashboard">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔬</text></svg>">
<title>SilentFail — Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #09090b;
    --surface: #111113;
    --surface-2: #18181b;
    --border: rgba(255,255,255,0.06);
    --border-hover: rgba(255,255,255,0.1);
    --text: #fafafa;
    --text-2: #a1a1aa;
    --text-3: #52525b;
    --red: #f87171;
    --green: #6ee7b7;
    --amber: #fbbf24;
    --accent: #f87171;
    --accent-dim: rgba(248,113,113,0.12);
    --radius: 12px;
    --radius-sm: 8px;
    --mono: 'JetBrains Mono', ui-monospace, monospace;
    --sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  html { scroll-behavior: smooth; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  /* ─── Nav ─── */
  .nav {
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgba(9,9,11,0.85);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    border-bottom: 1px solid var(--border);
    padding: 0 48px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .nav-left { display: flex; align-items: center; gap: 16px; }

  .logo-mark {
    width: 32px; height: 32px;
    background: linear-gradient(135deg, var(--red), #ef4444);
    border-radius: 8px;
    display: grid; place-items: center;
    font-size: 16px;
    box-shadow: 0 0 20px rgba(248,113,113,0.2);
  }

  .logo-text {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.3px;
  }

  .logo-text span { color: var(--red); }

  .nav-right { display: flex; align-items: center; gap: 20px; }

  .scan-meta {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text-3);
  }

  .lang-toggle {
    display: flex;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .lang-btn {
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 500;
    font-family: var(--sans);
    border: none;
    background: transparent;
    color: var(--text-3);
    cursor: pointer;
    transition: all 0.2s ease;
    letter-spacing: 0.3px;
  }

  .lang-btn:hover { color: var(--text-2); }
  .lang-btn.active {
    background: var(--accent-dim);
    color: var(--red);
  }

  /* ─── Layout ─── */
  .container {
    max-width: 1120px;
    margin: 0 auto;
    padding: 48px 32px 80px;
  }

  /* ─── Hero Stats ─── */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    margin-bottom: 56px;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 28px 24px;
    transition: border-color 0.2s ease;
    position: relative;
    overflow: hidden;
  }

  .stat-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .stat-card:hover { border-color: var(--border-hover); }
  .stat-card:hover::before { opacity: 1; }

  .stat-card:nth-child(1)::before { background: linear-gradient(90deg, transparent, var(--green), transparent); }
  .stat-card:nth-child(2)::before { background: linear-gradient(90deg, transparent, var(--text-2), transparent); }
  .stat-card:nth-child(3)::before { background: linear-gradient(90deg, transparent, var(--red), transparent); }
  .stat-card:nth-child(4)::before { background: linear-gradient(90deg, transparent, var(--amber), transparent); }

  .stat-label {
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: var(--text-3);
    margin-bottom: 12px;
  }

  .stat-number {
    font-family: var(--mono);
    font-size: 36px;
    font-weight: 600;
    letter-spacing: -2px;
    line-height: 1;
  }

  .stat-number .frac { font-size: 20px; color: var(--text-3); letter-spacing: -1px; }
  .stat-number.c-green { color: var(--green); }
  .stat-number.c-red { color: var(--red); }
  .stat-number.c-amber { color: var(--amber); }

  .stat-hint {
    font-size: 12px;
    color: var(--text-3);
    margin-top: 10px;
    font-family: var(--mono);
  }

  /* ─── Sections ─── */
  .section {
    margin-bottom: 56px;
  }

  .section-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .section-head svg {
    width: 20px; height: 20px;
    color: var(--text-3);
  }

  .section-title {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.2px;
  }

  .section-desc {
    font-size: 14px;
    color: var(--text-3);
    margin-bottom: 24px;
    line-height: 1.6;
  }

  /* ─── Cards ─── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    transition: border-color 0.25s ease, box-shadow 0.25s ease;
    animation: fadeUp 0.4s ease both;
    animation-delay: var(--delay, 0ms);
  }

  .card:hover {
    border-color: var(--border-hover);
    box-shadow: 0 4px 24px rgba(0,0,0,0.2);
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ─── Server Cards ─── */
  .server-grid { display: grid; gap: 20px; }

  .server-card { padding: 28px; }

  .server-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
  }

  .server-id {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .status-icon { width: 28px; height: 28px; flex-shrink: 0; }
  .si-ok { color: var(--green); }
  .si-amber { color: var(--amber); }
  .si-red { color: var(--red); }

  .server-name {
    font-size: 17px;
    font-weight: 600;
    letter-spacing: -0.2px;
    color: var(--text);
    margin-bottom: 2px;
  }

  .server-source {
    font-size: 12px;
    color: var(--text-3);
  }

  .badge {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 100px;
    letter-spacing: 0.5px;
    background: color-mix(in srgb, var(--badge-color, var(--text-3)) 12%, transparent);
    color: var(--badge-color, var(--text-3));
    border: 1px solid color-mix(in srgb, var(--badge-color, var(--text-3)) 20%, transparent);
    white-space: nowrap;
  }

  .badge-green { --badge-color: var(--green); }
  .badge-red { --badge-color: var(--red); }
  .badge-amber { --badge-color: var(--amber); }
  .badge-muted { --badge-color: var(--text-3); }

  .server-stats-row {
    display: flex;
    gap: 32px;
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }

  .mini-stat { display: flex; align-items: baseline; gap: 4px; }
  .mini-val { font-family: var(--mono); font-size: 14px; font-weight: 500; color: var(--text); }
  .mini-unit { font-size: 12px; color: var(--text-3); }

  .cmd-bar {
    background: rgba(0,0,0,0.3);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
    margin-bottom: 20px;
    overflow-x: auto;
  }

  .cmd-bar code {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text-3);
    white-space: nowrap;
  }

  .tool-list { border-top: 1px solid var(--border); padding-top: 16px; }

  .tool-list-header {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-3);
    margin-bottom: 10px;
    padding: 0 2px;
  }

  .tool-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 8px;
    border-radius: var(--radius-sm);
    transition: background 0.15s ease;
  }

  .tool-row:hover { background: rgba(255,255,255,0.02); }

  .tool-name-wrap { display: flex; align-items: center; gap: 8px; }
  .tool-icon { width: 14px; height: 14px; color: var(--text-3); flex-shrink: 0; }
  .tool-name { font-family: var(--mono); font-size: 13px; color: var(--text-2); }
  .tool-right { display: flex; align-items: center; gap: 12px; }
  .tool-cost { font-family: var(--mono); font-size: 12px; color: var(--text-3); }
  .tok-label { color: var(--text-3); opacity: 0.6; }

  .no-tools { padding: 16px 0; font-size: 13px; color: var(--text-3); }

  /* ─── Conflicts ─── */
  .conflict-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 18px;
    background: rgba(251,191,36,0.04);
    border: 1px solid rgba(251,191,36,0.1);
    border-radius: var(--radius-sm);
    margin-bottom: 10px;
  }

  .conflict-name { font-family: var(--mono); font-size: 13px; color: var(--amber); }
  .conflict-servers { font-size: 13px; color: var(--text-3); }

  /* ─── Token Budget ─── */
  .budget-row {
    display: grid;
    grid-template-columns: 180px 1fr 160px;
    align-items: center;
    gap: 20px;
    padding: 8px 0;
  }

  .budget-name { font-size: 14px; font-weight: 500; color: var(--text-2); }

  .budget-track {
    height: 6px;
    background: rgba(255,255,255,0.04);
    border-radius: 3px;
    overflow: hidden;
  }

  .budget-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--red), #fb923c);
    border-radius: 3px;
    transition: width 0.6s ease;
  }

  .budget-val {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text-2);
    text-align: right;
  }

  .dimmed { color: var(--text-3); }

  .budget-total {
    display: grid;
    grid-template-columns: 180px 1fr 160px;
    gap: 20px;
    padding-top: 12px;
    margin-top: 8px;
    border-top: 1px solid var(--border);
  }

  .budget-total-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .budget-total-val {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    text-align: right;
  }

  /* ─── Recommendations ─── */
  .rec-row {
    display: flex;
    gap: 14px;
    padding: 16px 20px;
    border-radius: var(--radius-sm);
    margin-bottom: 10px;
    border: 1px solid var(--border);
    align-items: flex-start;
  }

  .rec-critical { border-color: rgba(248,113,113,0.15); background: rgba(248,113,113,0.03); }
  .rec-critical .rec-icon svg { color: var(--red); }
  .rec-warning { border-color: rgba(251,191,36,0.12); background: rgba(251,191,36,0.02); }
  .rec-warning .rec-icon svg { color: var(--amber); }
  .rec-info { border-color: var(--border); background: rgba(255,255,255,0.01); }
  .rec-info .rec-icon svg { color: var(--text-3); }
  .rec-ok { border-color: rgba(110,231,183,0.12); background: rgba(110,231,183,0.02); }
  .rec-ok .rec-icon svg { color: var(--green); }

  .rec-icon svg { width: 18px; height: 18px; flex-shrink: 0; margin-top: 1px; }
  .rec-body { flex: 1; }
  .rec-server { font-family: var(--mono); font-size: 11px; color: var(--text-3); font-weight: 600; }
  .rec-msg { font-size: 14px; color: var(--text-2); margin-top: 2px; line-height: 1.5; }
  .rec-action { font-size: 13px; color: var(--text-3); margin-top: 6px; line-height: 1.5; }

  /* ─── Footer ─── */
  .footer {
    text-align: center;
    padding: 48px 0 40px;
    border-top: 1px solid var(--border);
    margin-top: 16px;
  }

  .footer a {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text-3);
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .footer a:hover { color: var(--red); }

  .footer-sub {
    font-size: 11px;
    color: var(--text-3);
    opacity: 0.5;
    margin-top: 8px;
  }

  /* ─── Responsive ─── */
  @media (max-width: 768px) {
    .nav { padding: 0 20px; }
    .container { padding: 32px 20px 60px; }
    .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .server-stats-row { gap: 16px; flex-wrap: wrap; }
    .budget-row { grid-template-columns: 1fr; gap: 8px; }
    .budget-total { grid-template-columns: 1fr; }
    .scan-meta { display: none; }
  }
</style>
</head>
<body>
  <nav class="nav">
    <div class="nav-left">
      <div class="logo-mark">🔬</div>
      <div class="logo-text">Silent<span>Fail</span></div>
    </div>
    <div class="nav-right">
      <span class="scan-meta">${scanDate} · ${scanTime} · ${report.scanDurationMs.toLocaleString()}ms</span>
      <div class="lang-toggle">
        <button class="lang-btn active" onclick="setLang('en')">EN</button>
        <button class="lang-btn" onclick="setLang('es')">ES</button>
      </div>
    </div>
  </nav>

  <div class="container">
    <!-- Stats -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label" data-i18n="servers">Servers</div>
        <div class="stat-number c-green">${okServers.length}<span class="frac">/ ${report.servers.length}</span></div>
        <div class="stat-hint" data-i18n="stat_servers_hint">${failedServers.length > 0 ? `${failedServers.length} failed` : "all healthy"}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label" data-i18n="total_tools">Total Tools</div>
        <div class="stat-number">${report.totalTools}</div>
        <div class="stat-hint" data-i18n="across_servers">across all servers</div>
      </div>
      <div class="stat-card">
        <div class="stat-label" data-i18n="schema_tokens">Schema Tokens</div>
        <div class="stat-number c-red">${report.totalSchemaTokens > 1000 ? (report.totalSchemaTokens / 1000).toFixed(1) + "k" : report.totalSchemaTokens}</div>
        <div class="stat-hint" data-i18n="before_you_type">consumed before you type</div>
      </div>
      <div class="stat-card">
        <div class="stat-label" data-i18n="conflicts">Conflicts</div>
        <div class="stat-number ${report.conflicts.length > 0 ? "c-amber" : "c-green"}">${report.conflicts.length}</div>
        <div class="stat-hint" data-i18n="stat_conflicts_hint">${report.conflicts.length > 0 ? "name collisions" : "no collisions"}</div>
      </div>
    </div>

    ${report.totalSchemaTokens > 0 ? `
    <!-- Token Budget -->
    <div class="section">
      <div class="section-head">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
        <h2 class="section-title" data-i18n="token_budget">Token Budget</h2>
      </div>
      <p class="section-desc" data-i18n="token_budget_desc">How much of your context window each server consumes just by being connected.</p>
      ${budgetRows}
      <div class="budget-total">
        <span class="budget-total-label">Total</span>
        <div></div>
        <span class="budget-total-val">${report.totalSchemaTokens.toLocaleString()} tok</span>
      </div>
    </div>
    ` : ""}

    ${report.conflicts.length > 0 ? `
    <!-- Conflicts -->
    <div class="section">
      <div class="section-head">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <h2 class="section-title" data-i18n="tool_conflicts">Tool Conflicts</h2>
      </div>
      <p class="section-desc" data-i18n="conflicts_desc">These tool names appear in multiple servers. Claude may call the wrong one.</p>
      ${conflictRows}
    </div>
    ` : ""}

    ${report.recommendations.length > 0 ? `
    <!-- Recommendations -->
    <div class="section">
      <div class="section-head">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4"/><path d="m6.34 6.34 2.83 2.83"/><path d="M2 12h4"/><path d="m14.83 9.17 2.83-2.83"/><path d="M18 12h4"/><circle cx="12" cy="17" r="5"/></svg>
        <h2 class="section-title" data-i18n="recommendations">Recommendations</h2>
      </div>
      <p class="section-desc" data-i18n="recs_desc">Actionable suggestions based on your scan results.</p>
      ${recRows}
    </div>
    ` : ""}

    <!-- Servers -->
    <div class="section">
      <div class="section-head">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
        <h2 class="section-title" data-i18n="servers_detail">Servers</h2>
      </div>
      <p class="section-desc"><span data-i18n="found_configs">Found</span> ${report.configSources.length} config${report.configSources.length !== 1 ? "s" : ""}: ${report.configSources.map(s => s.name).join(", ")}</p>
      <div class="server-grid">
        ${serverCards}
      </div>
    </div>
  </div>

  <div class="footer">
    <a href="https://github.com/decksaga/silentfail">github.com/decksaga/silentfail</a>
    <div class="footer-sub" data-i18n="footer_sub">Stop guessing. Start scanning.</div>
  </div>

  <script>
    const i18n = {
      en: {
        servers: "Servers", total_tools: "Total Tools", schema_tokens: "Schema Tokens",
        conflicts: "Conflicts", token_budget: "Token Budget",
        token_budget_desc: "How much of your context window each server consumes just by being connected.",
        tool_conflicts: "Tool Conflicts",
        conflicts_desc: "These tool names appear in multiple servers. Claude may call the wrong one.",
        recommendations: "Recommendations",
        recs_desc: "Actionable suggestions based on your scan results.",
        servers_detail: "Servers", found_configs: "Found",
        tool: "Tool", cost: "Cost",
        across_servers: "across all servers",
        before_you_type: "consumed before you type",
        stat_servers_hint: "${failedServers.length > 0 ? `${failedServers.length} failed` : "all healthy"}",
        stat_conflicts_hint: "${report.conflicts.length > 0 ? "name collisions" : "no collisions"}",
        tools_label: "tools",
        test_ok: "passed", test_error: "broken", test_input_error: "rejected",
        test_skipped: "skipped", test_timeout: "timeout",
        footer_sub: "Stop guessing. Start scanning."
      },
      es: {
        servers: "Servidores", total_tools: "Herramientas", schema_tokens: "Tokens de Schema",
        conflicts: "Conflictos", token_budget: "Presupuesto de Tokens",
        token_budget_desc: "Cuánto de tu ventana de contexto consume cada servidor solo por estar conectado.",
        tool_conflicts: "Conflictos de Herramientas",
        conflicts_desc: "Estos nombres de herramientas aparecen en múltiples servidores. Claude podría llamar al incorrecto.",
        recommendations: "Recomendaciones",
        recs_desc: "Sugerencias basadas en los resultados del escaneo.",
        servers_detail: "Servidores", found_configs: "Encontrados",
        tool: "Herramienta", cost: "Costo",
        across_servers: "en todos los servidores",
        before_you_type: "consumidos antes de escribir",
        stat_servers_hint: "${failedServers.length > 0 ? `${failedServers.length} fallidos` : "todos sanos"}",
        stat_conflicts_hint: "${report.conflicts.length > 0 ? "colisiones de nombre" : "sin colisiones"}",
        tools_label: "herramientas",
        test_ok: "pasó", test_error: "roto", test_input_error: "rechazado",
        test_skipped: "omitido", test_timeout: "timeout",
        footer_sub: "Deja de adivinar. Empieza a escanear."
      }
    };

    let currentLang = (navigator.language || '').startsWith('es') ? 'es' : 'en';

    function setLang(lang) {
      currentLang = lang;
      document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.trim() === lang.toUpperCase());
      });
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[lang][key]) el.textContent = i18n[lang][key];
      });
      document.documentElement.lang = lang;
    }

    // Auto-detect language on load
    setLang(currentLang);
  </script>
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
            console.log(`\\n  🔬 Dashboard: ${url}\\n`);
            // Open browser
            const cmd = process.platform === "win32" ? "start"
                : process.platform === "darwin" ? "open" : "xdg-open";
            exec(`${cmd} ${url}`);
            resolve(url);
        });
    });
}
//# sourceMappingURL=dashboard.js.map