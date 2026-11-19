# Platform Setup

## Hackathon budget

The spending limit is USD $0. Use no-cost plans and the Vercel-provided deployment URL. Keep billing upgrades, free trials with paid rollover, paid build queues, paid domains and app-store purchases outside the hackathon setup. Check account eligibility and available quotas before enabling traffic. The owner of each integration records the test environment, provider plan, quota and smoke-test result in Development Status.

| Service | Setup and limit | If unavailable |
| --- | --- | --- |
| Vercel Hobby | Link the team Git repository after access is verified and the Next.js build passes. Verify the noncommercial demo qualifies for Hobby and use the provided URL. Keep preview secrets and synthetic data separate. | Keep the local demo runnable. Resolve plan eligibility or account access before publishing. |
| Supabase Free | Set up Auth, PostgreSQL with Row Level Security, and private Storage. Check quotas, Auth email and project availability before judging. | Use an isolated local development environment and verify the hosted environment before relying on it. |
| EmailJS Free | Connect a test sender and one generic portal-notification template. Free plan lists 200 requests per month and two templates. The Node.js server owns recipient selection and credentials. Verify private-key and server-side access in the chosen account. Keep Auth invitations and resets on the separate authorized Supabase Auth delivery path. | Keep the in-app notice. Mark an attempt deferred or blocked if the service is down or over quota. |
| Firebase Cloud Messaging (FCM) | Create a Firebase Spark project, register the Android app, and configure server-side FCM HTTP v1 or the Firebase Admin SDK. Use device tokens associated with the signed-in user and update them on rotation and sign-out. | Keep the in-app notice and report delivery status. Stop sending to invalid tokens and avoid repeated retries. |
| Google Gemini Developer API | Use a free-tier Google AI Studio project with billing disabled. Start with Gemini 3.1 Flash-Lite where the project offers free quota. Confirm account limits, configure request and output caps, and keep the API key on the server. | Return approved deterministic guidance or offer human handoff when quota, latency or provider availability blocks Gemini. |
| Expo | Build and install an Android development APK locally with Android Studio tooling. Expo Application Services Free is an optional cloud build path within its queue and quota. | Use a local build or an existing eligible free build slot. Defer paid distribution. |

## End-to-end delivery

Use the existing portal database as the durable source of notifications. The application transaction creates the appropriate in-app record and queues external delivery. An authorized server-side worker leases delivery work, enforces provider and application quotas and records outcomes. Retries are bounded and use backoff. Reserve part of the EmailJS quota for verification runs. Use generic notification text and a sign-in link or approved app route. Keep application evidence, review scores and sensitive decisions behind authorization.

Free-tier Gemini receives server-selected public topic IDs and reviewed public knowledge excerpts. Resolve topics locally or from structured UI choices. Keep raw conversations, applicant names, contact details, uploads, transcripts and assessment content inside the portal. Return verified source references and keep the approved lookup and human support path available.

## Mobile stack

| Layer | Choice |
| --- | --- |
| App, navigation and styling | React Native with Expo and TypeScript, Expo Router, native components, StyleSheet and shared design tokens. Keep screens in root mobile/app and feature code in root mobile/src. |
| Identity and sessions | Supabase Auth with the Supabase JavaScript client and a secure device session storage adapter. Clear local session and disable the device registration on sign-out. |
| Backend and data | Use the same versioned CEDA HTTP API and PostgreSQL records as the web app. Share types and request contracts as a small package only when both clients have actual consumers. |
| Applications and evidence | Native wizard, server-side draft autosave, Expo DocumentPicker for selected evidence and private upload authorization. Keep the app resumable from the last server-saved version. |
| Notifications | Expo Notifications obtains the native Android FCM token in a development build and handles notification taps. The Vercel backend sends to FCM. The mobile app opens the target screen after checking the active session and access. iOS push uses Apple Push Notification service (APNs) and needs a separate credential and distribution decision. |
| Builds and tests | Android Studio and an installed debug/development APK first. Test sign-in, resume a draft, push permission denial, token rotation, notification tap and revoked access on a physical device. Use TalkBack and font scaling checks. |

Start with Android sign-in, receipt/status and one push deep link. Extend into the native wizard, evidence and support after the corresponding web API is stable. The responsive web app remains available on iPhone during the hackathon.

## Foundation acceptance checks

1. A Vercel preview and the Android build connect to the same synthetic Supabase environment. Verify the preview environment and provider plan.
2. One test application creates a draft, submits and produces a durable in-app receipt.
3. The same event reaches a designated test inbox through EmailJS. The audit record captures the attempt and provider outcome without exposing credentials.
4. The event reaches an Android test phone through FCM. Verify foreground and background behavior and the tapped route after sign-in.
5. Optimus Prime answers an approved public topic using Gemini. Force a provider failure and confirm the approved lookup or human handoff still works.
6. Inspect quota counters and confirm all channels stay on no-cost plans. Record completed, skipped and blocked checks separately.

## Provider references

- [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- [Supabase Free plan](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [EmailJS pricing](https://www.emailjs.com/pricing/) and [server credential options](https://www.emailjs.com/docs/sdk/options/)
- [Firebase Cloud Messaging](https://firebase.google.com/products/cloud-messaging) and [server setup](https://firebase.google.com/docs/cloud-messaging/server-environment)
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) and [data terms](https://ai.google.dev/gemini-api/terms)
- [Expo Router](https://docs.expo.dev/router/introduction/), [native push](https://docs.expo.dev/push-notifications/sending-notifications-custom/) and [Expo plans](https://docs.expo.dev/billing/plans/)
