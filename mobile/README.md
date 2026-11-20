# CEDA Innovation mobile app

## Administrator mobile workspace

Deployment verification: admincreate version 1 is ACTIVE with gateway JWT verification enabled in Ceda Innovation. All 48 automated tests, TypeScript and the Android export passed. The hosted rollback-only confirmed-insert test passed. This environment could not connect to the function URL for the unauthenticated HTTP probe; real-device account creation and login acceptance remain pending. The security advisor still reports the existing disabled leaked-password protection setting: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

The native password-creation service uses the existing MFA-gated admin_prepare_invitation RPC only as a trusted provisioning reservation. It passes no password to that RPC. The server then creates the Auth identity with email confirmation, and the existing profile triggers consume the reservation and apply the approved role/scope atomically. Passwords go only to Auth and never into profile metadata, audit payloads or responses. The service never resets an existing identity's password on a duplicate email. The app masks passwords, checks confirmation and the 8-character/72-byte limits, and clears both inputs on submission or backgrounding. Supabase applies its configured password policy as well.

Users includes a **Create user** button and tapping an existing row opens **Edit user** in a native form. Creation collects name, email, password and confirmation, role, optional sectors, optional Lead Assessor powers and an audit reason. It calls the protected admincreate service to create an active account with the administrator-set password. No invitation or password-setup email is required for this mobile flow. Existing accounts support role, lead and sector edits through `admin_assign_role`. Their name, email and account status are explicitly read-only because the current backend has no mutation contract for those fields.

`AdminUserEditor.tsx` verifies a six-digit code against an already enrolled TOTP factor before enabling submission. The verified access token updates the in-memory parent session without extending its original expiry. Authenticator enrollment remains on the web security screen. Every privileged request still relies on the server's active Admin, live session, MFA, self-change and final-Administrator checks. Existing sector grants are preserved when opening the form; a missing scope field or sector-load failure blocks save. Pending requests block dismissal and duplicate submits. Uncertain creation/save results pause resubmission until the operator checks the directory. Successful actions refresh the directory and show a result message.

Innovations uses `AdminInnovations.tsx` with the same compact directory style as Users: a single application search, coloured status pills and a sector funnel that opens a radio-selection bottom sheet. The duplicate workspace search, Innovations heading and summary cards are hidden on this tab. Search matches reference, title, applicant and sector; the small result count combines search, status and sector. Clear filters resets all three. Rows show reference, date, title, applicant, sector and status, and still open the existing detail modal. The six records remain explicitly labelled sample data.

Users now uses `AdminUsers.tsx`: one account search bar with debounced server search, compact role pills and a funnel that opens Active / Suspended / Closed / All statuses in a bottom sheet. The redundant Users heading, second search, status-pill row and count cards are removed. A small filtered count describes the selected role/status and explicitly applies to the loaded page. User rows include role-coloured initials, role tags, Lead where applicable, status and modal access details. Create user and account rows open the native account form. Search and pagination hide stale rows while requests are pending; empty matches offer Clear filters.

The Overview follows a compact mobile dashboard layout: a left header menu opens a side drawer, a right notification bell opens clearly labelled preview alerts, and the workspace search is a separate search bar below the header. Four light metric tiles show portal page views, active visitors, applications and open Admin follow-ups. The selectable Today / 7 days / 30 days reporting period updates the page-view chart, totals and application outcomes. Tapping a chart bar reveals its exact date and value.

Overview links open dedicated native Portal analytics, Website health, Follow-ups and Activity log screens. Analytics includes a line chart, device ring, popular-page bars and daily values. Follow-up filters cover matter type, status and priority; activity records include actor, role, action and timestamp. AI performance opens Optimus Prime. Sample reporting fixtures and the fixed reporting window match the web portal (`adminPreview.ts`); none of these values are live. The notification bell does not claim live push delivery or an unread count.

