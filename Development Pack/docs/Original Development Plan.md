# CEDA Innovation Portal Development Plan

**Version 1.0 · 19 November 2026 · Autobots Dev · Team implementation baseline**

Build the public website first. It introduces the initiative, explains eligibility and evidence, and gives visitors a direct path to start an application or ask Optimus Prime for help. The responsive web prototype then takes one innovation through secure submission, collaborative assessment, authorized decision release and reporting. Human support works inside Optimus Prime from the first enquiry, even for someone who has never applied.

This plan incorporates the five role specifications in `Our Vision`, the screen references and the organizer materials. Use it for implementation order and cross-role rules. Use the companion documents for detailed fields, role screen inventories and interaction states. Routes, technical layouts and pilot settings in this plan are proposed until adopted by the team or approved by CEDA where required.

## 1. Product scope and success criteria

| Surface | Users | MVP outcome |
| --- | --- | --- |
| Public website | Everyone | Explain CEDA innovation, guide eligibility and evidence, open Optimus Prime and route users into sign-in or registration. |
| Innovator portal | Individuals and company representatives | Create a draft, submit private evidence, receive a reference, track progress and respond to authorized requests. |
| Assessment workspace | Assessors and assessment managers | Assign evidence, score independently, discuss, vote and release an authorized outcome. |
| Support workspace | Support officers and verified visitors | Escalate from Optimus Prime into a ranked queue, connect to an officer, exchange messages and retrieve read-only history. |
| Admin workspace | System administrators | Provision scoped staff, publish approved content, observe service health and audit privileged changes. |

The organizer brief calls for a centralized repository, multi-level evaluation, real-time tracking, feedback and iteration, and reporting. The prototype should demonstrate all five through working journeys. Public content should connect the initiative to CEDA’s strategic priorities, Botswana’s Vision 2036 and national development objectives. Authorized outcomes can communicate recognition or next development steps. Funding disbursement, underwriting, a public idea directory and production integrations sit outside the MVP.

Responsive web is the judging baseline. React Native with Expo is the planned native companion after the web flows stabilize. Write shared contracts early so mobile can use the same backend later. Confirm how the organizers want the web-only submission documented under their installation or executable requirement.

## 2. Phase one public website

| Screen | Proposed route | Content and action |
| --- | --- | --- |
| PUB-01 Home | `/` | Mission, hero, journey steps, eligibility preview and FAQs. Primary CTA opens the application entry. Secondary navigation opens the guide or Optimus Prime. |
| PUB-02 About | `/about` | CEDA innovation initiative, strategic alignment and the role of the platform. Link to How It Works. |
| PUB-03 How It Works | `/how-it-works` | Explain the journey from registration and draft to evidence, submission, tracking and feedback. |
| PUB-04 Eligibility and Submission Guide | `/eligibility` | Individual and company paths, stage selector, evidence checklist, file rules and video links. |
| PUB-05 Sectors and Impact | `/sectors` | Sector directory and approved public aggregates when available. Link to the submission guide. |
| PUB-06 FAQ and Public Help | `/help` | Searchable FAQ categories, accessible answer accordions and Optimus Prime entry. |
| PUB-07 Contact and Legal | `/contact` | Verified contact details, accessible enquiry form, privacy, terms and accessibility information. |

Build in this order. Establish design tokens, semantic header, navigation drawer and footer. Build Home, About and How It Works. Add Eligibility, Sectors, Help and Contact. Connect the public entry points to authentication and Optimus Prime as those slices land. Match the reference board’s navy text, teal accents, warm CTA, white space and information hierarchy. Use approved assets and copy for release.

The Submit Innovation CTA preserves a safe return path through account verification. Signed-in users land at application entry, where they can start or resume a draft. Staff Sign In routes to the separate staff authentication flow. Keep support available on public pages and contextually inside the wizard. Release gates include seven working routes, mobile menu and desktop navigation, keyboard operation, contrast, visible focus, clear form feedback, and no confidential data or unverified impact claims on public screens.

## 3. Screen handoff and implementation order

| Local board | Screen family | Build sequence |
| --- | --- | --- |
| 01 Public Website | PUB-01 to PUB-07 | First build and responsive review |
| 02 Account and Onboarding | AUTH-01 to AUTH-05 | Account verification, recovery and portal entry |
| 03 Application Wizard | APP-01 to APP-08 | Draft entry, adaptive steps, review and receipt |
| 04 Portal and Tracking | PORT-01 to PORT-10 | Application list/detail, status, messages, feedback and account |
| 05 AI and Human Support | SUP-01 to SUP-06 | Optimus Prime, handoff, queue, officer chat and history |
| 06 Mobile App | MOB-01 to MOB-06 | Native roadmap and mobile interaction reference |

