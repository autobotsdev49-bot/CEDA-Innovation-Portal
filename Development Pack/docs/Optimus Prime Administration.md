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

## Build status

The Admin overview now labels AI, website and portal monitoring as not connected. The Optimus Prime panel is a roadmap placeholder. No AI guidance editor, server endpoint or telemetry pipeline has been implemented yet.

## Next steps

1. Define the approved CEDA knowledge sources, ownership and review cadence.
2. Implement the shared server-side AI endpoint and secret handling.
3. Add versioned guidance storage and Admin draft/preview/test/publish/rollback workflow with audit.
4. Add privacy-conscious AI and web telemetry, then connect truthful dashboard metrics.
5. Test prompt injection, unauthorized changes, unsafe answers, handoff and reduced-motion/accessibility behavior.
