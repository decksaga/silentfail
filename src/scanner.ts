// ─── MCP Server Scanner ───
// Connects to each configured MCP server, lists tools, measures response time,
// estimates token cost, and optionally tests each tool to verify it works.

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import type {
  McpServerConfig,
  ServerScanResult,
  ToolInfo,
  ToolTestResult,
  ConflictInfo,
  ScanReport,
  ConfigSource,
  Recommendation,
} from "./types.js"

// ~4 characters per token for JSON schemas
function estimateTokens(obj: unknown): number {
  const str = JSON.stringify(obj)
  return Math.ceil(str.length / 4)
}

// Validate config before trying to connect
function validateConfig(config: McpServerConfig): string | null {
  if (!config.command) return "No command specified"

  // Check if the script file exists (only for file paths, not package names)
  if (config.args?.length) {
    const scriptPath = config.args[0]
    // Only check existence for paths that look like files (have / or \ or end in .js/.ts/.py)
    // Skip for: npx package names, flags, URLs, bare module names
    const looksLikeFile = scriptPath &&
      !scriptPath.startsWith("-") &&
      (scriptPath.includes("/") || scriptPath.includes("\\") || /\.\w+$/.test(scriptPath))

    if (looksLikeFile && !existsSync(resolve(scriptPath))) {
      return `Script not found: ${scriptPath}`
    }
  }

  return null
}

