# Progress and next steps

The [End To End Development Plan](<End To End Development Plan.md>) is the active detailed checklist for delivery by 22 November 2026. It expands this snapshot into role-specific web, database, backend, security and mobile work.

Updated 20 November 2026.

The web Admin foundation now includes the directory, role/lead/sector assignment, sector editing, MFA interaction, invitation endpoint and activation page. The corresponding migrations and protected endpoint are deployed. The confirmed, active account `autobotsdev49@gmail.com` is the initial Administrator. See [Administration Implementation](<Administration Implementation.md>) for source locations, security, testing and remaining acceptance. The table below preserves the preceding baseline.

The Admin web portal now has a responsive CEDA-styled shell, frosted desktop sidebar, compact mobile section navigation, overview dashboard, user and sector management surfaces, Optimus Prime placeholder and account security section. The overview includes clearly labelled sample charts for traffic, web vitals and AI health; active visitor and recent activity values remain marked as awaiting telemetry. This is the Admin website navigation, not the separate role-specific bottom navigation planned for native mobile. See [Administration Implementation](<Administration Implementation.md>) for the current code map and acceptance gaps. Optimus Prime's planned Admin controls, dashboard preview and telemetry boundary are in [Optimus Prime Administration](<Optimus Prime Administration.md>).

On 20 November 2026, the overview was redesigned around the supplied dashboard reference. It now prioritizes portal visits, active visitors, Core Web Vitals, Optimus Prime response health, and recent activity. Chart figures are illustrative sample data. Live collection still needs the correct Ceda Innovation Supabase project connection and a privacy-reviewed telemetry backend; do not treat the preview figures as real usage. The Supabase account available for this change did not expose the Ceda Innovation project, so no schema or live database was changed.

The updated Admin dashboard was deployed to the production Vercel alias `https://ceda-innovation-portal-nine.vercel.app/` on 20 November 2026. The deployed Admin route and public Supabase Auth configuration returned HTTP 200; the response policy permits calls to the Ceda Innovation Supabase host. Public account creation remains disabled (`CEDA_SIGNUP_ENABLED=false`); existing account sign-in remains configured. The Vercel project has no saved environment variables, so this static deployment used the local mobile app's existing publishable key and the documented Ceda Innovation project URL at build time. Keep the publishable key out of documentation and source. To reproduce deployments, configure the two public Supabase variables and the signup flag in a secure local environment or the Vercel build environment.

Assessor sector assignment is now optional. `tomsonntebang@gmail.com` (Gorata Thomas) is an active Lead Assessor with Creative Industries assigned as an initial sector; see [Administration Implementation](<Administration Implementation.md>).

## Frontend

| Area | Delivered | Remaining |
| --- | --- | --- |
| Public website | Public information pages, responsive navigation, shared theme, imagery, footer and links into authentication. | Content review and full accessibility acceptance. |
| Website authentication | Sign-up, sign-in, verification, retry feedback, success flow and temporary account home. | Recovery workflow, device acceptance and deployed acceptance of the latest changes. |
| Mobile public journey | CEDA splash with fade, illustrated onboarding, welcome, native authentication forms and keyboard-safe scrolling. | Check smaller devices, large text and assistive technology. |
| Mobile verification | Verification screen, 60-second resend countdown, confirmed identity check, account-created confetti and Home. | Controlled inbox test, resend delivery and reduced-motion acceptance. |
| Role destinations | Shared login accepts active Innovators and Administrators. Web sends admins to /admin/ and Innovators to /account/. Mobile selects Administrator home or Innovator Home. | Build each role's working dashboard. Both destinations currently use starter screens. |

## Backend

