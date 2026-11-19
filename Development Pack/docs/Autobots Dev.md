# Autobots Dev

Build the CEDA Innovation Portal in the project root. Autobots Dev is the name of the product advantage we are building into that same codebase. The existing domain slice is already part of the portal and ships through the same features, tests and releases.

| Ordinary implementation | Autobots Dev acceptance criteria |
| --- | --- |
| Build an assessment form and save the score. | Pin which submission, evidence and rubric each score used. Keep that history traceable after updates. |
| Add a chat interface. | Give Optimus Prime approved, versioned guidance, and make human escalation part of the workflow. |
| Improve a help message. | Compare safe wording on a fictional task and use approved aggregate evidence to decide whether to adopt it. |
| Write and review feature code. | Use the same engineering workflow, with focused tests for the durable advantage and a handover record for the next developer. |

## What should compound over time

| Capability | First code slice | Portal integration still required | Evidence of value |
| --- | --- | --- | --- |
| Traceable assessment | `src/features/assessment/round.ts` pins submission, evidence, rubric and policy versions; checks conflicts, rubric completeness, eligibility, quorum, strict majority and release conditions; creates distinct internal and applicant outputs. | Load verified scope and fresh MFA from server-owned state. Enforce round membership, unique reviews/ballots, locks, idempotency and durable audit in Supabase. Expose safe applicant feedback and a restricted reviewer audit view. | Authorized staff can reconstruct a sampled decision using the original records even after rubric changes. Track missing-provenance incidents. |
| Sector expertise | Pinned primary sector and sector-before-general guidance selection. | Wire to the sector catalogue, approved knowledge revisions and managed roles. Keep secondary tags out of authorization. Keep every published version attributable. | Track clarification requests per submitted application by sector and compare comparable cohorts. |
| Governed Optimus Prime | `src/features/support/approvedGuidance.ts` resolves a published public answer or offers human handoff. Retired, draft and staff-only material stays outside public results. | Read the governed catalogue server-side; verify publication authority, store source version, and route ambiguous questions into the existing support queue. | Review recurring unresolved public topics and record which guidance updates reduce avoidable clarification. |
| Continuous improvement | `src/features/experiments/evidenceGuidance.ts` implements sticky, opt-in-ready allocation and deduplicated aggregate counts for one public wording experiment. | Gate enrollment, add the render/exposure and outcome adapter and approved retention, and run usability checks before public enrollment. | Correct comprehension per exposed trial and requests for help by variant. |
| Maintainability | Linked documentation, test suite and synthetic walkthrough. | Complete staff handover, release notes and reproducible deploy/rollback. | Another engineer can reproduce the walkthrough and identify which checks belong in the app and database. |

## Server integration contract

The TypeScript functions are deterministic domain logic. The caller supplies trusted objects built from validated database records and verified identity. Never deserialize a browser-provided role, conflict flag, version pointer, hold, vote state, approval ID, or MFA boolean directly into these functions. The current release output represents a proposal from domain checks. The future release transaction must re-read permissions, live assignments, quorum, hold and pinned versions under consistent locks, then commit its decision, audience-specific timeline, outbox and audit together. The SQL layer remains authoritative for concurrent operations and direct Data API access.

The round fixture uses a strict majority of valid eligible ballots and a configurable quorum. A split of 2–2–1 blocks release. Treat demo defaults as proposed until CEDA approves policy for live use. The knowledge catalogue must have stable article identities and unique increasing revisions per article. Dedicated publication commands validate authorizations, write auditable publication/retirement changes and reject ambiguous active entries.

## Practical learning loop

1. Categorize an unresolved question using an approved topic, such as unclear evidence expectations. Avoid retaining application text or identity in improvement metrics.
2. A support officer proposes a guidance revision. An authorized publisher reviews the source and publishes a new revision. Keep its approval history.
3. Re-run the synthetic walkthrough and compare trends for comparable applications and sectors after the change. Record rollout date, counts, change and observed effect.
4. Put a useful revision into the form, sector guidance and Optimus Prime knowledge base. Retire guidance explicitly when it no longer applies.

## Demo sequence

Run `npm run demo:autobots`. The synthetic sequence returns versioned agriculture evidence guidance, a human handoff suggestion for an unanswered question, a blocked 2–2–1 recommendation, a separate majority example with release preparation, and the A/B allocation smoke-check counts. The CLI uses synthetic records. The portal demo will later run these steps through applicant, assessor, manager and support sessions.