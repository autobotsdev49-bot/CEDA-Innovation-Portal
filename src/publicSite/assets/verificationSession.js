const pendingEmailKey = "ceda.pendingSignupEmail";
const resendDeadlineKey = "ceda.signupResendDeadline";
const signupRetryKey = "ceda.signupRetryDeadline";
const accessTokenKey = "ceda.verifiedSignupAccessToken";

function read(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function write(key, value) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function pendingEmail() { return read(pendingEmailKey); }
export function resendDeadline() { return Number(read(resendDeadlineKey)) || 0; }
export function saveResendDeadline(deadline) { write(resendDeadlineKey, String(deadline)); }
export function signupRetryDeadline() { return Number(read(signupRetryKey)) || 0; }
export function saveSignupRetryDeadline(deadline) { write(signupRetryKey, deadline ? String(deadline) : null); }
export function formatRetryWait(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes ? `${minutes}m ${String(remaining).padStart(2, "0")}s` : `${remaining}s`;
}
export function startPendingSignup(email, now = Date.now(), cooldownSeconds = 60) {
  write(pendingEmailKey, email);
  saveResendDeadline(now + cooldownSeconds * 1000);
}
export function clearPendingSignup() {
  write(pendingEmailKey, null);
  write(resendDeadlineKey, null);
}

export function accountToken() { return read(accessTokenKey); }
export function saveAccountToken(token) { return write(accessTokenKey, token); }
export function clearAccountToken() { write(accessTokenKey, null); }
