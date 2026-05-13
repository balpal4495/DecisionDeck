# DecisionDeck

A local-first engineering manager flight deck and decision memory system.

DecisionDeck helps an engineering manager answer two recurring questions:

1. **What needs my attention this week?**
2. **What prior decisions should shape how we act?**

It combines an operational dashboard with a durable decision ledger — connecting active work, risks, incidents, and weekly reporting back to the engineering decisions that explain how the team operates.

---

## Stack

- **Next.js** (App Router) + **TypeScript**
- **SQLite** + **Drizzle ORM**
- **CSS Modules** (no Tailwind)
- **Vitest**
- **Quorum** — Oracle / Jury / Council reasoning layer (`quorum/modules/`)

---

## Getting Started

```bash
npm install
npx drizzle-kit migrate
npx tsx db/seed.ts
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Quorum

This project uses the Quorum reasoning layer for evidence-backed decision review.

```bash
# List pending Chronicle proposals
quorum commit --list

# Approve and index a proposal
quorum commit <id>
```

Chronicle data lives in `.chronicle/`. The `proposals/` and `committed/` directories are committed to git. The binary vector store (`.chronicle/entries/`) is git-ignored.

---

## Agents and Skills

Specialist agents and skills live in `.github/agents/` and `.github/skills/`.

Use the **Orchestrator** agent as the entry point for any multi-step build task.

See [AGENTS.md](AGENTS.md) for the full registry.

---

## Build Phases

The project is built in phases (0–10). Each phase results in a locally useful product.

| Phase | Goal |
|---|---|
| 0 | Project foundation — app shell, DB, seed data |
| 1 | Decision Ledger |
| 2 | Work Radar |
| 3 | Decision Linking |
| 4 | Risk Register |
| 5 | Incident Follow-up Tracker |
| 6 | Weekly Report Generator |
| 7 | Decision Review Queue |
| 8 | Quorum-Backed Review Actions |
| 9 | Optional Importers |
| 10 | Polish and Trust |

---

## Core Principle

DecisionDeck helps managers improve systems, not score individuals.
