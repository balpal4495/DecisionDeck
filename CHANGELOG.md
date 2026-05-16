# Changelog

## [1.1.0](https://github.com/balpal4495/DecisionDeck/compare/decisiondeck-v1.0.0...decisiondeck-v1.1.0) (2026-05-16)


### Features

* **delivery:** project hierarchy tree — Epic → Sprint → Story → Sub-task → PR ([420b817](https://github.com/balpal4495/DecisionDeck/commit/420b8179f8601d51638738d88ec63ca5f1e11662))
* **delivery:** WebGL node tree — click-through hierarchy with status/type colours ([5e89ca3](https://github.com/balpal4495/DecisionDeck/commit/5e89ca3bb3bb225f0d8abaceb9f2f4bc074a1e83))
* **delivery:** WebGL node tree — Epic → Sprint → Story → Sub-task → PR ([748e756](https://github.com/balpal4495/DecisionDeck/commit/748e756650d9d6c09fee5a53cf628afd698eb5ce))
* **graph:** add PR Coverage tab — PR-first investigation view ([9822989](https://github.com/balpal4495/DecisionDeck/commit/9822989f00acf4b6fa8292d806b849309903edc2))
* **graph:** handle Sub-task issuetype explicitly + enrich PR Coverage with parent context ([7d07508](https://github.com/balpal4495/DecisionDeck/commit/7d07508fa751390d274191b23f7d5ca283dc27f7))
* **graph:** replace WebGL graph with 2D SVG alignment view ([3ebd67e](https://github.com/balpal4495/DecisionDeck/commit/3ebd67e6b3b8982848227786d134d4eb76cec4d0))
* **graph:** WebGL 3D force-graph of Jira/GitHub dependency network ([5b9e6bb](https://github.com/balpal4495/DecisionDeck/commit/5b9e6bb055e1b303d63f22b41b91c5b743466c2c))
* mermaid coverage heatmap in PR comments; add release-please versioning ([2decd9f](https://github.com/balpal4495/DecisionDeck/commit/2decd9f0c92ba38038e04274505da09e1ceded29))
* mermaid coverage heatmap in Sentinel PR comments + release-please versioning ([63ebfe9](https://github.com/balpal4495/DecisionDeck/commit/63ebfe93e502993a7712f9e76b1c5ede486d5cd2))
* Phase 0 foundation + Phase 1 GitHub sync ([e79bdbe](https://github.com/balpal4495/DecisionDeck/commit/e79bdbe325f1dce4a55875a962f803474e8209a4))
* Phase 0 foundation + Phase 1 GitHub sync ([040f87b](https://github.com/balpal4495/DecisionDeck/commit/040f87bb94d43e6d10d804a6067a8b44a0b5ce77))
* **phase-2:** Jira integration — sync epics and tickets ([3eb85ac](https://github.com/balpal4495/DecisionDeck/commit/3eb85ace1f43f57135c7d7353cf7fede2a2feaa7))
* **phase-2:** Jira integration — sync epics and tickets via REST API ([4c69afe](https://github.com/balpal4495/DecisionDeck/commit/4c69afeb0d5d63de128e38c7ad71952f4aeb45da))
* **pulse:** redesign colours + layout for clarity\n\nColour semantics were broken in several ways:\n  - Green = 'hot/recently touched' reads as 'done/success' — confusing\n  - Blue = 'cold/stale' reads as info — not alarming enough\n  - Open PR in green = 'success', but open just means in flight\n  - Section 2 had a 'No PR' column on every row — the section IS 'no PR'\n\nFixes:\n  - Age dots: grey (0–14d, expected) → amber (14–30d, watch) → red (30+d, act)\n    No green anywhere — recently-touched is normal, not a success state.\n  - PR status: pill badges with semantic colours\n      Blue = Open (in flight, neutral)\n      Amber = In review (pending action)\n      Green = Merged (done — only time green appears)\n      Red = No PR on sprint item (real signal)\n      Muted = No PR outside sprint (not relevant there)\n  - Section headings: coloured left-accent bars\n      Accent blue = Active sprint (the plan)\n      Amber = In progress, no PR (needs attention)\n      Purple = Shadow PRs (unplanned work)\n  - Section 2: remove redundant PR column, replace with Status\n  - Section 3: flat div rows → proper table (consistent with sections 1&2)\n  - Legend labels: 'Hot/Warm/Cold/Frozen' → 'Active/Recent/Stale/Stuck' ([3c419fe](https://github.com/balpal4495/DecisionDeck/commit/3c419feae11b340ebb1a0373557d2c8aab3379f9))
* **pulse:** sprint commitment view with Jira/GitHub cross-reference ([e33c6f8](https://github.com/balpal4495/DecisionDeck/commit/e33c6f807e4a794d1408b63462feec222ddc4e5b))
* **pulse:** sprint commitment view with Jira/GitHub cross-reference ([cc51d76](https://github.com/balpal4495/DecisionDeck/commit/cc51d764192dd8af48ae91c9258cef09f5c4825c))
* **timeline:** WebGL delivery timeline view ([ab15d58](https://github.com/balpal4495/DecisionDeck/commit/ab15d58c573eda383bdfb661e514cf5c14f35e25))
* **triage:** work item triage scanner ([e138811](https://github.com/balpal4495/DecisionDeck/commit/e13881199195515f440dcd89ed9bcacbb9871bf1))
* **triage:** work item triage scanner ([b87ca20](https://github.com/balpal4495/DecisionDeck/commit/b87ca207b9da6f80708fa9f92411b3ccb1bc6cd8))


### Bug Fixes

* **alignment:** matched PRs no longer labelled 'shadow PR'\n\nA linked PR with no assignee was showing 'shadow PR' as its subtitle —\nthe same label used for untracked (unlinked) PRs. Now:\n  - linked PR + no assignee  → 'open PR'\n  - unlinked PR + no assignee → 'shadow PR'  (intended)\n  - any node with an assignee → assignee name ([0726b37](https://github.com/balpal4495/DecisionDeck/commit/0726b3738b45de31d3336b9331ea2b56cbef779c))
* **alignment:** PR node subtitle shows PR title instead of assignee ([610dc58](https://github.com/balpal4495/DecisionDeck/commit/610dc58e5b7f804b017cf352c4632a250019e0e8))
* checkout ref main in chronicle-on-merge to avoid detached HEAD push failure; fix sentinel comment search string ([a4a5dc2](https://github.com/balpal4495/DecisionDeck/commit/a4a5dc2b048eaa695fc5bf4ff8c4f4c86a8a6457))
* **delivery:** visually distinguish Jira vs GitHub items ([610c459](https://github.com/balpal4495/DecisionDeck/commit/610c459fd39615593bbbb98d802f17d29668f7c5))
* pass changed files via env var in sentinel workflow; add GH mappers + tests ([1fc7703](https://github.com/balpal4495/DecisionDeck/commit/1fc770382dc91ed26c97fadd2d8f4e070319af48))
* **pulse:** extractJiraKey handles space-separated keys (e.g. 'Dbd 3157') ([fef79b1](https://github.com/balpal4495/DecisionDeck/commit/fef79b177a26aebbc690299d823ddd9cc29dd7ce))
* scope Sentinel coverage to business app only (app, db, lib, scripts, .github, components, tests) ([5317e33](https://github.com/balpal4495/DecisionDeck/commit/5317e333014241c321b2fb2bf2f888a17baccf85))
* sentinel standing gap map — .tsx/.yml extensions, agent behaviours, Chronicle proposals ([42d3fed](https://github.com/balpal4495/DecisionDeck/commit/42d3fedf9c81917b288db607a1b6f46bd18d363b))
* **sync:** broaden Jira issuetype filter + backfill PR-referenced tickets ([2eb23c8](https://github.com/balpal4495/DecisionDeck/commit/2eb23c82c25d61964cd2a735f2c9286db6a74e50))
