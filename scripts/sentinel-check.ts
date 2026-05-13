/**
 * Sentinel coverage check — Chronicle coverage baseline.
 *
 * Reports which TypeScript/TSX files in the codebase are referenced by
 * committed Chronicle entries and which are not.
 *
 * Usage: npm run sentinel:check
 *
 * Coverage is a directional signal, not a precision metric.
 * Sentinel uses substring matching between file paths and affected_areas.
 */

import { coverage } from "../quorum/modules/sentinel/coverage"
import { promises as fs } from "fs"
import path from "path"

const CHRONICLE_DIR = ".chronicle"
const CODEBASE_ROOT = "."

async function main() {
  console.log("Running Sentinel coverage check...\n")

  const report = await coverage(CHRONICLE_DIR, CODEBASE_ROOT, {
    extensions: [".ts", ".tsx"],
    excludeTestFiles: false,
  })

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log("=== SENTINEL BASELINE REPORT ===")
  console.log(`Date:            ${new Date().toISOString()}`)
  console.log(`Total TS files:  ${report.totalFiles}`)
  console.log(`Covered:         ${report.coveredFiles}`)
  console.log(`Uncovered:       ${report.totalFiles - report.coveredFiles}`)
  console.log(`Coverage:        ${report.percentage}%`)
  console.log("")

  // ── Covered files ────────────────────────────────────────────────────────────
  const covered = report.coverageByFile.filter((f) => f.covered)
  if (covered.length > 0) {
    console.log("--- Covered files ---")
    for (const f of covered) {
      console.log(`  ✓  ${f.file}  [${f.entryIds.join(", ")}]`)
    }
    console.log("")
  }

  // ── Uncovered files ──────────────────────────────────────────────────────────
  if (report.uncoveredFiles.length > 0) {
    console.log("--- Uncovered files (no Chronicle entry references these) ---")
    for (const f of report.uncoveredFiles) {
      console.log(`  ○  ${f}`)
    }
    console.log("")
  }

  // ── Write baseline JSON ───────────────────────────────────────────────────────
  const outputDir = path.join(".chronicle")
  const outputPath = path.join(outputDir, "sentinel-baseline.json")
  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(
    outputPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2),
    "utf8",
  )
  console.log(`Baseline saved to ${outputPath}`)
  process.exit(0)
}

main().catch((err) => {
  console.error("sentinel:check failed:", err)
  process.exit(1)
})
