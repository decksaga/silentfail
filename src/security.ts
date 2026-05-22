// ─── Security Scanner ───
// Analyzes MCP server configs and tool schemas for malicious patterns.
// Checks for prompt injection, data exfiltration, suspicious commands,
// sensitive env vars, and encoded payloads hidden in tool descriptions.

import type {
  ServerScanResult,
  SecurityFinding,
  SecurityReport,
  SecuritySeverity,
  SecurityCategory,
} from "./types.js"

// ─── Pattern Definitions ───

const PROMPT_INJECTION_PATTERNS: Array<[RegExp, string]> = [
  [/ignore\s+(all\s+)?previous\s+(instructions|prompts|rules)/i, "Tells the model to ignore previous instructions"],
  [/ignore\s+(the\s+)?(system|user)\s+(prompt|message|instruction)/i, "Attempts to override system/user prompts"],
  [/you\s+are\s+now\s+(a|an|in)\s+/i, "Attempts to redefine the model's identity"],
  [/disregard\s+(all|any|the)\s+(previous|above|prior)/i, "Tells the model to disregard context"],
  [/forget\s+(all|everything|your)\s+(instructions|rules|previous)/i, "Instructs the model to forget rules"],
  [/do\s+not\s+follow\s+(any|the|your)\s+(previous|original|system)/i, "Overrides original instructions"],
  [/new\s+instructions?\s*:/i, "Injects new instructions into the model"],
  [/system\s*:\s*you\s+(are|must|should|will)/i, "Fake system prompt injection"],
  [/\[SYSTEM\]|\[INST\]|\[\/INST\]|<\|system\|>|<\|user\|>/i, "Uses model-specific prompt delimiters"],
  [/act\s+as\s+(if\s+)?(you\s+)?(are|were)\s+/i, "Attempts role hijacking"],
  [/pretend\s+(that\s+)?(you\s+)?(are|have|can)/i, "Social engineering via pretend scenarios"],
  [/output\s+(all|the|your)\s+(instructions|system\s+prompt|rules)/i, "Attempts to leak system prompt"],
  [/repeat\s+(back|the)\s+(system|initial|original)\s+(prompt|instructions)/i, "Tries to extract system prompt"],
]

