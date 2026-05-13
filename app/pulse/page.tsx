/**
 * Pulse — answers the one question an EM needs every morning:
 * "Is what we committed to this sprint actually being worked on?"
 *
 * Three sections in priority order:
 *   1. Active sprint — every in-sprint ticket, does it have a PR?
 *   2. Needs a PR   — in-progress deliverables with no code yet
 *   3. Shadow PRs   — code changes with no Jira ticket
 *
 * Heat = how recently the item last moved:
 *   Hot    < 3 days   (green)
 *   Warm   3–14 days  (amber)
 *   Cold   14–30 days (blue)
 *   Frozen > 30 days  (red)
 */

import { db } from "@/db"
import { workItems } from "@/db/schema"
import { buildPulse, summarisePulse, type PulseItem, type PulseJira, type PulsePr } from "@/lib/pulse"
import styles from "./page.module.css"

// ── Heat ──────────────────────────────────────────────────────────────────

type Heat = "hot" | "warm" | "cold" | "frozen" | "unknown"

function heat(days: number): Heat {
  if (days < 0) return "unknown"
  if (days <= 2) return "hot"
  if (days <= 14) return "warm"
  if (days <= 30) return "cold"
  return "frozen"
}

const HEAT_DOT: Record<Heat, string> = {
  hot: styles.heatHot,
  warm: styles.heatWarm,
  cold: styles.heatCold,
  frozen: styles.heatFrozen,
  unknown: styles.heatUnknown,
}

function HeatCell({ days }: { days: number }) {
  const h = heat(days)
  const label = days < 0 ? "—" : days === 0 ? "today" : `${days}d`
  return (
    <span className={styles.heatLabel}>
      <span className={`${styles.heatDot} ${HEAT_DOT[h]}`} />
      {label}
    </span>
  )
}

// ── PR status cell ────────────────────────────────────────────────────────

/**
 * urgent=true  → "No PR" is a red badge (sprint item with no code is a real signal)
 * urgent=false → "No PR" is muted text (outside sprint, it's expected or irrelevant)
 */
function PrCell({ pr, urgent }: { pr: PulsePr | undefined; urgent?: boolean }) {
  if (!pr) {
    return urgent
      ? <span className={`${styles.prBadge} ${styles.prNone}`}>No PR</span>
      : <span className={styles.prNoneSoft}>No PR</span>
  }
  const label = pr.status === "done"
    ? "Merged"
    : pr.status === "in_review"
      ? "In review"
      : "Open"
  const cls = pr.status === "done"
    ? styles.prMerged
    : pr.status === "in_review"
      ? styles.prInReview
      : styles.prOpen
  if (pr.externalUrl) {
    return (
      <a href={pr.externalUrl} target="_blank" rel="noreferrer" className={`${styles.prBadge} ${cls}`}>
        {label} ↗
      </a>
    )
  }
  return <span className={`${styles.prBadge} ${cls}`}>{label}</span>
}

// ── Sprint cell ───────────────────────────────────────────────────────────

function SprintCell({ sprint, sprintState }: { sprint: string | null; sprintState: string | null }) {
  if (!sprint) return <span className={styles.sprintNone}>—</span>
  const cls =
    sprintState === "active"
      ? `${styles.sprintBadge} ${styles.sprintActive}`
      : sprintState === "future"
        ? `${styles.sprintBadge} ${styles.sprintFuture}`
        : styles.sprintNone
  return <span className={cls}>{sprint}</span>
}

// ── Key cell ──────────────────────────────────────────────────────────────

function KeyCell({ jira }: { jira: PulseJira }) {
  return (
    <span className={styles.key}>
      {jira.externalUrl ? (
        <a href={jira.externalUrl} target="_blank" rel="noreferrer" className={styles.keyLink}>
          {jira.externalId}
        </a>
      ) : (
        jira.externalId
      )}
    </span>
  )
}

// ── Table row ─────────────────────────────────────────────────────────────

