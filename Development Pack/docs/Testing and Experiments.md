# Testing and A/B experiments

| Layer | Command or evidence | State |
| --- | --- | --- |
| Domain unit tests | `npm test` | Runs as part of the current foundation. Covers pinned versions, rubric checks, role and release gates, guidance, and experiment allocation/reporting. |
| Synthetic walkthrough | `npm run demo:autobots` | Runs without provider accounts. Use for a handover and smoke check. |
| TypeScript, lint and Next.js build | `npm run typecheck`, `npm run lint`, `npm run build` | Add with the app scaffold. Node's syntax stripping runs the source but does not type-check it. |
| Database and RLS | `supabase test db`, plus API-level role isolation tests | Planned after migrations. Use a disposable DB and signed-in role fixtures. Test direct access, revoked access, cross-role denial and transaction races. |
| Browser and accessibility | Playwright and axe, plus keyboard, screen reader, zoom and low-bandwidth manual journeys | Planned after routes exist. Follow [security and accessibility checks](<Security Accessibility and Operations.md>). |
| Human A/B trial | Approved moderated comprehension exercise, then an approved public trial if warranted | Designed. Current tests exercise synthetic assignment and reporting. No participant results exist. |

## EXP-01 · Public evidence guidance

**Question.** Does a short example help visitors pick evidence that supports an innovation claim?

- **A:** “Attach evidence relevant to the application section.”
- **B:** “Attach evidence that supports the claim in this section. For example, include a prototype photo or a relevant test result.”
- **Eligibility and allocation.** Public evidence guidance only. Default off. For a real trial, recruit or enroll as approved. Use a random 128-bit opaque key generated for the experiment alone. Keep assignment stable across eligible visits within the experiment window and remove the key per the approved retention policy. Keep assignment server-side and avoid IDs derived from accounts, IPs or applications.
- **Task.** After reading the copy, ask the visitor which of the same evidence examples best supports a fixed fictional application claim. Match wording, layout, accessibility and delivery across arms apart from the test sentence.
- **Primary measure.** Unique exposed trials with a correct response divided by unique exposed trials for the assigned variant, in a predefined observation window. Record count and denominator. Help requests per exposed trial and accessibility failures are guardrails.
- **Operational rules.** Record exposure only once the selected copy is rendered. Limit the task to one scored answer per trial. Log the outcome without answer text. Process events in durable order and deduplicate. Restrict event access and share aggregate counts only. Keep variant choice out of application records, assessment policy, help availability and release decisions.
- **Decision.** Start with a short moderated accessibility and comprehension review. Before any public trial, register the sample size, duration, minimum useful difference, handling of incomplete trials, privacy conditions and stop rules. Check assignment balance and accessibility issues before interpreting results. Keep A as default if the evidence is insufficient or the alternative introduces an access barrier. Document results and rationale before changing copy.

Record a test run with date in Botswana time, branch or revision, command or steps, synthetic/live environment, outcome, known gaps and reviewer. A PR touching authorization, role visibility or assessment must include a denial case. Keep [development status](<Development Status.md>) aligned with test evidence.