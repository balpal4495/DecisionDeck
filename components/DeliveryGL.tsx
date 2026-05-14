"use client"

import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import DeckGL from "@deck.gl/react"
import { OrthographicView } from "@deck.gl/core"
import { ScatterplotLayer, PathLayer, TextLayer } from "@deck.gl/layers"
import type { PickingInfo } from "@deck.gl/core"
import type {
  DeliveryTree,
  EpicNode,
  SprintGroup,
  StoryNode,
  SubtaskNode,
  PRLeaf,
} from "@/lib/delivery-tree"
import styles from "./DeliveryGL.module.css"

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeType = "epic" | "sprint" | "story" | "subtask" | "pr"
type RGBA = [number, number, number, number]

interface LNode {
  id: string
  type: NodeType
  x: number
  y: number
  radius: number
  fill: RGBA
  ring: RGBA
  label: string       // key or PR #  (short)
  title: string       // full title (tooltip)
  status: string
  url: string | null
  hasChildren: boolean
  isExpanded: boolean
  meta: {
    assignee?: string | null
    storyPoints?: number | null
    daysOld?: number
    issuetype?: string
    prState?: string
  }
}

interface LEdge {
  path: number[][]
  color: RGBA
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const COL_W = 240
const ROW_H = 48

const RADIUS: Record<NodeType, number> = {
  epic: 18,
  sprint: 14,
  story: 11,
  subtask: 9,
  pr: 9,
}

// ─── Colour helpers ───────────────────────────────────────────────────────────

function nodeFill(type: NodeType, subtype: string, isActive: boolean): RGBA {
  if (type === "epic") return [20, 100, 220, 255]
  if (type === "sprint") return isActive ? [109, 123, 255, 255] : [55, 62, 100, 255]
  if (type === "story") {
    const lt = subtype.toLowerCase()
    if (lt === "bug") return [220, 75, 90, 255]
    if (lt === "task") return [60, 140, 210, 255]
    return [77, 159, 255, 255]
  }
  if (type === "subtask") return [100, 108, 155, 255]
  if (type === "pr") {
    if (subtype === "merged") return [75, 185, 90, 255]
    if (subtype === "closed") return [60, 65, 95, 255]
    return [130, 100, 220, 255]   // open PR = purple
  }
  return [100, 110, 130, 255]
}

function statusRing(status: string): RGBA {
  switch (status) {
    case "in_progress":  return [109, 123, 255, 210]
    case "in_review":    return [255, 175, 65, 210]
    case "done":         return [75, 195, 90, 210]
    case "blocked":      return [255, 75, 85, 210]
    default:             return [48, 54, 85, 170]
  }
}

function brighten(c: RGBA, f = 1.35): RGBA {
  return [
    Math.min(255, Math.round(c[0] * f)),
    Math.min(255, Math.round(c[1] * f)),
    Math.min(255, Math.round(c[2] * f)),
    c[3],
  ]
}

// ─── Bezier edge ──────────────────────────────────────────────────────────────

function cubicBezier(
  from: [number, number],
  to: [number, number],
  segs = 18,
): number[][] {
  // Control points create an S-curve: horizontal midpoint at each y
  const mx = (from[0] + to[0]) / 2
  const pts: number[][] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const nt = 1 - t
    const x =
      nt * nt * nt * from[0] +
      3 * nt * nt * t * mx +
      3 * nt * t * t * mx +
      t * t * t * to[0]
    const y =
      nt * nt * nt * from[1] +
      3 * nt * nt * t * from[1] +
      3 * nt * t * t * to[1] +
      t * t * t * to[1]
    pts.push([x, y, 0])
  }
  return pts
}

// ─── Flat tree ────────────────────────────────────────────────────────────────

interface FlatNode {
  id: string
  parentId: string | null
  type: NodeType
  label: string
  title: string
  status: string
  subtype: string
  isActive: boolean
  url: string | null
  meta: LNode["meta"]
}

interface FlatTree {
  byId: Map<string, FlatNode>
  childrenOf: Map<string | null, string[]>
}

