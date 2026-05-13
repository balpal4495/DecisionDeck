"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import type { GraphData, GraphNode, PRCoverageRow, PRSignal } from "@/lib/graph"
import styles from "./ForceGraph.module.css"

// ── Shared constants ───────────────────────────────────────────────────────────

type Tab = "alignment" | "coverage"

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

const SIGNAL_META: Record<PRSignal, { label: string; color: string; bg: string }> = {
  superseded:     { label: "Superseded",     color: "#fb923c", bg: "rgba(251,146,60,0.12)" },
  orphan:         { label: "Orphan",         color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  stale:          { label: "Stale",          color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  "no-key":       { label: "No key",         color: "#9ca3af", bg: "rgba(156,163,175,0.10)" },
  "cross-project":{ label: "Cross-project",  color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
  matched:        { label: "Matched",        color: "#4ade80", bg: "rgba(74,222,128,0.12)" },
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALIGNMENT VIEW — bipartite SVG
// ═══════════════════════════════════════════════════════════════════════════════

const NODE_H  = 34
const NODE_W  = 200
const STRIDE  = NODE_H + 7
const PAD_TOP = 54
const PAD_H   = 20

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

  const relevant = jiraNds.filter(n => {
    // Always include nodes that have a linked PR
    if (linkedJira.has(n.id)) return true
    // Exclude unlinked sub-tasks — they are too granular for the alignment view.
    // Now that 600+ tickets are synced (many are Sub-tasks), unlinked sub-tasks
    // would flood the left column. Only show them when they have a matched PR.
    if (n.isSubtask) return false
    return n.sprintState === "active" ||
      n.workClass === "deliverable" || n.workClass === "zombie"
  })
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

function SvgNode({ ln, hovered, selected, onEnter, onLeave, onClick }: {
  ln: LNode; hovered: boolean; selected: boolean
  onEnter: () => void; onLeave: () => void
  onClick: (e: React.MouseEvent<SVGGElement>) => void
}) {
  const { node, x, y, linked } = ln
  const accent = node.nodeType === "pr" ? "#a855f7" : (WC_COLOR[node.workClass ?? "placeholder"] ?? "#374151")
  const bg     = hovered || selected ? "#22263a" : "#1a1d27"
  const stroke = selected ? accent : hovered ? "#4b5563" : "#2e3350"
  const alpha  = selected || hovered ? 1 : linked ? 0.9 : 0.42
  const sub    = node.nodeType === "pr" ? node.fullTitle : (node.assignee ?? "unassigned")
  const subTxt = sub.length > 23 ? sub.slice(0, 22) + "…" : sub

  return (
    <g transform={`translate(${x},${y})`} style={{ cursor: "pointer", opacity: alpha }}
      onMouseEnter={onEnter} onMouseLeave={onLeave} onClick={onClick}>
      <rect width={NODE_W} height={NODE_H} rx={4} fill={bg} stroke={stroke} strokeWidth={selected ? 1.5 : 1} />
      <rect x={0} y={0} width={3} height={NODE_H} rx={1} fill={accent} />
      <circle cx={NODE_W - 10} cy={NODE_H / 2} r={3.5} fill={heatColor(node.daysStale)} />
      <text x={10} y={12} fontSize={9.5} fontFamily="SF Mono, Fira Code, monospace" fill="#6b7280" dominantBaseline="middle">{node.label}</text>
      <text x={10} y={25} fontSize={11} fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fill="#d1d5db" dominantBaseline="middle">{subTxt}</text>
      {!linked && <circle cx={NODE_W - 22} cy={NODE_H / 2} r={3} fill={node.nodeType === "jira" ? "#ef4444" : "#f59e0b"} />}
    </g>
  )
}

function DetailPanel({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  return (
    <div className={styles.detail} onClick={e => e.stopPropagation()}>
      <div className={styles.detailHead}>
        <span className={`${styles.typeBadge} ${node.nodeType === "pr" ? styles.typeBadgePr : styles.typeBadgeJira}`}>
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
        <MetaRow label="Activity" value={node.daysStale >= 0 ? `${node.daysStale}d ago — ${heatLabel(node.daysStale)}` : "—"} />
        <MetaRow label="Signal"   value={node.pulseState} />
      </dl>
      {node.externalUrl && (
        <a href={node.externalUrl} target="_blank" rel="noreferrer" className={styles.openLink}>Open ↗</a>
      )}
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return <><dt className={styles.metaLabel}>{label}</dt><dd className={styles.metaValue}>{value}</dd></>
}

function AlignmentView({ data }: { data: GraphData }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth]       = useState(900)
  const [hoverId, setHoverId]   = useState<string | null>(null)
  const [selected, setSelected] = useState<GraphNode | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(e => setWidth(Math.floor(e[0].contentRect.width)))
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
    setSelected(prev => prev?.id === node.id ? null : node)
  }, [])

  return (
    <div ref={containerRef} className={styles.canvas} onClick={() => setSelected(null)}>
      <svg width={width} height={layout.svgHeight} style={{ display: "block" }}>
        <text x={PAD_H} y={20} fontSize={11} fontFamily="var(--font-sans)" fontWeight={600} letterSpacing="0.07em" fill="#6b7280">JIRA — PLAN</text>
        <text x={width - PAD_H} y={20} fontSize={11} fontFamily="var(--font-sans)" fontWeight={600} letterSpacing="0.07em" fill="#6b7280" textAnchor="end">GITHUB — CODE</text>
        <text x={PAD_H} y={36} fontSize={10} fontFamily="var(--font-sans)" fill="#374151">active sprint · deliverables · zombies</text>
        <text x={width - PAD_H} y={36} fontSize={10} fontFamily="var(--font-sans)" fill="#374151" textAnchor="end">all open PRs</text>

        {layout.links.map(link => {
          const x1 = link.left.x + NODE_W, y1 = link.left.y + NODE_H / 2
          const x2 = link.right.x,         y2 = link.right.y + NODE_H / 2
          const cx = (x1 + x2) / 2
          const active = hoverId === link.left.node.id || hoverId === link.right.node.id ||
                         selected?.id === link.left.node.id || selected?.id === link.right.node.id
          return (
            <path key={link.id}
              d={`M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`}
              stroke="#22c55e" strokeWidth={active ? 2.5 : 1.5}
              strokeOpacity={active ? 0.9 : 0.22} fill="none" />
          )
        })}

        {layout.left.map(ln => (
          <SvgNode key={ln.node.id} ln={ln}
            hovered={hoverId === ln.node.id || hoverId === linkedPartner.get(ln.node.id)}
            selected={selected?.id === ln.node.id}
            onEnter={() => handleEnter(ln.node.id)} onLeave={handleLeave}
            onClick={e => handleSelect(ln.node, e)} />
        ))}
        {layout.right.map(ln => (
          <SvgNode key={ln.node.id} ln={ln}
            hovered={hoverId === ln.node.id || hoverId === linkedPartner.get(ln.node.id)}
            selected={selected?.id === ln.node.id}
            onEnter={() => handleEnter(ln.node.id)} onLeave={handleLeave}
            onClick={e => handleSelect(ln.node, e)} />
        ))}
      </svg>

      {selected && <DetailPanel node={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PR COVERAGE VIEW — PR-first investigation table
// ═══════════════════════════════════════════════════════════════════════════════

const SIGNAL_ORDER: PRSignal[] = ["superseded", "orphan", "stale", "no-key", "cross-project", "matched"]

function SignalBadge({ signal }: { signal: PRSignal }) {
  const m = SIGNAL_META[signal]
  return (
    <span className={styles.signalBadge} style={{ color: m.color, background: m.bg }}>
      {m.label}
    </span>
  )
}

function PrStatusDot({ status }: { status: string }) {
  const color = status === "open" ? "#a855f7" : status === "merged" ? "#22c55e" : "#6b7280"
  return <span className={styles.prStatusDot} style={{ background: color }} title={status} />
}

function JiraGHCell({ gh }: { gh: PRCoverageRow["jiraGH"] }) {
  if (!gh) return <span className={styles.ghNone}>—</span>
  const stateColor = gh.prState === "MERGED" ? "#22c55e" : gh.prState === "OPEN" ? "#a855f7" : "#6b7280"
  return (
    <span className={styles.ghCell}>
      <span style={{ color: stateColor, fontWeight: 600 }}>{gh.prState ?? "—"}</span>
      {" · "}
      <span className={styles.ghCount}>{gh.prCount} PR{gh.prCount !== 1 ? "s" : ""}</span>
      {gh.daysSince >= 0 && (
        <>
          {" · "}
          <span className={styles.ghAge}>{gh.daysSince}d ago</span>
        </>
      )}
    </span>
  )
}

function CoverageRow({ row }: { row: PRCoverageRow }) {
  const [open, setOpen] = useState(false)
  const titleShort = row.prTitle.length > 60 ? row.prTitle.slice(0, 59) + "…" : row.prTitle

  return (
    <>
      <tr
        className={`${styles.covRow} ${open ? styles.covRowOpen : ""}`}
        onClick={() => setOpen(o => !o)}
      >
        {/* PR */}
        <td className={styles.covCellPr}>
          <div className={styles.prIdLine}>
            <PrStatusDot status={row.prStatus} />
            <span className={styles.prNum}>#{row.prNum}</span>
          </div>
          <div className={styles.prTitleShort}>{titleShort}</div>
        </td>

        {/* Extracted key */}
        <td className={styles.covCellKey}>
          {row.extractedKey
            ? <span className={styles.keyBadge}>{row.extractedKey}</span>
            : <span className={styles.noKey}>—</span>}
        </td>

        {/* Jira ticket */}
        <td className={styles.covCellTicket}>
          {row.jiraFound && row.jiraTitle
            ? <span className={styles.ticketTitle}>{row.jiraTitle.length > 40 ? row.jiraTitle.slice(0, 39) + "…" : row.jiraTitle}</span>
            : <span className={styles.noKey}>{row.extractedKey ? "not found" : "—"}</span>}
        </td>

        {/* Sprint */}
        <td className={styles.covCellSprint}>
          {row.jiraSprint
            ? <span className={`${styles.sprintBadge} ${row.jiraSprintState === "active" ? styles.sprintActive : ""}`}>{row.jiraSprint}</span>
            : <span className={styles.noKey}>—</span>}
        </td>

        {/* PR age */}
        <td className={styles.covCellAge}>
          {row.prDaysOld >= 0
            ? <span style={{ color: heatColor(row.prDaysOld) }}>{row.prDaysOld}d</span>
            : <span className={styles.noKey}>—</span>}
        </td>

        {/* Jira says (native GitHub integration) */}
        <td className={styles.covCellGH}>
          <JiraGHCell gh={row.jiraGH} />
        </td>

        {/* Signal */}
        <td className={styles.covCellSignal}>
          <SignalBadge signal={row.signal} />
        </td>
      </tr>

      {/* Expanded detail row */}
      {open && (
        <tr className={styles.covExpandRow}>
          <td colSpan={7}>
            <div className={styles.covExpand}>
              <div className={styles.covExpandGrid}>
                <span className={styles.covExpandLabel}>Signal</span>
                <span>{row.signalNote}</span>

                <span className={styles.covExpandLabel}>PR title</span>
                <span>{row.prTitle}</span>

                {row.jiraFound && <>
                  <span className={styles.covExpandLabel}>Ticket status</span>
                  <span>{row.jiraStatus} · {row.jiraWorkClass} · {row.jiraAssignee ?? "unassigned"}</span>
                </>}

                {row.jiraIsSubtask && row.jiraParentKey && <>
                  <span className={styles.covExpandLabel}>Parent story</span>
                  <span>
                    {row.jiraUrl
                      ? <a href={row.jiraUrl.replace(/\/browse\/.*$/, `/browse/${row.jiraParentKey}`)} target="_blank" rel="noreferrer" className={styles.openLink}>{row.jiraParentKey}</a>
                      : <span className={styles.keyBadge}>{row.jiraParentKey}</span>
                    }
                    {" "}{row.jiraParentTitle}
                  </span>
                </>}

                {row.jiraGH && <>
                  <span className={styles.covExpandLabel}>Jira GitHub</span>
                  <span>{row.jiraGH.prCount} PR(s) · {row.jiraGH.prState} · last updated {row.jiraGH.daysSince >= 0 ? `${row.jiraGH.daysSince}d ago` : "unknown"}</span>
                </>}
              </div>
              <div className={styles.covExpandLinks}>
                {row.prUrl && <a href={row.prUrl} target="_blank" rel="noreferrer" className={styles.openLink}>PR ↗</a>}
                {row.jiraUrl && <a href={row.jiraUrl} target="_blank" rel="noreferrer" className={styles.openLink}>Ticket ↗</a>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function PRCoverageView({ rows }: { rows: PRCoverageRow[] }) {
  const [filter, setFilter] = useState<PRSignal | "all">("all")

  const counts = useMemo(() => {
    const c: Partial<Record<PRSignal | "all", number>> = { all: rows.length }
    for (const s of SIGNAL_ORDER) c[s] = rows.filter(r => r.signal === s).length
    return c
  }, [rows])

  const filtered = filter === "all" ? rows : rows.filter(r => r.signal === filter)

  return (
    <div className={styles.coverageWrap}>
      {/* Filter chips */}
      <div className={styles.coverageFilters}>
        {(["all", ...SIGNAL_ORDER] as (PRSignal | "all")[]).map(s => {
          const count = counts[s] ?? 0
          if (s !== "all" && count === 0) return null
          const m = s === "all" ? null : SIGNAL_META[s]
          return (
            <button
              key={s}
              className={`${styles.sigFilter} ${filter === s ? styles.sigFilterActive : ""}`}
              style={filter === s && m ? { borderColor: m.color, color: m.color } : undefined}
              onClick={() => setFilter(s)}
            >
              {s === "all" ? "All" : SIGNAL_META[s].label}
              {count > 0 && <span className={styles.sigCount}>{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className={styles.coverageScroll}>
        <table className={styles.covTable}>
          <thead>
            <tr>
              <th className={styles.covThPr}>PR</th>
              <th className={styles.covThKey}>Jira key</th>
              <th className={styles.covThTicket}>Ticket</th>
              <th className={styles.covThSprint}>Sprint</th>
              <th className={styles.covThAge}>Age</th>
              <th className={styles.covThGH}>Jira says</th>
              <th className={styles.covThSignal}>Signal</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(row => <CoverageRow key={row.prExternalId} row={row} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT — tab switcher
// ═══════════════════════════════════════════════════════════════════════════════

interface Props {
  data: GraphData
  prCoverage: PRCoverageRow[]
}

export function ForceGraph({ data, prCoverage }: Props) {
  const [tab, setTab] = useState<Tab>("alignment")

  const linkedCount   = data.links.length
  const codelessCount = data.nodes.filter(n => n.nodeType === "jira" && !data.links.some(l => l.source === n.id)).length
  const shadowCount   = data.nodes.filter(n => n.nodeType === "pr"   && !data.links.some(l => l.target === n.id)).length

  const problemCount  = prCoverage.filter(r => r.signal !== "matched" && r.signal !== "cross-project").length

  return (
    <div className={styles.wrapper}>
      {/* ── Header with tabs ── */}
      <div className={styles.bar}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === "alignment" ? styles.tabActive : ""}`}
            onClick={() => setTab("alignment")}
          >
            Alignment
          </button>
          <button
            className={`${styles.tab} ${tab === "coverage" ? styles.tabActive : ""}`}
            onClick={() => setTab("coverage")}
          >
            PR Coverage
            {problemCount > 0 && <span className={styles.tabBadge}>{problemCount}</span>}
          </button>
        </div>

        <div className={styles.summaryChips}>
          {tab === "alignment" ? <>
            <span className={`${styles.chip} ${styles.chipGreen}`}>{linkedCount} linked</span>
            <span className={`${styles.chip} ${styles.chipRed}`}>{codelessCount} no PR</span>
            <span className={`${styles.chip} ${styles.chipOrange}`}>{shadowCount} shadow</span>
          </> : <>
            <span className={`${styles.chip} ${styles.chipOrange}`}>{prCoverage.filter(r => r.signal === "superseded").length} superseded</span>
            <span className={`${styles.chip} ${styles.chipRed}`}>{prCoverage.filter(r => r.signal === "stale").length} stale</span>
            <span className={`${styles.chip} ${styles.chipGrey}`}>{prCoverage.filter(r => r.signal === "no-key").length} no key</span>
          </>}
        </div>
      </div>

      {/* ── View ── */}
      {tab === "alignment"
        ? <AlignmentView data={data} />
        : <PRCoverageView rows={prCoverage} />}

      {/* ── Legend (alignment only) ── */}
      {tab === "alignment" && (
        <div className={styles.legend}>
          <span className={styles.legendLabel}>WorkClass:</span>
          {([["#22c55e","deliverable"],["#3b82f6","planned"],["#52525b","container"],["#ef4444","zombie"],["#a855f7","PR"]] as [string,string][]).map(([color,label]) => (
            <span key={label} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: color }} />{label}
            </span>
          ))}
          <span className={styles.legendSep} />
          <span className={styles.legendLabel}>Heat:</span>
          {([["#22c55e","hot"],["#3b82f6","warm"],["#f59e0b","cold"],["#6b7280","frozen"]] as [string,string][]).map(([color,label]) => (
            <span key={`h-${label}`} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: color }} />{label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
