---
name: sentinel-coverage
description: "Use when: modifying scripts/sentinel-pr.ts, quorum/modules/sentinel/coverage.ts, or any CI workflow that invokes Sentinel. Covers the standing-gap-map design principle, required file extensions, module scope, and Chronicle proposal requirements."
---

# Sentinel Coverage

## What Sentinel is

Sentinel produces a **standing Chronicle coverage map** — a health signal showing which modules in the DecisionDeck business application have Chronicle entries and which do not. It runs on every PR and posts the map as a comment.

The map answers: *"Where are the gaps in our institutional knowledge?"* It is not a PR diff tool.

## Tracked modules (`APP_DIR_PREFIXES`)

```
app/        components/     db/
lib/        scripts/        .github/        tests/
```

All seven modules appear in every run. Modules not touched by the current PR show `—` in the "Changed in PR" column. They are never hidden.

## File extensions

Always call `coverage()` with:

```typescript
coverage(CHRONICLE_DIR, ".", { extensions: [".ts", ".tsx", ".yml"] })
```

| Extension | Modules covered |
|-----------|-----------------|
| `.ts`     | `db/`, `lib/`, `scripts/`, `tests/` |
| `.tsx`    | `app/`, `components/` |
| `.yml`    | `.github/` |

**Never omit the extensions option.** The default is `.ts` only — dropping it silently makes `app/`, `components/`, and `.github/` invisible.

## Risk levels

Risk is derived from Chronicle coverage percentage only:

| Coverage | Risk | Colour |
|----------|------|--------|
| 0%       | high | red    |
| 1–49%    | medium | amber |
| 50%+     | low  | green  |

Risk is never derived from how many files changed in the PR.

## Output format

Every Sentinel PR comment contains three sections in order:

1. **Coverage table** — all modules, coverage %, entry count, file count, "Changed in PR" (bolded if non-zero, `—` otherwise), risk
2. **Mermaid heatmap** — `flowchart TD`, Chronicle → module nodes coloured by risk, PR-touched nodes annotated with `— N changed`
3. **Chronicle context** — full text of Chronicle entries for modules that changed in the PR

## Chronicle proposals

After any change to Sentinel's scope or scanner behaviour, stage a Chronicle proposal:

```typescript
await oracle.propose({
  schema_version: 2,
  topic: "sentinel/<subject>",
  decision: "<one sentence describing what changed and why>",
  key_insight: "<same as decision>",
  affected_areas: ["scripts/sentinel-pr.ts", "quorum/modules/sentinel/"],
  scope: ["sentinel", "coverage", "tooling"],
  status: "open",
  confidence: 0.9,
  source_module: "Architect",
  evidence_cited: [],
})
```

Existing proposals that establish the current design:
- `d306916f` — scanner uses `.ts`, `.tsx`, `.yml` extensions
- `d99d4df1` — Sentinel is a standing gap map; risk = coverage % only
