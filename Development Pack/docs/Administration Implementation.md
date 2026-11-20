# Administration implementation

Updated 20 November 2026.

## Delivered slice

The web Admin workspace at /admin/ includes a role-checked overview, user search and pagination, Create User, role/sector assignment, lead-Assessor selection, sector create/edit/archive and authenticator enrollment/verification. The refreshed portal layout uses a persistent desktop sidebar, compact mobile section navigation, responsive overview cards, keyboard skip link, semantic landmarks and clear not-connected/planned states. It follows the CEDA white, navy, rust and warm neutral theme with restrained cards and rounded controls. The Admin navigation is specific to the web portal; native mobile navigation will be designed per role later. Its overview labels AI response, website performance and portal activity metrics as not connected; it contains no fabricated values. The signed-in header identifies the verified administrator by name and email and provides logout. Support Officer and Assessor accounts have starter web destinations. Live telemetry, account lifecycle tools, audit explorer, full Optimus Prime controls and operational admin workspaces remain pending.

Optimus Prime's planned Admin guidance controls, AI safety boundaries, publishing flow and performance measures are documented in [Optimus Prime Administration](<Optimus Prime Administration.md>).

The protected source of access is the user's database profile and sector grants. The caller's email or user-editable metadata cannot assign a role. Public registration still creates an Innovator.

## Where to find the code

| Location | Responsibility |
| --- | --- |
| src/publicSite/admin.ts | Admin web shell, role-specific navigation, overview, operational sections and reusable role fields |
| src/publicSite/assets/admin.js | Directory, sector forms, role changes, invitation submission and MFA interaction |
| src/publicSite/assets/admin.css | CEDA Admin layout, responsive behavior, keyboard focus and reduced-motion styling |
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

The two migrations and admininvite function are deployed to Ceda Innovation. Gateway JWT verification is enabled. An unauthenticated call is expected to return HTTP 401. The frontend still requires a Vercel deployment with the existing public Supabase configuration enabled.

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
