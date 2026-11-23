import { signupConfig } from "./signupConfig.js";
import { signInAccount } from "./signupApi.js";
import { clearPendingSignup, pendingEmail, saveAccountToken, startPendingSignup } from "./verificationSession.js";
import { formatRetryWait } from "./verificationCooldown.js";

const form = document.querySelector("[data-signin]") ??
  document.getElementById("alternate-access-form")?.content.querySelector("[data-signin]");

if (form && signupConfig) {
  const status = form.parentElement.querySelector("[role=status]");
  const verifyLink = form.querySelector("[data-signin-verification]");
  const submit = form.querySelector('button[type="submit"]');
  const fieldset = form.querySelector("fieldset");
  const { email, password } = form.elements;
  status.textContent = "Enter the email and password you used to create your account.";
  submit.disabled = false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (fieldset.disabled || !form.reportValidity()) return;

    fieldset.disabled = true;
    verifyLink.hidden = true;
    status.textContent = "Signing you in.";
    try {
      const address = email.value.trim();
      const result = await signInAccount(signupConfig, address, password.value);
      if (result.status === "signed-in") {
        if (saveAccountToken(result.token)) {
          globalThis.__cedaSetPortalActivityActor?.(result.profile, signupConfig, result.token);
          clearPendingSignup();
          const destinations = { admin: "/admin/", innovator: "/account/", assessor: "/assessor/", support: "/support/", committee: "/committee/" };
          location.replace(destinations[result.profile.account_role] || "/signin/");
          return;
        }
        status.textContent = "Allow browser storage and try signing in again.";
      } else if (result.status === "unverified") {
        if (pendingEmail()?.toLowerCase() !== address.toLowerCase()) startPendingSignup(address, Date.now(), 0);
        verifyLink.hidden = false;
        status.textContent = "Verify your email before signing in. Open the link in your inbox or go to email verification.";
      } else if (result.status === "limited") {
        status.textContent = result.estimated
          ? "Too many sign-in attempts. Try again in a few minutes."
          : `Too many sign-in attempts. Try again in ${formatRetryWait(result.retryAfterSeconds)}.`;
      } else {
        status.textContent = {
          invalid: "The email or password is incorrect.",
          "no-access": "We couldn't open an active portal account. Contact support for help.",
          unavailable: "Sign-in is temporarily unavailable. Please try again.",
        }[result.status];
      }
    } catch {
      status.textContent = "We couldn't reach the sign-in service. Check your connection and try again.";
    } finally {
      password.value = "";
      fieldset.disabled = false;
    }
  });
}
