# CEDA Innovation mobile app

The Expo app is the public mobile entry point for CEDA Innovation. It launches with the CEDA logo and introduces new users to the portal before opening the portal welcome screen. The onboarding and welcome images are bundled with the app.

| Action | Opens |
| --- | --- |
| Submit an innovation | The native Innovator sign-in screen |
| Create an account | The native sign-up screen, with email confirmation through the hosted callback |
| Read the eligibility guide | The website’s public submission guide |

The app uses Supabase for email and password authentication. After sign-up, open the verification link in the inbox, return to the app, and tap **I have verified my email**. A successful check shows an account-created celebration before opening signed-in Home. Users can also tap **Continue to Home**. The full Innovator workspace and submission form are the next mobile milestone.

## Run locally

Use Node.js 22.20.0. From the project root, run:

```powershell
cd mobile
npm ci
npm run typecheck
npm start
```

Set the existing project publishable key in .env.local if it is missing from the development environment. Open the project in a compatible Expo Go version or development build to check the native forms and email verification handoff. Verify the branded native splash in a preview or production build on a device. [Expo splash screen testing](https://docs.expo.dev/versions/v58.0.0/sdk/splash-screen/)

`App.tsx` manages the launch flow and browser links. `app.json` configures the native splash. The logo comes from the same [official CEDA asset](https://www.ceda.co.bw/sites/default/files/logo_2.png) used by the website.

## Mobile authentication security

| Where | What it does |
| --- | --- |
| `NativeAuth.tsx` | Validates the forms, blocks duplicate submissions, and clears passwords when a validated request starts or the app enters the background. |
| `VerifyEmail.tsx` | Shows a dedicated verification screen. Resend unlocks after 60 seconds and starts a fresh countdown after a successful resend. The screen honors Supabase retry times and displays instructions when the email is still unverified. |
| `VerificationSuccess.tsx` | Plays a brief confetti burst after verification succeeds and opens Home automatically. With Reduce Motion enabled, the confetti stays still. |
| `auth.ts` | Uses the Supabase publishable key over HTTPS. Sign-up submits the name, email and password, and Supabase assigns the Innovator role. Any unexpected sign-up session is discarded. Sign-in checks the confirmed Supabase identity and reads its active Innovator profile before opening the account screen. |
| Supabase `public.profiles` | Row Level Security limits profile reads to the active account owner. Authenticated users cannot update profile roles or account status through the table. |
| `App.tsx` and `NativeAuth.tsx` | Hold separate retry deadlines for the two forms while the app is running. The countdown uses the server's retry time when provided, with a 60-second app fallback. Supabase enforces its own limits, which can include shared network or project limits. |

The app keeps the access token in memory and expires it after at most one hour, or sooner if Supabase gives it a shorter lifetime. Sign-out immediately clears app access and requests revocation of the current Supabase session. An issued access token expires according to Supabase's token lifetime.

The pending sign-up flow retains the submitted password only in memory for up to 15 minutes so it can authenticate after the user opens the inbox link. Leaving the verification screen or signing in clears it. If the app closes or the window expires, the user can confirm their email and sign in with their password. Supabase still checks the confirmed identity and active Innovator profile before Home opens.

Run `node --test tests/mobileAuth.test.ts` from the repository root. The tests simulate pending and confirmed accounts, inactive profile rejection, resend requests and provider retry times. A real-device check with a fresh email address is pending. Tap the verification button before confirming, check the resend countdown, open the latest inbox link, return to the app and confirm that the celebration appears before Home.

## First launch onboarding

`App.tsx` displays the CEDA logo on white for 1.6 seconds on each fresh launch while the app checks the local onboarding preference. The splash then fades into the next screen over 650 milliseconds. The app skips the fade when Reduce Motion is enabled. The native launch screen gives way to this in-app splash as soon as the logo loads, so the CEDA splash also appears in Expo Go. New users see three illustrated screens explaining how to bring an idea to CEDA, prepare supporting evidence and follow an application. The photos fade into white below the subject. Next and Back stay in a fixed footer, and the image height adjusts to the space available for the copy. Users can leave the introduction with Skip. Finishing or skipping saves only a completion flag on this device. **Explore the portal** and **Skip** open the welcome screen. Returning users land on the welcome screen after the splash.

`Onboarding.tsx` contains the screens and navigation. Three onboarding photos and a separate welcome portrait are bundled in `assets`. They illustrate typical scenarios. The screen-reader announcement includes the step and heading, and the layout scrolls as needed at larger text sizes.

On a device, check the native splash, first launch, Next and Back, Skip and app restart. Verify focus order and the step announcements with TalkBack and VoiceOver during the planned accessibility pass.

## Visual theme and accessibility testing

Onboarding and welcome use the CEDA colours, a full-width photo, a translucent header and a white fade above the copy. Sign-in and sign-up use separate generated portraits, warm frosted-glass panels and a solid fallback when blur is unavailable. The screen keeps scalable text, readable foreground colours, descriptive action labels and touch targets at least 48 points tall.

After the remaining mobile UI is complete, verify both the native app and the website on real devices.

| Check | Mobile app | Website |
| --- | --- | --- |
| Screen readers | TalkBack on Android and VoiceOver on iOS. Check reading order, action labels and status messages. | NVDA and VoiceOver. Check landmarks, headings, labels, errors and focus order. |
| Voice control | Android Voice Access and iOS Voice Control. Activate visible actions by name. | Use browser and system voice controls. Check that visible button names match accessible names. |
| Large text | Test system font and display sizes. Verify buttons remain readable and scrollable. | Test text zoom, narrow viewports and reflow. |
| Visual and motor access | Check contrast, Reduce Transparency, touch targets and switch or keyboard navigation. | Check contrast, keyboard operation, visible focus and reduced motion. |

Include the transition from the native app to browser email verification and back to native sign-in in each relevant test. The full assistive-technology pass is pending.

For the keyboard check, open each field on sign-in and sign-up on Android and iOS. Check that the focused field scrolls above the keyboard when it opens and when changing fields with the keyboard still open. Pay particular attention to Password and Confirm password on small screens and at large text sizes. `NativeAuth.tsx` wraps both forms in a KeyboardAvoidingView and scrolls the focused field into the resized viewport. `app.json` configures Android to resize the window when the keyboard opens.