The individual PNGs and boards live in `Innovator and Public Website Screens`. Associate a screen ID, route, role and acceptance scenario with every implementation issue. Use the Innovator document for exact fields and the staff documents for assessor, manager, support and admin screens. Review the support mockups against the queue and recovery contract in this plan before coding them. Add loading, empty, saving, retry, offline, unauthorized and read-only states where relevant. Validate layouts with long labels, a mobile keyboard and zoom.

## 4. Innovation submission and tracking

Registration establishes identity. Application entry asks whether the submission is from an individual or a registered company and reveals the right fields. Use the seven steps in `Our Vision/Innovator.md`: applicant information, innovation overview, problem and originality, impact and alignment, feasibility and growth, supporting evidence, and ownership declarations and review. Make stage and applicant-type requirements server-validated against a versioned form definition. Support clear “not applicable” answers where the form permits them.

Autosave progressively, restore the latest server draft after sign-in and surface conflicts if two sessions edit the same draft. Each eligible section accepts up to four supporting files by default, with additional evidence restricted to an explicit reviewer request. Accept video links as URLs. Display file progress, rejection and scan status. Final submission validates applicable answers and required clean files, commits an immutable version, creates the reference and receipt, writes the first status event and queues notifications in a single transaction. A repeated submit returns the existing receipt.

The Innovator Portal shows a dashboard, application list, status timeline, messages, requests, evidence and released feedback. Naledi sees stages such as received, under review, more information requested and final outcome. Show only authorized applicant-facing events. A response to an information request adds a versioned submission or evidence response tied to that request. Preserve the original submission and its timeline.

## 5. Assessment and adjudication

A manager screens the submission, assigns a qualified panel and sets deadlines, rubric and policy versions. Assessors see assigned evidence after scope and conflict checks. Each assessor drafts a private review, scores criteria on a 1–5 scale with rationale and evidence references, and submits an immutable scorecard. Submitted peer reviews become visible according to round rules. Keep document annotations and team chat scoped to authorized panel members.

| Organizer scoring category | Prototype evidence to prepare |
| --- | --- |
| Strategic alignment | Explain how the portal supports CEDA and Vision 2036. |
| Innovation and originality | Demonstrate contextual Optimus Prime assistance and continuity into live human support. |
| Impact potential | Show accessible participation and visibility of progress and feedback. |
| Feasibility and viability | Run the deployed flow and show permissions, maintenance and operational checks. |
| Scalability and sustainability | Explain provider boundaries, reporting and growth beyond the prototype. |
| Implementation capacity, team capability and governance | Show team ownership, delivery evidence and decision controls. |

These are competition judging categories. The assessment module may seed the same six as a clearly labeled demonstration rubric, as proposed in the vision documents. CEDA owns the actual operating rubric, weights and voting rules. A round freezes the evidence version, rubric, roster and policy. Aggregate submitted scores and open voting only once readiness and quorum checks pass. Eligible participants cast one reasoned vote for Approve, Reject or Request Additional Information. A 2–2–1 split holds the case. Apply the approved revote or tie process and preserve all ballot history.

Only the authorized assessment manager releases a result after server-side checks on scope, quorum, valid recommendation, holds and approved feedback. An additional-information decision issues a consolidated request with clear response items. Reassessment starts a linked round with a documented reason and preserved prior scores, votes and discussion. Close final-round collaboration as read-only. Administrators and support officers have separate roles and cannot release outcomes.

## 6. Optimus Prime and live human support

Optimus Prime answers from published, versioned CEDA guidance. It can use a safe context key such as the current form field or stage, cite the applicable guidance and offer handoff when an answer is uncertain. Visitors may request a human directly. Anonymous visitors can ask general questions. Require a signed-in account or verified guest recovery before persisting a handoff. Use a short-lived, single-use email verification or recovery link bound to the correct identity. Keep the same conversation and transcript as the visitor crosses that boundary.

When Naledi confirms, create exactly one ticket for that handoff and link her full Optimus Prime transcript in chronological order. Four people already waiting means Naledi sees **Position 5 in queue**. Each successful acceptance ahead of her moves her one place forward. She can leave, recover her account or verified guest session and reopen the same thread to see the current state. Show an unavailable-officer message when appropriate and keep the queue rank visible. Display no estimated wait unless supported by an approved method.

