# Development status and handover

19 November 2026 · Development Pack · Baseline 0.1

## Read this first

The working root is `CEDA INNOVATION HACKATHON`. The `Development Pack` holds the team guide and reference material. Its role specs, original plans and numbered screen references remain the design inputs. The [live Vercel preview](https://ceda-innovation-portal-nine.vercel.app/) serves nine static routes. The assessment, support and experiment modules run with synthetic data and await backend integration.

| Work item | State | Handover |
| --- | --- | --- |
| CEDA-02 · Public web | Preview deployed | Public guidance, About and contact pages, shared hero images and layout, mail draft for suggestions, Sign in and Sign up previews with same-page switching. Mobile shows the active form. The latest responsive visual changes were verified in the deployed markup and stylesheet. |
| CEDA-03 · Backend foundation | Profiles and signup provisioning deployed | Email confirmation is required in Supabase. Verified email accounts receive an innovator profile through the database. Public form wiring and email delivery testing are pending. |
| CEDA-01 · Platform | Started | Root manifest, pinned Node and repeatable scripts. Registry DNS unavailable during initial attempt. Next.js scaffold, TypeScript compiler, CI and hosting pending. |
| AUTOBOTS-01 · Decision provenance | Domain ready | Pinned versions, cleared assignments, six-criterion scorecards, vote validation and candidate release outputs. DB transactions, RLS, state authorization, UI and decision storage pending. |
| AUTOBOTS-02 · Governed guidance | Domain ready | Published version selection, sector precedence and fallback signal. Knowledge publication storage, human handoff queue and approvals pending. |
| AUTOBOTS-03 · Experiment | Synthetic verification | Public wording experiment, stable allocation and aggregate counts. Participant enrollment, instrumentation, accessibility review and data collection pending. |
| CEDA-02 to CEDA-08 | Pending integration | Continue in dependency order from the [delivery plan](<Delivery Plan.md>). Preserve screen IDs, role boundaries and run evidence. |

## Decisions recorded

- **D-01 · Trust boundary.** Domain checks are portable TypeScript. Privileged operations require authoritative Supabase transactions, scoped permissions and RLS before exposure. Route handlers never trust user-supplied permission flags.
- **D-02 · Institutional knowledge.** History and published knowledge capture institutional reasoning. Applicant evidence and reviewer data stay within their approved scopes. Learning uses approved knowledge and aggregate operating trends.
- **D-03 · Experiment scope.** Test public wording only. Keep accessibility requirements, support availability, permissions, assessment rules and outcome release constant across arms.
- **D-04 · Current runtime.** Stay with the chosen Next.js and Supabase architecture. Use Node's dependency-free runtime for this first slice while the package registry is unreachable. Remove duplicate validation when porting by preserving these rules and running the same fixtures against the database.

## Next developer session

### Current checkpoint

- **Completed and deployed:** Supabase migrations `20261119112830` and `20261119181502` establish owner-only profiles and provision an active Innovator profile when Auth confirms the applicant's email. The rollback-only SQL test passed on the hosted schema. Security, performance and health advisors returned zero findings after the grant fix.
- **Implemented, pending live email acceptance:** the hosted signup form calls Supabase Auth once the fields are valid, and the verification return page checks the confirmed identity and active Innovator profile. See [Signup integration](<Signup Integration.md>). Verify delivery and the return URL with a controlled inbox.
- **Following step:** connect sign-in and the authenticated application workspace after registration acceptance.

1. Take the existing issue or open the platform issue. Confirm app workspace and enable approved package access. Install and pin Next.js, React and TypeScript, add CI and record green setup and build outputs.
2. Configure and verify Vercel, Supabase, EmailJS, FCM and Gemini within the $0 boundary. Scaffold the Expo Android client and test native push on a test device. See [Platform Setup](<Platform Setup.md>) for the exact acceptance steps.
3. Build the application identity and sector baseline with negative tests and a disposable environment. Add versioned schema and decision/guidance integration. Keep the synthetic tests running.
4. Connect the public evidence guidance and assessment workspace to these rules. Add browser and DB tests before claiming the first portal journey complete.
5. Rehearse both the P0 workflow and the experiment moderation script. Start collection only after approval and record results under a new dated entry.

## Update after each work session

Add date in CAT, completed work, changed paths, test commands and evidence, decisions, open issues, next task and the primary/backup owner. Link actual PRs and CI runs when they exist. Capture environment or provider blockers in the tracker without storing secrets.
## Work log and verification

| Date (CAT) | Change | Repeatable evidence | Remaining |
| --- | --- | --- | --- |
| 19 November 2026 | Added web signup, verification return and build-time public configuration. Updated local preview asset routing. | `npm test` covers request shape, rate limiting, accidental auto-confirmation, and verified owner profile checks. `npm run build` generates the verification page and preview-safe defaults. | Configure or verify SMTP and the allowed callback. Run one real signup end to end, then enable signup on the public build. |
| 19 November 2026 | Deployed migration `20261119181502` for post-confirmation innovator provisioning and restricted execution grants on the existing RLS helper. | `supabase/tests/innovatorSignup.sql` verifies pending and confirmed account states, server-assigned roles and safe repeat confirmation. | Confirm SMTP and verification return URL, then connect the public form and test a complete signup with a controlled inbox. |
| 19 November 2026 | Applied the first identity migration to Ceda Innovation after a rollback-only policy preflight. Matched the local migration filename to the hosted ledger. | `supabase/tests/profiles.sql` covers owner, other account, anonymous and write-denial cases. Post-deploy query confirmed row-level security and zero profile records. | Review the advisor warning for the existing `rls_auto_enable()` helper, then connect Auth and profile provisioning. |
| 19 November 2026 | Reconciled the public preview and handover. Recorded same-page access switching, mobile form-only layout and shared responsive hero imagery. Identified Ceda Innovation as the Supabase database target. | Vercel reports the preview ready. Supabase inspection found zero public tables and zero recorded migrations before database work. | Start with one identity migration. Add login and server-side profile provisioning after verifying database isolation. |
| 19 November 2026 | Added split-layout access screens in `src/publicSite/access.ts`. Public Sign up opens `/register/` and submission entry points open `/signin/`. | Build and check the public links, both access screens and the mobile layout. | Connect Supabase authentication, verification and recovery before enabling credential fields. |
| 19 November 2026 | Tightened public page spacing, added editorial images and motion, and expanded About, Help and the footer. CEDA sources are in `src/publicSite/ceda.ts`. | Run `npm run build` and `npm test`. Check About sources and the Help suggestion box. Suggestions open an email draft to the published CEDA address. | Portal-specific impact counts, portal reviews and hosted feedback collection await approved data and workflows. |
| 19 November 2026 | Refined the public site in `src/publicSite/assets/site.css` with a full-width frosted header, borderless sections, arrow links, and subtle interaction states. | Run `npm run dev` and check the sticky header while scrolling, the active desktop link, the mobile menu, and reduced-motion behavior. | Signed-in portal screens remain pending. |
| 19 November 2026 | Implemented the first assessment, guidance and experiment domain slice. Added contributor navigation, runtime pin and test documentation. | Node 22.20.0. `npm test` passed 12 tests. `npm run demo:autobots` passed with a blocked 2–2–1 split, an approved synthetic majority, and 511 A versus 489 B synthetic assignments. | No human trial, portal build, database policy tests or browser accessibility results. Assign named primary/backup owners when the team opens issues. |
| 19 November 2026 | Moved the runnable slice to root, consolidated matching copies, standardized names, renamed the AI assistant to Optimus Prime, and documented selected engineering choices. | Root unit tests and synthetic walkthrough reproduced. Relative guide links and naming checked. | Next.js app, Supabase persistence and access rules, browser checks and participant trial remain pending. |
