---
name: vitest-testing
description: "Use when: writing or updating tests for DecisionDeck. Covers Vitest configuration, unit test patterns for domain logic (decision matching, report generation, review queue rules), integration test patterns for DB queries, and mock conventions."
applyTo: "**/*.test.ts,**/*.test.tsx"
---

# Vitest Testing

## Setup

Tests live in `tests/` (mirroring `app/` and `lib/` structure) or co-located as `ComponentName.test.tsx`.

`package.json` test script:
```json
"test": "vitest run",
"test:watch": "vitest"
```

## Unit Tests — Domain Logic

Domain logic functions (decision matching, report generation, review queue rules) are pure functions — test them directly without mounting React:

```typescript
// tests/lib/decision-matching.test.ts
import { describe, it, expect } from "vitest"
import { findRelevantDecisions } from "@/lib/decision-matching"

describe("findRelevantDecisions", () => {
  it("matches by area", () => {
    const decisions = [
      { id: "dec-1", area: "auth", title: "Auth changes require rollback plan", status: "accepted" },
    ]
    const workItem = { area: "auth", title: "Refactor login session handling" }
    const result = findRelevantDecisions(workItem, decisions)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("dec-1")
    expect(result[0].matchReason).toContain("area")
  })
})
```

## Integration Tests — DB Queries

Use an in-memory or temp-file SQLite database — never the production `.chronicle/` or dev DB:

```typescript
// tests/db/decisions.test.ts
import { describe, it, expect, beforeEach } from "vitest"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "@/db/schema"

describe("decisions table", () => {
  let db: ReturnType<typeof drizzle>

  beforeEach(() => {
    const sqlite = new Database(":memory:")
    db = drizzle(sqlite, { schema })
    // run migrations against in-memory DB
  })

  it("creates a decision", async () => {
    await db.insert(schema.decisions).values({ ... })
    const rows = await db.select().from(schema.decisions)
    expect(rows).toHaveLength(1)
  })
})
```

## Mocking LLM Providers

For any test that touches Quorum, mock the LLM — never call a real provider:

```typescript
import { vi } from "vitest"

const mockLLM = vi.fn().mockResolvedValue(JSON.stringify({
  confidence: 0.8,
  confidence_breakdown: { evidence_support: 0.8, feasibility: 0.8, risk: 0.8, completeness: 0.8 },
  assessment: "looks good",
  gaps: [],
  blocking_gaps: [],
  council_brief: "pressure-test",
  recommendation: "proceed",
}))
```

## Test Coverage Priorities

Cover these first — they are the core logic of the product:

| Area | Key assertions |
|---|---|
| Decision status transitions | `proposed → accepted`, `accepted → superseded`, invalid transitions throw |
| Review queue rules | Decisions surface correctly when review date passed, no owner, linked to open risks |
| Decision matching | Area match, keyword match, tag match priority order |
| Report generation | Sections are populated, facts are separated from interpretation markers |
| Follow-up overdue detection | Items with `dueDate` in the past and status `open`/`in_progress` are flagged |
| Risk filtering | High severity + open status surfaces in dashboard |

## Anti-patterns

- Never test React component render output for snapshot — test behaviour (what the user sees/does).
- Never call real LLM or real Quorum in tests — mock the provider.
- Never hardcode absolute paths — use `@/` aliases.
