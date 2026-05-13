/**
 * delivery-tree.ts
 *
 * Builds a project hierarchy tree from Jira + GitHub work items:
 *   Project → Epic → Sprint → Story/Task/Bug → Sub-task → PR
 *
 * Items with no matching epic are grouped under a "No Epic" bucket.
 * Stories with no sprint are listed under their epic as orphan stories.
 */

import type { WorkItem } from "@/db/schema"
import { extractJiraKey } from "@/lib/pulse"

// ─── Types ────────────────────────────────────────────────────────────────────

export type PRLeaf = {
  kind: "pr"
  number: number
  title: string
  /** "merged" if merged_at is set, "closed" if closed without merge, else "open" */
  state: "open" | "closed" | "merged"
  url: string
  daysOld: number
}

export type SubtaskNode = {
  kind: "subtask"
  key: string
  title: string
  /** Normalised status from work_items.status column */
  status: string
  /** Raw Jira status name e.g. "In Progress" */
  statusRaw: string
  assignee: string | null
  url: string
  prs: PRLeaf[]
}

export type StoryNode = {
  kind: "story"
  key: string
  title: string
  /** Jira issuetype name e.g. "Story", "Task", "Bug" */
  issuetype: string
  status: string
  statusRaw: string
  assignee: string | null
  storyPoints: number | null
  url: string
  subtasks: SubtaskNode[]
  /** PRs linked directly to the story (not to a subtask) */
  prs: PRLeaf[]
}

export type SprintGroup = {
  kind: "sprint"
  name: string
  /** true when the sprint's state is "active" */
  isActive: boolean
  stories: StoryNode[]
}

export type EpicNode = {
  kind: "epic"
  key: string
  title: string
  status: string
  url: string
  sprints: SprintGroup[]
  /** Stories in this epic that belong to no sprint */
  orphanStories: StoryNode[]
}

export type DeliveryTree = {
  epics: EpicNode[]
  /** Stories with no epic, grouped by sprint */
  noEpicSprints: SprintGroup[]
  /** Stories with neither an epic nor a sprint */
  noEpicNoSprint: StoryNode[]
  stats: {
    epics: number
    stories: number
    subtasks: number
    prs: number
    sprints: number
  }
}

// ─── Field readers ────────────────────────────────────────────────────────────

function parseRaw(rawData: string | null): Record<string, unknown> {
  if (!rawData) return {}
  try { return JSON.parse(rawData) as Record<string, unknown> } catch { return {} }
}

function jiraFields(rawData: string | null): Record<string, unknown> {
  const p = parseRaw(rawData)
  return (p.fields ?? {}) as Record<string, unknown>
}

function jiraKey(item: WorkItem): string | null {
  const p = parseRaw(item.rawData ?? null)
  return (p.key as string | undefined) ?? item.externalId ?? null
}

function issuetypeName(rawData: string | null): string {
  const f = jiraFields(rawData)
  return ((f.issuetype as { name?: string } | undefined)?.name ?? "").toLowerCase()
}

function summary(rawData: string | null, fallback = "Untitled"): string {
  const f = jiraFields(rawData)
  return (f.summary as string | undefined) ?? fallback
}

function assignee(rawData: string | null): string | null {
  const f = jiraFields(rawData)
  return ((f.assignee as { displayName?: string } | undefined)?.displayName) ?? null
}

function statusRaw(rawData: string | null): string {
  const f = jiraFields(rawData)
  return ((f.status as { name?: string } | undefined)?.name) ?? "Unknown"
}

function storyPoints(rawData: string | null): number | null {
  const f = jiraFields(rawData)
  return (f.customfield_10005 as number | null) ?? (f.customfield_11725 as number | null) ?? null
}

function parentKey(rawData: string | null): string | null {
  const f = jiraFields(rawData)
  return ((f.parent as { key?: string } | undefined)?.key) ?? null
}

