# Contributing to the CEDA Innovation Portal

## Start a change

- Pick an issue with a role, screen or contract, expected behavior, acceptance checks, owner and backup reviewer. Record scope and blocked decisions in the issue before coding.
- Branch from current `main` using `feat/ceda-123-admin-invites`, `fix/ceda-124-draft-conflict` or `docs/ceda-125-handover`.
- Keep PRs small and merge in dependency order. For schema changes, include migrations, policies, seeded test data when necessary, rollout impact and recovery steps.

## Commit and PR conventions

Use `type(scope): imperative summary`. Types include `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci` and `perf`. Use feature scopes such as `auth`, `admin`, `applications`, `assessment`, `support` and `db`.

```text
feat(admin): invite staff with scoped roles
fix(applications): return existing receipt on retry
test(auth): cover suspended staff access denial
```

Include a breaking-change note and migration instructions for contract breaks. Link the issue in the PR. Summarize behavior, screen IDs, test commands and results, accessibility evidence, access changes, migration order and rollback. Squash merge with a Conventional Commit title after required checks and review. Protect `main` from direct pushes once the repo is configured. Require independent review for authorization, schema, privileged operations and deploy changes.

## Implement and verify

- Start with existing UI primitives, domain services and validators. Keep route orchestration thin. Preserve TypeScript strict mode, explicit error states, and server/client boundaries. Avoid credentials and sensitive text in logs, screenshots or fixtures.
- For a feature PR, update its spec, route/API map or README as needed. Capture evidence of the happy path and relevant denied, empty, loading, recovery and keyboard paths.
- Before merge, reproduce checks from a clean checkout. Verify migrations from a fresh database and from the previous demo schema where applicable. Make app and DB rollout order explicit. Restore from backups only with the designated operator's authorization.
- Use original work created during the event and record third-party provenance. Keep signer, license and organizer submission evidence with the team records.

## Ownership and continuity

Assign one primary and backup per domain and configure CODEOWNERS after the GitHub handles are known. Use named provider accounts with MFA and a team-controlled secret store. Record where to obtain access, which owner approves it, and which provider project belongs to each environment.

| Domain | Handover must include |
| --- | --- |
| Web and accessibility | Routes, screen IDs, UI primitives, manual keyboard and assistive-technology evidence |
| Data and security | Migration ledger, RLS map, role matrix, staff onboarding and incident contacts |
| Assessment and reporting | Approved demo rubric/policies, workflow transitions, metric definitions |
| Support and Optimus Prime | Queue policy, recovery behavior, knowledge versions and fallback behavior |
| Deployment and QA | URLs, last green commit, CI, demo fixtures, release and restore runbooks |

At the end of each work session, update the issue with branch/PR, current behavior, evidence, known gaps, and the next action. Record architecture decisions in numbered ADRs with date, owner, options, decision, consequence and a revisit trigger. The first handover is complete when another developer can reproduce a fresh demo and explain where each privileged action is enforced.

Update [development status](<docs/Development Status.md>) with the tested state and next handoff before ending a work session. Follow the [testing and experiments checklist](<docs/Testing and Experiments.md>) before launching a copy experiment. Record whether results came from synthetic fixtures, a moderated trial or public traffic.
## File and folder names

Use clear words with spaces for guide and reference files, and camelCase for source modules with more than one word. Skip underscores and hyphens in project-owned file and folder names. Keep required framework basenames and use identifiers such as screen IDs, route segments, branch names and environment variable keys in their own established formats. If a future tool requires an incompatible generated name, raise it in the setup PR before adopting the tool.

Place application code, scripts and tests at the project root. Keep review notes, design references, handover and current decisions under Development Pack.
