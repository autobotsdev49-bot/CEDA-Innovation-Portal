# API contracts

The implemented Admin RPC inputs, authorization rules and invitation endpoint are recorded in [Administration Implementation](<Administration Implementation.md>).

Proposed contracts for `/api/v1`. Use same-origin JSON over HTTPS, opaque IDs, UTC timestamps and validated bodies. Provider callbacks use separately verified signatures or the Auth exchange contract. Protect all writes against cross-site requests and validate explicit request origin. Every request receives a correlation ID. Add an OpenAPI definition in the first API PR and validate canonical examples in contract checks.

| Method and path | Authorization and contract |
| --- | --- |
| GET `/public/sectors` | Anyone. Published slug, label, summary and order only. |
| POST `/applications` | Verified innovator. Creates an owned draft with applicant type and pinned form version. |
| PUT `/applications/{id}/draft` | Owner, editable state. Accepts expected revision and validated section changes. Returns new revision or 409 with safe conflict metadata. |
| POST `/applications/{id}/evidence-slots` | Owner and eligible section or explicit request. Reserves bound upload slot with type/size metadata. |
| POST `/evidence/{id}/complete` | Slot owner. Queues validation after transfer. Returns pending scan. Add GET access through an authorized download endpoint with no-store. |
| POST `/applications/{id}/submit` | Verified owner. Requires revision and idempotency key. Returns stable receipt and status. Duplicate logical submission returns original receipt. |
| GET `/applications/{id}/timeline` | Owner. Applicant-facing timeline only. |
| POST `/information-requests/{id}/responses` | Owner, open request. Validates selected allowed fields and slots, binds version and returns response reference. |
| POST `/staff/assessment/rounds` | Scoped manager. Validate application state, rubric/policy, assignment scope and deadline. Audit changes. |
| POST `/staff/assessment/assignments/{id}/conflict` | Assignee. Records disclosure/clearance path. Conflict blocks detail and participation. |
| POST `/staff/assessment/rounds/{id}/reviews` | Assigned cleared assessor. Submit validated scorecard. |
| POST `/staff/assessment/rounds/{id}/voting-windows` | Manager. Pin eligible panel and rules after readiness checks. |
| POST `/staff/assessment/votes/{id}/ballots` | Current eligible panel member. One ballot per member in open window. |
| POST `/staff/assessment/rounds/{id}/information-requests` | Scoped manager. Creates formal applicant request and explicit response slots. |
| POST `/staff/assessment/rounds/{id}/release` | Scoped independent manager, recent MFA. Atomic decision and applicant event. Reject ties, holds, expired authority and mismatch to vote. |
| POST `/support/conversations/{id}/handoff` | Verified account or bound guest. Idempotently creates or returns open ticket. |
| GET `/support/tickets/{id}` | Only verified owner or authorized staff. Return role-safe snapshot, own queue rank and latest event version. |
| POST `/support/tickets/{id}/claim` | Scoped support officer, capacity check. Return assignment or 409. |
| POST `/support/tickets/{id}/messages` | Current authorized participant, open ticket. Validate text and client message identity. |
| POST `/support/tickets/{id}/close` | Assigned officer or authorized supervisor. Atomic close, audit and history snapshot. |
| GET `/staff/admin/users` | Admin with directory permission. Bounded filters/cursor, masked metadata. |
| POST `/staff/admin/staff/invitations` | Fresh MFA and grant authority. Persist pending intent and return operation reference. |
| POST `/staff/admin/access-requests` | Fresh MFA and explicit grant authority. Record proposed grant/revoke and required approval. |
| POST `/staff/admin/access-requests/{id}/approve` | Eligible different approver when required. Transaction rechecks scope and policy. |
| POST `/staff/admin/users/{id}/recovery` | Fresh MFA, audited recovery reason, provider-managed flow. Return generic delivery state. |
| POST `/staff/admin/users/{id}/session-revocations` | Fresh MFA. Revoke one or all in portal and invoke supported provider revocation where applicable. |
| POST `/staff/admin/users/{id}/suspension` | Fresh MFA and protected-target check, explicit approved state and reason. |
| POST/PATCH `/staff/admin/sectors[/{id}]` | Catalogue manager. Validated lifecycle and unique slug. Audit and update public projection. |

Use GET lists with stable order and cursor bounded to that filter. Reject cross-resource cursors. For conditional writes return 409 on stale state. Use 400 for malformed syntax, 401 for missing identity, 403 for known denied capability and consistent 404 for inaccessible resource identities, 422 for field-level rules, 429 with Retry-After for rate limit, and safe 5xx with correlation only. Responses for signed-in data use `Cache-Control: private, no-store`.

Require idempotency keys for irreversible/retriable commands. Bind to actor, operation and input digest. A changed input with an existing key returns conflict. Use durable write result plus in-app event. Only transient failures retry with bounded exponential backoff and jitter. Recheck authorization before replaying a response. Payload validation, user identity, effective sector, command-level permission and transaction outcomes must agree.