async function testTool(
  client: Client,
  tool: ToolInfo
): Promise<ToolTestResult> {
  // If we can't build good params, skip the test — don't report false failures
  const params = buildSmartParams(tool)
  if (params === null) {
    return {
      toolName: tool.name,
      status: "skipped",
      responseMs: 0,
      detail: "Could not infer valid test parameters. Manual testing recommended.",
    }
  }

  try {
    const start = Date.now()
    const result = await Promise.race([
      client.callTool({ name: tool.name, arguments: params }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Tool call timeout (8s)")), 8000)
      ),
    ])
    const duration = Date.now() - start

    const content = result as { content?: Array<{ text?: string }>; isError?: boolean }
    const isError = content.isError === true
    const text = content.content?.[0]?.text ?? ""

    if (isError) {
      // Distinguish between "tool works but returned an error for our input"
      // vs "tool is fundamentally broken"
      const isBroken = text.includes("Cannot read") ||
        text.includes("is not a function") ||
        text.includes("ENOENT") ||
        text.includes("MODULE_NOT_FOUND") ||
        text.includes("ECONNREFUSED") ||
        text.includes("is not defined")

      return {
        toolName: tool.name,
        status: isBroken ? "error" : "input_error",
        responseMs: duration,
        error: isBroken ? text.slice(0, 200) : undefined,
        detail: isBroken
          ? "Tool is broken — code/runtime error."
          : `Tool works but rejected test input. This is normal — it means the tool validates its params correctly.`,
      }
    }

    return {
      toolName: tool.name,
      status: "ok",
      responseMs: duration,
      detail: text.length > 0 ? `Returned ${text.length} chars` : "Empty response",
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = msg.includes("timeout")

    return {
      toolName: tool.name,
      status: isTimeout ? "timeout" : "error",
      responseMs: 0,
      error: msg,
      detail: isTimeout ? "Tool took too long to respond." : "Tool crashed or connection lost.",
    }
  }
}

// Smart param builder — uses tool name, description, and schema to infer good test values
function buildSmartParams(tool: ToolInfo): Record<string, unknown> | null {
  const s = tool.inputSchema as {
    properties?: Record<string, { type?: string; default?: unknown; description?: string; enum?: unknown[] }>
    required?: string[]
  }

  // No required params = no-arg tool, safe to call
  if (!s?.properties || !s.required?.length) return {}

  const params: Record<string, unknown> = {}
  const nameLower = tool.name.toLowerCase()
  const descLower = (tool.description ?? "").toLowerCase()

  for (const [key, prop] of Object.entries(s.properties)) {
    if (!s.required.includes(key)) continue

    // If there's a default, use it
    if (prop.default !== undefined) {
      params[key] = prop.default
      continue
    }

    // If there's an enum, use the first value
    if (prop.enum?.length) {
      params[key] = prop.enum[0]
      continue
    }

    const keyLower = key.toLowerCase()
    const propDesc = (prop.description ?? "").toLowerCase()

    if (prop.type === "string") {
      // Context-aware param inference
      if (keyLower.includes("symbol") || keyLower.includes("ticker")) {
        if (nameLower.includes("stock") || descLower.includes("stock") || descLower.includes("etf")) {
          params[key] = "AAPL"
        } else if (nameLower.includes("crypto") || descLower.includes("crypto")) {
          params[key] = "bitcoin"
        } else {
          params[key] = "AAPL" // stocks are more universal
        }
      } else if (keyLower.includes("currency") || keyLower === "from" || keyLower === "base") {
        params[key] = "USD"
      } else if (keyLower === "to" || keyLower === "target" || keyLower === "quote") {
        params[key] = "EUR"
      } else if (keyLower.includes("url") || keyLower.includes("link")) {
        params[key] = "https://example.com"
      } else if (keyLower.includes("path") || keyLower.includes("file")) {
        params[key] = "."
      } else if (keyLower.includes("query") || keyLower.includes("search") || keyLower.includes("q")) {
        params[key] = "test"
      } else if (propDesc.includes("crypto") || propDesc.includes("coin")) {
        params[key] = "bitcoin"
      } else if (propDesc.includes("stock") || propDesc.includes("ticker")) {
        params[key] = "AAPL"
      } else if (propDesc.includes("currency")) {
        params[key] = "USD"
      } else {
        // Can't infer — skip this tool instead of sending garbage
        return null
      }
    } else if (prop.type === "number" || prop.type === "integer") {
      if (keyLower.includes("limit") || keyLower.includes("count") || keyLower.includes("max")) {
        params[key] = 3
      } else if (keyLower.includes("page")) {
        params[key] = 1
      } else {
        params[key] = 1
      }
    } else if (prop.type === "boolean") {
      params[key] = false
    } else {
      // Complex type we can't auto-fill
      return null
    }
  }

  return params
}

function generateRecommendations(servers: ServerScanResult[]): Recommendation[] {
  const recs: Recommendation[] = []

  for (const server of servers) {
    // Failed servers
    if (server.status === "error") {
      recs.push({
        type: "critical",
        server: server.name,
        message: `Server is broken: ${server.error}`,
        action: "Fix the configuration or remove this server to save resources.",
      })
      continue
    }

    if (server.status === "timeout") {
      recs.push({
        type: "warning",
        server: server.name,
        message: "Server took too long to respond.",
        action: "Check if the server process is hanging. Consider increasing timeout or removing if unused.",
      })
      continue
    }

    // Token cost analysis
    const tokensPerTool = server.tools.length > 0
      ? Math.round(server.totalSchemaTokens / server.tools.length)
      : 0

    if (server.totalSchemaTokens > 2000) {
      recs.push({
        type: "warning",
        server: server.name,
        message: `Heavy schema cost: ~${server.totalSchemaTokens.toLocaleString()} tokens (${server.tools.length} tools, ~${tokensPerTool} tok/tool).`,
        action: "Consider if you use all tools. Each unused tool wastes context window space.",
      })
    }

    // Slow response
    if (server.responseTimeMs > 5000) {
      recs.push({
        type: "warning",
        server: server.name,
        message: `Slow startup: ${server.responseTimeMs}ms to connect.`,
        action: "This delays Claude's first response. Check for heavy initialization.",
      })
    }

    // Tool test results
    if (server.toolTests) {
      const broken = server.toolTests.filter(t => t.status === "error")
      const inputErrors = server.toolTests.filter(t => t.status === "input_error")
      const passed = server.toolTests.filter(t => t.status === "ok")
      const skipped = server.toolTests.filter(t => t.status === "skipped")

      if (broken.length > 0 && broken.length === server.toolTests.length) {
        recs.push({
          type: "critical",
          server: server.name,
          message: `All ${broken.length} tools are broken (runtime/code errors).`,
          action: "This server has code errors. Fix the server or remove it.",
        })
      } else if (broken.length > 0) {
        recs.push({
          type: "warning",
          server: server.name,
          message: `${broken.length} tool(s) are broken: ${broken.map(f => f.toolName).join(", ")}`,
          action: "These tools have code/runtime errors and will fail for any input.",
        })
      }

      if (inputErrors.length > 0 && broken.length === 0) {
        recs.push({
          type: "ok",
          server: server.name,
          message: `${passed.length} tools passed, ${inputErrors.length} rejected test input (normal — means validation works).`,
          action: "",
        })
      }

      if (skipped.length > 0) {
        recs.push({
          type: "info",
          server: server.name,
          message: `${skipped.length} tool(s) skipped — couldn't infer test parameters.`,
          action: `Skipped: ${skipped.map(s => s.toolName).join(", ")}. Test manually.`,
        })
      }
    }

    // Single-tool server efficiency
    if (server.tools.length === 1 && server.totalSchemaTokens > 100) {
      recs.push({
        type: "info",
        server: server.name,
        message: "Only 1 tool. Running a full MCP server for a single tool has overhead.",
        action: "Not a problem, but if you have many single-tool servers, consider consolidating.",
      })
    }

    // Server is healthy and efficient
    if (server.status === "ok" && server.totalSchemaTokens < 500 && server.responseTimeMs < 2000) {
      recs.push({
        type: "ok",
        server: server.name,
        message: `Healthy and efficient. ${server.tools.length} tools, ~${server.totalSchemaTokens} tokens, ${server.responseTimeMs}ms.`,
        action: "",
      })
    }
  }

  return recs
}

async function scanServer(
  name: string,
  config: McpServerConfig,
  source: string,
  options: { testTools: boolean; timeoutMs: number }
): Promise<ServerScanResult> {
  const start = Date.now()

  // Validate config first
  const configError = validateConfig(config)
  if (configError) {
    return {
      name, source, config,
      status: "error",
      error: configError,
      responseTimeMs: 0,
      tools: [],
      totalSchemaTokens: 0,
    }
  }

  try {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: config.env ? { ...process.env, ...config.env } as Record<string, string> : undefined,
    })

    const client = new Client({ name: "silentfail", version: "1.0.0" })

    await Promise.race([
      client.connect(transport),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout")), options.timeoutMs)
      ),
    ])

    const { tools: rawTools } = await client.listTools()
    const responseTime = Date.now() - start

    const tools: ToolInfo[] = rawTools.map(t => ({
      name: t.name,
      description: t.description ?? "(no description)",
      inputSchema: t.inputSchema,
      schemaTokens: estimateTokens({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }),
    }))

    const totalSchemaTokens = tools.reduce((sum, t) => sum + t.schemaTokens, 0)

    // Optionally test each tool
    let toolTests: ToolTestResult[] | undefined
    if (options.testTools && tools.length > 0) {
      toolTests = []
      for (const tool of tools) {
        const result = await testTool(client, tool)
        toolTests.push(result)
      }
    }

    try { await client.close() } catch { /* ignore */ }

    return {
      name, source, config,
      status: "ok",
      responseTimeMs: responseTime,
      tools,
      totalSchemaTokens,
      toolTests,
    }
  } catch (err) {
    const responseTime = Date.now() - start
    const message = err instanceof Error ? err.message : String(err)
    const isTimeout = message.includes("timeout") || responseTime >= options.timeoutMs

    return {
      name, source, config,
      status: isTimeout ? "timeout" : "error",
      error: message,
      responseTimeMs: responseTime,
      tools: [],
      totalSchemaTokens: 0,
    }
  }
}

