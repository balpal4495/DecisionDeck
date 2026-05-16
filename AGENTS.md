# Agent Instructions

## Quorum modules

See [quorum/modules/AGENTS.md](quorum/modules/AGENTS.md) for Oracle, Jury, and Council internals.
See [.github/copilot-instructions.md](.github/copilot-instructions.md) for workflow rules.

---

## Agents

All agents live in `.github/agents/`. Use the **Orchestrator** as the entry point for any multi-step or feature-level task.

| Agent | File | Role |
|---|---|---|
| **Orchestrator** | [.github/agents/Orchestrator.agent.md](.github/agents/Orchestrator.agent.md) | Entry point — routes work to specialist agents, enforces Quorum gate |
| **FeatureBuilder** | [.github/agents/FeatureBuilder.agent.md](.github/agents/FeatureBuilder.agent.md) | Next.js pages, components, business logic, Markdown export |
| **IntegrationEngineer** | [.github/agents/IntegrationEngineer.agent.md](.github/agents/IntegrationEngineer.agent.md) | API routes, Quorum client wiring, importers, Zod validation |
| **DataEngineer** | [.github/agents/DataEngineer.agent.md](.github/agents/DataEngineer.agent.md) | Drizzle schema, migrations, seed data, Chronicle proposals |
| **Architect** | [.github/agents/Architect.agent.md](.github/agents/Architect.agent.md) | Quorum review, phase scoping, design gate before implementation |

### Handoff order for a new feature

```
Orchestrator → Architect (design review) → DataEngineer (schema) → IntegrationEngineer (API) → FeatureBuilder (UI)
```

---

## Skills

All skills live in `.github/skills/<name>/SKILL.md`.

### FeatureBuilder skills

| Skill | Trigger |
|---|---|
| [nextjs-app-router](.github/skills/nextjs-app-router/SKILL.md) | Creating/editing App Router pages, layouts, Server/Client components |
| [css-modules-pattern](.github/skills/css-modules-pattern/SKILL.md) | Any styling task — CSS Modules only, no Tailwind |
| [vitest-testing](.github/skills/vitest-testing/SKILL.md) | Writing or updating tests |
| [markdown-export](.github/skills/markdown-export/SKILL.md) | Generating Markdown from decisions or reports |
| [report-generator](.github/skills/report-generator/SKILL.md) | Building the weekly report generator |

### IntegrationEngineer skills

| Skill | Trigger |
|---|---|
| [quorum-client](.github/skills/quorum-client/SKILL.md) | Wiring lib/quorum/, oracle/jury/council call shapes |
| [nextjs-api-routes](.github/skills/nextjs-api-routes/SKILL.md) | Creating/editing route.ts handlers |
| [importer-pattern](.github/skills/importer-pattern/SKILL.md) | Building Phase 9 importers |
| [zod-validation](.github/skills/zod-validation/SKILL.md) | Zod at any API or LLM output boundary |

### DataEngineer skills

| Skill | Trigger |
|---|---|
| [drizzle-schema](.github/skills/drizzle-schema/SKILL.md) | Drizzle table definitions, migrations, db queries |
| [chronicle-propose](.github/skills/chronicle-propose/SKILL.md) | Calling oracle.propose() after a decision |
| [seed-data](.github/skills/seed-data/SKILL.md) | Creating or updating db/seed.ts |

### Architect skills

| Skill | Trigger |
|---|---|
| [quorum-review](.github/skills/quorum-review/SKILL.md) | Full Oracle → Jury → Council → propose pipeline |
| [decision-matching](.github/skills/decision-matching/SKILL.md) | Find Relevant Decisions feature |
| [phase-scoping](.github/skills/phase-scoping/SKILL.md) | Phase boundaries and non-goals |


<!-- quorum:start -->
## Quorum

See [quorum/AGENTS.md](quorum/AGENTS.md) for module file ownership and internals.
See [.github/copilot-instructions.md](.github/copilot-instructions.md) for workflow rules.
<!-- quorum:end -->
