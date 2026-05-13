import { db } from "@/db"
import { workItems } from "@/db/schema"
import { triageAll, summariseTriage, TRIAGE_THRESHOLDS } from "@/lib/triage"
import type { TriageCategory, TriageResult } from "@/lib/triage"
import styles from "../page.module.css"

const CATEGORY_LABEL: Record<TriageCategory, string> = {
  active: "Active",
  queued: "Queued",
  blocked: "Blocked",
  stale: "Stale",
  done: "Done",
  abandoned: "Abandoned",
}

const CATEGORY_COLOR: Record<TriageCategory, string> = {
  active: "var(--color-success)",
  queued: "var(--color-accent)",
  blocked: "var(--color-danger)",
  stale: "var(--color-warning, #ffb347)",
  done: "var(--color-text-muted)",
  abandoned: "var(--color-text-muted)",
}

const CATEGORY_BG: Record<TriageCategory, string> = {
  active: "rgba(80,200,120,0.1)",
  queued: "rgba(100,160,255,0.1)",
  blocked: "rgba(255,95,109,0.12)",
  stale: "rgba(255,179,71,0.12)",
  done: "rgba(139,144,168,0.08)",
  abandoned: "rgba(139,144,168,0.08)",
}

// ── Section order — what an EM needs to see first ─────────────────────────────
const SECTION_ORDER: TriageCategory[] = [
  "blocked",
  "stale",
  "abandoned",
  "queued",
  "active",
  "done",
]

const SECTION_DESCRIPTION: Record<TriageCategory, string> = {
  blocked: "Work that cannot proceed — requires EM action or unblocking decision",
  stale: "In progress or not started with no movement — worth a conversation",
  abandoned: "Created and never touched past the staleness window — probable noise",
  queued: "Not started but recently created or updated — genuine backlog",
  active: "Moving with recent updates — real signal",
  done: "Completed — valid items contributing to the raw count",
}

function CategoryBadge({ category }: { category: TriageCategory }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "0.7rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        background: CATEGORY_BG[category],
        color: CATEGORY_COLOR[category],
      }}
    >
      {CATEGORY_LABEL[category]}
    </span>
  )
}

function TriageItemRow({ item }: { item: TriageResult }) {
  return (
    <div
      style={{
        borderLeft: `3px solid ${CATEGORY_COLOR[item.category]}`,
        paddingLeft: "var(--space-4)",
        paddingTop: "var(--space-3)",
        paddingBottom: "var(--space-3)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-1)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "var(--space-4)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--color-text-muted)",
              marginBottom: "var(--space-1)",
            }}
          >
            {item.area} · {item.source.toUpperCase()}
            {item.externalId ? ` · ${item.externalId}` : ""}
          </div>
          <div style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{item.title}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
          {item.riskLevel === "high" && (
            <span
              style={{
                padding: "2px 7px",
                borderRadius: "4px",
                fontSize: "0.7rem",
                fontWeight: 700,
                background: "rgba(255,95,109,0.12)",
                color: "var(--color-danger)",
              }}
            >
              HIGH RISK
            </span>
          )}
          {item.externalUrl && (
            <a
              href={item.externalUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: "0.75rem",
                color: "var(--color-accent)",
                textDecoration: "none",
              }}
            >
              View source ↗
            </a>
          )}
        </div>
      </div>
      {/* The WHY — council requirement: always show the classification reason */}
      <div
        style={{
          fontSize: "0.8125rem",
          color: "var(--color-text-muted)",
          fontStyle: "italic",
        }}
      >
        {item.signal}
      </div>
      {item.lastSyncedAt && (
        <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
          Last synced:{" "}
          {new Date(item.lastSyncedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </div>
      )}
    </div>
  )
}

