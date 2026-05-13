---
name: importer-pattern
description: "Use when: building any Phase 9 importer — GitHub PR import, Linear CSV, Jira CSV, ADR Markdown, or Incident Markdown. Covers the parse → preview → user-confirm → save pipeline. Importers never auto-save."
---

# Importer Pattern

## Core Rule

**Importers never auto-save.** Every importer produces a preview of what will be created or updated. The user reviews and confirms before anything is written to the database.

## Pipeline

```
1. parse     → transform raw input (file, URL, CSV) into DecisionDeck record shapes
2. validate  → run Zod schema on each record; separate valid from invalid
3. preview   → return preview payload to the UI; show diff if updating existing records
4. confirm   → user reviews, accepts, edits, or rejects each item
5. save      → write only confirmed items; return result summary
```

## File Structure

```
app/api/import/
  adr/route.ts          ← POST multipart/form-data with .md files
  github/route.ts       ← POST { repoOwner, repoName, token }
  linear/route.ts       ← POST multipart/form-data with .csv
  jira/route.ts         ← POST multipart/form-data with .csv
lib/importers/
  adr-parser.ts         ← parse ADR Markdown → Decision[]
  github-parser.ts      ← parse GitHub PR JSON → WorkItem[]
  linear-parser.ts      ← parse Linear CSV → WorkItem[]
  jira-parser.ts        ← parse Jira CSV → WorkItem[]
  incident-parser.ts    ← parse Incident Markdown → Incident[]
```

## API Route Pattern

```typescript
// app/api/import/adr/route.ts
export async function POST(req: Request) {
  // 1. Parse
  const formData = await req.formData()
  const file = formData.get("file") as File
  const text = await file.text()
  const rawRecords = parseADR(text)

  // 2. Validate
  const { valid, invalid } = validateRecords(rawRecords)

  // 3. Return preview — do NOT save yet
  return NextResponse.json({
    preview: valid,
    invalid,
    count: { valid: valid.length, invalid: invalid.length },
  })
}

// Separate confirm endpoint
// POST /api/import/adr/confirm  { items: Decision[] }
export async function PUT(req: Request) {
  const { items } = ConfirmSchema.parse(await req.json())
  const saved = await db.insert(decisions)
    .values(items.map(d => ({ ...d, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })))
    .onConflictDoNothing()
    .returning()
  return NextResponse.json({ saved: saved.length })
}
```

## ADR Parser — Field Mapping

```
ADR # {n}: {title}       → id = "DEC-{n}", title
Status: {status}          → map to DecisionDeck status enum
Context                   → context field
Decision                  → decision field
Consequences/Rationale    → rationale field
```

## GitHub PR Parser — Field Mapping

```
PR title                  → title
PR state (open/closed)    → status (in_progress / done)
PR labels                 → area (best effort)
PR body                   → notes
PR base branch + target   → used to infer riskLevel
```

## Sensitive Data Rule

Imported data stays local. No imported record is forwarded to any external service. Quorum review of an import batch is opt-in, not automatic.
