"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import type { GraphData, GraphNode } from "@/lib/graph"
import styles from "./ForceGraph.module.css"

// ── Layout constants ───────────────────────────────────────────────────────────

const NODE_H  = 34
const NODE_W  = 200
const STRIDE  = NODE_H + 7   // row height including gap
const PAD_TOP = 54            // space for column headers
const PAD_H   = 20            // horizontal padding from edge

// ── Colour helpers ─────────────────────────────────────────────────────────────

function heatColor(days: number): string {
  if (days < 0)  return "#374151"
  if (days < 3)  return "#22c55e"
  if (days < 14) return "#3b82f6"
  if (days < 30) return "#f59e0b"
  return "#6b7280"
}

function heatLabel(days: number): string {
  if (days < 0)  return "—"
  if (days < 3)  return "Hot (<3d)"
  if (days < 14) return "Warm (3–14d)"
  if (days < 30) return "Cold (14–30d)"
  return "Frozen (30d+)"
}

const WC_COLOR: Record<string, string> = {
  deliverable: "#22c55e",
  planned:     "#3b82f6",
  container:   "#52525b",
  zombie:      "#ef4444",
  placeholder: "#374151",
}

// ── Layout types & builder ─────────────────────────────────────────────────────

interface LNode { node: GraphNode; x: number; y: number; linked: boolean }
interface LLink { left: LNode; right: LNode; id: string }
interface Layout { left: LNode[]; right: LNode[]; links: LLink[]; svgHeight: number }

function wcRank(n: GraphNode): number {
  switch (n.workClass) {
    case "deliverable": return 0
    case "planned":     return 1
    case "zombie":      return 3
    default:            return 2
  }
}

function buildLayout(data: GraphData, width: number): Layout {
  const jiraNds = data.nodes.filter(n => n.nodeType === "jira")
  const prNds   = data.nodes.filter(n => n.nodeType === "pr")

  const linkedJira = new Set<string>()
  const linkedPr   = new Set<string>()
  for (const l of data.links) {
    linkedJira.add(l.source as string)
    linkedPr.add(l.target as string)
  }

  // Left: active sprint + deliverables + zombies + linked — filter out the noise
  const relevant = jiraNds.filter(n =>
    linkedJira.has(n.id) ||
    n.sprintState === "active" ||
    n.workClass === "deliverable" ||
    n.workClass === "zombie"
  )

  relevant.sort((a, b) => {
    const aLnk = linkedJira.has(a.id) ? 0 : 1
    const bLnk = linkedJira.has(b.id) ? 0 : 1
    if (aLnk !== bLnk) return aLnk - bLnk
    const aSp = a.sprintState === "active" ? 0 : 1
    const bSp = b.sprintState === "active" ? 0 : 1
    if (aSp !== bSp) return aSp - bSp
    if (wcRank(a) !== wcRank(b)) return wcRank(a) - wcRank(b)
    return (a.daysStale ?? 999) - (b.daysStale ?? 999)
  })

  const sortedPr = [...prNds].sort((a, b) => {
    const aLnk = linkedPr.has(a.id) ? 0 : 1
    const bLnk = linkedPr.has(b.id) ? 0 : 1
    if (aLnk !== bLnk) return aLnk - bLnk
    return (a.daysStale ?? 999) - (b.daysStale ?? 999)
  })

  const leftX  = PAD_H
  const rightX = width - PAD_H - NODE_W

  const left:  LNode[] = relevant.map((node, i) => ({
    node, x: leftX, y: PAD_TOP + i * STRIDE, linked: linkedJira.has(node.id),
  }))
  const right: LNode[] = sortedPr.map((node, i) => ({
    node, x: rightX, y: PAD_TOP + i * STRIDE, linked: linkedPr.has(node.id),
  }))

  const leftById  = new Map(left.map(n => [n.node.id, n]))
  const rightById = new Map(right.map(n => [n.node.id, n]))

  const links: LLink[] = data.links.flatMap(l => {
    const lft = leftById.get(l.source as string)
    const rgt = rightById.get(l.target as string)
    if (!lft || !rgt) return []
    return [{ left: lft, right: rgt, id: `${l.source}~~${l.target}` }]
  })

  const svgHeight = PAD_TOP + Math.max(left.length, right.length) * STRIDE + 40
  return { left, right, links, svgHeight }
}

// ── SVG node ───────────────────────────────────────────────────────────────────

