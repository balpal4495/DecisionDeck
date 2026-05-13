/**
 * Work item triage classifier.
 *
 * Classifies each work item into a health category using pure heuristics on
 * date gaps, status, assignment, and source metadata — no LLM, no new sync.
 *
 * Council constraints (from Chronicle evidence [4f9001e4]):
 *   - Classification reason is always visible — no silent scoring
 *   - No grouping by assignee — never surfaces individual metrics
 *   - EM is one click from the source — externalUrl always passed through
 *
 * Thresholds are exported constants so they can be read in the UI and are
 * transparent to the EM using the triage output.
 */

import type { WorkItem } from "@/db/schema"

// ── Thresholds ────────────────────────────────────────────────────────────────

export const TRIAGE_THRESHOLDS = {
  /** Updated within this many days → classified as active signal */
  ACTIVE_WINDOW_DAYS: 14,
  /** Not started but created or updated within this many days → genuine backlog */
  QUEUED_WINDOW_DAYS: 45,
  /** No movement for this many days → stale (applies to in-progress items) */
  STALE_DAYS: 60,
  /** Created this many days ago with no updates → probable abandoned */
  ABANDONED_DAYS: 90,
  /** Blocked but no update for this many days → frozen block */
  BLOCKED_FROZEN_DAYS: 30,
} as const

// ── Types ─────────────────────────────────────────────────────────────────────

export type TriageCategory =
  | "active"    // in flight, recently moving — real signal
  | "queued"    // not started, recently touched — genuine backlog
  | "blocked"   // cannot proceed — needs EM attention
  | "stale"     // in progress or not started but no movement
  | "done"      // completed — valid but noise in raw count
  | "abandoned" // created and forgotten — probable noise

export interface TriageResult {
  id: string
  title: string
  area: string
  status: string
  riskLevel: string
  externalId: string | null
  externalUrl: string | null
  source: string
  category: TriageCategory
  /** Specific signal that drove this classification — always shown in the UI */
  signal: string
  /** Days since last update in source system. -1 = unknown */
  daysSinceUpdate: number
  /** Days since created in source system. -1 = unknown */
  daysSinceCreated: number
  hasAssignee: boolean
  blockedReason: string | null
  lastSyncedAt: string | null
}

export interface TriageSummary {
  total: number
  byCategory: Record<TriageCategory, number>
  byArea: Record<string, Record<TriageCategory, number>>
  /** active + blocked — work that is real and moving or stuck */
  signal: number
  /** abandoned + done — items contributing to ticket count but not to real work */
  noise: number
  /** stale — items worth an EM investigation */
  investigate: number
  /** queued — genuine backlog, not yet started */
  backlog: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface SourceDates {
  created: string | null
  updated: string | null
  hasAssignee: boolean
}

/**
 * Extract the source-system dates from rawData.
 * Handles Jira and GitHub field shapes. Returns nulls on any parse failure
 * so that a missing/malformed rawData degrades gracefully to "unknown".
 */
export function extractSourceDates(
  rawData: string | null,
  source: string,
): SourceDates {
  if (!rawData) return { created: null, updated: null, hasAssignee: false }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawData) as Record<string, unknown>
  } catch {
    return { created: null, updated: null, hasAssignee: false }
  }

  if (source === "jira") {
    const fields = (parsed.fields ?? {}) as Record<string, unknown>
    return {
      created: typeof fields.created === "string" ? fields.created : null,
      updated: typeof fields.updated === "string" ? fields.updated : null,
      hasAssignee: fields.assignee != null,
    }
  }

  if (source === "github") {
    return {
      created:
        typeof parsed.created_at === "string" ? parsed.created_at : null,
      updated:
        typeof parsed.updated_at === "string" ? parsed.updated_at : null,
      hasAssignee: parsed.assignee != null,
    }
  }

  return { created: null, updated: null, hasAssignee: false }
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

// ── Classifier ────────────────────────────────────────────────────────────────

/**
 * Classify a single work item.
 *
 * @param item - Work item row from the DB
 * @param now  - Reference date; injectable for deterministic tests
 */
