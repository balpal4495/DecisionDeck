import { setup } from "../quorum/modules/setup"

async function main() {
  const { oracle } = await setup({ llm: null as any })

  const p = await oracle.propose({
    schema_version: 2,
    topic: "data-sync/jira-issuetype-filter",
    decision: "Jira sync must use `issuetype NOT IN (Epic)` instead of a whitelist, and include a PR-key backfill pass for tickets missing from the main sweep.",
    key_insight: "Jira instance-specific type names silently break whitelist filters ('Sub-task' vs 'Subtask'). Exclusion is safer than enumeration. Done tickets referenced by open PRs need a separate fetch pass to prevent false orphan signals in analysis views.",
    affected_areas: [
      "scripts/sync-jira.ts",
      "lib/graph.ts",
    ],
    status: "open",
    confidence: 0.97,
    source_module: "DataEngineer",
    evidence_cited: [],
    alternatives_considered: [
      "Keep whitelist and add 'Sub-task' to it",
      "Accept orphan false-positives as acceptable noise in PR Coverage",
    ],
    rejected_reason: [
      "Whitelist addition is brittle — would break again on any future non-standard issuetype; exclusion is future-proof",
      "False orphan signals erode trust in the PR Coverage view — users will stop acting on it if signals are known to be unreliable",
    ],
    scope: ["sync", "jira", "pr-coverage"],
  })

  console.log("Chronicle proposal staged:", p.proposalId)
  console.log("To commit: npx tsx scripts/chronicle-commit-all.ts  OR  quorum commit", p.proposalId)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
