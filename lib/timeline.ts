/**
 * Timeline — delivery flow data model.
 *
 * Each row is a Jira ticket. Events are plotted along a time axis:
 *
 *   jira_created  → pr_opened  → pr_review  → pr_merged  → jira_closed
 *
 * Exceptions are derived from the event sequence and surfaced as
 * coloured annotations on each row:
 *
 *   no_pr            — ticket in progress but no PR seen
 *   stale_pr         — PR open for more than STALE_PR_DAYS
 *   merged_not_closed — PR merged but Jira ticket still open
 *   long_review      — PR waiting for review for more than REVIEW_DAYS
 *
 * We can only reconstruct events we have timestamps for. Jira changelog
 * transitions (exact "moved to In Progress" time) require the changelog API
 * and are not in rawData — we omit those rather than fabricate them.
 */

import type { WorkItem } from "@/db/schema"
import { extractJiraKey } from "@/lib/pulse"

// ── Constants ────────────────────────────────────────────────────────────────

const STALE_PR_DAYS   = 14
const REVIEW_DAYS     = 3
const NO_PR_DAYS      = 3   // in-progress tickets without a PR after this many days

// ── Event types ──────────────────────────────────────────────────────────────

export type EventType =
  | "jira_created"
  | "pr_opened"
  | "pr_review"      // proxy: review_requested_at or PR updated after opened
  | "pr_merged"
  | "pr_closed"      // closed without merging
  | "jira_closed"    // ticket reached "done" state (updatedAt approximation)

// Colours per event type — [r, g, b, a] 0-255 for deck.gl
export const EVENT_COLOR: Record<EventType, [number, number, number, number]> = {
  jira_created: [107, 114, 142, 220],   // muted grey-blue
  pr_opened:    [109, 123, 255, 240],   // accent blue
  pr_review:    [255, 179, 71,  240],   // amber — pending action
  pr_merged:    [92,  184, 92,  240],   // green — done
  pr_closed:    [255, 95,  109, 200],   // red — closed without merge
  jira_closed:  [92,  184, 92,  180],   // soft green
}

export const EVENT_LABEL: Record<EventType, string> = {
  jira_created: "Ticket created",
  pr_opened:    "PR opened",
  pr_review:    "Review requested",
  pr_merged:    "PR merged",
  pr_closed:    "PR closed (no merge)",
  jira_closed:  "Ticket closed",
}

export const EVENT_RADIUS: Record<EventType, number> = {
  jira_created: 5,
  pr_opened:    7,
  pr_review:    6,
  pr_merged:    8,
  pr_closed:    7,
  jira_closed:  6,
}

// ── Exception types ──────────────────────────────────────────────────────────

export type ExceptionType =
  | "no_pr"
  | "stale_pr"
  | "merged_not_closed"
  | "long_review"

export const EXCEPTION_COLOR: Record<ExceptionType, [number, number, number, number]> = {
  no_pr:             [255, 95,  109, 180],
  stale_pr:          [255, 179, 71,  200],
  merged_not_closed: [255, 179, 71,  180],
  long_review:       [255, 179, 71,  160],
}

export const EXCEPTION_LABEL: Record<ExceptionType, string> = {
  no_pr:             "No PR — in progress with no code",
  stale_pr:          `PR open ${STALE_PR_DAYS}+ days`,
  merged_not_closed: "PR merged but ticket still open",
  long_review:       `Review pending ${REVIEW_DAYS}+ days`,
}

// ── Core types ───────────────────────────────────────────────────────────────

export interface TimelineEvent {
  id: string
  rowKey: string          // Jira key this event belongs to
  type: EventType
  ts: number              // unix ms
  label: string           // tooltip text
  prUrl: string | null
  jiraUrl: string | null
}

export interface TimelineException {
  rowKey: string
  type: ExceptionType
  label: string
  /** Start of the problem window (unix ms) */
  fromTs: number
  /** End of the problem window, or null if still open */
  toTs: number | null
}

