# Project Guidelines

## Architecture

This project uses three portable reasoning modules: **Oracle**, **Jury**, and **Council**.
They form the knowledge and validation layer for all agentic work in this codebase.

```
oracle.query()  →  jury.evaluate()  →  council.deliberate()  →  human gate  →  Executor
```

Source: `modules/` — see [modules/README.md](modules/README.md) for full API reference.

---

## Chronicle — the persistent knowledge store

Chronicle lives at `.chronicle/` and is the institutional memory of this codebase.
Every prior decision, investigation finding, and outcome is stored there.

**Always query Oracle before proposing a solution.** Treat existing entries as ground truth for what has been tried, what worked, and what failed.

```typescript
const evidence = await oracle.query("describe what you're about to do")
// Use evidence to inform your proposal before proceeding
```

**Never call `oracle.commit()` without explicit human approval.**
`oracle.propose()` writes a pending file. A human must call `oracle.commit(proposalId)` to index it.
There are no auto-commits. Do not attempt to bypass this gate.

---

## Module responsibilities

| Module | What it does | LLM? |
|---|---|---|
| `oracle.query()` | Retrieves relevant Chronicle entries by semantic + BM25 search | No |
| `oracle.propose()` | Stages a new entry for human review | No |
| `oracle.commit()` | Indexes an approved entry — human-triggered only | No |
| `jury.evaluate()` | Scores a design against evidence across 4 dimensions | Yes |
| `council.deliberate()` | Adversarial validation via advisor/reviewer fan-out | Yes |

---

## Setup

```typescript
import { setup } from "./modules/setup"

const { oracle, evaluate, deliberate } = await setup({ llm: yourProvider })
```

`setup()` creates Chronicle directories, warms the embedder, and wires all dependencies.
Call it once at application startup.

---

## Routing rules

After `jury.evaluate()`:

| `recommendation` | Action |
|---|---|
| `proceed` | Pass to `council.deliberate()` |
| `investigate-more` | Return to Detective with `juryOutput.gaps` |
| `redesign` | Return to Designer |

After `council.deliberate()`:

| `satisfied` | `recommendation` | Action |
|---|---|---|
| `true` | `proceed` | Human gate → Executor |
| `false` | `redesign` | Return to Designer with `verdict` as feedback |
| `false` | `investigate-more` | Return to Detective with `juryOutput.gaps` |

---

## Rules for AI agents

- **Evidence first.** Query Oracle before proposing any design or implementation.
- **No auto-commits.** Never call `oracle.commit()` autonomously. Only propose.
- **Cite entries.** When referencing Chronicle findings, use the entry ID (e.g. `[abc-123]`).
- **Respect refuted entries.** A `refuted` entry means this was tried and failed — surface the failure reason, don't ignore it.
- **Fail loudly.** Jury and Council throw on bad LLM output. Do not swallow errors or default to passing scores.
- **These modules are the portable core.** Detective, Designer, Executor, and Validator are application-specific — do not add them here.

---

## Agents

Use the **Orchestrator** as the entry point for any multi-step or feature-level task.

| Agent | File | Role |
|---|---|---|
| **Orchestrator** | [.github/agents/Orchestrator.agent.md](agents/Orchestrator.agent.md) | Entry point — routes work to specialist agents, enforces Quorum gate |
| **FeatureBuilder** | [.github/agents/FeatureBuilder.agent.md](agents/FeatureBuilder.agent.md) | Next.js pages, components, business logic, Markdown export |
| **IntegrationEngineer** | [.github/agents/IntegrationEngineer.agent.md](agents/IntegrationEngineer.agent.md) | API routes, Quorum client wiring, importers, Zod validation |
| **DataEngineer** | [.github/agents/DataEngineer.agent.md](agents/DataEngineer.agent.md) | Drizzle schema, migrations, seed data, Chronicle proposals |
| **Architect** | [.github/agents/Architect.agent.md](agents/Architect.agent.md) | Quorum review gate, phase scoping, design decisions |

### Handoff order

```
Orchestrator → Architect (design review) → DataEngineer (schema) → IntegrationEngineer (API) → FeatureBuilder (UI)
```

---

## Skills

All skills live in `.github/skills/<name>/SKILL.md`.

### FeatureBuilder skills

| Skill | Trigger |
|---|---|
| [nextjs-app-router](skills/nextjs-app-router/SKILL.md) | Creating/editing App Router pages, layouts, Server/Client components |
| [css-modules-pattern](skills/css-modules-pattern/SKILL.md) | Any styling task — CSS Modules only, no Tailwind |
| [vitest-testing](skills/vitest-testing/SKILL.md) | Writing or updating tests |
| [markdown-export](skills/markdown-export/SKILL.md) | Generating Markdown from decisions or reports |
| [report-generator](skills/report-generator/SKILL.md) | Building the weekly report generator |

