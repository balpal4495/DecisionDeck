/**
 * Graph data builder — transforms PulseItem[] into a serialisable
 * node/link structure for the WebGL force-graph visualisation.
 *
 * Nodes:
 *   Jira tickets  — circles, coloured by workClass, sized by story points
 *   GitHub PRs    — smaller nodes, purple
 *
 * Links:
 *   One edge per Jira ↔ PR matched pair (state = "linked")
 */

import type { PulseItem, PulseState } from "@/lib/pulse"
import { extractJiraKey } from "@/lib/pulse"
import type { WorkClass } from "@/lib/triage"
import type { WorkItem } from "@/db/schema"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GraphNode {
  /** Unique stable id used as the force-graph node key */
  id: string
  /** Short display label (e.g. "DBD-2783" or "#2700") */
  label: string
  /** Full title for the detail panel */
  fullTitle: string
  nodeType: "jira" | "pr"
  workClass: WorkClass | null
  status: string
  sprint: string | null
  sprintState: string | null   // "active" | "future" | "closed" | null
  storyPoints: number | null
  assignee: string | null
  daysStale: number
  externalUrl: string | null
  pulseState: PulseState
}

export interface GraphLink {
  source: string
  target: string
  pulseState: PulseState
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildGraphData(items: PulseItem[]): GraphData {
  const nodes: GraphNode[] = []
  const links: GraphLink[] = []
  const seen = new Set<string>()

  function addNode(n: GraphNode) {
    if (!seen.has(n.id)) {
      seen.add(n.id)
      nodes.push(n)
    }
  }

  for (const item of items) {
    if (item.jira) {
      const j = item.jira
      addNode({
        id: `jira:${j.externalId}`,
        label: j.externalId,
        fullTitle: j.title,
        nodeType: "jira",
        workClass: j.workClass,
        status: j.status,
        sprint: j.sprint,
        sprintState: j.sprintState,
        storyPoints: j.storyPoints,
        assignee: j.assignee,
        daysStale: j.daysStale,
        externalUrl: j.externalUrl,
        pulseState: item.state,
      })
    }

    if (item.pr) {
      const p = item.pr
      const prNum = p.externalId.match(/#(\d+)$/)?.[1]
      addNode({
        id: `pr:${p.externalId}`,
        label: prNum ? `#${prNum}` : p.externalId,
        fullTitle: p.title,
        nodeType: "pr",
        workClass: null,
        status: p.status,
        sprint: null,
        sprintState: null,
        storyPoints: null,
        assignee: null,
        daysStale: p.daysStale,
        externalUrl: p.externalUrl,
        pulseState: item.state,
      })
    }

    if (item.jira && item.pr) {
      links.push({
        source: `jira:${item.jira.externalId}`,
        target: `pr:${item.pr.externalId}`,
        pulseState: item.state,
      })
    }
  }

  return { nodes, links }
}

// ── Jira-native GitHub integration parser ─────────────────────────────────────
//
// Jira's GitHub app stores PR/branch activity in customfield_11100 as a
// Java-style toString() string: {pullrequest={...}, json={"cachedValue":{...}}}
// The "json=" portion is valid JSON and contains the structured PR summary.

export interface JiraGitHubActivity {
  prCount: number
  /** Overall state of PRs on this ticket — "OPEN" | "MERGED" | "CLOSED" */
  prState: "OPEN" | "MERGED" | "CLOSED" | null
  lastUpdated: string | null
  /** Days since last GitHub activity. -1 if unknown */
  daysSince: number
  /** True when at least one PR is currently open */
  isOpen: boolean
}

function extractEmbeddedJson(raw: string): unknown {
  const idx = raw.indexOf("json=")
  if (idx === -1) return null
  const start = idx + 5
  if (raw[start] !== "{") return null
  let depth = 0
  let end = -1
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "{") depth++
    else if (raw[i] === "}") {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end === -1) return null
  try { return JSON.parse(raw.slice(start, end + 1)) } catch { return null }
}

export function parseJiraGitHub(rawData: string | null): JiraGitHubActivity | null {
  if (!rawData) return null
  try {
    const parsed = JSON.parse(rawData) as Record<string, unknown>
    const f = (parsed.fields ?? {}) as Record<string, unknown>
    const cf = f.customfield_11100
    if (!cf) return null

    let ghJson: unknown = null
    if (typeof cf === "string") {
      ghJson = extractEmbeddedJson(cf)
    } else if (typeof cf === "object") {
      ghJson = cf
    }
    if (!ghJson || typeof ghJson !== "object") return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overall = (ghJson as any)?.cachedValue?.summary?.pullrequest?.overall
    if (!overall) return null

    const lastUpdated = (overall.lastUpdated as string) ?? null
    const daysSince = lastUpdated
      ? Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 86_400_000)
      : -1

    return {
      prCount:     (overall.count as number) ?? 0,
      prState:     ((overall.state as string) ?? null) as "OPEN" | "MERGED" | "CLOSED" | null,
      lastUpdated,
      daysSince,
      isOpen:      (overall.open as boolean) ?? false,
    }
  } catch { return null }
}

// ── PR Coverage (PR-first investigation) ──────────────────────────────────────
//
// One row per GitHub PR — answers the key EM questions:
//   • Why was this PR raised? Can we find a Jira ticket for it?
//   • Is it stale (open too long with no movement)?
//   • Was it superseded (Jira says another PR already merged for this ticket)?
//   • Does Jira show branch activity for a ticket that has no PR yet?

