"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import dynamic from "next/dynamic"
import type { GraphData, GraphNode, GraphLink } from "@/lib/graph"
import styles from "./ForceGraph.module.css"

// Three.js / WebGL — must not render on the server
const ForceGraph3D = dynamic(() => import("react-force-graph-3d"), {
  ssr: false,
  loading: () => (
    <div className={styles.loading}>
      <span className={styles.loadingDot} />
      Initialising WebGL…
    </div>
  ),
})

// ── Colour scheme ──────────────────────────────────────────────────────────────

const JIRA_COLOR: Record<string, string> = {
  deliverable: "#22c55e",  // green
  planned:     "#3b82f6",  // blue
  container:   "#71717a",  // zinc
  zombie:      "#ef4444",  // red
  placeholder: "#374151",  // dark grey
}
const PR_COLOR = "#a855f7"  // purple

const LINK_COLOR: Record<string, string> = {
  "linked":           "#22c55e",
  "codeless-ticket":  "#3b82f6",
  "untracked-pr":     "#f59e0b",
  "zombie":           "#ef4444",
}

function nodeColor(n: GraphNode): string {
  if (n.nodeType === "pr") return PR_COLOR
  return JIRA_COLOR[n.workClass ?? "placeholder"] ?? "#374151"
}

function nodeSize(n: GraphNode): number {
  if (n.nodeType === "pr") return 3
  const pts = n.storyPoints ?? 0
  return Math.max(4, Math.min(18, pts * 1.5 + 4))
}

function heatLabel(days: number): string {
  if (days < 0) return "—"
  if (days < 3) return "Hot (<3d)"
  if (days < 14) return "Warm (3–14d)"
  if (days < 30) return "Cold (14–30d)"
  return "Frozen (30d+)"
}

// ── Filter types ───────────────────────────────────────────────────────────────

type FilterKey = "all" | "active-sprint" | "deliverables" | "linked-only"

const FILTER_LABELS: Record<FilterKey, string> = {
  "all":           "All",
  "active-sprint": "Active sprint",
  "deliverables":  "Deliverables",
  "linked-only":   "Linked only",
}

// ── Legend items ──────────────────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { color: JIRA_COLOR.deliverable, label: "deliverable" },
  { color: JIRA_COLOR.planned,     label: "planned" },
  { color: JIRA_COLOR.container,   label: "container" },
  { color: JIRA_COLOR.zombie,      label: "zombie" },
  { color: PR_COLOR,               label: "PR" },
]

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  data: GraphData
}

export function ForceGraph({ data }: Props) {
  const [filter, setFilter] = useState<FilterKey>("all")
  const [selected, setSelected] = useState<GraphNode | null>(null)
  const [dimensions, setDimensions] = useState({ w: 800, h: 600 })
  const canvasRef = useRef<HTMLDivElement>(null)

  // Measure container with ResizeObserver
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => {
      const r = entries[0].contentRect
      setDimensions({ w: Math.floor(r.width), h: Math.floor(r.height) })
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Filter graph data
  const filtered = useMemo<GraphData>(() => {
    if (filter === "all") return data

    const keep = new Set<string>()

    for (const n of data.nodes) {
      if (filter === "active-sprint") {
        if (n.nodeType === "jira" && n.sprintState !== "active") continue
      } else if (filter === "deliverables") {
        if (n.nodeType === "jira" && n.workClass !== "deliverable" && n.workClass !== "planned") continue
      } else if (filter === "linked-only") {
        if (n.pulseState !== "linked") continue
      }
      keep.add(n.id)
    }

    // Always include the PR end of any Jira–PR link whose Jira node is kept
    for (const link of data.links) {
      const src = link.source as string
      const tgt = link.target as string
      if (keep.has(src)) keep.add(tgt)
      if (keep.has(tgt)) keep.add(src)
    }

    return {
      nodes: data.nodes.filter(n => keep.has(n.id)),
      links: data.links.filter(l => keep.has(l.source as string) && keep.has(l.target as string)),
    }
  }, [data, filter])

  const handleNodeClick = useCallback((node: object) => {
    setSelected(node as GraphNode)
  }, [])

  const handleBgClick = useCallback(() => {
    setSelected(null)
  }, [])

  const jiraCount = filtered.nodes.filter(n => n.nodeType === "jira").length
  const prCount   = filtered.nodes.filter(n => n.nodeType === "pr").length
  const linkCount = filtered.links.length

  return (
    <div className={styles.wrapper}>
      {/* ── Filter bar ── */}
      <div className={styles.bar}>
        <div className={styles.barInfo}>
          <span className={styles.barTitle}>Dependency Graph</span>
          <span className={styles.barSub}>
            {jiraCount} tickets · {prCount} PRs · {linkCount} edges
          </span>
        </div>
        <div className={styles.filters}>
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`${styles.filterBtn} ${filter === f ? styles.filterBtnActive : ""}`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* ── WebGL canvas ── */}
      <div ref={canvasRef} className={styles.canvas}>
        <ForceGraph3D
          graphData={filtered}
          width={dimensions.w}
          height={dimensions.h}
          backgroundColor="#0f1117"
          nodeId="id"
          nodeLabel={(n: object) => {
            const node = n as GraphNode
            return `${node.label}: ${node.fullTitle.slice(0, 80)}`
          }}
          nodeColor={(n: object) => nodeColor(n as GraphNode)}
          nodeVal={(n: object) => nodeSize(n as GraphNode)}
          linkColor={(l: object) => LINK_COLOR[(l as GraphLink).pulseState] ?? "#6b7280"}
          linkWidth={1.5}
          linkOpacity={0.7}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleWidth={2}
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBgClick}
        />

        {/* ── Legend ── */}
        <div className={styles.legend}>
          {LEGEND_ITEMS.map(({ color, label }) => (
            <span key={label} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: color }} />
              {label}
            </span>
          ))}
          <span className={styles.legendSep} />
          <span className={styles.legendItem}>
            <span className={styles.legendLine} />
            Jira ↔ PR link
          </span>
        </div>

        {/* ── Detail panel ── */}
        {selected && (
          <DetailPanel node={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        <span
          className={`${styles.typeBadge} ${
            node.nodeType === "pr" ? styles.typeBadgePr : styles.typeBadgeJira
          }`}
        >
          {node.nodeType === "pr" ? "GitHub PR" : "Jira"}
        </span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </div>

      <div className={styles.detailKey}>{node.label}</div>
      <div className={styles.detailTitle}>{node.fullTitle}</div>

      <dl className={styles.meta}>
        <MetaRow label="Status"    value={node.status} />
        {node.nodeType === "jira" && (
          <>
            <MetaRow label="Class"    value={node.workClass ?? "—"} />
            <MetaRow label="Sprint"   value={node.sprint ?? "none"} />
            <MetaRow label="Points"   value={node.storyPoints != null ? String(node.storyPoints) : "—"} />
            <MetaRow label="Assignee" value={node.assignee ?? "unassigned"} />
          </>
        )}
        <MetaRow
          label="Last active"
          value={node.daysStale >= 0 ? `${node.daysStale}d ago — ${heatLabel(node.daysStale)}` : "—"}
        />
        <MetaRow label="Signal" value={node.pulseState} />
      </dl>

      {node.externalUrl && (
        <a
          href={node.externalUrl}
          target="_blank"
          rel="noreferrer"
          className={styles.openLink}
        >
          Open ↗
        </a>
      )}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className={styles.metaLabel}>{label}</dt>
      <dd className={styles.metaValue}>{value}</dd>
    </>
  )
}
