const pendingEmailKey = "ceda.pendingSignupEmail";
const resendDeadlineKey = "ceda.signupResendDeadline";
const signupRetryKey = "ceda.signupRetryDeadline";
const accessTokenKey = "ceda.verifiedSignupAccessToken";
const activityLogKey = "ceda.portal.activity.v1";
const activeActorKey = "ceda.portal.active_actor.v1";
const loginSessionKey = "ceda.portal.login_session.v1";

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

function readLocal(key) {
  try { return localStorage.getItem(key); } catch { return read(key); }
}

function writeLocal(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return write(key, value);
  }
}

const ROLE_LABELS = {
  admin: "Administrator",
  assessor: "Assessor",
  support: "Support Officer",
  committee: "Committee",
  innovator: "Innovator",
  Administrator: "Administrator",
  Assessor: "Assessor",
  "Support Officer": "Support Officer",
  Committee: "Committee",
  "Committee Observer": "Committee",
  Innovator: "Innovator",
};

export function normalizePortalRole(role) {
  return ROLE_LABELS[role] || (role ? String(role) : "Innovator");
}

function gaboroneParts(date = new Date()) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    const dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Gaborone",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const timeStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Gaborone",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d);
    return { date: dateStr, time: timeStr.slice(0, 5), timeFull: timeStr, iso: d.toISOString() };
  } catch {
    const iso = new Date().toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 16), timeFull: iso.slice(11, 19), iso };
  }
}

export function classifyActivityCategory(action = "", title = "", explicitCategory = "") {
  if (explicitCategory === "Login" || explicitCategory === "Logout" || explicitCategory === "Activity") {
    return explicitCategory;
  }
  const combined = `${action} ${title}`.toLowerCase();
  if (/\b(auth\.login|login|sign[\s-]*in|signed in|session\.start)\b/.test(combined)) return "Login";
  if (/\b(auth\.logout|logout|sign[\s-]*out|signed out|session\.end)\b/.test(combined)) return "Logout";
  return "Activity";
}

