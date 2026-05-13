/**
 * Pure mapping/inference functions for the Jira sync pipeline.
 * Extracted here so they can be unit tested independently of the Jira API and DB.
 */

import { AREA_KEYWORDS } from "../github/mappers"

export { AREA_KEYWORDS }

// ── Area inference ────────────────────────────────────────────────────────────

/**
 * Infer the internal area name from a Jira issue summary and label list.
 * Reuses the same keyword map as the GitHub mapper.
 */
export function inferAreaFromJira(summary: string, labels: string[]): string {
  const text = [summary, ...labels].join(" ").toLowerCase()
  for (const [area, keywords] of Object.entries(AREA_KEYWORDS)) {
    if (keywords.some((k) => text.includes(k))) return area
  }
  return "platform"
}

// ── Risk level inference ──────────────────────────────────────────────────────

/**
 * Map Jira priority + labels to the internal risk level.
 *
 * Priority mapping:
 *   Highest / High  → high
 *   Medium          → medium
 *   Low / Lowest    → low
 *
 * Labels can also force a level: "high-risk", "breaking-change", "security", "critical".
 */
export function inferRiskLevelFromJira(
  priority: string | null | undefined,
  labels: string[],
): "low" | "medium" | "high" {
  const normalisedLabels = labels.map((l) => l.toLowerCase())
  if (
    normalisedLabels.some((l) =>
      ["high-risk", "breaking-change", "security", "critical"].includes(l),
    )
  ) {
    return "high"
  }

  const p = (priority ?? "").toLowerCase()
  if (p === "highest" || p === "high") return "high"
  if (p === "medium") return "medium"
  return "low"
}

// ── Status mapping ────────────────────────────────────────────────────────────

/**
 * Map a Jira status category key to the internal work item status.
 *
 * Jira status category keys: "new" | "indeterminate" | "done"
 * Jira status names vary by project — we normalise on category key + name.
 */
export function mapJiraStatus(
  statusCategoryKey: string,
  statusName: string,
): string {
  const cat = statusCategoryKey.toLowerCase()
  const name = statusName.toLowerCase()

  if (cat === "done") return "done"

  // Common "in review" status names
  if (
    name.includes("review") ||
    name.includes("in review") ||
    name.includes("code review") ||
    name.includes("pr open")
  ) {
    return "in_review"
  }

  if (cat === "indeterminate" || name.includes("progress") || name.includes("in progress")) {
    return "in_progress"
  }

  // "new" category = not yet started
  return "not_started"
}

// ── Blocker extraction ────────────────────────────────────────────────────────

export interface JiraIssueLink {
  type: { inward: string }
  inwardIssue?: {
    key: string
    fields?: {
      summary?: string
      status?: { statusCategory?: { key?: string } }
    }
  }
}

/**
 * Given the issuelinks array from a Jira issue, return a human-readable
 * blocked reason if any active (non-Done) blocker links exist, or null
 * if the issue is not blocked.
 */
export function extractBlockedReason(issueLinks: JiraIssueLink[]): string | null {
  const blockers = issueLinks.filter((link) => {
    if (link.type.inward !== "is blocked by") return false
    if (!link.inwardIssue) return false
    // Exclude blockers that are already Done
    const cat = link.inwardIssue.fields?.status?.statusCategory?.key ?? ""
    return cat.toLowerCase() !== "done"
  })

  if (blockers.length === 0) return null

  const parts = blockers.map((link) => {
    const key = link.inwardIssue!.key
    const summary = link.inwardIssue!.fields?.summary
    return summary ? `${key}: ${summary}` : key
  })

  return `Blocked by ${parts.join("; ")}`
}
