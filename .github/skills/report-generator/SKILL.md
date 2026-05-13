---
name: report-generator
description: "Use when: building or modifying the weekly report generator in lib/report-generator.ts or app/reports/. Covers the data query pattern, fact-vs-interpretation separation rule, decision citation format, and the Markdown output structure."
---

# Report Generator

## Location

`lib/report-generator.ts` — pure function, no side effects, no DB calls inside.
The page `app/reports/page.tsx` (or a Server Action) calls the DB and passes data in.

## Function Signature

```typescript
export interface ReportInput {
  weekStart: string   // ISO date
  weekEnd: string     // ISO date
  workItems: WorkItem[]
  risks: Risk[]
  incidents: Incident[]
  decisions: Decision[]
  allDecisions: Decision[]  // full ledger for linking
}

export interface ReportOutput {
  sections: ReportSection[]
  generatedMarkdown: string
  citedDecisionIds: string[]
}

export function generateReport(input: ReportInput): ReportOutput
```

## Section Assembly Rules

### Blocked Work
- Include `workItems` where `status === "blocked"`.
- For each: show `blockedReason`, list `linkedDecisionIds`.
- If `linkedDecisionIds` is empty and `riskLevel === "high"`: add a gap flag.

### High-Risk Work
- Include `workItems` where `riskLevel === "high"` and `status !== "done"`.
- For each: show linked decision titles. If none: emit `[GAP] No decisions linked.`

### Open Risks
- Include `risks` where `status === "open"` or `status === "mitigating"`.
- Sort by severity desc, then likelihood desc.

### Incidents and Follow-ups
- Include all `incidents` from within the week range.
- Include overdue follow-ups: `status` is `open` or `in_progress` and `dueDate < weekEnd`.

### Decisions Accepted This Week
- `decisions` where `status === "accepted"` and `updatedAt` within the week.

### Decisions Needing Review
- `decisions` where `status === "needs_review"` OR `reviewDate < weekEnd`.

### Recommended Actions
- Each recommendation must cite at least one record ID.
- Format: `Recommendation text. [Evidence: {type} {id}]`
- Never emit: unsupported claims, individual performance inferences.
- Never emit: recommendations without evidence.

## Fact vs Interpretation Separation

Every section heading that contains inferences or recommendations starts with `> [RECOMMENDATION]`.
Every section that lists observed records starts with `> [FACT]`.

This separation rule is a product principle (DEC-005) — do not remove it.

## Citation Tracking

Collect all decision IDs referenced anywhere in the report. Return as `citedDecisionIds`.
The Appendix section is built from this list.

## Anti-pattern: Quorum in the generator

`lib/report-generator.ts` is a pure function — no Quorum calls. If Quorum review of the report is needed, it happens in the route handler (`lib/quorum/review-report.ts`) after the report is generated and before it is shown to the user.