| Area | Delivered | Remaining |
| --- | --- | --- |
| Identity | Supabase Auth, email confirmation and automatic Innovator provisioning after confirmation. | Real inbox acceptance and password recovery. |
| Profiles | Profiles table with owner reference, display name, active/suspended/closed status, role and timestamps. | Profile editing through scoped APIs and account lifecycle administration. |
| Access control | Row Level Security (RLS) restricts profile reads to the active owner. Clients cannot update roles or status. Allowed roles currently include innovator and admin. | Add database authorization for each new admin operation. A route redirect does not grant database privileges. |
| Security | Client input validation, guarded auth requests, rate-limit feedback, token checks, session expiry and sign-out. | Multi-Factor Authentication (MFA) for privileged access, recovery acceptance and further abuse controls. |
| Administrator bootstrap | The existing confirmed account `autobotsdev49@gmail.com` was promoted to active Admin on 20 November 2026 and the bootstrap was recorded in `admin_audit`. | Complete real sign-in, authenticator enrollment and Admin route acceptance. |
| Innovation workflow | Domain logic and synthetic fixtures exist for assessment, guidance and experiment allocation. | Submission tables, private attachments, persistence, reviewer assignment, messages and workflow integration. |
| Services | Stack decisions recorded for Gemini and EmailJS. The CEDA Android app is registered in Firebase project `bw-gov-schools-2026`; Expo references its Google services configuration and local Firebase binding is present. | Configure protected FCM sender, device token/permission handling and real-device delivery; configure EmailJS and Gemini within free tier limits. |

## Role-Based Access Control

Role-Based Access Control (RBAC) decides which screens and operations an authenticated account can use.

The trusted source is public.profiles.account_role. Sign-up always provisions innovator. Only a trusted server administrator can assign admin. The email address and editable signup metadata never grant admin rights. Unknown roles, inactive accounts and unconfirmed identities are rejected.

Web rechecks the owner profile on /account/ and /admin/ and redirects to the matching destination. Mobile checks the profile before opening its role destination. Starter screens display account information only. User management, sector management and assessment operations require their own database authorization before implementation.

## Administrator account setup

The project owner selected the existing confirmed account `autobotsdev49@gmail.com` as the initial Administrator. Credentials are excluded from documentation and source. The previously proposed `admin@ceda.co.bw` account was not created.

Automatic approval review rejected a temporary privileged account-creation endpoint. The repository includes scripts/createAdministrator.ts for execution in a trusted terminal using the supported Supabase Admin API.

Set SUPABASE_URL to https://inzupertrdvlenrozqep.supabase.co and supply SUPABASE_SECRET_KEY and CEDA_ADMIN_PASSWORD through the terminal environment. Use a secret or service role key solely in the trusted terminal. Then run the following from the project root.

```powershell
node scripts/createAdministrator.ts
```

The script creates an explicitly confirmed administrator identity using the supplied password, then assigns the protected profile role and verifies it. Reruns find the existing identity and preserve its password. If role assignment fails after account creation, rerun to complete the profile update. Public registration still requires inbox confirmation.

## Next implementation order

1. Complete administrator bootstrap and test both roles through the shared login. Verify that Innovators cannot view another profile, change roles or access admin operations.
2. Build the administrator workspace. Start with scoped user listing, invitations, role assignment, suspension, session management and reset-email requests. Record privileged changes in an audit log.
3. Define sectors and build the submission database. Start with applicant ownership, draft/submitted states, sections and private supporting files.
4. Build Innovator web and mobile dashboards and connect the first draft submission with autosave.
5. Add review assignment, status history, released feedback and notifications.
6. Integrate Optimus Prime with approved guidance and human support handoff.
7. Complete accessibility, end-to-end acceptance, deployment checks and handover.

## Validation and handover

