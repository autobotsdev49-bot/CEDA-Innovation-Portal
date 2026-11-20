# CEDA Innovation end to end development plan

Updated 20 November 2026. Target completion is 22 November 2026, Africa/Gaborone time.

This is the working checklist for delivery by Autobots Dev. Implementation stays in the project root. This Development Pack contains specifications, references and progress records.

## How to track progress

Checked boxes record completed implementation supported by the current source or recorded checks. An unchecked box remains open, including implemented work awaiting acceptance where stated. Every phase has a separate acceptance gate. A mockup, domain fixture or starter screen does not complete a working workflow.

Use this document for sequence and task status. Use [Development Status](<Development Status.md>) for dated evidence, commits, blockers and handover. [Current Progress](<Current Progress.md>) describes the current frontend/backend baseline. Preserve the original specifications linked below.

For each task, record the primary developer, backup reviewer, changed files, migration, test result, commit and next action in the work log. Owner assignments are currently unassigned and must be filled in at the first team check-in.

## Four user groups and permissions

| User group | Workspace | Allowed work |
| --- | --- | --- |
| Innovator | Own dashboard and applications | Create individual/company applications, manage own drafts, upload evidence, submit, respond to requests, track status, read released feedback and obtain support. |
| Admin | Platform administration | Create user accounts, assign/change roles, manage staff, sectors, security, public content and service operations within delegated permissions. |
| Assessor | Assigned assessment workspace | Declare conflicts, review assigned evidence, score six criteria, submit an assessment, discuss and vote under the round rules. |
| Support Officer | Support workspace | Claim eligible tickets, assist visitors, reply, add private notes, escalate and close conversations. |

Lead Assessor / Assessment Manager is an additional scoped capability within the Assessor group. It permits panel coordination, conflict handling, deadlines, moderation and separately authorized outcome release. Model the lead scope and release permission explicitly. An ordinary assessor never gains these powers by opening a lead URL.

All users enter through the same sign-in screen. Existing specifications mentioning a separate staff sign-in must map to that shared entry point. Role and capability checks determine the destination and allowed operations.

- [x] Supabase profiles hold protected account roles and account status.
- [x] Innovator and Admin role destinations implemented in web/mobile source.
- [x] Public sign-up always provisions Innovator after email confirmation.
- [ ] Extend allowed roles and application guards to Support Officer and Assessor.
- [ ] Add lead-assessor scope and explicit release permission.
- [ ] Define deterministic workspace selection when a staff member holds multiple grants.
- [ ] Verify every API and database policy against the same role/capability rules.

## Sequence and deadline

Build a complete web workflow for a user before porting that workflow to native mobile. Shared database and backend contracts must pass their authorization checks before both clients use them.

The initial Admin slice supplies accounts, roles and sectors needed by the other roles. Complete broader operational administration after the submission and assessment workflow has working data.

| Order | Slice | Dependency and exit evidence |
| --- | --- | --- |
| 0 | Shared authentication, authorization and portal shell | Staff accounts and negative access checks work. |
| 1 | Admin foundation | Staff invitation, scoped grants, sector setup and audit work. |
| 2 | Innovator web | A verified Innovator submits an individual/company application and receives one receipt. |
| 3 | Assessor with lead capability | Lead assigns a panel, assessors review and vote, authorized release appears to the Innovator. |
| 4 | Support Officer and visitor support | Optimus Prime handoff, queue claim, conversation, escalation and closure work. |
| 5 | Complete Admin operations | Health, delivery failures, approved knowledge and scoped reporting reflect the integrated workflows. |
| 6 | Mobile versions | Reuse each accepted web backend and verify native authorization, keyboard, file and session behavior. |
| 7 | Release acceptance | Web and mobile journeys, security, accessibility, deployment and handover pass. |

| Date and checkpoint | Required delivery | Accountable function |
| --- | --- | --- |
| 20 November, first checkpoint | Assign owners, resolve admin bootstrap, shared roles, sector baseline and application schema. | Platform and backend leads |
| 20 November, end of day | Admin foundation and Innovator web draft-to-receipt flow working with owner-only storage. | Admin and Innovator developers |
| 21 November, midday | Assignment, conflicts, individual scores, collective votes and authorized release integrated. | Assessment developer and backend lead |
| 21 November, end of day | Human support loop, provider adapters, essential Admin operations and mobile API reuse integrated. | Support, platform and mobile developers |
| 22 November, midday | Role-specific mobile workflows and all essential web journeys ready for acceptance. Freeze new features. | Mobile and frontend leads |
| 22 November, afternoon | Resolve security, data-loss, accessibility and demo blockers. Rehearse from clean accounts and a clean checkout. | QA and security reviewer |
| 22 November, final checkpoint | Record accepted commit, deployed URL, mobile artifact, evidence and handover. Check organizer cutoff separately. | Release owner and backup |

