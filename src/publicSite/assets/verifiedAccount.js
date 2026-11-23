import { signupConfig } from "./signupConfig.js";
import { logoutSignup, verifiedAccountProfile } from "./signupApi.js";
import { accountToken, clearAccountToken } from "./verificationSession.js";

const status = document.querySelector("[data-account-status]");
const details = document.querySelector("[data-account-details]");
const close = document.querySelector("[data-close-account]");

async function loadAccount() {
  details.hidden = true;
  close.hidden = true;
  status.textContent = "Checking your account.";
  try {
    const token = accountToken();
    const profile = signupConfig && token && await verifiedAccountProfile(signupConfig, token);
    if (token !== accountToken()) return;
    if (!profile) {
      clearAccountToken();
      status.textContent = "Your account session is unavailable or expired.";
      return;
    }
    const destination = { admin: "/admin/", innovator: "/account/", assessor: "/assessor/", support: "/support/", committee: "/committee/" }[profile.account_role];
    if (location.pathname !== destination) {
      location.replace(destination);
      return;
    }
    document.querySelector("#access-title").textContent = { admin: "Administrator home", innovator: "Innovator home", assessor: profile.lead_assessor ? "Lead Assessor home" : "Assessor home", support: "Support Officer home", committee: "Committee workspace" }[profile.account_role];
    document.querySelector(".eyebrow").textContent = profile.account_role === "innovator" ? "Innovator access" : profile.account_role === "committee" ? "Committee observer" : "Staff workspace";
    details.querySelector("[data-account-name]").textContent = profile.full_name;
    details.hidden = false;
    close.hidden = false;
    status.textContent = "";
  } catch {
    status.textContent = "We couldn't load your account. Check your connection and try again.";
  }
}

close.addEventListener("click", async () => {
  const token = accountToken();
  close.disabled = true;
  details.hidden = true;
  status.textContent = "Logging out.";
  clearAccountToken();
  try {
    if (signupConfig && token && !await logoutSignup(signupConfig, token)) {
      status.textContent = "You’re logged out in this browser. We couldn’t end the server session.";
      close.hidden = true;
      return;
    }
  } catch {
    status.textContent = "You’re logged out in this browser. We couldn’t reach the server.";
    close.hidden = true;
    return;
  }
  location.replace("/");
});
window.addEventListener("pageshow", loadAccount);
