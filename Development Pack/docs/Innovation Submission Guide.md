# Innovation submission guide

## What is implemented in the web portal

### Updated submission layout

- The numbered guide stays vertically beside the form on desktop. On narrow screens the horizontal progress guide remains available.
- The previous action is a text link; saving uses a draft icon. Next uses the existing arrow icon.
- Co-founder details request full names, roles and contact details. The beneficiary list now includes older persons.
- Problem, urgency, solution, comparison, impact, stage, implementation and finance answers accept an optional private document directly alongside the relevant text box; files remain visible with a preview action. The separate document-only answer mode was removed. The applicant must still write the short answers required by the server.
- Step 11 shows dedicated individual or company document pickers for certified identity, proof of residence, registration, share/director records and applicable tax clearance. Bank statements are not requested. This step is for applicant records; supporting documents for narrative answers are uploaded alongside those answers.
- Step 12 presents expandable per-step answers and attached file names with preview and text-link edit controls. The separate full-application preview action was removed.
- Short keyboard-focusable question-mark help is available for the title, sector, innovation type and core technology fields. Add similarly specific guidance to remaining unfamiliar questions as content is finalized.

- The existing twelve-step draft wizard now has a numbered, linked progress track. Completed steps use bright green and a checkmark; the current step uses light green with a dotted outline; pending steps are grey. Every step remains available by keyboard, with labels and states that do not depend on color alone.
- The Problem, Solution, and Implementation steps offer two modes: write a short answer, or write a short note and link a previously uploaded document. Required short answers remain because the submission backend needs comparable summaries. Document mode also requires a valid saved private file in the corresponding section. One proposal can serve both Problem and Solution.
- The Supporting evidence step shows a conditional individual or registered-company document guide. It distinguishes material useful for the innovation review from identity verification and funding-specific due diligence. It does not make certified copies or bank statements mandatory for an early innovation draft.
- Applicant details include an optional alternative contact, limited to contacting someone when the innovator cannot be reached. A partially completed contact or missing agreement prevents submission; it is not assessment evidence.
- File categories now include proposals, project plans, financial projections, identity, residence, company registration, shareholder/director records, and bank statements. Four files remain available in each standard section, with twelve in Applicant and eight in Financial and supplementary. File size remains 10 MB.
- The review preview identifies the linked supporting files. Submission readiness rejects links to missing or removed files. `20261121050000InnovationDocumentValidation.sql` also validates document-backed answers and optional-contact agreement during the server's draft-to-submitted transition. `20261121051000InnovationEvidenceLimits.sql` extends the original private upload limits while retaining the owner and file checks.

## Where to find the implementation

| Area | File |
| --- | --- |
| Web form markup | `src/publicSite/innovator.ts` |
| Form, document guide, and submission readiness | `src/publicSite/assets/applicationWizard.js` |
| Browser draft, upload, and progress behavior | `src/publicSite/assets/innovator.js` |
| Wizard layout and progress styling | `src/publicSite/assets/innovator.css` |
| Database submission guard | `supabase/migrations/20261121050000InnovationDocumentValidation.sql` |
| Upload limit migration | `supabase/migrations/20261121051000InnovationEvidenceLimits.sql` |
| Focused tests | `tests/innovatorPortal.test.js` |

## Next steps

1. Apply the two new migrations to the connected Supabase project in order, then test an individual and a registered company with real accounts and private uploads. Until migrations are applied, the server still enforces four files per section and does not enforce linked-document or optional-contact checks.
2. Check on a mobile browser that the progress track scrolls, form fields remain accessible with the keyboard, and a saved draft restores selected document links.
3. Finish the mobile document checklist and category picker. The mobile progress colors and document-backed answer choices are in place, but the mobile upload category selector is not yet complete.
4. Decide with CEDA which funding facility asks for which certified records, bank statement periods, and retention period before making any sensitive document mandatory. Confirm the purpose and access policy for alternative contact data.

## Verification

`npm run build` generates the web pages. Targeted tests for document links, removed files, applicant checklists, and upload limits were added. A complete test run and live Supabase migration/application verification are still pending.
