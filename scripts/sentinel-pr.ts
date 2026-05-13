/**
 * Sentinel PR knowledge map.
 *
 * Called by the sentinel-pr.yml GitHub Actions workflow.
 * Reads changed files from argv[2] (newline-separated), runs Sentinel
 * coverage against committed Chronicle entries, and writes sentinel-report.md.
 *
 * Usage (CI):
 *   npx tsx scripts/sentinel-pr.ts "$CHANGED_FILES"
 *
 * Usage (local):
 *   npm run sentinel:pr
 */

import { coverage } from "../quorum/modules/sentinel/coverage"
import { promises as fs } from "fs"
import path from "path"

const CHRONICLE_DIR = ".chronicle"

async function main() {
  // Changed files are passed as a single newline-separated string from GH Actions
  const rawArg = process.argv[2] ?? ""
  const changedFiles = rawArg
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)

  // Full codebase coverage (reads .chronicle/committed/*.json — no DB, no embedder)
  const report = await coverage(CHRONICLE_DIR, ".", {
    extensions: [".ts", ".tsx"],
    excludeTestFiles: false,
  })

  // Cross-reference coverage report against changed files
  const changedCoverage = report.coverageByFile.filter((f) =>
    changedFiles.some(
      (cf) =>
        cf === f.file ||
        f.file.endsWith(cf) ||
        cf.endsWith(f.file) ||
        // normalise leading ./
        cf.replace(/^\.\//, "") === f.file,
    ),
  )

  const covered = changedCoverage.filter((f) => f.covered)
  const uncovered = changedCoverage.filter((f) => !f.covered)

  // ── Build report markdown ─────────────────────────────────────────────────

  const lines: string[] = []
  lines.push("## Sentinel — PR Knowledge Map")
  lines.push("")

  // Changed files table
  if (changedCoverage.length > 0) {
    lines.push("### Changed files")
    lines.push("")
    lines.push("| File | Chronicle coverage |")
    lines.push("|---|---|")
    for (const f of changedCoverage) {
      const icon = f.covered ? "✅" : "⚠️"
      const ids =
        f.entryIds.length > 0
          ? f.entryIds.map((id) => `\`${id.slice(0, 8)}\``).join(" ")
          : "—"
      lines.push(`| \`${f.file}\` | ${icon} ${ids} |`)
    }
    lines.push("")
  } else if (changedFiles.length > 0) {
    lines.push("> No tracked TypeScript/TSX files changed in this PR.")
    lines.push("")
  } else {
    lines.push("> Could not determine changed files — no argument passed.")
    lines.push("")
  }

  // Summary
  lines.push("### Summary")
  lines.push("")
  lines.push(
    `- **${covered.length} / ${changedCoverage.length}** changed files covered by Chronicle entries`,
  )
  lines.push(
    `- **Codebase baseline:** ${report.percentage}% coverage (${report.coveredFiles}/${report.totalFiles} TS files)`,
  )
  lines.push("")

  // Uncovered changed files — action prompt
  if (uncovered.length > 0) {
    lines.push("### ⚠️ Uncovered files")
    lines.push("")
    lines.push(
      "These changed files have no Chronicle entries referencing them. " +
        "If this PR contains a significant decision, stage a proposal:",
    )
    lines.push("")
    for (const f of uncovered) {
      lines.push(`- \`${f.file}\``)
    }
    lines.push("")
    lines.push(
      "> After adding proposals to `.chronicle/proposals/`, run `npm run chronicle:commit`.",
    )
    lines.push("")
  } else if (changedCoverage.length > 0) {
    lines.push("✅ All changed files are referenced by Chronicle entries.")
    lines.push("")
  }

  // All Chronicle entries referenced by changed files
  const referencedIds = [...new Set(covered.flatMap((f) => f.entryIds))]
  if (referencedIds.length > 0) {
    lines.push("### Referenced Chronicle entries")
    lines.push("")
    lines.push("| Short ID | Full ID |")
    lines.push("|---|---|")
    for (const id of referencedIds) {
      lines.push(`| \`${id.slice(0, 8)}\` | \`${id}\` |`)
    }
    lines.push("")
  }

  lines.push("---")
  lines.push(`*Sentinel · ${new Date().toISOString()} · [chronicle-commit-all](scripts/chronicle-commit-all.ts)*`)

  const markdown = lines.join("\n")
  await fs.writeFile("sentinel-report.md", markdown, "utf8")
  console.log(markdown)
  process.exit(0)
}

main().catch((err) => {
  console.error("sentinel:pr failed:", err)
  process.exit(1)
})
