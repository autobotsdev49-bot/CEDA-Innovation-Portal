# CEDA Innovation Portal

Team repository: [CEDA Innovation Portal on GitHub](https://github.com/autobotsdev49-bot/CEDA-Innovation-Portal).

**Develop from this folder: `CEDA INNOVATION HACKATHON`.** Run commands from here and add implementation under the root `src`, `scripts` or `tests` directories.

| Path | Use |
| --- | --- |
| `src/features/assessment/round.ts` | Pinned assessment inputs, review and vote checks, and decision release preparation |
| `src/features/support/approvedGuidance.ts` | Optimus Prime approved guidance and human handoff signal |
| `src/features/experiments/evidenceGuidance.ts` | Evidence wording experiment allocation and reporting |
| `scripts/demoAutobotsDev.ts` | Synthetic command-line walkthrough |
| `tests/autobotsDev.test.ts` | Automated checks for the current implementation |
| `src/publicSite` | Public page layouts, shared navigation, content, and styles. Edit `assets/site.css` for the shared visual theme |
| `supabase/migrations` and `supabase/tests` | Versioned database schema and access-policy checks |
| [Live public preview](https://ceda-innovation-portal-nine.vercel.app/) | Public information, account screens and email verification return |
| [Development Pack](<Development Pack/README.md>) | Guide, progress, decisions, user flows and reference screens |

## Run locally

Use Node.js 22.20.0, recorded in `.nvmrc`. The current baseline has no external package dependencies.

```powershell
npm test
npm run demo:autobots
npm run dev
```

The development command generates the public pages and serves them locally. Run `npm run build` to regenerate the deployable `dist` folder after editing the public site. For the current account release checkpoint and test steps, see [Signup integration](<Development Pack/docs/Signup Integration.md>).

The current web build is static. Sign in and Sign up share an animated interface. The hosted signup form submits to Supabase Auth, and live verification-email delivery still needs an end-to-end check. Sign in is a preview. The TypeScript assessment, support and experiment modules have synthetic coverage. They are awaiting persistence and API integration. The [Database Design](<Development Pack/docs/Database Design.md>) describes the Supabase schema and migration order.

The hackathon stack targets **USD $0**. Vercel hosts the web app and its server routes. Supabase supplies Auth, PostgreSQL and private Storage. EmailJS, Firebase Cloud Messaging and the Google Gemini API are foundation integrations. Use the placeholder settings in [the environment example](.env.example) and the [Platform Setup](<Development Pack/docs/Platform Setup.md>) guide for account setup, limits and the Android smoke test.

[Autobots Dev](<Development Pack/docs/Autobots Dev.md>) explains the product advantage and the rules that support it. [Engineering Choices](<Development Pack/docs/Engineering Choices.md>) explains the stack decisions for junior developers. [Development Status](<Development Pack/docs/Development Status.md>) tracks tested progress and outstanding work.
