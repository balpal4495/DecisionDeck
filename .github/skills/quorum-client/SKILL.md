---
name: quorum-client
description: "Use when: wiring Quorum in lib/quorum/client.ts, calling oracle.query(), jury.evaluate(), council.deliberate(), or oracle.propose() from any DecisionDeck module. Covers setup() initialisation, the singleton pattern, LLM provider injection, and the human-gate rule for oracle.commit()."
---

# Quorum Client

## Setup — lib/quorum/client.ts

`setup()` must be called once before any Quorum call. In Next.js, use a module-level singleton:

```typescript
// lib/quorum/client.ts
import { setup } from "../../quorum/modules/setup"
import type { LLMProvider } from "../../quorum/modules/shared/types"

type QuorumModules = Awaited<ReturnType<typeof setup>>
let _quorum: QuorumModules | null = null

export async function getQuorum(): Promise<QuorumModules> {
  if (!_quorum) {
    const llm = buildLLMProvider()   // see below
    _quorum = await setup({
      llm,
      chronicleDir: ".chronicle",
      warmEmbedder: true,
    })
  }
  return _quorum
}
```

The `llm` provider function must match `LLMProvider`:

```typescript
type LLMProvider = (prompt: string, model?: string) => Promise<string>
```

Wire it to the project's model of choice (OpenAI, Anthropic, etc.) via environment variable:

```typescript
function buildLLMProvider(): LLMProvider {
  const apiKey = process.env.LLM_API_KEY
  if (!apiKey) throw new Error("LLM_API_KEY not set")
  // return a function that calls your provider
}
```

## oracle.query()

```typescript
const { oracle } = await getQuorum()

const evidence = await oracle.query("describe what you're about to evaluate")
// evidence: OracleResult[]  — empty if Chronicle has no relevant entries
```

Always query before calling Jury. Pass `evidence` to `jury.evaluate()`.

## jury.evaluate()

```typescript
const { evaluate } = await getQuorum()

const juryOutput = await evaluate(
  {
    outcome: "what we want to achieve",
    design: "how we plan to achieve it",
    evidence,   // from oracle.query()
  },
  { llm, model: process.env.JURY_MODEL }
)

// juryOutput.recommendation: "proceed" | "investigate-more" | "redesign"
// juryOutput.confidence: 0–1
// juryOutput.council_brief: "challenge" | "pressure-test"
```

Route on `recommendation`:
- `proceed` → call `council.deliberate()`
- `investigate-more` → return `juryOutput.gaps` to the user
- `redesign` → return assessment to the user, do not proceed

## council.deliberate()

```typescript
const { deliberate } = await getQuorum()

const verdict = await deliberate(
  {
    outcome,
    design,
    evidence,
    jury_output: juryOutput,
  },
  { llm, oracle, models: { ... } }
)

// verdict.satisfied: boolean
// verdict.recommendation: "proceed" | "redesign" | "investigate-more"
// verdict.blockers: Array<{ issue, evidence, required_fix }>
// verdict.warnings: Array<{ issue, suggested_fix? }>
```

`deliberate()` calls `oracle.propose()` internally — a Chronicle proposal is staged automatically.

## oracle.propose()

Only call directly when NOT going through `deliberate()` (e.g. after a schema decision):

```typescript
const { oracle } = await getQuorum()

const proposal = await oracle.propose({
  schema_version: 2,
  topic: "data/incidents table",
  decision: "Incidents store follow-ups as a JSON array in the incidents table",
  key_insight: "Incidents store follow-ups as a JSON array in the incidents table",
  affected_areas: ["db/schema.ts"],
  status: "open",
  confidence: 0.85,
  source_module: "DataEngineer",
  evidence_cited: [],
})

// proposal.id — use this in the completion report
```

## oracle.commit() — NEVER CALL FROM CODE

`oracle.commit()` is a human gate. The human runs:

```bash
quorum commit --list     # see pending proposals
quorum commit <id>       # approve and index
```

Any code path that calls `oracle.commit()` autonomously is a bug. Do not add it.
