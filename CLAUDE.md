# Claude Instructions

## Quorum modules

See [quorum/modules/CLAUDE.md](quorum/modules/CLAUDE.md) for Oracle, Jury, and Council internals.
See [.github/copilot-instructions.md](.github/copilot-instructions.md) for workflow rules.

---

## Agents

Use the **Orchestrator** as the entry point for any multi-step or feature-level task.
Agent files: `.github/agents/*.agent.md`

| Agent | Role |
|---|---|
| **Orchestrator** | Entry point — routes to specialists, enforces Quorum gate |
| **FeatureBuilder** | Next.js pages, components, business logic, Markdown export |
| **IntegrationEngineer** | API routes, Quorum client wiring (`lib/quorum/`), importers, Zod validation |
| **DataEngineer** | Drizzle schema, migrations, seed data, Chronicle proposals |
| **Architect** | Quorum review gate, phase scoping, design decisions |

### Handoff order

```
Orchestrator → Architect → DataEngineer → IntegrationEngineer → FeatureBuilder
```

---

## Skills

Skill files: `.github/skills/<name>/SKILL.md`

**FeatureBuilder:** `nextjs-app-router` · `css-modules-pattern` · `vitest-testing` · `markdown-export` · `report-generator`

**IntegrationEngineer:** `quorum-client` · `nextjs-api-routes` · `importer-pattern` · `zod-validation`

**DataEngineer:** `drizzle-schema` · `chronicle-propose` · `seed-data`

**Architect:** `quorum-review` · `decision-matching` · `phase-scoping`

Full skill reference: [AGENTS.md](AGENTS.md)


## Gemini CLI (optional assistant)

Before attempting any Gemini call, check availability:

```bash
which gemini 2>/dev/null
```

If the command returns empty, skip this section entirely. The project is fully functional
without Gemini. Never try to install it or ask the user to install it mid-task.

If Gemini is available, use it as a large-context assistant for tasks that require
surveying many files at once — it can hold the entire codebase in a single context window.

```bash
# The Bash tool does not auto-source shell profiles — always prefix with source:
source ~/.zshrc && gemini -p "Summarise the public API across all modules"
source ~/.zshrc && gemini -p "I'm about to change X. What should I watch out for?"
```

You reason about Gemini's output — it assists, you decide. Never pass its response to the
user unfiltered. If Gemini contradicts what you know from reading the code, trust your reading.
