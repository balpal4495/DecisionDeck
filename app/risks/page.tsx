import { db } from "@/db"
import { risks } from "@/db/schema"
import styles from "../page.module.css"

export default async function RisksPage() {
  const rows = await db.select().from(risks).orderBy(risks.createdAt)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Risk Register</h1>
        <p className={styles.subtitle}>
          {rows.length} risk{rows.length !== 1 ? "s" : ""}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No risks recorded</div>
          <div className={styles.emptyHint}>Run <code>npm run db:seed</code> to load sample data.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {rows.map((r) => (
            <div key={r.id} className={styles.card}>
              <div className={styles.cardLabel}>{r.area} · {r.severity} severity · {r.likelihood} likelihood</div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 600, marginTop: "var(--space-1)" }}>{r.title}</div>
              {r.mitigation && (
                <div style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: "var(--space-2)" }}>
                  Mitigation: {r.mitigation}
                </div>
              )}
              <div style={{ marginTop: "var(--space-2)", display: "flex", gap: "var(--space-2)" }}>
                <span style={{
                  fontSize: "0.75rem",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                  background: r.status === "open" ? "rgba(255,95,109,0.15)" : "rgba(139,144,168,0.1)",
                  color: r.status === "open" ? "var(--color-danger)" : "var(--color-text-muted)",
                }}>
                  {r.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