export type PRSignal =
  | "matched"       // PR ↔ active ticket — healthy
  | "stale"         // PR open >14d, ticket still in-progress
  | "superseded"    // Jira reports a MERGED PR on this ticket; this one still open
  | "orphan"        // Key found but ticket not in our DB
  | "cross-project" // Key is from a different project (LP-*, FROM-*, etc.)
  | "no-key"        // No Jira key in PR title at all

export interface PRCoverageRow {
  // ── PR ────────────────────────────────────────────────────────────────────
  prExternalId: string
  prNum: string
  prTitle: string
  prStatus: string          // "open" | "merged" | "closed"
  prUrl: string | null
  prDaysOld: number

  // ── Extracted key from PR title ───────────────────────────────────────────
  extractedKey: string | null

  // ── Jira ticket (if found in our DB) ─────────────────────────────────────
  jiraFound: boolean
  jiraTitle: string | null
  jiraStatus: string | null
  jiraWorkClass: WorkClass | null
  jiraSprint: string | null
  jiraSprintState: string | null
  jiraAssignee: string | null
  jiraUrl: string | null

  // ── What Jira's native GitHub integration reports (customfield_11100) ─────
  // This is the authoritative view: Jira knows about PRs/branches linked via
  // the GitHub app, regardless of whether they're in our sync'd DB.
  jiraGH: JiraGitHubActivity | null

  // ── Assessment ────────────────────────────────────────────────────────────
  signal: PRSignal
  signalNote: string
}

function ghPrDaysOld(rawData: string | null): number {
  if (!rawData) return -1
  try {
    const p = JSON.parse(rawData) as Record<string, unknown>
    const updated = p.updated_at as string | null
    return updated ? Math.floor((Date.now() - new Date(updated).getTime()) / 86_400_000) : -1
  } catch { return -1 }
}

export function buildPRCoverage(rawItems: WorkItem[], pulse: PulseItem[]): PRCoverageRow[] {
  // Index Jira items by key
  const jiraByKey = new Map<string, WorkItem>()
  for (const item of rawItems) {
    if (item.source === "jira" && item.externalId) {
      jiraByKey.set(item.externalId.toUpperCase(), item)
    }
  }

  // Index pulse Jira data for workClass / sprint lookups
  const pulseJiraByKey = new Map<string, NonNullable<PulseItem["jira"]>>()
  for (const item of pulse) {
    if (item.jira) pulseJiraByKey.set(item.jira.externalId.toUpperCase(), item.jira)
  }

  const rows: PRCoverageRow[] = []

  for (const pr of rawItems) {
    if (pr.source !== "github") continue

    const prNum      = pr.externalId?.match(/#(\d+)$/)?.[1] ?? pr.externalId ?? "?"
    const prDaysOld  = ghPrDaysOld(pr.rawData ?? null)
    const extractedKey = extractJiraKey(pr.title ?? "")

    const jiraItem = extractedKey ? jiraByKey.get(extractedKey.toUpperCase()) ?? null : null
    const pj       = extractedKey ? pulseJiraByKey.get(extractedKey.toUpperCase()) ?? null : null
    const jiraGH   = jiraItem ? parseJiraGitHub(jiraItem.rawData ?? null) : null

    // ── Signal classification ─────────────────────────────────────────────
    let signal: PRSignal
    let signalNote: string

    if (!extractedKey) {
      signal     = "no-key"
      signalNote = "No Jira key in PR title"
    } else if (!extractedKey.match(/^DBD-\d+$/i)) {
      signal     = "cross-project"
      signalNote = `Key ${extractedKey} belongs to another project`
    } else if (!jiraItem) {
      signal     = "orphan"
      signalNote = `${extractedKey} not found in synced tickets`
    } else if (pr.status === "open" && jiraGH?.prState === "MERGED") {
      signal     = "superseded"
      signalNote = `Jira reports ${jiraGH.prCount} merged PR(s) on this ticket — this PR may be redundant`
    } else if (pr.status === "open" && prDaysOld > 14) {
      signal     = "stale"
      signalNote = `PR has been open ${prDaysOld}d — ticket is still ${jiraItem.status}`
    } else {
      signal     = "matched"
      signalNote = pj?.sprint ? `Active in sprint ${pj.sprint}` : "Matched to Jira ticket"
    }

    rows.push({
      prExternalId:  pr.externalId ?? "",
      prNum,
      prTitle:       pr.title ?? "",
      prStatus:      pr.status ?? "",
      prUrl:         pr.externalUrl ?? null,
      prDaysOld,
      extractedKey,
      jiraFound:     !!jiraItem,
      jiraTitle:     jiraItem?.title.replace(/^\[.*?\]\s*/, "") ?? null,
      jiraStatus:    jiraItem?.status ?? null,
      jiraWorkClass: pj?.workClass ?? null,
      jiraSprint:    pj?.sprint ?? null,
      jiraSprintState: pj?.sprintState ?? null,
      jiraAssignee:  pj?.assignee ?? null,
      jiraUrl:       jiraItem?.externalUrl ?? null,
      jiraGH,
      signal,
      signalNote,
    })
  }

  // Sort: problems first — superseded → orphan → stale → no-key → cross-project → matched
  const ORDER: PRSignal[] = ["superseded", "orphan", "stale", "no-key", "cross-project", "matched"]
  rows.sort((a, b) => ORDER.indexOf(a.signal) - ORDER.indexOf(b.signal))

  return rows
}
