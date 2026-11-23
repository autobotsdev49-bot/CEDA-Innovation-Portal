# CEDA Innovation Portal

Team repository: [CEDA Innovation Portal on GitHub](https://github.com/autobotsdev49-bot/CEDA-Innovation-Portal)

---

## Mandatory Submission Links & Deliverables

| Deliverable | Link / Location |
| --- | --- |
| **Live Web Solution (Vercel)** | [https://dist-tau-eight-27.vercel.app/](https://dist-tau-eight-27.vercel.app/) |
| **Source Code (GitHub)** | [https://github.com/autobotsdev49-bot/CEDA-Innovation-Portal](https://github.com/autobotsdev49-bot/CEDA-Innovation-Portal) |
| **User Manual** | [USER_MANUAL.md](USER_MANUAL.md) |
| **Tech Stack** | [TECH_STACK.md](TECH_STACK.md) |
| **Android Executable (EAS APK)** | [Latest EAS Android APK Build (`preview`)](https://expo.dev/accounts/jaycoder267/projects/ceda-innovation-portal/builds/f399e8e7-9f6d-459b-80b9-0292aa661a66) |
| **Figma Project Designs** | [CEDA Innovation Portal — Figma Designs](https://www.figma.com/design/C5Bax6H3Z6ZXPznR165Ana/CEDA-Hackthon?node-id=0-1&t=nM6QbMHb8uigmqKL-1) |

---

## Architecture & Repository Structure

**Develop from the repo root (`CEDA INNOVATION HACKATHON`).** Run web commands from the root and mobile commands from `mobile/`.

| Path | Purpose |
| --- | --- |
| `src/publicSite/` | Public pages, role-based web portals (`/account/`, `/assessor/`, `/support/`, `/committee/`, `/admin/`), CSS, and zero-dependency ES modules |
| `src/features/` | Shared domain logic for assessment rounds, Optimus approved guidance, and evidence experiments |
| `mobile/` | Expo React Native app (Android/iOS/Expo Go) with native workspaces for all 5 roles |
| `supabase/migrations/` | Versioned PostgreSQL schema, RLS policies, RPCs, and notification triggers |
| `supabase/functions/` | Deno Edge Functions: `optimus` (Gemini AI), `fcm-dispatch` (FCM HTTP v1), `email-dispatch` (EmailJS / Resend), `admincreate`, `admininvite` |
| `scripts/` | Static site builder (`buildPublic.ts`), local preview server (`previewPublic.ts`), and synthetic demo (`demoAutobotsDev.ts`) |
| `tests/` | Automated test suite (`node --test`) |
| `USER_MANUAL.md` | End-user manual for all portal roles |

---

## Tools & Platform Setup

### Prerequisites
- **Node.js `22.20.0`** (see `.nvmrc`) and **npm**
- **Expo Go** (for quick mobile testing) or **EAS CLI** (for building standalone `.apk` / `.ipa`)
- **Supabase Project** (`inzupertrdvlenrozqep`) — Auth, PostgreSQL, Private Storage, and Edge Functions
- **Firebase Project** (`bw-gov-schools-2026`) — Firebase Cloud Messaging (FCM) for Android, iOS, and Web Push
- **EmailJS** (or **Resend**) — Transactional email acknowledgements & alerts
- **Google Gemini API** — Powers Optimus Prime AI assistant
- **Vercel** — Static web hosting & security headers (`dist/vercel.json`)

### 1. Environment Variables (`.env.local`)
Copy `.env.example` to `.env.local` and populate:
- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL`
- **Firebase Web Push**: `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY`
- **Supabase Edge Function Secrets** (configured in Supabase Dashboard → Edge Functions → Secrets):
  - **EmailJS**: `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY`
  - **FCM HTTP v1**: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`
  - **Gemini AI**: `GEMINI_API_KEY`, `GEMINI_MODEL`

### 2. Run the Web Portal Locally
```powershell
npm test        # Run automated unit & integration tests (120 tests)
npm run build   # Build static portal into dist/
npm run dev     # Build and start local preview server at http://localhost:3000
```

### 3. Run the Mobile App (Expo Go)
```powershell
cd mobile
npm install
npm run typecheck
npx expo start
```
Scan the QR code with **Expo Go** (Android/iOS) or press `a` for Android Emulator.

### 4. Build a Standalone Android APK (EAS Build)
```powershell
cd mobile
npx eas login
npx eas build --platform android --profile preview
```
When the build finishes on Expo, download the `.apk` directly from the EAS dashboard link or scan the install QR code.
