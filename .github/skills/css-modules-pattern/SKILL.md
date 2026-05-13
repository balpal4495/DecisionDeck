---
name: css-modules-pattern
description: "Use when: adding or editing styles in DecisionDeck. Covers CSS Modules file conventions, design token CSS variables, component-scoped class naming, and the no-Tailwind rule. Use for any styling task."
applyTo: "**/*.module.css"
---

# CSS Modules Pattern

## Rule

No Tailwind. No PostCSS config. No utility classes. All styles are CSS Modules co-located with their component.

## File Convention

```
components/
  decisions/
    DecisionCard.tsx
    DecisionCard.module.css   ← always co-located
```

Import pattern:

```typescript
import styles from "./DecisionCard.module.css"

export function DecisionCard({ decision }: Props) {
  return <article className={styles.card}>...</article>
}
```

## Design Tokens

Global CSS variables live in `app/globals.css`. Use them throughout `.module.css` files:

```css
/* app/globals.css */
:root {
  --color-surface: #ffffff;
  --color-surface-subtle: #f5f5f5;
  --color-border: #e0e0e0;
  --color-text-primary: #111111;
  --color-text-secondary: #555555;
  --color-accent: #0055cc;
  --color-danger: #cc2200;
  --color-warning: #cc7700;
  --color-success: #006633;

  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;

  --radius-sm: 4px;
  --radius-md: 8px;

  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
}
```

## Class Naming

Use descriptive, component-scoped names — no BEM, no global utility classes:

```css
/* DecisionCard.module.css */
.card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.card[data-status="accepted"] {
  border-left: 3px solid var(--color-success);
}

.title {
  font-size: var(--font-size-lg);
  color: var(--color-text-primary);
}

.meta {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
```

## Status Variants

Use `data-*` attributes for status-driven variants rather than multiple classes:

```typescript
<article className={styles.card} data-status={decision.status}>
```

```css
.card[data-status="rejected"] { opacity: 0.6; }
.card[data-status="needs_review"] { border-left: 3px solid var(--color-warning); }
```

## Composing Classes

Use `clsx` or simple string concatenation — no `cn()` utility needed:

```typescript
import clsx from "clsx"
<div className={clsx(styles.card, isHighRisk && styles.highRisk)}>
```

## Anti-patterns

- No `className="flex items-center p-4"` — Tailwind is not in this project.
- No inline `style={{}}` for anything other than dynamic values (e.g. chart widths).
- No global class names in module files — every class is scoped to the component.