Verified active Admin accounts now open `AdminWorkspace.tsx` after native sign-in. The five bottom tabs are Overview, Users, Innovations, Follow-ups and More. More opens Sectors, Support, Optimus Prime, Feedback & insights, Audit logs and Account security. Workspace search opens matching screens. Android Back closes the current modal, then returns secondary screens to Overview.

Users and Sectors read the existing protected `admin_directory` and `admin_sectors` RPCs with the in-memory session. Requests have a 15-second timeout, loading/error/retry states and server-side authorization. Directory search is server-side; role filtering and counts apply to the current 25-record page. Role tags distinguish Administrator, Innovator, Assessor and Support Officer, with a separate Lead tag. Sector details show unavailable application counts as a dash, never zero.

Overview traffic and performance, innovation records, follow-ups and recent activity are explicitly labelled sample data. They are screen previews, not live reporting. Innovation and follow-up details open native modals. No decision-release powers are granted. Support, feedback and audit views explain the missing protected APIs rather than inventing records.

Optimus Prime provides performance previews and editable response-guidance/knowledge drafts in modals. Drafts remain in memory until sign-out or app close. No sources are fetched, models trained or settings published. Sector editing and authenticator enrollment open the existing web workspace, which requires its own sign-in/MFA. Account creation and role/scope editing use the native form and authenticator verification. Access tokens never enter URLs.

Validation: run `npm run typecheck` in `mobile`, `node --test tests/mobileAuth.test.ts` in the repository root, and an Android Expo export. Real-device checks remain necessary for tab layouts, large text, screen-reader focus, keyboard behavior, modal dismissal, admin sign-in, API connectivity and session expiry.

The Expo app is the public mobile entry point for CEDA Innovation. It launches with the CEDA logo and introduces new users to the portal before opening the portal welcome screen. The onboarding and welcome images are bundled with the app.

| Action | Opens |
| --- | --- |
| Submit an innovation | The native Innovator sign-in screen |
| Create an account | The native sign-up screen, with email confirmation through the hosted callback |
| Read the eligibility guide | The website’s public submission guide |

The app uses Supabase for email and password authentication. After sign-up, open the verification link in the inbox, return to the app, and tap **I have verified my email**. A successful check shows an account-created celebration before opening signed-in Home. Users can also tap **Continue to Home**. The full Innovator workspace and submission form are the next mobile milestone.

## Run locally

Use Node.js 22.20.0. From the project root, run:

```powershell
cd mobile
npm ci
npm run typecheck
npm start
```

