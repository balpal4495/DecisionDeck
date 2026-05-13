"use client"

import { useRef, useState, useCallback, useMemo, useEffect } from "react"
import DeckGL from "@deck.gl/react"
import { OrthographicView } from "@deck.gl/core"
import { ScatterplotLayer, LineLayer, TextLayer } from "@deck.gl/layers"
import type {
  TimelineData,
  TimelineRow,
  TimelineEvent,
  TimelineException,
  EventType,
  ExceptionType,
} from "@/lib/timeline"
import {
  EVENT_COLOR,
  EVENT_LABEL,
  EVENT_RADIUS,
  EXCEPTION_COLOR,
  EXCEPTION_LABEL,
} from "@/lib/timeline"
import styles from "./TimelineGL.module.css"

// ── Layout constants ─────────────────────────────────────────────────────────

const ROW_H       = 36     // px per row
const ROW_PAD     = 10     // vertical padding within a row
const LABEL_W     = 220    // px for left label column (HTML)
const PAD_LEFT    = 16
const PAD_RIGHT   = 32
const HEADER_H    = 40     // time axis header height
const DOT_RADIUS  = 6      // base event dot radius in px
const TRACK_W     = 1.5    // connector line width

// ── Types ────────────────────────────────────────────────────────────────────

type HoverTarget =
  | { kind: "event";     item: TimelineEvent }
  | { kind: "exception"; item: TimelineException; row: TimelineRow }
  | null

