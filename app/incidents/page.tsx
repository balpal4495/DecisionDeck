import { db } from "@/db"
import { incidents } from "@/db/schema"
import { parseIds } from "@/db/schema"
import styles from "../page.module.css"

interface FollowUp {
  id: string
  title: string
  status: string
  owner?: string | null
  dueDate?: string | null
}

export default async function IncidentsPage() {
  const rows = await db.select().from(incidents).orderBy(incidents.date)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Incidents</h1>
        <p className={styles.subtitle}>
          {rows.length} incident{rows.length !== 1 ? "s" : ""}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No incidents recorded</div>
          <div className={styles.emptyHint}>Run <code>npm run db:seed</code> to load sample data.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {rows.map((inc) => {
            const followUps: FollowUp[] = JSON.parse(inc.followUps || "[]")
            const openFollowUps = followUps.filter((f) => f.status === "open" || f.status === "in_progress")
            return (
              <div key={inc.id} className={styles.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div className={styles.cardLabel}>{inc.area} · {inc.severity} · {inc.date}</div>
                    <div style={{ fontSize: "0.9375rem", fontWeight: 600, marginTop: "var(--space-1)" }}>{inc.title}</div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: "var(--space-2)" }}>
                      {inc.summary}
                    </div>
                  </div>
                  {openFollowUps.length > 0 && (
                    <span style={{
                      flexShrink: 0,
                      fontSize: "0.75rem",
                      padding: "2px 8px",
                      borderRadius: "var(--radius-sm)",
                      background: "rgba(255,179,71,0.15)",
                      color: "var(--color-warning)",
                      marginLeft: "var(--space-4)",
                    }}>
                      {openFollowUps.length} open follow-up{openFollowUps.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {followUps.length > 0 && (
                  <ul style={{ marginTop: "var(--space-4)", paddingLeft: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                    {followUps.map((fu) => (
                      <li key={fu.id} style={{ fontSize: "0.8125rem", color: fu.status === "done" ? "var(--color-text-muted)" : "var(--color-text)" }}>
                        [{fu.status}] {fu.title}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
