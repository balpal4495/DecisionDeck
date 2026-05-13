---
name: zod-validation
description: "Use when: adding Zod schemas for API route inputs, form data, LLM output parsing, or any data entering DecisionDeck at a system boundary. Covers schema patterns, safe parse vs parse, error flattening, and where Zod is mandatory in this project."
applyTo: "**/*.ts,**/*.tsx"
---

# Zod Validation

## Where Zod is mandatory in DecisionDeck

1. **API route request bodies** — every POST/PATCH body is validated before touching the DB
2. **Quorum LLM output** — Jury and Council output is parsed through `JuryOutputSchema` / `ChairmanOutputSchema` (already in `quorum/modules/`)
3. **Import previews** — each parsed record is validated before the preview is shown
4. **Environment variables** — parse at startup, fail fast if required vars are missing
5. **URL params** — UUIDs validated before DB lookup

## Never Required

- Server Component props (TypeScript types are sufficient)
- Internal function calls between modules in the same layer

## Patterns

### API Route Body

```typescript
import { z } from "zod"

const CreateWorkItemSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  area: z.string().min(1),
  status: z.enum(["not_started", "in_progress", "blocked", "in_review", "done"]),
  riskLevel: z.enum(["low", "medium", "high"]),
  owner: z.string().optional(),
  blockedReason: z.string().optional(),
  targetDate: z.string().datetime().optional(),
  notes: z.string().optional(),
  linkedDecisionIds: z.array(z.string().uuid()).default([]),
  linkedRiskIds: z.array(z.string().uuid()).default([]),
  linkedIncidentIds: z.array(z.string().uuid()).default([]),
})

// Use safeParse to return structured errors:
const parsed = CreateWorkItemSchema.safeParse(body)
if (!parsed.success) {
  return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
}
```

### URL Param Validation

```typescript
const UUIDSchema = z.string().uuid()

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const idResult = UUIDSchema.safeParse(params.id)
  if (!idResult.success) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 })
  }
  // ...
}
```

### Environment Variables

```typescript
// lib/env.ts — parse once at module load, throw if missing
import { z } from "zod"

const EnvSchema = z.object({
  LLM_API_KEY: z.string().min(1, "LLM_API_KEY is required"),
  LLM_MODEL: z.string().default("claude-sonnet-4-5"),
  DATABASE_PATH: z.string().default("./local.db"),
})

export const env = EnvSchema.parse(process.env)
```

### LLM Output Parsing (Quorum)

The Quorum modules already validate LLM output via `JuryOutputSchema` and `ChairmanOutputSchema`. Outside those modules, if you call any LLM directly:

```typescript
const ResponseSchema = z.object({
  recommendation: z.enum(["accept", "reject", "revise", "needs_more_evidence"]),
  summary: z.string().min(1),
  evidence_cited: z.array(z.string()),
})

const raw = await llm(prompt)
const parsed = ResponseSchema.parse(JSON.parse(raw))  // throws on bad output — intentional
```

## Error Response Shape Convention

```typescript
// 422 Unprocessable Entity
{
  error: {
    formErrors: string[]           // top-level errors
    fieldErrors: Record<string, string[]>  // per-field errors
  }
}
```

Produced by `parsed.error.flatten()` — do not hand-write error messages.