export function getPortalActivityActor() {
  try {
    const raw = read(activeActorKey) || readLocal(activeActorKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function readPortalActivityLog() {
  try {
    const raw = readLocal(activityLogKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let activeRpcConfig = null;
let lastLogoutAt = 0;

export function recordPortalActivity(entry = {}) {
  try {
    const currentActor = getPortalActivityActor();
    const actorName = String(entry.actor || currentActor?.name || "Portal User").trim();
    const actorEmail = String(entry.email || currentActor?.email || "").trim();
    const roleLabel = normalizePortalRole(entry.role || currentActor?.role || "Innovator");
    const actionCode = String(entry.action || "portal.activity").trim();
    const title = String(entry.title || actionCode).trim();
    const category = classifyActivityCategory(actionCode, title, entry.category);
    const record = String(entry.record || "Portal workspace").trim();
    const detail = String(entry.detail || `${actorName} (${roleLabel}) performed: ${title}`).trim();
    const stamp = entry.createdAt ? gaboroneParts(new Date(entry.createdAt)) : gaboroneParts();

    const list = readPortalActivityLog();
    const top = list[0];
    if (
      top &&
      top.actor === actorName &&
      top.title === title &&
      top.record === record &&
      top.category === category &&
      Math.abs(Date.parse(stamp.iso) - Date.parse(top.iso || stamp.iso)) < 1500
    ) {
      return top;
    }

    const item = {
      id: entry.id || `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: entry.date || stamp.date,
      time: entry.time || stamp.time,
      timeFull: stamp.timeFull,
      iso: stamp.iso,
      actor: actorName,
      email: actorEmail,
      role: roleLabel,
      category,
      action: actionCode,
      title,
      record,
      detail,
    };

    const updated = [item, ...list].slice(0, 600);
    writeLocal(activityLogKey, JSON.stringify(updated));

    if (typeof document !== "undefined" && typeof CustomEvent === "function") {
      document.dispatchEvent(new CustomEvent("ceda:portalactivity", { detail: item }));
    }

    const cfg = entry.config || activeRpcConfig?.config;
    const tok = entry.token || activeRpcConfig?.token || read(accessTokenKey);
    if (cfg?.url && cfg?.key && tok && typeof fetch === "function" && !entry.skipRemote) {
      fetch(new URL("/rest/v1/rpc/record_portal_activity", cfg.url), {
        method: "POST",
        headers: {
          apikey: cfg.key,
          Authorization: `Bearer ${tok}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_action: actionCode,
          p_target: record.slice(0, 120),
          p_detail: JSON.stringify({
            title,
            category,
            reason: detail.slice(0, 480),
            actor_name: actorName,
            actor_email: actorEmail,
            actor_role: roleLabel,
          }),
        }),
        cache: "no-store",
        credentials: "omit",
      }).catch(() => {});
    }

    return item;
  } catch {
    return null;
  }
}

let observerInstalled = false;
function installWorkspaceActivityObserver() {
  if (observerInstalled || typeof window === "undefined" || typeof document === "undefined") return;
  observerInstalled = true;

  window.addEventListener("hashchange", () => {
    const actor = getPortalActivityActor();
    if (!actor) return;
    const hash = (location.hash || "#overview").replace(/^#/, "") || "overview";
    const heading = document.getElementById(hash)?.querySelector("h1, h2, h3")?.textContent?.trim();
    const label = heading || hash.charAt(0).toUpperCase() + hash.slice(1);
    recordPortalActivity({
      category: "Activity",
      action: "portal.navigate",
      title: `Viewed ${label}`,
      record: `#${hash}`,
      detail: `${actor.name} opened the ${label} section in the ${actor.role} portal.`,
    });
  });

  document.addEventListener("submit", (event) => {
    const actor = getPortalActivityActor();
    if (!actor) return;
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.hasAttribute("data-signin") || form.hasAttribute("data-activity-filters") || form.hasAttribute("data-audit-search")) return;
    const submitterText = event.submitter?.textContent?.trim().replace(/\s+/g, " ") || "";
    const ariaLabel = form.getAttribute("aria-label") || form.closest("section, dialog")?.querySelector("h1, h2, h3")?.textContent?.trim() || "Workspace form";
    const actionLabel = submitterText && submitterText.length <= 48 ? `${submitterText} (${ariaLabel})` : `Submitted ${ariaLabel}`;
    recordPortalActivity({
      category: "Activity",
      action: "portal.form_submit",
      title: actionLabel,
      record: ariaLabel,
      detail: `${actor.name} submitted ${actionLabel} in the ${actor.role} workspace.`,
    });
  }, true);

  document.addEventListener("click", (event) => {
    const actor = getPortalActivityActor();
    if (!actor) return;
    const btn = event.target?.closest?.("button, a[href^='#']");
    if (!btn) return;
    if (
      btn.hasAttribute("data-admin-logout") ||
      btn.hasAttribute("data-settings-logout") ||
      btn.hasAttribute("data-innovator-logout") ||
      btn.hasAttribute("data-assessor-logout") ||
      btn.hasAttribute("data-support-logout")
    ) {
      return;
    }
    if (btn.tagName === "A") return; // handled by hashchange
    if (btn.type === "submit") return; // handled by submit listener
    const label = (btn.getAttribute("aria-label") || btn.textContent || "").trim().replace(/\s+/g, " ");
    if (!label || label.length < 2 || label.length > 70) return;
    // Skip noisy UI toggles
    if (/^(close|cancel|back|clear|previous|next|show password|hide password|collapse|expand)/i.test(label)) return;
    const section = btn.closest("section[id], dialog")?.querySelector("h1, h2, h3")?.textContent?.trim() || "Portal workspace";
    recordPortalActivity({
      category: "Activity",
      action: "portal.action",
      title: label,
      record: section,
      detail: `${actor.name} clicked "${label}" in ${section} (${actor.role} portal).`,
    });
  }, true);
}

export function setPortalActivityActor(profile, config = null, token = null) {
  if (!profile) return null;
  const actor = {
    id: profile.id || profile.email || profile.full_name || "user",
    name: String(profile.full_name || profile.name || "Portal User").trim(),
    email: String(profile.email || "").trim(),
    role: normalizePortalRole(profile.account_role || profile.role || "innovator"),
    rawRole: profile.account_role || profile.role || "innovator",
  };
  write(activeActorKey, JSON.stringify(actor));
  writeLocal(activeActorKey, JSON.stringify(actor));
  if (config || token) {
    activeRpcConfig = { config: config || activeRpcConfig?.config, token: token || activeRpcConfig?.token };
  }
  installWorkspaceActivityObserver();

  const sessionStamp = `${actor.email || actor.name}:${actor.role}`;
  if (read(loginSessionKey) !== sessionStamp) {
    write(loginSessionKey, sessionStamp);
    recordPortalActivity({
      actor: actor.name,
      email: actor.email,
      role: actor.role,
      category: "Login",
      action: "auth.login",
      title: `Signed in to ${actor.role} portal`,
      record: `${actor.role} session`,
      detail: `${actor.name}${actor.email ? ` (${actor.email})` : ""} signed in and opened the ${actor.role} workspace.`,
      config,
      token,
    });
  }
  return actor;
}

if (typeof globalThis !== "undefined") {
  globalThis.__cedaRecordPortalActivity = recordPortalActivity;
  globalThis.__cedaSetPortalActivityActor = setPortalActivityActor;
  globalThis.__cedaReadPortalActivityLog = readPortalActivityLog;
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
export function clearAccountToken() {
  const hadToken = Boolean(read(accessTokenKey));
  const actor = getPortalActivityActor();
  if (hadToken && actor && Date.now() - lastLogoutAt > 2000) {
    lastLogoutAt = Date.now();
    recordPortalActivity({
      actor: actor.name,
      email: actor.email,
      role: actor.role,
      category: "Logout",
      action: "auth.logout",
      title: `Logged out of ${actor.role} portal`,
      record: `${actor.role} session`,
      detail: `${actor.name}${actor.email ? ` (${actor.email})` : ""} logged out and ended their ${actor.role} portal session.`,
    });
  }
  write(loginSessionKey, null);
  write(accessTokenKey, null);
}
