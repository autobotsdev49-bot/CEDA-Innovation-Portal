# Admin governance delivery

Updated 20 November 2026. The web UI lives in `src/publicSite/adminGovernance.ts` and `src/publicSite/assets/admin.js`. Content and notification drafts remain in the current browser tab only. They are explicitly previews; do not claim they have been published or sent.

## Operational state

| Workspace | Local implementation | Server work needed |
| --- | --- | --- |
| Content management (`#content`) | 4 summary stat cards, category tabs, search/stage directory toolbar, badge pills, accessible draft dialog | Versioned public content and partner approval, publisher role, safe rendering and release/rollback |
| Notifications (Header bell modal) | Header bell trigger, 4 summary stat cards, Inbox & delivery alerts tab, Event templates tab, draft composer and delivery-failure jump | Versioned templates, opt-in preferences, sender queue, delivery receipts, deduplicated retries, FCM and EmailJS credentials held on the server |
| Admin follow-up (`#followup`, includes Feedback) | Unified triage queue for Bugs, Support escalations, Delivery failures and User Feedback with status cards, filters and investigation dialog | Reporter intake, privacy rules, assigned owner, internal notes, visible replies and resolution history |
| Audit logs (`#audit`, includes Activity log) | Unified screen with 4 summary stat cards, Protected audit log tab (`admin_audit_feed` RPC) and Portal activity stream tab | Apply migration, validate actual privilege boundary, retention and redaction; broaden audit coverage for future writes |
| Analytics & reports (`#analytics`, includes Reports) | Traffic charts, device breakdown, popular pages, submission pipeline report table and report export packages | Real application/assessment source data, date filters, aggregate queries, server-side privacy-reviewed CSV exports |
| Account & settings (`#settings`, includes Profile & Account security) | Unified screen with 4 summary stat cards and tabs for Profile & sessions, Account security (TOTP MFA) and Portal policies & settings | Versioned configuration, dual review where needed, verified password recovery, profile changes and device/session management from Auth |

## Next implementation sequence

1. Apply `supabase/migrations/20261120230000AdministrationAudit.sql` on the Ceda Innovation project. Test inactive user, innovator, expired Admin session and active Admin reads; verify no raw JSON detail or secret appears. Current connected account does not provide project access; this migration has not been applied.
2. Add public content tables with draft/review/published/archived versions. Expose public read only for approved versions, Admin mutations through an authenticated server boundary with reason and event log. Validate links and strip unsafe HTML.
3. Add feedback records and issue history with reporter ownership rules. Separate internal notes from public replies, test cross-user access and attachments.
4. Add notification template versions, recipient preferences, a delivery outbox and provider receipt records. Server workers own all EmailJS/FCM credentials; retries require an idempotency key and delivery inspection. Do not send previews.
5. Add reporting aggregates and bounded, privacy-reviewed exports after real application/assessment tables exist. No invented production counts.
6. Add configuration versions and verified personal account endpoints; keep user credentials in Supabase Auth. Require recent MFA for sensitive Admin configuration changes. Audit every change with previous/new version, reason and actor.
7. Run browser keyboard, screen-reader and mobile review; verify loading, empty, failure and retry behavior, role denial, and deployment.

## Security and UX conventions

The menu and browser content do not grant server access. Every privileged endpoint must derive the actor and role from an active verified session, reject unverified or suspended users, enforce row policies and record an audit entry. The audit explorer calls only `public.admin_audit_feed`, which checks `ceda_private.require_admin()` and returns a bounded set of actor, action, target, date and reason fields. It never returns `admin_audit.detail` to the browser. Display dynamic content using `textContent`, retain clear labels, visible focus, and text descriptions alongside status colors. Review all external content before publication.
