/**
 * Chronicle proposal generator — triggered by the chronicle-on-merge workflow.
 *
 * Runs after a PR merges to main. Creates a Chronicle proposal in
 * .chronicle/proposals/ from the PR title, body, and changed files.
 *
 * Environment variables (injected by GitHub Actions):
 *   PR_NUMBER   - Pull request number
 *   PR_TITLE    - Pull request title
 *   PR_BODY     - Pull request body (Markdown)
 *   CHANGED_FILES - Newline-separated list of changed files
 *
 * This is a PROPOSAL only. A human must run `npm run chronicle:commit`
 * to review and promote it to a committed Chronicle entry.
 * Auto-commits never happen — that's DEC-006.
 */

import { promises as fs } from "fs"
import path from "path"
import { randomUUID } from "crypto"
import type { ChronicleEntry } from "../quorum/modules/shared/types"

const CHRONICLE_DIR = ".chronicle"

// ── Topic inference ────────────────────────────────────────────────────────────

const TOPIC_RULES: Array<{ pattern: RegExp; topic: string }> = [
  { pattern: /\bauth\b|\blogin\b|\bsession\b|\boauth\b|\bsso\b/i, topic: "auth/change" },
  { pattern: /\bbilling\b|\bpayment\b|\binvoice\b|\bstripe\b|\bwebhook\b/i, topic: "billing/change" },
  { pattern: /\bdeploy\b|\brelease\b|\brollback\b|\bci\b|\bcd\b|\bpipeline\b/i, topic: "deployments/change" },
  { pattern: /\bschema\b|\bmigration\b|\bdrizzle\b|\bdatabase\b|\bsqlite\b/i, topic: "data/schema-change" },
  { pattern: /\bapi\b|\broute\b|\bendpoint\b|\bhandler\b/i, topic: "api/change" },
  { pattern: /\btest\b|\bvitest\b|\bspec\b/i, topic: "testing/change" },
  { pattern: /\bphase\b/i, topic: "product/phase-completion" },
  { pattern: /\bchronicle\b|\bsentinel\b|\boracle\b|\bjury\b|\bcouncil\b|\bquorum\b/i, topic: "quorum/change" },
  { pattern: /\bfix\b|\bbug\b|\bpatch\b/i, topic: "engineering/bug-fix" },
  { pattern: /\brefactor\b|\bclean\b|\brename\b/i, topic: "engineering/refactor" },
  { pattern: /\bfeat\b|\bfeature\b/i, topic: "product/feature" },
]

function inferTopic(title: string, body: string): string {
  const text = `${title} ${body}`.toLowerCase()
  for (const rule of TOPIC_RULES) {
    if (rule.pattern.test(text)) return rule.topic
  }
  return "engineering/change"
}

// ── Affected areas ─────────────────────────────────────────────────────────────

/** Extract backtick-wrapped file paths from Markdown text */
function extractFilePathsFromBody(body: string): string[] {
  const pattern = /`([a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx|sql|json|md|yml|yaml))`/g
  const found = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = pattern.exec(body)) !== null) {
    const candidate = m[1]
    // Only include things that look like paths (contain / or start with a known prefix)
    if (candidate.includes("/") || candidate.startsWith("db/") || candidate.startsWith("app/")) {
      found.add(candidate)
    }
  }
  return Array.from(found).slice(0, 12)
}

/** Parse changed files from the CHANGED_FILES env var (newline-separated) */
function parseChangedFiles(): string[] {
  return (process.env.CHANGED_FILES ?? "")
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .slice(0, 12)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const prNumber = process.env.PR_NUMBER ?? "unknown"
  const prTitle = process.env.PR_TITLE ?? "Untitled PR"
  const prBody = process.env.PR_BODY ?? ""

  const topic = inferTopic(prTitle, prBody)

  // Affected areas: prefer changed files from git, fall back to body extraction
  const changedFiles = parseChangedFiles()
  const bodyFiles = extractFilePathsFromBody(prBody)
  const affectedAreas: string[] =
    changedFiles.length > 0
      ? changedFiles
      : bodyFiles.length > 0
        ? bodyFiles
        : ["(review and update affected_areas before committing this proposal)"]

  // Build a one-sentence decision from the PR title — human should refine this
  const decision = prTitle.replace(/^(feat|fix|chore|refactor|docs|test|ci):\s*/i, "").trim()

  const proposal: Omit<ChronicleEntry, "id" | "timestamp"> = {
    schema_version: 2,
    topic,
    decision: `${decision} (PR #${prNumber})`,
    key_insight: `${decision} (PR #${prNumber})`,
    affected_areas: affectedAreas,
    scope: topic.split("/"),
    status: "open",
    confidence: 0.5, // Low — human should review and adjust before committing
    source_module: "github-actions/chronicle-on-merge",
    evidence_cited: [],
    // Provide the PR body as raw material for the reviewer
    alternatives_considered: [
      "(auto-generated — review PR body and refine before committing)",
    ],
    rejected_reason: [],
  }

  const proposalId = randomUUID()
  const proposalsDir = path.join(CHRONICLE_DIR, "proposals")
  await fs.mkdir(proposalsDir, { recursive: true })

  const proposalPath = path.join(proposalsDir, `${proposalId}.json`)
  await fs.writeFile(proposalPath, JSON.stringify(proposal, null, 2), "utf8")

  console.log(`Chronicle proposal staged: ${proposalId}`)
  console.log(`Topic:           ${topic}`)
  console.log(`Affected areas:  ${affectedAreas.slice(0, 3).join(", ")}${affectedAreas.length > 3 ? ` (+${affectedAreas.length - 3} more)` : ""}`)
  console.log(``)
  console.log(`Review ${proposalPath} before running: npm run chronicle:commit`)

  process.exit(0)
}

main().catch((err) => {
  console.error("chronicle-pr failed:", err)
  process.exit(1)
})
