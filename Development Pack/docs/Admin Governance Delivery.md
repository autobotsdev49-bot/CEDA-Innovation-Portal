# Admin governance delivery

Updated 21 November 2026. The web UI lives in `src/publicSite/adminGovernance.ts`, `src/publicSite/adminOperations.ts`, `src/publicSite/adminOverview.ts` and `src/publicSite/assets/admin.js`. Operational tables, O(log n) indexes, message queue outbox and protected Admin RPCs are deployed to the `Ceda Innovation` Supabase project (`inzupertrdvlenrozqep`).

## Operational state

| Workspace | Database & RPC implementation (Deployed) | Remaining external integrations |
| --- | --- | --- |
| Content management (`#content`) | `public.portal_content` table, `admin_content_list` and `admin_save_content` RPCs with version tracking and `admin_audit` logging | Public website dynamic rendering of approved content versions |
| Notifications (Header bell modal) | `public.notification_templates` and `public.notification_queue` outbox table, `admin_notifications_overview` and `admin_save_notification` RPCs with idempotency keys and audit logging | Background worker dispatch via server-held EmailJS and FCM credentials |
| Admin follow-up (`#followup`, includes Feedback) | `public.admin_matters` table (`Bug`, `Support`, `Delivery`, `Feedback`), `admin_matters_list` and `admin_update_matter` RPCs with actor-attributed history and audit logging | Public/Innovator reporter intake endpoint and visible reporter replies |
| Applications (`#applications`) & Sectors (`#sectors`) | `public.innovation_applications` table, `admin_applications`, `admin_revise_application`, `admin_intervene_application_status` and live per-sector outcome counts in `admin_sectors` | Applicant submission wizard, private file storage and Assessor scoring tables |
| Audit logs (`#audit`, includes Activity log) | `public.admin_audit_feed` RPC deployed and verified; records every user, role, sector, application, content, notification, matter and configuration mutation | Long-term archival and retention automation |
| Optimus Prime (`#optimus`) & Account & settings (`#settings`) | `public.portal_configurations` table (`optimus_guidance`, `optimus_knowledge`, `portal_policies`), `admin_get_configurations` and `admin_save_configuration` RPCs with version increments and audit logging | Live Gemini API prompt consumption and verified Auth password-reset email flow |

## Security, caching and indexing conventions

1. **Authorization boundary:** Every RPC wrapper in `public` is `security invoker` and delegates to `ceda_private`, which calls `ceda_private.require_admin()` to enforce an active `admin` profile, confirmed non-anonymous email identity, and a live `auth.sessions` record. Direct table access to `portal_content`, `notification_templates`, `notification_queue`, `admin_matters`, `innovation_applications` and `portal_configurations` is revoked and blocked by restrictive RLS policies.
2. **O(log n) PostgreSQL indexing:** B-tree indexes cover audit timestamps/actions/actors, content `(kind, stage, updated_at desc)`, notification queue `(status, created_at desc)`, matters `(state, kind, priority, reported_at desc)` and `application_ref`, applications `(status, submitted_date desc)` and `(lower(sector), status)`, plus all foreign-key columns.
3. **In-memory RAM caching:** `src/publicSite/assets/admin.js` caches read RPC responses in memory (`adminRamCache`) with a 30-second TTL and explicitly invalidates affected cache keys immediately upon any write mutation or sign-out.
4. **Verification:** Rollback-only SQL integration tests in `supabase/tests/admin_backend_operations.sql` and `supabase/tests/admin_password_creation.sql` pass against `inzupertrdvlenrozqep`, confirming non-admin denial (`42501`), versioned mutations, and audit trail completeness.