These are proposed team checkpoints. The full screen catalogue is a substantial target for the remaining time. Track actual progress at each checkpoint. If a task misses its checkpoint, record the impact and agree a scope decision explicitly. Essential access controls and data integrity remain acceptance requirements. Expanded screens stay visible in this checklist until accepted or explicitly rescheduled.

## Phase 0 shared foundation

### Existing implementation

- [x] Public website information routes, navigation, footer and responsive visual foundation.
- [x] Web sign-up/sign-in, verification return, resend feedback and temporary account page.
- [x] Supabase Auth connection and confirmed-account Innovator provisioning.
- [x] Profiles table, active/suspended/closed status and owner-only Row Level Security.
- [x] Database role constraint expanded to Innovator and Admin.
- [x] Client role changes blocked by database grants.
- [x] Mobile splash/fade, onboarding, welcome and native auth forms.
- [x] Mobile verification screen, resend timer, confirmed-identity check and success animation.
- [x] Mobile keyboard-safe form implementation.
- [x] Recorded latest auth/domain test run with 28 passing tests, web build and mobile TypeScript check.

### Remaining frontend and backend

- [ ] Complete administrator account creation. Local setup script exists at scripts/createAdministrator.ts.
- [ ] Verify bootstrap result and shared login using admin@ceda.co.bw. Keep credentials out of source and documentation.
- [ ] Introduce Support Officer, Assessor and scoped lead permissions through reviewed migrations.
- [ ] Implement shared authenticated web shell, navigation, account menu and accessible error/loading/empty states.
- [ ] Complete the chosen Next.js web runtime migration, preserving working public routes and auth behavior.
- [ ] Add account recovery, password-reset completion and expired-link screens.
- [ ] Add staff Multi-Factor Authentication (MFA), enrollment and recovery.
- [ ] Ensure suspended accounts and revoked sessions lose access at protected API/database operations.
- [ ] Add append-only audit events for privileged operations, including actor, scope, action, target, time and reason.
- [ ] Write versioned API contracts, input/output schemas and error meanings before connecting role screens.
- [ ] Configure environment isolation, private server secrets and public publishable keys.
- [ ] Record the database schema, migration ledger and rollback/forward recovery steps.

### Foundation acceptance

- [ ] Controlled-inbox signup, verification, recovery, sign-in and logout pass.
- [ ] Shared login routes every role correctly and rejects unknown, suspended and unconfirmed accounts.
- [ ] Wrong-owner and wrong-role requests fail at the data boundary.
- [ ] Direct URL access shows no protected data before authorization.
- [ ] Reproduce setup from the root README and deploy the accepted source.

Admin creation is currently blocked by unavailable server credentials in the local environment. Automatic approval review rejected a temporary privileged creation endpoint. Use the documented trusted local Admin API script. No administrator account creation has been verified.

## Phase 1 Admin foundation on web

### Screens

- [ ] First-access security setup and Admin overview with genuine service state.
- [ ] User directory, search/filter/pagination and permitted account details.
- [ ] Create User screen with name, email, initial role, account status and applicable sector scope.
- [ ] Allow Admin to create Innovator, Support Officer, Assessor and authorized Admin accounts. Assign lead-Assessor powers as an explicit scoped capability.
- [ ] Staff invitation, invitation acceptance and expired-invitation recovery.
- [ ] Role and sector grants, lead capability and access-change confirmation.
- [ ] Account suspension/restoration, active sessions and revocation controls.
- [ ] Credential recovery action that sends provider-managed reset instructions.
- [ ] Sector directory, create/edit, publish/archive and history.
- [ ] Audit list/detail and permission-denied states.

### Database and backend

