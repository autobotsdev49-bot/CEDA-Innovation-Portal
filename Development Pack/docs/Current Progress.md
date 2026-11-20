# Progress and next steps

The [End To End Development Plan](<End To End Development Plan.md>) is the active detailed checklist for delivery by 22 November 2026. It expands this snapshot into role-specific web, database, backend, security and mobile work.

Updated 20 November 2026.

The web Admin foundation now includes the directory, role/lead/sector assignment, sector editing, MFA interaction, invitation endpoint and activation page. The corresponding migrations and protected endpoint are deployed. The confirmed, active account `autobotsdev49@gmail.com` is the initial Administrator. See [Administration Implementation](<Administration Implementation.md>) for source locations, security, testing and remaining acceptance. The table below preserves the preceding baseline.

The Admin web portal now has a responsive CEDA-styled shell, desktop sidebar, compact mobile section navigation, overview, user and sector management surfaces, Optimus Prime placeholder and account security section. The overview labels unavailable AI, website and portal monitoring as not connected. This is the Admin website navigation, not the separate role-specific bottom navigation planned for native mobile. See [Administration Implementation](<Administration Implementation.md>) for the current code map and acceptance gaps. Optimus Prime's planned Admin controls and safety boundaries are in [Optimus Prime Administration](<Optimus Prime Administration.md>).

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
