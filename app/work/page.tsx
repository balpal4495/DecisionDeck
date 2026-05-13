import { db } from "@/db"
import { workItems } from "@/db/schema"
import styles from "../page.module.css"

export default async function WorkPage() {
  const rows = await db.select().from(workItems).orderBy(workItems.createdAt)

  const statusColor: Record<string, string> = {
    blocked: "var(--color-danger)",
    in_progress: "var(--color-accent)",
    in_review: "var(--color-info)",
    done: "var(--color-success)",
    not_started: "var(--color-text-muted)",
  }

  const riskBadge: Record<string, string> = {
    high: "rgba(255,95,109,0.15)",
    medium: "rgba(255,179,71,0.15)",
    low: "rgba(139,144,168,0.1)",
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Work Radar</h1>
        <p className={styles.subtitle}>
          {rows.length} item{rows.length !== 1 ? "s" : ""} ·{" "}
          <span style={{ color: "var(--color-text-muted)" }}>
            GitHub sync: run <code>npm run sync:github</code>
          </span>
        </p>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>No work items</div>
          <div className={styles.emptyHint}>
            Run <code>npm run db:seed</code> for sample data, or <code>npm run sync:github</code> to import from GitHub.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {rows.map((w) => (
            <div key={w.id} className={styles.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-4)" }}>
                <div>
                  <div className={styles.cardLabel}>{w.area} · {w.source.toUpperCase()}</div>
                  <div style={{ fontSize: "0.9375rem", fontWeight: 600, marginTop: "var(--space-1)" }}>
                    {w.title}
                  </div>
                  {w.blockedReason && (
                    <div style={{ fontSize: "0.8125rem", color: "var(--color-danger)", marginTop: "var(--space-2)" }}>
                      Blocked: {w.blockedReason}
                    </div>
                  )}
                  {w.externalUrl && (
                    <a
                      href={w.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginTop: "var(--space-1)", display: "block" }}
                    >
                      {w.externalId}
                    </a>
                  )}
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0, flexDirection: "column", alignItems: "flex-end" }}>
                  <span style={{
                    fontSize: "0.75rem",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(139,144,168,0.1)",
                    color: statusColor[w.status] ?? "var(--color-text-muted)",
                  }}>
                    {w.status.replace("_", " ")}
                  </span>
                  <span style={{
                    fontSize: "0.75rem",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-sm)",
                    background: riskBadge[w.riskLevel] ?? "rgba(139,144,168,0.1)",
                    color: w.riskLevel === "high" ? "var(--color-danger)" : w.riskLevel === "medium" ? "var(--color-warning)" : "var(--color-text-muted)",
                  }}>
                    {w.riskLevel} risk
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