- [ ] Add staff grants, sector definitions, sector membership and grant history.
- [ ] Add invitation lifecycle and audit records without storing plaintext credentials.
- [ ] Add scoped user listing, invite, access-change, suspension, restore and reset actions.
- [ ] Implement an Admin-authorized create-user action through the trusted backend. Create the Auth identity and protected profile/grants, handle duplicate emails and recover safely from partial failures or retries.
- [ ] Send a secure account activation/password-setup link after creation and record delivery state. The new user completes credential setup before normal access.
- [ ] Audit who created the user and who assigned or changed each role, including old/new grants, sector scope, time and reason.
- [ ] Enforce valid role/scope combinations and prevent accidental removal of the final administrator.
- [ ] Preserve historical sector references when a sector is archived.
- [ ] Use privileged credentials only in trusted server operations.

### Security and acceptance

- [ ] Admin account-management rights grant only the intended administrative operations.
- [ ] Roles cannot be self-selected through registration, metadata, request bodies or browser storage.
- [ ] Privileged changes require the configured MFA level, reason and audit event.
- [ ] Admin does not gain assessment scoring, vote changes or access to private application evidence by default.
- [ ] Invite, scope change, suspension, recovery and archive journeys pass positive and negative tests.
- [ ] Admin creates a user for each permitted role, the user activates the account, and shared login opens the correct workspace.
- [ ] Role reassignment updates effective backend permissions and navigation. Removed grants cease to authorize operations.

## Phase 2 Innovator web

### Screens

- [ ] First-use dashboard, normal dashboard and My Innovations list.
- [ ] Individual/company applicant path and applicant/company details.
- [ ] Innovation overview and sector selection.
- [ ] Problem, solution, originality, impact and strategic alignment.
- [ ] Feasibility, development stage, implementation capacity and growth.
- [ ] Supporting evidence, upload progress, validation and authorized document preview.
- [ ] Ownership declarations, final review and confirmation.
- [ ] Submission success, reference number and downloadable receipt.
- [ ] Application detail, submitted answers, documents and status timeline.
- [ ] Application messages, information requests and additional-evidence response.
- [ ] Released feedback and final outcome.
- [ ] Notifications, profile/security/preferences and support entry points.

### Database and backend

- [ ] Add applicant/company records, applications, versioned answers and draft revisions.
- [ ] Add sector linkage, attachments, declarations, status events and receipt records.
- [ ] Add owner-scoped draft creation/read/update and autosave conflict handling.
- [ ] Add private storage upload/preview/download authorization and safe file validation.
- [ ] Enforce maximum four supporting files per section, with separately authorized reviewer-requested extras. Store videos as validated links.
- [ ] Pin the submitted evidence and form version. Submit atomically with an idempotency key and one receipt.
- [ ] Add application messages and information requests with owner-safe projections.
- [ ] Add in-app notification records and reliable email/push outbox.

### Security and acceptance

- [ ] One Innovator cannot read or change another Innovator's record or file.
- [ ] Submitted answers cannot be silently edited. Authorized revisions preserve history.
- [ ] Upload validation, size/type limits, path safety and quarantine/scan behavior are verified.
- [ ] Private URLs expire and reject unauthorized callers.
- [ ] Autosave survives navigation and handles stale tabs, retries and interrupted connections.
- [ ] Concurrent submit produces one submission and receipt.
- [ ] Individual and company paths both complete. Clarification and released feedback appear correctly.

## Phase 3 Assessor web with lead capability

### Lead preparation screens

- [ ] Lead dashboard, intake/library, completeness screening and read-only case workspace.
- [ ] Panel builder, assessor expertise/capacity picker and scoped assignment.
- [ ] Conflict/recusal handling, replacement and procedural holds.
- [ ] Round configuration, start, deadlines and progress.

### Standard Assessor screens

- [ ] First-access guidance, personal dashboard, library filters and My Assessments.
- [ ] Assigned case overview, read-only application and secure evidence viewer.
- [ ] Conflict declaration and eligibility-to-review gate.
- [ ] Six-criterion assessment editor with 1–5 scores and rationale.
- [ ] Review/submit assessment and submission acknowledgement.
- [ ] Authorized team reviews, anchored comments and panel discussion.
- [ ] Team readiness, vote, pending recommendation and final outcome.
- [ ] Information-request visibility, applicant response review and reassessment.
- [ ] Notifications, profile/security, rubric guidance and archived activity.

### Lead decision screens

- [ ] Review comparison, quality checks and moderation record.
- [ ] Collective voting control, results, quorum/majority verification and tie resolution.
- [ ] Information request composer, response review and reassessment control.
- [ ] Decision draft, applicant-facing feedback preview and separately authorized release.
- [ ] Closed record, archive, decision desk, workload and reports.

