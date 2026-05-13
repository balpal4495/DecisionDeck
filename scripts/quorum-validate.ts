/**
 * Quorum validation — Jury + Council review of the Sentinel coverage decision.
 *
 * Validates: "Sentinel PR coverage is scoped to the DecisionDeck business
 * application (app, db, lib, scripts, .github, components, tests) and
 * intentionally excludes quorum/ (portable infrastructure) and .next/ (build
 * output), so the heatmap signal reflects whether Oracle/Jury/Council have
 * enough Chronicle knowledge to guide developers building the application."
 *
 * Pipeline:
 *   BM25 oracle query  →  jury.evaluate()  →  (if proceed) council.deliberate()
 *   →  oracle.propose()  →  print verdict
 *
 * Uses GEMINI_API_KEY from environment. No vector store / embedder required.
 *
 * Usage:
 *   npx tsx scripts/quorum-validate.ts
 */

import { GoogleGenAI } from "@google/genai"
import { promises as fs } from "fs"
import path from "path"
import { evaluate } from "../quorum/modules/jury/evaluate"
import { deliberate } from "../quorum/modules/council/deliberate"
import { bm25Score } from "../quorum/modules/oracle/bm25"
import { entryText } from "../quorum/modules/shared/types"
import type { ChronicleEntry, OracleResult, LLMProvider, Message } from "../quorum/modules/shared/types"

const CHRONICLE_DIR = ".chronicle"
const MODEL = "gemini-2.0-flash"

// ── Gemini LLM provider ───────────────────────────────────────────────────────

function buildLLM(): LLMProvider {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY not set in environment")

  const genai = new GoogleGenAI({ apiKey })

  return async (messages: Message[], model?: string): Promise<string> => {
    // Map quorum Message[] to a single Gemini prompt (system + user turn)
    const systemMsg = messages.find(m => m.role === "system")?.content ?? ""
    const userMsg = messages
      .filter(m => m.role !== "system")
      .map(m => m.content)
      .join("\n\n")

    const fullPrompt = systemMsg ? `${systemMsg}\n\n${userMsg}` : userMsg

    const response = await genai.models.generateContent({
      model: model ?? MODEL,
      contents: fullPrompt,
    })

    return response.text ?? ""
  }
}

// ── BM25-only oracle evidence (no vector store) ───────────────────────────────

async function readCommittedEntries(): Promise<ChronicleEntry[]> {
  const committedDir = path.join(CHRONICLE_DIR, "committed")
  let files: string[]
  try {
    files = await fs.readdir(committedDir)
  } catch {
    return []
  }
  const entries: ChronicleEntry[] = []
  for (const f of files.filter(f => f.endsWith(".json"))) {
    try {
      const raw = await fs.readFile(path.join(committedDir, f), "utf8")
      entries.push(JSON.parse(raw) as ChronicleEntry)
    } catch { /* skip malformed */ }
  }
  return entries
}