function buildFlatTree(tree: DeliveryTree): FlatTree {
  const byId = new Map<string, FlatNode>()
  const childrenOf = new Map<string | null, string[]>()

  function push(parentId: string | null, id: string) {
    const arr = childrenOf.get(parentId) ?? []
    arr.push(id)
    childrenOf.set(parentId, arr)
  }

  function addPR(pr: PRLeaf, parentId: string) {
    const id = `pr:${pr.number}:${parentId}`
    byId.set(id, {
      id, parentId, type: "pr",
      label: `#${pr.number}`,
      title: pr.title,
      status: pr.state === "merged" ? "done" : pr.state === "closed" ? "not_started" : "in_progress",
      subtype: pr.state,
      isActive: pr.state === "open",
      url: pr.url,
      meta: { daysOld: pr.daysOld, prState: pr.state },
    })
    push(parentId, id)
  }

  function addSubtask(st: SubtaskNode, parentId: string) {
    byId.set(st.key, {
      id: st.key, parentId, type: "subtask",
      label: st.key,
      title: st.title,
      status: st.status,
      subtype: "Sub-task",
      isActive: false,
      url: st.url || null,
      meta: { assignee: st.assignee },
    })
    push(parentId, st.key)
    for (const pr of st.prs) addPR(pr, st.key)
  }

  function addStory(story: StoryNode, parentId: string | null) {
    byId.set(story.key, {
      id: story.key, parentId, type: "story",
      label: story.key,
      title: story.title,
      status: story.status,
      subtype: story.issuetype,
      isActive: story.status === "in_progress",
      url: story.url || null,
      meta: {
        assignee: story.assignee,
        storyPoints: story.storyPoints,
        issuetype: story.issuetype,
      },
    })
    push(parentId, story.key)
    for (const pr of story.prs) addPR(pr, story.key)
    for (const st of story.subtasks) addSubtask(st, story.key)
  }

  function addSprint(sprint: SprintGroup, parentId: string | null) {
    const id = `sprint::${sprint.name}`
    const label = sprint.name.length > 22 ? sprint.name.slice(0, 20) + "…" : sprint.name
    byId.set(id, {
      id, parentId, type: "sprint",
      label,
      title: sprint.name,
      status: sprint.isActive ? "in_progress" : "not_started",
      subtype: sprint.isActive ? "active" : "closed",
      isActive: sprint.isActive,
      url: null,
      meta: {},
    })
    push(parentId, id)
    for (const story of sprint.stories) addStory(story, id)
  }

  function addEpic(epic: EpicNode) {
    byId.set(epic.key, {
      id: epic.key, parentId: null, type: "epic",
      label: epic.key,
      title: epic.title,
      status: epic.status,
      subtype: "Epic",
      isActive: epic.status === "in_progress",
      url: epic.url || null,
      meta: {},
    })
    push(null, epic.key)
    for (const sprint of epic.sprints) addSprint(sprint, epic.key)
    for (const story of epic.orphanStories) addStory(story, epic.key)
  }

  for (const epic of tree.epics) addEpic(epic)
  for (const sprint of tree.noEpicSprints) addSprint(sprint, null)
  for (const story of tree.noEpicNoSprint) addStory(story, null)

  return { byId, childrenOf }
}

// ─── Layout computation ───────────────────────────────────────────────────────

function computeLayout(
  ft: FlatTree,
  expanded: Set<string>,
): { nodes: LNode[]; edges: LEdge[] } {
  function leafCount(id: string): number {
    const children = ft.childrenOf.get(id)
    if (!children?.length || !expanded.has(id)) return 1
    return children.reduce((s, c) => s + leafCount(c), 0)
  }

  const positions = new Map<string, { x: number; y: number }>()
  let leafIdx = 0

  function assign(ids: string[], depth: number) {
    for (const id of ids) {
      const lc = leafCount(id)
      positions.set(id, {
        x: depth * COL_W,
        y: (leafIdx + (lc - 1) / 2) * ROW_H,
      })
      if (expanded.has(id)) {
        const children = ft.childrenOf.get(id)
        if (children?.length) assign(children, depth + 1)
      }
      leafIdx += lc
    }
  }

  assign(ft.childrenOf.get(null) ?? [], 0)

  const nodes: LNode[] = []
  const edges: LEdge[] = []

  for (const [id, pos] of positions) {
    const fn = ft.byId.get(id)!
    const children = ft.childrenOf.get(id)
    const hasChildren = (children?.length ?? 0) > 0

    nodes.push({
      id, type: fn.type,
      x: pos.x, y: pos.y,
      radius: RADIUS[fn.type],
      fill: nodeFill(fn.type, fn.subtype, fn.isActive),
      ring: statusRing(fn.status),
      label: fn.label,
      title: fn.title,
      status: fn.status,
      url: fn.url,
      hasChildren,
      isExpanded: expanded.has(id),
      meta: fn.meta,
    })

    if (fn.parentId && positions.has(fn.parentId)) {
      const pp = positions.get(fn.parentId)!
      const pr = RADIUS[ft.byId.get(fn.parentId)!.type]
      edges.push({
        path: cubicBezier(
          [pp.x + pr, pp.y],
          [pos.x - RADIUS[fn.type], pos.y],
        ),
        color: [48, 54, 90, 90],
      })
    }
  }

  return { nodes, edges }
}

// ─── Status label map ─────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
  blocked: "Blocked",
  not_started: "To Do",
  todo: "To Do",
  open: "Open",
  planned: "Planned",
}

// ─── Legend data ──────────────────────────────────────────────────────────────

