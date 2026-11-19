# Admin Analytics and Monitoring

## Admin dashboard

| View | What admins see |
| --- | --- |
| AD-04 Admin Overview | Public page views, estimated unique public visitors where available, mobile screen views, application starts and successful submissions. Make page views and visitor estimates distinct. |
| AD-14 Platform Health | Web loading and responsiveness, mobile stability, request volumes, error rates and p95 response times by workflow. Show sample counts and when data last refreshed. |
| AD-15 Error Explorer | Repeated errors grouped by workflow, platform and release. Show the error category and a safe request ID that authorized engineers can match to logs. |
| Integrations and Notifications | EmailJS and FCM queued, accepted and failed counts. Show delivery only when confirmed. Show Gemini failures, timeouts and guidance fallback. |

Filter by date, platform, environment and release. Keep preview data out of production totals. Report missing data as unavailable. The p95 is the duration at or below which 95 percent of the measured operations completed.

## CEDA Pixel and monitoring

CEDA Pixel is the first-party activity tracker proposed for the CEDA website and Expo app. Both clients send a small set of approved events to a CEDA endpoint. Start with page view, screen view, workflow step completed and workflow step failed. Record the event type, route template or workflow step, platform, release, environment, and deduplication key. Accept a bounded duration, controlled outcome code and opaque request ID where useful. Validate and rate-limit intake. A failed telemetry request must never interrupt an application.

| Signal | Source and use |
| --- | --- |
| Public traffic | CEDA Pixel page views or Vercel Web Analytics. Pick one source for each dashboard metric. Label whose data is shown and the reporting period. |
| App activity and workflow drop-off | CEDA Pixel screen and step events. Use these to see where users stop or fail. |
| Applications submitted and receipts issued | Supabase records. Derive official totals from committed state transitions. |
| Slow web pages and failed requests | Vercel Speed Insights on approved public routes and redacted server logs. Time upload, validation, database and Storage stages separately when tracing an application bottleneck. |
| Android crashes and slow operations | Firebase Crashlytics and Performance Monitoring on Spark after verification in the native development build. Provide authorized engineers with restricted provider diagnostics. |

Meta Pixel, if requested for campaign measurement, is a separate integration for approved public marketing pages. Establish its privacy and consent configuration before enabling it. Applicant, assessor, support and admin surfaces use CEDA's operational telemetry.

## Database and access

Use the planned operational_metrics table for aggregate dashboard counts and latency summaries. Add a restricted telemetry_events table only for samples needed to compute those metrics. For wider windows, calculate percentiles from retained samples or mergeable distributions. Daily percentiles cannot be averaged to produce a weekly percentile. Start with a proposed 14-day raw sample retention period and confirm it before live collection.

Only authorized admin roles can read approved aggregates. Restrict detailed diagnostics and exclude raw telemetry from public Data API grants. Exclude applicant and account identifiers, names, email, access tokens, raw URLs, query strings, file names, answers, chat text and review content. Keep audit records separate. Disable session replay and advertising identifiers. Configure an allowlist and sanitize SDK events before enabling public analytics.

## Hackathon implementation and verification

1. Add the event contract and redacted server logging with the first web release. Expose basic counts, error rates and slow steps in the existing admin views.
2. Use Vercel Hobby analytics and Speed Insights only where eligible and within quotas. Keep required workflow totals in Supabase. Enable mobile diagnostics through Firebase Spark after the Android build is available.
3. Verify two test visits, one successful submission, a failed upload, a deliberately slow test endpoint, a failed telemetry request and denial of dashboard access after admin session revocation. Verify an Android test crash and show which release produced it.

## Provider references

- [Vercel Web Analytics](https://vercel.com/docs/analytics)
- [Vercel Speed Insights](https://vercel.com/docs/speed-insights)
- [Firebase Spark pricing](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Firebase Crashlytics](https://firebase.google.com/docs/crashlytics)
- [Meta Pixel event documentation](https://developers.facebook.com/docs/facebook-business-extension/fbe/guides/pixel-events)
