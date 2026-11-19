# CEDA Innovation Portal delivery plan

19 November 2026 · Working baseline for Autobots Dev

## Scope and priorities

The demo should show Naledi finding public information, submitting an innovation, receiving a reference, responding to a request and seeing an authorized outcome. A separate journey shows Naledi getting text help before applying, reaching a human and returning to the same conversation. A third proves staff administration independently of assessment decisions.

| Priority | Build and show |
| --- | --- |
| P0 · Foundation | Public informational routes and accessible navigation; Supabase identity, staff MFA, scoped permission checks, session enforcement, minimal audit, environment isolation and preview deploy. |
| P0 · Application | Individual and registered company variants, adaptive form and saved draft, private file authorization, immutable submission/receipt, status tracking and a reviewer-requested clarification. |
| P0 · Assessment | Scoped intake and panel, conflict declaration, six criterion scores, quorum and voting gate, additional information/reassessment path, manager release and applicant-facing feedback. |
| P0 · Administration | Staff account invitations, role and sector assignment, directory and session view, suspend/restore/revoke, provider-managed credential recovery and sector create/publish/archive. |
| P0 · Optimus Prime support | Published guidance, human handoff before application, queue and claim, scoped text chat, verified return and closed history. Use approved source lookup if the AI service is unavailable and identify demo capability accurately. |
| P0 · Provider and mobile foundation | Configure free-tier EmailJS, FCM, Gemini and Vercel from day one. Scaffold the Expo Android client and verify email, Android push, approved guidance and the deployed preview. See [Platform Setup](<Platform Setup.md>). |
| P0 - Administrative observability | Add basic traffic, workflow timings and error reporting with the first deployable web and mobile flows. See [Admin Analytics and Monitoring](<Admin Analytics and Monitoring.md>). |
| P1 · When P0 is green | Scoped aggregate dashboard and CSV, selected ready-made ops screens, scoped Realtime, richer collaboration, additional notification scenarios and responsive polish. Maintain the in-app notification record for all P0 work. |
| Later | Expanded native workflows, iOS distribution, advanced analytics, offline mode, complex infrastructure, dynamic permission designer and expanded integrations. |

## Remaining milestones

Dates are proposed Botswana-time targets based on the existing project plan. Check the final submission cutoff, channel and file format through organizer instructions before packaging.

| Target | Work and dependencies | Exit evidence |
| --- | --- | --- |
| 19 Nov | Assign primary/backup owners, locate team scaffold or create one during the event, align app routes to mockups, pin runtime, establish isolated Supabase/Vercel, validate EmailJS, FCM and Gemini, scaffold the Expo client, define demo roles and freeze P0. Build public shell and identity foundation in parallel tracks. | Public preview, clean setup checklist, migration and RLS baseline. |
| 20 Nov | Application draft, transaction and evidence slots. Build scoped staff invitations and sector CRUD. Use shared auth/policy boundary for assessment and support. | Verified accounts open the right routes, both draft types resume, users/scopes audit correctly, one atomic receipt. |
| 21 Nov | Integrate assignment, score, vote, clarification and release. Close support queue/handoff/chat. Complete recovery and revocation wiring. | End-to-end role rehearsals, 2–2–1 gate, support return and unique claim, suspension denies earlier sessions. |
| 22 Nov | Fix permission, accessibility and workflow blockers. Exercise concurrency, negative paths, accessibility and rollback. Freeze features and record demo limitations. | Green checks on agreed commit, manual proof and a reproducible synthetic dataset. |
| 23 Nov | Package and rehearse early. Validate solution URL, authorized judge access, walkthrough, source, README, user manual, KYC and technical proposal where required. | Team approval, final version, submission record and organizer receipt where available. |

## Initial issue backlog

