import { signupConfig } from "./signupConfig.js";
import { saveAccountToken } from "./verificationSession.js";

const parameters = new URLSearchParams(location.hash.slice(1));
let token = parameters.get("access_token");
history.replaceState(null, "", location.pathname);
const form = document.querySelector("[data-activation]");
const status = document.querySelector("[data-activation-status]");
const button = form.querySelector("button");
let busy = false;
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || !token || !signupConfig || !form.reportValidity()) return;
  const password = form.elements.password.value;
  if (password !== form.elements.confirmation.value) { status.textContent = "The passwords do not match."; return; }
  if (new TextEncoder().encode(password).length > 72) { status.textContent = "Choose a password up to 72 bytes."; return; }
  busy = true; button.disabled = true;
  try {
    const response = await fetch(new URL("/auth/v1/user", signupConfig.url), {
      method: "PUT",
      headers: { apikey: signupConfig.key, Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ password }), credentials: "omit", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    form.reset();
    if (!response.ok) { status.textContent = "Your password could not be set. Check the password requirements or ask your administrator for a new invitation."; return; }
    if (!saveAccountToken(token)) { status.textContent = "Password saved. Sign in to open your workspace."; token = null; return; }
    token = null; location.replace("/account/");
  } catch { status.textContent = "Check your connection and try again."; }
  finally { busy = false; button.disabled = !token; }
});
button.disabled = !token || !signupConfig;
status.textContent = token && signupConfig ? "Choose your password to finish setting up your account." : "Open your invitation email to set up your account, or sign in if you already accepted it.";