async function oracleQuery(queryText: string, limit = 8): Promise<OracleResult[]> {
  const entries = await readCommittedEntries()
  if (entries.length === 0) return []

  const documents = entries.map(e =>
    [entryText(e), ...e.affected_areas, ...(e.scope ?? [])].join(" ")
  )
  const scores = bm25Score(queryText, documents)

  const ranked = entries
    .map((entry, i) => ({ entry, score: scores[i] ?? 0 }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  const top = Math.ceil(ranked.length * 0.3)
  const mid = Math.ceil(ranked.length * 0.7)

  return ranked.map((r, i) => ({
    ...r.entry,
    score: r.score,
    tier: (i < top ? "primary" : i < mid ? "supporting" : "background") as OracleResult["tier"],
  }))
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function hr() { console.log("\n" + "─".repeat(70) + "\n") }
function section(title: string) { console.log(`\n### ${title}\n`) }

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════╗")
  console.log("║  Quorum Validation — Sentinel Coverage Scope Decision            ║")
  console.log("╚══════════════════════════════════════════════════════════════════╝")

  const llm = buildLLM()

  const outcome =
    "Sentinel PR comments accurately represent whether Oracle, Jury, and Council " +
    "have sufficient Chronicle knowledge to guide developers building the " +
    "DecisionDeck business application correctly."

  const design =
    "Sentinel's coverage heatmap is scoped exclusively to these top-level directories: " +
    "app/, db/, lib/, scripts/, .github/, components/, tests/. " +
    "The quorum/ directory (portable infrastructure shared across projects) and " +
    ".next/ (Next.js build output) are excluded from coverage calculations. " +
    "Coverage is measured by checking whether each file in these directories is " +
    "referenced in at least one Chronicle committed entry's affected_areas field. " +
    "The mermaid heatmap uses red (0%), amber (1-49%), green (50%+) colouring. " +
    "Chronicle context entries for touched modules are surfaced inline in the PR comment."

  // ── Step 1: Oracle query ──────────────────────────────────────────────────
  section("Step 1 — Oracle Query (BM25)")
  const queryText = `${outcome} ${design}`.slice(0, 500)
  const evidence = await oracleQuery(queryText)
  console.log(`Found ${evidence.length} relevant Chronicle entries:\n`)
  for (const r of evidence) {
    console.log(`  [${r.id.slice(0, 8)}] score=${r.score.toFixed(3)}`)
    console.log(`  ${entryText(r)}`)
    console.log(`  status: ${r.status} | confidence: ${r.confidence}`)
    console.log()
  }

  // ── Step 2: Jury evaluation ───────────────────────────────────────────────
  section("Step 2 — Jury Evaluate")
  console.log("Calling jury.evaluate()... (LLM call)")
  const juryOutput = await evaluate({ outcome, design, evidence }, { llm, model: MODEL })

  console.log(`\nConfidence:      ${(juryOutput.confidence * 100).toFixed(0)}%`)
  console.log(`Recommendation:  ${juryOutput.recommendation}`)
  console.log(`Council brief:   ${juryOutput.council_brief}`)
  console.log(`\nAssessment:\n  ${juryOutput.assessment}`)

  if (juryOutput.gaps.length > 0) {
    console.log(`\nGaps:`)
    juryOutput.gaps.forEach(g => console.log(`  • ${g}`))
  }
  if (juryOutput.blocking_gaps.length > 0) {
    console.log(`\n⚠ Blocking gaps:`)
    juryOutput.blocking_gaps.forEach(g => console.log(`  ✗ ${g}`))
  }

  const breakdown = juryOutput.confidence_breakdown
  console.log(`\nConfidence breakdown:`)
  console.log(`  evidence_support: ${(breakdown.evidence_support * 100).toFixed(0)}%`)
  console.log(`  feasibility:      ${(breakdown.feasibility * 100).toFixed(0)}%`)
  console.log(`  risk:             ${(breakdown.risk * 100).toFixed(0)}%`)
  console.log(`  completeness:     ${(breakdown.completeness * 100).toFixed(0)}%`)

  // Route on Jury recommendation
  if (juryOutput.recommendation === "investigate-more") {
    hr()
    console.log("⛔ Jury says INVESTIGATE-MORE — Council skipped.")
    console.log("Gaps to resolve before proceeding:")
    juryOutput.gaps.forEach(g => console.log(`  • ${g}`))
    process.exit(0)
  }

  if (juryOutput.recommendation === "redesign") {
    hr()
    console.log("⛔ Jury says REDESIGN — Council skipped.")
    console.log("Assessment:", juryOutput.assessment)
    process.exit(0)
  }

  // ── Step 3: Council deliberation ──────────────────────────────────────────
  hr()
  section("Step 3 — Council Deliberate")
  console.log("Calling council.deliberate()... (LLM fan-out — may take 15–30s)")

  // Need a minimal oracle client with just propose() for council
  const proposals: object[] = []
  const mockOracle = {
    query: async () => evidence,
    propose: async (entry: object) => {
      proposals.push(entry)
      const id = `validate-${Date.now()}`
      console.log(`\n[oracle.propose] Staged proposal id: ${id}`)
      return id
    },
    commit: async () => { throw new Error("No auto-commits — human gate required") },
  }

  const councilOutput = await deliberate(
    { outcome, design, evidence, jury_output: juryOutput },
    { llm, oracle: mockOracle as never, model: MODEL }
  )

  console.log(`\nSatisfied:       ${councilOutput.satisfied ? "✅ yes" : "❌ no"}`)
  console.log(`Recommendation:  ${councilOutput.recommendation}`)
  console.log(`\nVerdict:\n  ${councilOutput.verdict}`)

  if (councilOutput.blockers && councilOutput.blockers.length > 0) {
    console.log(`\n⚠ Blockers:`)
    councilOutput.blockers.forEach(b => console.log(`  ✗ ${b.issue}\n    Fix: ${b.required_fix}`))
  }

  if (councilOutput.warnings && councilOutput.warnings.length > 0) {
    console.log(`\nWarnings:`)
    councilOutput.warnings.forEach(w => console.log(`  ⚠ ${w.issue}`))
  }

  if (councilOutput.citation_validation) {
    const cv = councilOutput.citation_validation
    if (cv.hallucinated_ids.length > 0) {
      console.log(`\n⚠ Hallucinated citation IDs detected: ${cv.hallucinated_ids.join(", ")}`)
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  hr()
  section("Summary")
  const juryPassed = juryOutput.recommendation === "proceed"
  const councilPassed = councilOutput.satisfied && councilOutput.recommendation === "proceed"

  console.log(`Jury:    ${juryPassed ? "✅ proceed" : "❌ " + juryOutput.recommendation}`)
  console.log(`Council: ${councilPassed ? "✅ satisfied / proceed" : "❌ " + councilOutput.recommendation}`)
  console.log()

  if (juryPassed && councilPassed) {
    console.log("✅ Quorum PASSED — design is validated. Ready for human gate → Executor.")
    console.log("\nTo stage this as a Chronicle entry, review the proposal printed above")
    console.log("and run: npm run chronicle:commit")
  } else {
    console.log("❌ Quorum did NOT pass — see blockers/gaps above before merging.")
  }
}

main().catch(err => {
  console.error("\nquorum-validate failed:", err.message ?? err)
  process.exit(1)
})
