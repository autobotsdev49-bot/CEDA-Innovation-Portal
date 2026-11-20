import { signupConfig, signupEnabled } from "./signupConfig.js";
import { requestSignup, signupFieldsReady, validApplicantName } from "./signupApi.js";
import { startPendingSignup } from "./verificationSession.js";
import { cooldownFor, cooldownMessage, formatRetryWait, recordCooldown, secondsRemaining } from "./verificationCooldown.js";

const verificationUrl = new URL("/verify-email/", location.origin).href;
const register = document.querySelector("[data-signup]") ??
  document.getElementById("alternate-access-form")?.content.querySelector("[data-signup]");

if (register && signupConfig && signupEnabled) {
  const fieldset = register.querySelector("fieldset");
  const submit = register.querySelector('button[type="submit"]');
  const status = register.parentElement.querySelector("[role=status]");
  const countdown = register.querySelector("[data-signup-countdown]");
  const instructions = "Use an email you can access and enter the same password in both fields. Use at least 8 characters.";
  const nameError = register.querySelector("[data-signup-name-error]");
  const { fullName, email, password, confirmPassword } = register.elements;
  let displayedCooldown;
  let timer;
  status.textContent = instructions;

  function updateSubmit() {
    nameError.hidden = !fullName.value || validApplicantName(fullName.value);
    if (nameError.hidden) fullName.removeAttribute("aria-invalid");
    else fullName.setAttribute("aria-invalid", "true");
    const cooldown = cooldownFor(email.value);
    const seconds = secondsRemaining(cooldown);
    submit.disabled = fieldset.disabled || seconds > 0 ||
      !signupFieldsReady(fullName.value, email.validity.valid, password.value, confirmPassword.value);

    if (seconds) {
      if (displayedCooldown !== cooldown) status.textContent = cooldownMessage(cooldown);
      if (countdown) {
        countdown.hidden = false;
        countdown.textContent = `${cooldown.estimated ? "Check again in" : "Try again in"} ${formatRetryWait(seconds)}`;
      }
      if (!timer) timer = setInterval(updateSubmit, 1000);
      displayedCooldown = cooldown;
    } else {
      clearInterval(timer);
      timer = undefined;
      if (countdown) countdown.hidden = true;
      if (displayedCooldown) {
        status.textContent = !cooldown || displayedCooldown === cooldown
          ? "You can try creating your account again now."
          : instructions;
        displayedCooldown = undefined;
      }
    }
  }

  register.addEventListener("input", updateSubmit);
  register.addEventListener("change", updateSubmit);
  window.addEventListener("pageshow", updateSubmit);
  register.addEventListener("submit", async (event) => {
    event.preventDefault();
    updateSubmit();
    if (submit.disabled) return;

    fieldset.disabled = true;
    status.textContent = "Requesting your verification email…";
    let keepPassword = false;
    try {
      const address = email.value.trim();
      const result = await requestSignup(signupConfig, {
        fullName: fullName.value.trim(), email: address, password: password.value,
      }, verificationUrl);
      if (result.status === "pending") {
        recordCooldown(address, result);
        startPendingSignup(address);
        register.reset();
        location.assign(verificationUrl);
        return;
      }
      if (result.status === "limited") {
        recordCooldown(address, result);
        keepPassword = true;
        return;
      }
      status.textContent = {
        "email-not-authorized": "Email verification is unavailable for this address. Contact support for help.",
        "invalid-name": "Enter a valid name.",
        "weak-password": "Choose a stronger password and try again.",
        "confirmation-disabled": "Verification is temporarily unavailable. Contact support.",
        unavailable: "We couldn’t start email verification. Try again or contact support.",
      }[result.status];
    } catch {
      status.textContent = "We couldn’t reach the signup service. Check your connection and try again.";
    } finally {
      if (!keepPassword) {
        password.value = "";
        confirmPassword.value = "";
      }
      fieldset.disabled = false;
      updateSubmit();
    }
  });
  updateSubmit();
} else if (register && !signupEnabled) {
  register.parentElement.querySelector("[role=status]").textContent = "Account creation is currently unavailable. Please contact support for assistance.";
}