### IntegrationEngineer skills

| Skill | Trigger |
|---|---|
| [quorum-client](skills/quorum-client/SKILL.md) | Wiring lib/quorum/, oracle/jury/council call shapes |
| [nextjs-api-routes](skills/nextjs-api-routes/SKILL.md) | Creating/editing route.ts handlers |
| [importer-pattern](skills/importer-pattern/SKILL.md) | Building Phase 9 importers |
| [zod-validation](skills/zod-validation/SKILL.md) | Zod at any API or LLM output boundary |

### DataEngineer skills

| Skill | Trigger |
|---|---|
| [drizzle-schema](skills/drizzle-schema/SKILL.md) | Drizzle table definitions, migrations, db queries |
| [chronicle-propose](skills/chronicle-propose/SKILL.md) | Calling oracle.propose() after a decision |
| [seed-data](skills/seed-data/SKILL.md) | Creating or updating db/seed.ts |

### Architect skills

| Skill | Trigger |
|---|---|
| [quorum-review](skills/quorum-review/SKILL.md) | Full Oracle → Jury → Council → propose pipeline |
| [decision-matching](skills/decision-matching/SKILL.md) | Find Relevant Decisions feature |
| [phase-scoping](skills/phase-scoping/SKILL.md) | Phase boundaries and non-goals |

---

## Build and test

```bash
npx vitest run quorum/modules/
```


---

<!-- quorum:start -->
# Project Guidelines

## Architecture

This project uses three portable reasoning modules: **Oracle**, **Jury**, and **Council**.
They form the knowledge and validation layer for all agentic work in this codebase.

```
oracle.query()  →  jury.evaluate()  →  council.deliberate()  →  human gate  →  Executor
```

Source: `modules/` — see [modules/README.md](modules/README.md) for full API reference.

---

## Chronicle — the persistent knowledge store

Chronicle lives at `.chronicle/` and is the institutional memory of this codebase.
Every prior decision, investigation finding, and outcome is stored there.

**Always query Oracle before proposing a solution.** Treat existing entries as ground truth for what has been tried, what worked, and what failed.

```typescript
const evidence = await oracle.query("describe what you're about to do")
// Use evidence to inform your proposal before proceeding
```

**Never call `oracle.commit()` without explicit human approval.**
`oracle.propose()` writes a pending file. A human must call `oracle.commit(proposalId)` to index it.
There are no auto-commits. Do not attempt to bypass this gate.

---

## Module responsibilities

| Module | What it does | LLM? |
|---|---|---|
| `oracle.query()` | Retrieves relevant Chronicle entries by semantic + BM25 search | No |
| `oracle.propose()` | Stages a new entry for human review | No |
| `oracle.commit()` | Indexes an approved entry — human-triggered only | No |
| `jury.evaluate()` | Scores a design against evidence across 4 dimensions | Yes |
| `council.deliberate()` | Adversarial validation via advisor/reviewer fan-out | Yes |

---

## Setup

```typescript
import { setup } from "./modules/setup"

const { oracle, evaluate, deliberate } = await setup({ llm: yourProvider })
```

`setup()` creates Chronicle directories, warms the embedder, and wires all dependencies.
Call it once at application startup.

---

## Routing rules

After `jury.evaluate()`:

| `recommendation` | Action |
|---|---|
| `proceed` | Pass to `council.deliberate()` |
| `investigate-more` | Return to Detective with `juryOutput.gaps` |
| `redesign` | Return to Designer |

After `council.deliberate()`:

| `satisfied` | `recommendation` | Action |
|---|---|---|
| `true` | `proceed` | Human gate → Executor |
| `false` | `redesign` | Return to Designer with `verdict` as feedback |
| `false` | `investigate-more` | Return to Detective with `juryOutput.gaps` |

---

## Rules for AI agents

- **Evidence first.** Query Oracle before proposing any design or implementation.
- **No auto-commits.** Never call `oracle.commit()` autonomously. Only propose.
- **Cite entries.** When referencing Chronicle findings, use the entry ID (e.g. `[abc-123]`).
- **Respect refuted entries.** A `refuted` entry means this was tried and failed — surface the failure reason, don't ignore it.
- **Fail loudly.** Jury and Council throw on bad LLM output. Do not swallow errors or default to passing scores.
- **These modules are the portable core.** Detective, Designer, Executor, and Validator are application-specific — do not add them here.

---

## Build and test

```bash
npx vitest run modules/
```

<!-- quorum:end -->