### Database and backend

- [ ] Add assignments, conflicts, panels, round membership, pinned rubric/evidence versions and deadlines.
- [ ] Add independent review drafts, submitted scores/rationales and immutable review versions.
- [ ] Add scoped annotations/discussion, ballots, moderation and information requests.
- [ ] Add recommendations, approved feedback and release events.
- [ ] Reuse existing assessment domain rules, then enforce them within database transactions and server authorization.
- [ ] Record six unweighted criteria from the brief. Obtain approval before changing rules.
- [ ] Define eligible voting membership, quorum and majority per round. Record demo assumptions.
- [ ] Tie and invalid quorum block release. Test the existing 2–2–1 fixture.
- [ ] Release outcome, applicant feedback, timeline and notification outbox atomically.

### Security and acceptance

- [ ] Unassigned, out-of-sector and recused assessors cannot review or retrieve evidence.
- [ ] Individual review visibility follows the configured round policy.
- [ ] Lead actions require delegated scope and appropriate permission.
- [ ] Lead cannot silently alter another assessor's score or override the panel result.
- [ ] Duplicate votes, stale rounds, held cases and concurrent release attempts are rejected safely.
- [ ] Innovator sees only released feedback and permitted status, with no private deliberations.
- [ ] Full assignment-to-release and additional-information/reassessment journeys pass.

## Phase 4 Support Officer web and visitor support

### Screens

- [ ] Visitor Optimus Prime panel, guidance sources and human-handoff confirmation.
- [ ] Waiting queue/rank, connected officer, active tickets, secure guest return and closed history.
- [ ] Officer dashboard, live queue, ticket preview and My Active Tickets.
- [ ] Unified AI/user/human conversation, handoff context and permitted visitor context.
- [ ] Public reply, private internal notes and visitor-information request.
- [ ] Authorized application-status lookup, internal escalation and escalation inbox.
- [ ] Transfer request, closure/resolution form and read-only closed ticket.
- [ ] Search, knowledge base, AI quality flag, notifications and availability/capacity.
- [ ] Officer metrics, audit timeline, error and permission states.

### Database and backend

- [ ] Add approved knowledge versions, support conversations, messages, ticket states and owner identity.
- [ ] Add queue ordering, availability, capacity, claim events and escalation records.
- [ ] Create one ticket per confirmed handoff with its original AI transcript.
- [ ] Atomic claim respects capacity and allows one winner under simultaneous acceptance.
- [ ] Persist messages with idempotency keys. Separate public messages and internal notes.
- [ ] Queue rank and subscription access use server-authoritative state.
- [ ] Add guest verification/recovery bound to identity, plus linked-account continuity.
- [ ] Close atomically, archive history and reject further replies to the closed ticket.
- [ ] Connect server-side Gemini to approved guidance with clear fallback and human escalation.

### Security and acceptance

- [ ] Ticket references alone grant no access to conversation history.
- [ ] Internal notes, assessment deliberations and credentials stay outside visitor responses and notifications.
- [ ] Support cannot change assessment outcomes or edit applicant evidence.
- [ ] AI cannot execute unauthorized database actions or reveal private knowledge.
- [ ] Guest and signed-in visitors can hand off, leave, return, chat and read closed history.
- [ ] Queue claims, reconnect, retries, officer capacity and closure races pass.

## Phase 5 complete Admin operations and integrations

- [ ] Finish public content, approved impact statistics, announcements and versioned knowledge publication.
- [ ] Add health/alerts, error explorer, deployment history, jobs, storage usage and backup evidence.
- [ ] Add integration health and notification delivery status/retry screens.
- [ ] Add aggregate assessment/support reports, workload and scoped CSV exports.
- [ ] Add privacy/retention handling, incident workflow and audited settings.
- [ ] Configure EmailJS and Firebase Cloud Messaging (FCM) with safe server-side delivery and opt-in rules.
- [ ] Verify a real delivery on each required channel and record quota/provider blockers.
- [ ] Add redacted error tracking, correlation IDs, workflow timings and aggregate page visits.
- [ ] Document what the requested activity Pixel tracks. Exclude auth fields, credentials, application evidence and private chat from analytics.
- [ ] Add approved consent/opt-out behavior and validate telemetry access controls.
- [ ] Record free-tier quotas, retry/backoff, duplicate delivery prevention and graceful provider failure.
- [ ] Verify backup/export and restore procedures supported by the selected free-tier setup.
- [ ] Service outages preserve committed submissions, decisions and messages.

