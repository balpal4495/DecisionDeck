import { db } from "@/db"
import { decisions, workItems, risks, incidents } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import styles from "./page.module.css"

export default async function DashboardPage() {
  const [
    allDecisions,
    allWork,
    allRisks,
    allIncidents,
  ] = await Promise.all([
    db.select().from(decisions),
    db.select().from(workItems),
    db.select().from(risks),
    db.select().from(incidents),
  ])

  const blockedWork = allWork.filter((w) => w.status === "blocked")
  const highRiskWork = allWork.filter((w) => w.riskLevel === "high" && w.status !== "done")
  const openRisks = allRisks.filter((r) => r.status === "open" || r.status === "mitigating")
  const needsReview = allDecisions.filter((d) => d.status === "needs_review")

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>This Week</h1>
        <p className={styles.subtitle}>Signals that need your attention — Atlas Platform</p>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardLabel}>Blocked Work</div>
          <div className={blockedWork.length > 0 ? styles.cardValue : styles.cardValueMuted}>
            {blockedWork.length}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardLabel}>High-Risk Work</div>
          <div className={highRiskWork.length > 0 ? styles.cardValue : styles.cardValueMuted}>
            {highRiskWork.length}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardLabel}>Open Risks</div>
          <div className={openRisks.length > 0 ? styles.cardValue : styles.cardValueMuted}>
            {openRisks.length}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardLabel}>Decisions Needing Review</div>
          <div className={needsReview.length > 0 ? styles.cardValue : styles.cardValueMuted}>
            {needsReview.length}
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardLabel}>Total Decisions</div>
          <div className={styles.cardValueMuted}>{allDecisions.length}</div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardLabel}>Active Work Items</div>
          <div className={styles.cardValueMuted}>
            {allWork.filter((w) => w.status !== "done").length}
          </div>
        </div>
      </div>

      {blockedWork.length > 0 && (
        <section>
          <h2 className={styles.subtitle} style={{ marginBottom: "var(--space-3)", fontWeight: 600 }}>
            Blocked Work
          </h2>
          <div className={styles.grid}>
            {blockedWork.map((item) => (
              <div key={item.id} className={styles.card}>
                <div className={styles.cardLabel}>{item.area}</div>
                <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-danger)" }}>
                  {item.title}
                </div>
                {item.blockedReason && (
                  <div style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: "var(--space-2)" }}>
                    {item.blockedReason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {openRisks.length > 0 && (
        <section>
          <h2 className={styles.subtitle} style={{ marginBottom: "var(--space-3)", fontWeight: 600 }}>
            Open Risks
          </h2>
          <div className={styles.grid}>
            {openRisks.map((risk) => (
              <div key={risk.id} className={styles.card}>
                <div className={styles.cardLabel}>{risk.area} · {risk.severity}</div>
                <div style={{ fontSize: "0.9375rem", fontWeight: 600 }}>{risk.title}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
