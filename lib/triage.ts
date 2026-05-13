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

/**
 * Work class — structural role of an item in the work hierarchy.
 *
 * Modelled on the hot/warm/cold data tier analogy (aging WIP):
 *   - deliverable  → hot: real work item that should have code activity
 *   - planned      → warm: planned but not yet flowing
 *   - container    → structural tracker — no PR ever expected
 *   - placeholder  → cold: backlog with no planning signal at all
 *   - zombie       → frozen: drifting without a structural excuse
 */
export type WorkClass =
  | "deliverable"   // has sprint + assignee + story points → expects a PR
  | "planned"       // has sprint OR story points OR assignee — warm signal
  | "container"     // epic, has subtasks, or title matches phase/milestone pattern
  | "placeholder"   // no sprint, no points, no assignee — pure backlog noise
  | "zombie"        // none of the above — in-progress with no planning signal

/** Reason the work class was assigned — always surfaced in the UI */
export interface WorkClassResult {
  workClass: WorkClass
  reason: string
}

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
  /** Structural role of this item in the work hierarchy */
  workClass: WorkClass
  /** Why this work class was assigned */
  workClassReason: string
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

// ── Work class classifier ─────────────────────────────────────────────────────

/**
 * Title patterns that indicate a container/tracker ticket rather than a
 * deliverable. Order matters — first match wins.
 */
export const CONTAINER_TITLE_PATTERNS: readonly RegExp[] = [
  /\bphase\s*\d+\b/i,           // "Phase 1", "Phase2", "Phase 3 — Foundation"
  /\bphase\s*[a-z]+\b/i,        // "Phase Alpha", "Phase Final"
  /\bmilestone\b/i,             // "Milestone: Go Live"
  /\btracker\b/i,               // "[TRACKER]", "Sprint Tracker"
  /\brollup\b/i,                // "Rollup", "Epic Rollup"
  /\bsign[\s-]?off\b/i,         // "Sign-off", "Sign Off", "Signoff"
  /\bgo[\s-]?live\b/i,          // "Go Live", "Go-Live"
  /\bhandover\b/i,              // "Handover to Ops"
  /\bkick[\s-]?off\b/i,         // "Kickoff", "Kick-off"
  /\b(epic|initiative)\s+track/i, // "Epic Tracking", "Initiative tracker"
  /\[\s*epic\s*\]/i,            // "[Epic]"
  /\bcontainer\b/i,             // explicitly named container
]

/**
 * Determine the structural role (work class) of a Jira work item.
 * GitHub PRs are always deliverables — they are code.
 *
 * Uses rawData fields: issuetype, subtasks, customfield_10007 (sprint),
 * customfield_10005 / customfield_11725 (story points), assignee.
 */
export function classifyWorkClass(item: WorkItem): WorkClassResult {
  if (item.source === "github") {
    return { workClass: "deliverable", reason: "GitHub PR — code artefact" }
  }

  let fields: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(item.rawData ?? "{}") as Record<string, unknown>
    fields = (parsed.fields ?? {}) as Record<string, unknown>
  } catch {
    // malformed rawData — fall through to placeholder
  }

  const issuetype = ((fields.issuetype as Record<string, unknown>)?.name as string ?? "").toLowerCase()
  const subtasks = (fields.subtasks as unknown[]) ?? []
  const hasSubtasks = subtasks.length > 0

  // 1a. Sub-tasks — atomic work units. They don't carry sprint data themselves
  //     (inherited from the parent story), so the planning-signal checks below
  //     would incorrectly classify them as zombie/placeholder.
  //     Rule: in-progress sub-task = deliverable; anything else = planned.
  if (issuetype === "sub-task" || issuetype === "subtask") {
    if (item.status === "in_progress" || item.status === "in_review") {
      return { workClass: "deliverable", reason: "Sub-task actively in progress — tracked under parent story" }
    }
    return { workClass: "planned", reason: "Sub-task — scheduled under parent story" }
  }

  // 1b. Structural containers — issuetype or subtasks
  if (issuetype.includes("epic") || issuetype === "initiative" || issuetype === "feature") {
    return { workClass: "container", reason: `Issue type is ${issuetype}` }
  }
  if (hasSubtasks) {
    return { workClass: "container", reason: `Has ${subtasks.length} subtask${subtasks.length !== 1 ? "s" : ""} — acts as parent` }
  }

  // 2. Title-pattern containers
  const titleForMatch = item.title.replace(/^\[.*?\]\s*/, "") // strip "[DBD-1234]" prefix
  for (const pattern of CONTAINER_TITLE_PATTERNS) {
    if (pattern.test(titleForMatch)) {
      return { workClass: "container", reason: `Title matches container pattern: ${pattern.source}` }
    }
  }

  // 3. Planning signal detection
  const sprintArr = (fields.customfield_10007 as Record<string, unknown>[]) ?? []
  const inSprint = sprintArr.length > 0
  const storyPoints = (fields.customfield_10005 as number | null) ?? (fields.customfield_11725 as number | null) ?? null
  const hasPoints = storyPoints !== null && storyPoints !== undefined
  const hasAssignee = fields.assignee != null

  if (inSprint && hasPoints && hasAssignee) {
    return { workClass: "deliverable", reason: "In sprint, has story points and assignee" }
  }
  if (inSprint && hasPoints) {
    return { workClass: "deliverable", reason: "In sprint with story points" }
  }
  if (inSprint || hasPoints || hasAssignee) {
    return { workClass: "planned", reason: `Warm signal: ${[inSprint && "in sprint", hasPoints && `${storyPoints} pts`, hasAssignee && "assigned"].filter(Boolean).join(", ")}` }
  }

  // 4. In-progress with no planning signal → zombie
  if (item.status === "in_progress" || item.status === "in_review") {
    return { workClass: "zombie", reason: "In progress but no sprint, story points, or assignee" }
  }

  return { workClass: "placeholder", reason: "No sprint, story points, or assignee — backlog noise" }
}

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

  const { workClass, reason: workClassReason } = classifyWorkClass(item)

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
    workClass,
    workClassReason,
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
