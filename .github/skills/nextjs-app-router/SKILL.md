---
name: nextjs-app-router
description: "Use when: creating or editing Next.js App Router pages, layouts, loading states, error boundaries, or deciding whether a component should be a Server Component or Client Component in DecisionDeck. Covers route segments, data fetching, and component boundary rules."
---

# Next.js App Router

## Server vs Client — the rule

Default to **Server Components**. Add `'use client'` only when the component:
- Uses `useState`, `useEffect`, `useReducer`, or other React hooks
- Attaches browser event listeners (`onClick`, `onChange`)
- Uses browser-only APIs (`window`, `localStorage`)
- Uses a library that requires the browser (e.g. a chart library)

Filters, forms that POST, and links are Server Components by default via `<form action={serverAction}>` or `<Link>`.

## Route Segment Structure

```
app/
  layout.tsx         ← root layout, navigation shell
  page.tsx           ← dashboard (/)
  dashboard/
    page.tsx         ← This Week view
  decisions/
    page.tsx         ← decision list
    [id]/
      page.tsx       ← decision detail
      edit/
        page.tsx     ← edit form
  work/
    page.tsx
    [id]/page.tsx
  risks/
    page.tsx
    [id]/page.tsx
  incidents/
    page.tsx
    [id]/page.tsx
  reports/
    page.tsx         ← report generator
    [id]/page.tsx    ← saved report view
  api/               ← route handlers (IntegrationEngineer owns these)
```

## Data Fetching

Server Components fetch directly — no `useEffect`, no client fetch:

```typescript
// app/decisions/page.tsx (Server Component — no 'use client')
import { db } from "@/db"
import { decisions } from "@/db/schema"

export default async function DecisionsPage() {
  const rows = await db.select().from(decisions).orderBy(decisions.createdAt)
  return <DecisionList decisions={rows} />
}
```

For mutations: use Server Actions or POST to `app/api/`.

## Loading and Error Boundaries

Add `loading.tsx` and `error.tsx` alongside every `page.tsx` that fetches data:

```typescript
// app/decisions/loading.tsx
export default function Loading() {
  return <div className={styles.skeleton} aria-busy="true" />
}
```

## Component Organisation

```
components/
  dashboard/       ← dashboard card components
  decisions/       ← decision list, detail, form
  work/
  risks/
  incidents/
  reports/
  ui/              ← shared primitives (Button, Badge, StatusPill, etc.)
```

Each component folder contains:
- `ComponentName.tsx`
- `ComponentName.module.css`
- `ComponentName.test.tsx` (if logic is non-trivial)

## Anti-patterns

- Never `fetch()` from a Server Component to your own API route — query the DB directly.
- Never put data-fetching logic inside a Client Component — pass data as props from a Server Component parent.
- Never use `getServerSideProps` or `getStaticProps` — those are Pages Router patterns.
