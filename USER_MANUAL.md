# CEDA Innovation Portal — User Manual

Welcome to the **CEDA Innovation Portal** (Web & Mobile). This manual explains how to access, navigate, and use the portal across every user role.

---

## 1. Access & Platforms

- **Live Web Portal**: [https://dist-tau-eight-27.vercel.app/](https://dist-tau-eight-27.vercel.app/)
- **Android Mobile App (EAS APK)**: Download and install the standalone `.apk` from the latest EAS build, or run via **Expo Go** during development.
- **Role-Based Sign-In**: All users sign in from the shared `/signin/` page (Web) or the **Sign in** screen (Mobile). The portal automatically routes you to your assigned workspace:
  - **Innovator**: `/account/`
  - **Assessor / Lead Assessor**: `/assessor/`
  - **Support Officer**: `/support/`
  - **Committee Observer**: `/committee/`
  - **Administrator**: `/admin/`

---

## 2. Public Portal (No Sign-In Required)

1. **Home (`/`)**: Overview of the CEDA Innovation funding and support programme.
2. **Process (`/process/`)**: Step-by-step application, assessment, and award lifecycle.
3. **Eligibility (`/eligibility/`)**: Interactive eligibility self-check before registering.
4. **Sectors (`/sectors/`)**: Active innovation sectors and funding categories.
5. **Stories (`/stories/`)**: Featured Botswana entrepreneur impact stories.
6. **Help (`/help/`) & Contact (`/contact/`)**: FAQs, downloadable checklists, regulatory authority contacts, and CEDA support channels.

---

## 3. Innovator Guide (`/account/` & Mobile)

### 3.1 Register & Verify Email
1. Open **Create account** (`/register/` or Mobile **Sign up**).
2. Enter your full name, email address, and a strong password (minimum 8 characters on mobile / 12–72 bytes on web).
3. Open the verification email in your inbox and confirm your email address, then return to sign in.

### 3.2 Submit an Innovation (12-Step Wizard)
1. Go to **Submit** (or **New Application**).
2. Follow the 12 guided steps (Project title, Sector, Problem & Solution, Market & Impact, Financials, Team, Supporting Evidence uploads, Video link, and Review).
3. Your progress saves automatically as a **Draft** — you can resume anytime from **Overview** or **Applications**.
4. Click **Submit Application** on Step 12. You will receive:
   - An instant **Submission Reference** (e.g., `CEDA-2026-XXXX`).
   - An **In-app notification**, **Email acknowledgement** (free of charge, `P0.00`), and **FCM Push notification** (if enabled).

### 3.3 Track Status, Clarifications & Messages
- **Applications**: Filter by status (`Draft`, `Submitted`, `In review`, `Changes requested`, `Approved`, `Awarded`, `Rejected`) and open any application to view its timeline, download a receipt/outcome letter, or respond to assessor clarification requests.
- **Messages**: Read and reply to threads from CEDA Assessors or Support Officers, and upload requested evidence files.
- **Free Alerts (`Settings → Notifications`)**: Toggle Email, Push, and Portal alerts per application at **P0.00 (no charge)**.

### 3.4 Optimus Prime AI & Live Chat Support
1. Open **Optimus Prime** (floating pill or menu) to ask questions about CEDA eligibility, sectors, and submission steps.
2. If you need human help, click **Escalate to Support / Live Chat**.
3. Live Support Officers are available **Monday–Friday, 09:00–16:00 CAT**. Outside working hours, your request is queued and acknowledged by email.

---

## 4. Assessor & Lead Assessor Guide (`/assessor/` & Mobile)

1. **Overview**: View assigned cases, pending conflict-of-interest declarations, open reviews, and voting deadlines.
2. **My Assessments**:
   - Open an assigned case and complete the **Conflict of Interest Declaration** (`No conflict` or `Recused`) before viewing scoring controls.
   - Score each configured rubric criterion, add comments, and select a recommendation (`Approve`, `Reject`, or `Request information`).
3. **Discussion**: Collaborate privately with panel members on cleared cases.
4. **Lead Assessor Tools** *(Lead Assessors only)*:
   - Assign assessors to panels, open review/voting rounds, monitor panel progress, and release final outcomes (requires Authenticator MFA verification).

---

## 5. Support Officer Guide (`/support/` & Mobile)

1. **Overview**: Set your live availability (`Available`, `Busy`, `Offline`) and monitor 4 live KPIs (Open requests, New requests, Urgent requests, Resolved today).
2. **Support Queue**:
   - Filter by `All`, `New`, `Urgent`, or `Resolved`.
   - Open any ticket to view the Optimus AI handoff summary and reply directly to the innovator in real time.
   - Mark tickets as `Investigating`, `Waiting`, or `Resolved`.
3. **Performance & Playbook**: Track personal turnaround metrics, export Live Chat Analytics CSV, and reference escalation SLAs.

---

## 6. Committee Observer Guide (`/committee/` & Mobile)

- **Read-Only Governance View**: Monitor the full innovation lifecycle pipeline (`Submitted → In review → Changes requested → Approved → Awarded`), view milestone timelines, and share official award briefs.

---

## 7. Administrator Guide (`/admin/` & Mobile)

1. **Overview & Insights**: Monitor portal KPIs, turnaround SLAs, website health, and export audited CSV reports.
2. **Users**: Create staff accounts (`admin`, `assessor`, `support`, `committee`), invite staff by email, and manage account statuses.
3. **Innovations & Sectors**: Manage active sectors (`Published`, `Draft`, `Archived`) and inspect all innovation submissions.
4. **Governance & Configuration**:
   - **Evaluation Criteria**: Configure weighted scoring criteria summing to `100%` and pass marks.
   - **Content Management & Form Builder**: Publish FAQs, notices, regulatory contacts, and custom application form fields.
   - **Optimus Prime**: Tune AI guidance, tone, and knowledge base.
   - **Audit Logs & Account Security**: Review privileged mutation logs and configure TOTP Authenticator MFA.

---

## 8. Accessibility Controls

Available on every Web page (floating Accessibility button) and Mobile (`Settings → Accessibility`):
- **Dark Mode / High Contrast** for low-vision readability.
- **Text Size Scaling** (multiple steps up to Extra Large).
- **TalkBack / VoiceOver & AI Screen Summaries** for hands-free navigation.
