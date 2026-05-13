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
import type { WorkClass } from "@/lib/triage"

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