function sprintInfo(rawData: string | null): { name: string; isActive: boolean } | null {
  const f = jiraFields(rawData)
  const arr = (f.customfield_10007 as Record<string, unknown>[] | null | undefined) ?? []
  if (!arr.length) return null
  // Prefer active sprint, fall back to last entry
  const active = arr.find(s => s.state === "active")
  const chosen = active ?? arr[arr.length - 1]
  const name = chosen?.name as string | undefined
  if (!name) return null
  return { name, isActive: (chosen?.state as string | undefined) === "active" }
}

function daysOld(iso: string | null): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export function buildDeliveryTree(allItems: WorkItem[]): DeliveryTree {
  const jiraItems = allItems.filter(i => i.source === "jira")
  const githubItems = allItems.filter(i => i.source === "github")

  // ── 1. Build PR map: jiraKey → PRLeaf[] ──────────────────────────────────
  const prsByKey = new Map<string, PRLeaf[]>()

  for (const gh of githubItems) {
    const rd = parseRaw(gh.rawData ?? null)
    const title = (rd.title as string | undefined) ?? gh.title ?? ""
    const number = (rd.number as number | undefined) ?? 0
    const mergedAt = (rd.merged_at as string | null | undefined) ?? null
    const closedAt = (rd.closed_at as string | null | undefined) ?? null
    const state: PRLeaf["state"] = mergedAt ? "merged" : closedAt ? "closed" : "open"
    const url = (rd.html_url as string | undefined) ?? gh.externalUrl ?? ""
    const updatedAt = (rd.updated_at as string | undefined) ?? null

    const key = extractJiraKey(title)
    if (!key) continue

    const leaf: PRLeaf = { kind: "pr", number, title, state, url, daysOld: daysOld(updatedAt) }
    const existing = prsByKey.get(key) ?? []
    existing.push(leaf)
    prsByKey.set(key, existing)
  }

  // ── 2. Bucket Jira items by issuetype ────────────────────────────────────
  const epicsRaw = new Map<string, WorkItem>()
  const storiesRaw = new Map<string, WorkItem>()
  const subtasksRaw = new Map<string, WorkItem>()

  const CONTAINER_TYPES = new Set(["epic", "initiative", "theme", "feature"])

  for (const item of jiraItems) {
    const key = jiraKey(item)
    if (!key) continue
    const it = issuetypeName(item.rawData ?? null)

    if (it === "epic") {
      epicsRaw.set(key, item)
    } else if (it === "sub-task" || it === "subtask") {
      subtasksRaw.set(key, item)
    } else if (!CONTAINER_TYPES.has(it)) {
      // Story, Task, Bug, Improvement, Spike, etc.
      storiesRaw.set(key, item)
    }
  }

  // ── 3. Build SubtaskNode objects ──────────────────────────────────────────
  const subtaskNodes = new Map<string, SubtaskNode>()
  for (const [key, item] of subtasksRaw) {
    subtaskNodes.set(key, {
      kind: "subtask",
      key,
      title: summary(item.rawData ?? null, key),
      status: item.status ?? "unknown",
      statusRaw: statusRaw(item.rawData ?? null),
      assignee: assignee(item.rawData ?? null),
      url: item.externalUrl ?? "",
      prs: prsByKey.get(key) ?? [],
    })
  }

  // ── 4. Build StoryNode objects, attach subtasks ───────────────────────────
  const storyNodes = new Map<string, StoryNode>()
  for (const [key, item] of storiesRaw) {
    const rd = item.rawData ?? null
    const f = jiraFields(rd)
    const it = (f.issuetype as { name?: string } | undefined)?.name ?? "Story"

    // Subtasks whose Jira parent field points to this story
    const mySubtasks: SubtaskNode[] = []
    for (const [sk, sn] of subtaskNodes) {
      const sItem = subtasksRaw.get(sk)!
      if (parentKey(sItem.rawData ?? null) === key) {
        mySubtasks.push(sn)
      }
    }

    storyNodes.set(key, {
      kind: "story",
      key,
      title: summary(rd, key),
      issuetype: it,
      status: item.status ?? "unknown",
      statusRaw: statusRaw(rd),
      assignee: assignee(rd),
      storyPoints: storyPoints(rd),
      url: item.externalUrl ?? "",
      subtasks: mySubtasks,
      prs: prsByKey.get(key) ?? [],
    })
  }

  // ── 5. Build EpicNode objects — stories grouped by sprint ─────────────────
  const epicNodes: EpicNode[] = []
  const storiesClaimedByEpic = new Set<string>()

  for (const [key, item] of epicsRaw) {
    const rd = item.rawData ?? null

    // Stories whose parent is this epic
    const epicStories: StoryNode[] = []
    for (const [sk, sn] of storyNodes) {
      const sItem = storiesRaw.get(sk)!
      if (parentKey(sItem.rawData ?? null) === key) {
        epicStories.push(sn)
        storiesClaimedByEpic.add(sk)
      }
    }

    // Group by sprint
    const sprintMap = new Map<string, { isActive: boolean; stories: StoryNode[] }>()
    const orphanStories: StoryNode[] = []

    for (const story of epicStories) {
      const sItem = storiesRaw.get(story.key)!
      const sp = sprintInfo(sItem.rawData ?? null)
      if (!sp) {
        orphanStories.push(story)
      } else {
        const bucket = sprintMap.get(sp.name)
        if (bucket) {
          bucket.stories.push(story)
        } else {
          sprintMap.set(sp.name, { isActive: sp.isActive, stories: [story] })
        }
      }
    }

    const sprints: SprintGroup[] = Array.from(sprintMap.entries())
      .map(([name, { isActive, stories }]) => ({ kind: "sprint" as const, name, isActive, stories }))
      // Active sprint first, then alphabetical
      .sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0) || a.name.localeCompare(b.name))

    epicNodes.push({
      kind: "epic",
      key,
      title: summary(rd, key),
      status: item.status ?? "unknown",
      url: item.externalUrl ?? "",
      sprints,
      orphanStories,
    })
  }

  // Sort epics: in-progress first, then alphabetical
  epicNodes.sort((a, b) => {
    const rank = (s: string) => s === "in_progress" ? 0 : s === "in_review" ? 1 : s === "todo" || s === "open" ? 2 : 3
    return rank(a.status) - rank(b.status) || a.title.localeCompare(b.title)
  })

  // ── 6. Stories with no epic ───────────────────────────────────────────────
  const noEpicSprintMap = new Map<string, { isActive: boolean; stories: StoryNode[] }>()
  const noEpicNoSprint: StoryNode[] = []

  for (const [sk, sn] of storyNodes) {
    if (storiesClaimedByEpic.has(sk)) continue
    const sItem = storiesRaw.get(sk)!
    const sp = sprintInfo(sItem.rawData ?? null)
    if (!sp) {
      noEpicNoSprint.push(sn)
    } else {
      const bucket = noEpicSprintMap.get(sp.name)
      if (bucket) {
        bucket.stories.push(sn)
      } else {
        noEpicSprintMap.set(sp.name, { isActive: sp.isActive, stories: [sn] })
      }
    }
  }

  const noEpicSprints: SprintGroup[] = Array.from(noEpicSprintMap.entries())
    .map(([name, { isActive, stories }]) => ({ kind: "sprint" as const, name, isActive, stories }))
    .sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0) || a.name.localeCompare(b.name))

  // ── Stats ─────────────────────────────────────────────────────────────────
  const allStories = Array.from(storyNodes.values())
  const allSubtasks = Array.from(subtaskNodes.values())
  const allPrs = Array.from(prsByKey.values()).flat()
  const sprintNames = new Set<string>()
  for (const [, item] of storiesRaw) {
    const sp = sprintInfo(item.rawData ?? null)
    if (sp) sprintNames.add(sp.name)
  }

  return {
    epics: epicNodes,
    noEpicSprints,
    noEpicNoSprint,
    stats: {
      epics: epicsRaw.size,
      stories: allStories.length,
      subtasks: allSubtasks.length,
      prs: allPrs.length,
      sprints: sprintNames.size,
    },
  }
}
