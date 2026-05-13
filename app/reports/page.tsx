import styles from "../page.module.css"

export default function ReportsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Weekly Reports</h1>
        <p className={styles.subtitle}>Generate and export weekly Markdown reports</p>
      </div>
      <div className={styles.empty}>
        <div className={styles.emptyTitle}>Report generator coming in Phase 9</div>
        <div className={styles.emptyHint}>
          Data sources (GitHub, Jira, Confluence) will be wired before report generation is built.
        </div>
      </div>
    </div>
  )
}
