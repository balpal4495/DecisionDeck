/**
 * Pure mapping/inference functions for the GitHub sync pipeline.
 * Extracted here so they can be unit tested independently of the gh CLI and DB.
 */

export const AREA_KEYWORDS: Record<string, string[]> = {
  auth: ["auth", "login", "session", "password", "oauth", "sso", "identity"],
  billing: ["billing", "payment", "invoice", "subscription", "stripe", "webhook"],
  data: ["database", "migration", "schema", "audit", "log"],
  deployments: ["deploy", "release", "rollback", "ci", "cd", "pipeline"],
  platform: ["platform", "infrastructure", "infra", "permissions", "admin"],
  observability: ["monitoring", "alert", "metric", "trace", "sentry", "datadog"],
  frontend: ["ui", "frontend", "component", "css", "design", "ux"],
}

export function inferArea(title: string, labels: string[]): string {
  const text = [title, ...labels].join(" ").toLowerCase()
  for (const [area, keywords] of Object.entries(AREA_KEYWORDS)) {
    if (keywords.some((k) => text.includes(k))) return area
  }
  return "platform"
}

export function inferRiskLevel(
  labels: string[],
  createdAt: string,
  ageWarningDays = 7,
): "low" | "medium" | "high" {
  const normalised = labels.map((l) => l.toLowerCase())
  if (normalised.some((l) => ["high-risk", "breaking-change", "security", "critical"].includes(l))) {
    return "high"
  }
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  if (ageDays > ageWarningDays) return "medium"
  return "low"
}

export function mapPrStatus(state: "open" | "closed", draft: boolean): string {
  if (state === "closed") return "done"
  if (draft) return "in_progress"
  return "in_review"
}
