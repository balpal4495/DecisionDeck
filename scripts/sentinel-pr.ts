/**
 * Sentinel PR coverage map — DecisionDeck application scope.
 *
 * Generates a Chronicle coverage heatmap scoped to the business application:
 *   app/, db/, lib/, scripts/, .github/, components/, tests/
 *
 * Intentionally excludes quorum/ (portable infrastructure) and .next/ (build output).
 * The purpose of the map is to tell Oracle/Jury/Council whether they have enough
 * institutional knowledge to guide developers building DecisionDeck correctly.
 *
 * Usage (CI):  CHANGED_FILES="..." npx tsx scripts/sentinel-pr.ts
 * Usage (local): npm run sentinel:pr
 */

import { coverage } from "../quorum/modules/sentinel/coverage"
import { promises as fs } from "fs"
import path from "path"
import type { ChronicleEntry } from "../quorum/modules/shared/types"
import { entryText } from "../quorum/modules/shared/types"

const CHRONICLE_DIR = ".chronicle"

// Business application directory prefixes — everything else is infrastructure
const APP_DIR_PREFIXES = ["app/", "db/", "lib/", "scripts/", ".github/", "components/", "tests/"]

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractModule(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/")
  return parts.length === 1 ? "(root)" : parts[0]
}

function mermaidSafe(str: string): string {
  return str.replace(/[^a-zA-Z0-9_]/g, "_")
}

function riskClass(pct: number): "high" | "medium" | "good" {
  if (pct === 0) return "high"
  if (pct < 50) return "medium"
  return "good"
}

function riskLabel(pct: number): string {
  if (pct === 0) return "high"
  if (pct < 50) return "medium"
  return "low"
}

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`
}

async function readCommittedEntries(chronicleDir: string): Promise<ChronicleEntry[]> {
  const committedDir = path.join(chronicleDir, "committed")
  let files: string[]
  try {
    files = await fs.readdir(committedDir)
  } catch {
    return []
  }
  const entries: ChronicleEntry[] = []
  for (const file of files) {
    if (!file.endsWith(".json")) continue
    try {
      const raw = await fs.readFile(path.join(committedDir, file), "utf8")
      entries.push(JSON.parse(raw) as ChronicleEntry)
    } catch {
      // skip malformed
    }
  }
  return entries
}

// ── Report builder ────────────────────────────────────────────────────────────

type ModuleStat = {
  name: string
  totalFiles: number
  coveredFiles: number
  entryIds: string[]
  changedFiles: number
  percentage: number
}

async function buildReport(changedFiles: string[]): Promise<string> {
  const [report, allEntries] = await Promise.all([
    coverage(CHRONICLE_DIR, ".", { extensions: [".ts", ".tsx", ".yml"] }),
    readCommittedEntries(CHRONICLE_DIR),
  ])

  // Restrict scan to business app directories
  const appFiles = report.coverageByFile.filter((f) =>
    APP_DIR_PREFIXES.some((prefix) => f.file.startsWith(prefix)),
  )

  // Only count changes in app scope
  const appChangedFiles = changedFiles.filter((f) =>
    APP_DIR_PREFIXES.some((prefix) => f.startsWith(prefix)),
  )

  const changedByModule = new Map<string, number>()
  for (const file of appChangedFiles) {
    const mod = extractModule(file)
    changedByModule.set(mod, (changedByModule.get(mod) ?? 0) + 1)
  }

  const moduleStats = new Map<string, ModuleStat>()
  for (const f of appFiles) {
    const mod = extractModule(f.file)
    const stat = moduleStats.get(mod) ?? {
      name: mod,
      totalFiles: 0,
      coveredFiles: 0,
      entryIds: [],
      changedFiles: changedByModule.get(mod) ?? 0,
      percentage: 0,
    }
    stat.totalFiles++
    if (f.covered) {
      stat.coveredFiles++
      for (const id of f.entryIds) {
        if (!stat.entryIds.includes(id)) stat.entryIds.push(id)
      }
    }
    moduleStats.set(mod, stat)
  }

  // Ensure changed modules appear even if not yet in the codebase scan
  for (const [mod, count] of changedByModule) {
    if (!moduleStats.has(mod)) {
      moduleStats.set(mod, {
        name: mod,
        totalFiles: count,
        coveredFiles: 0,
        entryIds: [],
        changedFiles: count,
        percentage: 0,
      })
    }
  }

  for (const stat of moduleStats.values()) {
    stat.percentage =
      stat.totalFiles === 0
        ? 0
        : Math.round((stat.coveredFiles / stat.totalFiles) * 100)
  }

  const allModules = [...moduleStats.values()].sort((a, b) =>
    a.name === "(root)" ? 1 : b.name === "(root)" ? -1 : a.name.localeCompare(b.name),
  )
  const touchedModules = allModules.filter((m) => m.changedFiles > 0)

  const lines: string[] = []
  lines.push(`## Sentinel — Chronicle Coverage Map — ${isoWeekKey(new Date())}`)
  lines.push("")

  // Coverage table
  lines.push("| Module | Coverage | Entries | Files | Changed in PR | Risk |")
  lines.push("|--------|----------|---------|-------|---------------|------|")
  for (const stat of allModules) {
    const name = stat.changedFiles > 0 ? `**${stat.name}/**` : `${stat.name}/`
    const changed = stat.changedFiles > 0 ? `**${stat.changedFiles} files**` : "—"
    lines.push(
      `| ${name} | ${stat.percentage}% | ${stat.entryIds.length} | ${stat.totalFiles} | ${changed} | ${riskLabel(stat.percentage)} |`,
    )
  }
  lines.push("")

  // Mermaid heatmap
  lines.push("```mermaid")
  lines.push("flowchart TD")
  lines.push("    classDef high fill:#fca5a5,stroke:#dc2626")
  lines.push("    classDef medium fill:#fde68a,stroke:#d97706")
  lines.push("    classDef good fill:#bbf7d0,stroke:#16a34a")
  lines.push("    Chronicle[(Chronicle)]")
  for (const stat of allModules) {
    const nodeId = mermaidSafe(stat.name)
    const changed = stat.changedFiles > 0 ? ` — ${stat.changedFiles} changed` : ""
    lines.push(
      `    Chronicle --> ${nodeId}["${stat.name} — ${stat.percentage}%${changed}"]:::${riskClass(stat.percentage)}`,
    )
  }
  lines.push("```")
  lines.push("")

  // Chronicle context for touched modules
  const touchedWithEntries = touchedModules.filter((m) => m.entryIds.length > 0)
  if (touchedWithEntries.length > 0) {
    lines.push("### Chronicle context for changed modules")
    lines.push("")
    for (const stat of touchedWithEntries) {
      lines.push(`**${stat.name}/**`)
      const relevant = allEntries.filter((e) => stat.entryIds.includes(e.id))
      for (const entry of relevant) {
        lines.push(`- \`[${entry.id.slice(0, 8)}]\` ${entryText(entry)}`)
        lines.push(`  *${entry.status} — confidence ${entry.confidence.toFixed(2)}*`)
      }
      lines.push("")
    }
  }

  lines.push("---")
  lines.push("*Risk: high = 0% coverage, medium = 1–49%, low = 50%+*")

  return lines.join("\n")
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const rawArg = process.env.CHANGED_FILES ?? process.argv[2] ?? ""
  const changedFiles = rawArg
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)

  const markdown = await buildReport(changedFiles)
  await fs.writeFile("sentinel-report.md", markdown, "utf8")
  console.log(markdown)
  process.exit(0)
}

main().catch((err) => {
  console.error("sentinel:pr failed:", err)
  process.exit(1)
})
