# Administration implementation

Updated 20 November 2026.

## Delivered slice

The web Admin workspace at /admin/ includes a role-checked overview, user search and pagination, Create User, role/sector assignment, lead-Assessor selection, sector create/edit/archive and authenticator enrollment/verification. The overview follows the supplied dashboard reference with a personalized greeting, compact metrics, traffic chart, Core Web Vitals, Optimus Prime health and recent activity. Sample chart values are clearly marked as preview data; active visitors and recent activity remain “awaiting data” until actual telemetry is connected. The desktop frosted-glass sidebar can be collapsed to icons or expanded to labels, with the preference saved in that browser. Small screens keep a horizontal section menu. The screen follows CEDA's white, navy, rust and warm neutral theme with restrained cards and rounded controls, keyboard skip navigation, semantic landmarks and reduced-motion styling. The Admin navigation is specific to the web portal; native mobile navigation will be designed per role later. The signed-in header identifies the verified administrator by name and email and provides logout. Support Officer and Assessor accounts have starter web destinations. Live telemetry, account lifecycle tools, audit explorer, full Optimus Prime controls and operational admin workspaces remain pending.

Optimus Prime's planned Admin guidance controls, AI safety boundaries, publishing flow and performance measures are documented in [Optimus Prime Administration](<Optimus Prime Administration.md>).

The correct Ceda Innovation Supabase project was not visible through the Supabase connection available during the dashboard update. Therefore live telemetry tables, collection, and Admin aggregate RPC were not changed. Do not use the preview figures for decisions. Connect the correct project before implementing live analytics.

The protected source of access is the user's database profile and sector grants. The caller's email or user-editable metadata cannot assign a role. Public registration still creates an Innovator.

## Where to find the code

| Location | Responsibility |
| --- | --- |
| src/publicSite/admin.ts | Admin web shell, role-specific navigation, overview, operational sections and reusable role fields |
| src/publicSite/assets/admin.js | Directory, sector forms, role changes, invitation submission and MFA interaction |
| src/publicSite/assets/admin.css | CEDA Admin layout, responsive behavior, keyboard focus and reduced-motion styling |
| scripts/buildPublic.ts | Static site build, public Supabase Auth configuration, separate account-creation flag and route security headers |
| src/publicSite/assets/activate.js | Sets the invited user's password and opens the role destination |
| src/publicSite/assets/signupApi.js | Verified identity/profile lookup for shared web sign-in |
| src/publicSite/assets/verifiedAccount.js | Maps protected roles to their web workspace |
| supabase/functions/admininvite/index.ts | Signed-in, Admin-authorized invitation endpoint using server credentials |
| supabase/migrations/20261120024337AdministrationFoundation.sql | Roles, sector scopes, invitation reservations, audit and protected actions |
| supabase/migrations/20261120024731AdministrationBoundary.sql | Private privileged implementations, public invoker wrappers and explicit direct-table denial |
| supabase/tests/administration.sql | Rollback-only hosted authorization/transaction checks |
| tests/adminInvitation.test.js | Mocked invitation HTTP boundary tests |

The Supabase CLI could not generate a migration locally because writing its telemetry file was denied. Local migration files match the successfully applied hosted migration ledger.

## Database and request contracts

Remote Procedure Call (RPC) means calling a database function through the API. Public RPC wrappers run with caller permissions and invoke narrowly granted private implementations. Each implementation rechecks the current active Administrator and a live Auth session.

| RPC | Input | Result and authorization |
| --- | --- | --- |
| admin_directory | search_text, page_number | Up to 25 profile/account summaries. Active Admin and live session required. |
| admin_sectors | Empty object | All sector definitions for Admin. |
| admin_save_sector | sector_name, sector_status, reason, optional sector_id | Sector ID. Create/edit/archive plus audit in one transaction. |
| admin_assign_role | target_id, new_role, lead, sectors, reason | Updates role and scope plus audit atomically. Requires MFA. |
| admin_prepare_invitation | address, display_name, new_role, lead, sectors, reason | Trusted pending invitation ID. Requires MFA. |

Roles currently supported on web are innovator, admin, assessor and support. Lead powers are a boolean capability restricted to assessor. Sector assignments are optional, including for Lead Assessors. When present, they describe expertise or assignment; assessment-specific authorization will be added with its workflows. The later OptionalAssessorSectors migration removes the original mandatory-sector checks from both role changes and invitations.

Direct client access to sectors, staff_sectors, staff_invitations and admin_audit is denied. The owner-only profiles policy remains in effect. Privileged actions use the protected RPCs. Sector archival preserves IDs and history.

## Create User flow

1. An Admin completes authenticator verification. The new access token carries the second-factor assurance level.
2. Create User posts to admininvite using that session token. The gateway verifies the token and the function checks the identity.
3. The preparation RPC rechecks active Admin, live session, MFA, role, lead flag, sector scope and reason. It reserves the invitation and records the actor.
4. The server calls the supported Supabase Auth invitation API. Its service credential stays in the function environment.
5. The user opens the email link. The confirmed-identity trigger applies the unexpired trusted invitation, sector grants and audit entry.
6. The activation page sets the password, then opens /account/, which checks the protected profile and sends the user to the matching workspace.