export function classifyWorkItem(
  item: WorkItem,
  now: Date = new Date(),
): TriageResult {
  const { created, updated, hasAssignee } = extractSourceDates(
    item.rawData ?? null,
    item.source,
  )

  const updateDate = updated ? new Date(updated) : null
  const createDate = created ? new Date(created) : null

  const rawDaysSinceUpdate = updateDate ? daysBetween(updateDate, now) : Infinity
  const rawDaysSinceCreated = createDate ? daysBetween(createDate, now) : Infinity

  const daysSinceUpdate = isFinite(rawDaysSinceUpdate) ? rawDaysSinceUpdate : -1
  const daysSinceCreated = isFinite(rawDaysSinceCreated) ? rawDaysSinceCreated : -1

  const t = TRIAGE_THRESHOLDS

  let category: TriageCategory
  let signal: string

  if (item.status === "done") {
    category = "done"
    signal = "Completed — status is done"
  } else if (item.status === "blocked") {
    category = "blocked"
    const age = daysSinceUpdate >= 0 ? daysSinceUpdate : null
    if (age !== null && age > t.BLOCKED_FROZEN_DAYS) {
      signal = `Blocked and frozen — no movement in ${age} days${item.blockedReason ? ` · ${item.blockedReason}` : ""}`
    } else if (item.blockedReason) {
      signal = `Blocked — ${item.blockedReason}`
    } else {
      signal = "Blocked — no reason recorded"
    }
  } else if (item.status === "in_progress" || item.status === "in_review") {
    const label = item.status === "in_review" ? "In review" : "In progress"
    if (daysSinceUpdate >= 0 && daysSinceUpdate <= t.ACTIVE_WINDOW_DAYS) {
      category = "active"
      signal = `${label} — updated ${daysSinceUpdate} day${daysSinceUpdate !== 1 ? "s" : ""} ago`
    } else if (daysSinceUpdate < 0 || daysSinceUpdate > t.STALE_DAYS) {
      category = "stale"
      const ageNote =
        daysSinceUpdate >= 0 ? `no update in ${daysSinceUpdate} days` : "update date unknown"
      signal = `${label} but ${ageNote} — may be abandoned`
    } else {
      category = "active"
      signal = `${label} — last updated ${daysSinceUpdate} days ago`
    }
  } else {
    // not_started
    const neverUpdated =
      daysSinceUpdate < 0 ||
      (daysSinceCreated >= 0 && Math.abs(daysSinceUpdate - daysSinceCreated) < 2)

    const oldEnoughToAbandon =
      daysSinceCreated >= 0 && daysSinceCreated > t.ABANDONED_DAYS && neverUpdated

    if (oldEnoughToAbandon) {
      category = "abandoned"
      signal = `Not started — created ${daysSinceCreated} days ago with no updates`
    } else if (
      (daysSinceUpdate >= 0 && daysSinceUpdate <= t.QUEUED_WINDOW_DAYS) ||
      (daysSinceCreated >= 0 && daysSinceCreated <= t.QUEUED_WINDOW_DAYS)
    ) {
      category = "queued"
      const freshness =
        daysSinceUpdate >= 0 && daysSinceUpdate <= t.QUEUED_WINDOW_DAYS
          ? `updated ${daysSinceUpdate} days ago`
          : `created ${daysSinceCreated} days ago`
      signal = `Not started — ${freshness}`
    } else {
      category = "stale"
      const ageNote =
        daysSinceUpdate >= 0 ? `untouched for ${daysSinceUpdate} days` : "last update unknown"
      signal = `Not started and ${ageNote}`
    }
  }

  return {
    id: item.id,
    title: item.title,
    area: item.area,
    status: item.status,
    riskLevel: item.riskLevel,
    externalId: item.externalId ?? null,
    externalUrl: item.externalUrl ?? null,
    source: item.source,
    category,
    signal,
    daysSinceUpdate,
    daysSinceCreated,
    hasAssignee,
    blockedReason: item.blockedReason ?? null,
    lastSyncedAt: item.lastSyncedAt ?? null,
  }
}

// ── Batch + Summary ───────────────────────────────────────────────────────────

export function triageAll(
  items: WorkItem[],
  now: Date = new Date(),
): TriageResult[] {
  return items.map(item => classifyWorkItem(item, now))
}

export function summariseTriage(results: TriageResult[]): TriageSummary {
  const byCategory: Record<TriageCategory, number> = {
    active: 0,
    queued: 0,
    blocked: 0,
    stale: 0,
    done: 0,
    abandoned: 0,
  }

  const byArea: Record<string, Record<TriageCategory, number>> = {}

  for (const r of results) {
    byCategory[r.category]++
    if (!byArea[r.area]) {
      byArea[r.area] = {
        active: 0,
        queued: 0,
        blocked: 0,
        stale: 0,
        done: 0,
        abandoned: 0,
      }
    }
    byArea[r.area][r.category]++
  }

  return {
    total: results.length,
    byCategory,
    byArea,
    signal: byCategory.active + byCategory.blocked,
    noise: byCategory.abandoned + byCategory.done,
    investigate: byCategory.stale,
    backlog: byCategory.queued,
  }
}
