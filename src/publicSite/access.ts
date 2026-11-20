import { brand, icon, textLink } from "./components.ts";

type AccessMode = "signin" | "register";

const portalBenefits = [
  "Save a draft and return to it later",
  "Organise supporting evidence",
  "Track updates and see released feedback",
];

function accessForm(mode: AccessMode) {
  const isRegistration = mode === "register";
  const name = '<label>Full legal name<input name="fullName" type="text" autocomplete="name" required maxlength="120" aria-describedby="applicant-name-error"><small id="applicant-name-error" data-signup-name-error role="status" hidden>Enter your name without angle brackets or control characters.</small></label>';
  const email = '<label>Email address<input name="email" type="email" autocomplete="email" required maxlength="254"></label>';
  const passwordField = (label: string, name: string, autocomplete: string, revealLabel: string) =>
    `<div class="access-password"><label>${label}<input name="${name}" type="password" autocomplete="${autocomplete}" required${isRegistration ? ' minlength="8" maxlength="72"' : ""}></label>
    <button type="button" class="password-toggle" data-password-toggle="${revealLabel}" aria-label="Show ${revealLabel}" hidden>
      <span data-password-show>${icon("eye")}</span><span data-password-hide hidden>${icon("eyeOff")}</span>
    </button></div>`;
  const password = passwordField("Password", "password", isRegistration ? "new-password" : "current-password", "password");
  const confirm = passwordField("Confirm password", "confirmPassword", "new-password", "confirmation password");
  const fields = isRegistration
    ? `${name}${email}${password}${confirm}`
    : `${email}${password}`;

  return `<section class="access-content" aria-labelledby="access-title">
      <p class="eyebrow">Innovator access</p>
      <h1 id="access-title" tabindex="-1">${isRegistration ? "Create your account" : "Welcome back"}</h1>
      <p class="access-intro">${isRegistration ? "Start as an individual or a registered company representative." : "Sign in to continue your innovation journey."}</p>
      <p id="access-preview" class="access-notice" role="status">${isRegistration ? "Preview only. Use sample details. Account creation is currently unavailable." : "Sign-in is currently unavailable."}</p>
      <form method="post" aria-describedby="access-preview"${isRegistration ? " data-signup" : " data-signin"}>
        <fieldset class="access-fields">
          <legend class="visually-hidden">${isRegistration ? "Registration details" : "Sign-in details"}</legend>
          ${fields}
          <button type="submit" class="button primary" disabled>${isRegistration ? "Create account" : "Sign in"}${icon("arrow")}</button>
          ${isRegistration ? '<p class="verification-help" data-signup-countdown hidden></p>' : '<a href="/verify-email/" data-signin-verification hidden>Go to email verification</a>'}
        </fieldset>
      </form>
      <p class="access-switch">${isRegistration ? 'Already registered? <a href="/signin/">Sign in</a>' : 'New to the portal? <a href="/register/">Sign up</a>'}</p>
    </section>`;
}

export function accessScreen(mode: AccessMode) {
  const isRegistration = mode === "register";
  return accessLayout(
    accessForm(mode),
    isRegistration ? "Start with a single account." : "Your ideas. One secure place.",
    ` data-access-mode="${mode}"`,
    isRegistration ? " access-registration" : "",
    `<template id="alternate-access-form">${accessForm(isRegistration ? "signin" : "register")}</template>`,
  );
}

export function verificationScreen() {
  return accessLayout(`<section class="access-content verification-content" data-verification-form aria-labelledby="access-title">
      <p class="eyebrow">Innovator access</p>
      <h1 id="access-title">Verify your email</h1>
      <p class="access-intro">One more step to protect your account.</p>
      <span class="verification-icon">${icon("mail")}</span>
      <h2 data-verification-heading>Check your inbox</h2>
      <p data-verification-recipient hidden>Check <strong></strong> for the link.</p>
      <p class="access-notice" data-verification-status role="status">Open the link in your verification email first, then come back and click Verify email.</p>
      <div class="verification-actions">
        <button class="button primary" type="button" data-open-verified-account disabled>Verify email</button>
      </div>
      <div class="verification-resend" data-resend-area hidden>
        <button class="button secondary" type="button" data-resend-verification disabled>Resend verification email</button>
        <p class="verification-help" data-resend-countdown></p>
      </div>
      <p class="verification-help">Email missing? Check your spam folder or <a href="/help/">contact support</a>.</p>
    </section>
    <section class="access-content verification-content verification-success" data-verification-success hidden aria-labelledby="verification-success-title">
      <span class="verification-icon verification-success-icon">${icon("check")}</span>
      <h1 id="verification-success-title" tabindex="-1">Email verified</h1>
      <p class="access-intro">Your account is ready. Taking you to your home screen…</p>
      <a href="/account/">Continue to home</a>
    </section>`, "Your work stays private.");
}

export function accountScreen() {
  return accessLayout(`<section class="access-content" aria-labelledby="access-title">
      <p class="eyebrow">Innovator access</p>
      <h1 id="access-title">Innovator home</h1>
      <p class="access-notice" data-account-status role="status">Checking your account.</p>
      <section data-account-details hidden aria-label="Profile">
        <h2 data-account-name></h2>
        <p>This is your home screen.</p>
      </section>
      <button class="button secondary" type="button" data-close-account hidden>Log out</button>
    </section>`, "Your work stays private.");
}

function accessLayout(content: string, storyTitle: string, attributes = "", extraClass = "", tail = "") {
  return `<div class="access-layout${extraClass}"${attributes}>
  <div class="access-workspace">
    <header class="access-brand">${brand}</header>
    ${content}
    <footer class="access-footer">${textLink("/", "Back to the public site")}<a href="/help/">Help centre</a></footer>
  </div>
  <aside class="access-story" aria-labelledby="access-story-title">
    <div class="access-story-copy">
      <p class="eyebrow">Your innovation journey</p>
      <h2 id="access-story-title">${storyTitle}</h2>
      <p>Once the portal opens, you'll be able to share an innovation for assessment and follow its progress.</p>
      <ul>${portalBenefits.map(benefit => `<li>${icon("check")}<span>${benefit}</span></li>`).join("")}</ul>
    </div>
  </aside>
  ${tail}
</div>`;
}