| State | Visitor experience | Staff and server rule |
| --- | --- | --- |
| Queued | Ticket reference, live position, thread and safe retry | Preview preserves position. Accept checks authority, availability, capacity and claim order. |
| Active | “Connected to Maseo, Support Officer” replaces rank | Assignment persists if the officer disconnects. Maseo can read the full Optimus Prime transcript and reply. |
| Waiting on visitor or internal team | Same thread with a clear waiting label | Assignment stays with the officer. Internal notes and department replies remain staff-scoped. |
| Closed | Conversation moves to read-only Support History | Authorized officer closes with a resolution code and summary. Backend blocks new messages and edits. A later issue creates a new linked ticket. |

A restricted queue service ranks waiting tickets by priority, then queue time and a stable tie-breaker. Start with FIFO. Activate a priority exception only through approved policy, audit who changed it and reflect the actual revised order. Claim atomically. Lock the officer’s capacity record, recheck their open workload and claim the authorized queue head in the same transaction. One officer wins a race on the same ticket. A second officer refreshes and can accept the next one. Different officers can claim different tickets. Count active and both waiting-on states against capacity. Use one active case per officer for the first demo and validate a configurable limit of three as a separate test scenario.

Use scoped real-time invalidation followed by an authorized snapshot refresh on connect, reconnect and queue changes. The visitor receives their own rank and ticket data. Officer views receive scoped queue metadata. Persist ordered messages, idempotency keys and an audit trail. Close and send operations must respect the same ticket state so a late message cannot reopen a closed ticket. Both parties can view authorized closed history under CEDA’s retention policy. Track queue size, assigned workload, oldest wait and time from enqueue to first officer reply.

## 7. Stack and service boundaries

| Layer | Planned technology | Responsibility |
| --- | --- | --- |
| Web | Next.js App Router, React and TypeScript | Public site, signed-in portal and staff workspaces. Use semantic HTML and shared CSS tokens. |
| Data and identity | Supabase Auth and PostgreSQL | Identity, role grants, draft and workflow state, row-level security and transactional operations. |
| Files and live updates | Supabase Storage and Realtime | Private evidence, scoped messaging and state updates. |
| Hosting and delivery | Vercel, GitHub and CI | Preview builds, deployment, reviews and reproducible releases. Use free tiers for the event. |
| Notifications | In-app outbox, Firebase Cloud Messaging and EmailJS | In-app records track delivery. FCM carries approved push alerts. EmailJS is the MVP application email adapter, subject to a safe authenticated sending setup. |
| Optimus Prime | Approved knowledge base and server-side AI adapter | Retrieve published guidance, pass minimal context and support graceful human handoff. Model provider remains a decision. |
| Native roadmap | React Native and Expo | Consume existing versioned contracts after web stabilization. |

Use an in-app notification as the durable record and retry external deliveries independently. Email and push carry a short description and authenticated link. Keep sensitive content behind sign-in. If email delivery fails, preserve the receipt and report the delivery state. Confirm the authentication email and guest verification sender separately. Keep storage, AI, email and push adapters replaceable. Export authorized data in documented CSV or JSON, keep OpenAPI or equivalent versioned API contracts, and map external IDs explicitly. A later self-hosted PostgreSQL or MySQL deployment would need a migration plan for RLS, stored functions, auth, storage and Realtime behavior. Regional hosting, live data and vendor terms require approval before a production pilot.

## 8. Repository organization and code writing

| Path | Purpose |
| --- | --- |
| `README.md`, `.env.example` | Quick start, prerequisites, architecture links, commands and variable placeholders |
| `apps/web/src/app/(public)`, `(auth)`, `(portal)` | Route groups for public pages, identity and Innovator Portal |
| `apps/web/src/app/(staff)/staff`, `app/api/v1` under `src` | Staff routes and versioned HTTP handlers |
| `apps/web/src/features` | Applications, assessment, support, reporting and admin modules |
| `apps/web/src/components`, `src/lib` | Shared UI, accessibility primitives and service adapters |
| `packages/contracts` | Shared schemas, status values and client-safe types for web and mobile |
| `supabase/migrations`, `supabase/seed.sql` | Ordered schema, policies, functions and synthetic fixtures |
| `docs/`, `tests/`, `.github/workflows/` | Living specifications, acceptance coverage and CI |
| `apps/mobile` | Planned Expo application once native delivery is scheduled |

Borrow the first reference repository’s route groups, typed reusable components, strict TypeScript, path aliases and README quick start. Its README lists prerequisites, install steps, environment setup and run commands. Borrow the second repository’s separation of user and operator journeys and its component, screen, navigation and integration boundaries. Use one CEDA web app with role-based routes initially. Treat both repositories as structural references. Create original project code and design during the event, record dependency provenance and keep reference code, assets and credentials out of the submission.

