import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

// ── Helpers ─────────────────────────────────────────────────────────────────

export function parseIds(json: string): string[] {
  try {
    return JSON.parse(json)
  } catch {
    return []
  }
}

// ── Decisions ────────────────────────────────────────────────────────────────

export const decisions = sqliteTable("decisions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull().default("proposed"),
  // proposed | accepted | rejected | superseded | needs_review
  area: text("area").notNull(),
  owner: text("owner"),
  context: text("context").notNull(),
  decision: text("decision").notNull(),
  rationale: text("rationale").notNull(),
  alternatives: text("alternatives"),
  risks: text("risks"),
  reviewDate: text("review_date"),
  tags: text("tags").notNull().default("[]"), // JSON string[]
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

// ── Work Items ────────────────────────────────────────────────────────────────

export const workItems = sqliteTable("work_items", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull().default("not_started"),
  // not_started | in_progress | blocked | in_review | done
  area: text("area").notNull(),
  owner: text("owner"),
  riskLevel: text("risk_level").notNull().default("low"),
  // low | medium | high
  blockedReason: text("blocked_reason"),
  targetDate: text("target_date"),
  notes: text("notes"),
  // Source of record: manual entry or integration
  source: text("source").notNull().default("manual"),
  // manual | github | jira
  externalId: text("external_id"),   // e.g. "org/repo#42" or "PROJ-123"
  externalUrl: text("external_url"),
  rawData: text("raw_data"),         // JSON blob of original API response
  lastSyncedAt: text("last_synced_at"),
  linkedDecisionIds: text("linked_decision_ids").notNull().default("[]"),
  linkedRiskIds: text("linked_risk_ids").notNull().default("[]"),
  linkedIncidentIds: text("linked_incident_ids").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
})

export type WorkItem = typeof workItems.$inferSelect
export type InsertWorkItem = typeof workItems.$inferInsert

// ── Risks ─────────────────────────────────────────────────────────────────────

export const risks = sqliteTable("risks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  area: text("area").notNull(),
  severity: text("severity").notNull().default("low"),
  // low | medium | high
  likelihood: text("likelihood").notNull().default("low"),
  // low | medium | high
  status: text("status").notNull().default("open"),
  // open | mitigating | accepted | closed
  owner: text("owner"),
  mitigation: text("mitigation"),
  lastReviewedAt: text("last_reviewed_at"),
  nextReviewDate: text("next_review_date"),
  linkedDecisionIds: text("linked_decision_ids").notNull().default("[]"),
  linkedWorkItemIds: text("linked_work_item_ids").notNull().default("[]"),
  linkedIncidentIds: text("linked_incident_ids").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
})

export type Risk = typeof risks.$inferSelect
export type InsertRisk = typeof risks.$inferInsert

// ── Incidents ─────────────────────────────────────────────────────────────────

export const incidents = sqliteTable("incidents", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  severity: text("severity").notNull(),
  // sev1 | sev2 | sev3 | sev4
  area: text("area").notNull(),
  date: text("date").notNull(),
  summary: text("summary").notNull(),
  impact: text("impact"),
  contributingFactors: text("contributing_factors"),
  followUps: text("follow_ups").notNull().default("[]"), // JSON IncidentFollowUp[]
  linkedDecisionIds: text("linked_decision_ids").notNull().default("[]"),
  linkedWorkItemIds: text("linked_work_item_ids").notNull().default("[]"),
  linkedRiskIds: text("linked_risk_ids").notNull().default("[]"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
})

export type Incident = typeof incidents.$inferSelect
export type InsertIncident = typeof incidents.$inferInsert

// ── Confluence Pages (Phase 3 reference index) ────────────────────────────────

export const confluencePages = sqliteTable("confluence_pages", {
  id: text("id").primaryKey(),         // Confluence page ID
  title: text("title").notNull(),
  spaceKey: text("space_key").notNull(),
  url: text("url").notNull(),
  labels: text("labels").notNull().default("[]"), // JSON string[]
  lastSyncedAt: text("last_synced_at").notNull().default(sql`(datetime('now'))`),
})

export type ConfluencePage = typeof confluencePages.$inferSelect

// ── Weekly Reports ────────────────────────────────────────────────────────────

export const weeklyReports = sqliteTable("weekly_reports", {
  id: text("id").primaryKey(),
  weekStart: text("week_start").notNull(),
  weekEnd: text("week_end").notNull(),
  generatedAt: text("generated_at").notNull().default(sql`(datetime('now'))`),
  highlights: text("highlights").notNull().default(""),
  risks: text("risks_section").notNull().default(""),
  blockedWork: text("blocked_work").notNull().default(""),
  decisions: text("decisions_section").notNull().default(""),
  incidents: text("incidents_section").notNull().default(""),
  followUps: text("follow_ups").notNull().default(""),
  generatedMarkdown: text("generated_markdown").notNull().default(""),
})

export type WeeklyReport = typeof weeklyReports.$inferSelect