## Phase 6 mobile app after each web backend is accepted

### Existing implementation and common work

- [x] Splash, onboarding, welcome, authentication, verification and celebration components exist.
- [ ] Verify actual inbox acceptance, success screen timing and resends on Android and iOS.
- [ ] Confirm keyboard avoidance on all fields, small devices, rotation and enlarged text.
- [ ] Share API types and validation rules where practical. Keep privileged actions server-side.
- [ ] Add native session storage/recovery strategy, expiry, logout and revocation checks.
- [ ] Verify deep links, expired links, account identity and safe return from email verification.
- [ ] Add authorized push-token registration, refresh/removal and private notification payloads.
- [ ] Validate permission changes, background/foreground transitions, connection loss and app restart.

### Per-user mobile screens and backend reuse

| User | Native screens to complete | Shared backend dependency |
| --- | --- | --- |
| Admin | Overview, user list/detail, access review, alerts, notification delivery, profile/security and permitted actions | Admin APIs, grants, MFA and audit |
| Innovator | Dashboard, innovations, adaptive wizard, files, receipt, detail/timeline, clarification, feedback, notifications and support | Applications, storage, workflow and support |
| Assessor | Workload, assigned case, evidence, conflict gate, scoring, submission, discussion, voting and history | Assessment rounds, assignments, reviews and ballots |
| Assessor with lead powers | Scoped intake, assignments, progress, comparison, moderation, tie/reassessment and release | Lead capabilities, release transaction and audit |
| Support Officer | Queue, preview/claim, active chat, notes, escalation, closure/history, availability and notifications | Support queue, messages, scoped subscriptions and claim transactions |

- [ ] Complete and accept Admin mobile workflow.
- [ ] Complete and accept Innovator mobile workflow.
- [ ] Complete and accept standard Assessor mobile workflow.
- [ ] Complete and accept lead-capability mobile workflow.
- [ ] Complete and accept Support Officer mobile workflow.
- [ ] Validate native document pickers, upload retries and access-controlled previews.
- [ ] Verify all mobile operations with altered IDs/roles using authorized test fixtures.
- [ ] Build/install release artifacts. Record Android acceptance and iOS build/device coverage separately.

## Phase 7 final end to end acceptance

- [ ] Admin provisions staff/scopes/sectors, and each staff member enters the correct workspace.
- [ ] Innovator signs up, verifies, submits, receives a receipt, answers clarification and reads released feedback.
- [ ] Lead assigns eligible panel members. Assessors submit independent reviews, vote and produce a valid collective result.
- [ ] Authorized lead release updates the Innovator timeline and notification exactly once.
- [ ] Support handoff preserves context, claims once, permits scoped chat and closes to read-only history.
- [ ] The same journeys work on mobile against the accepted shared backend.
- [ ] Unit and integration tests cover calculations, validation and state transitions.
- [ ] Database policy tests cover anonymous, wrong-owner, wrong-sector and wrong-role requests.
- [ ] Browser end to end tests and native manual evidence cover real provider handoffs.
- [ ] Accessibility checks cover keyboard/focus, TalkBack, VoiceOver, text scaling, contrast, reduced motion and voice control.
- [ ] No task requires audio-only instructions. Media has captions/transcripts where used.
- [ ] Performance checks cover page loading, interaction delays, image sizing, layout shifts and slow connections.
- [ ] A/B testing uses approved public wording, stable allocation and real exposure/result records. Record synthetic allocation as synthetic evidence. User study collection still needs scheduling and evidence.
- [ ] Secret/dependency checks, environment review, permission tests and provider failure tests pass.
- [ ] Vercel deployment and native artifacts match the accepted commit. Verify URLs and rollback steps.
- [ ] README, setup, migration ledger, API contracts, role permissions, user guide, known issues and demo script match the release.
- [ ] Complete a clean-account rehearsal and preserve screenshots/test results without sensitive data.
- [ ] Record submission package, owner/backup and organizer receipt if submission is required.

## Resume point

The next coding slice is Phase 0 staff authorization and Phase 1 Admin foundation. Start with the administrator bootstrap blocker, then staff grants, sectors and audit. Follow immediately with the Innovator draft-to-receipt workflow.

