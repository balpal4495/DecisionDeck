/**
 * Pulse — cross-reference layer between Jira tickets and GitHub PRs.
 *
 * Join key: Jira issue key extracted from PR title (e.g. "DBD-1234").
 * This convention has >92% coverage in the real data.
 *
 * Four relationship states:
 *   linked              — Jira ticket + matching PR (healthy pair)
 *   codeless-ticket     — Jira ticket with no PR (depends on workClass for severity)
 *   untracked-pr        — PR with no Jira key or key not in the DB
 *   zombie              — workClass=zombie Jira ticket, no PR, no planning signal
 */

import type { WorkItem } from "@/db/schema"
import { classifyWorkClass, type WorkClass, type WorkClassResult } from "@/lib/triage"

// ── Types ─────────────────────────────────────────────────────────────────────

export type PulseState =
  | "linked"              // Jira + PR matched
  | "codeless-ticket"     // Jira ticket, no PR — severity depends on workClass
  | "untracked-pr"        // PR with no Jira ticket in DB
  | "zombie"              // workClass=zombie: in-progress, no planning signal, no PR

export interface PulseJira {
  id: string
  externalId: string
  title: string
  status: string
  area: string
  externalUrl: string | null
  workClass: WorkClass
  workClassReason: string
  sprint: string | null
  sprintState: string | null     // "active" | "future" | "closed"
  storyPoints: number | null
  assignee: string | null
  daysStale: number
}

export interface PulsePr {
  id: string
  externalId: string
  title: string
  status: string
  externalUrl: string | null
  daysStale: number
  /** Jira key extracted from the PR title — null if untracked */
  extractedJiraKey: string | null
}

export interface PulseItem {
  state: PulseState
  jira?: PulseJira
  pr?: PulsePr
  /** Days since the most-recently-updated side was last touched */
  staleDays: number
}

export interface PulseSummary {
  total: number
  linked: number
  codelessDeliverable: number   // deliverable/planned, no PR — real signal
  codelessContainer: number     // container/placeholder, no PR — expected noise
  zombies: number
  untrackedPrs: number
}

// ── Key extraction ────────────────────────────────────────────────────────────

/** Extract Jira issue key from PR title. Returns uppercased key or null. */
export function extractJiraKey(title: string): string | null {
  const match = title.match(/\b([A-Z]{2,10}-\d+)\b/i)
  return match ? match[1].toUpperCase() : null
}

// ── Field readers (Jira rawData) ──────────────────────────────────────────────

interface JiraFields {
  sprint: string | null
  sprintState: string | null
  storyPoints: number | null
  assignee: string | null
  updated: string | null
}

function readJiraFields(rawData: string | null): JiraFields {
  if (!rawData) return { sprint: null, sprintState: null, storyPoints: null, assignee: null, updated: null }
  try {
    const parsed = JSON.parse(rawData) as Record<string, unknown>
    const f = (parsed.fields ?? {}) as Record<string, unknown>
    const sprintArr = (f.customfield_10007 as Record<string, unknown>[] | null) ?? []
    const activeSprint = sprintArr.find(s => s.state === "active") ?? sprintArr[0] ?? null
    return {
      sprint: (activeSprint?.name as string) ?? null,
      sprintState: (activeSprint?.state as string) ?? null,
      storyPoints: (f.customfield_10005 as number | null) ?? (f.customfield_11725 as number | null) ?? null,
      assignee: ((f.assignee as Record<string, unknown> | null)?.displayName as string) ?? null,
      updated: typeof f.updated === "string" ? f.updated : null,
    }
  } catch {
    return { sprint: null, sprintState: null, storyPoints: null, assignee: null, updated: null }
  }
}

function daysAgo(isoDate: string | null, fallback = -1): number {
  if (!isoDate) return fallback
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000)
}

