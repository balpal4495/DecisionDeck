"use client"

import { useState, useCallback } from "react"
import type {
  DeliveryTree,
  EpicNode,
  SprintGroup,
  StoryNode,
  SubtaskNode,
  PRLeaf,
} from "@/lib/delivery-tree"
import styles from "./DeliveryTree.module.css"

// ─── Source badges ────────────────────────────────────────────────────────────

function JiraBadge() {
  return <span className={styles.sourceBadgeJira}>JIRA</span>
}

function GithubBadge() {
  return <span className={styles.sourceBadgeGh}>GH</span>
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  done: "Done",
  in_progress: "In Progress",
  in_review: "In Review",
  todo: "To Do",
  not_started: "To Do",
  open: "Open",
  planned: "Planned",
  blocked: "Blocked",
}

function statusClass(status: string): string {
  switch (status) {
    case "done": return styles.statusDone
    case "in_progress": return styles.statusInProgress
    case "in_review": return styles.statusInReview
    case "blocked": return styles.statusBlocked
    default: return styles.statusTodo
  }
}

const ISSUETYPE_ICON: Record<string, string> = {
  Story: "◈",
  Task: "☑",
  Bug: "⬡",
  Improvement: "↑",
  Spike: "◇",
}

function issueIcon(issuetype: string): string {
  return ISSUETYPE_ICON[issuetype] ?? "◈"
}

// ─── PR row ───────────────────────────────────────────────────────────────────

function PrRow({ pr, depth = 0 }: { pr: PRLeaf; depth?: number }) {
  const stateCls =
    pr.state === "merged" ? styles.prStateMerged
    : pr.state === "closed" ? styles.prStateClosed
    : styles.prStateOpen

  return (
    <li className={styles.prRow} style={{ paddingLeft: `${1.25 + depth * 1.5}rem` }}>
      <div className={styles.prRowInner}>
        <GithubBadge />
        <span className={styles.prRowIcon}>⌥</span>
        <span className={`${styles.prStateLabel} ${stateCls}`}>{pr.state}</span>
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.prRowNum}
        >
          #{pr.number}
        </a>
        <span className={styles.prRowTitle}>{pr.title}</span>
        {pr.daysOld > 0 && (
          <span className={`${styles.prAge} ${pr.state === "open" && pr.daysOld > 14 ? styles.prAgeStale : ""}`}>
            {pr.daysOld}d
          </span>
        )}
      </div>
    </li>
  )
}

// ─── Subtask row ─────────────────────────────────────────────────────────────

function SubtaskRow({ node }: { node: SubtaskNode }) {
  return (
    <>
      <li className={styles.subtaskRow}>
        <div className={styles.subtaskMain}>
          <JiraBadge />
          <span className={styles.subtaskBullet}>◇</span>
          <span className={`${styles.badge} ${statusClass(node.status)}`}>
            {STATUS_LABEL[node.status] ?? node.statusRaw}
          </span>
          {node.url ? (
            <a
              href={node.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.itemKey}
            >
              {node.key}
            </a>
          ) : (
            <span className={styles.itemKey}>{node.key}</span>
          )}
          <span className={styles.itemTitle}>{node.title}</span>
          {node.assignee && (
            <span className={styles.assignee}>{node.assignee}</span>
          )}
        </div>
      </li>
      {node.prs.map(pr => (
        <PrRow key={pr.number} pr={pr} depth={1} />
      ))}
    </>
  )
}

// ─── Story row ────────────────────────────────────────────────────────────────

