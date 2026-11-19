import { signupConfig } from "./signupConfig.js";
import { resendSignup, verifiedInnovatorProfile } from "./signupApi.js";
import { cooldownFor, cooldownMessage, formatRetryWait, recordCooldown, secondsRemaining } from "./verificationCooldown.js";
import { clearPendingSignup, pendingEmail, resendDeadline, saveAccountToken, saveResendDeadline } from "./verificationSession.js";

const status = document.querySelector("[data-verification-status]");
const form = document.querySelector("[data-verification-form]");
const success = document.querySelector("[data-verification-success]");
const instructions = "Open the link in your verification email first, then come back and click Verify email.";
const recipient = document.querySelector("[data-verification-recipient]");
const verify = document.querySelector("[data-open-verified-account]");
const resend = document.querySelector("[data-resend-verification]");
const countdown = document.querySelector("[data-resend-countdown]");
const resendArea = document.querySelector("[data-resend-area]");
const address = pendingEmail();

const fragment = new URLSearchParams(location.hash.slice(1));
const receivedLink = Boolean(location.hash || location.search);
if (receivedLink) history.replaceState(history.state, "", location.pathname);
let token = fragment.get("type") === "signup" ? fragment.get("access_token") : null;
const fromEmailLink = Boolean(token);
let channel;
let verified = false;
let checking = Boolean(signupConfig && token);
let sending = false;
let completing = false;
let completedElsewhere = false;
let cooldown = address ? cooldownFor(address) : undefined;
let deadline = cooldown?.deadline ?? resendDeadline();
let timer;

function updateResend() {
  const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const label = seconds
    ? `${cooldown?.estimated ? "Check again in" : "Resend available in"} ${formatRetryWait(seconds)}`
    : "You can request another verification email.";
  if (countdown.textContent !== label) countdown.textContent = label;
  resend.disabled = checking || sending || seconds > 0;
  if (!seconds || verified) {
    clearInterval(timer);
    timer = undefined;
  }
}

function startCooldown() {
  deadline = Date.now() + 60_000;
  saveResendDeadline(deadline);
}

function runTimer() {
  clearInterval(timer);
  timer = setInterval(updateResend, 250);
  updateResend();
}

if (address) {
  recipient.querySelector("strong").textContent = address;
  recipient.hidden = false;
}
if (address && signupConfig) {
  resendArea.hidden = false;
  if (!deadline) startCooldown();
  if (!checking && cooldown?.scope === "quota" && secondsRemaining(cooldown)) {
    status.textContent = cooldownMessage(cooldown);
  }
  runTimer();
}

resend.addEventListener("click", async () => {
  if (!address || !signupConfig || resend.disabled || verified) return;
  sending = true;
  updateResend();
  try {
    const result = await resendSignup(signupConfig, address, new URL("/verify-email/", location.origin).href);
    if (result.status === "pending" || result.status === "limited") {
      cooldown = recordCooldown(address, result);
      deadline = cooldown.deadline;
      runTimer();
    }
    if (verified || completing) return;
    status.textContent = result.status === "pending"
      ? "If this address still needs verification, you’ll receive a new link. Use the newest email."
      : result.status === "limited"
        ? cooldownMessage(cooldown)
        : "We couldn’t resend the verification email. Try again or contact support.";
  } catch {
    if (!verified && !completing) status.textContent = "We couldn’t reach the verification service. Check your connection and try again.";
  } finally {
    sending = false;
    updateResend();
  }
});

function openChannel(email) {
  if (!email || channel || typeof BroadcastChannel !== "function") return;
  try {
    channel = new BroadcastChannel(`ceda.verify.${email.trim().toLowerCase()}`);
  } catch {
    return;
  }
  channel.addEventListener("message", ({ data }) => {
    if (data?.type === "request" && fromEmailLink && verified && !completing) {
      channel.postMessage({ type: "confirmed", token });
    }
    if (data?.type === "confirmed" && !fromEmailLink && !checking && !verified &&
        !completing && typeof data.token === "string") {
      token = data.token;
      void checkLink(address);
    }
    if (data?.type === "completed" && data.token === token && !completing) {
      completedElsewhere = true;
      token = null;
      verified = false;
      clearPendingSignup();
      resendArea.hidden = true;
      status.textContent = "Your email was verified and your home screen is open in another tab.";
      verify.disabled = true;
      channel.close();
    }
  });
}

async function checkLink(expectedEmail) {
  const candidate = token;
  checking = true;
  verify.disabled = true;
  status.textContent = "Checking your confirmation.";
  updateResend();
  try {
    const profile = await verifiedInnovatorProfile(signupConfig, candidate);
    if (token !== candidate) return;
    const confirmedEmail = profile?.email?.trim().toLowerCase();
    verified = Boolean(profile && (!expectedEmail || confirmedEmail === expectedEmail.trim().toLowerCase()));
    if (verified) {
      resendArea.hidden = true;
      status.textContent = "Your email is confirmed. Click Verify email to continue.";
      if (fromEmailLink) {
        openChannel(confirmedEmail);
        channel?.postMessage({ type: "confirmed", token });
      }
    } else {
      if (!fromEmailLink) token = null;
      status.textContent = "We couldn’t confirm your email. Open the latest verification link, then come back and click Verify email.";
    }
  } catch {
    status.textContent = "Check your connection, then click Verify email to try again.";
  } finally {
    checking = false;
    verify.disabled = completedElsewhere;
    updateResend();
  }
}

verify.addEventListener("click", () => {
  if (checking || completing) return;
  if (verified) {
    if (!saveAccountToken(token)) {
      status.textContent = "Allow browser storage to open your account in this tab.";
      return;
    }
    completing = true;
    clearPendingSignup();
    channel?.postMessage({ type: "completed", token });
    channel?.close();
    form.hidden = true;
    success.hidden = false;
    success.querySelector("h1").focus();
    window.setTimeout(() => location.replace("/account/"), 1800);
  } else if (token && signupConfig) {
    void checkLink(fromEmailLink ? undefined : address);
  } else {
    status.textContent = `Please verify your email before continuing. ${instructions}`;
    channel?.postMessage({ type: "request" });
  }
});
verify.disabled = false;
if (checking) void checkLink();
else if (receivedLink) {
  status.textContent = "This link couldn’t be verified. Open the latest verification email or contact support.";
} else if (address && signupConfig) {
  openChannel(address);
  channel?.postMessage({ type: "request" });
}
