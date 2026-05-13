/**
 * Phase 2: Jira sync script
 *
 * Pulls epics and tickets from configured Jira project(s) via the Jira REST
 * API (v3) and upserts them as WorkItems in the local SQLite database.
 *
 * Run: npm run sync:jira
 *
 * Config (in .env.local):
 *   JIRA_HOST      - Jira hostname, e.g. mycompany.atlassian.net
 *   JIRA_EMAIL     - Atlassian account email (used for Basic auth)
 *   JIRA_TOKEN     - Atlassian API token
 *   JIRA_PROJECTS  - Comma-separated Jira project keys, e.g. "PROJ,TEAM"
 *
 * Auth: HTTP Basic — base64(email:token)
 * No write-back, no webhooks, no sprint/velocity data.
 */

import { randomUUID } from "crypto"
import { readFileSync, existsSync } from "fs"
import https from "https"
import tls from "tls"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { eq } from "drizzle-orm"
import { z } from "zod"
import * as schema from "../db/schema"
import { workItems } from "../db/schema"
import {
  inferAreaFromJira,
  inferRiskLevelFromJira,
  mapJiraStatus,
  extractBlockedReason,
  type JiraIssueLink,
} from "../lib/jira/mappers"

// ── Load env ──────────────────────────────────────────────────────────────────

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

// ── Jira API helper ───────────────────────────────────────────────────────────

function buildAuthHeader(): string {
  const email = process.env.JIRA_EMAIL
  const token = process.env.JIRA_TOKEN
  if (!email || !token) {
    throw new Error("JIRA_EMAIL and JIRA_TOKEN must be set in .env.local")
  }
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64")
}

