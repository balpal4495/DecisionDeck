---
name: quorum-review
description: "Use when: running a full Quorum review on a proposed decision, work item design, weekly report, or stale decision. Covers the complete Oracle query → Jury evaluate → Council deliberate → oracle.propose() pipeline with routing rules."
---

# Quorum Review

## When to Run

- Before accepting any proposed decision
- Before starting implementation of a new feature or phase
- Before generating a weekly report that includes recommendations
- When reviewing a stale decision (past review date)
- When a work item is high-risk with no linked decisions

## Pipeline

```
oracle.query(design)
  ↓
jury.evaluate({ outcome, design, evidence })
  ↓  recommendation === "proceed"?
     ├─ yes → council.deliberate({ outcome, design, evidence, jury_output })
     │          ↓
     │         oracle.propose(verdict)   ← staged, not indexed
     │          ↓
     │         return verdict
     └─ no  → return juryOutput with gaps
```

## Step 1 — Oracle Query

Query before evaluating — never skip this:

```typescript
const evidence = await oracle.query(
  `${outcome} ${design}`.slice(0, 500)
)
// evidence: OracleResult[] — empty for a greenfield codebase
```

If Chronicle is empty, the Jury `evidence_support` score will be low (< 0.2). This is expected for a new project and is not a blocker.

## Step 2 — Jury Evaluate

```typescript
const juryOutput = await evaluate({ outcome, design, evidence }, { llm })

// Route on recommendation:
if (juryOutput.recommendation === "investigate-more") {
  // return gaps to user, do not proceed
  return { stage: "jury", gaps: juryOutput.gaps, blocking_gaps: juryOutput.blocking_gaps }
}
if (juryOutput.recommendation === "redesign") {
  // return assessment to user, do not proceed
  return { stage: "jury", assessment: juryOutput.assessment }
}
```

## Step 3 — Council Deliberate

Only runs if Jury says `proceed`:

```typescript
const verdict = await deliberate(
  { outcome, design, evidence, jury_output: juryOutput },
  { llm, oracle }
)

// Route on verdict:
if (!verdict.satisfied && verdict.recommendation === "redesign") {
  return { stage: "council", blockers: verdict.blockers }
}
if (!verdict.satisfied && verdict.recommendation === "investigate-more") {
  return { stage: "council", gaps: juryOutput.gaps }
}

// satisfied: true — proceed
```

## Routing Summary

| Stage | Condition | Action |
|---|---|---|
| Jury | `investigate-more` | Return gaps. Stop. |
| Jury | `redesign` | Return assessment. Stop. |
| Jury | `proceed` | Continue to Council |
| Council | `satisfied: false, redesign` | Return blockers. Stop. |
| Council | `satisfied: false, investigate-more` | Return gaps. Stop. |
| Council | `satisfied: true, proceed` | Proceed. Stage Chronicle proposal. |

## Presenting Results to the User

Always show:
- Evidence found (count + relevant entry summaries)
- Jury confidence score and breakdown
- Council verdict: satisfied, blockers, warnings
- Proposal ID staged to Chronicle
- Recommended next action

```
## Quorum Review Result

**Evidence found:** 3 entries
**Jury confidence:** 0.72 (pressure-test)
**Council:** satisfied ✓

**Warnings:**
- No rollback plan linked to this change.

**Chronicle proposal staged:** abc-12345
**Next:** quorum commit abc-12345 to index this decision.
```

## Special Cases

### Empty Chronicle (greenfield)

Low `evidence_support` is expected — it is not a blocker unless the design itself carries high risk patterns (auth, billing, migrations). The risk classifier in Council will escalate to full fan-out for those areas even without prior evidence.

### Refuted Entry

If Oracle returns a `refuted` entry that overlaps with the proposal, surface the failure reason explicitly:
```
⚠ Refuted entry [xyz-789]: "JWT stored in localStorage — XSS vulnerability discovered in staging."
This proposal touches session/token handling. Failure reason applies.
```
Do not proceed without resolving or explicitly acknowledging the refuted entry.
