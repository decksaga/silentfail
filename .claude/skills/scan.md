# Skill: scan

When the user asks to scan, analyze, check, or diagnose their MCP servers — or mentions "silentfail" — follow this flow.

## First interaction

If this is the first time in the session, ask (in the user's language):

> "Do you want me to also open the visual web dashboard, or do you prefer results in chat only?"

Remember their choice for the rest of the session.

## Running the scan

```bash
silentfail --test --json
```

If `silentfail` is not found:
```bash
node dist/index.js --test --json
```

## Presenting results

Parse the JSON output and present a clear, organized summary **in the same language the user used**:

1. **Overview** — configs found, healthy/failed servers, total tools, total schema tokens, scan time
2. **Per server** — name, source, status, response time, token cost, tool list with test results
3. **Token budget** — which servers cost the most, percentage breakdown
4. **Conflicts** — tools that exist in multiple servers
5. **Security** — risk level, findings with severity and recommendations
6. **Recommendations** — what to fix, remove, or optimize

Status icons: healthy, failed, timeout, passed, broken, rejected, skipped

## Dashboard

If the user chose the dashboard, also run:
```bash
silentfail --test --dashboard
```

Tell them the URL (usually http://localhost:3777). If they said no, only show chat results. If they later ask for the dashboard, open it then.
