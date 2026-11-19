# User flows and screen handoff

## Public and innovator

| Reference | MVP route or surface | Acceptance and alternatives |
| --- | --- | --- |
| PUB-01–07 | Home, eligibility, how it works, submission guide, sectors, FAQs/help, contact | Direct links to start, sign in and request text help. Clear public/private transition. Sector directory displays published entries only. |
| AUTH-01–05 | Sign up, sign in, verify and recover account | Verify identity before opening a draft. Preserve a safe intended destination. Handle expired link, missing verification, session timeout and assisted recovery. |
| APP-01–08 | Application wizard, review, receipt | Choose individual or registered company. Render seven adaptive sections using the field dictionary in Innovator.md. Show saved/pending/error state and recover on reconnect. Warn when changing type/stage discards conditional answers. |
| PORT-01–10 | Dashboard, applications, detail, timeline, messages, requests, feedback and account | Receipt and safe timeline. Keep panel work private. Clarification allows only requested fields/slots. Return to prior draft, handle expired requests and show released outcomes. |
| SUP-01–06 | Optimus Prime and human support | Available from public pages, field help and signed-in workspace. Persist account-owned or guest-bound history. |
| MOB-01–06 | Responsive reference | Use web layouts for the demo. Expo follows a stable web/API baseline. |

Applicant states use a public vocabulary such as Draft, Received, Under review, More information requested and Outcome available. Keep screening, voting, holds and moderation internal. Final submit checks complete applicable answers, consent and required clean evidence. Store a version and return its stable receipt. More information requests create scoped response versions and preserve history. Allow video links as HTTPS URLs shown as links. Keep four files per eligible section by default and make any extra slots reviewer-request-specific.

## Assessment

1. Manager opens a scoped intake, screens the case and records reason/action. The manager chooses a panel, pins the rubric and voting policy, sets deadlines and starts review.
2. An assessor enters via the scoped library or My Assessments. Verify current assignment and conflict declaration before granting case details or files. Conflict triggers recusal and alerts the manager. Manager replacement preserves history.
3. Assessors draft privately, score all six criteria 1–5, cite evidence and submit once. Peer scorecards become available per round policy. Manager monitors completion and opens voting after eligibility and quorum checks.
4. Assessors vote on a recommendation. More than half the valid eligible ballots is a majority, subject to configured quorum and frozen eligibility. A 2–2–1 result blocks release. Further information or reassessment creates a logged follow-up and preserves old work.
5. Authorized manager previews applicant-facing feedback and releases with fresh staff verification, release authority, valid recommendation, no hold and safe feedback. The applicant sees a new timeline item and receives an in-app notification. Assessment and release are independently audited. Demo role separation prevents a reviewer from releasing their own scored round.

Use AS-01–13 and ASM-01–04 for available local markup; AS-14 onward and manager screens are specified in the role files. `AM-` appears both in the manager specification and mobile admin files. Use `manager/AM-*` and `admin-mobile/AM-*` in issues. Each role's route grouping and title use its own role spec.

## Admin and account lifecycle

| Journey | Surface and behavior | Privileged guard |
| --- | --- | --- |
| Bootstrap | Restricted provider-side process creates two named custodians, activates reviewed grants and enrolls MFA. First login shows assigned access. | No public staff self-enrollment. Verify last active custodian protection. |
| Invite and activate | AD-06–10. Enter staff email, predefined role(s), permitted sector(s), expiry and reason. Review changes, issue provider invite, and accept using verified identity/MFA. Display pending, expired, failed or active state. | Live grant/scope checks and audit. Require a different approving custodian for admin privileges, cross-sector staff expansion and override actions. |
| Manage users and sessions | AD-06/07/11. Directory searches authorized fields. Detail shows active/pending/expired grants, last activity and limited session view. Admin can revoke one session or all, suspend and restore under policy. | Session status inferred from valid heartbeat/activity and expiry. A label such as Active session or Last seen is preferable to precise online presence claims. Suspension and role checks apply before protected reads. |
| Reset credentials | AD-11. Admin initiates verified provider recovery from the portal, with reason, audit and masked destination. User follows a single-use recovery link and sets their secret. Confirm revocation for compromised accounts; independent identity proof for MFA recovery. | No staff password display or manually assigned permanent password. Require fresh staff MFA. Failure surfaced safely and retriable. Existing credential hashes remain provider-owned. |
| Manage sectors | New `/staff/admin/sectors` and `/staff/admin/sectors/[id]`. Create as many distinct sectors as needed, edit published-safe labels/descriptions, set order, publish and archive. Show affected drafts, cases and grants on archive. | Separate catalogue permission; stable slug and audit history. Archived entries disappear from new selection while historical references and valid old grants remain. Test primary versus secondary scope. |
| Manage operations | AD-04/05/12–16 and detailed Admin.md concepts. Health, restricted audit, knowledge publication and approved aggregates. Consolidate operational views for the demo. | Avoid exposing private applications and transcripts through search, reports or logs. Keep administrative and decision powers separate. |

## Support and Optimus Prime

- A visitor asks Optimus Prime for guidance on a public page or within the wizard. Offer approved sources and a clearly labeled human option. Securely verify the returning guest before restoring a conversation on a new device. Never use a ticket reference as identity.
- On handoff, preserve only authorized context in the same conversation. A queued visitor sees their own position and textual status. Preview is read-only. Officer claim is atomic and supports configurable capacity. Refresh from source of truth on reconnect. When the queue is unavailable, show a text recovery path and service status.
- Officer sees a minimized queue, own assigned tickets, public replies and separate internal notes. Application lookup requires an approved purpose, verified requester and scoped read that returns only permitted status information.
- Resolve or close with reason. History stays readable to authorized participants. A late send fails with a visible state and preserves the unsent text in memory. Reopen or create a linked ticket only by documented policy.
- Use SO-01–14 and SOM-01–04 from the mockups and Support Officer.md for detailed states. Use scoped channel events only after policy testing. Show reduced-motion and keyboard-safe dialogs, status announcement, caption/transcript support and no audio-only alerts across all roles.

## Screen reference map

| Local source | Use |
| --- | --- |
| [Innovator and public mockups](<../Innovator and Public Website Screens/README.txt>) | PUB, AUTH, APP, PORT, SUP and MOB |
| [Admin mockups](<../Admin Screens/README.txt>) | AD-01–16 and admin mobile AM-01–03 |
| [Assessor mockups](<../Assessor Screens/README.txt>) | AS-01–13 and ASM-01–04 |
| [Lead assessor screen references](<../Lead Assessor Screens/>) | Manager/lead-assessor boards and LM/ML concept screens |
| [Support mockups](<../Support Officer Screens/README.txt>) | SO-01–14 and SOM-01–04 |
| [Role specifications](<../Our Vision/>) | All five role specs, including manager screens without a matching local mockup family |

Use screen IDs in issues and route tests. Keep fixture names, counts and outcomes synthetic. Confirm policy and labels against the role specifications during implementation.

Screen identifiers retain their original form in stories and issues. A file for AD-01 is named AD 01.png or AD 01.html on disk.