At every handover record the last completed task, exact next unchecked task, branch/commit, test evidence, remaining blocker and responsible developer. Update this plan after acceptance, rather than counting screens from reference images.

## Full screen inventory from the source specifications

The checklist below preserves the complete role-specification inventory. Functional screens may share layouts, tabs and modals. Shared sign-in screens map to the single login. These screen tasks remain unchecked until the complete referenced behavior is accepted. Earlier checked implementation milestones describe the current baseline.

Specification IDs and mockup IDs are different in places. For example, the Admin specification contains AD-01 through AD-38 while the mockup set contains AD-01 through AD-16. Use the specification name and heading to resolve the behavior, then select the matching visual reference. Do not infer that matching numbers describe the same screen.

### Innovator

[Source specification](<../Our Vision/Innovator.md>)

- [ ] PUB-01 Public Homepage
- [ ] PUB-02 About / CEDA Innovation
- [ ] PUB-03 How It Works
- [ ] PUB-04 Eligibility & Submission Guide
- [ ] PUB-05 Sectors and Impact
- [ ] PUB-06 FAQ & Public Help
- [ ] PUB-07 Contact & Legal
- [ ] AUTH-01 Sign In
- [ ] AUTH-02 Create Account
- [ ] AUTH-03 Verify Email
- [ ] AUTH-04 Forgot / Reset Password
- [ ] AUTH-05 First-Time Dashboard Empty State
- [ ] APP-01 Application Start / Applicant Type
- [ ] APP-02 Innovation Overview
- [ ] APP-03 Problem & Solution
- [ ] APP-04 Impact & Alignment
- [ ] APP-05 Feasibility & Growth
- [ ] APP-06 Supplementary Evidence
- [ ] APP-07 Declarations & Review
- [ ] APP-08 Submission Success + Receipt
- [ ] PORT-01 Dashboard
- [ ] PORT-02 My Innovations
- [ ] PORT-03 Application Detail — Overview
- [ ] PORT-04 Submitted Answers
- [ ] PORT-05 Documents & Evidence
- [ ] PORT-06 Progress Timeline
- [ ] PORT-07 Application Messages & Requests
- [ ] PORT-08 Feedback & Final Outcome
- [ ] PORT-09 Notifications Center
- [ ] PORT-10 Profile, Security & Preferences
- [ ] SUP-01 AI Chat Panel / Mobile Sheet
- [ ] SUP-02 Escalation Confirmation
- [ ] SUP-03 Live Human Chat
- [ ] SUP-04 Support Ticket / Queue Status
- [ ] SUP-05 Help & Support Hub
- [ ] SUP-06 My Support Conversations

### Admin

[Source specification](<../Our Vision/Admin.md>)

- [ ] AD-01 — Staff Sign In
- [ ] AD-02 — MFA & Trusted Session
- [ ] AD-03 — First-Access Administrator Setup
- [ ] AD-04 — Admin Overview
- [ ] AD-05 — Alert Center
- [ ] AD-06 — User Directory
- [ ] AD-07 — User Account Detail
- [ ] AD-08 — Invite Staff
- [ ] AD-09 — Role and Permission Matrix
- [ ] AD-10 — Access Change Review
- [ ] AD-11 — Suspension and Recovery
- [ ] AD-12 — Public Site Content
- [ ] AD-13 — Public Impact Metrics
- [ ] AD-14 — Platform Health
- [ ] AD-15 — Error Explorer
- [ ] AD-16 — Deployment and Release History
- [ ] AD-17 — Background Jobs
- [ ] AD-18 — Integrations Overview
- [ ] AD-19 — Notification Delivery
- [ ] AD-20 — Notification Templates
- [ ] AD-21 — Optimus Prime AI Operations
- [ ] AD-22 — Optimus Prime Knowledge Base
- [ ] AD-23 — Optimus Prime Quality Review
- [ ] AD-24 — Support Operations
- [ ] AD-25 — Support Queue Rules
- [ ] AD-26 — Assessment Configuration
- [ ] AD-27 — Assessment Aggregate Reporting
- [ ] AD-28 — Storage Overview
- [ ] AD-29 — Backup and Restore Health
- [ ] AD-30 — Audit Explorer
- [ ] AD-31 — Security Incidents
- [ ] AD-32 — Privacy and Retention
- [ ] AD-33 — System Reports
- [ ] AD-34 — Global System Settings
- [ ] AD-35 — Announcements & Maintenance
- [ ] AD-36 — Admin Notifications
- [ ] AD-37 — Admin Profile & Sessions
- [ ] AD-38 — Permission and Failure States