| ID | Owner role | Depends on | Done when |
| --- | --- | --- | --- |
| CEDA-01 | Platform | — | Clean checkout runs, environments isolated, deployment artifact tracked and README setup verified. |
| CEDA-02 | Web / accessibility | CEDA-01 | PUB routes, safe signed-in transition and help triggers pass keyboard and responsive checks. |
| CEDA-03 | Backend / security | CEDA-01 | Identity, session guard, roles, RLS, MFA and audit with role-denial tests. |
| CEDA-04 | Admin | CEDA-03 | Invitation, grants, credential recovery, suspension/revocation and sectors pass access/change evidence checks. |
| CEDA-05 | Applications | CEDA-03 | Versioned form, two applicant paths, autosave, evidence, submit and timeline pass retries and private-file isolation. |
| CEDA-06 | Assessment | CEDA-03/05 | Panel/recusal/reviews/vote/request/release work, pinned rules and separation proven. |
| CEDA-07 | Support | CEDA-03 | Pre-application handoff, scoped chat, safe guest recovery and claim races verified. |
| CEDA-08 | QA / documentation | CEDA-02–07 | Acceptance evidence, user manual, contributor handover, accessible demo and submission checks complete. |

Assign specific team members and backup reviewers in the issue tracker. Order PRs so each dependency can merge independently. Triage by security and demonstration breakage first. Daily check-in records working commit, open blockers and next integration owner.

## Release evidence matrix

| Gate | Tests and evidence |
| --- | --- |
| Confidentiality | Anonymous, wrong applicant, unassigned assessor, out-of-sector manager, support agent and system admin see only allowed data, using both browser and authorized test harness. Revoked session loses protected access. |
| Admin governance | Invite expires safely; grants enforce sector limits; admin cannot self-approve; protected administrator remains; recovery delivers an account-controlled link; sector archive preserves history. |
| Data integrity | Concurrent submit returns one receipt; only one valid ballot per member; tie blocks release; version history remains intact; one ticket claim under race; late messages do not reopen ticket. |
| Accessibility | Keyboard-only, screen-reader, muted video and zoom journeys complete for public visitor, innovator and critical staff actions. Record axe and manual evidence. |
| Operations | Build and environment are reproducible, scoped reports match underlying records and provider outage preserves committed business effects. Test a release rollback/forward fix rehearsal. |

## Decisions before coding or before public rollout

| Decision | Proposed demo default and responsible role |
| --- | --- |
| Existing app root, repository, runtime and deploy owner | Reuse the team's scaffold if it exists. Platform lead records locations and pins versions before the first app PR. |
| Staff credential mechanisms and session rules | Provider-managed invite/reset, step-up MFA and live portal authorization. Security owner verifies delivery and revocation behavior before demo. |
| Sector governance and voting | Primary sector controls record scope, secondary sectors are tags. Six unweighted criteria with explicit sample quorum and valid majority for demo. Assessment and admin owners record fixture rules before enabling decisions. Obtain CEDA approval for live rules. |
| Support and Optimus Prime | Seed and label queue examples, confirm demo officer capacity, verified guest recovery and approved help content. Support owner tests the Gemini adapter against approved public guidance and demonstrates lookup and handoff on failure. |
| Evidence and privacy | Synthetic data, fail-closed scan. Decide integration and authority with security owner before accepting real files. Review retention, residency, terms and policy with CEDA before production. |
| External notifications | Always use in-app records. EmailJS and FCM are required setup on day one. Test a delivery on each channel and track any account or quota blocker. |
| Official submission | Compare the organizer's latest instructions to the existing plan, verify the exact Botswana-time cutoff and channel, and record who submits and who checks receipt. |

Keep the original development plan and role UX files as product context. When a technical detail changes, update the relevant specification, add the decision to the PR and note the affected acceptance evidence.

## Current build tracking

Use the [development status and work log](<Development Status.md>) for dated implementation evidence and the [Autobots Dev foundation](<Autobots Dev.md>) for the first domain slice. The [test and experiment plan](<Testing and Experiments.md>) tracks checks that run now and those gated on web, database or participant setup.