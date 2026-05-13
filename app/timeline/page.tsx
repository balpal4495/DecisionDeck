import { db } from "@/db"
import { workItems } from "@/db/schema"
import { buildTimeline } from "@/lib/timeline"
import TimelineGL from "@/components/TimelineGL"
import styles from "./page.module.css"

export default async function TimelinePage() {
  const rows = await db.select().from(workItems)
  const data = buildTimeline(rows)

  // Serialise (Date objects → plain numbers are already numbers, just strip
  // any non-serialisable values to be safe)
  const serialised = JSON.parse(JSON.stringify(data))

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Delivery Timeline</h1>
        <p className={styles.subtitle}>
          Jira ticket lifecycle overlaid with GitHub PR events ·{" "}
          {data.rows.length} ticket{data.rows.length !== 1 ? "s" : ""} ·{" "}
          {data.events.length} event{data.events.length !== 1 ? "s" : ""} ·{" "}
          {data.exceptions.length > 0
            ? `${data.exceptions.length} exception${data.exceptions.length !== 1 ? "s" : ""} need attention`
            : "no exceptions"}
        </p>
      </div>
      <TimelineGL data={serialised} />
    </div>
  )
}
