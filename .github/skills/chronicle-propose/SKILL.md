---
name: chronicle-propose
description: "Use when: proposing a new Chronicle entry to Oracle after a significant decision is made in DecisionDeck. Covers oracle.propose() required fields, what makes a good Chronicle entry, the human-gate rule, and how to reference the proposal ID."
---

# Chronicle Propose

## Rule

`oracle.propose()` stages an entry for human review. It does NOT index it. A human must run `quorum commit <id>` to make the entry searchable by Oracle.

**Never call `oracle.commit()` from application code.**

## When to Propose

Propose a Chronicle entry after:

- A new product decision is accepted (DEC-xxx)
- A significant schema change is made
- A Quorum Council deliberation completes (this happens automatically inside `council.deliberate()`)
- A phase is completed and the key outcomes should be remembered

## oracle.propose() Call Shape

```typescript
const { oracle } = await getQuorum()

const proposal = await oracle.propose({
  schema_version: 2,

  // Required v2 fields
  topic: "decisions/acceptance policy",           // short label: "domain/subject"
  decision: "Decisions require Quorum review before acceptance in DecisionDeck",
  key_insight: "Decisions require Quorum review before acceptance in DecisionDeck",  // same as decision for v2

  affected_areas: [
    "app/api/decisions/[id]/route.ts",
    "lib/quorum/review-decision.ts",
  ],

  // Evidence and confidence
  status: "open",                // always "open" for new proposals
  confidence: 0.85,              // 0–1, your estimate
  source_module: "Architect",    // which agent/module proposed this
  evidence_cited: [],            // only include IDs that actually exist in Chronicle

  // Optional v2 fields
  alternatives_considered: [
    "Accept decisions manually without Quorum review",
  ],
  rejected_reason: [
    "Without Quorum review, prior decisions can be ignored silently",
  ],
  scope: ["decisions", "quorum"],
})

// proposal.id — include in the completion report
console.log(`Proposal staged: ${proposal.id}`)
```

## Field Guidelines

| Field | Rule |
|---|---|
| `topic` | Format: `"domain/subject"` — max 80 chars |
| `decision` | The decision itself — what was decided, not why. One sentence. |
| `confidence` | Your honest estimate. 0.7+ if well-evidenced, 0.5 if uncertain. |
| `evidence_cited` | Only real IDs from the current Chronicle. Do not guess or hallucinate IDs. |
| `affected_areas` | File paths that this decision constrains. Used by Sentinel coverage reports. |

## After Proposing

Always include the proposal ID in the completion report so the user knows what to commit:

```
Chronicle proposal staged: abc-12345
To commit: quorum commit abc-12345
```

## Human Commit

```bash
quorum commit --list           # see all pending proposals
quorum commit abc-12345        # approve and index
quorum commit abc-12345 --dry-run  # preview without writing
```
