CREATE TABLE `confluence_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`space_key` text NOT NULL,
	`url` text NOT NULL,
	`labels` text DEFAULT '[]' NOT NULL,
	`last_synced_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`area` text NOT NULL,
	`owner` text,
	`context` text NOT NULL,
	`decision` text NOT NULL,
	`rationale` text NOT NULL,
	`alternatives` text,
	`risks` text,
	`review_date` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`supersedes_decision_ids` text DEFAULT '[]' NOT NULL,
	`superseded_by_decision_id` text,
	`linked_work_item_ids` text DEFAULT '[]' NOT NULL,
	`linked_risk_ids` text DEFAULT '[]' NOT NULL,
	`linked_incident_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`severity` text NOT NULL,
	`area` text NOT NULL,
	`date` text NOT NULL,
	`summary` text NOT NULL,
	`impact` text,
	`contributing_factors` text,
	`follow_ups` text DEFAULT '[]' NOT NULL,
	`linked_decision_ids` text DEFAULT '[]' NOT NULL,
	`linked_work_item_ids` text DEFAULT '[]' NOT NULL,
	`linked_risk_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `risks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`area` text NOT NULL,
	`severity` text DEFAULT 'low' NOT NULL,
	`likelihood` text DEFAULT 'low' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`owner` text,
	`mitigation` text,
	`last_reviewed_at` text,
	`next_review_date` text,
	`linked_decision_ids` text DEFAULT '[]' NOT NULL,
	`linked_work_item_ids` text DEFAULT '[]' NOT NULL,
	`linked_incident_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weekly_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`week_start` text NOT NULL,
	`week_end` text NOT NULL,
	`generated_at` text DEFAULT (datetime('now')) NOT NULL,
	`highlights` text DEFAULT '' NOT NULL,
	`risks_section` text DEFAULT '' NOT NULL,
	`blocked_work` text DEFAULT '' NOT NULL,
	`decisions_section` text DEFAULT '' NOT NULL,
	`incidents_section` text DEFAULT '' NOT NULL,
	`follow_ups` text DEFAULT '' NOT NULL,
	`generated_markdown` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `work_items` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`area` text NOT NULL,
	`owner` text,
	`risk_level` text DEFAULT 'low' NOT NULL,
	`blocked_reason` text,
	`target_date` text,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`external_id` text,
	`external_url` text,
	`raw_data` text,
	`last_synced_at` text,
	`linked_decision_ids` text DEFAULT '[]' NOT NULL,
	`linked_risk_ids` text DEFAULT '[]' NOT NULL,
	`linked_incident_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
