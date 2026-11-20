# Sign-in and sign-up security handover

The CEDA Innovation Portal uses Supabase Auth for email and password authentication. The public forms are deployed on Vercel. Private Innovator access requires a confirmed email and an active profile. The full Innovator dashboard, public email delivery acceptance and staff authentication are separate milestones.

## Authentication and input handling

| Control | How it works | Where to find it |
| --- | --- | --- |
| Credential handling | The browser sends credentials over HTTPS directly to the configured Supabase Auth origin using a publishable key. Auth requests omit browser cookies, reject HTTP redirects and request no caching for signup and sign-in. The application clears password inputs after sign-in and keeps them in the form for a retry only when sign-up is rate-limited. Supabase handles password verification. | `src/publicSite/assets/signupApi.js`, `signin.js`, `signup.js` |
| Sign-up validation | The form requires a name, valid email, matching passwords and a password of at least 8 characters and at most 72 UTF-8 bytes. Names allow ordinary punctuation and reject angle brackets, control characters and bidirectional formatting controls. The profile trigger independently checks untrusted names and uses a neutral display name if invalid. | `src/publicSite/access.ts`, `signupApi.js`, migration `20261119215809_harden_innovator_auth.sql` |
| Verification and role assignment | Supabase confirms email ownership. The database creates the active profile and assigns the Innovator role after confirmation. Unverified users attempting sign-in can return to verification without automatically sending another email. | Migration `20261119181502_innovator_signup.sql`, `signin.js`, `verificationScreen.js` |
| Account access | Sign-in checks the verified identity and active Innovator profile before opening `/account/`. Supabase row-level security allows authenticated users to read only their own active profile. Anonymous users cannot read profiles. Browser roles cannot modify account status or role. | `signupApi.js`, `verifiedAccount.js`, migration `20261119215809_harden_innovator_auth.sql` |
| Browser protections | Sign-in, sign-up, verification and account pages serve a Content Security Policy that restricts scripts to the portal and API connections to Supabase. It blocks iframe embedding, injected base URLs and native form submissions. Auth responses use `no-store`, `no-referrer` and `nosniff`. | `scripts/buildPublic.ts` generates `dist/vercel.json`. |
| Verification and session handling | The callback removes credentials from the URL. When verification opens in another tab of the same browser, the receiving verification page rechecks the token and email with Supabase. The temporary account stores the access token in session storage for the active tab and uses no refresh token. Log out clears the local token and requests revocation of the current Supabase session. | `verificationScreen.js`, `verificationSession.js`, `verifiedAccount.js` |

## Rate limiting

| Layer | Implemented behavior |
| --- | --- |
| Supabase Auth enforcement | Supabase decides whether to accept password attempts, signup and verification email requests. It rejects throttled requests with HTTP 429. Its limits have different scopes. Some are per IP, so a shared network can share a request limit. Email sending also has a project-wide quota. Supabase documents a built-in sender limit of two emails per hour across the project. When that quota is reached, applicants on different networks can also be affected. [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits) |
| Browser cooldown after an accepted request | Sign-up and resend apply waits of 1 minute, 5 minutes and 1 hour after successive accepted requests for the same email address in the current tab. The countdown discourages repeated sends and uses an absolute deadline that survives a refresh of that tab. |
| Sign-up and resend after HTTP 429 | The portal uses a usable provider retry time when available. Without one, it offers a one-minute recheck for a project email quota response and a five-minute suggested wait for a general request limit. The one-minute recheck gives the user a time to retry. Supabase still decides whether that retry can succeed. The project quota countdown is restored even before the user re-enters their email address. |
| Sign-in after HTTP 429 | Sign-in displays the provider's retry time when available. Otherwise it asks the user to try again in a few minutes. Sign-in keeps its retry messages separate from the verification email countdown. |

The request handlers are in `src/publicSite/assets/signupApi.js`. The tab-scoped countdown and its persistence are in `verificationCooldown.js`. The countdown helps guide users. Supabase remains the enforcement point across browsers and devices.

## Verification and remaining work

- The authentication hardening release passed 22 automated tests. The tests cover signup request handling, name validation, password-grant sign-in, unconfirmed email, inactive profiles, HTTP 429 responses, countdown restoration and logout. The deployed auth response headers and hosted profile access rules were also checked.
- A live signup and sign-in with a controlled inbox remains to be recorded. Confirm email delivery and the callback at `https://ceda-innovation-portal-nine.vercel.app/verify-email/`, then verify that the profile appears only after confirmation and that logout returns the user to the public site. Do not record passwords or tokens in test evidence. Keep email confirmation enabled. [Supabase SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp)
- Local builds default to preview. For isolated Auth testing set `CEDA_SIGNUP_ENABLED=true`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the build environment. Allowlist the exact test callback in Supabase and run `npm run build` or `npm run dev`.
- CAPTCHA remains pending and requires a provider widget and server-side configuration in Supabase. The security advisor reported leaked-password screening disabled after the migration. Supabase lists that feature for Pro and above. [CAPTCHA configuration](https://supabase.com/docs/guides/auth/auth-captcha) and [password security](https://supabase.com/docs/guides/auth/password-security)