function jiraPost(host: string, path: string, auth: string, body: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const insecureTls = (process.env.JIRA_INSECURE_TLS ?? "").toLowerCase() === "true"

    // Parse host:port in case JIRA_HOST includes a port number
    const [hostname, portStr] = host.split(":")
    const port = portStr ? parseInt(portStr, 10) : 443
    const payload = JSON.stringify(body)

    const options: https.RequestOptions = {
      hostname,
      port,
      path,
      method: "POST",
      rejectUnauthorized: !insecureTls,
      minVersion: insecureTls ? ("TLSv1" as tls.SecureVersion) : undefined,
      headers: {
        Authorization: auth,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }
    const req = https.request(options, (res) => {
      let rawBody = ""
      res.on("data", (chunk: Buffer) => { rawBody += chunk.toString() })
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Jira API ${res.statusCode} for ${path}: ${rawBody}`))
          return
        }
        try {
          resolve(JSON.parse(rawBody))
        } catch {
          reject(new Error(`Failed to parse Jira response for ${path}`))
        }
      })
    })
    req.on("error", reject)
    req.write(payload)
    req.end()
  })
}

/**
 * Paginate through POST /rest/api/3/search/jql.
 * Returns all issues matching the JQL query.
 */
async function searchJira(
  host: string,
  auth: string,
  jql: string,
  fields: string[],
): Promise<unknown[]> {
  const pageSize = 50
  let nextPageToken: string | undefined = undefined
  const all: unknown[] = []

  while (true) {
    const body: Record<string, unknown> = { jql, maxResults: pageSize, fields }
    if (nextPageToken !== undefined) body.nextPageToken = nextPageToken

    const raw = await jiraPost(host, "/rest/api/3/search/jql", auth, body)
    const page = JiraSearchPageSchema.parse(raw)

    all.push(...page.issues)

    if (page.isLast || !page.nextPageToken || page.issues.length === 0) break
    nextPageToken = page.nextPageToken
  }

  return all
}

// ── Zod schemas ───────────────────────────────────────────────────────────────

const JiraIssueLinkSchema: z.ZodType<JiraIssueLink> = z.object({
  type: z.object({ inward: z.string() }),
  inwardIssue: z
    .object({
      key: z.string(),
      fields: z
        .object({
          summary: z.string().optional(),
          status: z
            .object({
              statusCategory: z
                .object({ key: z.string().optional() })
                .optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
})

const JiraSprintSchema = z.object({
  id: z.number().optional(),
  name: z.string().optional(),
  state: z.string().optional(),
}).passthrough()

const JiraSubtaskSchema = z.object({
  key: z.string(),
  fields: z.object({
    summary: z.string().optional(),
    status: z.object({ name: z.string() }).optional(),
    issuetype: z.object({ name: z.string() }).optional(),
  }).optional(),
}).passthrough()

const JiraIssueSchema = z.object({
  key: z.string(),
  fields: z.object({
    summary: z.string(),
    issuetype: z.object({ name: z.string() }),
    status: z.object({
      name: z.string(),
      statusCategory: z.object({
        key: z.string(),
      }),
    }),
    priority: z
      .object({ name: z.string() })
      .optional()
      .nullable(),
    labels: z.array(z.string()).optional().default([]),
    assignee: z
      .object({ displayName: z.string(), emailAddress: z.string().optional() })
      .optional()
      .nullable(),
    reporter: z
      .object({ displayName: z.string(), emailAddress: z.string().optional() })
      .optional()
      .nullable(),
    issuelinks: z.array(JiraIssueLinkSchema).optional().default([]),
    parent: z
      .object({ key: z.string(), fields: z.object({ summary: z.string().optional(), issuetype: z.object({ name: z.string() }).optional() }).optional() })
      .optional()
      .nullable(),
    subtasks: z.array(JiraSubtaskSchema).optional().default([]),
    customfield_10007: z.union([z.array(JiraSprintSchema), z.null()]).optional(),
    customfield_10005: z.union([z.number(), z.null()]).optional(),
    customfield_11725: z.union([z.number(), z.null()]).optional(),
    created: z.string(),
    updated: z.string(),
  }).passthrough(),
})

const JiraSearchPageSchema = z.object({
  isLast: z.boolean().optional().default(true),
  nextPageToken: z.string().optional(),
  issues: z.array(JiraIssueSchema),
})

type JiraIssue = z.infer<typeof JiraIssueSchema>

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
        blockedReason: item.blockedReason,
        riskLevel: item.riskLevel,
        owner: item.owner,
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

// ── Map a Jira issue to a WorkItem ────────────────────────────────────────────

function toWorkItem(issue: JiraIssue, now: string): schema.InsertWorkItem {
  const { fields } = issue
  const labels = fields.labels ?? []
  const issueLinks = fields.issuelinks ?? []

  const area = inferAreaFromJira(fields.summary, labels)
  const riskLevel = inferRiskLevelFromJira(fields.priority?.name ?? null, labels)

  const statusCategoryKey = fields.status.statusCategory.key
  const statusName = fields.status.name
  let status = mapJiraStatus(statusCategoryKey, statusName)

  // Blocker links override the mapped status
  const blockedReason = extractBlockedReason(issueLinks)
  if (blockedReason) status = "blocked"

  const rawHost = (process.env.JIRA_HOST ?? "").replace(/^https?:\/\//i, "").replace(/\/$/, "")
  const externalUrl = `https://${rawHost}/browse/${issue.key}`

  return {
    id: randomUUID(),
    title: `[${issue.key}] ${fields.summary}`,
    status,
    area,
    owner: fields.assignee?.emailAddress ?? fields.assignee?.displayName ?? null,
    riskLevel,
    blockedReason: blockedReason ?? null,
    source: "jira",
    externalId: issue.key,
    externalUrl,
    rawData: JSON.stringify(issue),
    lastSyncedAt: now,
    createdAt: fields.created,
    updatedAt: fields.updated,
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  let host = process.env.JIRA_HOST
  const projects = (process.env.JIRA_PROJECTS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)

  if (!host) {
    console.error("JIRA_HOST is not set. Add it to .env.local, e.g. JIRA_HOST=mycompany.atlassian.net")
    process.exit(1)
  }

  // Strip scheme prefix if user included it (e.g. "https://mycompany.atlassian.net")
  host = host.replace(/^https?:\/\//i, "").replace(/\/$/, "")
  if (projects.length === 0) {
    console.error("JIRA_PROJECTS is not set. Add it to .env.local, e.g. JIRA_PROJECTS=PROJ,TEAM")
    process.exit(1)
  }

  let auth: string
  try {
    auth = buildAuthHeader()
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const sqlite = new Database(process.env.DATABASE_PATH ?? "./local.db")
  sqlite.pragma("journal_mode = WAL")
  const db = drizzle(sqlite, { schema })

  const [parsedHost, parsedPort] = host.split(":")
  const insecureTls = (process.env.JIRA_INSECURE_TLS ?? "").toLowerCase() === "true"
  console.log(`Connecting to ${parsedHost}:${parsedPort ?? 443}${insecureTls ? " (JIRA_INSECURE_TLS=true — cert verification disabled)" : ""}`)
  if (insecureTls) {
    console.warn("  ⚠  TLS certificate verification is disabled. Set JIRA_INSECURE_TLS=false once you have trusted your corporate CA.")
  }

  const now = new Date().toISOString()
  const fields = [
    "summary",
    "issuetype",
    "status",
    "priority",
    "labels",
    "assignee",
    "reporter",
    "issuelinks",
    "parent",
    "subtasks",
    "customfield_10007",
    "customfield_10005",
    "customfield_11725",
    "created",
    "updated",
  ]

  let inserted = 0
  let updated = 0

  for (const project of projects) {
    console.log(`\nSyncing project ${project}...`)

    // ── Epics ─────────────────────────────────────────────────────────────────
    let epicsRaw: unknown[]
    try {
      epicsRaw = await searchJira(
        host,
        auth,
        `issuetype = Epic AND project = "${project}" AND statusCategory != Done ORDER BY created DESC`,
        fields,
      )
    } catch (err) {
      console.error(`  Failed to fetch epics for ${project}:`, err instanceof Error ? err.message : err)
      continue
    }

    const epics = z.array(JiraIssueSchema).parse(epicsRaw)
    for (const issue of epics) {
      const item = toWorkItem(issue, now)
      const result = await upsertWorkItem(db, item)
      if (result === "inserted") inserted++
      else updated++
    }
    console.log(`  ✓ ${epics.length} epics processed`)

    // ── Tickets ───────────────────────────────────────────────────────────────
    let ticketsRaw: unknown[]
    try {
      ticketsRaw = await searchJira(
        host,
        auth,
        `issuetype NOT IN (Epic) AND project = "${project}" AND statusCategory != Done ORDER BY created DESC`,
        fields,
      )
    } catch (err) {
      console.error(`  Failed to fetch tickets for ${project}:`, err instanceof Error ? err.message : err)
      continue
    }

    const tickets = z.array(JiraIssueSchema).parse(ticketsRaw)
    for (const issue of tickets) {
      const item = toWorkItem(issue, now)
      const result = await upsertWorkItem(db, item)
      if (result === "inserted") inserted++
      else updated++
    }
    console.log(`  ✓ ${tickets.length} tickets processed`)

    // ── Backfill: fetch Done tickets referenced by open GitHub PRs ────────────
    // Our main JQL excludes statusCategory=Done, but a PR may reference a ticket
    // that was closed before the PR merged. Without this pass those PRs show as
    // "orphan" in the PR Coverage view even though the ticket exists.
    const ghPrs = sqlite
      .prepare("SELECT title FROM work_items WHERE source='github'")
      .all() as { title: string | null }[]

    const syncedIds = new Set(
      (sqlite.prepare("SELECT external_id FROM work_items WHERE source='jira'").all() as { external_id: string }[])
        .map(r => r.external_id.toUpperCase())
    )

    const missingKeys: string[] = []
    const keyPattern = /\b([A-Z]{2,10}-\d+)\b/gi
    for (const { title } of ghPrs) {
      if (!title) continue
      for (const match of title.matchAll(keyPattern)) {
        const key = match[1].toUpperCase()
        if (key.startsWith(`${project.toUpperCase()}-`) && !syncedIds.has(key)) {
          missingKeys.push(key)
        }
      }
    }

    if (missingKeys.length > 0) {
      const uniqueMissing = [...new Set(missingKeys)]
      console.log(`  Backfilling ${uniqueMissing.length} PR-referenced ticket(s) not yet in DB: ${uniqueMissing.join(", ")}`)
      const backfillJql = `issueKey in (${uniqueMissing.map(k => `"${k}"`).join(",")}) ORDER BY key ASC`
      let backfillRaw: unknown[]
      try {
        backfillRaw = await searchJira(host, auth, backfillJql, fields)
      } catch (err) {
        console.warn(`  ⚠  Backfill fetch failed:`, err instanceof Error ? err.message : err)
        backfillRaw = []
      }
      const backfilled = z.array(JiraIssueSchema).parse(backfillRaw)
      for (const issue of backfilled) {
        const item = toWorkItem(issue, now)
        const result = await upsertWorkItem(db, item)
        if (result === "inserted") inserted++
        else updated++
      }
      console.log(`  ✓ ${backfilled.length} PR-referenced ticket(s) backfilled`)
    }
  }

  console.log(`\nSync complete. ${inserted} inserted, ${updated} updated.`)
  process.exit(0)
}

main().catch((err) => {
  console.error("sync:jira failed:", err)
  process.exit(1)
})
