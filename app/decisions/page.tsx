import { db } from "@/db"
import { decisions } from "@/db/schema"
import Link from "next/link"
import styles from "../page.module.css"

export default async function DecisionsPage() {
  const rows = await db.select().from(decisions).orderBy(decisions.createdAt)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Decision Ledger</h1>
        <p className={styles.subtitle}>
          {rows.length} decision{rows.length !== 1 ? "s" : ""} recorded
        </p>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No decisions yet</div>
          <div className={styles.emptyHint}>Run <code>npm run db:seed</code> to load the initial DEC entries.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {rows.map((d) => (
            <div key={d.id} className={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-4)" }}>
                <div>
                  <div className={styles.cardLabel}>{d.area} · {d.id.toUpperCase()}</div>
                  <div style={{ fontSize: "0.9375rem", fontWeight: 600, marginTop: "var(--space-1)" }}>
                    {d.title}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: "var(--space-2)" }}>
                    {d.decision}
                  </div>
                </div>
                <span style={{
                  flexShrink: 0,
                  fontSize: "0.75rem",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                  background: d.status === "accepted" ? "rgba(92,184,92,0.15)" : "rgba(139,144,168,0.15)",
                  color: d.status === "accepted" ? "var(--color-success)" : "var(--color-text-muted)",
                }}>
                  {d.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
