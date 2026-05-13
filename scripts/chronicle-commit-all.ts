/**
 * Chronicle commit script — human gate execution.
 *
 * This script is the human gate: running it explicitly commits all staged
 * proposals to .chronicle/committed/. Never run this without reviewing
 * the proposals first.
 *
 * Usage: npm run chronicle:commit
 *
 * What it does:
 *   - Reads all .json files from .chronicle/proposals/
 *   - Assigns a final id + timestamp
 *   - Writes to .chronicle/committed/
 *   - Removes the proposal file
 *   - Embeds the entry into the LanceDB vector store so oracle.query() can find it
 */

import { promises as fs } from "fs"
import path from "path"
import { randomUUID } from "crypto"
import type { ChronicleEntry } from "../quorum/modules/shared/types"

const CHRONICLE_DIR = ".chronicle"

/**
 * Lightweight commit: moves proposals to committed/ without LanceDB embedding.
 * Embeddings are added when Quorum is fully wired with an LLM provider.
 * Sentinel coverage reads committed/*.json directly — no vector store required.
 */
async function main() {
  const proposalsDir = path.join(CHRONICLE_DIR, "proposals")
  const committedDir = path.join(CHRONICLE_DIR, "committed")

  let files: string[]
  try {
    files = (await fs.readdir(proposalsDir)).filter((f) => f.endsWith(".json"))
  } catch {
    console.log("No proposals directory found — nothing to commit.")
    process.exit(0)
  }

  if (files.length === 0) {
    console.log("No proposals to commit.")
    process.exit(0)
  }

  await fs.mkdir(committedDir, { recursive: true })

  console.log(`Found ${files.length} proposal(s) to commit.\n`)

  const committed: string[] = []
  const failed: Array<{ file: string; error: string }> = []

  for (const file of files) {
    const proposalPath = path.join(proposalsDir, file)
    try {
      const raw = await fs.readFile(proposalPath, "utf8")
      const partial = JSON.parse(raw) as Omit<ChronicleEntry, "id" | "timestamp"> & { id?: string }

      // Use pre-set id from proposal if present, otherwise generate a new one
      const entry: ChronicleEntry = {
        ...partial,
        id: partial.id ?? randomUUID(),
        timestamp: new Date().toISOString(),
      }

      const committedPath = path.join(committedDir, `${entry.id}.json`)
      await fs.writeFile(committedPath, JSON.stringify(entry, null, 2), "utf8")
      await fs.unlink(proposalPath)

      console.log(`  ✓ [${entry.id}] ${entry.topic ?? entry.key_insight.slice(0, 60)}`)
      committed.push(entry.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ ${file}: ${msg}`)
      failed.push({ file, error: msg })
    }
  }

  console.log(`\nCommitted ${committed.length} / ${files.length} entries.`)
  if (failed.length > 0) {
    console.error(`\nFailed (${failed.length}):`)
    failed.forEach((f) => console.error(`  ${f.file}: ${f.error}`))
    process.exit(1)
  }

  console.log("\nNote: vector embeddings are deferred — run oracle.commit() via Quorum setup once LLM is wired.")
  console.log("Run 'npm run sentinel:check' to see Chronicle coverage baseline.")
  process.exit(0)
}

main().catch((err) => {
  console.error("chronicle:commit failed:", err)
  process.exit(1)
})
