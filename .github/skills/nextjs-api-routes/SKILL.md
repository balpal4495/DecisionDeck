---
name: nextjs-api-routes
description: "Use when: creating or editing Next.js App Router route handlers (route.ts files) for DecisionDeck API endpoints. Covers Zod input validation, error response shapes, HTTP method handling, and security boundaries."
applyTo: "app/api/**"
---

# Next.js API Routes

## File Location

```
app/api/
  decisions/
    route.ts         ← GET (list), POST (create)
    [id]/
      route.ts       ← GET, PATCH, DELETE
  work/route.ts
  risks/route.ts
  incidents/route.ts
  reports/
    route.ts         ← POST (generate)
    [id]/route.ts    ← GET, DELETE
  quorum/
    review/route.ts  ← POST (run Quorum review)
  import/
    adr/route.ts
    github/route.ts
```

## Route Handler Template

```typescript
// app/api/decisions/route.ts
import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/db"
import { decisions } from "@/db/schema"

const CreateDecisionSchema = z.object({
  title: z.string().min(1).max(200),
  area: z.string().min(1),
  context: z.string().min(1),
  decision: z.string().min(1),
  rationale: z.string().min(1),
  alternatives: z.string().optional(),
  risks: z.string().optional(),
  reviewDate: z.string().datetime().optional(),
})

export async function GET() {
  const rows = await db.select().from(decisions).orderBy(decisions.createdAt)
  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = CreateDecisionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const [created] = await db.insert(decisions).values({
    ...parsed.data,
    id: crypto.randomUUID(),
    status: "proposed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).returning()

  return NextResponse.json(created, { status: 201 })
}
```

## Error Response Shape

Always return structured errors — never plain strings:

```typescript
// 400 / 422
{ "error": { "fieldErrors": { "title": ["Required"] }, "formErrors": [] } }

// 404
{ "error": "Decision not found", "id": "<id>" }

// 500
{ "error": "Internal server error" }
```

## PATCH — Partial Updates

```typescript
const UpdateDecisionSchema = CreateDecisionSchema.partial().extend({
  status: z.enum(["proposed", "accepted", "rejected", "superseded", "needs_review"]).optional(),
})
```

## Security Rules

- All inputs validated with Zod before touching the database — no exceptions.
- IDs from URL params must be validated as UUID format before DB lookup.
- `process.env` values accessed only server-side (never exposed in Client Components).
- This is a local-first tool — no authentication required for MVP, but do not expose routes that could write arbitrary data if the app is later network-accessible.

## Quorum Route

```typescript
// app/api/quorum/review/route.ts
export async function POST(req: Request) {
  const { outcome, design } = ReviewSchema.parse(await req.json())
  const { oracle, evaluate, deliberate } = await getQuorum()

  const evidence = await oracle.query(outcome)
  const juryOutput = await evaluate({ outcome, design, evidence }, { llm })

  if (juryOutput.recommendation !== "proceed") {
    return NextResponse.json({ stage: "jury", juryOutput })
  }

  const verdict = await deliberate({ outcome, design, evidence, jury_output: juryOutput }, { llm, oracle })
  return NextResponse.json({ stage: "council", juryOutput, verdict })
}
```