### Standard Assessor

[Source specification](<../Our Vision/Standard Assessor.md>)

- [ ] AS-01 — Staff Sign In
- [ ] AS-02 — First-Access Guidance
- [ ] AS-03 — Assessor Dashboard
- [ ] AS-04 — Innovation Library
- [ ] AS-05 — Library Filters and Results
- [ ] AS-06 — Innovation Workspace Shell
- [ ] AS-07 — Innovation Overview
- [ ] AS-08 — Read-Only Application
- [ ] AS-09 — Evidence and Document Library
- [ ] AS-10 — Secure Document Viewer and Annotations
- [ ] AS-11 — Start Assessment / Eligibility Gate
- [ ] AS-12 — Individual Assessment Editor
- [ ] AS-13 — Review and Submit Assessment
- [ ] AS-14 — My Assessments
- [ ] AS-15 — Team Reviews
- [ ] AS-16 — Anchored Comment Thread
- [ ] AS-17 — Live Team Discussion
- [ ] AS-18 — Team Readiness and Aggregate
- [ ] AS-19 — Collective Recommendation Vote
- [ ] AS-20 — Recommendation Result / Pending Authorization
- [ ] AS-21 — Information Request Drafting / Visibility
- [ ] AS-22 — Innovator Response Review
- [ ] AS-23 — Reassessment Round
- [ ] AS-24 — Final Outcome (Read Only)
- [ ] AS-25 — Archived Discussion and Audit History
- [ ] AS-26 — Notifications Center
- [ ] AS-27 — Assessor Profile and Security
- [ ] AS-28 — Help, Scoring Guidance and Support
- [ ] AS-29 — Error, Restricted and Empty States

### Assessment Manager

[Source specification](<../Our Vision/Assessment Manager.md>)

- [ ] AM-01 — Staff Sign In and Role Routing
- [ ] AM-02 — First-Access Manager Guidance
- [ ] AM-03 — Assessment Manager Dashboard
- [ ] AM-04 — Innovation Library / Filtered Queue
- [ ] AM-05 — Innovation Management Workspace
- [ ] AM-06 — Eligibility and Completeness Screening
- [ ] AM-07 — Applicant Submission (Read Only)
- [ ] AM-08 — Documents and Secure Evidence Viewer
- [ ] AM-09 — Assessment Panel Builder
- [ ] AM-10 — Assessor Picker / Expertise and Capacity
- [ ] AM-11 — Conflict and Recusal Management
- [ ] AM-12 — Round Configuration and Start
- [ ] AM-13 — Panel Progress / Deadlines
- [ ] AM-14 — Submitted Reviews and Score Comparison
- [ ] AM-15 — Anchored Comments / Document Threads
- [ ] AM-16 — Live Panel Discussion
- [ ] AM-17 — Aggregate and Rubric Analytics
- [ ] AM-18 — Collective Voting Control
- [ ] AM-19 — Voting Results and Majority Verification
- [ ] AM-20 — Tie Resolution Workspace
- [ ] AM-21 — Manager Reassessment Request
- [ ] AM-22 — Procedural Hold / Eligibility Exception
- [ ] AM-23 — Information Request Composer
- [ ] AM-24 — Innovator Response Review
- [ ] AM-25 — Decision Draft and Feedback Editor
- [ ] AM-26 — Applicant-Facing Preview and Release
- [ ] AM-27 — Final Outcome / Closed Record
- [ ] AM-28 — Archived Chat and Audit History
- [ ] AM-29 — My Decision Desk
- [ ] AM-30 — Assessment Panels Overview
- [ ] AM-31 — Information Requests Queue
- [ ] AM-32 — Reassessments Queue
- [ ] AM-33 — Reports and Team Workload
- [ ] AM-34 — Notifications Center
- [ ] AM-35 — Help, Rubric and Policy Guidance
- [ ] AM-36 — Manager Profile and Security
- [ ] AM-37 — Error, Restricted and Empty States

### Support Officer

[Source specification](<../Our Vision/Support Officer.md>)

