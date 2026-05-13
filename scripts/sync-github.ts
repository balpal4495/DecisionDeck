/**
 * Phase 1: GitHub sync script
 *
 * Pulls open PRs and issues from configured GitHub (Enterprise) repos
 * and upserts them as WorkItems in the local SQLite database.
 *
 * Run: npm run sync:github
 *
 * Config (in .env.local):
 *   GH_HOST     - GitHub Enterprise hostname, e.g. github.mycompany.com
 *                 Omit for github.com
 *   GH_TOKEN    - Personal access token with repo scope
 *   GH_REPOS    - Comma-separated list of "org/repo" strings
 *                 e.g. "myorg/platform,myorg/billing"
 */

import { execSync } from "child_process"
import { randomUUID } from "crypto"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import * as schema from "../db/schema"
import { workItems } from "../db/schema"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { inferArea, inferRiskLevel, mapPrStatus } from "../lib/github/mappers"

// ── Load env ──────────────────────────────────────────────────────────────────

// dotenv is not installed — read .env.local manually for the script context
import { readFileSync, existsSync } from "fs"

function loadEnvLocal() {
  const path = ".env.local"
  if (!existsSync(path)) return
  const lines = readFileSync(path, "utf8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "")
    if (!(key in process.env)) process.env[key] = val
  }
}

loadEnvLocal()

// ── Zod schemas for GH API responses ─────────────────────────────────────────

const GhPrSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  draft: z.boolean().optional().default(false),
  html_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  labels: z.array(z.object({ name: z.string() })).optional().default([]),
  user: z.object({ login: z.string() }).optional().nullable(),
})

const GhIssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  html_url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  labels: z.array(z.object({ name: z.string() })).optional().default([]),
  assignee: z.object({ login: z.string() }).optional().nullable(),
  pull_request: z.object({}).optional(), // present if this issue is actually a PR
})

type GhPr = z.infer<typeof GhPrSchema>
type GhIssue = z.infer<typeof GhIssueSchema>

// ── GH CLI helper ─────────────────────────────────────────────────────────────

function ghApi(endpoint: string): unknown {
  const host = process.env.GH_HOST
  const token = process.env.GH_TOKEN

  if (!token) {
    throw new Error("GH_TOKEN is not set. Add it to .env.local")
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GH_TOKEN: token,
  }
  if (host) env.GH_HOST = host

  const hostFlag = host ? `--hostname ${host}` : ""
  const cmd = `gh api ${hostFlag} "${endpoint}" --paginate`

  try {
    const output = execSync(cmd, { env, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] })
    return JSON.parse(output)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`gh api call failed for ${endpoint}: ${msg}`)
  }
}

// ── Upsert logic ──────────────────────────────────────────────────────────────

async function upsertWorkItem(
  db: ReturnType<typeof drizzle>,
  item: schema.InsertWorkItem,
): Promise<"inserted" | "updated"> {
  const existing = await db
    .select({ id: workItems.id })
    .from(workItems)
    .where(eq(workItems.externalId, item.externalId!))

  if (existing.length > 0) {
    await db
      .update(workItems)
      .set({
        title: item.title,
        status: item.status,
        externalUrl: item.externalUrl,
        rawData: item.rawData,
        lastSyncedAt: item.lastSyncedAt,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workItems.externalId, item.externalId!))
    return "updated"
  }

  await db.insert(workItems).values(item)
  return "inserted"
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const repos = (process.env.GH_REPOS ?? "").split(",").map((r) => r.trim()).filter(Boolean)

  if (repos.length === 0) {
    console.error("GH_REPOS is not set. Add it to .env.local, e.g. GH_REPOS=myorg/repo1,myorg/repo2")
    process.exit(1)
  }

  const sqlite = new Database(process.env.DATABASE_PATH ?? "./local.db")
  sqlite.pragma("journal_mode = WAL")
  const db = drizzle(sqlite, { schema })

  const now = new Date().toISOString()
  let inserted = 0
  let updated = 0

  for (const repo of repos) {
    console.log(`\nSyncing ${repo}...`)

    // ── Pull Requests ─────────────────────────────────────────────────────────
    let prsRaw: unknown
    try {
      prsRaw = ghApi(`/repos/${repo}/pulls?state=open&per_page=100`)
    } catch (err) {
      console.error(`  Failed to fetch PRs for ${repo}:`, err instanceof Error ? err.message : err)
      continue
    }

    const prs = z.array(GhPrSchema).parse(Array.isArray(prsRaw) ? prsRaw : [])

    for (const pr of prs) {
      const externalId = `${repo}#${pr.number}`
      const labels = (pr.labels ?? []).map((l) => l.name)
      const area = inferArea(pr.title, labels)
      const riskLevel = inferRiskLevel(labels, pr.created_at, parseInt(process.env.PR_AGE_WARNING_DAYS ?? "7", 10))

      const item: schema.InsertWorkItem = {
        id: randomUUID(),
        title: `[PR #${pr.number}] ${pr.title}`,
        status: mapPrStatus(pr.state, pr.draft ?? false),
        area,
        owner: pr.user?.login ?? null,
        riskLevel,
        source: "github",
        externalId,
        externalUrl: pr.html_url,
        rawData: JSON.stringify(pr),
        lastSyncedAt: now,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
      }

      const result = await upsertWorkItem(db, item)
      if (result === "inserted") inserted++
      else updated++
    }

    console.log(`  ✓ ${prs.length} open PRs processed`)

    // ── Issues ────────────────────────────────────────────────────────────────
    let issuesRaw: unknown
    try {
      issuesRaw = ghApi(`/repos/${repo}/issues?state=open&per_page=100`)
    } catch (err) {
      console.error(`  Failed to fetch issues for ${repo}:`, err instanceof Error ? err.message : err)
      continue
    }

    const allIssues = z.array(GhIssueSchema).parse(Array.isArray(issuesRaw) ? issuesRaw : [])
    // Filter out issues that are actually PRs (GH API returns both)
    const issues = allIssues.filter((i) => !i.pull_request)

    for (const issue of issues) {
      const externalId = `${repo}!${issue.number}`
      const labels = (issue.labels ?? []).map((l) => l.name)
      const area = inferArea(issue.title, labels)
      const riskLevel = inferRiskLevel(labels, issue.created_at, parseInt(process.env.PR_AGE_WARNING_DAYS ?? "7", 10))

      const item: schema.InsertWorkItem = {
        id: randomUUID(),
        title: `[Issue #${issue.number}] ${issue.title}`,
        status: "not_started",
        area,
        owner: issue.assignee?.login ?? null,
        riskLevel,
        source: "github",
        externalId,
        externalUrl: issue.html_url,
        rawData: JSON.stringify(issue),
        lastSyncedAt: now,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
      }

      const result = await upsertWorkItem(db, item)
      if (result === "inserted") inserted++
      else updated++
    }

    console.log(`  ✓ ${issues.length} open issues processed`)
  }

  console.log(`\nSync complete. ${inserted} inserted, ${updated} updated.`)
  process.exit(0)
}

main().catch((err) => {
  console.error("sync:github failed:", err)
  process.exit(1)
})