export interface TimelineRow {
  key: string             // Jira key e.g. "DBD-1234"
  title: string
  status: string
  workClass: string | null
  sprint: string | null
  sprintState: string | null
  externalUrl: string | null
  rowIndex: number        // y-position (set after sort)
  firstTs: number         // earliest event ts — drives x-axis domain
  lastTs: number          // latest event ts
  exceptions: ExceptionType[]
}

export interface TimelineData {
  rows: TimelineRow[]
  events: TimelineEvent[]
  exceptions: TimelineException[]
  /** Epoch ms of the earliest event across all rows */
  domainStart: number
  /** Epoch ms of the latest event across all rows */
  domainEnd: number
}

// ── Raw-data readers ─────────────────────────────────────────────────────────

function safeMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return isFinite(t) ? t : null
}

interface GhPr {
  createdAt: number | null
  updatedAt: number | null
  mergedAt: number | null
  closedAt: number | null
  reviewRequestedAt: number | null
  url: string | null
}

function readGhPr(rawData: string | null): GhPr {
  const empty: GhPr = { createdAt: null, updatedAt: null, mergedAt: null, closedAt: null, reviewRequestedAt: null, url: null }
  if (!rawData) return empty
  try {
    const p = JSON.parse(rawData) as Record<string, unknown>
    // GitHub PR raw data shape: { html_url, created_at, updated_at, merged_at, closed_at, requested_reviewers }
    return {
      createdAt:  safeMs(p.created_at as string),
      updatedAt:  safeMs(p.updated_at as string),
      mergedAt:   safeMs(p.merged_at as string),
      closedAt:   safeMs(p.closed_at as string),
      // review requested proxy: if requested_reviewers is non-empty, use updated_at as proxy
      reviewRequestedAt: Array.isArray(p.requested_reviewers) && (p.requested_reviewers as unknown[]).length > 0
        ? safeMs(p.updated_at as string)
        : null,
      url: (p.html_url as string) ?? null,
    }
  } catch { return empty }
}

interface JiraFields {
  created: number | null
  updated: number | null
  issuetype: string
  sprintName: string | null
  sprintState: string | null
  storyPoints: number | null
  assignee: string | null
}

function readJiraFields(rawData: string | null): JiraFields {
  const empty: JiraFields = { created: null, updated: null, issuetype: "", sprintName: null, sprintState: null, storyPoints: null, assignee: null }
  if (!rawData) return empty
  try {
    const p = JSON.parse(rawData) as Record<string, unknown>
    const f = (p.fields ?? {}) as Record<string, unknown>
    const sprintArr = (f.customfield_10007 as Record<string, unknown>[] | null) ?? []
    const activeSprint = sprintArr.find(s => s.state === "active") ?? sprintArr[0] ?? null
    return {
      created:     safeMs(f.created as string),
      updated:     safeMs(f.updated as string),
      issuetype:   ((f.issuetype as Record<string, unknown>)?.name as string ?? "").toLowerCase(),
      sprintName:  (activeSprint?.name as string) ?? null,
      sprintState: (activeSprint?.state as string) ?? null,
      storyPoints: (f.customfield_10005 as number | null) ?? (f.customfield_11725 as number | null) ?? null,
      assignee:    ((f.assignee as Record<string, unknown> | null)?.displayName as string) ?? null,
    }
  } catch { return empty }
}

// ── Builder ──────────────────────────────────────────────────────────────────

/**
 * Build the complete timeline data structure from raw DB rows.
 *
 * Only Jira tickets are shown as rows (they are the unit of delivery).
 * GitHub PRs are attached to the Jira row they reference.
 * Tickets with no events at all (no timestamps) are omitted.
 *
 * Filtering: only deliverable/planned tickets that are in an active sprint,
 * in-progress, or have a PR — keeps the view focused on live work.
 */
