# Security, accessibility and operations

The [mobile and web accessibility test plan](../../mobile/README.md#visual-theme-and-accessibility-testing) covers TalkBack, VoiceOver, voice controls, text enlargement and the mobile browser handoff.

For the deployed sign-in and sign-up protections, rate limiting and verification status, see [Sign-in and sign-up security](<Signup Integration.md>).

Use a selected OWASP ASVS 5.0 control checklist to review the demo and a WCAG 2.2 AA target across public and signed-in journeys. Record evidence for each check. Use synthetic data before any production decision.

## Threats and controls

| Risk | Required control and verification |
| --- | --- |
| Account takeover and wrong recovery recipient | Verified signup, managed Auth, MFA for all staff, fresh step-up for sensitive commands, safe invite/recovery redirect allowlists and neutral response messages. Admin initiates recovery to the verified destination. Staff identity changes and MFA recovery have independent proof and approval. Exercise expired, reused and wrong-recipient flows. |
| Stale sessions and excessive privileges | Server verifies session and MFA, checks active local session, profile and live grants. Every accessible policy path rejects revoked staff sessions and switched scopes. Revocation consumes local state immediately and calls provider controls where supported. An issued access JWT may survive provider sign-out until expiry. Avoid treating token claims or route redirects as live authorization. Test former staff with an earlier issued session against APIs, DB and files. |
| Record disclosure and insecure caching | Least privilege, case/sector boundaries, scoped response projections, redacted telemetry, protected response no-store. Never expose admin, panel or support internals to applicant APIs. Disable shared cache on Auth cookies and downloads. Verify anonymous and cross-user denial, and test that two accounts cannot receive the same cached private response. |
| Unsafe upload or embedded content | Private bucket, size/type limits, random storage key, quarantine, byte signature validation and malware scan before serving. Require authorized same-origin download with no-store and attachment disposition for untrusted files. Keep object access server-owned where immediate revocation is required. Signed URLs remain usable until expiry. Treat scanner failure as pending or rejected. Use synthetic isolated fixtures to demonstrate while scanner integration is pending and disable real evidence access. |
| Browser and API abuse | Escape or render plain user-authored text, validate input, parameterize database queries, block open redirects and arbitrary outbound fetches, configure CSP including frame-ancestors, nosniff, Referrer-Policy and Permissions-Policy. Use HTTPS in deployments, appropriately scoped secure cookies and server-side CSRF protection for writes. Restrict origins and third-party dependencies. Test actual CSP against Auth and supported integrations, including sign-in and help. |
| Admin misuse, fraudulent release and audit tampering | Predefined roles, live permission checks, fresh MFA and separate approval for elevated access. Redacted append-only audit, reviewed exports and no ordinary case access for system admins. Never let a requestor approve their own governed change. Test unauthorized grant, removal of last active custodian and attempted release by admin. |
| Queue abuse, message disclosure and external AI exposure | Rate-limit login, recovery, uploads, chat and AI. Bound resource usage, file counts and payloads. Verify queue/record membership and consent where applicable, minimize handoff context, keep model read-only with approved content, and render output safely. Check unavailable model, abusive volume and guest account isolation. |

Initial demo session policy proposal is a 30-minute staff idle timeout, 8-hour absolute staff lifetime and 10-minute freshness window for high-impact MFA. Validate provider capabilities and enforce required portal controls server-side. Record last activity without treating background polling as user interaction. Provide accessible expiry warning and a renewal action where policy allows. Staff directory session fields are indicative. Do not expose raw tokens or message content to operators.

Before live data, obtain approved privacy notices, classification, data retention and disposal, data-subject request handling, incident contacts, storage region, vendor and cross-border processing decisions. Confirm the Botswana Data Protection Act obligations with CEDA and qualified counsel for the actual rollout. Review Auth sender, backup coverage, malware scanning, audit retention and provider limits. Preserve evidence of approvals.

## Accessibility acceptance

| Need | Implementation and evidence |
| --- | --- |
| Blindness and low vision | Semantic landmarks, headings, page titles, skip link, descriptive labels and accessible names. NVDA with Firefox or Chrome and VoiceOver with Safari cover sign-in, wizard, status, chat and staff task paths. Confirm reading order, errors, list/table headers, and textual alternatives for charts and dashboards. |
| Deafness and hearing loss | Provide text-first support, visible notifications and status changes, captions and transcripts for published video, and a text route for contacting staff. Ensure essential instructions never depend on sound. Test the demo with sound muted. |
| Keyboard and motor access | Every action works with keyboard. Visible focus, logical order, focus never obscured, dialog focus return, a non-drag upload option and WCAG target-size checks including spacing exceptions. Walk invite, upload, chat and release with keyboard only. |
| Colour perception, zoom and motion | WCAG contrast targets, status text and cues as well as color, reflow at 320 CSS px, usable text at 200% zoom and reduced-motion support. Test the smallest layouts and persistence of readable errors and focus. |
| Cognitive access and assistive authentication | Predictable navigation, plain descriptions, step headings, error summary linked to fields, last-saved status, consistent help, password manager and paste support. Provide recovery options where MFA or timing creates barriers. Use polite live regions for save/ticket changes and escape from dialogs. |

Use axe in Playwright for representative screens and manual keyboard, assistive technology, mobile, contrast and media checks for critical journeys. Capture build/route/device, expected vs actual, severity, issue and reviewer. Release gate is no unresolved critical accessibility blockers in the demo, with a published accessibility contact and a tracked assessment plan for full AA conformance. Require broader manual audits and testing with users with disabilities before a public production rollout.

## QA and observability

- CI gates lint, strict TypeScript, production build and targeted tests. Run policy checks against a disposable Supabase database and use synthetic accounts. Include an app access test that proves the database rejects wrong scope independently of the page.
- Keep Playwright journeys for public navigation, two applicant types, atomic submit retry, assessment/clarification/release, pre-application support, admin invitation/role change/sector archive/recovery, and session revocation. Run parallel-request tests for submit, votes, claim/capacity and close/send.
- Use JSON logs with request ID, route, result, latency, environment and release ID. Record actor pseudonyms when operationally needed. Exclude auth headers, evidence bodies, PII, prompts and recovery links. Audit records use a separate restricted store. Watch failed credentials, failed commands, outbox lag, storage quarantine and queue age.
- Basic runbook checks dashboard health by component and verifies last successful release. Keep request IDs in user-facing error states. Separate operator alerts from public messaging.

## Incident, deploy and recovery

1. Identify severity and owner. Preserve relevant audit and deployment evidence. When access is compromised, restrict the impacted route or feature, revoke sessions, rotate affected credentials and verify from a separate account.
2. Deploy versioned migrations to disposable/test DB first. Keep schema changes backward compatible during rollout. Rehearse a fresh seed, preview and release smoke test before moving demo traffic.
3. For application regression, redeploy the last known green build if schema remains compatible. For data regressions, halt affected writes and use reviewed forward fixes or an approved restore. Record backup coverage for both DB and Storage, test an isolated restore, and reconcile counts and references before resuming.
4. Keep incident timeline, impact, remediation and remaining risks. Route live-data notifications through authorized CEDA contacts and approved procedures.

## Hosting support, fault remediation & turnaround SLAs

- **Managed Hosting Stack**: Supabase Managed PostgreSQL, Auth, Private Storage & Edge Functions (`Africa/Gaborone` UTC+2 operational baseline) paired with Vercel Edge CDN for static portal delivery and TLS termination.
- **Availability & Fault Prevention**: 99.9% monthly portal availability target, automated edge circuit breakers (`optimus`, `fcm-dispatch`, `email-dispatch`) with exponential backoff, zero-downtime rolling deployments, and 15-minute instant edge rollback.
- **Backup & Recovery Objectives**: RPO <= 24 hours (daily encrypted snapshots, PITR enabled in production) and RTO <= 4 hours for full database and private document bucket restoration.
- **Operating Windows & Escalation Channels**: Live CEDA service consultant desk operates **Monday to Friday, 09:00 to 16:00 Africa/Gaborone** via in-portal Live Chat (`support@ceda.co.bw` / Follow-ups queue), backed by 24/7 P1 emergency SRE & Security escalation.

| Severity | Scope & Examples | Initial Acknowledge | Containment / Mitigation | Full Resolution Turnaround | Escalation Owner |
|---|---|---|---|---|---|
| **P1: Critical** | Portal offline, Auth/RLS isolation fault, database outage | 15 minutes | 1 hour | 4 hours | 24/7 On-Call SRE & Security Lead |
| **P2: High** | Evidence uploads failing, live chat down in 09:00 to 16:00 working days, alert outbox stalled | 30 minutes | 2 hours | 8 working hours | Tier-2 Platform Engineer & Support Lead |
| **P3: Normal** | Non-blocking UI fault, CSV export edge case, delayed catalog cache refresh | 2 working hours | 1 working day | 2 working days | Product Support & Maintenance Engineering |
| **P4: Low** | Minor copy, cosmetic layout refinement, accessibility improvement | 1 working day | Scheduled release | 5 working days | Release & UX Maintenance Cycle |

## References

- [OWASP ASVS](https://asvs.owasp.org/)
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Auth sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase private Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Supabase SSR authentication](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Core Web Vitals](https://web.dev/articles/vitals)