function findConflicts(servers: ServerScanResult[]): ConflictInfo[] {
  const toolMap = new Map<string, string[]>()

  for (const server of servers) {
    for (const tool of server.tools) {
      const existing = toolMap.get(tool.name) ?? []
      existing.push(server.name)
      toolMap.set(tool.name, existing)
    }
  }

  return Array.from(toolMap.entries())
    .filter(([, srvs]) => srvs.length > 1)
    .map(([toolName, srvs]) => ({ toolName, servers: srvs }))
}

export async function runScan(
  sources: ConfigSource[],
  options: { testTools?: boolean; timeoutMs?: number } = {}
): Promise<ScanReport> {
  const start = Date.now()
  const servers: ServerScanResult[] = []
  const testTools = options.testTools ?? false
  const timeoutMs = options.timeoutMs ?? 15000

  // Deduplicate
  const seen = new Set<string>()

  for (const source of sources) {
    for (const [name, config] of Object.entries(source.servers)) {
      const key = `${config.command}:${(config.args ?? []).join(",")}`
      if (seen.has(key)) continue
      seen.add(key)

      process.stdout.write(`  ⏳ ${name}...`)
      const result = await scanServer(name, config, source.name, { testTools, timeoutMs })

      const icon = result.status === "ok" ? "✅" : result.status === "timeout" ? "⏱️" : "❌"
      process.stdout.write(`\r  ${icon} ${name}: `)

      if (result.status === "ok") {
        const tested = result.toolTests
          ? ` (${result.toolTests.filter(t => t.status === "ok").length}/${result.toolTests.length} passed)`
          : ""
        console.log(`${result.tools.length} tools, ${result.responseTimeMs}ms, ~${result.totalSchemaTokens} tok${tested}`)
      } else {
        console.log(result.error ?? result.status)
      }

      servers.push(result)
    }
  }

  const conflicts = findConflicts(servers)
  const recommendations = generateRecommendations(servers)

  return {
    timestamp: new Date().toISOString(),
    configSources: sources,
    servers,
    conflicts,
    recommendations,
    totalTools: servers.reduce((sum, s) => sum + s.tools.length, 0),
    totalSchemaTokens: servers.reduce((sum, s) => sum + s.totalSchemaTokens, 0),
    scanDurationMs: Date.now() - start,
  }
}
