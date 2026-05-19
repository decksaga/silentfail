// ─── Config Discovery ───
// MCP servers are configured in JSON files scattered across your system.
// Each AI client stores them in a different place. This module finds them all.

import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { ConfigSource, McpConfigFile, McpServerConfig } from "./types.js"

interface ConfigLocation {
  name: string
  paths: string[]  // Multiple possible paths (Windows/Mac/Linux)
  parser: (raw: unknown) => Record<string, McpServerConfig>
}

// Standard parser: { "mcpServers": { ... } }
function standardParser(raw: unknown): Record<string, McpServerConfig> {
  const obj = raw as McpConfigFile
  return obj?.mcpServers ?? {}
}

// Claude Code parser: settings.json has { "mcpServers": { ... } } nested
function claudeCodeParser(raw: unknown): Record<string, McpServerConfig> {
  const obj = raw as Record<string, unknown>
  // Claude Code settings.json stores mcpServers directly
  if (obj?.mcpServers) return obj.mcpServers as Record<string, McpServerConfig>
  return {}
}

function getConfigLocations(): ConfigLocation[] {
  const home = homedir()
  const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming")
  const localAppData = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local")

  return [
    {
      name: "Claude Desktop",
      paths: [
        join(appData, "Claude", "claude_desktop_config.json"),           // Windows
        join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"), // macOS
        join(home, ".config", "claude", "claude_desktop_config.json"),   // Linux
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
  ]
}

// Also scan for project-level .mcp.json files in common locations
function getProjectConfigs(): ConfigLocation[] {
  const cwd = process.cwd()
  return [
    {
      name: `Project (${cwd})`,
      paths: [
        join(cwd, ".mcp.json"),
        join(cwd, ".claude", "settings.json"),
      ],
      parser: claudeCodeParser,
    },
  ]
}

export async function discoverConfigs(): Promise<ConfigSource[]> {
  const locations = [...getConfigLocations(), ...getProjectConfigs()]
  const sources: ConfigSource[] = []

  for (const loc of locations) {
    for (const filePath of loc.paths) {
      if (!existsSync(filePath)) continue

      try {
        const content = await readFile(filePath, "utf-8")
        const parsed = JSON.parse(content)
        const servers = loc.parser(parsed)

        if (Object.keys(servers).length > 0) {
          sources.push({
            name: loc.name,
            path: filePath,
            servers,
          })
        }
      } catch {
        // Skip unreadable/invalid config files
      }
    }
  }

  return sources
}
