import { db } from "@/db"
import { workItems } from "@/db/schema"
import { buildPulse } from "@/lib/pulse"
import { buildGraphData, buildPRCoverage } from "@/lib/graph"
import { ForceGraph } from "@/components/ForceGraph"

export const metadata = {
  title: "Alignment · DecisionDeck",
}

export default async function GraphPage() {
  const items = await db.select().from(workItems)
  const pulse = buildPulse(items)
  const graphData    = buildGraphData(pulse)
  const prCoverage   = buildPRCoverage(items, pulse)

  const data       = JSON.parse(JSON.stringify(graphData))
  const coverage   = JSON.parse(JSON.stringify(prCoverage))

  return <ForceGraph data={data} prCoverage={coverage} />
}