Use strict TypeScript, predictable naming, named domain states and explicit request validation. Keep routes thin, business logic in feature services and invariants in transactional database boundaries. Use server-only provider credentials and separate authorization from presentation. Map errors into actionable user messages and correlation IDs. The README should record actual commands as scaffolding lands, including dependency install, local database setup, migrations/seed, dev server, checks, build and redeploy. Pin the runtime and lockfile. Update documentation within the feature PR when behavior, routes or configuration change.

## 9. Data model and interoperability

| Domain | Core records | Invariants |
| --- | --- | --- |
| Identity | Profiles, organizations, memberships, role grants, guest identities | Account ownership and active scoped grants are checked on every protected operation. |
| Innovation | Applications, drafts, immutable versions, evidence, receipts, status events | Submitted version and receipt commit together. Each clean file belongs to its declared record. |
| Assessment | Panels, members, rounds, rubric versions, evaluations, ballots, decisions | Versioned evidence and policy. One eligible ballot per person per voting window. |
| Support | Conversations, messages, tickets, assignments, notes, escalation and closure events | One open ticket per handoff, single active owner, auditable queue order and immutable closed dialogue. |
| Operations | Notification outbox, delivery attempts, audit events, approved public content | Event identity and deduplicated delivery. Public aggregates and staff records use different read scopes. |

Start with domain commands for draft save, final submit, evidence response, review submission, vote, decision release, handoff, queue snapshot, ticket acceptance, message and closure. Each command defines caller scope, validated input, transaction outcome, idempotency behavior and emitted events. Use stable opaque IDs, UTC storage for timestamps and CAT display for local schedules. Version external contracts, separate event payloads from database rows and use explicit compatibility checks when switching providers. Provide scoped CSV reports with filters, definition, time window and access audit.

## 10. Security privacy and operational controls

- Verify identity and enforce staff MFA, record-level roles and RLS on normal routes, APIs, private storage and live channels. Test direct access by another applicant, an unassigned assessor, a support officer and an admin. Data administration alone grants no ordinary access to confidential records.
- Use private file buckets, upload allowlists, content checks, quotas and quarantine. Deliver only files that pass the scan workflow, through short-lived access granted after authorization. If scanning is unavailable, keep files quarantined and show the pending state. Use synthetic evidence for demos.
- Keep approved knowledge separate from confidential application records. Redact unnecessary personal data from telemetry and external AI inputs. Render chat as escaped text, apply rate limits and isolate internal notes. Record significant access, policy, assignment and release events with actor, target, timestamp and reason.
- Define access review, secret rotation, incident response, backup scope and restore tests. Track health and provider errors in the admin workspace. Use aggregate reports for operations and approved public metrics. Provide a documented second-approval path for high-risk changes.
- The organizers require alignment with Botswana’s Data Protection Act, 2024. Determine purpose, minimization, access, retention, disposal, rights handling and third-party processing with CEDA before live deployment. Record prototype controls and any production gaps as evidence. See source notes.

## 11. Delivery plan and engineering process

| Window in CAT | Milestone | Exit evidence |
| --- | --- | --- |
| First build | Public site and shared foundation | Seven routes, design review, responsive preview, working navigation and documented setup |
| Next integration | Identity, draft, evidence, submit and tracking | Synthetic individual and company drafts, private upload, receipt and status refresh |
| Parallel after the first website slice | Assessment, role controls and Optimus Prime support | Panel scoring and decision path, live ranked ticket with two officer sessions, closed history |
| 22 November target | End-to-end hardening | Permissions verified, test evidence, provider limits reviewed, accessibility and recovery checks |
| 23 November target | Package and rehearsal | Stable URL, source, README, manual, walkthrough, KYC and receipt evidence when submitted |

These are proposed remaining-work targets within the 13–23 November competition window. Check actual progress daily and protect functional judging flows before polish. Assign named owners at kickoff for web/design, backend/security, assessment, support, and QA/submission. Use small feature branches, issue IDs, screen IDs and reviewed pull requests. CI should run formatting/lint, TypeScript, targeted tests and production build. Apply database migrations to a preview or test database first. Test valid and denied access, concurrency and retries. Supply synthetic seed data and keep test credentials out of source and the public walkthrough.