const EXFILTRATION_PATTERNS: Array<[RegExp, string]> = [
  [/https?:\/\/[^\s"']+\.(ru|cn|tk|ml|ga|cf|pw|top|buzz|xyz\/[a-z]{20,})/i, "Suspicious TLD commonly used for phishing"],
  [/curl\s+.*-X?\s*POST/i, "Sends data via curl POST"],
  [/wget\s+.*--post/i, "Sends data via wget POST"],
  [/fetch\s*\(\s*['"][^'"]*['"]\s*,\s*\{[^}]*method\s*:\s*['"]POST/i, "JavaScript fetch POST to external URL"],
  [/send\s+(all\s+)?(the\s+)?(data|content|response|output|result)\s+to\s+/i, "Instructs sending data to external destination"],
  [/forward\s+(all\s+)?(data|messages?|conversation)/i, "Attempts to forward conversation data"],
  [/upload\s+(to|the\s+file|data|content)\s+/i, "Attempts data upload"],
  [/exfiltrat/i, "Contains exfiltration-related term"],
  [/webhook\.site|requestbin|pipedream\.net|ngrok\.io|burpcollaborator/i, "Known data collection/interception service"],
  [/base64\s*encode.*send|send.*base64\s*encod/i, "Encodes data before sending (evasion technique)"],
]

const DANGEROUS_COMMAND_PATTERNS: Array<[RegExp, string]> = [
  [/\brm\s+-rf\s+[\/~]/i, "Recursive file deletion from root or home"],
  [/\beval\s*\(/i, "Dynamic code execution via eval()"],
  [/child_process|spawn\s*\(|exec\s*\(/i, "Spawns child processes"],
  [/process\.env/i, "Accesses environment variables at runtime"],
  [/\.ssh\b|authorized_keys|id_rsa/i, "Accesses SSH keys/config"],
  [/\/etc\/passwd|\/etc\/shadow/i, "Accesses system credential files"],
  [/crypto\..*key|private.?key|secret.?key/i, "References cryptographic/secret keys"],
  [/\bchmod\s+777\b/i, "Sets world-writable permissions"],
  [/\bkill\s+-9\b/i, "Force-kills processes"],
  [/>\s*\/dev\/tcp\//i, "Bash reverse shell pattern"],
  [/nc\s+-[elp]|ncat\s+-/i, "Netcat connection (potential reverse shell)"],
]

const SENSITIVE_ENV_PATTERNS: Array<[RegExp, string]> = [
  [/^(AWS_SECRET|AWS_ACCESS_KEY|AWS_SESSION_TOKEN)/i, "AWS credentials"],
  [/^(GITHUB_TOKEN|GH_TOKEN|GITHUB_PAT)/i, "GitHub authentication token"],
  [/^(OPENAI_API_KEY|ANTHROPIC_API_KEY|CLAUDE_API_KEY)/i, "AI provider API key"],
  [/^(DATABASE_URL|DB_PASSWORD|MONGO_URI|REDIS_URL)/i, "Database credentials"],
  [/^(STRIPE_SECRET|STRIPE_KEY|PAYPAL_SECRET)/i, "Payment provider credentials"],
  [/^(PRIVATE_KEY|SECRET_KEY|MASTER_KEY|ENCRYPTION_KEY)/i, "Cryptographic secrets"],
  [/^(SLACK_TOKEN|SLACK_WEBHOOK|DISCORD_TOKEN)/i, "Messaging service token"],
  [/^(TWILIO_AUTH|SENDGRID_API_KEY|MAILGUN_KEY)/i, "Communication service credentials"],
  [/^(GCP_SERVICE_ACCOUNT|GOOGLE_APPLICATION_CREDENTIALS)/i, "GCP credentials"],
  [/^(AZURE_CLIENT_SECRET|AZURE_TENANT)/i, "Azure credentials"],
  [/PASSWORD|PASSWD|_SECRET|_TOKEN|_KEY$/i, "Generic sensitive variable pattern"],
]

const ENCODED_PAYLOAD_PATTERNS: Array<[RegExp, string]> = [
  [/[A-Za-z0-9+\/]{40,}={0,2}/g, "Possible base64 encoded payload (40+ chars)"],
  [/\\x[0-9a-f]{2}(\\x[0-9a-f]{2}){8,}/i, "Hex-encoded byte sequence"],
  [/\\u[0-9a-f]{4}(\\u[0-9a-f]{4}){4,}/i, "Unicode escape sequence chain"],
  [/&#\d{2,3};(&#\d{2,3};){5,}/i, "HTML entity encoded string"],
  [/%[0-9a-f]{2}(%[0-9a-f]{2}){8,}/i, "URL-encoded byte chain"],
]

// ─── Scanner ───

function scanText(
  text: string,
  patterns: Array<[RegExp, string]>,
  category: SecurityCategory,
  severity: SecuritySeverity,
  server: string,
  tool: string | undefined,
  recommendation: string
): SecurityFinding[] {
  const findings: SecurityFinding[] = []

  for (const [pattern, description] of patterns) {
    const match = text.match(pattern)
    if (match) {
      // Avoid duplicate findings for the same pattern in the same context
      const evidence = match[0].slice(0, 120)
      findings.push({
        severity,
        category,
        server,
        tool,
        message: description,
        evidence,
        recommendation,
      })
    }
  }

  return findings
}

function scanToolSchema(server: string, toolName: string, schema: unknown): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  const schemaStr = JSON.stringify(schema ?? {})

  // Check for suspiciously large schemas (potential payload hiding)
  if (schemaStr.length > 10000) {
    findings.push({
      severity: "medium",
      category: "suspicious_schema",
      server,
      tool: toolName,
      message: `Unusually large tool schema (${(schemaStr.length / 1000).toFixed(1)}KB). Could hide malicious instructions.`,
      evidence: `Schema size: ${schemaStr.length} characters`,
      recommendation: "Inspect the full schema manually. Legitimate tools rarely need schemas this large.",
    })
  }

  return findings
}

export function runSecurityScan(servers: ServerScanResult[]): SecurityReport {
  const findings: SecurityFinding[] = []
  let scannedTools = 0

  for (const server of servers) {
    // ─── Check server command & args ───
    const cmdLine = `${server.config.command} ${(server.config.args ?? []).join(" ")}`

    findings.push(...scanText(
      cmdLine, DANGEROUS_COMMAND_PATTERNS, "dangerous_command", "high",
      server.name, undefined,
      "Review the server's startup command. Ensure it comes from a trusted source."
    ))

    // ─── Check environment variables ───
    if (server.config.env) {
      for (const envKey of Object.keys(server.config.env)) {
        for (const [pattern, description] of SENSITIVE_ENV_PATTERNS) {
          if (pattern.test(envKey)) {
            findings.push({
              severity: "medium",
              category: "sensitive_env",
              server: server.name,
              message: `Server requests sensitive env var: ${description}`,
              evidence: envKey,
              recommendation: "Verify this server genuinely needs this credential. Remove if unnecessary.",
            })
            break // One finding per env key
          }
        }
      }
    }

    // ─── Check each tool ───
    for (const tool of server.tools) {
      scannedTools++

      // Combine all text fields for scanning
      const textToScan = [
        tool.name,
        tool.description,
        JSON.stringify(tool.inputSchema ?? {}),
      ].join(" ")

      // Prompt injection
      findings.push(...scanText(
        textToScan, PROMPT_INJECTION_PATTERNS, "prompt_injection", "critical",
        server.name, tool.name,
        "This tool's description may contain prompt injection. Remove or replace this server immediately."
      ))

      // Exfiltration
      findings.push(...scanText(
        textToScan, EXFILTRATION_PATTERNS, "exfiltration", "critical",
        server.name, tool.name,
        "This tool may attempt to exfiltrate data. Inspect the tool's source code and remove if untrusted."
      ))

      // Dangerous commands in descriptions
      findings.push(...scanText(
        textToScan, DANGEROUS_COMMAND_PATTERNS, "dangerous_command", "high",
        server.name, tool.name,
        "Tool description references dangerous operations. Review the server source code."
      ))

      // Encoded payloads
      findings.push(...scanText(
        textToScan, ENCODED_PAYLOAD_PATTERNS, "encoded_payload", "high",
        server.name, tool.name,
        "Tool schema contains encoded data that may hide malicious instructions. Decode and inspect manually."
      ))

      // Schema analysis
      findings.push(...scanToolSchema(server.name, tool.name, tool.inputSchema))
    }
  }

  // Deduplicate findings (same message + server + tool)
  const seen = new Set<string>()
  const uniqueFindings = findings.filter(f => {
    const key = `${f.server}:${f.tool ?? ""}:${f.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Determine overall risk level
  const hasCritical = uniqueFindings.some(f => f.severity === "critical")
  const hasHigh = uniqueFindings.some(f => f.severity === "high")
  const hasMedium = uniqueFindings.some(f => f.severity === "medium")
  const riskLevel = hasCritical ? "critical" : hasHigh ? "high" : hasMedium ? "medium" : uniqueFindings.length > 0 ? "low" : "clean"

  return {
    findings: uniqueFindings.sort((a, b) => {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
      return (order[a.severity] ?? 4) - (order[b.severity] ?? 4)
    }),
    scannedServers: servers.length,
    scannedTools,
    riskLevel,
  }
}