An invitation expires after 24 hours in the database. Roles are applied only when the invitation is consumed by its verified email identity and its creator is still an active Admin. Auth email-link expiration remains provider-controlled.

Repeated identical preparation by the same Admin reuses an unexpired reservation. If sending fails, the interface reports that delivery was not confirmed. Review provider state before retrying. Expired/changed invitations and advanced cancellation/recovery management remain pending. If Auth delivery partly succeeds, preserve the identity and inspect its state before attempting a new invitation.

## Security boundaries

- User creation and role assignment require Multi-Factor Authentication (MFA), enforced by the database.
- Admin reads and sector actions require a confirmed, active Admin with a live session.
- Role assignment rejects self-changes and preserves the final active Administrator.
- Lead grants require the Assessor role. Sector assignments are optional; archived/unknown sectors are rejected when supplied.
- Client code receives only a publishable key. The invitation function uses the existing server environment.
- Public endpoints expose invoker wrappers. Elevated implementations live in ceda_private with explicit grants and a fixed empty search path.
- Audit records preserve actor, action, target, reason and relevant before/after information.
- Names, emails and sector labels render as text in the Admin UI.
- Invitation/activation tokens and authenticator secrets must stay out of logs and analytics.

## Deployment and acceptance

The two migrations and admininvite function are deployed to Ceda Innovation. Gateway JWT verification is enabled. An unauthenticated call is expected to return HTTP 401. The dashboard was deployed to the production alias `https://ceda-innovation-portal-nine.vercel.app/` on 20 November 2026. The Admin route responds with HTTP 200 and the deployed policy allows the Ceda Innovation Supabase Auth host. Public signup remains disabled, while sign-in has the public Supabase configuration. The Vercel project has no saved environment variables; this static deployment used the existing local mobile publishable key and documented project URL at build time. Configure the public Supabase URL and key in the Vercel build environment before relying on future automated builds. Never put service-role keys or other server secrets in this static client configuration.

Add https://ceda-innovation-portal-nine.vercel.app/activate/ to Supabase Auth's approved redirect URLs before inbox acceptance. Verify the deployed activation page before sending real staff invitations.

The first Administrator was established on 20 November 2026 by promoting the existing confirmed, active account `autobotsdev49@gmail.com`. Supabase verification returned role `admin`, status `active` and `lead_assessor = false`. The one-time operation was recorded in `admin_audit` as `administrator_bootstrap`. The earlier rejected unauthenticated bootstrap endpoint was not deployed.

On 20 November 2026, the existing confirmed and active `tomsonntebang@gmail.com` account (Gorata Thomas) was assigned role `assessor` with `lead_assessor = true`. Creative Industries was created as a published sector and linked as Gorata's initial assignment. Both operator actions have audit records. The sector is optional for this role, and current sector assignments do not yet implement assessment case permissions.

The optional `admin@ceda.co.bw` account does not exist in Auth. If a separate institutional Admin account is approved later, run the existing script from a trusted PowerShell terminal, entering both values only in that terminal:

```powershell
$env:SUPABASE_URL = 'https://inzupertrdvlenrozqep.supabase.co'
$secretInput = Read-Host 'Supabase server secret key' -AsSecureString
$passwordInput = Read-Host 'Administrator password' -AsSecureString
try {
  $env:SUPABASE_SECRET_KEY = [System.Net.NetworkCredential]::new('', $secretInput).Password
  $env:CEDA_ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $passwordInput).Password
  node scripts/createAdministrator.ts
} finally {
  Remove-Item Env:SUPABASE_URL, Env:SUPABASE_SECRET_KEY, Env:CEDA_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
```

The secret must be the server secret or service-role key for this exact Supabase project, retrieved from its API Keys page. Do not paste credentials into chat or commit them. The script creates the Auth account, confirms it and verifies its Admin profile; it preserves the password if the account already exists. After running it, check that the account is active and Admin in the database and perform an actual sign-in. Rotate any password previously shared in conversation before a real deployment.

The Admin page includes MFA enrollment and verification. MFA recovery, factor cleanup, suspension/restoration controls, session management UI and audit explorer remain next tasks. Mobile continues its existing Innovator/Admin auth implementation until the planned native staff phase.

Run the following checks from the repository root.

```powershell
node --test tests/*.test.*
npm run build
```

Run supabase/tests/administration.sql using the connected SQL tool. It creates synthetic users, sessions, sectors, a lead assignment and a pending invitation inside a rolled-back transaction. It proves wrong-role denial, direct profile-write denial, the MFA gate, role/scope assignment, trusted confirmation, audit events and revoked-session denial.

Real Admin sign-in using `autobotsdev49@gmail.com`, authenticator QR scanning, invitation delivery, password setup and browser accessibility acceptance are pending. The latest security advisor returns only the existing leaked-password-protection warning.