export default async function TriagePage() {
  const rows = await db.select().from(workItems)
  const results = triageAll(rows)
  const summary = summariseTriage(results)

  const byCategory = SECTION_ORDER.reduce<Record<TriageCategory, TriageResult[]>>(
    (acc, cat) => {
      acc[cat] = results.filter(r => r.category === cat)
      return acc
    },
    {} as Record<TriageCategory, TriageResult[]>,
  )

  const areaNames = Object.keys(summary.byArea).sort()

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Work Triage</h1>
        <p className={styles.subtitle}>
          {summary.total} items · {summary.signal} signal · {summary.investigate} to investigate ·{" "}
          {summary.noise} probable noise
        </p>
      </div>

      {/* ── Top summary ── */}
      <div className={styles.grid}>
        {(
          [
            { label: "Signal", value: summary.signal, color: "var(--color-success)", hint: "active + blocked" },
            { label: "Blocked", value: summary.byCategory.blocked, color: "var(--color-danger)", hint: "needs EM action" },
            { label: "Investigate", value: summary.investigate, color: "var(--color-warning, #ffb347)", hint: "stale items" },
            { label: "Backlog", value: summary.backlog, color: "var(--color-accent)", hint: "queued" },
            { label: "Probable noise", value: summary.noise, color: "var(--color-text-muted)", hint: "done + abandoned" },
          ] as const
        ).map(card => (
          <div key={card.label} className={styles.card}>
            <div className={styles.cardLabel}>{card.label}</div>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: card.color }}>
              {card.value}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "var(--space-1)" }}>
              {card.hint}
            </div>
          </div>
        ))}
      </div>

      {/* ── Area breakdown table ── */}
      {areaNames.length > 0 && (
        <div>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-4)" }}>
            By area
          </h2>
          <div
            style={{
              overflowX: "auto",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.8125rem",
              }}
            >
              <thead>
                <tr style={{ background: "var(--color-surface)" }}>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "var(--space-3) var(--space-4)",
                      fontWeight: 600,
                      color: "var(--color-text-muted)",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    Area
                  </th>
                  {SECTION_ORDER.map(cat => (
                    <th
                      key={cat}
                      style={{
                        textAlign: "right",
                        padding: "var(--space-3) var(--space-4)",
                        fontWeight: 600,
                        color: CATEGORY_COLOR[cat],
                        borderBottom: "1px solid var(--color-border)",
                      }}
                    >
                      {CATEGORY_LABEL[cat]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {areaNames.map((area, i) => (
                  <tr
                    key={area}
                    style={{
                      background: i % 2 === 0 ? "transparent" : "var(--color-surface)",
                    }}
                  >
                    <td
                      style={{
                        padding: "var(--space-3) var(--space-4)",
                        fontWeight: 500,
                        color: "var(--color-text)",
                      }}
                    >
                      {area}
                    </td>
                    {SECTION_ORDER.map(cat => (
                      <td
                        key={cat}
                        style={{
                          textAlign: "right",
                          padding: "var(--space-3) var(--space-4)",
                          color:
                            summary.byArea[area][cat] > 0
                              ? CATEGORY_COLOR[cat]
                              : "var(--color-text-muted)",
                        }}
                      >
                        {summary.byArea[area][cat] > 0
                          ? summary.byArea[area][cat]
                          : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Per-category sections ── */}
      {SECTION_ORDER.filter(cat => byCategory[cat].length > 0).map(cat => (
        <div key={cat}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "var(--space-3)",
              marginBottom: "var(--space-2)",
            }}
          >
            <h2 style={{ fontSize: "1rem", fontWeight: 600 }}>
              <CategoryBadge category={cat} />
              <span style={{ marginLeft: "var(--space-2)" }}>
                {CATEGORY_LABEL[cat]} ({byCategory[cat].length})
              </span>
            </h2>
          </div>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--color-text-muted)",
              marginBottom: "var(--space-4)",
            }}
          >
            {SECTION_DESCRIPTION[cat]}
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
            }}
          >
            {byCategory[cat].map(item => (
              <TriageItemRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}

      {/* ── Thresholds footer — transparency per Council requirement ── */}
      <div
        style={{
          fontSize: "0.75rem",
          color: "var(--color-text-muted)",
          borderTop: "1px solid var(--color-border)",
          paddingTop: "var(--space-4)",
          lineHeight: 1.6,
        }}
      >
        <strong>Classification rules:</strong> Active = updated ≤{TRIAGE_THRESHOLDS.ACTIVE_WINDOW_DAYS} days ·
        Queued = not started, created/updated ≤{TRIAGE_THRESHOLDS.QUEUED_WINDOW_DAYS} days ·
        Stale = no movement ≥{TRIAGE_THRESHOLDS.STALE_DAYS} days ·
        Abandoned = not started, created ≥{TRIAGE_THRESHOLDS.ABANDONED_DAYS} days with no updates ·
        Blocked-frozen = blocked ≥{TRIAGE_THRESHOLDS.BLOCKED_FROZEN_DAYS} days.
        Dates are sourced from the original Jira/GitHub record, not the sync timestamp.
        Classification is a hypothesis — use &quot;View source ↗&quot; to verify against the source system.
      </div>
    </div>
  )
}