Set the existing project publishable key in .env.local if it is missing from the development environment. Open the project in a compatible Expo Go version or development build to check the native forms and email verification handoff. Verify the branded native splash in a preview or production build on a device. [Expo splash screen testing](https://docs.expo.dev/versions/v58.0.0/sdk/splash-screen/)

`App.tsx` manages the launch flow and browser links. `app.json` configures the native splash. The logo comes from the same [official CEDA asset](https://www.ceda.co.bw/sites/default/files/logo_2.png) used by the website.

## Mobile authentication security

| Where | What it does |
| --- | --- |
| `NativeAuth.tsx` | Validates the forms, blocks duplicate submissions, and clears passwords when a validated request starts or the app enters the background. |
| `VerifyEmail.tsx` | Shows a dedicated verification screen. Resend unlocks after 60 seconds and starts a fresh countdown after a successful resend. The screen honors Supabase retry times and displays instructions when the email is still unverified. |
| `VerificationSuccess.tsx` | Plays a brief confetti burst after verification succeeds and opens Home automatically. With Reduce Motion enabled, the confetti stays still. |
| `auth.ts` | Uses the Supabase publishable key over HTTPS. Sign-up submits the name, email and password, and Supabase assigns the Innovator role. Any unexpected sign-up session is discarded. Sign-in checks the confirmed Supabase identity and reads its active Innovator profile before opening the account screen. |
| Supabase `public.profiles` | Row Level Security limits profile reads to the active account owner. Authenticated users cannot update profile roles or account status through the table. |
| `App.tsx` and `NativeAuth.tsx` | Hold separate retry deadlines for the two forms while the app is running. The countdown uses the server's retry time when provided, with a 60-second app fallback. Supabase enforces its own limits, which can include shared network or project limits. |

The app keeps the access token in memory and expires it after at most one hour, or sooner if Supabase gives it a shorter lifetime. Sign-out immediately clears app access and requests revocation of the current Supabase session. An issued access token expires according to Supabase's token lifetime.

The pending sign-up flow retains the submitted password only in memory for up to 15 minutes so it can authenticate after the user opens the inbox link. Leaving the verification screen or signing in clears it. If the app closes or the window expires, the user can confirm their email and sign in with their password. Supabase still checks the confirmed identity and active Innovator profile before Home opens.

Run `node --test tests/mobileAuth.test.ts` from the repository root. The tests simulate pending and confirmed accounts, inactive profile rejection, resend requests and provider retry times. A real-device check with a fresh email address is pending. Tap the verification button before confirming, check the resend countdown, open the latest inbox link, return to the app and confirm that the celebration appears before Home.

## First launch onboarding

`App.tsx` displays the CEDA logo on white for 1.6 seconds on each fresh launch while the app checks the local onboarding preference. The splash then fades into the next screen over 650 milliseconds. The app skips the fade when Reduce Motion is enabled. The native launch screen gives way to this in-app splash as soon as the logo loads, so the CEDA splash also appears in Expo Go. New users see three illustrated screens explaining how to bring an idea to CEDA, prepare supporting evidence and follow an application. The photos fade into white below the subject. Next and Back stay in a fixed footer, and the image height adjusts to the space available for the copy. Users can leave the introduction with Skip. Finishing or skipping saves only a completion flag on this device. **Explore the portal** and **Skip** open the welcome screen. Returning users land on the welcome screen after the splash.

`Onboarding.tsx` contains the screens and navigation. Three onboarding photos and a separate welcome portrait are bundled in `assets`. They illustrate typical scenarios. The screen-reader announcement includes the step and heading, and the layout scrolls as needed at larger text sizes.

On a device, check the native splash, first launch, Next and Back, Skip and app restart. Verify focus order and the step announcements with TalkBack and VoiceOver during the planned accessibility pass.

## Visual theme and accessibility testing

Onboarding and welcome use the CEDA colours, a full-width photo, a translucent header and a white fade above the copy. Sign-in and sign-up use separate generated portraits, warm frosted-glass panels and a solid fallback when blur is unavailable. The screen keeps scalable text, readable foreground colours, descriptive action labels and touch targets at least 48 points tall.

After the remaining mobile UI is complete, verify both the native app and the website on real devices.

| Check | Mobile app | Website |
| --- | --- | --- |
| Screen readers | TalkBack on Android and VoiceOver on iOS. Check reading order, action labels and status messages. | NVDA and VoiceOver. Check landmarks, headings, labels, errors and focus order. |
| Voice control | Android Voice Access and iOS Voice Control. Activate visible actions by name. | Use browser and system voice controls. Check that visible button names match accessible names. |
| Large text | Test system font and display sizes. Verify buttons remain readable and scrollable. | Test text zoom, narrow viewports and reflow. |
| Visual and motor access | Check contrast, Reduce Transparency, touch targets and switch or keyboard navigation. | Check contrast, keyboard operation, visible focus and reduced motion. |

Include the transition from the native app to browser email verification and back to native sign-in in each relevant test. The full assistive-technology pass is pending.

For the keyboard check, open each field on sign-in and sign-up on Android and iOS. Check that the focused field scrolls above the keyboard when it opens and when changing fields with the keyboard still open. Pay particular attention to Password and Confirm password on small screens and at large text sizes. `NativeAuth.tsx` wraps both forms in a KeyboardAvoidingView and scrolls the focused field into the resized viewport. `app.json` configures Android to resize the window when the keyboard opens.

