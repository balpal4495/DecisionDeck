import { db } from "@/db"
import { workItems } from "@/db/schema"
import { buildDeliveryTree } from "@/lib/delivery-tree"
import DeliveryGL from "@/components/DeliveryGL"
import styles from "./page.module.css"

export default async function TimelinePage() {
  const rows = await db.select().from(workItems)
  const data = buildDeliveryTree(rows)

  return (
    <div className={styles.page}>
      <DeliveryGL data={data} />
    </div>
  )
}