function ghUpdatedDate(rawData: string | null): string | null {
  if (!rawData) return null
  try {
    const p = JSON.parse(rawData) as Record<string, unknown>
    return typeof p.updated_at === "string" ? p.updated_at : null
  } catch {
    return null
  }
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Build the full Pulse cross-reference from Jira and GitHub work items.
 * Pass all rows from both sources — the function partitions internally.
 */
export function buildPulse(allItems: WorkItem[]): PulseItem[] {
  const jiraItems = allItems.filter(i => i.source === "jira")
  const ghItems = allItems.filter(i => i.source === "github")

  // Index Jira tickets by key
  const jiraByKey = new Map<string, WorkItem>()
  for (const item of jiraItems) {
    if (item.externalId) jiraByKey.set(item.externalId.toUpperCase(), item)
  }

  // Index matched Jira keys (from PR titles)
  const matchedJiraKeys = new Set<string>()
  for (const pr of ghItems) {
    const key = extractJiraKey(pr.title)
    if (key) matchedJiraKeys.add(key)
  }

  const result: PulseItem[] = []

  // ── Linked pairs + untracked PRs ──────────────────────────────────────────
  for (const pr of ghItems) {
    const extractedKey = extractJiraKey(pr.title)
    const jiraItem = extractedKey ? jiraByKey.get(extractedKey) ?? null : null

    const prDays = daysAgo(ghUpdatedDate(pr.rawData ?? null))
    const prRecord: PulsePr = {
      id: pr.id,
      externalId: pr.externalId ?? "",
      title: pr.title,
      status: pr.status,
      externalUrl: pr.externalUrl ?? null,
      daysStale: prDays,
      extractedJiraKey: extractedKey,
    }

    if (jiraItem) {
      const jiraFields = readJiraFields(jiraItem.rawData ?? null)
      const { workClass, reason: workClassReason }: WorkClassResult = classifyWorkClass(jiraItem)
      const jiraDays = daysAgo(jiraFields.updated)
      const staleDays = Math.min(
        jiraDays >= 0 ? jiraDays : Infinity,
        prDays >= 0 ? prDays : Infinity,
      )
      result.push({
        state: "linked",
        jira: {
          id: jiraItem.id,
          externalId: jiraItem.externalId ?? "",
          title: jiraItem.title.replace(/^\[.*?\]\s*/, ""),
          status: jiraItem.status,
          area: jiraItem.area,
          externalUrl: jiraItem.externalUrl ?? null,
          workClass,
          workClassReason,
          sprint: jiraFields.sprint,
          sprintState: jiraFields.sprintState,
          storyPoints: jiraFields.storyPoints,
          assignee: jiraFields.assignee,
          daysStale: jiraDays,
        },
        pr: prRecord,
        staleDays: isFinite(staleDays) ? staleDays : -1,
      })
    } else {
      result.push({
        state: "untracked-pr",
        pr: prRecord,
        staleDays: prDays,
      })
    }
  }

  // ── Codeless Jira tickets + zombies ───────────────────────────────────────
  for (const item of jiraItems) {
    if (!item.externalId) continue
    if (matchedJiraKeys.has(item.externalId.toUpperCase())) continue

    const { workClass, reason: workClassReason }: WorkClassResult = classifyWorkClass(item)
    const jiraFields = readJiraFields(item.rawData ?? null)
    const jiraDays = daysAgo(jiraFields.updated)

    const jiraRecord: PulseJira = {
      id: item.id,
      externalId: item.externalId,
      title: item.title.replace(/^\[.*?\]\s*/, ""),
      status: item.status,
      area: item.area,
      externalUrl: item.externalUrl ?? null,
      workClass,
      workClassReason,
      sprint: jiraFields.sprint,
      sprintState: jiraFields.sprintState,
      storyPoints: jiraFields.storyPoints,
      assignee: jiraFields.assignee,
      daysStale: jiraDays,
    }

    if (workClass === "zombie") {
      result.push({ state: "zombie", jira: jiraRecord, staleDays: jiraDays })
    } else {
      result.push({ state: "codeless-ticket", jira: jiraRecord, staleDays: jiraDays })
    }
  }

  return result
}

export function summarisePulse(items: PulseItem[]): PulseSummary {
  let linked = 0
  let codelessDeliverable = 0
  let codelessContainer = 0
  let zombies = 0
  let untrackedPrs = 0

  for (const item of items) {
    if (item.state === "linked") linked++
    else if (item.state === "untracked-pr") untrackedPrs++
    else if (item.state === "zombie") zombies++
    else if (item.state === "codeless-ticket") {
      const wc = item.jira?.workClass
      if (wc === "container" || wc === "placeholder") codelessContainer++
      else codelessDeliverable++
    }
  }

  return {
    total: items.length,
    linked,
    codelessDeliverable,
    codelessContainer,
    zombies,
    untrackedPrs,
  }
}
