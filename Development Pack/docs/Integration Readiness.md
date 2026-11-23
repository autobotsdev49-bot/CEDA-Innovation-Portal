# Web, Mobile and Backend Integration Readiness

Last verified: 21 November 2026

## Readiness decision

The shared Supabase backend is healthy and the implemented Innovator and Administrator flows are correctly connected in source. The web integration has live hosted evidence. The mobile integration has matching configuration, shared API contracts, passing tests and a passing TypeScript build, but still needs one real-device sign-in and protected-read smoke test before it is classified as end-to-end verified.

Assessor and Support Officer mobile login remains deliberately blocked until their workspaces exist. This prevents a staff member from being authenticated and then routed into an unrelated screen.

## Verified backend

| Check | Result |
| --- | --- |
| Supabase project | `Ceda Innovation` (`inzupertrdvlenrozqep`) is active and healthy |
| Database | PostgreSQL 17.12 in `eu-west-1` |
| Public tables | 11 tables; Row Level Security is enabled on all 11 |
| Anonymous table access | No direct table privileges |
| Authenticated table access | Only `SELECT` on `profiles`, restricted by an own-active-account policy |
| Privileged data | All other tables deny direct access and use protected Remote Procedure Calls |
| Edge Functions | `admincreate` version 1 and `admininvite` version 2 are active with JWT verification |
| Admin function exposure | Anonymous execution is revoked; authenticated wrappers call private authorization functions |
| Accounts | Four Auth records: three confirmed active profiles and one unconfirmed signup awaiting verification |
| Seeded working data | 4 sectors, 6 applications, 6 admin matters and 4 audit events |
| Auth triggers | Confirmed Innovator provisioning and staff invitation provisioning are installed |

## Verified web integration

- The local and generated web configuration uses the Ceda Innovation project URL and a publishable client key.
- The browser sends passwords only to Supabase Auth and reads only the signed-in user's active profile.
- Shared login routes Admin, Innovator, Assessor and Support Officer roles to separate destinations.
- The Admin workspace independently verifies an active Admin profile before loading protected data.
- Supabase Auth logs show successful password login, user lookup and logout responses from `localhost:3000` and `127.0.0.1:3000`.
- The production build generated 15 pages and its JavaScript syntax check passed.

Local account creation is currently disabled by `CEDA_SIGNUP_ENABLED=false`; sign-in remains configured. Enable signup only after the exact web callback URL and email delivery are smoke-tested in the target environment.

## Verified mobile integration

- `mobile/.env.local` points to the same Ceda Innovation project and uses the publishable key.
- Mobile registration, resend, password login, verification check, profile lookup and logout call the same Supabase Auth and Data APIs as web.
- The Administrator mobile workspace calls the same protected directory, sector, role, account creation and invitation endpoints as web.
- Tokens and passwords are not placed in database calls. The service role key remains inside Edge Functions.
- Mobile TypeScript validation passes.
- Mobile API and role behavior is covered by the shared automated test suite.

The mobile runtime has not been smoke-tested on a connected Android or iOS device in this verification session. No Android device bridge is available in the workspace. This test must be completed before release.

## Security verification

- Every exposed public table has Row Level Security enabled.
- Authorization is based on database profile state and live sessions, not editable user metadata.
- Protected Administrator operations require an active Admin profile; sensitive mutations also require multi-factor verification and an audit reason.
- The `admincreate` and `admininvite` functions validate the caller before using the server-only service role key.
- The current Supabase security advisor reports one warning: leaked-password protection is disabled. Enable it in Supabase Auth password security before public launch.
- The performance advisor reports only unused indexes. This is expected for a newly seeded system and is not a current performance defect.

## Migration consistency

The hosted database has 11 recorded migrations while this workspace has 9 migration files. The implemented SQL is present locally, but three local files use different version timestamps and one combined migration covers two hosted follow-up migrations. Do not run an unattended database push until the migration history is reconciled and verified against a fresh database.

Hosted versions that require reconciliation:

- `20261120033328 optional_assessor_sectors`
- `20261120224713 administration_audit`
- `20261120225338 admin_backend_operations`
- `20261120225618 admin_private_grants`
- `20261120230632 admin_foreign_key_indexes`

## Release gate before the next role is declared complete

1. Reconcile local migration versions with hosted migration history and test a clean database build.
2. Enable Supabase leaked-password protection.
3. On a real mobile device, sign in as the Administrator, load Users and Sectors, then sign out.
4. Confirm the Vercel production environment contains the same Supabase URL and publishable key and that signup is enabled only when intended.
5. Develop the next role workspace, then extend mobile login routing to that role. Do not enable Assessor or Support Officer mobile access before its destination screen and permission tests exist.

## Verification evidence

- Hosted project, table, migration, function, advisor and log inspections through the connected Supabase project
- `npm test`: 49 of 49 tests passed
- `mobile/npm run typecheck`: passed
- `npm run build`: 15 pages generated
- Generated Admin JavaScript syntax check: passed

## Administrator password-created accounts, 21 November 2026

The password account flow has been verified in source and focused automated tests. Web, mobile and the protected `admincreate` Edge Function now enforce the same password rule: 12 to 72 UTF-8 bytes with uppercase, lowercase, a number and a symbol. The Edge Function first verifies the signed-in Admin and protected reservation, then creates an email-confirmed Supabase Auth user. The confirmed-user trigger consumes the protected reservation and provisions the profile with its assigned role. Shared login then authenticates the email and password, verifies the active profile and routes the role to its workspace. `admincreate` version 2 is active with JWT verification.

Focused account creation, mobile authentication and shared login tests passed 28 of 28. A successful password-created account has not yet been recorded in the production function logs, so the final live acceptance test remains: create one disposable account through an MFA-verified Admin session, sign out, sign in with the assigned credentials, verify the assigned workspace, and then retire the disposable account through an approved account-management process.