function StoryRow({ node }: { node: StoryNode }) {
  const [expanded, setExpanded] = useState(false)
  const hasChildren = node.subtasks.length > 0 || node.prs.length > 0
  const toggle = useCallback(() => setExpanded(e => !e), [])

  return (
    <li className={styles.storyOuter}>
      {/* Jira story row */}
      <div
        className={`${styles.storyRow} ${hasChildren ? styles.storyClickable : ""}`}
        onClick={hasChildren ? toggle : undefined}
        role={hasChildren ? "button" : undefined}
        aria-expanded={hasChildren ? expanded : undefined}
      >
        <JiraBadge />

        {hasChildren
          ? <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`}>›</span>
          : <span className={styles.chevronPlaceholder} />}

        <span className={styles.storyIcon}>{issueIcon(node.issuetype)}</span>

        <span className={`${styles.badge} ${statusClass(node.status)}`}>
          {STATUS_LABEL[node.status] ?? node.statusRaw}
        </span>

        {node.url ? (
          <a
            href={node.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.itemKey}
            onClick={e => e.stopPropagation()}
          >
            {node.key}
          </a>
        ) : (
          <span className={styles.itemKey}>{node.key}</span>
        )}

        <span className={styles.itemTitle}>{node.title}</span>

        <div className={styles.storyMeta}>
          {node.assignee && <span className={styles.assignee}>{node.assignee}</span>}
          {node.storyPoints != null && (
            <span className={styles.points}>{node.storyPoints}pt</span>
          )}
          {node.subtasks.length > 0 && (
            <span className={styles.subtaskCount}>
              {node.subtasks.length} sub-task{node.subtasks.length !== 1 ? "s" : ""}
            </span>
          )}
          {node.prs.length > 0 && (
            <span className={styles.prCount}>
              {node.prs.length} PR{node.prs.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Expanded: PR rows then subtask rows (each with their own PRs) */}
      {expanded && (
        <ul className={styles.childList}>
          {node.prs.map(pr => (
            <PrRow key={pr.number} pr={pr} depth={0} />
          ))}
          {node.subtasks.map(st => (
            <SubtaskRow key={st.key} node={st} />
          ))}
        </ul>
      )}
    </li>
  )
}

// ─── Sprint group ─────────────────────────────────────────────────────────────

function SprintSection({ sprint }: { sprint: SprintGroup }) {
  const [expanded, setExpanded] = useState(true)
  const toggle = useCallback(() => setExpanded(e => !e), [])

  return (
    <div className={styles.sprintSection}>
      <button
        className={`${styles.sprintHeader} ${sprint.isActive ? styles.sprintActive : ""}`}
        onClick={toggle}
        aria-expanded={expanded}
      >
        <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`}>›</span>
        <span className={styles.sprintIcon}>◷</span>
        <span className={styles.sprintName}>{sprint.name}</span>
        {sprint.isActive && <span className={styles.activeBadge}>Active</span>}
        <span className={styles.sprintCount}>
          {sprint.stories.length} {sprint.stories.length === 1 ? "story" : "stories"}
        </span>
      </button>

      {expanded && (
        <ul className={styles.storyList}>
          {sprint.stories.map(story => (
            <StoryRow key={story.key} node={story} />
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Epic section ─────────────────────────────────────────────────────────────

function EpicSection({ epic }: { epic: EpicNode }) {
  const [expanded, setExpanded] = useState(true)
  const toggle = useCallback(() => setExpanded(e => !e), [])

  const totalStories =
    epic.sprints.reduce((n, s) => n + s.stories.length, 0) + epic.orphanStories.length

  return (
    <div className={styles.epicSection}>
      <button
        className={`${styles.epicHeader} ${statusClass(epic.status)}`}
        onClick={toggle}
        aria-expanded={expanded}
      >
        <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`}>›</span>
        <span className={styles.epicIcon}>⬡</span>
        {epic.url ? (
          <a
            href={epic.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.epicKey}
            onClick={e => e.stopPropagation()}
          >
            {epic.key}
          </a>
        ) : (
          <span className={styles.epicKey}>{epic.key}</span>
        )}
        <span className={styles.epicTitle}>{epic.title}</span>
        <span className={`${styles.badge} ${statusClass(epic.status)}`}>
          {STATUS_LABEL[epic.status] ?? epic.status}
        </span>
        <span className={styles.epicCount}>
          {totalStories} {totalStories === 1 ? "story" : "stories"} · {epic.sprints.length} {epic.sprints.length === 1 ? "sprint" : "sprints"}
        </span>
      </button>

      {expanded && (
        <div className={styles.epicBody}>
          {epic.sprints.map(sprint => (
            <SprintSection key={sprint.name} sprint={sprint} />
          ))}
          {epic.orphanStories.length > 0 && (
            <div className={styles.sprintSection}>
              <div className={`${styles.sprintHeader} ${styles.sprintNoSprint}`}>
                <span className={styles.sprintIcon}>·</span>
                <span className={styles.sprintName}>No sprint</span>
                <span className={styles.sprintCount}>{epic.orphanStories.length} {epic.orphanStories.length === 1 ? "story" : "stories"}</span>
              </div>
              <ul className={styles.storyList}>
                {epic.orphanStories.map(story => (
                  <StoryRow key={story.key} node={story} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Root component ───────────────────────────────────────────────────────────

interface Props {
  data: DeliveryTree
}

export default function DeliveryTree({ data }: Props) {
  const hasContent =
    data.epics.length > 0 ||
    data.noEpicSprints.length > 0 ||
    data.noEpicNoSprint.length > 0

  if (!hasContent) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No delivery data yet</p>
        <p className={styles.emptyHint}>
          Run a Jira + GitHub sync to populate the hierarchy.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.tree}>
      {data.epics.map(epic => (
        <EpicSection key={epic.key} epic={epic} />
      ))}

      {(data.noEpicSprints.length > 0 || data.noEpicNoSprint.length > 0) && (
        <div className={styles.epicSection}>
          <div className={`${styles.epicHeader} ${styles.epicNoEpic}`}>
            <span className={styles.epicIcon}>·</span>
            <span className={styles.epicTitle}>No Epic</span>
            <span className={styles.epicCount}>
              {data.noEpicSprints.reduce((n, s) => n + s.stories.length, 0) + data.noEpicNoSprint.length} stories
            </span>
          </div>
          <div className={styles.epicBody}>
            {data.noEpicSprints.map(sprint => (
              <SprintSection key={sprint.name} sprint={sprint} />
            ))}
            {data.noEpicNoSprint.length > 0 && (
              <ul className={styles.storyList}>
                {data.noEpicNoSprint.map(story => (
                  <StoryRow key={story.key} node={story} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
