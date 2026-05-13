import { db } from "@/db"
import { workItems } from "@/db/schema"
import { buildPulse } from "@/lib/pulse"
import { buildGraphData } from "@/lib/graph"
import { ForceGraph } from "@/components/ForceGraph"

export const metadata = {
  title: "Graph · DecisionDeck",
}

export default async function GraphPage() {
  const items = await db.select().from(workItems)
  const pulse = buildPulse(items)
  const graphData = buildGraphData(pulse)

  // Serialise to a plain object so it crosses the RSC → client boundary cleanly
  const data = JSON.parse(JSON.stringify(graphData))

  return <ForceGraph data={data} />
}
