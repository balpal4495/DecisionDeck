/**
 * Sentinel PR knowledge map.
 *
 * Called by the sentinel-pr.yml GitHub Actions workflow.
 * Reads changed files from CHANGED_FILES env var (newline-separated),
 * delegates to reviewContext() which produces:
 *   - per-module coverage table
 *   - mermaid flowchart heatmap (red/amber/green by Chronicle coverage %)
 *   - Chronicle context entries for touched modules
 *
 * Usage (CI):  CHANGED_FILES="..." npx tsx scripts/sentinel-pr.ts
 * Usage (local): npm run sentinel:pr
 */

import { reviewContext } from "../quorum/modules/sentinel/review"
import { promises as fs } from "fs"

const CHRONICLE_DIR = ".chronicle"

async function main() {
  // Changed files — prefer CHANGED_FILES env var (safe for multiline in GH Actions)
  // Fall back to argv[2] for local testing
  const rawArg = process.env.CHANGED_FILES ?? process.argv[2] ?? ""
  const changedFiles = rawArg
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)

  // reviewContext produces: coverage table + mermaid heatmap + Chronicle context
  // No DB, no embedder — reads .chronicle/committed/*.json only
  const markdown = await reviewContext(changedFiles, CHRONICLE_DIR, ".")

  await fs.writeFile("sentinel-report.md", markdown, "utf8")
  console.log(markdown)
  process.exit(0)
}

main().catch((err) => {
  console.error("sentinel:pr failed:", err)
  process.exit(1)
})