/**
 * variant="sprint"   — Key | Title | Sprint | PR (urgent) | Age
 * variant="needs-pr" — Key | Title | Status | Age
 *   ("No PR" column removed: the entire section IS "no PR", it's just noise)
 */
function TicketRow({ jira, pr, variant = "sprint" }: {
  jira: PulseJira; pr?: PulsePr; variant?: "sprint" | "needs-pr"
}) {
  const staleDays = pr
    ? Math.min(
        jira.daysStale >= 0 ? jira.daysStale : Infinity,
        pr.daysStale >= 0 ? pr.daysStale : Infinity,
      )
    : jira.daysStale
  const effectiveDays = isFinite(staleDays) ? staleDays : -1

  return (
    <tr>
      <td className={styles.colKey}>
        <KeyCell jira={jira} />
      </td>
      <td>
        <div className={styles.titleText}>{jira.title}</div>
        {jira.assignee && (
          <div className={styles.assignee}>{jira.assignee.split(" ")[0]}</div>
        )}
      </td>
      {variant === "sprint" && (
        <td className={styles.colSprint}>
          <SprintCell sprint={jira.sprint} sprintState={jira.sprintState} />
        </td>
      )}
      {variant === "needs-pr" && (
        <td className={styles.colStatus}>
          <span className={styles.statusNote}>
            {jira.status.replace(/_/g, " ")}
          </span>
        </td>
      )}
      {variant === "sprint" && (
        <td className={styles.colPr}>
          <PrCell pr={pr} urgent />
        </td>
      )}
      <td className={styles.colAge}>
        <HeatCell days={effectiveDays} />
      </td>
    </tr>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function PulsePage() {
  const rows = await db.select().from(workItems)
  const pulse = buildPulse(rows)
  const summary = summarisePulse(pulse)

  // Section 1: Everything in an active sprint (linked + codeless that has sprint)
  const activeSprint = pulse
    .filter((i): i is PulseItem & { jira: PulseJira } => {
      const j = i.jira
      return !!j && j.sprintState === "active" && j.workClass !== "container" && j.workClass !== "placeholder"
    })
    .sort((a, b) => {
      // No-PR items first, then by staleness descending
      const aHasPr = !!a.pr
      const bHasPr = !!b.pr
      if (aHasPr !== bHasPr) return aHasPr ? 1 : -1
      return b.staleDays - a.staleDays
    })

  // Section 2: In-progress deliverables or planned with no PR and not in sprint board above
  const needsPr = pulse
    .filter((i): i is PulseItem & { jira: PulseJira } => {
      if (i.state !== "codeless-ticket" || !i.jira) return false
      return (
        (i.jira.workClass === "deliverable" || i.jira.workClass === "planned") &&
        (i.jira.status === "in_progress" || i.jira.status === "in_review") &&
        i.jira.sprintState !== "active"
      )
    })
    .sort((a, b) => b.staleDays - a.staleDays)

  // Section 3: Shadow PRs — untracked
  const shadowPrs = pulse
    .filter((i): i is PulseItem & { pr: PulsePr } => i.state === "untracked-pr")
    .sort((a, b) => a.staleDays - b.staleDays)

  const activePrCount = activeSprint.filter(i => !!i.pr).length
  const activeNoPrCount = activeSprint.length - activePrCount

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Pulse</h1>
        <p className={styles.subtitle}>
          Is what the team committed to this sprint actually being worked on? ·{" "}
          {summary.linked} PR{summary.linked !== 1 ? "s" : ""} linked ·{" "}
          {summary.codelessDeliverable} without code ·{" "}
          {summary.untrackedPrs} shadow PR{summary.untrackedPrs !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Age legend */}
      <div className={styles.legend}>
        <span>Last moved:</span>
        {(
          [
            { cls: styles.heatHot,    label: "Active — 0–2 days" },
            { cls: styles.heatWarm,   label: "Recent — 3–14 days" },
            { cls: styles.heatCold,   label: "Stale — 14–30 days" },
            { cls: styles.heatFrozen, label: "Stuck — 30+ days" },
          ] as const
        ).map(({ cls, label }) => (
          <span key={label} className={styles.legendItem}>
            <span className={`${styles.heatDot} ${cls}`} />
            {label}
          </span>
        ))}
      </div>

      {/* ── Section 1: Active sprint ── */}
      <section className={styles.answerBlock}>
        <div className={`${styles.blockHeading} ${styles.blockHeadingSprint}`}>
          <span className={styles.blockQuestion}>Active sprint</span>
          <span className={styles.blockCount}>
            {activeSprint.length} item{activeSprint.length !== 1 ? "s" : ""} ·{" "}
            {activePrCount} with PR · {activeNoPrCount} without
          </span>
        </div>
        {activeSprint.length === 0 ? (
          <p className={styles.blockEmpty}>No active sprint items found.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.colKey}>Ticket</th>
                <th>Title</th>
                <th className={styles.colSprint}>Sprint</th>
                <th className={styles.colPr}>PR</th>
                <th className={styles.colAge}>Age</th>
              </tr>
            </thead>
            <tbody>
              {activeSprint.map(item => (
                <TicketRow
                  key={item.jira.id}
                  jira={item.jira}
                  pr={item.pr as PulsePr | undefined}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Section 2: Needs a PR ── */}
      <section className={styles.answerBlock}>
        <div className={`${styles.blockHeading} ${styles.blockHeadingWarning}`}>
          <span className={styles.blockQuestion}>In progress but no PR</span>
          <span className={styles.blockCount}>
            {needsPr.length} item{needsPr.length !== 1 ? "s" : ""} — not in current sprint
          </span>
        </div>
        {needsPr.length === 0 ? (
          <p className={styles.blockEmpty}>All in-progress work has a matching PR.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.colKey}>Ticket</th>
                <th>Title</th>
                <th className={styles.colStatus}>Status</th>
                <th className={styles.colAge}>Age</th>
              </tr>
            </thead>
            <tbody>
              {needsPr.map(item => (
                <TicketRow key={item.jira.id} jira={item.jira} variant="needs-pr" />
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Section 3: Shadow PRs ── */}
      <section className={styles.answerBlock}>
        <div className={`${styles.blockHeading} ${styles.blockHeadingShadow}`}>
          <span className={styles.blockQuestion}>PRs with no Jira ticket</span>
          <span className={styles.blockCount}>
            {shadowPrs.length} PR{shadowPrs.length !== 1 ? "s" : ""} — work happening outside the plan
          </span>
        </div>
        {shadowPrs.length === 0 ? (
          <p className={styles.blockEmpty}>All PRs reference a Jira ticket.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.colKey}>PR</th>
                <th>Title</th>
                <th className={styles.colReason}>Reason</th>
                <th className={styles.colAge}>Age</th>
              </tr>
            </thead>
            <tbody>
              {shadowPrs.map(item => {
                const { pr } = item
                const prNum = pr.externalId.match(/#(\d+)$/)?.[1]
                return (
                  <tr key={pr.id}>
                    <td className={styles.colKey}>
                      <span className={styles.key}>
                        {pr.externalUrl
                          ? <a href={pr.externalUrl} target="_blank" rel="noreferrer" className={styles.keyLink}>#{prNum ?? pr.externalId}</a>
                          : <span>#{prNum ?? pr.externalId}</span>
                        }
                      </span>
                    </td>
                    <td><div className={styles.titleText}>{pr.title}</div></td>
                    <td className={styles.colReason}>
                      <span className={styles.noKeyNote}>
                        {pr.extractedJiraKey ? `key ${pr.extractedJiraKey} not in DB` : "no Jira key"}
                      </span>
                    </td>
                    <td className={styles.colAge}><HeatCell days={pr.daysStale} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