export function buildTimeline(allItems: WorkItem[]): TimelineData {
  const jiraItems = allItems.filter(i => i.source === "jira")
  const ghItems   = allItems.filter(i => i.source === "github")

  // Index PRs by the Jira key they reference
  const prsByJiraKey = new Map<string, WorkItem[]>()
  for (const pr of ghItems) {
    const key = extractJiraKey(pr.title ?? "")
    if (!key) continue
    const bucket = prsByJiraKey.get(key.toUpperCase()) ?? []
    bucket.push(pr)
    prsByJiraKey.set(key.toUpperCase(), bucket)
  }

  const rows: TimelineRow[] = []
  const events: TimelineEvent[] = []
  const exceptions: TimelineException[] = []

  for (const jira of jiraItems) {
    const key   = (jira.externalId ?? "").toUpperCase()
    if (!key) continue

    const jf    = readJiraFields(jira.rawData ?? null)

    // Skip containers and untracked noise
    if (jf.issuetype === "epic" || jf.issuetype === "feature" || jf.issuetype === "initiative") continue

    // Only include tickets with at least some activity signal
    const matchedPrs = prsByJiraKey.get(key) ?? []
    const isActive   = jira.status === "in_progress" || jira.status === "in_review" || jira.status === "done"
    const inSprint   = jf.sprintState === "active" || jf.sprintState === "future"
    if (!isActive && !inSprint && matchedPrs.length === 0) continue

    // ── Collect events for this row ──────────────────────────────────────

    const rowEvents: TimelineEvent[] = []

    // 1. Jira created
    if (jf.created) {
      rowEvents.push({
        id: `${key}:jira_created`,
        rowKey: key,
        type: "jira_created",
        ts: jf.created,
        label: `${key} created`,
        prUrl: null,
        jiraUrl: jira.externalUrl ?? null,
      })
    }

    // 2. PR events (can have multiple PRs per ticket)
    for (const pr of matchedPrs) {
      const gh = readGhPr(pr.rawData ?? null)
      const prNum = pr.externalId?.match(/#(\d+)$/)?.[1] ?? pr.externalId ?? ""
      const prLabel = `PR #${prNum}`

      if (gh.createdAt) {
        rowEvents.push({
          id: `${key}:pr_opened:${prNum}`,
          rowKey: key,
          type: "pr_opened",
          ts: gh.createdAt,
          label: `${prLabel} opened`,
          prUrl: gh.url,
          jiraUrl: jira.externalUrl ?? null,
        })
      }

      if (gh.reviewRequestedAt && gh.createdAt && gh.reviewRequestedAt > gh.createdAt) {
        rowEvents.push({
          id: `${key}:pr_review:${prNum}`,
          rowKey: key,
          type: "pr_review",
          ts: gh.reviewRequestedAt,
          label: `${prLabel} review requested`,
          prUrl: gh.url,
          jiraUrl: jira.externalUrl ?? null,
        })
      }

      if (gh.mergedAt) {
        rowEvents.push({
          id: `${key}:pr_merged:${prNum}`,
          rowKey: key,
          type: "pr_merged",
          ts: gh.mergedAt,
          label: `${prLabel} merged`,
          prUrl: gh.url,
          jiraUrl: jira.externalUrl ?? null,
        })
      } else if (gh.closedAt) {
        rowEvents.push({
          id: `${key}:pr_closed:${prNum}`,
          rowKey: key,
          type: "pr_closed",
          ts: gh.closedAt,
          label: `${prLabel} closed without merge`,
          prUrl: gh.url,
          jiraUrl: jira.externalUrl ?? null,
        })
      }
    }

    // 3. Jira closed (approximate: use updated_at when status=done)
    if (jira.status === "done" && jf.updated) {
      rowEvents.push({
        id: `${key}:jira_closed`,
        rowKey: key,
        type: "jira_closed",
        ts: jf.updated,
        label: `${key} closed`,
        prUrl: null,
        jiraUrl: jira.externalUrl ?? null,
      })
    }

    // Skip rows with no events
    if (rowEvents.length === 0) continue

    rowEvents.sort((a, b) => a.ts - b.ts)
    const firstTs = rowEvents[0].ts
    const lastTs  = rowEvents[rowEvents.length - 1].ts

    // ── Derive exceptions ────────────────────────────────────────────────

    const nowMs = Date.now()
    const rowExceptions: ExceptionType[] = []

    // No PR: in progress for more than NO_PR_DAYS with no PR
    if (
      (jira.status === "in_progress" || jira.status === "in_review") &&
      matchedPrs.length === 0
    ) {
      const ageMs = nowMs - firstTs
      if (ageMs > NO_PR_DAYS * 86_400_000) {
        rowExceptions.push("no_pr")
        exceptions.push({
          rowKey: key,
          type: "no_pr",
          label: EXCEPTION_LABEL.no_pr,
          fromTs: firstTs,
          toTs: null,
        })
      }
    }

    // Stale PR: any open PR older than STALE_PR_DAYS
    for (const pr of matchedPrs) {
      const gh = readGhPr(pr.rawData ?? null)
      if (gh.createdAt && !gh.mergedAt && !gh.closedAt) {
        const ageDays = (nowMs - gh.createdAt) / 86_400_000
        if (ageDays > STALE_PR_DAYS) {
          if (!rowExceptions.includes("stale_pr")) rowExceptions.push("stale_pr")
          exceptions.push({
            rowKey: key,
            type: "stale_pr",
            label: EXCEPTION_LABEL.stale_pr,
            fromTs: gh.createdAt,
            toTs: null,
          })
        }
        // Long review: PR has review requested but not merged after REVIEW_DAYS
        if (gh.reviewRequestedAt) {
          const reviewAgeDays = (nowMs - gh.reviewRequestedAt) / 86_400_000
          if (reviewAgeDays > REVIEW_DAYS) {
            if (!rowExceptions.includes("long_review")) rowExceptions.push("long_review")
            exceptions.push({
              rowKey: key,
              type: "long_review",
              label: EXCEPTION_LABEL.long_review,
              fromTs: gh.reviewRequestedAt,
              toTs: null,
            })
          }
        }
      }
    }

    // Merged not closed: any PR merged but ticket not done
    const anyMerged = matchedPrs.some(pr => {
      const gh = readGhPr(pr.rawData ?? null)
      return !!gh.mergedAt
    })
    if (anyMerged && jira.status !== "done") {
      rowExceptions.push("merged_not_closed")
      const mergedTs = matchedPrs
        .map(pr => readGhPr(pr.rawData ?? null).mergedAt)
        .filter((t): t is number => t !== null)
        .sort((a, b) => b - a)[0]
      exceptions.push({
        rowKey: key,
        type: "merged_not_closed",
        label: EXCEPTION_LABEL.merged_not_closed,
        fromTs: mergedTs,
        toTs: null,
      })
    }

    rows.push({
      key,
      title: jira.title.replace(/^\[.*?\]\s*/, ""),
      status: jira.status,
      workClass: null,        // could wire classifyWorkClass here if needed
      sprint: jf.sprintName,
      sprintState: jf.sprintState,
      externalUrl: jira.externalUrl ?? null,
      rowIndex: 0,            // set below after sort
      firstTs,
      lastTs,
      exceptions: rowExceptions,
    })

    events.push(...rowEvents)
  }

  // ── Sort rows: exceptions first, then by recency ─────────────────────────

  const EXCEPTION_PRIORITY: ExceptionType[] = ["no_pr", "stale_pr", "merged_not_closed", "long_review"]

  rows.sort((a, b) => {
    const aHasEx = a.exceptions.length > 0
    const bHasEx = b.exceptions.length > 0
    if (aHasEx !== bHasEx) return aHasEx ? -1 : 1
    // Within exception rows, prioritise by worst exception
    if (aHasEx && bHasEx) {
      const aRank = Math.min(...a.exceptions.map(e => EXCEPTION_PRIORITY.indexOf(e)))
      const bRank = Math.min(...b.exceptions.map(e => EXCEPTION_PRIORITY.indexOf(e)))
      if (aRank !== bRank) return aRank - bRank
    }
    // Most recently touched first
    return b.lastTs - a.lastTs
  })

  rows.forEach((r, i) => { r.rowIndex = i })

  const allTs = events.map(e => e.ts)
  const domainStart = allTs.length ? Math.min(...allTs) : Date.now() - 30 * 86_400_000
  const domainEnd   = allTs.length ? Math.max(...allTs) : Date.now()

  return { rows, events, exceptions, domainStart, domainEnd }
}