Maintain `docs/Architecture.md`, versioned decisions, testing evidence, a user manual and submission inventory as implementation proceeds. Each issue should have a role, behavior, verification steps and a link to its companion spec. At merge, update the README or affected documentation and capture evidence for the demo.

## 12. Acceptance checks and judging demo

| Check | Expected result |
| --- | --- |
| Public navigation | All PUB routes work on phone and desktop; keyboard users can reach help and submit. |
| Draft and receipt | Return to a saved draft, validate applicable questions and submit twice without creating a second receipt. |
| Protected evidence | A second applicant and unassigned staff cannot retrieve another applicant’s private file. |
| Assessment | An assessor submits scores, peers see the intended snapshot, 2–2–1 blocks release and a valid authorized outcome updates the timeline. |
| Feedback loop | Naledi responds to a formal evidence request and the original evidence remains traceable. |
| Queue and recovery | Naledi sees rank five, leaves, returns and sees the correct rank. Preview does not claim. |
| Claim and capacity | Concurrent same-ticket claim has one winner. Two officers handle distinct cases. The limit also covers waiting states. |
| Live chat and closure | Named officer and full transcript appear in the same thread. Both can reply while open and both can read history after closure. |
| Dashboards and resilience | Counts match filtered records. A delivery retry leaves the core action intact. A reconnect refreshes state. |

Demo in this sequence. Open the public homepage and explain eligibility. Show Naledi saving and submitting a synthetic idea. Switch to assessor and manager sessions to demonstrate score, vote, feedback and release. Show the applicant’s tracking update. Then show a separate Naledi pre-application support enquiry with four seeded waiting tickets, leave and return, claim in an officer session, chat and close. End with scoped reports and evidence of role isolation. Report participation as applications and unique applicants, outcomes by authorized disposition, turnaround from receipt to release, and support timing from queued to first officer reply. Label demo data and any features still planned.

## 13. Competition package and decisions

The organizer deck sets the event for **13–23 November 2026 CAT**, with weekday availability **08:00–17:00 CAT**. Teams are responsible for timely delivery. The top five present in person, with all team members contributing to the presentation and Q&A. The written guideline places registration on 9–12 November and names Skillsranker, with `hackathon@bih.co.bw` as a secondary channel. The team previously recorded an email instruction. Verify the latest organizer direction, exact final cutoff and attachment format before final upload and retain delivery evidence. The registration dates and event window do not establish an exact submission hour.

| Deliverable | Submission check |
| --- | --- |
| Solution URL · mandatory | Clean browser opens the deployment and authorized judges can enter demo roles. |
| Walkthrough video · mandatory | Opens with reviewer permissions and shows working core journeys. |
| Source code · mandatory | Original event work, migrations, seeds and lockfile. Verify reviewer access and exclude secrets. |
| README and user manual | Reproduce setup and explain navigation, roles, actions and recovery. |
| Installation or executable files | Include for platforms submitted, or obtain confirmation of web delivery expectations. |
| Business KYC and technical proposal | Verify organizer form and latest instructions. Keep KYC within the authorized submission channel. |

Treat the organizing team’s eligibility rules for hackathon entrants separately from eligibility for future portal applicants. Follow event-only creation, code of conduct, confidentiality and affiliation declaration rules. The deck states that IP developed during the event for the winning company belongs to CEDA. Track contributions and approved third-party licenses. Check the final judging and packaging instructions with the organizers.

Decisions still open include verified public copy and eligibility policy, CEDA production rubric and quorum, official adjudication and release authority, priority and support hours, officer limits and retention, model provider, malware scanning and hosting region, external integrations, and the event’s final submission logistics. Demo configuration must be explicit and repeatable.

## 14. Source notes

- Project role specifications in `Our Vision`: `Innovator.md`, `Standard Assessor.md`, `Assessment Manager.md`, `Support Officer.md` and `Admin.md`.
- `Innovator and Public Website Screens/README.txt`, six boards and numbered screen assets. Public website board reviewed against PUB-01 to PUB-07 in the role specification.
- User-confirmed Naledi, Optimus Prime and Maseo support flow in the project brief.
- Organizer images supplied with the request: competition guidelines, challenge and expected outcomes, safeguarding, evaluation categories, rules and legal conditions, code of conduct and submission format.
- Local structural references: `Downloads/uber/uber-main` and `Downloads/UberClone-main/UberClone-main`. The first contributes route and developer setup conventions. The second contributes role surface and module organization.
- [Botswana Government Gazette, Data Protection Act 2024, Act No. 18 of 2024](https://itlawco.com/wp-content/uploads/2025/01/botswana-data.protection.act_.2024-website-copy.pdf).