interface Tooltip {
  x: number
  y: number
  target: HoverTarget
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function tsToX(ts: number, domainStart: number, domainEnd: number, width: number): number {
  const span = domainEnd - domainStart || 1
  return PAD_LEFT + ((ts - domainStart) / span) * (width - PAD_LEFT - PAD_RIGHT)
}

function rowToY(rowIndex: number): number {
  return HEADER_H + rowIndex * ROW_H + ROW_H / 2
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function exceptionBg(type: ExceptionType): string {
  const [r, g, b] = EXCEPTION_COLOR[type]
  return `rgba(${r},${g},${b},0.1)`
}

function exceptionBorder(type: ExceptionType): string {
  const [r, g, b] = EXCEPTION_COLOR[type]
  return `rgba(${r},${g},${b},0.5)`
}

// ── Tick builder ─────────────────────────────────────────────────────────────

function buildTicks(domainStart: number, domainEnd: number, width: number): { label: string; x: number }[] {
  const spanMs  = domainEnd - domainStart
  const spanDays = spanMs / 86_400_000
  // Pick a sensible tick interval
  const interval =
    spanDays <= 14  ? 1 :
    spanDays <= 60  ? 7 :
    spanDays <= 180 ? 14 :
    spanDays <= 365 ? 30 : 60  // days

  const ticks: { label: string; x: number }[] = []
  const startDay = new Date(domainStart)
  startDay.setHours(0, 0, 0, 0)

  let cursor = startDay.getTime()
  while (cursor <= domainEnd + interval * 86_400_000) {
    if (cursor >= domainStart) {
      const x = tsToX(cursor, domainStart, domainEnd, width)
      if (x >= PAD_LEFT && x <= width - PAD_RIGHT) {
        ticks.push({
          label: new Date(cursor).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
          x,
        })
      }
    }
    cursor += interval * 86_400_000
  }
  return ticks
}

// ── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  row,
  events,
  exceptions,
  onClose,
}: {
  row: TimelineRow
  events: TimelineEvent[]
  exceptions: TimelineException[]
  onClose: () => void
}) {
  const rowEvents = events.filter(e => e.rowKey === row.key).sort((a, b) => a.ts - b.ts)
  const rowExceptions = exceptions.filter(e => e.rowKey === row.key)

  return (
    <div className={styles.detail} role="dialog" aria-label={`Detail: ${row.key}`}>
      <div className={styles.detailHead}>
        <div>
          <span className={styles.detailKey}>
            {row.externalUrl
              ? <a href={row.externalUrl} target="_blank" rel="noreferrer">{row.key} ↗</a>
              : row.key}
          </span>
          {row.sprint && (
            <span className={`${styles.sprintBadge} ${row.sprintState === "active" ? styles.sprintActive : styles.sprintFuture}`}>
              {row.sprint}
            </span>
          )}
        </div>
        <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
      </div>

      <p className={styles.detailTitle}>{row.title}</p>

      {rowExceptions.length > 0 && (
        <div className={styles.detailExceptions}>
          {rowExceptions.map((ex, i) => (
            <div key={i} className={styles.exBadge} style={{ background: exceptionBg(ex.type), border: `1px solid ${exceptionBorder(ex.type)}` }}>
              ⚠ {ex.label}
            </div>
          ))}
        </div>
      )}

      <div className={styles.detailEvents}>
        {rowEvents.map(ev => (
          <div key={ev.id} className={styles.detailEvent}>
            <span className={styles.detailEventDot} style={{ background: `rgb(${EVENT_COLOR[ev.type].slice(0,3).join(",")})` }} />
            <div>
              <span className={styles.detailEventLabel}>{EVENT_LABEL[ev.type]}</span>
              <span className={styles.detailEventDate}>{formatDate(ev.ts)}</span>
            </div>
            {(ev.prUrl || ev.jiraUrl) && (
              <div className={styles.detailEventLinks}>
                {ev.prUrl   && <a href={ev.prUrl}   target="_blank" rel="noreferrer" className={styles.openLink}>PR ↗</a>}
                {ev.jiraUrl && <a href={ev.jiraUrl} target="_blank" rel="noreferrer" className={styles.openLink}>Ticket ↗</a>}
              </div>
            )}
          </div>
        ))}
      </div>

      {rowEvents.length >= 2 && (
        <div className={styles.detailDuration}>
          Span: {Math.round((rowEvents[rowEvents.length - 1].ts - rowEvents[0].ts) / 86_400_000)} days
        </div>
      )}
    </div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  const eventItems: { type: EventType; label: string }[] = [
    { type: "jira_created", label: "Created" },
    { type: "pr_opened",    label: "PR opened" },
    { type: "pr_review",    label: "Review" },
    { type: "pr_merged",    label: "Merged" },
    { type: "pr_closed",    label: "Closed (no merge)" },
    { type: "jira_closed",  label: "Ticket closed" },
  ]
  const exItems: { type: ExceptionType; label: string }[] = [
    { type: "no_pr",             label: "No PR" },
    { type: "stale_pr",          label: "Stale PR" },
    { type: "merged_not_closed", label: "Merged, ticket open" },
    { type: "long_review",       label: "Review overdue" },
  ]

  return (
    <div className={styles.legend}>
      <div className={styles.legendGroup}>
        <span className={styles.legendGroupLabel}>Events</span>
        {eventItems.map(({ type, label }) => {
          const [r, g, b] = EVENT_COLOR[type]
          return (
            <span key={type} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: `rgb(${r},${g},${b})` }} />
              {label}
            </span>
          )
        })}
      </div>
      <div className={styles.legendGroup}>
        <span className={styles.legendGroupLabel}>Exceptions</span>
        {exItems.map(({ type, label }) => {
          const [r, g, b] = EXCEPTION_COLOR[type]
          return (
            <span key={type} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: `rgb(${r},${g},${b})`, borderRadius: "2px" }} />
              {label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Filter bar ────────────────────────────────────────────────────────────────

type ExFilter = ExceptionType | "all" | "clean"

function FilterBar({
  data,
  filter,
  setFilter,
}: {
  data: TimelineData
  filter: ExFilter
  setFilter: (f: ExFilter) => void
}) {
  const exCounts: Partial<Record<ExceptionType, number>> = {}
  for (const row of data.rows) {
    for (const ex of row.exceptions) {
      exCounts[ex] = (exCounts[ex] ?? 0) + 1
    }
  }
  const cleanCount = data.rows.filter(r => r.exceptions.length === 0).length
  const exItems: { type: ExFilter; label: string }[] = [
    { type: "all",             label: `All (${data.rows.length})` },
    { type: "no_pr",           label: `No PR (${exCounts.no_pr ?? 0})` },
    { type: "stale_pr",        label: `Stale (${exCounts.stale_pr ?? 0})` },
    { type: "merged_not_closed", label: `Merged open (${exCounts.merged_not_closed ?? 0})` },
    { type: "long_review",     label: `Review (${exCounts.long_review ?? 0})` },
    { type: "clean",           label: `Clean (${cleanCount})` },
  ]

  return (
    <div className={styles.filterBar}>
      {exItems.map(({ type, label }) => (
        <button
          key={type}
          className={`${styles.filterBtn} ${filter === type ? styles.filterBtnActive : ""}`}
          onClick={() => setFilter(type)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export interface TimelineGLProps {
  data: TimelineData
}

export default function TimelineGL({ data }: TimelineGLProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasWidth, setCanvasWidth]   = useState(900)
  const [filter, setFilter]             = useState<ExFilter>("all")
  const [tooltip, setTooltip]           = useState<Tooltip | null>(null)
  const [selectedRow, setSelectedRow]   = useState<TimelineRow | null>(null)

  // Observe container width
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setCanvasWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Apply filter
  const filteredRows = useMemo(() => {
    if (filter === "all") return data.rows
    if (filter === "clean") return data.rows.filter(r => r.exceptions.length === 0)
    return data.rows.filter(r => r.exceptions.includes(filter as ExceptionType))
  }, [data.rows, filter])

  // Re-index rows after filter
  const indexedRows = useMemo(() =>
    filteredRows.map((r, i) => ({ ...r, rowIndex: i })),
    [filteredRows]
  )

  const filteredKeys    = useMemo(() => new Set(indexedRows.map(r => r.key)), [indexedRows])
  const filteredEvents  = useMemo(() => data.events.filter(e => filteredKeys.has(e.rowKey)), [data.events, filteredKeys])
  const filteredEx      = useMemo(() => data.exceptions.filter(e => filteredKeys.has(e.rowKey)), [data.exceptions, filteredKeys])
  const rowByKey        = useMemo(() => new Map(indexedRows.map(r => [r.key, r])), [indexedRows])

  const canvasHeight  = HEADER_H + indexedRows.length * ROW_H + 20
  const { domainStart, domainEnd } = data

  // Map event → row position
  const eventPoints = useMemo(() => filteredEvents.map(ev => {
    const row = rowByKey.get(ev.rowKey)
    if (!row) return null
    return {
      event: ev,
      position: [
        tsToX(ev.ts, domainStart, domainEnd, canvasWidth),
        rowToY(row.rowIndex),
      ] as [number, number],
      color: EVENT_COLOR[ev.type],
      radius: (EVENT_RADIUS[ev.type] ?? DOT_RADIUS) * 1.5,
    }
  }).filter((p): p is NonNullable<typeof p> => p !== null), [filteredEvents, rowByKey, domainStart, domainEnd, canvasWidth])

  // Track lines: one line per row connecting first to last event
  const trackLines = useMemo(() => indexedRows.map(row => {
    const rowEvs = filteredEvents.filter(e => e.rowKey === row.key).sort((a, b) => a.ts - b.ts)
    if (rowEvs.length < 2) return null
    return {
      key: row.key,
      sourcePosition: [tsToX(rowEvs[0].ts, domainStart, domainEnd, canvasWidth), rowToY(row.rowIndex)] as [number, number],
      targetPosition: [tsToX(rowEvs[rowEvs.length - 1].ts, domainStart, domainEnd, canvasWidth), rowToY(row.rowIndex)] as [number, number],
      color: row.exceptions.length > 0 ? [100, 100, 120, 120] as [number, number, number, number] : [60, 66, 90, 100] as [number, number, number, number],
    }
  }).filter((l): l is NonNullable<typeof l> => l !== null), [indexedRows, filteredEvents, domainStart, domainEnd, canvasWidth])

  // Exception range segments (horizontal highlight bars)
  const exSegments = useMemo(() => filteredEx.map((ex, i) => {
    const row = rowByKey.get(ex.rowKey)
    if (!row) return null
    const x1 = tsToX(ex.fromTs, domainStart, domainEnd, canvasWidth)
    const x2 = ex.toTs ? tsToX(ex.toTs, domainStart, domainEnd, canvasWidth) : canvasWidth - PAD_RIGHT
    const y  = rowToY(row.rowIndex)
    return {
      key: `ex-${i}`,
      exception: ex,
      row,
      sourcePosition: [x1, y] as [number, number],
      targetPosition: [x2, y] as [number, number],
      color: EXCEPTION_COLOR[ex.type],
    }
  }).filter((s): s is NonNullable<typeof s> => s !== null), [filteredEx, rowByKey, domainStart, domainEnd, canvasWidth])

  // deck.gl layers
  const layers = useMemo(() => [
    // Exception highlight lines (thick)
    new LineLayer({
      id: "exception-lines",
      data: exSegments,
      getSourcePosition: d => d.sourcePosition,
      getTargetPosition: d => d.targetPosition,
      getColor: d => d.color,
      getWidth: 8,
      widthUnits: "pixels",
      pickable: true,
      onHover: (info) => {
        if (info.object && info.x != null && info.y != null) {
          setTooltip({ x: info.x, y: info.y, target: { kind: "exception", item: info.object.exception, row: info.object.row } })
        } else {
          setTooltip(null)
        }
      },
    }),
    // Track connector lines (thin)
    new LineLayer({
      id: "tracks",
      data: trackLines,
      getSourcePosition: d => d.sourcePosition,
      getTargetPosition: d => d.targetPosition,
      getColor: d => d.color,
      getWidth: TRACK_W,
      widthUnits: "pixels",
    }),
    // Event dots
    new ScatterplotLayer({
      id: "events",
      data: eventPoints,
      getPosition: d => d.position,
      getFillColor: d => d.color,
      getRadius: d => d.radius,
      radiusUnits: "pixels",
      pickable: true,
      stroked: true,
      getLineColor: [20, 22, 35, 200],
      getLineWidth: 1.5,
      lineWidthUnits: "pixels",
      onHover: (info) => {
        if (info.object && info.x != null && info.y != null) {
          setTooltip({ x: info.x, y: info.y, target: { kind: "event", item: info.object.event } })
        } else {
          setTooltip(null)
        }
      },
      onClick: info => {
        if (info.object) {
          const row = rowByKey.get(info.object.event.rowKey)
          if (row) setSelectedRow(row)
        }
      },
    }),
  ], [exSegments, trackLines, eventPoints, rowByKey])

  const ticks = useMemo(() => buildTicks(domainStart, domainEnd, canvasWidth), [domainStart, domainEnd, canvasWidth])

  const handleRowClick = useCallback((row: TimelineRow) => {
    setSelectedRow(prev => prev?.key === row.key ? null : row)
  }, [])

  return (
    <div className={styles.root}>
      <Legend />
      <FilterBar data={{ ...data, rows: indexedRows }} filter={filter} setFilter={setFilter} />

      {/* Summary chips */}
      <div className={styles.summary}>
        <span className={styles.chip}>{indexedRows.length} tickets</span>
        <span className={styles.chip}>{filteredEvents.length} events</span>
        {filteredEx.length > 0 && (
          <span className={`${styles.chip} ${styles.chipWarn}`}>{filteredEx.length} exception{filteredEx.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {/* Timeline body */}
      <div className={styles.body}>
        {/* Left: sticky label column */}
        <div className={styles.labelCol} style={{ width: LABEL_W }}>
          {/* Empty header row aligned with time axis */}
          <div className={styles.labelHeader} style={{ height: HEADER_H }} />
          {indexedRows.map(row => (
            <div
              key={row.key}
              className={`${styles.labelRow} ${selectedRow?.key === row.key ? styles.labelRowSelected : ""} ${row.exceptions.length > 0 ? styles.labelRowException : ""}`}
              style={{ height: ROW_H }}
              onClick={() => handleRowClick(row)}
              title={row.title}
            >
              <span className={styles.labelKey}>{row.key}</span>
              <span className={styles.labelTitle}>{row.title}</span>
              {row.exceptions.length > 0 && (
                <span className={styles.exDot} title={row.exceptions.map(e => EXCEPTION_LABEL[e]).join(", ")}>⚠</span>
              )}
            </div>
          ))}
        </div>

        {/* Right: WebGL canvas */}
        <div className={styles.canvasWrap} ref={containerRef} style={{ position: "relative" }}>
          {/* Time axis ticks (HTML overlay on top of canvas) */}
          <div className={styles.tickAxis} style={{ height: HEADER_H, pointerEvents: "none" }}>
            {ticks.map(tick => (
              <div key={tick.label} className={styles.tick} style={{ left: tick.x }}>
                <span>{tick.label}</span>
                <div className={styles.tickLine} style={{ height: canvasHeight - HEADER_H }} />
              </div>
            ))}
          </div>

          {/* deck.gl */}
          <DeckGL
            views={[new OrthographicView({ id: "ortho", controller: { scrollZoom: true, dragPan: true } })]}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            initialViewState={{
              target: [canvasWidth / 2, canvasHeight / 2, 0],
              zoom: 0,
              minZoom: -2,
              maxZoom: 3,
            } as any}
            width={canvasWidth}
            height={canvasHeight}
            layers={layers}
            style={{ position: "relative" }}
            onDrag={() => setTooltip(null)}
          />

          {/* Tooltip */}
          {tooltip && tooltip.target && (
            <div
              className={styles.tooltip}
              style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
              aria-live="polite"
            >
              {tooltip.target.kind === "event" && (
                <>
                  <div className={styles.tooltipTitle}>{tooltip.target.item.label}</div>
                  <div className={styles.tooltipDate}>{formatDate(tooltip.target.item.ts)}</div>
                  <div className={styles.tooltipHint}>Click to open detail</div>
                </>
              )}
              {tooltip.target.kind === "exception" && (
                <>
                  <div className={styles.tooltipTitle}>⚠ {tooltip.target.item.label}</div>
                  <div className={styles.tooltipDate}>Since {formatDate(tooltip.target.item.fromTs)}</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedRow && (
        <DetailPanel
          row={selectedRow}
          events={data.events}
          exceptions={data.exceptions}
          onClose={() => setSelectedRow(null)}
        />
      )}
    </div>
  )
}