The recorded automated run passes 31 tests. The website build generates 15 routes. The hosted invitation endpoint rejects a request without authentication with HTTP 401. Local preview checks cover the Admin, activation and staff routes plus their JavaScript, stylesheet and logo assets.

## Next developer handover

Complete frontend deployment, sign in with the initial Administrator, enroll the authenticator, then test one invited user per role with a controlled inbox. Record screenshots and exact failures. Finish invitation recovery, account suspension/restoration and the audit explorer before moving to Innovator drafts and submissions.


## Overview refinement, 20 November 2026

Completed locally: sidebar navigation now shows only its selected section, including direct links and browser back/forward. Overview contains metrics, charts and activity; user, sector, Optimus Prime configuration and account-security forms appear only in their own views. Repeated greeting, workspace-ready message and breadcrumb were removed; the date remains. Header search opens matching workspace sections or searches the protected user directory. Navigation moves keyboard focus to the selected heading.

Preview visits total 1,565, matching the seven chart bars. Active visitors and recent activities are populated with explicitly labelled sample data. Sample activities are fictional and contain no personal details. They do not update from real visitors yet. The chart height styles now live in the stylesheet so the strict Content Security Policy can render them. Live monitoring and audit integration remain pending. This refinement was deployed to production on 20 November 2026. Vercel reports READY.


## User management reference update, 20 November 2026

Completed locally: redesigned the user view with four summary cards, search and role/status filters, user initials, role/status badges, compact pagination and an Add user entry point. The invitation form opens on request and includes a Close control. Editing an account hides the creation form. Initials are decorative; real account names remain accessible text. No third-party avatar service or synthetic directory records are used.

Counts are calculated from the current 25-user RPC page, explicitly labelled as page counts. Name/email search remains server-side; role and status filters affect only the loaded page. No joined-date column is shown because the current RPC does not supply one. Previous is disabled on the first page; Next is disabled when fewer than 25 records return. Existing active Admin/session checks, MFA for invitations and permission changes, audit reasons and safe text rendering remain in force. Source: `src/publicSite/admin.ts`, `src/publicSite/assets/admin.js`, `src/publicSite/assets/admin.css`.

Validation: JavaScript syntax check and static build passed (15 routes). Browser/device acceptance and controlled invitation/MFA acceptance remain pending. This update has not yet been deployed. Next backend step: an Admin-only aggregate count and directory filters/pagination contract to support whole-directory totals and role/status search without fetching every account into the browser.


## Role badge colours, 20 November 2026

User directory role tags now distinguish Administrator (rust), Innovator (blue), Assessor (violet), and Support Officer (teal). Lead Assessor powers appear as a separate gold Lead tag beside the Assessor tag. Unknown roles use neutral grey. Each tag retains its text label so meaning does not depend on colour. CSS classes are assigned only from the known role allowlist; account values continue to render with textContent. Status colours remain separate from role colours. This is a visual change and does not modify permissions. Source: `src/publicSite/assets/admin.js` and `src/publicSite/assets/admin.css`. JavaScript syntax check and build passed; this change is local, not deployed.


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


## Sidebar fit adjustment, 20 November 2026

Removed the independently scrolling sidebar and its viewport height cap. Desktop navigation now uses compact rows and spacing to fit the current eleven destinations. Short desktop viewports get tighter spacing; below 520px viewport height the sidebar follows normal document scrolling so enlarged text and controls remain accessible without clipping. Small screens use a wrapping two-column menu instead of a horizontal scrolling strip. Collapse-to-icons remains available. Change is in `src/publicSite/assets/admin.css`. Build passed; browser and large-text acceptance pending. Local change, not deployed.


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

## Web administrator password provisioning, 20 November 2026

The web Add user modal now has one shared heading and Close control, plus a password input with visibility toggle. It calls admincreate instead of admininvite. This supersedes earlier invitation-only web form instructions. Existing invitation consumers remain supported.

admincreate validates the caller through Auth and delegates Admin/session/MFA/access validation to admin_prepare_invitation with whitelisted nonsecret fields. Its service-role key is server-only. It then creates an email-confirmed Auth account; existing trusted reservation triggers assign the requested role. The password is never sent to database RPCs or audit records and is cleared from the form after requests or modal close. Password policy: 12-128 characters, uppercase/lowercase/digit/symbol. Use an approved secure channel for delivering credentials. Public signup email verification remains separate.

Implementation and deployment checklist: see Current Progress.md > Administrator password account creation. Endpoint source and mocked tests are ready locally. Hosted deployment and real integration testing are blocked by missing permission on the connected Ceda Innovation project. Do not treat this as an operationally complete feature until the deployed database triggers, MFA enforcement, account creation and shared login have been verified. No production accounts were created by this change.

Admin modal convention: the shared dialog owns its only visible title and Close action. Do not add duplicate panel titles or dismissal buttons. Keep form submit actions, distinct subsection headings and Back navigation. Panel heading metadata used by scripts must stay hidden; preserve existing accessible labels. See Current Progress.md, Shared modal heading and close cleanup (20 November 2026).
