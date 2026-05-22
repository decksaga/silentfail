export interface McpServerConfig {
    command: string;
    args?: string[];
    env?: Record<string, string>;
}
export interface McpConfigFile {
    mcpServers?: Record<string, McpServerConfig>;
}
export interface ConfigSource {
    name: string;
    path: string;
    servers: Record<string, McpServerConfig>;
}
export interface ToolInfo {
    name: string;
    description: string;
    schemaTokens: number;
    inputSchema: unknown;
}
export interface ToolTestResult {
    toolName: string;
    status: "ok" | "error" | "input_error" | "skipped" | "timeout";
    responseMs: number;
    error?: string;
    detail?: string;
}
export interface ServerScanResult {
    name: string;
    source: string;
    config: McpServerConfig;
    status: "ok" | "error" | "timeout";
    error?: string;
    responseTimeMs: number;
    tools: ToolInfo[];
    totalSchemaTokens: number;
    toolTests?: ToolTestResult[];
}
export interface ConflictInfo {
    toolName: string;
    servers: string[];
}
export interface Recommendation {
    type: "ok" | "info" | "warning" | "critical";
    server: string;
    message: string;
    action: string;
}
export type SecuritySeverity = "critical" | "high" | "medium" | "low";
export type SecurityCategory = "prompt_injection" | "exfiltration" | "sensitive_env" | "dangerous_command" | "encoded_payload" | "suspicious_schema";
export interface SecurityFinding {
    severity: SecuritySeverity;
    category: SecurityCategory;
    server: string;
    tool?: string;
    message: string;
    evidence: string;
    recommendation: string;
}
export interface SecurityReport {
    findings: SecurityFinding[];
    scannedServers: number;
    scannedTools: number;
    riskLevel: "clean" | "low" | "medium" | "high" | "critical";
}
export interface ScanReport {
    timestamp: string;
    configSources: ConfigSource[];
    servers: ServerScanResult[];
    conflicts: ConflictInfo[];
    recommendations: Recommendation[];
    totalTools: number;
    totalSchemaTokens: number;
    scanDurationMs: number;
    security?: SecurityReport;
}
