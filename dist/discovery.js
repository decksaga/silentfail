// ─── Config Discovery ───
// MCP servers are configured in JSON files scattered across your system.
// Each AI client stores them in a different place. This module finds them all.
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
// Standard parser: { "mcpServers": { ... } }
function standardParser(raw) {
    const obj = raw;
    return obj?.mcpServers ?? {};
}
// Claude Code parser: settings.json has { "mcpServers": { ... } } nested
function claudeCodeParser(raw) {
    const obj = raw;
    // Claude Code settings.json stores mcpServers directly
    if (obj?.mcpServers)
        return obj.mcpServers;
    return {};
}
function getConfigLocations() {
    const home = homedir();
    const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    return [
        {
            name: "Claude Desktop",
            paths: [
                join(appData, "Claude", "claude_desktop_config.json"), // Windows
                join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"), // macOS
                join(home, ".config", "claude", "claude_desktop_config.json"), // Linux
            ],
            parser: standardParser,
        },
        {
            name: "Claude Code (user)",
            paths: [
                join(home, ".claude", "settings.json"),
            ],
            parser: claudeCodeParser,
        },
        {
            name: "Cursor",
            paths: [
                join(home, ".cursor", "mcp.json"),
            ],
            parser: standardParser,
        },
        {
            name: "VS Code",
            paths: [
                join(home, ".vscode", "mcp.json"),
            ],
            parser: standardParser,
        },
        {
            name: "Windsurf",
            paths: [
                join(home, ".windsurf", "mcp.json"),
                join(localAppData, "Windsurf", "mcp.json"),
            ],
            parser: standardParser,
        },
    ];
}
// Also scan for project-level .mcp.json files in common locations
function getProjectConfigs() {
    const cwd = process.cwd();
    return [
        {
            name: `Project (${cwd})`,
            paths: [
                join(cwd, ".mcp.json"),
                join(cwd, ".claude", "settings.json"),
            ],
            parser: claudeCodeParser,
        },
    ];
}
export async function discoverConfigs() {
    const locations = [...getConfigLocations(), ...getProjectConfigs()];
    const sources = [];
    for (const loc of locations) {
        for (const filePath of loc.paths) {
            if (!existsSync(filePath))
                continue;
            try {
                const content = await readFile(filePath, "utf-8");
                const parsed = JSON.parse(content);
                const servers = loc.parser(parsed);
                if (Object.keys(servers).length > 0) {
                    sources.push({
                        name: loc.name,
                        path: filePath,
                        servers,
                    });
                }
            }
            catch {
                // Skip unreadable/invalid config files
            }
        }
    }
    return sources;
}
//# sourceMappingURL=discovery.js.map