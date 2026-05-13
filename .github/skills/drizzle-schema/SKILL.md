---
name: drizzle-schema
description: "Use when: defining or modifying Drizzle ORM tables in db/schema.ts, generating SQLite migrations with drizzle-kit, or writing type-safe DB queries for DecisionDeck. Covers table conventions, relation patterns, migration workflow, and SQLite-specific considerations."
applyTo: "db/**"
---

# Drizzle Schema

## Stack

```
drizzle-orm + better-sqlite3 + drizzle-kit
```

## db/schema.ts — Conventions

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

// Primary key: UUID generated at insert
// Timestamps: ISO strings (text)
// Enums: stored as text, validated at app layer by Zod

export const decisions = sqliteTable("decisions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull().default("proposed"),
  area: text("area").notNull(),
  owner: text("owner"),
  context: text("context").notNull(),
  decision: text("decision").notNull(),
  rationale: text("rationale").notNull(),
  alternatives: text("alternatives"),
  risks: text("risks"),
  reviewDate: text("review_date"),
  // Many-to-many as JSON arrays (MVP — no join tables)
  supersedesDecisionIds: text("supersedes_decision_ids").notNull().default("[]"),
  supersededByDecisionId: text("superseded_by_decision_id"),
  linkedWorkItemIds: text("linked_work_item_ids").notNull().default("[]"),
  linkedRiskIds: text("linked_risk_ids").notNull().default("[]"),
  linkedIncidentIds: text("linked_incident_ids").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
})

export type Decision = typeof decisions.$inferSelect
export type InsertDecision = typeof decisions.$inferInsert
```

Repeat this pattern for `workItems`, `risks`, `incidents`, `weeklyReports`.

## JSON Array Fields

Many-to-many linked IDs are stored as JSON arrays in the MVP. Parse/serialize explicitly:

```typescript
// Insert
linkedDecisionIds: JSON.stringify(["dec-1", "dec-2"])

// Read
const ids: string[] = JSON.parse(row.linkedDecisionIds)
```

Define a helper in `db/schema.ts`:

```typescript
export function parseIds(json: string): string[] {
  try { return JSON.parse(json) } catch { return [] }
}
```

## Migration Workflow

```bash
# 1. Edit db/schema.ts
# 2. Generate migration file
npx drizzle-kit generate --out db/migrations --schema db/schema.ts

# 3. Apply to local DB
npx drizzle-kit migrate

# 4. Never hand-edit migration files
```

## drizzle.config.ts

```typescript
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? "./local.db",
  },
})
```

## DB Client — db/index.ts

```typescript
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "./schema"

const sqlite = new Database(process.env.DATABASE_PATH ?? "./local.db")
export const db = drizzle(sqlite, { schema })
```

## Migration Safety Rules

- Never drop a column in the same migration that removes code using it. Two-step: remove code in a PR, then drop column in a follow-up migration after deploy.
- Never use `NOT NULL` on a new column in SQLite without a `DEFAULT` — SQLite requires defaults on NOT NULL additions via ALTER TABLE.
- All migrations are append-only in `db/migrations/` — never delete or modify generated files.
