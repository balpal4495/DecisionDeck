import { db } from "@/db"
import { workItems } from "@/db/schema"
import { buildDeliveryTree } from "@/lib/delivery-tree"
import DeliveryTree from "@/components/DeliveryTree"
import styles from "./page.module.css"

export default async function TimelinePage() {
  const rows = await db.select().from(workItems)
  const data = buildDeliveryTree(rows)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Delivery</h1>
        <p className={styles.subtitle}>
          {data.stats.epics} epic{data.stats.epics !== 1 ? "s" : ""} ·{" "}
          {data.stats.sprints} sprint{data.stats.sprints !== 1 ? "s" : ""} ·{" "}
          {data.stats.stories} stor{data.stats.stories !== 1 ? "ies" : "y"} ·{" "}
          {data.stats.subtasks} sub-task{data.stats.subtasks !== 1 ? "s" : ""} ·{" "}
          {data.stats.prs} PR{data.stats.prs !== 1 ? "s" : ""}
        </p>
      </div>
      <DeliveryTree data={data} />
    </div>
  )
}
