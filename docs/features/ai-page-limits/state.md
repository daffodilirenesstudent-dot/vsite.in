---
slug: ai-page-limits
phase: design
status: running
design_version: 1
qa_round: 1
branch: feat/ai-page-limits
previous_tag:
release_tag:
pushed_sha:
critical_failure:
---

# ai-page-limits: workflow state

`phase`: intake | design | approval | build | qa | release | live-verify
`status`: running | awaiting_user | stopped | done
Hooks read the frontmatter above. Keep it `key: value`, one per line.

## Log
- 2026-09-23 phase 1 intake started. Owner pre-answered: onboarding 15 pages/store once; trial bulk 2 pages/store whole trial; paid bulk 5 pages/store per billing month; unread pages refunded.
- 2026-09-23 intake questions answered (existing paid shops move to 5/month; expired trial 0 pages; ON for all at go-live; ceiling ₹15; migration + productFlags approved; copy English only). Contract drafted, awaiting signature.
- 2026-09-23 contract signed by owner (trial = 7-day store trial, as enforced). phase 1 intake done.
- 2026-09-23 phase 2 design started
