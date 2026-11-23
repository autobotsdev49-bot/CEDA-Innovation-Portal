# CEDA Innovation Portal — Full Technology Stack

This document details every language, framework, database, cloud service, security control, and build tool used across the **CEDA Innovation Portal** (Web, Mobile, and Backend).

---

## 1. Runtime & Language Foundation

| Component | Technology / Version | Details |
| --- | --- | --- |
| **JavaScript / Node.js** | Node.js `22.20.0` (`.nvmrc`) | Powers static site generation (`scripts/buildPublic.ts`), local preview server (`scripts/previewPublic.ts`), and the native test runner (`node --test`). Uses Node 22 native TypeScript type-stripping with zero external root dependencies. |
| **TypeScript** | `~6.0.3` (Mobile `strict: true`) | Used in `mobile/`, `src/publicSite/` page builders, `src/features/`, and Supabase Edge Functions (Deno). |
| **SQL / PL/pgSQL** | PostgreSQL (Supabase) | Versioned schema, Row-Level Security (RLS), `SECURITY DEFINER` RPCs, and event-driven notification triggers in `supabase/migrations/`. |

---

## 2. Web Portal (`src/publicSite/` → `dist/`)

| Layer | Technology | Details |
| --- | --- | --- |
| **Architecture** | Zero-Dependency Static ES Modules + HTML/CSS | Built by `scripts/buildPublic.ts` into `dist/` (23 routes: public pages `/`, `/process/`, `/eligibility/`, `/sectors/`, `/stories/`, `/help/`, `/contact/` and role portals `/signin/`, `/register/`, `/verify-email/`, `/activate/`, `/account/`, `/assessor/`, `/support/`, `/committee/`, `/admin/`). |
| **Styling** | Custom CSS (`site.css`, `admin.css`, `innovator.css`, `assessor.css`, `support.css`, `committee.css`, `access.css`, `accessibility.css`, `tour.css`) | Zero inline `style=` attributes — fully compliant with strict Content Security Policy (`style-src 'self'`). |
| **Security Headers** | Strict CSP (`dist/vercel.json`) | Protected portal routes enforce `default-src 'none'`, `script-src 'self'`, `style-src 'self'`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, and `Cache-Control: no-store`. |
| **Web Push (FCM)** | Service Worker (`firebase-messaging-sw.js`) + `webFcm.js` | Zero-dependency browser `PushManager` + Firebase Installations / FCM Registrations REST integration (`platform = 'web'`). |
| **Accessibility & Tour** | `accessibility.js` + `tour.js` | Dark mode, multi-step text scaling, high contrast, TalkBack/screen-reader announcements, and interactive spotlight guided tour. |
| **Hosting** | **Vercel** | Static CDN hosting at `https://dist-tau-eight-27.vercel.app/` with per-route caching and security headers. |

---

## 3. Mobile Application (`mobile/`)

| Layer | Technology / Version | Details |
| --- | --- | --- |
| **Framework** | **Expo** `58.0.26` + **React Native** `0.88.1` + **React** `19.3.0` | Cross-platform native app with workspaces for **Innovator**, **Assessor / Lead Assessor**, **Support Officer**, **Committee Observer**, and **Administrator**. |
| **UI & Visual Effects** | `expo-blur`, `expo-linear-gradient`, `react-native-safe-area-context` (`~5.11.1`) | Frosted glass surfaces (`FrostedGlass.tsx`), shared `adminStyleColors`, and consistent header, drawer, and bottom-tab navigation across all roles. |
| **Storage & Device APIs** | `@react-native-async-storage/async-storage` (`^2.2.0`), `expo-device` (`~58.0.5`), `expo-document-picker` (`~58.0.5`), `expo-constants` (`~58.0.16`), `expo-splash-screen` (`~58.0.14`) | Persistent onboarding/accessibility state, hardware info, and private evidence document picking. |
| **Push Notifications** | `expo-notifications` (`~58.1.9`) + `google-services.json` | Native Android/iOS FCM token registration (`useFcmNotifications.ts`) wired across all 5 roles in `NativeAuth.tsx` and `CommitteeWorkspace.tsx`. |
| **Build & Distribution** | **Expo Go** & **EAS Build** (`eas.json`) | Cloud-built standalone Android `.apk` (`preview` profile with `buildType: "apk"`) and Expo Go development workflow. |

---

## 4. Backend, Database & Serverless (`supabase/`)

| Service | Technology | Details |
| --- | --- | --- |
| **Database** | **Supabase PostgreSQL** | Tables for profiles, sectors, innovation applications, evidence documents, assessment rounds/members/scores, support matters, notification templates/queue/devices, and audit logs. |
| **Access Control** | **Row-Level Security (RLS)** + `ceda_private` `SECURITY DEFINER` RPCs | Strict role-based isolation (`innovator`, `assessor`, `support`, `committee`, `admin`) and TOTP Authenticator MFA (`AAL2`) enforcement for privileged actions. |
| **Authentication** | **Supabase Auth** | Email/password sign-in, email verification, staff invitation onboarding (`admininvite`), and TOTP MFA enrollment/verification. |
| **File Storage** | **Supabase Private Storage** | Signed upload/download URLs with MIME, size, and filename sanitization checks for supporting evidence and portal documents. |
| **Edge Functions (Deno)** | 5 Deployed Supabase Edge Functions | • `optimus` — Gemini AI assistant & knowledge-grounded escalation<br>• `fcm-dispatch` — FCM HTTP v1 push delivery with circuit breaker & token cleanup<br>• `email-dispatch` — EmailJS / Resend outbox worker with circuit breaker & retry backoff<br>• `admincreate` — Privileged staff account creation<br>• `admininvite` — Staff email invitation flow |

---

## 5. External Integrations & AI

| Integration | Provider | Purpose |
| --- | --- | --- |
| **AI Assistant (Optimus Prime)** | **Google Gemini API** (`gemini-3.8-flash`) | Context-aware innovator guidance, structured escalation handoff to Support Officers, and accessibility screen summaries. |
| **Push Notifications** | **Firebase Cloud Messaging (FCM HTTP v1)** (`bw-gov-schools-2026`) | Real-time push alerts to Android APK, iOS, and Web browsers via Google OAuth2 service-account JWTs. |
| **Transactional Email** | **EmailJS** (with **Resend** fallback in `email-dispatch`) | Free-of-charge (`P0.00`) submission receipts, clarification alerts, assessor assignments, support ticket acknowledgements, and outcome notices. |
| **UI/UX Design** | **Figma** | Product screens, component design tokens, and user-flow prototypes. |

---

## 6. Testing, Reliability & DevOps

- **Automated Testing (`tests/`)**: `node --test` suite (**120 tests**) covering auth boundaries, admin governance, innovator 12-step readiness, assessor scoring/rounds, committee read-only lifecycle, support live-chat SLAs, notification subscriptions, and CSP compliance.
- **Mobile Type Safety**: `tsc --noEmit` (`npm run typecheck --prefix mobile`) verifying strict TypeScript compilation.
- **Resilience Patterns**:
  - **Outbox Queue + Exponential Backoff** (`notification_queue` leasing via `fcm_lease_queue_batch` and `email_lease_queue_batch`).
  - **Circuit Breakers** (`FcmCircuitBreaker`, `EmailCircuitBreaker`, and Gemini fallback in `optimus`).
  - **In-Memory Caching** (`adminRamCache`, `supportApi` RAM cache) with explicit invalidation on mutations.
- **Version Control**: **Git & GitHub** (`https://github.com/autobotsdev49-bot/CEDA-Innovation-Portal`).
