// ─── Config Types ───

export interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export interface McpConfigFile {
  mcpServers?: Record<string, McpServerConfig>
}

export interface ConfigSource {
  name: string
  path: string
  servers: Record<string, McpServerConfig>
}

// ─── Scan Results ───

export interface ToolInfo {
  name: string
  description: string
  schemaTokens: number
  inputSchema: unknown
}

export interface ToolTestResult {
  toolName: string
  status: "ok" | "error" | "input_error" | "skipped" | "timeout"
  responseMs: number
  error?: string
  detail?: string  // Human-readable explanation of the result
}

export interface ServerScanResult {
  name: string
  source: string
  config: McpServerConfig
  status: "ok" | "error" | "timeout"
  error?: string
  responseTimeMs: number
  tools: ToolInfo[]
  totalSchemaTokens: number
  toolTests?: ToolTestResult[]
}

export interface ConflictInfo {
  toolName: string
  servers: string[]
}

export interface Recommendation {
  type: "ok" | "info" | "warning" | "critical"
  server: string
  message: string
  action: string
}

export interface ScanReport {
  timestamp: string
  configSources: ConfigSource[]
  servers: ServerScanResult[]
  conflicts: ConflictInfo[]
  recommendations: Recommendation[]
  totalTools: number
  totalSchemaTokens: number
  scanDurationMs: number
}