const NODE_LEGEND = [
  { label: "Epic",          color: "#1464dc" },
  { label: "Sprint (active)", color: "#6d7bff" },
  { label: "Sprint",        color: "#373e64" },
  { label: "Story",         color: "#4d9fff" },
  { label: "Bug",           color: "#dc4b5a" },
  { label: "Sub-task",      color: "#646c9b" },
  { label: "PR open",       color: "#8264dc" },
  { label: "PR merged",     color: "#4bb95a" },
]

const RING_LEGEND = [
  { label: "In Progress", color: "#6d7bff" },
  { label: "In Review",   color: "#ffaf41" },
  { label: "Done",        color: "#4bc35a" },
  { label: "Blocked",     color: "#ff4b55" },
]

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  data: DeliveryTree
}

export default function DeliveryGL({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 700 })

  // Start with all epics expanded (showing their sprints)
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(data.epics.map(e => e.key)),
  )
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: LNode } | null>(null)
  const [panel, setPanel] = useState<LNode | null>(null)

  const flatTree = useMemo(() => buildFlatTree(data), [data])

  const { nodes, edges } = useMemo(
    () => computeLayout(flatTree, expanded),
    [flatTree, expanded],
  )

  // Centre viewport on initial layout
  const initialViewState = useMemo(() => {
    const initExp = new Set(data.epics.map(e => e.key))
    const { nodes: n0 } = computeLayout(flatTree, initExp)
    if (!n0.length) return { target: [0, 0, 0] as [number, number, number], zoom: 0, minZoom: -3, maxZoom: 5 }
    const ys = n0.map(n => n.y)
    const xs = n0.map(n => n.x)
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2
    return { target: [cx, cy, 0] as [number, number, number], zoom: 0, minZoom: -3, maxZoom: 5 }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect
      setCanvasSize({ width: r.width, height: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const toggleExpand = useCallback(
    (node: LNode) => {
      if (!node.hasChildren) {
        // Leaf — open URL
        if (node.url) window.open(node.url, "_blank", "noopener,noreferrer")
        return
      }
      setExpanded(prev => {
        const next = new Set(prev)
        if (next.has(node.id)) {
          // Collapse this node and all descendants
          function collapseAll(id: string) {
            next.delete(id)
            for (const c of flatTree.childrenOf.get(id) ?? []) collapseAll(c)
          }
          collapseAll(node.id)
        } else {
          next.add(node.id)
        }
        return next
      })
    },
    [flatTree],
  )

  const handleClick = useCallback(
    (info: PickingInfo) => {
      const node = info.object as LNode | undefined
      if (node) {
        toggleExpand(node)
        setPanel(node)
      }
    },
    [toggleExpand],
  )

  const handleHover = useCallback((info: PickingInfo) => {
    const node = info.object as LNode | undefined
    setHoveredId(node?.id ?? null)
    if (node && info.x != null && info.y != null) {
      setTooltip({ x: info.x, y: info.y, node })
    } else {
      setTooltip(null)
    }
  }, [])

  const layers = [
    // Outer status ring (larger circle, drawn first)
    new ScatterplotLayer<LNode>({
      id: "rings",
      data: nodes,
      getPosition: n => [n.x, n.y, 0],
      getRadius: n => n.radius + 5,
      getFillColor: n => hoveredId === n.id ? brighten(n.ring, 1.2) : n.ring,
      pickable: false,
      updateTriggers: { getFillColor: [hoveredId] },
    }),
    // Inner type fill
    new ScatterplotLayer<LNode>({
      id: "nodes",
      data: nodes,
      getPosition: n => [n.x, n.y, 0],
      getRadius: n => n.radius,
      getFillColor: n => hoveredId === n.id ? brighten(n.fill, 1.4) : n.fill,
      pickable: true,
      onClick: handleClick,
      onHover: handleHover,
      updateTriggers: { getFillColor: [hoveredId] },
    }),
    // Bezier edges
    new PathLayer<LEdge>({  
      id: "edges",
      data: edges,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getPath: (e: LEdge) => e.path as any,
      getColor: e => e.color,
      getWidth: 1.5,
      pickable: false,
    }),
    // Labels (short key only)
    new TextLayer<LNode>({
      id: "labels",
      data: nodes,
      getPosition: n => [n.x + n.radius + 6, n.y, 0],
      getText: n => n.label,
      getSize: 10,
      sizeUnits: "common",
      getColor: [215, 220, 240, 200] as RGBA,
      getTextAnchor: "start",
      getAlignmentBaseline: "center",
      fontSettings: { sdf: true, smoothing: 0.15 },
      outlineWidth: 2.5,
      outlineColor: [12, 14, 20, 255] as RGBA,
      characterSet: "auto",
      pickable: false,
    }),
  ]

  return (
    <div className={styles.wrapper}>
      {/* Top controls */}
      <div className={styles.controls}>
        <button
          className={styles.btn}
          onClick={() => setExpanded(new Set(data.epics.map(e => e.key)))}
        >
          Reset
        </button>
        <button
          className={styles.btn}
          onClick={() => setExpanded(new Set(flatTree.byId.keys()))}
        >
          Expand all
        </button>
        <button
          className={styles.btn}
          onClick={() => setExpanded(new Set())}
        >
          Collapse all
        </button>
        <span className={styles.hint}>
          Click node to expand/collapse · leaf nodes open Jira/GitHub · drag to pan · scroll to zoom
        </span>
        <span className={styles.stats}>
          {data.stats.epics} epics · {data.stats.sprints} sprints · {data.stats.stories} stories · {data.stats.prs} PRs
        </span>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className={styles.canvas}>
        <DeckGL
          views={[new OrthographicView({ id: "ortho", controller: { scrollZoom: true, dragPan: true } })]}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          initialViewState={initialViewState as any}
          layers={layers}
          width={canvasSize.width}
          height={canvasSize.height}
        />
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className={styles.tooltip}
          style={{ left: tooltip.x + 14, top: Math.max(8, tooltip.y - 10) }}
        >
          <div className={styles.ttType}>{tooltip.node.type}</div>
          <div className={styles.ttTitle}>{tooltip.node.title}</div>
          <div className={styles.ttStatus}>
            {STATUS_LABEL[tooltip.node.status] ?? tooltip.node.status}
          </div>
          {tooltip.node.meta.assignee && (
            <div className={styles.ttMeta}>{tooltip.node.meta.assignee}</div>
          )}
          {tooltip.node.meta.storyPoints != null && (
            <div className={styles.ttMeta}>{tooltip.node.meta.storyPoints} pts</div>
          )}
          {tooltip.node.meta.daysOld != null && tooltip.node.meta.daysOld > 0 && (
            <div className={`${styles.ttMeta} ${tooltip.node.meta.daysOld > 14 ? styles.ttStale : ""}`}>
              {tooltip.node.meta.daysOld}d old
            </div>
          )}
          <div className={styles.ttHint}>
            {tooltip.node.hasChildren
              ? tooltip.node.isExpanded ? "▼ click to collapse" : "▶ click to expand"
              : tooltip.node.url ? "↗ click to open" : ""}
          </div>
        </div>
      )}

      {/* Detail panel */}
      {panel && (
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <span
              className={styles.panelTypePill}
              style={{ background: `rgba(${nodeFill(panel.type, panel.meta.issuetype ?? panel.meta.prState ?? "", false).slice(0, 3).join(",")},0.3)` }}
            >
              {panel.type}
            </span>
            <button className={styles.panelClose} onClick={() => setPanel(null)}>✕</button>
          </div>
          <div className={styles.panelTitle}>{panel.title}</div>
          <div className={`${styles.panelStatus} ${panel.status === "in_progress" ? styles.psInProgress : panel.status === "done" ? styles.psDone : panel.status === "blocked" ? styles.psBlocked : panel.status === "in_review" ? styles.psInReview : styles.psTodo}`}>
            {STATUS_LABEL[panel.status] ?? panel.status}
          </div>
          {panel.meta.issuetype && (
            <div className={styles.panelRow}><span>Type</span><span>{panel.meta.issuetype}</span></div>
          )}
          {panel.meta.assignee && (
            <div className={styles.panelRow}><span>Assignee</span><span>{panel.meta.assignee}</span></div>
          )}
          {panel.meta.storyPoints != null && (
            <div className={styles.panelRow}><span>Points</span><span>{panel.meta.storyPoints}</span></div>
          )}
          {panel.meta.prState && (
            <div className={styles.panelRow}><span>PR state</span><span>{panel.meta.prState}</span></div>
          )}
          {panel.meta.daysOld != null && (
            <div className={styles.panelRow}><span>Age</span><span>{panel.meta.daysOld}d</span></div>
          )}
          {panel.url && (
            <a
              href={panel.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.panelLink}
            >
              Open in {panel.type === "pr" ? "GitHub" : "Jira"} ↗
            </a>
          )}
        </div>
      )}

      {/* Legend */}
      <div className={styles.legend}>
        <div className={styles.legendGroup}>
          <div className={styles.legendHeading}>Node type</div>
          {NODE_LEGEND.map(item => (
            <div key={item.label} className={styles.legendRow}>
              <span className={styles.legendDot} style={{ background: item.color }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <div className={styles.legendDivider} />
        <div className={styles.legendGroup}>
          <div className={styles.legendHeading}>Ring = status</div>
          {RING_LEGEND.map(item => (
            <div key={item.label} className={styles.legendRow}>
              <span className={styles.legendRing} style={{ borderColor: item.color }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
