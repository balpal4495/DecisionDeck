---
name: decision-matching
description: "Use when: implementing or using the Find Relevant Decisions feature in DecisionDeck. Covers the area → keyword → tag match priority order, explainability rules, and how to present matches to the user."
---

# Decision Matching

## Location

`lib/decision-matching.ts` — pure function, no side effects.

## Function Signature

```typescript
export interface MatchResult {
  decision: Decision
  score: number           // 0–1, higher = more relevant
  matchReason: string[]   // explainable reasons e.g. ["area: auth", "keyword: rollback"]
}

export function findRelevantDecisions(
  subject: { area?: string; title: string; notes?: string; context?: string },
  decisions: Decision[],
  options?: { limit?: number; statusFilter?: Decision["status"][] }
): MatchResult[]
```

Default: returns top 5, filters to `status === "accepted"` only.

## Match Priority Order

Apply these passes in order. Accumulate score.

### Pass 1 — Area Match (weight: 0.5)

Exact match on `subject.area === decision.area`:
- Score: +0.5
- Reason: `"area: {area}"`

### Pass 2 — Keyword Match (weight: 0.3)

Extract significant words (length > 3) from `subject.title` + `subject.notes`.
Check against `decision.title + decision.decision + decision.rationale + decision.context`:

```typescript
const subjectWords = extractWords(subject.title + " " + (subject.notes ?? ""))
const decisionText = [d.title, d.decision, d.rationale, d.context].join(" ")
const hits = subjectWords.filter(w => decisionText.toLowerCase().includes(w))
if (hits.length > 0) {
  score += 0.3 * Math.min(hits.length / 3, 1)
  reasons.push(`keyword: ${hits.slice(0, 3).join(", ")}`)
}
```

### Pass 3 — Tag/Scope Match (weight: 0.2)

If the decision has tags or `scope` fields, match against area synonyms:

```typescript
const areaSynonyms: Record<string, string[]> = {
  auth: ["authentication", "authorization", "login", "session", "token", "jwt", "oauth"],
  billing: ["payment", "stripe", "invoice", "subscription", "charge"],
  data: ["database", "audit", "log", "migration", "schema"],
  deployments: ["deploy", "rollback", "release", "ci", "cd"],
  platform: ["infrastructure", "permissions", "access", "rbac"],
}
```

### Pass 4 — Manual Link Match (weight: 1.0, overrides)

If `subject.linkedDecisionIds` contains a decision ID, include it with score 1.0 regardless of other passes.

## Sorting and Deduplication

Sort by score descending. Return top `limit` results. Deduplicate by decision ID.

## Explainability Rule

Every `MatchResult` must include a human-readable `matchReason`. Never return a match without explaining why.

The UI must display this reason alongside the suggestion. The user can accept or dismiss.

## Later: Oracle Semantic Search

Once Chronicle has enough entries, replace Pass 2 with `oracle.query(subject.title)` for semantic retrieval. The area and tag passes remain as pre-filters. This is a Phase 8 enhancement — do not implement it before the manual matching is working.