- [ ] SO-01 — Staff Sign In
- [ ] SO-02 — Support Dashboard
- [ ] SO-03 — Live Queue
- [ ] SO-04 — Ticket Preview
- [ ] SO-05 — My Active Tickets
- [ ] SO-06 — Unified Ticket Conversation
- [ ] SO-07 — Optimus Prime Handoff Context
- [ ] SO-08 — User and Guest Context
- [ ] SO-09 — Innovation Status Lookup (Read Only)
- [ ] SO-10 — Compose Public Reply
- [ ] SO-11 — Internal Notes
- [ ] SO-12 — Request Visitor Information
- [ ] SO-13 — Internal Escalation Form
- [ ] SO-14 — Escalation Inbox and Detail
- [ ] SO-15 — Transfer / Reassign Request
- [ ] SO-16 — Ticket Resolution and Closure
- [ ] SO-17 — Support History
- [ ] SO-18 — Closed Ticket Detail
- [ ] SO-19 — Search and Advanced Filters
- [ ] SO-20 — Knowledge Base
- [ ] SO-21 — AI Response Quality Flag
- [ ] SO-22 — Notifications Centre
- [ ] SO-23 — My Performance
- [ ] SO-24 — Profile, Availability and Capacity
- [ ] SO-25 — Audit and Activity Timeline
- [ ] SO-26 — Permission and Error States
- [ ] VC-01 — Optimus Prime Conversation
- [ ] VC-02 — Human Handoff Confirmation
- [ ] VC-03 — Waiting in Queue
- [ ] VC-04 — Connected to an Officer
- [ ] VC-05 — My Active Support Tickets
- [ ] VC-06 — Support History and Closed Conversation
- [ ] VC-07 — Guest Recovery / Link Account

### Mobile visual references

Use these reference sets alongside the native workflow checklist above. Track complete behavior and security acceptance for each adaptation.

- [ ] Adapt and accept AM 01 from [Admin Screens](<../Admin Screens/AM 01.png>).
- [ ] Adapt and accept AM 02 from [Admin Screens](<../Admin Screens/AM 02.png>).
- [ ] Adapt and accept AM 03 from [Admin Screens](<../Admin Screens/AM 03.png>).
- [ ] Adapt and accept ASM 01 from [Assessor Screens](<../Assessor Screens/ASM 01.png>).
- [ ] Adapt and accept ASM 02 from [Assessor Screens](<../Assessor Screens/ASM 02.png>).
- [ ] Adapt and accept ASM 03 from [Assessor Screens](<../Assessor Screens/ASM 03.png>).
- [ ] Adapt and accept ASM 04 from [Assessor Screens](<../Assessor Screens/ASM 04.png>).
- [ ] Adapt and accept MOB 01 from [Innovator and Public Website Screens](<../Innovator and Public Website Screens/MOB 01.png>).
- [ ] Adapt and accept MOB 02 from [Innovator and Public Website Screens](<../Innovator and Public Website Screens/MOB 02.png>).
- [ ] Adapt and accept MOB 03 from [Innovator and Public Website Screens](<../Innovator and Public Website Screens/MOB 03.png>).
- [ ] Adapt and accept MOB 04 from [Innovator and Public Website Screens](<../Innovator and Public Website Screens/MOB 04.png>).
- [ ] Adapt and accept MOB 05 from [Innovator and Public Website Screens](<../Innovator and Public Website Screens/MOB 05.png>).
- [ ] Adapt and accept MOB 06 from [Innovator and Public Website Screens](<../Innovator and Public Website Screens/MOB 06.png>).
- [ ] Adapt and accept LM 01 from [Lead Assessor Screens](<../Lead Assessor Screens/LM 01.png>).
- [ ] Adapt and accept LM 02 from [Lead Assessor Screens](<../Lead Assessor Screens/LM 02.png>).
- [ ] Adapt and accept LM 03 from [Lead Assessor Screens](<../Lead Assessor Screens/LM 03.png>).
- [ ] Adapt and accept LM 04 from [Lead Assessor Screens](<../Lead Assessor Screens/LM 04.png>).
- [ ] Adapt and accept SOM 01 from [Support Officer Screens](<../Support Officer Screens/SOM 01.png>).
- [ ] Adapt and accept SOM 02 from [Support Officer Screens](<../Support Officer Screens/SOM 02.png>).
- [ ] Adapt and accept SOM 03 from [Support Officer Screens](<../Support Officer Screens/SOM 03.png>).
- [ ] Adapt and accept SOM 04 from [Support Officer Screens](<../Support Officer Screens/SOM 04.png>).