function SvgNode({
  ln, hovered, selected, onEnter, onLeave, onClick,
}: {
  ln: LNode
  hovered: boolean
  selected: boolean
  onEnter: () => void
  onLeave: () => void
  onClick: (e: React.MouseEvent<SVGGElement>) => void
}) {
  const { node, x, y, linked } = ln
  const accent = node.nodeType === "pr"
    ? "#a855f7"
    : (WC_COLOR[node.workClass ?? "placeholder"] ?? "#374151")
  const bg     = hovered || selected ? "#22263a" : "#1a1d27"
  const stroke = selected ? accent : hovered ? "#4b5563" : "#2e3350"
  const alpha  = selected || hovered ? 1 : linked ? 0.9 : 0.42
  const sub    = node.assignee ?? (node.nodeType === "pr" ? "shadow PR" : "unassigned")
  const subTxt = sub.length > 23 ? sub.slice(0, 22) + "…" : sub

  return (
    <g
      transform={`translate(${x},${y})`}
      style={{ cursor: "pointer", opacity: alpha }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      <rect
        width={NODE_W} height={NODE_H} rx={4}
        fill={bg} stroke={stroke} strokeWidth={selected ? 1.5 : 1}
      />
      <rect x={0} y={0} width={3} height={NODE_H} rx={1} fill={accent} />
      <circle cx={NODE_W - 10} cy={NODE_H / 2} r={3.5} fill={heatColor(node.daysStale)} />
      <text
        x={10} y={12}
        fontSize={9.5} fontFamily="SF Mono, Fira Code, monospace"
        fill="#6b7280" dominantBaseline="middle"
      >{node.label}</text>
      <text
        x={10} y={25}
        fontSize={11} fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
        fill="#d1d5db" dominantBaseline="middle"
      >{subTxt}</text>
      {!linked && (
        <circle
          cx={NODE_W - 22} cy={NODE_H / 2} r={3}
          fill={node.nodeType === "jira" ? "#ef4444" : "#f59e0b"}
        />
      )}
    </g>
  )
}

// ── Detail panel ───────────────────────────────────────────────────────────────

function DetailPanel({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  return (
    <div className={styles.detail} onClick={e => e.stopPropagation()}>
      <div className={styles.detailHead}>
        <span
          className={`${styles.typeBadge} ${
            node.nodeType === "pr" ? styles.typeBadgePr : styles.typeBadgeJira
          }`}
        >
          {node.nodeType === "pr" ? "GitHub PR" : "Jira"}
        </span>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className={styles.detailKey}>{node.label}</div>
      <div className={styles.detailTitle}>{node.fullTitle}</div>
      <dl className={styles.meta}>
        <MetaRow label="Status"   value={node.status} />
        {node.nodeType === "jira" && <>
          <MetaRow label="Class"    value={node.workClass ?? "—"} />
          <MetaRow label="Sprint"   value={node.sprint ?? "none"} />
          <MetaRow label="Points"   value={node.storyPoints != null ? String(node.storyPoints) : "—"} />
          <MetaRow label="Assignee" value={node.assignee ?? "unassigned"} />
        </>}
        <MetaRow
          label="Activity"
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
        >Open ↗</a>
      )}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return <>
    <dt className={styles.metaLabel}>{label}</dt>
    <dd className={styles.metaValue}>{value}</dd>
  </>
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props { data: GraphData }

export function ForceGraph({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth]       = useState(900)
  const [hoverId, setHoverId]   = useState<string | null>(null)
  const [selected, setSelected] = useState<GraphNode | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries =>
      setWidth(Math.floor(entries[0].contentRect.width))
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const layout = useMemo(() => buildLayout(data, width), [data, width])

  const linkedPartner = useMemo(() => {
    const map = new Map<string, string>()
    for (const l of layout.links) {
      map.set(l.left.node.id, l.right.node.id)
      map.set(l.right.node.id, l.left.node.id)
    }
    return map
  }, [layout.links])

  const handleEnter  = useCallback((id: string) => setHoverId(id), [])
  const handleLeave  = useCallback(() => setHoverId(null), [])
  const handleSelect = useCallback((node: GraphNode, e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation()
    setSelected(prev => (prev?.id === node.id ? null : node))
  }, [])

  const linkedCount   = layout.links.length
  const codelessCount = layout.left.filter(n => !n.linked).length
  const shadowCount   = layout.right.filter(n => !n.linked).length

  return (
    <div className={styles.wrapper}>
      {/* Header */}
      <div className={styles.bar}>
        <div className={styles.barInfo}>
          <span className={styles.barTitle}>Alignment</span>
          <span className={styles.barSub}>
            Plan (Jira) vs Code (GitHub) · {layout.left.length} tickets · {layout.right.length} PRs
          </span>
        </div>
        <div className={styles.summaryChips}>
          <span className={`${styles.chip} ${styles.chipGreen}`}>{linkedCount} linked</span>
          <span className={`${styles.chip} ${styles.chipRed}`}>{codelessCount} no PR</span>
          <span className={`${styles.chip} ${styles.chipOrange}`}>{shadowCount} shadow</span>
        </div>
      </div>

      {/* Scrollable SVG */}
      <div
        ref={containerRef}
        className={styles.canvas}
        onClick={() => setSelected(null)}
      >
        <svg width={width} height={layout.svgHeight} style={{ display: "block" }}>
          <text x={PAD_H} y={20} fontSize={11} fontFamily="var(--font-sans)" fontWeight={600} letterSpacing="0.07em" fill="#6b7280">JIRA — PLAN</text>
          <text x={width - PAD_H} y={20} fontSize={11} fontFamily="var(--font-sans)" fontWeight={600} letterSpacing="0.07em" fill="#6b7280" textAnchor="end">GITHUB — CODE</text>
          <text x={PAD_H} y={36} fontSize={10} fontFamily="var(--font-sans)" fill="#374151">active sprint · deliverables · zombies</text>
          <text x={width - PAD_H} y={36} fontSize={10} fontFamily="var(--font-sans)" fill="#374151" textAnchor="end">all open PRs</text>

          {layout.links.map(link => {
            const x1 = link.left.x + NODE_W
            const y1 = link.left.y + NODE_H / 2
            const x2 = link.right.x
            const y2 = link.right.y + NODE_H / 2
            const cx = (x1 + x2) / 2
            const active =
              hoverId === link.left.node.id  || hoverId === link.right.node.id ||
              selected?.id === link.left.node.id || selected?.id === link.right.node.id
            return (
              <path
                key={link.id}
                d={`M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`}
                stroke="#22c55e"
                strokeWidth={active ? 2.5 : 1.5}
                strokeOpacity={active ? 0.9 : 0.22}
                fill="none"
              />
            )
          })}

          {layout.left.map(ln => (
            <SvgNode
              key={ln.node.id}
              ln={ln}
              hovered={hoverId === ln.node.id || hoverId === linkedPartner.get(ln.node.id)}
              selected={selected?.id === ln.node.id}
              onEnter={() => handleEnter(ln.node.id)}
              onLeave={handleLeave}
              onClick={e => handleSelect(ln.node, e)}
            />
          ))}

          {layout.right.map(ln => (
            <SvgNode
              key={ln.node.id}
              ln={ln}
              hovered={hoverId === ln.node.id || hoverId === linkedPartner.get(ln.node.id)}
              selected={selected?.id === ln.node.id}
              onEnter={() => handleEnter(ln.node.id)}
              onLeave={handleLeave}
              onClick={e => handleSelect(ln.node, e)}
            />
          ))}
        </svg>

        {selected && (
          <DetailPanel node={selected} onClose={() => setSelected(null)} />
        )}
      </div>

      {/* Legend footer */}
      <div className={styles.legend}>
        <span className={styles.legendLabel}>WorkClass:</span>
        {([
          ["#22c55e", "deliverable"],
          ["#3b82f6", "planned"],
          ["#52525b", "container"],
          ["#ef4444", "zombie"],
          ["#a855f7", "PR"],
        ] as [string, string][]).map(([color, label]) => (
          <span key={label} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: color }} />
            {label}
          </span>
        ))}
        <span className={styles.legendSep} />
        <span className={styles.legendLabel}>Heat:</span>
        {([
          ["#22c55e", "hot"],
          ["#3b82f6", "warm"],
          ["#f59e0b", "cold"],
          ["#6b7280", "frozen"],
        ] as [string, string][]).map(([color, label]) => (
          <span key={`h-${label}`} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: color }} />
            {label}
          </span>
        ))}
        <span className={styles.legendSep} />
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: "#ef4444" }} />
          no PR
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDot} style={{ background: "#f59e0b" }} />
          shadow
        </span>
      </div>
    </div>
  )
}