Run node --test tests/*.test.* from the root, npm run build for the public website and npm run typecheck from mobile. Auth tests simulate provider responses. Physical-device and real inbox tests must be recorded separately. Previous Android keyboard checks confirmed a visible Confirm password field with the keyboard open. Sign-in and iOS keyboard acceptance are pending.

The website currently uses the repository's static public renderer. The chosen Next.js architecture remains pending implementation. The latest source changes require deployment before they appear on the public Vercel website.


## Overview refinement, 20 November 2026

Completed locally: sidebar navigation now shows only its selected section, including direct links and browser back/forward. Overview contains metrics, charts and activity; user, sector, Optimus Prime configuration and account-security forms appear only in their own views. Repeated greeting, workspace-ready message and breadcrumb were removed; the date remains. Header search opens matching workspace sections or searches the protected user directory. Navigation moves keyboard focus to the selected heading.

Preview visits total 1,565, matching the seven chart bars. Active visitors and recent activities are populated with explicitly labelled sample data. Sample activities are fictional and contain no personal details. They do not update from real visitors yet. The chart height styles now live in the stylesheet so the strict Content Security Policy can render them. Live monitoring and audit integration remain pending. This refinement was deployed to the production Vercel alias on 20 November 2026 (deployment dpl_DmDr5SSV6qtt17PZNnw2GBzRJ3Qf). Vercel reports READY.


## Localhost sign-in configuration, 20 November 2026

Completed: the root gitignored `.env.local` now contains the existing Ceda Innovation public Supabase URL and publishable key, matching the mobile environment. `npm run dev` builds the site and opens the local preview server at `http://127.0.0.1:3000/`; `http://localhost:3000/signin/` uses the same backend and role checks as production. The signup flag controls account creation independently of sign-in. It remains false. No private server credentials were copied or committed.

Verified: build succeeds and localhost returns HTTP 200 for sign-in, Admin, Admin stylesheet and Admin script; the served client configuration contains the expected Supabase project. A real credential login was not performed. Run `npm run dev` again after changing environment values. Keep `.env.local` private; collaborators copy `.env.example` and supply the team's public Supabase values locally.


## User management reference update, 20 November 2026

Completed locally: redesigned the user view with four summary cards, search and role/status filters, user initials, role/status badges, compact pagination and an Add user entry point. The invitation form opens on request and includes a Close control. Editing an account hides the creation form. Initials are decorative; real account names remain accessible text. No third-party avatar service or synthetic directory records are used.

Counts are calculated from the current 25-user RPC page, explicitly labelled as page counts. Name/email search remains server-side; role and status filters affect only the loaded page. No joined-date column is shown because the current RPC does not supply one. Previous is disabled on the first page; Next is disabled when fewer than 25 records return. Existing active Admin/session checks, MFA for invitations and permission changes, audit reasons and safe text rendering remain in force. Source: `src/publicSite/admin.ts`, `src/publicSite/assets/admin.js`, `src/publicSite/assets/admin.css`.

Validation: JavaScript syntax check and static build passed (15 routes). Browser/device acceptance and controlled invitation/MFA acceptance remain pending. This update has not yet been deployed. Next backend step: an Admin-only aggregate count and directory filters/pagination contract to support whole-directory totals and role/status search without fetching every account into the browser.


## Sector management reference update, 20 November 2026

Completed locally: sector view now follows the user-management visual style. It includes real total/published/draft/archived sector summary cards, name search, status filter and a directory with per-sector View and Edit actions. Add sector opens the creation form. Each sector detail includes application outcome slots and a dedicated applications area. Creation, rename, publish/draft and archive continue through the existing protected `admin_save_sector` RPC with an audit reason; no direct table writes were added. Archive retains historical sector identity. Forms support close/cancel and return keyboard focus to the originating control. Labels and database values render with textContent and status CSS uses an allowlist.

Pending: live Applications, Approved, In review and Rejected counts and individual application management. There are no application submission tables in the current migration set, and `admin_sectors` returns sector metadata only. These counters display a dash (unavailable), explicitly distinguished from zero. No invented application records or inferred approval powers were added. Build the applicant-owned submissions/status model and assessment authorization first, then expose Admin-only per-sector aggregates and paginated application reads. Preserve unmapped workflow states such as draft/submitted/withdrawn separately; do not assume all applications equal approved plus in-review plus rejected. Decide whether Admin can only inspect cases or perform assessment actions before adding action permissions.

Sources: `src/publicSite/admin.ts`, `src/publicSite/assets/admin.js`, `src/publicSite/assets/admin.css`. JavaScript syntax check and build passed (15 pages). Real browser/keyboard acceptance and privileged save/invitation acceptance remain pending. This sector update is local and has not been deployed.


## Optimus Prime design and modal interactions, 20 November 2026

Completed locally: Optimus Prime dashboard with sample request/success/latency/handoff metrics, a response-time chart, reliability ring and a performance detail table. Modal workspaces let Admins prepare tone, answer length, instructions, human-support triggers, an approved source URL, reviewed knowledge notes and example questions. Draft review renders those values as text. Drafts remain only in memory in the current tab and clear on reload; no prompt is sent to Gemini, URL fetched, model trained, settings published, or server data persisted. Keep draft wording explicit until shared API, approved knowledge storage, MFA-gated publishing, version history and audit are implemented. Successful response status alone is not answer accuracy.

User creation/access editing, sector details/editing/creation and authenticator management now use one reusable native HTML dialog. HTML dialog means a browser-provided modal with background interaction disabled and keyboard focus contained inside it. Close and Escape return panels to their original locations and restore focus when the trigger still exists. Escape is blocked during a pending privileged request. Dialog messages expose validation/network feedback without hiding it behind the overlay. Forms retain the existing protected RPC, MFA and audit boundaries. The dialog is inside the verified workspace and closes when section navigation changes. No duplicated forms or IDs are introduced.

Source: `src/publicSite/admin.ts`, `src/publicSite/assets/admin.js`, `src/publicSite/assets/admin.css`. JavaScript syntax and build checks passed. Browser acceptance is pending (Playwright is not installed): check opening/closing each dialog, tab containment, Escape, focus restoration, validation/error messages, screen readers, large text, small screens, and editing from sector details. Latest changes are local and have not been deployed.


## Applications and assessment team interface, 20 November 2026

Completed locally: Applications and Assessment teams are independent sidebar views. Applications provides summary cards, name/reference/applicant search, sector/status filters, clear-filters, an empty state and a read-only detail modal with metadata, summary and sample progression. Assessment teams provides assessor/lead role tags, active/total workloads and per-assessor assignment modals. Fixtures are explicitly fictional, tagged Sample, and isolated from real users, sectors and database reads. Active workloads count assignment records in review (the same case can have multiple assessors). Summary cards cover the whole sample dataset; the directory result count follows filters.

Source: `src/publicSite/adminOperations.ts` (markup), `src/publicSite/assets/adminOperations.js` (fictional fixtures and interactions), `src/publicSite/admin.ts` (navigation), and `src/publicSite/assets/admin.css` (style). Build and local preview asset lists include the new module. Shared modal behaviour lives in `src/publicSite/assets/admin.js`. All dynamic text uses textContent. There are no new write APIs, approval controls, assignment mutations, evidence downloads or assessment permission grants.

Pending: real applicant-owned submission schema, private evidence, immutable submitted snapshots, assessment assignment authorization, scoped paginated reads, conflict handling and status/release rules. Connect the interfaces only after those policies are implemented. Admin oversight does not confer assessment/release powers. Browser/device and modal acceptance remain pending. These screens are interface previews, not completed application or assessment workflows, and have not been deployed.


## Admin startup repair, 20 November 2026

Reproduced on localhost: `/admin/` and `/assets/admin.js` returned HTTP 200, but `/assets/adminOperations.js` returned 404 because the running preview server retained an older explicit asset allowlist. The browser's static module import failed before any session verification could run, leaving the initial checking message visible.

Fixed: the static build includes the operations implementation directly in the Admin entry and wraps startup/dependency loading with visible failure feedback. The source modules remain separate for maintenance. A verified Admin can now see the workspace before optional user/sector reads finish; failed directory reads report an error without hiding the entire workspace. No access checks were relaxed. AI draft controls use namedItem for the field named length to avoid collision with the form controls collection's length property.

Verified the build and generated JavaScript syntax, and fetched the localhost Admin entry to confirm the operations implementation and error handling are served without the failing static import. Real credential/browser acceptance and production deployment remain pending for this repair. Reload the local page to load the rebuilt entry; restart npm run dev when changing preview server routes.


## Overview interactions and reporting preview, 20 November 2026

Completed locally: reporting period (Today, Last 7 days, Last 30 days), Botswana-time preview refresh indicator, clickable application/unassigned/session/page-view cards, responsive page-view bars, application outcome meters, website/AI health snapshots, Needs attention and recent events. Detail actions use the shared native dialog. Application cards open the directory with period/status/unassigned filters applied; Clear filters resets all of them. Counts use the same fictional applications as the directory. Exact traffic values are available in a modal so chart interpretation does not depend on colour or pointer hover. Latest active/health/support/delivery snapshots are explicitly independent of the date-range filter. Refresh redraws the same fixtures; it does not make a telemetry request or claim a fresh live measurement.

The preview uses a fixed 30-day series ending 20 November 2026 and four fictional operational events. No data is seeded into production. Activity history is explicitly a sample feed, not the real audit explorer. Support/delivery detail modals explain the pending live queues. Source markup: `src/publicSite/adminOverview.ts`; interactions and fixtures: `src/publicSite/assets/adminOverview.js`; shared application fixtures: `adminOperations.js`. The build bundles both interaction modules into the Admin entry to preserve the earlier missing-module fix. Live application summaries, protected audit feed, privacy-reviewed session collector, web performance/error telemetry and server-side AI metrics remain required before operational completion. Per-panel live loading/error/retry handling must be implemented with those API connections.

Build and JavaScript syntax checks pass. Browser/assistive-technology acceptance and deployment remain pending. Confirm period totals, detail dialogs, filtered application navigation, Today empty state, 30-day chart, keyboard focus and mobile layouts during acceptance.


## Dedicated Admin insight screens, 20 November 2026

Completed locally: separate sidebar destinations for Portal analytics, Website health, Admin follow-up and Activity log. Overview traffic opens Analytics; AI performance opens Optimus Prime; website health opens Health; follow-up opens its dedicated list; recent events open Activity log filtered by affected record. Detailed records still open accessible modals inside these screens.

Analytics has a reporting period, page-view line chart, exact daily table, sample device ring and popularity meters. The traffic series matches Overview for the same period. Device shares/popularity are explicitly illustrative fixed snapshots. Health has metric summaries, a sample loading-time line trend, metric definitions and a reported-issues link. Admin follow-up is limited to bugs, support escalations and service/delivery failures, with search/type/status/priority filters and reporter/owner details. Assessor workload tasks are excluded from that follow-up list. Activity log shows fictional named actor, role, action, record, date/time in Botswana and a detail entry; search and role filters work. All dynamic fields are rendered as text.

Live analytics collectors, health measurements, issue mutations and protected actor-linked audit reads remain pending. Sample records are not database audit evidence or real incidents. No new authorization powers or backend writes are introduced. Sources remain `adminOverview.ts`, `assets/adminOverview.js`, `admin.ts` and `assets/admin.css`. Build/syntax and static navigation checks pass; browser/device acceptance and deployment remain pending.


## Revised application authority, 20 November 2026

This decision supersedes earlier manual-assignment requirements: every active Assessor receives access to each submitted application by default, unless excluded by a Lead Assessor for that application. Sector membership does not restrict this access. Admins inspect scores/votes/comments read-only and handle technical issues. Admins may correct submitted information and intervene on status (In review, Approved, Rejected). Admins do not edit assessor scores or manage assessment exclusions.

Completed in the sample interface: removed unassigned queue and manual reviewer-assignment wording; added included/excluded assessor visibility, Admin correction/status forms, required reasons, status confirmation, preserved original submission, version checks, revision before/after snapshots, intervention provenance and technical issue draft. Changes affect this tab only and reset on reload. Overview counts update from the shared sample records. No notifications or support tickets are sent. No real submission records or database permissions are changed.

Rules live in `src/publicSite/assets/applicationAdministration.js`, with focused tests in `tests/applicationAdministration.test.js`. The browser passes a sample actor/role for demonstration only; this is not authentication or production authorization. Production services must derive actor, role and assurance from the verified session; enforce access/exclusions in database policies and evidence storage; atomically preserve original, revision/status change, audit and notification outbox; reject stale versions; flag affected assessments for review; and notify Innovator and assessors of interventions. Exclusion changes must be Lead-only, reasoned and audited. Active/new assessor access should follow the default rule without a manual assignment backlog.

The existing Ceda Innovation connection remains unavailable through the current linked database accounts; no hosted submission migration or API deployment has been performed. Real submission persistence, assessment authorization, private evidence, notification delivery and end-to-end acceptance remain open. Build and focused domain tests pass. These changes are local and not deployed.


## Application detail modal refinement, 20 November 2026

Completed locally: wider responsive application detail modal with a compact title/status/reference/revision header, submitted-by/date summary and edit/status/issue actions. Five content tabs: Submission, Evidence, Assessment, History and Technical issues. Tabs support roving focus, Left/Right arrows, Home/End, selected state and labelled panels. Reopening an application resets to Submission and focuses its heading. Existing native dialog provides background isolation and focus containment.

Submission shows available sample metadata and summary without inventing missing full form sections. Evidence explains protected preview/download integration pending. Assessment lists included/excluded assessors, with scores/comments/votes read-only and pending real records. History lists interventions with actor and time; Compare submission revisions opens the existing before/after sample history. Technical issues shows per-application drafts. Edit/status/history/issue forms have Back to application. Admin permissions and sample-only persistence boundaries remain unchanged.

Sources: `src/publicSite/adminOperations.ts`, `src/publicSite/assets/adminOperations.js`, `src/publicSite/assets/admin.js`, `src/publicSite/assets/admin.css`. Build, generated JavaScript syntax, four application-domain tests, five-tab/control relationships and unique HTML ID checks passed. Real browser/keyboard, screen-reader and mobile visual acceptance remain pending. Local change, not deployed. Database persistence, protected evidence access, full submission sections, real assessment results and notifications remain open.


## Admin reported-issue role and theme correction, 20 November 2026

Supersedes earlier Report technical issue requirements for Admin: Admin views reported matters; Innovators/staff reporting flows create them. Removed application report buttons, report form and sample issue-creation handler. Application Technical issues now shows linked reported records (reference, description, reporter, date, priority, status and owner) with a link to filtered Admin follow-up. No linked reports yields an explicit empty state. Reports remain sample data; backend intake, updates and persistence remain pending.

Web Admin filled primary buttons now match mobile/theme.ts and AdminWorkspace: rust #9A3D2B, pressed/hover #7B3123, white text and pill corners. Active navigation uses the same rust with a light tint. Secondary buttons retain the amber hover, while role/status/chart colours retain their informational purpose. Sources: adminOperations.ts, assets/adminOperations.js and assets/admin.css. Build and JavaScript syntax checks passed; not deployed. Browser acceptance remains pending.


## Lead Assessor workspace ownership, 20 November 2026

Removed Assessment teams from the Admin web navigation, section markup and initialization code. This supersedes the earlier standalone Admin assessment-team preview. Team coordination, workloads and application exclusions belong in the future Lead Assessor workspace. Admin still inspects included/excluded assessors through Application details > Assessment and manages staff accounts/Lead grants through Users and access. No Lead workflow or permission was added by this navigation removal. Old #teams links safely fall back to Overview using the existing allowed-section check. Build passed; local change, not deployed.

## Administrator password account creation, 20 November 2026

Completed locally: Users and access > Add user now uses one shared Create user dialog heading and one Close button. The form includes a masked password with an accessible eye toggle. Create account replaces the invitation submit action. Existing role, Lead powers, optional sectors and audit reason remain.

Source locations: src/publicSite/admin.ts (form); src/publicSite/assets/admin.js (validation, submission, password clearing); src/publicSite/assets/admin.css (eye control); supabase/functions/admincreate/index.ts (privileged account endpoint); tests/adminCreation.test.js (mocked endpoint security checks); supabase/tests/admin_password_creation.sql (rollback-only database integration check, not executed in this session).

The admincreate Edge Function requires a verified caller and the existing admin_prepare_invitation database authorization: active Admin, live session and multi-factor authentication (MFA). Only after authorization does its server-held service key call Supabase Auth Admin to create the email-confirmed account. Existing confirmed-user triggers consume the protected role reservation and provision the profile. Public self-registration still requires email verification. Admin-created accounts can use the supplied password immediately after successful creation. Share credentials only through an approved secure channel.

Passwords require 12-128 characters, uppercase, lowercase, a number and a symbol. They are sent to Supabase Auth only, never included in database reservation/audit arguments, response messages or application logs. The browser clears the password after a request and on closing the dialog. Account creation failures retain reservations for reconciliation: inspect the directory before retrying. This workflow supersedes the invitation-only default for the web Create user modal. The existing admininvite endpoint is retained for separate invitation consumers.

Deployment status: NOT deployed. The connected Supabase account denied access to Ceda Innovation (project inzupertrdvlenrozqep); no hosted changes were made. Next: obtain project access, verify deployed reservation/profile triggers match source, run the rollback-only SQL check in a suitable test environment, deploy admincreate with JWT verification enabled, then validate MFA denial/success, each role and shared login using synthetic accounts. Browser, keyboard, screen reader and live end-to-end acceptance remain pending. Vercel deployment is also pending. Never mark live password account creation complete until those checks succeed.

Validation for this change: npm test passed 49/49 tests (including five account endpoint checks); npm run build built 15 pages; node --check dist/assets/admin.js passed. These are local checks, not hosted integration or visual acceptance.

## Shared modal heading and close cleanup, 20 November 2026

Completed locally: every Admin web dialog uses the single shared modal header and Close control. Removed redundant sector Close details, Close form and Cancel controls, and user-access Cancel. AI guidance/knowledge/draft/performance, access editing, sector details/editor, authenticator, application correction/status/history and Overview detail dialogs no longer display a second title. Existing panel title metadata is hidden where used for accessible labels or title lookup. Application and sector names appear as the shared dialog title; user access includes the user's name. Content subsection headings and Back to application navigation remain because they serve different purposes.

Shared dialog heading can receive programmatic focus when a former panel heading is hidden. Native dialog focus containment, Escape dismissal, busy protection, password clearing and return focus remain in place. No backend permissions or mobile screens changed. Sources: src/publicSite/admin.ts, adminOperations.ts, adminOverview.ts and their assets/admin.js, adminOperations.js, adminOverview.js modules.

Validation: 49/49 automated tests passed; 15-page production build and JavaScript syntax passed; generated Admin markup checked for one shared heading/Close control and unique IDs; removed control listeners checked. Browser/device and screen reader acceptance remain pending. Changes are local; not deployed.

## Admin web surface colours, 20 November 2026

Completed locally: changed the Admin web shell to a white base matching the mobile palette. Replaced green tinted fills used for general containers, draft explanations, Website health metric definitions, tab rails, empty states, issue rows, sector summaries, search and overview interactions with white or warm neutral. Kept green for meaningful active/published/approved status badges and small icon or status accents. Website health explanation entries are white. Sources: src/publicSite/assets/admin.css and src/publicSite/adminOverview.ts. Production build passed (15 pages). Visual review on real desktop/mobile screens and deployment remain pending.

## Admin chart and text colour alignment, 20 November 2026

Completed locally: removed remaining decorative teal and green from general Admin chart bars, AI trend and donut, analytics ring and page metrics, general explanation labels, application details and interactive arrows. These now use CEDA rust (#9a3d2b), amber (#d39b3b), dark ink and warm neutral backgrounds. Green remains for status meaning (active, published, approved, live indicators), success states and icon accents; blue remains where it identifies a role or submission status. Website health explanation entries remain white. Source: src/publicSite/assets/admin.css. The production build generated 15 pages successfully. Browser contrast/visual review and deployment remain pending.

## Admin follow-up queue and issue actions, 20 November 2026

Completed locally: restored the overview interaction module after an interrupted file write, then added Open/Investigating/Waiting/Resolved status summary filters, owner filtering, reference/title/reporter search, priority and type filters, a clearer queue with owner and reported time, and a detail modal. The detail shows report, steps, reporter, owner, priority, status, history, and a linked application button where a sample application is associated. Admin can choose an owner, move the sample status, and add an internal investigation note with a required reason; each update appends an actor/time entry and updates the queue and Overview attention counts in this browser tab. Empty results explain how to recover. Delivery details explain why a retry is unavailable. User replies and secure attachments remain unavailable rather than claiming delivery.

This is an interactive preview only: four fictional records, no persistence, audit service, staff directory assignment, reporter message, notification retry, protected attachment or live issue intake. The client-side actor is a sample label, not a verified identity. Before production, implement protected issue tables and per-issue event history, Admin-only authorized mutations with actor identity derived from a verified session, controlled staff ownership, linked record access, reporter-visible messaging separated from internal notes, delivery history and idempotent retries, plus loading/error/empty states. Only after database access and server endpoints exist can these actions be considered operational. The connected Ceda Innovation Supabase project is still unavailable to this session; no backend was deployed.

Sources: src/publicSite/adminOverview.ts, src/publicSite/assets/adminOverview.js, src/publicSite/assets/admin.css. JavaScript syntax, 15-page build and 49 automated tests passed. Manual browser, keyboard/screen reader review and deployment remain pending.

## Admin follow-up visual severity, 20 November 2026

Completed locally: the follow-up directory now displays written labels inside colored badges for type (Bug, Support, Delivery), priority (High, Normal) and status (Open, Investigating, Waiting, Resolved). High priority uses a strong red tint and border; amber identifies investigation and delivery, purple identifies waiting, green is reserved for resolved/success. Badge text remains visible for color-blind users and screen readers. The four status summary counts retain their labels and selected filter outline. Source: src/publicSite/assets/adminOverview.js and src/publicSite/assets/admin.css. Changes are local and not deployed.

## Administration governance workspace preview, 20 November 2026

The original Windows project workspace is reconnected. Local Admin navigation and sections have been added for Content management, Notifications, Feedback, Audit logs, Reports, Settings and My account. Content has public page/FAQ/announcement/partner tabs and tab-only draft preparation. Notifications has tab-only announcement/template drafts and an explicit delivery-unavailable state. Feedback displays two labelled sample suggestions. Audit logs expressly indicate no protected explorer is connected; search is disabled rather than presenting fictional activity as evidence. Reports show categories and disabled export scope until protected source data exists. Settings identifies required policy versioning, review, audit and rollback. My account links to the existing authenticator screen and explains missing recovery/session endpoints; an invalid password-reset route was removed. All tab draft and sample displays are illustrative and disappear on reload. No email/push was sent and no production data was changed.

Sources: src/publicSite/adminGovernance.ts, src/publicSite/admin.ts, src/publicSite/assets/admin.js. Validation after reconnection: npm run build generated 15 pages, npm test passed 49/49, generated Admin JavaScript syntax passed. Real browser/assistive technology review, complete protected server workflows, Supabase access and deployment remain pending. Do not classify any of these sections as operational until server-side authorization, data storage, audit, messaging, exports and integration acceptance have been implemented and verified.

## Admin governance and audit checkpoint, 20 November 2026

Seven local Admin sections exist in `src/publicSite/adminGovernance.ts`. The new protected audit explorer in `src/publicSite/assets/admin.js` searches `public.admin_audit_feed` with 25 rows per page, displays actor/time/action/record/reason and reports unavailable or empty states. The database migration `supabase/migrations/20261120230000AdministrationAudit.sql` limits search/page input, checks active Admin and live session, and returns only selected audit fields. It has NOT been applied to the hosted project, so the live audit explorer will report an unavailable state until deployment. Content, notification and feedback examples remain tab-only previews. Reports, settings and personal account actions need protected services. Detailed handoff and order of work: `Development Pack/docs/Admin Governance Delivery.md`. No production notification, publication, export or security setting was changed.

## Admin navigation consolidation and governance UI alignment, 20 November 2026

Completed locally: consolidated the Admin web sidebar from 16 items down to 11 focused destinations and aligned all newly created governance screens with the existing portal UI pattern (full-width layout, `.admin-users-heading` with top-right CTA, 4-card `.admin-user-stats` with `.admin-user-stat-icon` badges, `.admin-surface.admin-directory-surface` with search SVG toolbars, status pill badges and `.admin-overview-panel` cards):

- **Notifications**: lives exclusively as the notification bell (`[data-open-notifications]`) in the top header. Clicking the bell opens the Notifications dialog with 4 summary cards, an Inbox & delivery alerts tab, an Event templates directory tab and a draft composer with back navigation.
- **Account & settings (`#settings`)**: combines Profile (`#account`), Account security (`#security`) and Portal settings (`#settings`) into one unified page with tabs for `Profile & sessions`, `Account security (MFA)` and `Portal policies & settings`, plus a top-right `Manage authenticator` CTA and clickable header identity.
- **Audit logs (`#audit`)**: merges `Activity log` (`#activity`) and `Audit logs` (`#audit`) into one unified page with 4 summary cards and segmented tabs for the `Protected audit log` (`admin_audit_feed` RPC) and `Portal activity stream (Sample)`.
- **Analytics & reports (`#analytics`)**: merges `Reports` (`#reports`) into `Analytics & reports` with 4 summary cards, traffic/device charts, submission pipeline breakdown and report package status.
- **Admin follow-up (`#followup`)**: incorporates user `Feedback` (`#feedback`) as a `Feedback` filter category alongside `Bug`, `Support` and `Delivery` in the unified triage queue.
- **Content management (`#content`)**: retains its own destination for public pages, FAQs, announcements and partners, upgraded to the full 4-stat card + `.admin-directory-surface` table and filter bar layout.

Legacy hash links (`#activity`, `#account`, `#security`, `#reports`, `#feedback`) automatically route to their consolidated destination and activate the matching tab or filter. Sources: `src/publicSite/admin.ts`, `src/publicSite/adminOverview.ts`, `src/publicSite/adminGovernance.ts`, `src/publicSite/assets/admin.js`, `src/publicSite/assets/adminOverview.js`, `src/publicSite/assets/admin.css`. Production build generated 15 pages and 49/49 automated tests passed.
