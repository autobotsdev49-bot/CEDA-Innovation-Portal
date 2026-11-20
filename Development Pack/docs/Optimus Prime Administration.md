# Optimus Prime administration

Updated 20 November 2026.

## Purpose

Administrators will be able to manage the approved instructions and knowledge Optimus Prime uses to help people in the CEDA Innovation web portal and mobile app. The goal is to keep answers consistent, clear, accessible and grounded in current CEDA guidance.

## What Admins can configure

- Response tone, reading level, length and supported languages.
- Topics Optimus Prime may answer and the approved CEDA knowledge sources it may use.
- When it should say it does not know, point to an official source, or offer a Support Officer handoff.
- Accessibility guidance, including plain language and screen-reader-friendly formatting.
- Draft preview, test questions, publish, rollback and version history.

## What this does not mean

The Admin is not fine-tuning Gemini's model weights. Admin changes are versioned instructions and curated source material supplied to the AI service at request time. Optimus Prime must not grant account access, change roles, expose another user's information, or make official eligibility, assessment or funding decisions. Database policies and application services remain authoritative.

## Security and publishing

Only active Admins with the required assurance may edit or publish. Store revisions with editor, timestamp, reason, status and version. Test a draft against representative and adversarial prompts before publishing. Keep secrets, private applicant records and credentials out of prompts and knowledge sources. Treat retrieved documents and user input as untrusted content; neither can override system safety rules. Keep a fast rollback to the previous approved version.

## Shared web and mobile behavior

Both clients must call the same server-side AI endpoint. The endpoint loads the currently published guidance and approved knowledge, enforces quotas and output handling, and records privacy-conscious performance data. The Gemini API key remains server-side. Do not send it to browser or Expo code.

## Performance measures

Track request count, successful response rate, response latency (including percentiles), timeout/error rate, fallback or human-handoff rate, and token/cost usage where available. Track website performance separately with Core Web Vitals: Largest Contentful Paint, Interaction to Next Paint and Cumulative Layout Shift. Portal operations can add sign-in, API failure and key workflow timings. Display metrics only when collected by real telemetry; distinguish missing data from zero activity and provide time range and last-updated time.

## Admin dashboard status

The overview now has a dashboard preview with portal visit bars, Core Web Vitals, an Optimus Prime health summary, active visitor status, and recent activity. Preview figures are explicitly labelled as sample data. Active visitors and recent activity say they are awaiting telemetry; no synthetic values are presented as real CEDA traffic or AI operation.

The source is in `src/publicSite/admin.ts` and `src/publicSite/assets/admin.css`. The chart is responsive and uses text and accessible chart descriptions. Live telemetry, the shared AI endpoint, and the guidance editor are not connected yet.

The Supabase connection available during this change did not include the Ceda Innovation project. Do not apply telemetry schema changes to a different project. Once the correct project connection is available, implement a privacy-reviewed event collector, Admin-only aggregate read, retention policy, and replace each sample series with actual data. Track session activity without storing email, submitted form content, or raw IP addresses. Optimus Prime metrics must come from the shared server-side AI endpoint; do not report sample responses as real model health.

## Next steps

1. Define the approved CEDA knowledge sources, ownership and review cadence.
2. Implement the shared server-side AI endpoint and secret handling.
3. Add versioned guidance storage and Admin draft/preview/test/publish/rollback workflow with audit.
4. Add privacy-conscious AI and web telemetry, then connect truthful dashboard metrics.
5. Test prompt injection, unauthorized changes, unsafe answers, handoff and reduced-motion/accessibility behavior.


## Optimus Prime design and modal interactions, 20 November 2026

Completed locally: Optimus Prime dashboard with sample request/success/latency/handoff metrics, a response-time chart, reliability ring and a performance detail table. Modal workspaces let Admins prepare tone, answer length, instructions, human-support triggers, an approved source URL, reviewed knowledge notes and example questions. Draft review renders those values as text. Drafts remain only in memory in the current tab and clear on reload; no prompt is sent to Gemini, URL fetched, model trained, settings published, or server data persisted. Keep draft wording explicit until shared API, approved knowledge storage, MFA-gated publishing, version history and audit are implemented. Successful response status alone is not answer accuracy.

User creation/access editing, sector details/editing/creation and authenticator management now use one reusable native HTML dialog. HTML dialog means a browser-provided modal with background interaction disabled and keyboard focus contained inside it. Close and Escape return panels to their original locations and restore focus when the trigger still exists. Escape is blocked during a pending privileged request. Dialog messages expose validation/network feedback without hiding it behind the overlay. Forms retain the existing protected RPC, MFA and audit boundaries. The dialog is inside the verified workspace and closes when section navigation changes. No duplicated forms or IDs are introduced.

Source: `src/publicSite/admin.ts`, `src/publicSite/assets/admin.js`, `src/publicSite/assets/admin.css`. JavaScript syntax and build checks passed. Browser acceptance is pending (Playwright is not installed): check opening/closing each dialog, tab containment, Escape, focus restoration, validation/error messages, screen readers, large text, small screens, and editing from sector details. Latest changes are local and have not been deployed.
