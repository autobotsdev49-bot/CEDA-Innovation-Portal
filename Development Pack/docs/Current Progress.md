# Progress and next steps

The [End To End Development Plan](<End To End Development Plan.md>) is the active detailed checklist for delivery by 22 November 2026. It expands this snapshot into role-specific web, database, backend, security and mobile work.

Updated 20 November 2026.

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
| Administrator bootstrap | Hosted role constraint updated. Trusted local setup script prepared. | Account creation is blocked until a server secret is available locally. No admin account has been created yet. |
| Innovation workflow | Domain logic and synthetic fixtures exist for assessment, guidance and experiment allocation. | Submission tables, private attachments, persistence, reviewer assignment, messages and workflow integration. |
| Services | Stack decisions recorded for Gemini, EmailJS and Firebase Cloud Messaging (FCM). | Configure and verify integrations within free tier limits. |

## Role-Based Access Control

Role-Based Access Control (RBAC) decides which screens and operations an authenticated account can use.

The trusted source is public.profiles.account_role. Sign-up always provisions innovator. Only a trusted server administrator can assign admin. The email address and editable signup metadata never grant admin rights. Unknown roles, inactive accounts and unconfirmed identities are rejected.

Web rechecks the owner profile on /account/ and /admin/ and redirects to the matching destination. Mobile checks the profile before opening its role destination. Starter screens display account information only. User management, sector management and assessment operations require their own database authorization before implementation.

## Administrator account setup

Requested account email is admin@ceda.co.bw. Credentials are excluded from documentation and source.

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
