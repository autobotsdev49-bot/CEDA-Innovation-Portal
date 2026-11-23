import { signupConfig } from "./signupConfig.js";
import { verifiedAccountProfile, logoutSignup } from "./signupApi.js";
import { accountToken, clearAccountToken } from "./verificationSession.js";
import { REGULATORY_AUTHORITIES_BASELINE, buildPortalDocumentPublicUrl, normalizeApplicationFormConfig } from "./portalCatalog.js";
import { FREE_ALERT_FEE_LABEL, kickNotificationDispatch, mergeIncrementalNotifications, summarizeApplicationAlertSubscription } from "./notificationsDomain.js";
import {
  STAGE_MATRIX,
  WIZARD_STEPS,
  charGuidance,
  formatBytes,
  sanitizeFileName,
  validateVideoLink,
  validateEvidenceFile,
  evaluateStepReadiness,
  evaluateApplicationReadiness,
  documentChecklist,
  applicationRequiredAction,
  activeRequestedChange,
  canWithdrawApplication,
  filterAndSortApplications,
  buildSubmissionReceiptDocument,
  buildOutcomeLetterDocument,
  collectRequiredActions,
  collectRecentActivity,
} from "./applicationWizard.js";

const statusEl = document.querySelector("[data-innovator-status]");
const workspaceEl = document.querySelector("[data-innovator-workspace]");
const shellEl = document.querySelector("[data-innovator-shell]");
const layoutEl = document.querySelector("[data-innovator-layout]");
const sidebarToggle = document.querySelector("[data-innovator-sidebar-toggle]");
const dialogEl = document.querySelector("[data-innovator-dialog]");
const dialogStatusEl = document.querySelector("[data-dialog-status]");
const dialogTitleEl = document.querySelector("#innovator-dialog-title");

const ROLE_HOMES = { admin: "/admin/", innovator: "/account/", assessor: "/assessor/", support: "/support/", committee: "/committee/" };

const state = {
  token: "",
  profile: null,
  sectors: [],
  applications: [],
  documents: [],
  messages: [],
  notifications: [],
  alertSubscriptions: [],
  notificationsPollTimer: null,
  notificationsSince: null,
  alertChannel: typeof BroadcastChannel === "function" ? new BroadcastChannel("ceda-portal-alerts") : null,
  supportRequests: [],
  faqs: [],
  portalDocuments: [],
  regulatoryContacts: [],
  applicationFormConfig: normalizeApplicationFormConfig(null),
  wizardCustomResponses: {},
  optimusHistory: [],
  activeSection: "overview",
  appsFilter: { status: "All", query: "", sort: "updated_desc", page: 0 },
  detailAppId: null,
  detailTab: "summary",
  wizardAppId: null,
  wizardStep: 1,
  wizardDirty: false,
  wizardAutosaveTimer: null,
  wizardSaving: false,
  wizardIdempotencyKey: null,
  optimusRefreshTimer: null,
  lastSubmittedAppId: null,
  pendingNavCallback: null,
  activeThreadKey: null,
  activeSupportRef: null,
  previewDoc: null,
  withdrawAppId: null,
  replacingDocId: null,
  sidebarManualToggle: false,
};

// High-speed RAM cache for Innovator workspace reads with explicit write invalidation
const innovatorRamCache = new Map();
function getCached(key) {
  const entry = innovatorRamCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { innovatorRamCache.delete(key); return undefined; }
  return entry.value;
}
function setCached(key, value, ttlMs = 30000) {
  innovatorRamCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}
function invalidateCache() {
  innovatorRamCache.clear();
}

function announce(message) {
  if (!statusEl) return;
  statusEl.classList.toggle("admin-status-silent", !message);
  statusEl.textContent = message || "";
  if (dialogStatusEl && dialogEl?.open) dialogStatusEl.textContent = message || "";
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function downloadIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<path d="M12 3v12M7 10l5 5 5-5M5 21h14" />';
  return svg;
}

function statusBadge(value) {
  const classes = {
    Draft: "draft",
    Submitted: "submitted",
    Received: "received",
    "In review": "review",
    "Changes requested": "changes",
    Approved: "approved",
    Awarded: "awarded",
    Rejected: "rejected",
    Withdrawn: "withdrawn",
  };
  return el("span", `admin-case-badge case-${classes[value] || "submitted"}`, value || "Draft");
}

async function rpc(name, payload = {}) {
  const token = state.token || accountToken();
  if (!signupConfig || !token) throw new Error("Sign in to continue.");
  const response = await fetch(`${signupConfig.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: signupConfig.key,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    if (response.status === 401) {
      clearAccountToken();
      window.location.replace("/signin/");
      throw new Error("Session expired. Please sign in again.");
    }
    throw new Error(body?.message || body?.hint || "Unable to complete request.");
  }
  if ([
    "innovator_submit_application",
    "innovator_submit_clarification",
    "innovator_withdraw_application",
    "innovator_send_message",
    "innovator_create_support_request",
    "innovator_reply_support_request",
    "innovator_record_optimus_turn",
  ].includes(name)) {
    kickNotificationDispatch(signupConfig, token);
    state.alertChannel?.postMessage({ type: "alerts-updated", at: Date.now() });
  }
  return body;
}

function downloadDocumentFile(docPayload) {
  const blob = new Blob([docPayload.content], { type: docPayload.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = docPayload.filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Collapsible Sidebar + Smaller Desktop Auto-Collapse
function setSidebarCollapsed(collapsed, manual = false) {
  if (!layoutEl || !sidebarToggle) return;
  if (manual) state.sidebarManualToggle = true;
  layoutEl.classList.toggle("is-collapsed", Boolean(collapsed));
  sidebarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  sidebarToggle.setAttribute("aria-label", collapsed ? "Expand portal menu" : "Collapse portal menu");
  sidebarToggle.setAttribute("title", collapsed ? "Expand menu" : "Collapse menu");
}

function applyResponsiveSidebar() {
  if (state.sidebarManualToggle) return;
  const w = window.innerWidth;
  if (w > 760 && w <= 1180) setSidebarCollapsed(true, false);
  else if (w > 1180) setSidebarCollapsed(false, false);
}

sidebarToggle?.addEventListener("click", () => {
  setSidebarCollapsed(!layoutEl.classList.contains("is-collapsed"), true);
});
window.addEventListener("resize", applyResponsiveSidebar);

// Accessibility live classes (CSP-safe: zero inline style attributes)
function applyAccessibilityPreferences(prefs = {}) {
  if (!shellEl) return;
  shellEl.classList.remove("is-text-large", "is-text-xlarge", "is-high-contrast", "is-reduced-motion");
  if (prefs.textSize === "large") shellEl.classList.add("is-text-large");
  if (prefs.textSize === "xlarge") shellEl.classList.add("is-text-xlarge");
  if (prefs.highContrast) shellEl.classList.add("is-high-contrast");
  if (prefs.reducedMotion) shellEl.classList.add("is-reduced-motion");
}

// Dialog management
function openDialog(panelKey, title) {
  if (!dialogEl) return;
  dialogEl.classList.toggle("is-document-preview", panelKey === "doc-preview");
  for (const panel of dialogEl.querySelectorAll("[data-inn-dialog-panel]")) {
    panel.hidden = panel.dataset.innDialogPanel !== panelKey;
  }
  dialogTitleEl.textContent = title;
  if (dialogStatusEl) dialogStatusEl.textContent = "";
  if (!dialogEl.open) dialogEl.showModal();
  dialogTitleEl.focus();
}

function closeDialog() {
  if (state.previewDocBlobUrl) {
    URL.revokeObjectURL(state.previewDocBlobUrl);
    state.previewDocBlobUrl = null;
  }
  if (dialogEl?.open) dialogEl.close();
  dialogEl?.classList.remove("is-document-preview");
}

dialogEl?.querySelector("[data-dialog-close]")?.addEventListener("click", closeDialog);
for (const cancelBtn of dialogEl?.querySelectorAll("[data-dialog-cancel]") || []) {
  cancelBtn.addEventListener("click", closeDialog);
}

// Navigation with Unsaved Draft Protection
function executeSectionSwitch(sectionId, options = {}) {
  if (sectionId === "optimus") {
    document.querySelector("[data-optimus-toggle]")?.click();
    return;
  }
  state.activeSection = sectionId;
  for (const section of workspaceEl.querySelectorAll(".admin-work-section")) {
    if (section.id === "optimus") continue;
    section.hidden = section.id !== sectionId;
  }
  for (const link of document.querySelectorAll("[data-nav-target]")) {
    const active = link.dataset.navTarget === sectionId;
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (sectionId === "applications" && !options.keepDetail) {
    state.detailAppId = null;
    toggleDetailWorkspace(false);
  }
  if (sectionId === "submit" && !options.keepWizard && !options.keepSuccess) {
    showSubmitSubView("start");
  }
  if (window.location.hash !== `#${sectionId}` && !options.skipHash) {
    history.replaceState(null, "", `#${sectionId}`);
  }
  const heading = document.getElementById(sectionId)?.querySelector("h1, h2, h3")?.textContent?.trim() || sectionId;
  globalThis.__cedaRecordPortalActivity?.({
    category: "Activity",
    action: "innovator.navigate",
    title: `Opened ${heading}`,
    record: `#${sectionId}`,
    detail: `${state.profile?.full_name || "Innovator"} navigated to ${heading} in the Innovator portal.`,
  });
}

const optimusPanel = document.querySelector("#optimus");
if (optimusPanel) {
  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "innovator-optimus-launcher";
  launcher.dataset.optimusToggle = "";
  launcher.setAttribute("aria-label", "Open Optimus Prime AI chat");
  launcher.innerHTML = '<span class="innovator-optimus-launcher-icon" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path d="M16 4v4M10 9h12a5 5 0 0 1 5 5v7a5 5 0 0 1-5 5h-1l-5 4-5-4h-1a5 5 0 0 1-5-5v-7a5 5 0 0 1 5-5Z"/><path d="M11 16h.1M21 16h.1M12 21h8M6 16H3M29 16h-3M9 7 7 5M23 7l2-2"/></svg></span><span class="innovator-optimus-launcher-label">Chat with Optimus</span>';
  launcher.setAttribute("aria-controls", "optimus");
  launcher.setAttribute("aria-expanded", "false");
  const launcherHost = document.querySelector(".innovator-shell") || document.body;
  launcherHost.append(launcher);
  const closeChat = (restoreFocus = false) => {
    optimusPanel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    clearInterval(state.optimusRefreshTimer);
    state.optimusRefreshTimer = null;
    if (restoreFocus) launcher.focus();
  };
  const openChat = () => {
    optimusPanel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    renderOptimus();
    optimusPanel.querySelector("#optimus-question-input")?.focus();
    clearInterval(state.optimusRefreshTimer);
    state.optimusRefreshTimer = setInterval(async () => {
      if (optimusPanel.hidden || document.hidden) return;
      try { await loadWorkspace(true); } catch { /* Keep the current conversation available if refresh is offline. */ }
    }, getActiveOptimusSupportRequest() ? 5000 : 15000);
  };
  launcher.addEventListener("click", () => optimusPanel.hidden ? openChat() : closeChat());
  optimusPanel.querySelector("[data-optimus-close]")?.addEventListener("click", () => closeChat(true));
  optimusPanel.querySelector("[data-optimus-escalate-cancel]")?.addEventListener("click", () => {
    const panel = optimusPanel.querySelector("[data-optimus-escalate-panel]");
    panel.hidden = true;
    optimusPanel.querySelector("#optimus-question-input")?.focus();
  });
  optimusPanel.querySelector("[data-optimus-feed]")?.addEventListener("click", event => {
    const quickReply = event.target.closest("[data-optimus-prompt]");
    if (quickReply) {
      askOptimusPrompt(quickReply.dataset.optimusPrompt, quickReply.dataset.optimusTopic || "general");
      return;
    }
    if (!event.target.closest("[data-optimus-request-human]")) return;
    const panel = optimusPanel.querySelector("[data-optimus-escalate-panel]");
    panel.hidden = false;
    const summary = panel.querySelector("textarea");
    const latest = state.optimusHistory[0];
    if (!summary.value && latest) summary.value = `I need more help with: ${latest.question}`;
    summary.focus();
  });
  document.addEventListener("pointerdown", event => {
    if (optimusPanel.hidden || optimusPanel.contains(event.target) || launcher.contains(event.target)) return;
    closeChat();
  });
  optimusPanel.querySelector("#optimus-heading")?.setAttribute("tabindex", "-1");
  optimusPanel.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeChat(true);
    }
  });
}

function navigateTo(sectionId, options = {}) {
  const leavingActiveWizard =
    state.activeSection === "submit" &&
    sectionId !== "submit" &&
    state.wizardDirty &&
    !document.querySelector("[data-wizard-view]")?.hidden;

  if (leavingActiveWizard && !options.force) {
    state.pendingNavCallback = () => navigateTo(sectionId, { ...options, force: true });
    openDialog("unsaved-confirm", "Save unsaved draft changes?");
    return;
  }
  executeSectionSwitch(sectionId, options);
  renderActiveSection();
}

window.addEventListener("beforeunload", event => {
  if (state.wizardDirty && state.wizardAppId) {
    event.preventDefault();
    event.returnValue = "";
  }
});

document.querySelector("[data-save-and-leave]")?.addEventListener("click", async () => {
  const ok = await saveWizardDraft(false);
  closeDialog();
  if (ok && state.pendingNavCallback) {
    const fn = state.pendingNavCallback;
    state.pendingNavCallback = null;
    fn();
  }
});

document.querySelector("[data-discard-and-leave]")?.addEventListener("click", () => {
  state.wizardDirty = false;
  clearTimeout(state.wizardAutosaveTimer);
  closeDialog();
  if (state.pendingNavCallback) {
    const fn = state.pendingNavCallback;
    state.pendingNavCallback = null;
    fn();
  }
});

for (const link of document.querySelectorAll("[data-nav-target]")) {
  link.addEventListener("click", event => {
    event.preventDefault();
    if (link.dataset.navTarget === "optimus") {
      if (optimusPanel?.hidden) document.querySelector("[data-optimus-toggle]")?.click();
      return;
    }
    navigateTo(link.dataset.navTarget);
  });
}
for (const link of document.querySelectorAll("[data-nav-shortcut]")) {
  link.addEventListener("click", event => {
    event.preventDefault();
    if (link.dataset.navShortcut === "optimus") {
      if (optimusPanel?.hidden) document.querySelector("[data-optimus-toggle]")?.click();
      return;
    }
    navigateTo(link.dataset.navShortcut);
  });
}
document.querySelector('.admin-identity[href="#settings"]')?.addEventListener("click", event => {
  event.preventDefault();
  navigateTo("settings");
});

// Bootstrap & State Sync
function applyBootstrapData(boot) {
  state.profile = boot.profile || {};
  state.liveChatStatus = boot.liveChatStatus || state.liveChatStatus || null;
  state.sectors = Array.isArray(boot.sectors) ? boot.sectors : [];
  state.applications = Array.isArray(boot.applications) ? boot.applications : [];
  state.alertSubscriptions = Array.isArray(boot.alertSubscriptions) ? boot.alertSubscriptions : [];
  state.documents = Array.isArray(boot.documents) ? boot.documents : [];
  state.messages = Array.isArray(boot.messages) ? boot.messages : [];
  state.notifications = Array.isArray(boot.notifications) ? boot.notifications : [];
  state.notificationsSince = new Date().toISOString();
  state.supportRequests = Array.isArray(boot.supportRequests) ? boot.supportRequests : [];
  state.faqs = Array.isArray(boot.faqs) ? boot.faqs : [];
  state.portalDocuments = Array.isArray(boot.portalDocuments) ? boot.portalDocuments : [];
  state.regulatoryContacts = Array.isArray(boot.regulatoryContacts) ? boot.regulatoryContacts : [];
  state.applicationFormConfig = normalizeApplicationFormConfig(boot.applicationFormConfig);
  state.optimusHistory = Array.isArray(boot.optimusHistory) ? boot.optimusHistory : [];

  document.querySelector("[data-innovator-name]").textContent = state.profile.fullName || "Innovator";
  document.querySelector("[data-innovator-email]").textContent = state.profile.email || "";
  applyAccessibilityPreferences(state.profile.preferences || {});
  syncNotificationBadge();
  syncSectorDropdowns();
  syncSupportAppSelect();
  ensureRealtimeAlertSync();
}

async function pollLiveNotificationsAndStatuses() {
  if (!state.token && !accountToken()) return;
  try {
    const prevIds = new Set(state.notifications.map(n => n.id));
    const snap = await rpc("innovator_poll_notifications", { p_since: state.notificationsSince || null });
    if (!snap || typeof snap !== "object") return;
    if (snap.serverTime) state.notificationsSince = snap.serverTime;
    if (Array.isArray(snap.alertSubscriptions)) state.alertSubscriptions = snap.alertSubscriptions;
    if (snap.preferences && state.profile) state.profile.preferences = snap.preferences;

    if (Array.isArray(snap.notifications) && snap.notifications.length) {
      const fresh = snap.notifications.filter(n => n?.id && !prevIds.has(n.id));
      state.notifications = mergeIncrementalNotifications(state.notifications, snap.notifications, 40);
      syncNotificationBadge();
      if (fresh.length) {
        announce(`New alert: ${fresh[0].title}`);
        const notifPanel = dialogEl?.querySelector('[data-inn-dialog-panel="notifications"]');
        if (dialogEl?.open && notifPanel && !notifPanel.hidden) {
          renderNotificationsModal();
        }
      }
    }

    let statusChanged = false;
    if (Array.isArray(snap.applicationStatuses)) {
      for (const sItem of snap.applicationStatuses) {
        const app = state.applications.find(a => a.id === sItem.id);
        if (app && (app.status !== sItem.status || app.version !== sItem.version)) {
          app.status = sItem.status;
          app.version = sItem.version;
          app.updatedAt = sItem.updatedAt || app.updatedAt;
          statusChanged = true;
        }
      }
    }
    if (statusChanged) {
      renderOverview();
      if (state.activeSection === "applications") {
        if (state.detailAppId) renderApplicationDetail();
        else renderApplicationsTable();
      }
    }
  } catch {
    // Keep UI stable if temporary offline blip happens between polls.
  }
}

function ensureRealtimeAlertSync() {
  if (state.notificationsPollTimer) return;
  state.notificationsPollTimer = setInterval(() => {
    if (document.visibilityState === "visible") {
      void pollLiveNotificationsAndStatuses();
    }
  }, 12000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void pollLiveNotificationsAndStatuses();
    }
  });
  state.alertChannel?.addEventListener("message", () => {
    void pollLiveNotificationsAndStatuses();
  });
}

async function loadWorkspace(forceRefresh = false) {
  const cached = !forceRefresh ? getCached("bootstrap") : undefined;
  const boot = cached || setCached("bootstrap", await rpc("innovator_workspace_bootstrap"));
  applyBootstrapData(boot);
  renderAll();
}

function renderPortalFormsCatalog(container, includeChecklist = true) {
  if (!container) return;
  container.replaceChildren();
  const cfg = normalizeApplicationFormConfig(state.applicationFormConfig);
  const docs = Array.isArray(state.portalDocuments) ? state.portalDocuments : [];
  container.append(
    el("h4", "", `${cfg.formTitle} (v${cfg.formVersion})`),
    el("p", "admin-help", `${cfg.introGuidance} Max file size: ${cfg.maxEvidenceFileMb} MB.`),
  );

  for (const doc of docs) {
    const item = el("article", "innovator-faq-item");
    item.append(el("strong", "", `${doc.kind}: ${doc.title}`));
    if (doc.summary || doc.body) item.append(el("p", "", doc.summary || doc.body));
    const url = doc.attachmentPath && signupConfig?.url
      ? buildPortalDocumentPublicUrl(signupConfig.url, doc.attachmentPath)
      : (/^https?:\/\//i.test(doc.externalUrl || "") ? doc.externalUrl : "");
    if (url) {
      const link = document.createElement("a");
      link.className = "admin-attachment-link";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = doc.attachmentName ? `Download ${doc.attachmentName}` : "Open document link";
      item.append(link);
    }
    container.append(item);
  }

  if (includeChecklist && cfg.requiredDocuments.length) {
    const heading = el("strong", "", "Accompanying copies required checklist");
    container.append(heading);
    for (const req of cfg.requiredDocuments) {
      const row = el("div", "innovator-faq-item");
      row.append(
        el("strong", "", `${req.label} (${req.required ? "Mandatory" : "Conditional"} · ${req.appliesTo})`),
        el("p", "", `${req.guidance ? `${req.guidance} ` : ""}Formats: ${req.acceptedFormats} (up to ${req.maxSizeMb} MB).`),
      );
      container.append(row);
    }
  }
}

function renderRegulatoryContactsList(container) {
  if (!container) return;
  container.replaceChildren();
  const items = Array.isArray(state.regulatoryContacts) && state.regulatoryContacts.length
    ? state.regulatoryContacts
    : REGULATORY_AUTHORITIES_BASELINE;
  for (const auth of items) {
    const details = auth.contactDetails && typeof auth.contactDetails === "object" ? auth.contactDetails : auth;
    const card = el("article", "innovator-faq-item");
    card.append(el("strong", "", auth.title || details.fullName || "Regulatory authority"));
    const scope = details.scope || auth.summary || auth.body || "";
    if (scope) card.append(el("p", "", scope));
    const contactLine = [
      details.phone ? `Tel: ${details.phone}` : "",
      details.email ? `Email: ${details.email}` : "",
      details.address ? `Address: ${details.address}` : "",
    ].filter(Boolean).join(" · ");
    if (contactLine) card.append(el("p", "admin-help", contactLine));
    const webUrl = details.website || auth.externalUrl || "";
    if (/^https?:\/\//i.test(webUrl)) {
      const link = document.createElement("a");
      link.className = "admin-attachment-link";
      link.href = webUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = `Visit ${details.authorityCode || auth.authorityCode || "website"} (${webUrl})`;
      card.append(link);
    }
    container.append(card);
  }
}

function renderWizardCustomFields(panel, stepNumber) {
  if (!panel) return;
  let host = panel.querySelector(`[data-dynamic-custom-fields="${stepNumber}"]`);
  const cfg = normalizeApplicationFormConfig(state.applicationFormConfig);
  const fields = cfg.customFields.filter(f => f.enabled && Number(f.stepNumber) === Number(stepNumber));
  if (!fields.length) {
    if (host) host.replaceChildren();
    return;
  }
  if (!host) {
    host = el("div", "admin-form-wide");
    host.dataset.dynamicCustomFields = String(stepNumber);
    panel.append(host);
  }
  host.replaceChildren();
  for (const field of fields) {
    const label = document.createElement("label");
    label.className = field.fieldType === "textarea" ? "admin-form-wide" : "";
    const titleSpan = document.createElement("span");
    titleSpan.textContent = `${field.label}${field.required ? " *" : ""}`;
    const currentVal = state.wizardCustomResponses?.[field.key] ?? "";

    if (field.fieldType === "checkbox") {
      label.className = "admin-check admin-form-wide";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = currentVal === true || currentVal === "true" || currentVal === "Yes";
      input.addEventListener("change", () => {
        state.wizardCustomResponses[field.key] = input.checked;
        state.wizardDirty = true;
      });
      label.append(input, titleSpan);
    } else if (field.fieldType === "select") {
      label.append(titleSpan);
      const select = document.createElement("select");
      select.add(new Option("Select an option", ""));
      for (const opt of field.options || []) select.add(new Option(opt, opt));
      select.value = String(currentVal || "");
      select.addEventListener("change", () => {
        state.wizardCustomResponses[field.key] = select.value;
        state.wizardDirty = true;
      });
      label.append(select);
    } else if (field.fieldType === "textarea") {
      label.append(titleSpan);
      const ta = document.createElement("textarea");
      ta.rows = 3;
      ta.maxLength = 1500;
      ta.placeholder = field.placeholder || "";
      ta.value = String(currentVal || "");
      ta.addEventListener("input", () => {
        state.wizardCustomResponses[field.key] = ta.value;
        state.wizardDirty = true;
      });
      label.append(ta);
    } else {
      label.append(titleSpan);
      const input = document.createElement("input");
      input.type = field.fieldType === "url" ? "url" : "text";
      input.maxLength = 300;
      input.placeholder = field.placeholder || (field.fieldType === "url" ? "https://..." : "");
      input.value = String(currentVal || "");
      input.addEventListener("input", () => {
        state.wizardCustomResponses[field.key] = input.value;
        state.wizardDirty = true;
      });
      label.append(input);
    }

    if (field.helpText) {
      label.append(el("small", "admin-help", field.helpText));
    }
    host.append(label);
  }
}

function upsertApplication(app) {
  if (!app?.id) return;
  const idx = state.applications.findIndex(item => item.id === app.id);
  if (idx >= 0) state.applications[idx] = app;
  else state.applications.unshift(app);
  invalidateCache();
}

// 1. OVERVIEW RENDERING
function renderOverview() {
  document.querySelector("[data-overview-welcome]").textContent = "Your innovation workspace";

  const drafts = state.applications.filter(a => a.status === "Draft");
  const submitted = state.applications.filter(a => a.status === "Submitted");
  const review = state.applications.filter(a => a.status === "In review");
  const actionNeeded = state.applications.filter(a => a.status === "Draft" || a.status === "Changes requested");

  // 1. Application status summary cards
  document.querySelector('[data-kpi="drafts"]').textContent = String(drafts.length);
  document.querySelector('[data-kpi="submitted"]').textContent = String(submitted.length);
  document.querySelector('[data-kpi="review"]').textContent = String(review.length);
  document.querySelector('[data-kpi="action"]').textContent = String(actionNeeded.length);

  const continueBtn = document.querySelector("[data-continue-latest-draft]");
  continueBtn.hidden = drafts.length === 0;
  if (drafts[0]) continueBtn.textContent = `Continue draft (${drafts[0].reference})`;

  // 2. Current application progress
  const progressBox = document.querySelector("[data-overview-progress]");
  progressBox.replaceChildren();
  const focusApp = actionNeeded[0] || state.applications[0];
  if (!focusApp) {
    const empty = el("div", "innovator-mini-item");
    const copy = el("div");
    copy.append(el("strong", "", "No applications started yet"), el("p", "", "Start a private draft by choosing Individual or Registered company and a sector."));
    const btn = el("button", "admin-cta", "Start application");
    btn.type = "button";
    btn.addEventListener("click", () => navigateTo("submit"));
    empty.append(copy, btn);
    progressBox.append(empty);
  } else {
    const card = el("div", "innovator-progress-card");
    const head = el("div", "innovator-progress-card-head");
    head.append(el("strong", "", `${focusApp.reference}: ${focusApp.title}`), statusBadge(focusApp.status));
    const meter = document.createElement("progress");
    meter.max = 100;
    let pctLabel = "";
    if (focusApp.status === "Draft") {
      const readiness = evaluateApplicationReadiness(focusApp, state.documents, state.applicationFormConfig);
      meter.value = Math.max(10, readiness.percentComplete);
      pctLabel = `Step ${Number(focusApp.currentStep || 1)} of 12 (${readiness.percentComplete}% ready)`;
    } else if (focusApp.status === "Submitted") {
      meter.value = 50;
      pctLabel = "Submitted, awaiting initial CEDA screening";
    } else if (focusApp.status === "Changes requested") {
      meter.value = 65;
      pctLabel = "Clarification requested, awaiting your response";
    } else if (focusApp.status === "In review") {
      meter.value = 78;
      pctLabel = "In review, CEDA evaluation in progress";
    } else {
      meter.value = 100;
      pctLabel = focusApp.status === "Withdrawn"
        ? "Application withdrawn"
        : focusApp.status === "Awarded"
          ? "Award conferred, recognition & onboarding active"
          : `Completed: ${focusApp.status}`;
    }
    const footer = el("div", "innovator-progress-card-head");
    footer.append(el("small", "admin-help", `${focusApp.sector} • ${pctLabel}`));
    const openBtn = el("button", "admin-button-secondary", focusApp.status === "Draft" ? "Continue draft" : "View workspace");
    openBtn.type = "button";
    openBtn.addEventListener("click", () => {
      if (focusApp.status === "Draft") openWizardForApp(focusApp.id);
      else openApplicationDetail(focusApp.id, focusApp.status === "Changes requested" ? "changes" : "summary");
    });
    footer.append(openBtn);
    card.append(head, meter, footer);
    progressBox.append(card);
  }

  // 3. Required actions
  const reqBox = document.querySelector("[data-overview-required-actions]");
  reqBox.replaceChildren();
  const profile = state.profile || {};
  const profileIncomplete = !String(profile.fullName || "").trim() || !String(profile.phone || "").trim() || !String(profile.district || "").trim() || !String(profile.expertise || "").trim();
  const actions = profileIncomplete
    ? [{ actionLabel: "Complete your profile", reference: "Profile", detail: "Add your contact and innovation details before submitting an application.", buttonText: "Complete profile", targetMode: "settings" }, ...collectRequiredActions(state.applications, state.documents)]
    : collectRequiredActions(state.applications, state.documents);
  if (!actions.length) {
    reqBox.append(el("p", "admin-help", "No actions are required right now."));
  } else {
    for (const act of actions.slice(0, 4)) {
      const row = el("div", "innovator-mini-item");
      const left = el("div");
      left.append(el("strong", "", `${act.actionLabel} (${act.reference})`), el("p", "", act.detail));
      const btn = el("button", "innovator-text-action", act.buttonText);
      btn.type = "button";
      btn.addEventListener("click", () => {
        if (act.targetMode === "settings") navigateTo("settings");
        else if (act.targetMode === "wizard") openWizardForApp(act.applicationId);
        else openApplicationDetail(act.applicationId, act.targetMode);
      });
      row.append(left, btn);
      reqBox.append(row);
    }
  }

  // 4. Recent application activity
  const actBox = document.querySelector("[data-overview-recent-activity]");
  actBox.replaceChildren();
  const events = collectRecentActivity(state.applications, 4);
  if (!events.length) {
    actBox.append(el("p", "admin-help", "Application milestones will appear here once you create or submit a draft."));
  } else {
    for (const ev of events) {
      const row = el("div", "innovator-mini-item");
      const left = el("div");
      left.append(el("strong", "", `${ev.label} • ${ev.reference}`), el("p", "", `${ev.detail}${ev.at ? ` (${ev.at})` : ""}`));
      const viewBtn = el("button", "innovator-text-action", "View");
      viewBtn.type = "button";
      viewBtn.addEventListener("click", () => openApplicationDetail(ev.applicationId, "progress"));
      row.append(left, viewBtn);
      actBox.append(row);
    }
  }

  // 5. Messages and deadlines
  const msgBox = document.querySelector("[data-overview-messages-deadlines]");
  msgBox.replaceChildren();
  const deadlines = state.applications
    .map(a => ({ app: a, req: a.status === "Changes requested" ? activeRequestedChange(a) : null }))
    .filter(item => item.req?.deadline);
  for (const { app, req } of deadlines.slice(0, 2)) {
    const item = el("div", "innovator-mini-item");
    const left = el("div");
    left.append(el("strong", "", `Clarification deadline: ${req.deadline}`), el("p", "", `${app.reference}: ${req.sectionLabel || req.section || "Requested update"}`));
    const act = el("button", "admin-button-secondary", "Respond");
    act.type = "button";
    act.addEventListener("click", () => openApplicationDetail(app.id, "changes"));
    item.append(left, act);
    msgBox.append(item);
  }
  const recentMsgs = [...state.messages].slice(-3).reverse();
  for (const m of recentMsgs) {
    const item = el("div", "innovator-mini-item");
    const left = el("div");
    left.append(el("strong", "", `${m.senderName}${m.applicationRef ? ` (${m.applicationRef})` : ""}`), el("p", "", `${m.subject}: ${String(m.body || "").slice(0, 72)}`));
    const openMsg = el("button", "innovator-text-action", m.isRead ? "View" : "Unread");
    openMsg.type = "button";
    openMsg.addEventListener("click", () => {
      state.activeThreadKey = m.applicationId || m.threadType || "general";
      navigateTo("messages");
    });
    item.append(left, openMsg);
    msgBox.append(item);
  }
  if (!msgBox.childElementCount) {
    msgBox.append(el("p", "admin-help", "No recent messages or pending deadlines."));
  }
}

// 2. MY APPLICATIONS & PERMANENT WORKSPACE
function renderApplicationsTable() {
  const tbody = document.querySelector("[data-apps-tbody]");
  const emptyBox = document.querySelector("[data-apps-empty]");
  const result = filterAndSortApplications(state.applications, { ...state.appsFilter, pageSize: 6 });
  state.appsFilter.page = result.page;

  tbody.replaceChildren();
  emptyBox.hidden = result.total > 0;
  tbody.closest(".admin-table").hidden = result.total === 0;

  for (const app of result.items) {
    const tr = document.createElement("tr");
    const addCell = val => { const td = tr.insertCell(); td.textContent = val || "N/A"; return td; };
    addCell(app.reference);
    const titleCell = tr.insertCell();
    titleCell.append(el("strong", "", app.title));
    addCell(app.applicantType);
    addCell(app.sector);
    addCell(app.createdAt);
    addCell(app.submittedDate || "Not submitted");
    const badgeCell = tr.insertCell();
    badgeCell.append(statusBadge(app.status));
    addCell(app.updatedAt);
    addCell(applicationRequiredAction(app));

    const actCell = tr.insertCell();
    const wrap = el("div", "innovator-table-actions");
    if (app.status === "Draft") {
      const cont = el("button", "innovator-text-action", "Continue draft");
      cont.type = "button";
      cont.addEventListener("click", () => openWizardForApp(app.id));
      wrap.append(cont);
    } else if (app.status === "Changes requested") {
      const resp = el("button", "innovator-text-action", "Respond");
      resp.type = "button";
      resp.addEventListener("click", () => openApplicationDetail(app.id, "changes"));
      wrap.append(resp);
    }
    const viewBtn = el("button", "innovator-text-action", "View details");
    viewBtn.type = "button";
    viewBtn.addEventListener("click", () => openApplicationDetail(app.id, "summary"));
    wrap.append(viewBtn);

    actCell.append(wrap);
    tbody.append(tr);
  }

  document.querySelector("[data-apps-results]").textContent = `${result.total} matching application${result.total === 1 ? "" : "s"}`;
  document.querySelector("[data-apps-page]").textContent = `Page ${result.page + 1} of ${result.totalPages}`;
  document.querySelector("[data-apps-prev]").disabled = result.page <= 0;
  document.querySelector("[data-apps-next]").disabled = result.page >= result.totalPages - 1;
}

function toggleDetailWorkspace(showDetail) {
  document.querySelector("[data-apps-list-view]").hidden = showDetail;
  document.querySelector("[data-app-detail-workspace]").hidden = !showDetail;
}

function openApplicationDetail(appId, tab = "summary") {
  state.detailAppId = appId;
  state.detailTab = tab;
  if (state.activeSection !== "applications") executeSectionSwitch("applications", { keepDetail: true });
  toggleDetailWorkspace(true);
  renderApplicationDetail();
}

function renderKVSection(container, title, pairs) {
  const card = el("div", "innovator-outcome-card");
  card.append(el("h4", "", title));
  const dl = el("dl", "innovator-kv-grid");
  for (const [label, val] of pairs) {
    const item = el("div", "innovator-kv-item");
    item.append(el("dt", "", label), el("dd", "", Array.isArray(val) ? (val.join(", ") || "N/A") : (val || "N/A")));
    dl.append(item);
  }
  card.append(dl);
  container.append(card);
}

function renderApplicationDetail() {
  const app = state.applications.find(a => a.id === state.detailAppId);
  if (!app) { toggleDetailWorkspace(false); renderApplicationsTable(); return; }

  document.querySelector("[data-detail-ref]").textContent = app.reference;
  document.querySelector("[data-detail-title]").textContent = app.title;
  document.querySelector("[data-detail-meta]").textContent = `${app.applicantType} • ${app.sector} • Last updated ${app.updatedAt}`;

  const badgeWrap = document.querySelector("[data-detail-badges]");
  badgeWrap.replaceChildren(statusBadge(app.status));
  if (app.receiptCode) badgeWrap.append(el("span", "admin-case-badge case-draft", `Receipt: ${app.receiptCode}`));
  const existingSub = state.alertSubscriptions.find(s => s.applicationId === app.id || s.applicationRef === app.reference);
  const subSummary = summarizeApplicationAlertSubscription(existingSub, state.profile?.preferences);
  badgeWrap.append(el("span", `admin-case-badge ${subSummary.isSubscribed ? "case-approved" : "case-draft"}`, subSummary.badgeText));

  const headerActions = document.querySelector("[data-detail-header-actions]");
  headerActions.replaceChildren();
  const subToggleBtn = el(
    "button",
    "admin-button-secondary",
    subSummary.isSubscribed ? "Alerts subscribed (Free)" : "Subscribe free alerts (P0.00)",
  );
  subToggleBtn.type = "button";
  subToggleBtn.title = `${subSummary.feeLabel} · Channels: ${subSummary.activeChannelsLabel}`;
  subToggleBtn.addEventListener("click", async () => {
    subToggleBtn.disabled = true;
    try {
      const nextSubs = await rpc("innovator_toggle_submission_alerts", {
        p_application_id: app.id,
        p_is_subscribed: !subSummary.isSubscribed,
      });
      if (Array.isArray(nextSubs)) state.alertSubscriptions = nextSubs;
      renderApplicationDetail();
      announce(
        !subSummary.isSubscribed
          ? `Subscribed to free alerts for ${app.reference} (${FREE_ALERT_FEE_LABEL}).`
          : `Paused email and push alerts for ${app.reference}. Portal timeline tracking remains active.`,
      );
    } catch (err) {
      announce(err.message);
      subToggleBtn.disabled = false;
    }
  });
  headerActions.append(subToggleBtn);
  if (app.status === "Draft") {
    const btn = el("button", "admin-cta", "Continue draft in wizard");
    btn.type = "button";
    btn.addEventListener("click", () => openWizardForApp(app.id));
    headerActions.append(btn);
  }
  if (app.receiptCode) {
    const rcptBtn = el("button", "innovator-icon-action", "");
    rcptBtn.append(downloadIcon());
    rcptBtn.setAttribute("aria-label", "Download receipt");
    rcptBtn.title = "Download receipt";
    rcptBtn.type = "button";
    rcptBtn.addEventListener("click", () => downloadDocumentFile(buildSubmissionReceiptDocument(app, state.documents)));
    headerActions.append(rcptBtn);
  }
  if (app.status === "Changes requested") {
    const fixBtn = el("button", "admin-cta", "Respond to clarification");
    fixBtn.type = "button";
    fixBtn.addEventListener("click", () => { state.detailTab = "changes"; renderApplicationDetail(); });
    headerActions.append(fixBtn);
  }
  if (canWithdrawApplication(app.status)) {
    const wBtn = el("button", "innovator-text-action innovator-danger-action", "Withdraw");
    wBtn.type = "button";
    wBtn.addEventListener("click", () => openWithdrawDialog(app.id));
    headerActions.append(wBtn);
  }

  for (const tabBtn of document.querySelectorAll("[data-detail-tab]")) {
    const isSel = tabBtn.dataset.detailTab === state.detailTab;
    tabBtn.classList.toggle("is-active", isSel);
    tabBtn.setAttribute("aria-selected", isSel ? "true" : "false");
  }
  for (const panel of document.querySelectorAll("[data-detail-panel]")) {
    panel.hidden = panel.dataset.detailPanel !== state.detailTab;
  }

  // Summary Panel (including Outcome Screen when Approved/Rejected)
  const summaryPanel = document.querySelector('[data-detail-panel="summary"]');
  summaryPanel.replaceChildren();
  const data = app.formData || {};
  summaryPanel.append(el("h3", "", "Application summary"), el("p", "", app.summary || data.summary || "No summary entered yet."));
  renderKVSection(summaryPanel, "Key classification", [
    ["Applicant", `${state.profile?.fullName || app.applicant} (${app.applicantType})`],
    ["Sector", app.sector],
    ["Innovation stage", data.stage || "Prototype"],
    ["Deployment footprint", data.deploymentFootprint || "National (Botswana)"],
    ["Submitted date", app.submittedDate || "Draft not yet submitted"],
    ["Version", String(app.version || 1)],
  ]);

  if (app.status === "Approved" || app.status === "Awarded" || app.status === "Rejected") {
    const isAward = app.status === "Awarded";
    const award = app.awardData || {};
    const outcomeBox = el("div", `innovator-outcome-card${isAward ? " is-award" : ""}`);
    const outcome = app.outcomeData || {};
    const outcomeDate = (isAward ? award.conferredAt : null) || outcome.outcomeDate || outcome.releasedAt || app.updatedAt;
    const outcomeFeedback = (isAward && award.awardSummary) || outcome.applicantFeedback || outcome.feedback || "CEDA has recorded your outcome decision.";
    const rawSteps = outcome.recommendedNextSteps ?? outcome.nextSteps;
    const steps = Array.isArray(rawSteps)
      ? rawSteps
      : typeof rawSteps === "string" && rawSteps.trim()
        ? [rawSteps.trim()]
        : [];
    outcomeBox.append(
      el("p", "eyebrow", isAward ? "OFFICIAL INNOVATION AWARD" : "OFFICIAL APPLICATION OUTCOME"),
      el("h3", "", isAward ? (award.awardTitle || `CEDA Innovation Award: ${app.title}`) : `Outcome released: ${app.status}`),
      el("p", "admin-help", `${isAward ? "Award conferred" : "Outcome date"}: ${outcomeDate}${isAward && award.awardCategory ? ` · Category: ${award.awardCategory}` : ""}${isAward && award.awardAmount ? ` · Package: ${award.awardAmount}` : ""}`),
      el("h4", "", isAward ? "Award citation & feedback" : "Approved applicant feedback"),
      el("p", "", outcomeFeedback),
    );
    if (steps.length) {
      outcomeBox.append(el("h4", "", "Recommended next steps"));
      const ol = el("ol");
      for (const s of steps) ol.append(el("li", "", s));
      outcomeBox.append(ol);
    }
    outcomeBox.append(el("p", "admin-help", `Support contact: ${outcome.supportContact || "CEDA Support Desk"}`));
    const acts = el("div", "admin-form-actions");
    const letterBtn = el("button", "admin-cta", isAward ? "Download official award notice" : "Download official outcome letter");
    letterBtn.type = "button";
    letterBtn.addEventListener("click", () => downloadDocumentFile(buildOutcomeLetterDocument(app)));
    acts.append(letterBtn);
    if (outcome.appealPermitted ?? outcome.appealAllowed) {
      const appealBtn = el("button", "admin-button-secondary", "Request clarification / appeal review");
      appealBtn.type = "button";
      appealBtn.addEventListener("click", () => { state.detailTab = "messages"; renderApplicationDetail(); });
      acts.append(appealBtn);
    }
    outcomeBox.append(acts);
    summaryPanel.append(outcomeBox);
  }

  // Submitted Information Panel (uses originalSnapshot when submitted)
  const subPanel = document.querySelector('[data-detail-panel="submitted"]');
  subPanel.replaceChildren();
  const hasOriginal = app.status !== "Draft" && app.originalSnapshot && typeof app.originalSnapshot === "object" && Object.keys(app.originalSnapshot).length > 0;
  const snap = hasOriginal ? app.originalSnapshot : data;
  subPanel.append(
    el("h3", "", hasOriginal ? "Locked initial submission snapshot" : "Current draft snapshot"),
    el("p", "admin-help", hasOriginal ? "Original submitted details remain permanently preserved even after revisions." : "Complete and submit your draft to lock an official snapshot."),
  );
  if (app.status === "Changes requested") {
    const editAction = el("button", "innovator-text-action", "Edit and resubmit");
    editAction.type = "button";
    editAction.addEventListener("click", () => { state.detailTab = "changes"; renderApplicationDetail(); });
    subPanel.append(editAction);
  }
  renderKVSection(subPanel, "1 & 2. Applicant & Overview", [
    ["Applicant", state.profile?.fullName || snap.fullName],
    ["Company", snap.companyName],
    ["Title", snap.title],
    ["Summary", snap.summary],
    ["Technology / method", snap.technologyMethod],
    ["Innovation categories", snap.innovationType],
  ]);
  renderKVSection(subPanel, "3 to 6. Problem, Solution & Impact", [
    ["Problem being addressed", snap.problem],
    ["Urgency", snap.problemUrgency],
    ["Proposed solution", snap.solution],
    ["Alternatives & differentiation", snap.alternativesDetail],
    ["Beneficiaries", snap.beneficiaries],
    ["How Botswana benefits", snap.botswanaBenefit],
    ["Market demand", snap.marketDemand],
    ["Jobs estimates (Y1 / Y3 / Y5)", [snap.jobsYear1, snap.jobsYear3, snap.jobsYear5].filter(Boolean).join(" / ")],
  ]);
  renderKVSection(subPanel, "7 to 10. Stage, Implementation & Support", [
    ["Innovation stage", snap.stage],
    ["Stage validation notes", snap.stageEvidenceNotes],
    ["Implementation approach", snap.implementationApproach],
    ["Milestones (1Y / 3Y / 5Y)", [snap.milestone1Year, snap.milestone3Year, snap.milestone5Year].filter(Boolean).join(" | ")],
    ["Risks & mitigations", snap.risksAndMitigations],
    ["Team experience", snap.teamExperience],
    ["Support required", snap.supportRequestedSummary],
    ["Financial assumptions", snap.financialAssumptions],
  ]);

  // Evidence Panel (supports supplemental upload during Changes requested)
  const evPanel = document.querySelector('[data-detail-panel="evidence"]');
  evPanel.replaceChildren(el("h3", "", "Application supporting evidence"));
  const appDocs = state.documents.filter(d => d.applicationId === app.id && d.uploadStatus !== "Removed");
  if (!appDocs.length) {
    evPanel.append(el("p", "admin-help", "No supporting documents or video links have been attached to this application."));
  } else {
    const tblWrap = el("div", "admin-table");
    const tbl = document.createElement("table");
    tbl.innerHTML = "<thead><tr><th>Title</th><th>Section</th><th>File / Link</th><th>Version</th><th>Actions</th></tr></thead><tbody></tbody>";
    const tb = tbl.querySelector("tbody");
    for (const doc of appDocs) {
      const tr = tb.insertRow();
      tr.insertCell().textContent = doc.title;
      tr.insertCell().textContent = doc.sectionKey;
      tr.insertCell().textContent = doc.docKind === "video_link" ? doc.videoUrl : doc.fileName;
      tr.insertCell().textContent = `v${doc.version || 1}`;
      const ac = tr.insertCell();
      const previewBtn = el("button", "admin-button-secondary", "Preview");
      previewBtn.type = "button";
      previewBtn.addEventListener("click", () => openDocumentPreview(doc));
      ac.append(previewBtn);
    }
    tblWrap.append(tbl);
    evPanel.append(tblWrap);
  }
  if (app.status === "Changes requested") {
    const supForm = el("form", "admin-form innovator-outcome-card");
    supForm.append(
      el("h4", "admin-form-wide", "Upload additional clarification evidence"),
      el("p", "admin-help admin-form-wide", "Attach supplemental documents requested by CEDA without deleting your original submission evidence."),
    );
    const titleLabel = el("label", "", "Document title");
    const titleInput = el("input"); titleInput.name = "title"; titleInput.required = true; titleInput.maxLength = 160;
    titleLabel.append(titleInput);
    const fileLabel = el("label", "", "Supplemental file (max 10 MB)");
    const fileInput = el("input"); fileInput.type = "file"; fileInput.accept = ".pdf,.docx,.pptx,.xlsx,.jpg,.jpeg,.png"; fileInput.required = true;
    fileLabel.append(fileInput);
    const upBtn = el("button", "admin-cta", "Upload supplemental evidence"); upBtn.type = "submit";
    supForm.append(titleLabel, fileLabel, upBtn);
    supForm.addEventListener("submit", async e => {
      e.preventDefault();
      const file = fileInput.files?.[0];
      await uploadDocumentToPrivateBucket(app.id, "clarification", "supplemental", titleInput.value.trim(), "Clarification response", "", file);
      renderApplicationDetail();
    });
    evPanel.append(supForm);
  }

  // Progress Timeline Panel
  const progPanel = document.querySelector('[data-detail-panel="progress"]');
  progPanel.replaceChildren(el("h3", "", "Application progress timeline"));
  const stageBar = el("ol", "innovator-stage-track");
  const currentRank =
    app.status === "Awarded" ? 5
      : app.status === "Approved" ? 4
        : app.status === "Changes requested" ? 3
          : app.status === "In review" ? 2
            : app.status === "Submitted" ? 1
              : app.status === "Rejected" ? 4
                : 0;
  for (const [idx, stageLabel] of ["Submission", "Review", "Feedback", "Approval", "Award"].map((lbl, i) => [i + 1, lbl])) {
    const done = currentRank > idx || (idx === 5 && app.status === "Awarded");
    const active = currentRank === idx && !done;
    const node = el("li", `innovator-stage-pill${done ? " is-done" : active ? " is-active" : ""}`);
    node.append(el("small", "", `Stage ${idx}`), el("strong", "", idx === 4 && app.status === "Rejected" ? "Outcome (Declined)" : stageLabel));
    stageBar.append(node);
  }
  progPanel.append(stageBar);
  const tl = el("ol", "innovator-timeline");
  for (const item of app.timeline || []) {
    const li = document.createElement("li");
    li.append(el("strong", "", item.label), el("p", "", item.detail), el("small", "", item.at || ""));
    tl.append(li);
  }
  progPanel.append(tl);

  // Messages Panel
  const msgPanel = document.querySelector('[data-detail-panel="messages"]');
  msgPanel.replaceChildren(el("h3", "", "Messages for this application"));
  const appMsgs = state.messages.filter(m => m.applicationId === app.id);
  const stream = el("div", "innovator-message-stream");
  if (!appMsgs.length) stream.append(el("p", "admin-help", "No messages for this application yet."));
  for (const m of appMsgs) {
    const bubble = el("article", `innovator-bubble${m.senderRole === "innovator" ? " is-mine" : ""}`);
    const head = el("div", "innovator-bubble-head");
    head.append(el("strong", "", m.senderName), el("span", "", m.createdAt));
    bubble.append(head, el("p", "", m.body));
    stream.append(bubble);
  }
  const replyForm = el("form", "admin-form");
  const msgLbl = el("label", "admin-form-wide", "Reply to CEDA regarding this application");
  const msgArea = el("textarea"); msgArea.name = "body"; msgArea.required = true; msgArea.minLength = 2; msgArea.rows = 2; msgArea.placeholder = "Type your message to CEDA...";
  msgLbl.append(msgArea);
  const sendBtn = el("button", "admin-cta", "Send message"); sendBtn.type = "submit";
  replyForm.append(msgLbl, sendBtn);
  msgArea.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      replyForm.requestSubmit();
    }
  });
  replyForm.addEventListener("submit", async e => {
    e.preventDefault();
    const text = msgArea.value.trim();
    if (!text) return;
    const optimisticMsg = {
      id: `local-${Date.now()}`,
      applicationId: app.id,
      applicationRef: app.reference,
      threadType: "application",
      subject: `${app.reference} message`,
      body: text,
      senderName: state.profile?.fullName || "You",
      senderRole: "innovator",
      createdAt: new Date().toLocaleTimeString("en-BW", { hour: "2-digit", minute: "2-digit", hour12: false }),
      isRead: true,
    };
    state.messages = [...state.messages, optimisticMsg];
    renderApplicationDetail();
    try {
      const updated = await rpc("innovator_send_message", {
        p_application_id: app.id,
        p_thread_type: "application",
        p_subject: `${app.reference} message`,
        p_body: text,
      });
      if (Array.isArray(updated) && updated.length) {
        state.messages = updated;
        invalidateCache();
        renderApplicationDetail();
      }
      announce("Message sent to CEDA team.");
    } catch (err) {
      announce(err.message || "Message saved in this session.");
    }
  });
  msgPanel.append(stream, replyForm);

  // Requested Changes Panel
  const chPanel = document.querySelector('[data-detail-panel="changes"]');
  chPanel.replaceChildren(el("h3", "", "Clarification & requested changes"));
  if (app.status !== "Changes requested") {
    chPanel.append(el("p", "admin-help", "No clarification changes are currently requested for this application."));
  } else {
    const req = activeRequestedChange(app) || {};
    const banner = el("div", "innovator-outcome-card");
    banner.append(
      el("strong", "", `Requested section: ${req.sectionLabel || req.section || "Application clarity update"}`),
      el("p", "", req.feedback || "CEDA requested additional clarity or updated supporting figures."),
      el("p", "admin-help", `Deadline: ${req.deadline || "Submit promptly"} • Your original submitted snapshot remains preserved in Submitted information.`),
    );
    const revForm = el("form", "admin-form");
    const secKey = req.sectionKey || req.section || "problem";
    const fieldMap = { applicant: "summary", problem: "problem", impact: "botswanaBenefit", feasibility: "implementationApproach", supplementary: "supportRequestedSummary", clarification: "problem", general: "problem" };
    const targetField = fieldMap[secKey] || "problem";
    const editLbl = el("label", "admin-form-wide", `Revised ${targetField} text`);
    const editArea = el("textarea"); editArea.rows = 4; editArea.required = true; editArea.minLength = 10;
    editArea.value = String((app.formData || {})[targetField] || "");
    editLbl.append(editArea);

    const noteLbl = el("label", "admin-form-wide", "Response note explaining what changed (min 10 chars)");
    const noteArea = el("textarea"); noteArea.rows = 2; noteArea.required = true; noteArea.minLength = 10;
    noteLbl.append(noteArea);

    const submitRev = el("button", "admin-cta", "Submit revised version"); submitRev.type = "submit";
    revForm.append(editLbl, noteLbl, submitRev);
    revForm.addEventListener("submit", async e => {
      e.preventDefault();
      if (noteArea.value.trim().length < 10) {
        announce("Enter a clarification response note of at least 10 characters.");
        return;
      }
      try {
        const updated = await rpc("innovator_submit_clarification", {
          p_app_id: app.id,
          p_section_key: secKey,
          p_updated_fields: { [targetField]: editArea.value.trim() },
          p_response_note: noteArea.value.trim(),
          p_expected_version: app.version,
        });
        upsertApplication(updated);
        state.detailTab = "progress";
        renderAll();
        announce("Revised version submitted for CEDA review.");
      } catch (err) {
        announce(err.message);
      }
    });
    chPanel.append(banner, revForm);
  }
}

document.querySelector("[data-back-to-apps]")?.addEventListener("click", () => {
  state.detailAppId = null;
  toggleDetailWorkspace(false);
  renderApplicationsTable();
});
for (const tabBtn of document.querySelectorAll("[data-detail-tab]")) {
  tabBtn.addEventListener("click", () => {
    state.detailTab = tabBtn.dataset.detailTab;
    renderApplicationDetail();
  });
}

// Withdraw dialog
function openWithdrawDialog(appId) {
  state.withdrawAppId = appId;
  document.querySelector("[data-withdraw-form]").reset();
  openDialog("withdraw-confirm", "Withdraw application");
}
document.querySelector("[data-withdraw-form]")?.addEventListener("submit", async e => {
  e.preventDefault();
  const reason = e.target.elements.reason.value.trim();
  try {
    const updated = await rpc("innovator_withdraw_application", { p_app_id: state.withdrawAppId, p_reason: reason });
    upsertApplication(updated);
    closeDialog();
    renderAll();
    announce(`Application ${updated.reference} withdrawn.`);
  } catch (err) {
    if (dialogStatusEl) dialogStatusEl.textContent = err.message;
  }
});

// 3. START APPLICATION -> 12-STEP WIZARD -> SUBMISSION SUCCESS
function syncSectorDropdowns() {
  for (const sel of document.querySelectorAll("[data-start-sector-select], [data-wizard-sector-select]")) {
    const prev = sel.value;
    sel.replaceChildren();
    for (const s of state.sectors) {
      const opt = el("option", "", s.name);
      opt.value = sel.hasAttribute("data-start-sector-select") ? s.id : s.name;
      sel.append(opt);
    }
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  }
}

function showSubmitSubView(mode) {
  document.querySelector("[data-start-application-view]").hidden = mode !== "start";
  document.querySelector("[data-wizard-view]").hidden = mode !== "wizard";
  document.querySelector("[data-submission-success-view]").hidden = mode !== "success";
}

document.querySelector("[data-start-application-form]")?.addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.target;
  try {
    announce("Creating your private autosaved draft...");
    const draft = await rpc("innovator_create_draft", {
      p_applicant_type: form.elements.applicantType.value,
      p_sector_id: form.elements.sectorId.value,
    });
    upsertApplication(draft);
    openWizardForApp(draft.id);
    announce(`Private draft ${draft.reference} created with smart profile defaults.`);
  } catch (err) {
    announce(err.message);
  }
});

function readWizardFormData() {
  const form = document.querySelector("[data-wizard-form]");
  const app = state.applications.find(a => a.id === state.wizardAppId);
  const existing = { ...(app?.formData || {}) };
  const val = name => String(form.elements[name]?.value ?? "").trim();
  const checkedValues = name => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(cb => cb.value);

  return {
    ...existing,
    applicantType: val("applicantType") || existing.applicantType || "Individual",
    fullName: val("fullName"),
    email: val("email"),
    phone: val("phone"),
    district: val("district"),
    expertise: val("expertise"),
    hasCollaborators: val("hasCollaborators"),
    collaboratorsText: val("collaboratorsText"),
    alternativeContactName: val("alternativeContactName"),
    alternativeContactRelationship: val("alternativeContactRelationship"),
    alternativeContactPhone: val("alternativeContactPhone"),
    alternativeContactConsent: Boolean(form.elements.alternativeContactConsent?.checked),
    companyName: val("companyName"),
    companyRegNumber: val("companyRegNumber"),
    companySector: val("companySector"),
    representativeRole: val("representativeRole"),
    companyAuthority: Boolean(form.elements.companyAuthority?.checked),
    title: val("title"),
    summary: val("summary"),
    primarySector: val("primarySector"),
    technologyMethod: val("technologyMethod"),
    innovationType: checkedValues("innovationType"),
    problem: val("problem"),
    problemSource: "write",
    problemDocument: "",
    problemUrgency: val("problemUrgency"),
    solution: val("solution"),
    solutionSource: "write",
    solutionDocument: "",
    hasAlternatives: val("hasAlternatives"),
    testedWithUsers: val("testedWithUsers"),
    alternativesDetail: val("alternativesDetail"),
    testingLessons: val("testingLessons"),
    beneficiaries: checkedValues("beneficiaries"),
    deploymentFootprint: val("deploymentFootprint"),
    empowermentFocus: val("empowermentFocus"),
    botswanaBenefit: val("botswanaBenefit"),
    environmentalImpact: val("environmentalImpact"),
    environmentalNotes: val("environmentalNotes"),
    marketDemand: val("marketDemand"),
    createsJobs: val("createsJobs"),
    jobsYear1: val("jobsYear1"),
    jobsYear3: val("jobsYear3"),
    jobsYear5: val("jobsYear5"),
    jobsAssumptions: val("jobsAssumptions"),
    stage: val("stage"),
    stageEvidenceNotes: val("stageEvidenceNotes"),
    stageMilestoneNext: val("stageMilestoneNext"),
    implementationApproach: val("implementationApproach"),
    implementationSource: "write",
    implementationDocument: "",
    milestone1Year: val("milestone1Year"),
    milestone3Year: val("milestone3Year"),
    milestone5Year: val("milestone5Year"),
    risksAndMitigations: val("risksAndMitigations"),
    teamExperience: val("teamExperience"),
    resourcesNeeded: val("resourcesNeeded"),
    partnerships: val("partnerships"),
    supportRequestedSummary: val("supportRequestedSummary"),
    hasBusinessPlan: val("hasBusinessPlan"),
    hasFinancialProjections: val("hasFinancialProjections"),
    financialAssumptions: val("financialAssumptions"),
    selfDeveloped: val("selfDeveloped"),
    otherContributors: val("otherContributors"),
    sharedPublicly: val("sharedPublicly"),
    existingAgreements: val("existingAgreements"),
    permissionToSubmit: Boolean(form.elements.permissionToSubmit?.checked),
    accuracyConfirmed: Boolean(form.elements.accuracyConfirmed?.checked),
    privacyConfirmed: Boolean(form.elements.privacyConfirmed?.checked),
    customResponses: { ...(existing.customResponses || {}), ...state.wizardCustomResponses },
  };
}

function hydrateWizardForm(app) {
  const form = document.querySelector("[data-wizard-form]");
  const f = app.formData || {};
  state.wizardCustomResponses = f.customResponses && typeof f.customResponses === "object"
    ? { ...f.customResponses }
    : {};
  for (const field of form.elements) {
    if (!field.name) continue;
    if (field.type === "radio") {
      field.checked = field.value === (f[field.name] || "write");
      continue;
    }
    if (field.type === "checkbox") {
      if (field.name === "innovationType" || field.name === "beneficiaries") {
        field.checked = Array.isArray(f[field.name]) && f[field.name].includes(field.value);
      } else {
        field.checked = Boolean(f[field.name]);
      }
    } else if (f[field.name] !== undefined && f[field.name] !== null) {
      field.value = String(f[field.name]);
    }
  }
  // The authenticated profile is authoritative. Never carry another user's
  // name from an old draft into this innovator's submission.
  if (state.profile?.fullName && form.elements.fullName) form.elements.fullName.value = state.profile.fullName;
  if (state.profile?.email && form.elements.email) form.elements.email.value = state.profile.email;
  if (!form.elements.primarySector.value && app.sector) form.elements.primarySector.value = app.sector;
  updateWizardDynamicVisibility();
}

function renderDocumentChoices(saved = readWizardFormData()) {
  const form = document.querySelector("[data-wizard-form]");
  const docs = state.documents.filter(doc => doc.applicationId === state.wizardAppId && doc.docKind === "file" && doc.uploadStatus === "Saved");
  for (const [key, section] of [["problem", "problem"], ["solution", "problem"], ["implementation", "feasibility"]]) {
    const select = form.elements[`${key}Document`];
    if (!select) continue;
    const current = saved[`${key}Document`] || select.value;
    select.replaceChildren(new Option("Choose an uploaded document", ""));
    for (const doc of docs.filter(item => item.sectionKey === section)) select.add(new Option(doc.title, doc.id));
    select.value = docs.some(doc => doc.id === current && doc.sectionKey === section) ? current : "";
  }
}

function updateWizardDynamicVisibility() {
  const form = document.querySelector("[data-wizard-form]");
  document.querySelector("[data-company-fields]").hidden = form.elements.applicantType.value !== "Registered company";
  document.querySelector("[data-collaborators-field]").hidden = form.elements.hasCollaborators.value !== "Yes";
  document.querySelector("[data-testing-lessons-wrap]").hidden = form.elements.testedWithUsers.value !== "Yes";
  for (const key of ["problem", "solution", "implementation"]) {
    const documentMode = form.querySelector(`input[name="${key}Source"]:checked`)?.value === "document";
    const choice = document.querySelector(`[data-document-choice="${key}"]`);
    if (!choice) continue;
    const answer = form.elements[key === "implementation" ? "implementationApproach" : key];
    if (!answer.dataset.writePlaceholder) answer.dataset.writePlaceholder = answer.placeholder;
    answer.placeholder = documentMode ? "Briefly explain the answer and give relevant page numbers in your document." : answer.dataset.writePlaceholder;
  }

  // Adaptive Step 7 stage panel
  const stage = form.elements.stage.value || "Prototype";
  const stageCfg = STAGE_MATRIX[stage] || STAGE_MATRIX.Prototype;
  const stageBox = document.querySelector("[data-stage-guidance-box]");
  stageBox.replaceChildren(
    el("strong", "", `${stage} stage guidance`),
    el("p", "", stageCfg.summary),
    el("p", "admin-help", `Suggested evidence: ${stageCfg.evidenceHint} Next milestone focus: ${stageCfg.milestoneHint}`),
  );
  document.querySelector("[data-stage-metrics-label]").textContent = stageCfg.metricsLabel;
  form.elements.stageEvidenceNotes.placeholder = stageCfg.metricsPlaceholder;

  // Live char & word guidance
  const limits = {
    title: [3, 200],
    summary: [20, 5000],
    problem: [20, 5000],
    problemUrgency: [5, 2000],
    solution: [20, 5000],
    botswanaBenefit: [10, 3000],
    marketDemand: [10, 4000],
    stageEvidenceNotes: [5, 3000],
    implementationApproach: [10, 4000],
    teamExperience: [5, 3000],
    supportRequestedSummary: [5, 3000],
  };
  for (const [key, [minC, maxC]] of Object.entries(limits)) {
    const helper = document.querySelector(`[data-count-for="${key}"]`);
    if (helper && form.elements[key]) {
      helper.textContent = charGuidance(form.elements[key].value, minC, maxC).label;
    }
  }
}

function renderWizardEvidenceTable() {
  const tb = document.querySelector("[data-wizard-evidence-tbody]");
  const appDocs = state.documents.filter(d => d.applicationId === state.wizardAppId && d.uploadStatus !== "Removed");
  const guideHost = document.querySelector("[data-wizard-forms-guide]");
  if (guideHost) renderPortalFormsCatalog(guideHost, true);
  const checklist = document.querySelector("[data-document-checklist]");
  if (checklist) {
    const applicantType = document.querySelector('[data-wizard-form] select[name="applicantType"]').value;
    checklist.replaceChildren(el("h4", "", "Applicant verification documents"), el("p", "admin-help", "Choose each document below. Attachments supporting earlier answers stay with those answers."));
    const categories = applicantType === "Registered company"
      ? [["Certified identity copy", "Certified ID front of the authorized representative"], ["Identity back", "Certified ID back of the authorized representative"], ["Proof of residence", "Proof of residence"], ["Company registration certificate", "Company registration certificate"], ["Director or shareholder records", "Share certificates and director records"], ["Tax clearance certificate", "Tax clearance certificate (when applicable)"]]
      : [["Certified identity copy", "Certified Omang front"], ["Identity back", "Certified Omang back"], ["Proof of residence", "Proof of residence"]];
    for (const [category, label] of categories) {
      const row = el("div", "innovator-document-upload-row");
      const name = el("strong", "", label);
      const fileInput = document.createElement("input"); fileInput.type = "file";
      fileInput.accept = ".pdf,.docx,.jpg,.jpeg,.png";
      fileInput.setAttribute("aria-label", `Upload ${label}`);
      const matching = appDocs.filter(doc => doc.category === category && doc.docKind === "file" && doc.uploadStatus === "Saved");
      const help = el("small", "admin-help", matching.length ? `${matching.length} attached: ${matching.map(doc => doc.fileName).join(", ")}` : "No file attached yet");
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        fileInput.disabled = true;
        try { await uploadDocumentToPrivateBucket(state.wizardAppId, "applicant", "file", label, category, "Applicant verification document", file); }
        finally { fileInput.value = ""; fileInput.disabled = false; }
      });
      row.append(name, help, fileInput);
      checklist.append(row);
    }
  }
  tb.replaceChildren();
  if (!appDocs.length) {
    const tr = tb.insertRow();
    const td = tr.insertCell();
    td.colSpan = 6;
    td.textContent = "No files or video links added to this draft yet.";
    return;
  }
  for (const doc of appDocs) {
    const tr = tb.insertRow();
    tr.insertCell().textContent = doc.title;
    tr.insertCell().textContent = doc.sectionKey;
    tr.insertCell().textContent = doc.docKind === "video_link" ? doc.videoUrl : doc.fileName;
    tr.insertCell().textContent = doc.docKind === "video_link" ? "Link" : formatBytes(doc.fileSize);
    tr.insertCell().textContent = doc.uploadStatus;
    const act = tr.insertCell();
    const btns = el("div", "innovator-hero-actions");
    const pre = el("button", "admin-button-secondary", "Preview"); pre.type = "button";
    pre.addEventListener("click", () => openDocumentPreview(doc));
    btns.append(pre);
    if (doc.docKind === "file") {
      const rep = el("button", "admin-button-secondary", "Replace"); rep.type = "button";
      rep.addEventListener("click", () => {
        state.replacingDocId = doc.id;
        document.querySelector("[data-evidence-section]").value = doc.sectionKey;
        document.querySelector("[data-evidence-title]").value = doc.title;
        document.querySelector("[data-evidence-file-input]").click();
        announce(`Select replacement file for "${doc.title}" then click Upload file securely.`);
      });
      btns.append(rep);
    }
    const rem = el("button", "admin-button-secondary", "Remove"); rem.type = "button";
    rem.addEventListener("click", async () => {
      try {
        state.documents = await rpc("innovator_remove_document", { p_doc_id: doc.id });
        if (doc.storagePath) await deletePrivateStorageObject(doc.storagePath);
        invalidateCache();
        renderWizardEvidenceTable();
        renderWizardChrome();
        announce("Removed supporting item.");
      } catch (err) {
        announce(err.message);
      }
    });
    btns.append(rem);
    act.append(btns);
  }
}

function renderWizardChrome() {
  const app = state.applications.find(a => a.id === state.wizardAppId);
  if (!app) return;
  const liveForm = readWizardFormData();
  const readiness = evaluateApplicationReadiness({ ...app, formData: liveForm }, state.documents, state.applicationFormConfig);

  document.querySelector("[data-wizard-ref]").textContent = app.reference;
  document.querySelector("[data-wizard-app-title]").textContent = liveForm.title || app.title || "Untitled innovation draft";
  document.querySelector("[data-wizard-last-saved]").textContent = state.wizardSaving ? "Saving..." : `Last saved ${app.updatedAt}`;

  const stepMeta = WIZARD_STEPS.find(s => s.step === state.wizardStep) || WIZARD_STEPS[0];
  const cfgStep = state.applicationFormConfig?.steps?.find(s => Number(s.stepNumber) === state.wizardStep);
  const activeStepTitle = cfgStep?.title || stepMeta.title;
  const activeStepHint = cfgStep?.description || stepMeta.hint;
  document.querySelector("[data-wizard-step-label]").textContent = `Step ${stepMeta.step} of 12: ${activeStepTitle}`;
  document.querySelector("[data-wizard-readiness-label]").textContent = `${readiness.percentComplete}% complete`;
  document.querySelector("[data-wizard-progress]").value = Math.max(8, readiness.percentComplete);
  document.querySelector("[data-step-eyebrow]").textContent = `STEP ${stepMeta.step} OF 12`;
  document.querySelector("[data-step-heading]").textContent = activeStepTitle;
  document.querySelector("[data-step-hint]").textContent = activeStepHint;

  for (const panel of document.querySelectorAll("[data-wizard-step-panel]")) {
    const isCurrent = Number(panel.dataset.wizardStepPanel) === state.wizardStep;
    panel.hidden = !isCurrent;
    if (isCurrent) renderWizardCustomFields(panel, state.wizardStep);
  }
  for (const btn of document.querySelectorAll("[data-wizard-jump]")) {
    const s = Number(btn.dataset.wizardJump);
    const res = readiness.stepResults.find(r => r.step === s);
    btn.classList.toggle("is-active", s === state.wizardStep);
    btn.classList.toggle("is-complete", Boolean(res?.complete));
    const st = btn.querySelector("[data-rail-state]");
    if (st) st.textContent = res?.complete ? "Ready" : "Pending";
  }
  for (const btn of document.querySelectorAll("[data-track-jump]")) {
    const s = Number(btn.dataset.trackJump);
    const ready = readiness.stepResults.find(item => item.step === s)?.complete;
    btn.classList.toggle("is-active", s === state.wizardStep);
    btn.classList.toggle("is-complete", Boolean(ready));
    btn.setAttribute("aria-current", s === state.wizardStep ? "step" : "false");
    btn.querySelector(".innovator-track-dot").textContent = ready && s !== state.wizardStep ? "✓" : String(s);
  }

  document.querySelector("[data-wizard-prev]").disabled = state.wizardStep <= 1;
  document.querySelector("[data-wizard-next]").hidden = state.wizardStep >= 12;

  if (state.wizardStep === 11) renderWizardEvidenceTable();
  renderInlineAttachments();
  if (state.wizardStep === 12) renderWizardReviewChecklist(readiness);
}

const inlineEvidenceFields = {
  problem: "problem", problemUrgency: "problem", solution: "problem", alternativesDetail: "problem",
  botswanaBenefit: "impact", marketDemand: "impact", jobsAssumptions: "impact",
  stageEvidenceNotes: "feasibility", stageMilestoneNext: "feasibility",
  implementationApproach: "feasibility", risksAndMitigations: "feasibility",
  financialAssumptions: "supplementary", supportRequestedSummary: "supplementary",
};

function renderInlineAttachments() {
  for (const fieldName of Object.keys(inlineEvidenceFields)) {
    const list = document.querySelector(`[data-inline-list="${fieldName}"]`);
    if (!list) continue;
    const docs = state.documents.filter(doc => doc.applicationId === state.wizardAppId && doc.category === `Answer: ${fieldName}` && doc.docKind === "file" && doc.uploadStatus === "Saved");
    list.replaceChildren();
    for (const doc of docs) {
      const row = el("div", "innovator-inline-file");
      row.append(el("span", "", doc.fileName));
      const preview = el("button", "innovator-text-action", "Preview"); preview.type = "button";
      preview.addEventListener("click", () => openDocumentPreview(doc));
      row.append(preview);
      list.append(row);
    }
  }
}

for (const [fieldName, section] of Object.entries(inlineEvidenceFields)) {
  const field = document.querySelector(`[data-wizard-form] [name="${fieldName}"]`);
  if (!field) continue;
  const wrap = el("div", "admin-form-wide innovator-inline-attachment");
  const input = document.createElement("input"); input.type = "file"; input.accept = ".pdf,.docx,.pptx,.xlsx,.jpg,.jpeg,.png";
  input.hidden = true; input.setAttribute("aria-label", `Attach document for ${fieldName}`);
  const button = el("button", "innovator-attach-action", "Attach document"); button.type = "button";
  button.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file || !state.wizardAppId) return;
    button.disabled = true;
    try { await uploadDocumentToPrivateBucket(state.wizardAppId, section, "file", file.name, `Answer: ${fieldName}`, `Supporting ${fieldName}`, file); }
    finally { input.value = ""; button.disabled = false; }
  });
  const list = el("div", "innovator-inline-list"); list.dataset.inlineList = fieldName;
  wrap.append(button, input, list);
  field.closest("label")?.after(wrap);
}

function renderWizardReviewChecklist(readiness) {
  const box = document.querySelector("[data-review-readiness-summary]");
  box.replaceChildren(
    el("h4", "", `Readiness check: ${readiness.completedSections.length} of 12 sections ready (${readiness.evidenceCount} evidence items)`),
  );
  const list = el("div", "innovator-checklist-box");
  const values = readWizardFormData();
  for (const step of readiness.stepResults.slice(0, 11)) {
    const row = el("div", `innovator-check-row ${step.complete ? "is-ok" : "is-missing"}`);
    const left = el("div");
    left.append(el("strong", "", `Step ${step.step}: ${step.title}`), el("p", "admin-help", step.complete ? "Completed" : `Missing: ${step.missingLabels.join(", ")}`));
    const details = document.createElement("details"); details.className = "innovator-review-details";
    details.append(el("summary", "innovator-text-action", "View answers and attachments"));
    const fields = document.querySelector(`[data-wizard-step-panel="${step.step}"]`);
    for (const input of fields?.querySelectorAll("[name]") || []) {
      if (!input.name || input.type === "radio" || input.type === "checkbox" || input.type === "file" || values[input.name] === undefined) continue;
      const value = values[input.name];
      if (typeof value === "string" && value.trim()) {
        const line = el("p", "innovator-review-answer");
        const label = input.closest("label")?.textContent?.trim()?.split("\n")[0] || input.name.replace(/([A-Z])/g, " $1");
        line.append(el("strong", "", label), document.createTextNode(`: ${value}`));
        details.append(line);
      }
    }
    for (const doc of state.documents.filter(item => item.applicationId === state.wizardAppId && item.uploadStatus === "Saved" && (step.step === 11 ? (item.sectionKey === "applicant" || item.sectionKey === "supplementary" || item.docKind === "video_link") : item.docKind === "file" && item.sectionKey === step.sectionKey && item.category.startsWith("Answer:")))) {
      const line = el("div", "innovator-inline-file");
      line.append(el("span", "", doc.docKind === "video_link" ? doc.videoUrl : doc.fileName));
      const preview = el("button", "innovator-text-action", "Preview"); preview.type = "button";
      preview.addEventListener("click", () => openDocumentPreview(doc));
      line.append(preview); details.append(line);
    }
    left.append(details);
    const editBtn = el("button", "innovator-text-action", "Edit step");
    editBtn.type = "button";
    editBtn.addEventListener("click", () => { state.wizardStep = step.step; renderWizardChrome(); });
    row.append(left, editBtn);
    list.append(row);
  }
  box.append(list);
}

function openWizardForApp(appId) {
  const app = state.applications.find(a => a.id === appId);
  if (!app) return;
  if (app.status !== "Draft") { openApplicationDetail(app.id); return; }
  state.wizardAppId = app.id;
  state.wizardStep = Math.min(12, Math.max(1, Number(app.currentStep || 1)));
  state.wizardDirty = false;
  state.wizardIdempotencyKey = `sub-${crypto.randomUUID()}`;
  if (state.activeSection !== "submit") executeSectionSwitch("submit", { keepWizard: true });
  showSubmitSubView("wizard");
  hydrateWizardForm(app);
  renderWizardChrome();
}

async function saveWizardDraft(quiet = true, targetStep = state.wizardStep) {
  const app = state.applications.find(a => a.id === state.wizardAppId);
  if (!app || app.status !== "Draft") return true;
  state.wizardSaving = true;
  renderWizardChrome();
  try {
    const updated = await rpc("innovator_save_draft", {
      p_app_id: app.id,
      p_current_step: Math.min(12, Math.max(1, Number(targetStep) || state.wizardStep)),
      p_form_data: readWizardFormData(),
      p_expected_version: app.version,
    });
    upsertApplication(updated);
    state.wizardDirty = false;
    state.wizardSaving = false;
    renderWizardChrome();
    if (!quiet) announce(`Draft ${updated.reference} saved.`);
    return true;
  } catch (err) {
    state.wizardSaving = false;
    renderWizardChrome();
    announce(err.message);
    return false;
  }
}

document.querySelector("[data-wizard-form]")?.addEventListener("input", () => {
  state.wizardDirty = true;
  updateWizardDynamicVisibility();
  clearTimeout(state.wizardAutosaveTimer);
  state.wizardAutosaveTimer = setTimeout(() => { saveWizardDraft(true); }, 1200);
});
document.querySelector("[data-wizard-form]")?.addEventListener("change", () => {
  state.wizardDirty = true;
  updateWizardDynamicVisibility();
  renderWizardChrome();
});

for (const jumpBtn of document.querySelectorAll("[data-wizard-jump], [data-track-jump]")) {
  jumpBtn.addEventListener("click", async () => {
    if (state.wizardDirty && !(await saveWizardDraft(true))) return;
    state.wizardStep = Number(jumpBtn.dataset.wizardJump || jumpBtn.dataset.trackJump);
    renderWizardChrome();
  });
}
for (const link of document.querySelectorAll("[data-go-evidence]")) {
  link.addEventListener("click", async () => {
    if (state.wizardDirty && !(await saveWizardDraft(true))) return;
    state.wizardStep = 11;
    document.querySelector("[data-evidence-section]").value = link.dataset.goEvidence;
    renderWizardChrome();
  });
}
document.querySelector("[data-wizard-prev]")?.addEventListener("click", async () => {
  if (state.wizardStep > 1) {
    if (state.wizardDirty && !(await saveWizardDraft(true))) return;
    state.wizardStep -= 1;
    renderWizardChrome();
  }
});
document.querySelector("[data-wizard-next]")?.addEventListener("click", async () => {
  const completedStep = state.wizardStep;
  const nextStep = Math.min(12, state.wizardStep + 1);
  if (!(await saveWizardDraft(true, nextStep))) return;
  if (state.wizardStep < 12) {
    const savedApp = state.applications.find(app => app.id === state.wizardAppId);
    const completion = savedApp
      ? evaluateApplicationReadiness({ ...savedApp, formData: readWizardFormData() }, state.documents, state.applicationFormConfig).stepResults.find(step => step.step === completedStep)?.complete
      : false;
    state.wizardStep = nextStep;
    renderWizardChrome();
    announce(completion
      ? `Step ${completedStep} completed. Now on step ${state.wizardStep}.`
      : `Step ${completedStep} saved but still has required information missing. Now on step ${state.wizardStep}.`);
  }
});
document.querySelector("[data-wizard-manual-save]")?.addEventListener("click", () => saveWizardDraft(false));
document.querySelector("[data-wizard-save-later]")?.addEventListener("click", async () => {
  const ok = await saveWizardDraft(false);
  if (ok) navigateTo("applications", { force: true });
});
document.querySelector("[data-wizard-exit]")?.addEventListener("click", () => navigateTo("applications"));
document.querySelector("[data-wizard-live-chat]")?.addEventListener("click", () => {
  const app = state.applications.find(a => a.id === state.wizardAppId);
  const stepMeta = WIZARD_STEPS.find(s => s.step === state.wizardStep) || WIZARD_STEPS[0];
  openLiveChatWithContext({
    title: `Submission live chat · Step ${stepMeta.step} (${stepMeta.title})`,
    summary: `Need CEDA consultant assistance on Step ${stepMeta.step} of 12 (${stepMeta.title})${app?.reference ? ` for application ${app.reference}` : ""}: `,
    escalationSource: "Submission Wizard",
    applicationRef: app?.reference || null,
    wizardStep: stepMeta.step,
  });
});

// Private Evidence Upload & Video Links
async function uploadBytesWithProgress(storagePath, file, onProgress) {
  const token = state.token || accountToken();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${signupConfig.url}/storage/v1/object/innovation-evidence/${storagePath}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", signupConfig.key);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = evt => {
      if (evt.lengthComputable && onProgress) onProgress(Math.round((evt.loaded / evt.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("Private file upload failed. Verify size/format and retry."));
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(file);
  });
}

async function deletePrivateStorageObject(storagePath) {
  try {
    const token = state.token || accountToken();
    await fetch(`${signupConfig.url}/storage/v1/object/innovation-evidence/${storagePath}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, apikey: signupConfig.key },
    });
  } catch { /* best-effort cleanup */ }
}

async function uploadDocumentToPrivateBucket(appId, sectionKey, docKind, title, category, description, file) {
  const appDocs = state.documents.filter(d => d.applicationId === appId);
  const err = validateEvidenceFile(file, appDocs, sectionKey, docKind);
  if (err) { announce(err); return; }

  const progressWrap = document.querySelector("[data-upload-progress-wrap]");
  const progressEl = document.querySelector("[data-upload-progress]");
  const progressLbl = document.querySelector("[data-upload-progress-label]");
  if (progressWrap) progressWrap.hidden = false;

  const storagePath = `${state.profile.id}/${appId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
  let metadataSaved = false;
  try {
    await uploadBytesWithProgress(storagePath, file, pct => {
      if (progressEl) progressEl.value = pct;
      if (progressLbl) progressLbl.textContent = `Uploading securely (${pct}%)`;
    });
    const replaced = state.replacingDocId ? state.documents.find(d => d.id === state.replacingDocId) : null;
    state.documents = await rpc(replaced ? "innovator_replace_document" : "innovator_add_document", {
      ...(replaced ? { p_replace_doc_id: replaced.id } : {}),
      p_app_id: appId,
      p_section_key: sectionKey,
      p_doc_kind: docKind,
      p_title: title || file.name,
      p_category: category || "Supporting document",
      p_description: description || "",
      p_file_name: file.name,
      p_mime_type: file.type || "application/octet-stream",
      p_file_size: file.size,
      p_storage_path: storagePath,
      p_video_url: null,
      p_password_protected: false,
    });
    metadataSaved = true;
    if (replaced?.storagePath) await deletePrivateStorageObject(replaced.storagePath);
    state.replacingDocId = null;
    invalidateCache();
    renderWizardEvidenceTable();
    renderDocumentChoices();
    renderWizardChrome();
    renderDocumentsLibrary();
    announce(`Uploaded "${file.name}" into private storage.`);
  } catch (e) {
    if (!metadataSaved) await deletePrivateStorageObject(storagePath);
    announce(e.message);
  } finally {
    if (progressWrap) progressWrap.hidden = true;
  }
}

document.querySelector("[data-evidence-upload-btn]")?.addEventListener("click", async () => {
  const file = document.querySelector("[data-evidence-file-input]")?.files?.[0];
  const sectionKey = document.querySelector("[data-evidence-section]").value;
  const category = document.querySelector("[data-evidence-category]").value;
  const title = document.querySelector("[data-evidence-title]").value.trim() || file?.name || "Supporting file";
  const desc = document.querySelector("[data-evidence-desc]").value.trim();
  await uploadDocumentToPrivateBucket(state.wizardAppId, sectionKey, "file", title, category, desc, file);
  document.querySelector("[data-evidence-file-input]").value = "";
});

document.querySelector("[data-add-video-btn]")?.addEventListener("click", async () => {
  const url = document.querySelector("[data-video-url]").value.trim();
  const vErr = validateVideoLink(url);
  if (vErr) { announce(vErr); return; }
  const title = document.querySelector("[data-video-title]").value.trim() || "Prototype demonstration video";
  const sectionKey = document.querySelector("[data-video-section]").value;
  try {
    state.documents = await rpc("innovator_add_document", {
      p_app_id: state.wizardAppId,
      p_section_key: sectionKey,
      p_doc_kind: "video_link",
      p_title: title,
      p_category: "Demonstration link",
      p_description: "",
      p_file_name: title,
      p_mime_type: "text/uri-list",
      p_file_size: 0,
      p_storage_path: null,
      p_video_url: url,
      p_password_protected: false,
    });
    document.querySelector("[data-video-title]").value = "";
    document.querySelector("[data-video-url]").value = "";
    invalidateCache();
    renderWizardEvidenceTable();
    renderWizardChrome();
    announce("Video demonstration link added.");
  } catch (err) {
    announce(err.message);
  }
});

// Preview & Submit Confirmation
document.querySelector("[data-preview-full-application]")?.addEventListener("click", () => {
  const box = document.querySelector("[data-snapshot-preview-body]");
  box.replaceChildren();
  const data = readWizardFormData();
  const linkedTitle = id => state.documents.find(doc => doc.id === id && doc.uploadStatus === "Saved")?.title || "No document selected";
  renderKVSection(box, "Applicant & Innovation", [
    ["Applicant type", data.applicantType],
    ["Title", data.title],
    ["Summary", data.summary],
    ["Problem", data.problem],
    ...(data.problemSource === "document" ? [["Problem document", linkedTitle(data.problemDocument)]] : []),
    ["Solution", data.solution],
    ...(data.solutionSource === "document" ? [["Solution document", linkedTitle(data.solutionDocument)]] : []),
    ["Stage", data.stage],
    ["Implementation", data.implementationApproach],
    ...(data.implementationSource === "document" ? [["Project plan", linkedTitle(data.implementationDocument)]] : []),
    ["Support required", data.supportRequestedSummary],
  ]);
  openDialog("app-preview", "Application preview");
});

document.querySelector("[data-open-submit-confirm]")?.addEventListener("click", () => {
  const app = state.applications.find(a => a.id === state.wizardAppId);
  const liveForm = readWizardFormData();
  const readiness = evaluateApplicationReadiness({ ...app, formData: liveForm }, state.documents, state.applicationFormConfig);
  const box = document.querySelector("[data-submit-confirm-summary]");
  box.replaceChildren();
  if (readiness.blockers.length) {
    box.append(el("strong", "", "Complete these required items before submitting:"));
    for (const b of readiness.blockers) box.append(el("div", "innovator-check-row is-missing", b.label));
    document.querySelector("[data-confirm-submit-btn]").disabled = true;
  } else {
    box.append(el("div", "innovator-check-row is-ok", `Ready: ${readiness.completedSections.length}/12 steps ready (${readiness.evidenceCount} evidence items)`));
    document.querySelector("[data-confirm-submit-btn]").disabled = false;
  }
  openDialog("submit-confirm", "Confirm final submission");
});

document.querySelector("[data-confirm-submit-btn]")?.addEventListener("click", async () => {
  const app = state.applications.find(a => a.id === state.wizardAppId);
  if (!app) return;
  try {
    const submitted = await rpc("innovator_submit_application", {
      p_app_id: app.id,
      p_form_data: readWizardFormData(),
      p_expected_version: app.version,
      p_idempotency_key: state.wizardIdempotencyKey || `sub-${crypto.randomUUID()}`,
    });
    upsertApplication(submitted);
    state.wizardDirty = false;
    state.wizardAppId = null;
    state.lastSubmittedAppId = submitted.id;
    closeDialog();
    showSubmitSubView("success");
    document.querySelector("[data-success-title]").textContent = `${submitted.title} submitted to CEDA`;
    document.querySelector("[data-success-ref]").textContent = submitted.reference;
    document.querySelector("[data-success-receipt]").textContent = submitted.receiptCode || "Recorded";
    document.querySelector("[data-success-date]").textContent = submitted.submittedDate || submitted.updatedAt;
    renderAll();
    announce(`Submitted ${submitted.reference} cleanly.`);
  } catch (err) {
    if (dialogStatusEl) dialogStatusEl.textContent = err.message;
  }
});

document.querySelector("[data-success-view-app]")?.addEventListener("click", () => {
  if (state.lastSubmittedAppId) openApplicationDetail(state.lastSubmittedAppId, "summary");
});
document.querySelector("[data-success-download-receipt]")?.addEventListener("click", () => {
  const app = state.applications.find(a => a.id === state.lastSubmittedAppId);
  if (app) downloadDocumentFile(buildSubmissionReceiptDocument(app, state.documents));
});
document.querySelector("[data-success-overview]")?.addEventListener("click", () => navigateTo("overview", { force: true }));

// Private Signed File Preview & Download
async function fetchPrivateBlob(storagePath) {
  const token = state.token || accountToken();
  const signRes = await fetch(`${signupConfig.url}/storage/v1/object/sign/innovation-evidence/${storagePath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: signupConfig.key },
    body: JSON.stringify({ expiresIn: 120 }),
  });
  let signBody = null;
  try { signBody = await signRes.json(); } catch { signBody = null; }
  const signedPath = signBody?.signedURL ? `${signupConfig.url}/storage/v1${signBody.signedURL}` : `${signupConfig.url}/storage/v1/object/authenticated/innovation-evidence/${storagePath}`;
  const fileRes = await fetch(signedPath, { headers: { Authorization: `Bearer ${token}`, apikey: signupConfig.key } });
  if (!fileRes.ok) throw new Error("Unable to generate temporary authorized file preview.");
  return fileRes.blob();
}

async function openDocumentPreview(doc) {
  state.previewDoc = doc;
  const meta = document.querySelector("[data-preview-meta]");
  const stage = document.querySelector("[data-preview-stage]");
  meta.replaceChildren(el("p", "", `${doc.title} (${doc.fileName}) • ${doc.applicationRef} • ${doc.sectionKey}`));
  stage.replaceChildren();
  const dlBtn = document.querySelector("[data-preview-download]");

  if (doc.docKind === "video_link") {
    dlBtn.hidden = true;
    const link = el("a", "admin-cta", "Open external HTTPS demonstration link");
    link.href = doc.videoUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    stage.append(el("p", "", "External HTTPS demonstration video:"), link);
    openDialog("doc-preview", doc.title || "Evidence preview");
    return;
  }

  dlBtn.hidden = false;
  stage.append(el("p", "admin-help", "Fetching temporary private preview..."));
  openDialog("doc-preview", doc.title || "Private document preview");
  try {
    const blob = await fetchPrivateBlob(doc.storagePath);
    const objUrl = URL.createObjectURL(blob);
    state.previewDocBlobUrl = objUrl;
    stage.replaceChildren();
    if (String(doc.mimeType || "").startsWith("image/")) {
      const img = document.createElement("img");
      img.src = objUrl;
      img.alt = doc.title;
      stage.append(img);
    } else if (doc.mimeType === "application/pdf" || /\.pdf$/i.test(doc.fileName || "")) {
      const frame = document.createElement("iframe");
      frame.src = objUrl;
      frame.title = `${doc.title} preview`;
      stage.append(frame);
    } else {
      stage.append(el("p", "", `Verified private file (${formatBytes(doc.fileSize)}, ${doc.mimeType || "document"}). This file type cannot be rendered directly by the browser; use the download icon to open it.`));
    }
  } catch (err) {
    stage.replaceChildren(el("p", "admin-help", err.message));
  }
}

document.querySelector("[data-preview-download]")?.addEventListener("click", async () => {
  if (!state.previewDoc?.storagePath) return;
  try {
    const blob = await fetchPrivateBlob(state.previewDoc.storagePath);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = state.previewDoc.fileName;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    if (dialogStatusEl) dialogStatusEl.textContent = err.message;
  }
});

// 4. MESSAGES WORKSPACE
function groupThreads() {
  const map = new Map();
  for (const m of state.messages) {
    const key = m.applicationId || m.threadType || "general";
    if (!map.has(key)) {
      map.set(key, {
        key,
        applicationId: m.applicationId || null,
        applicationRef: m.applicationRef || null,
        threadType: m.threadType || "general",
        title: m.applicationRef ? `${m.applicationRef}: ${m.subject}` : (m.subject || "CEDA Support Desk"),
        unread: false,
        messages: [],
      });
    }
    const g = map.get(key);
    g.messages.push(m);
    if (!m.isRead) g.unread = true;
  }
  return [...map.values()];
}

function renderMessagesScreen() {
  const supportHistory = state.supportRequests
    .filter(request => isOptimusSupportRequest(request) && isClosedSupportRequest(request))
    .map(request => ({ key: `optimus-support:${request.id}`, title: `Optimus Prime: ${request.id}`, supportRequest: request, messages: request.thread || [], unread: false }));
  const threads = [...groupThreads(), ...supportHistory];
  const listEl = document.querySelector("[data-thread-list]");
  const emptyEl = document.querySelector("[data-thread-empty]");
  listEl.replaceChildren();
  emptyEl.hidden = threads.length > 0;
  if (!state.activeThreadKey && threads[0]) state.activeThreadKey = threads[0].key;

  for (const t of threads) {
    const li = document.createElement("li");
    const btn = el("button", `innovator-thread-btn${t.key === state.activeThreadKey ? " is-active" : ""}${t.unread ? " is-unread" : ""}`);
    btn.type = "button";
    const last = t.messages[t.messages.length - 1];
    const latestSummary = t.supportRequest ? `${last?.sender || "CEDA Support"}, ${last?.at || t.supportRequest.reportedAt || ""}` : `${last?.senderName || "CEDA"}, ${last?.createdAt || ""}`;
    btn.append(el("strong", "", t.title), el("small", "", latestSummary));
    btn.addEventListener("click", async () => {
      state.activeThreadKey = t.key;
      if (t.unread && !t.supportRequest) {
        await rpc("innovator_mark_thread_read", {
          p_application_id: t.applicationId,
          p_thread_type: t.threadType,
        }).catch(() => {});
        for (const msg of state.messages) {
          if ((msg.applicationId || msg.threadType || "general") === t.key) msg.isRead = true;
        }
      }
      renderMessagesScreen();
    });
    li.append(btn);
    listEl.append(li);
  }

  const active = threads.find(t => t.key === state.activeThreadKey);
  const header = document.querySelector("[data-active-thread-header]");
  const stream = document.querySelector("[data-message-stream]");
  const form = document.querySelector("[data-message-reply-form]");
  stream.replaceChildren();
  if (active?.supportRequest) {
    const request = active.supportRequest;
    const ownerFirst = supportOfficerFirstName(request.owner);
    header.replaceChildren(el("h3", "", `Optimus Prime support conversation: ${request.id}`), el("p", "admin-help", `Closed by CEDA Support${ownerFirst && ownerFirst !== "CEDA Support Desk" ? `, ${ownerFirst}` : ""}${request.reportedAt ? `, ${request.reportedAt}` : ""}`));
    form.hidden = true;
    const matching = [...state.optimusHistory].reverse().filter(item => item.escalated && request.detail?.includes(item.question));
    const transcript = matching;
    for (const item of transcript) {
      const user = el("article", "innovator-bubble is-mine");
      user.append(el("strong", "", "You to Optimus Prime"), el("p", "", item.question));
      const bot = el("article", "innovator-bubble");
      bot.append(el("strong", "", "Optimus Prime"), el("p", "", item.answer));
      stream.append(user, bot);
    }
    for (const message of request.thread || []) {
      const card = el("article", `innovator-bubble${message.role === "innovator" ? " is-mine" : ""}`);
      const senderLabel = message.role === "innovator" ? (message.sender || "You") : supportOfficerFirstName(message.sender || "CEDA Support");
      card.append(el("strong", "", `${senderLabel}${message.at ? `, ${message.at}` : ""}`), el("p", "", message.body));
      stream.append(card);
    }
    return;
  }
  if (!active && state.activeThreadKey !== "new-general") {
    state.activeThreadKey = "new-general";
  }
  header.replaceChildren(el("h3", "", active ? active.title : "New message to CEDA Staff"));
  form.hidden = false;
  if (active) {
    form.elements.subject.value = active.messages[0]?.subject || "";
    for (const m of active.messages) {
      const card = el("article", `innovator-bubble${m.senderRole === "innovator" ? " is-mine" : ""}`);
      const h = el("div", "innovator-bubble-head");
      h.append(el("strong", "", `${m.senderName} (${m.senderRole})`), el("span", "", m.createdAt));
      card.append(h, el("p", "", m.body));
      if (m.attachmentName) card.append(el("small", "admin-help", `Attachment: ${m.attachmentName}`));
      stream.append(card);
    }
    queueMicrotask(() => { stream.scrollTop = stream.scrollHeight; });
  } else {
    stream.append(el("p", "admin-help", "Type your subject and message below to start a conversation with CEDA Staff."));
  }
}

document.querySelector("[data-new-general-thread]")?.addEventListener("click", () => {
  state.activeThreadKey = "new-general";
  renderMessagesScreen();
  document.querySelector("[data-message-reply-form]")?.elements.subject.focus();
});

document.querySelector("[data-messages-escalate]")?.addEventListener("click", () => {
  const active = groupThreads().find(t => t.key === state.activeThreadKey);
  openLiveChatWithContext({
    title: active?.applicationRef
      ? `Escalated enquiry · ${active.applicationRef}`
      : "Escalated enquiry from Messages",
    summary: active?.applicationRef
      ? `Escalating conversation for application ${active.applicationRef} (${active.title}): `
      : "I need to speak with a CEDA service consultant regarding my portal enquiry: ",
    escalationSource: "Application Escalation",
    applicationRef: active?.applicationRef || null,
    wizardStep: null,
  });
});

document.querySelector('[data-message-reply-form] textarea[name="body"]')?.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }
});

document.querySelector("[data-message-reply-form]")?.addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.target;
  const bodyText = form.elements.body.value.trim();
  if (!bodyText) return;
  const subjectText = form.elements.subject.value.trim() || "Innovator enquiry";
  const active = groupThreads().find(t => t.key === state.activeThreadKey);
  let attachmentName = null;
  let attachmentPath = null;
  const file = form.elements.attachment?.files?.[0];
  try {
    if (file) {
      const err = validateEvidenceFile(file, [], "supplementary", "supplemental");
      if (err) { announce(err); return; }
      attachmentPath = `${state.profile?.id || "innovator"}/messages/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
      await uploadBytesWithProgress(attachmentPath, file);
      attachmentName = file.name;
    }
    const optimisticMsg = {
      id: `local-${Date.now()}`,
      applicationId: active?.applicationId || null,
      applicationRef: active?.applicationRef || null,
      threadType: active?.threadType || "general",
      subject: subjectText,
      body: bodyText,
      senderName: state.profile?.fullName || "You",
      senderRole: "innovator",
      createdAt: new Date().toLocaleTimeString("en-BW", { hour: "2-digit", minute: "2-digit", hour12: false }),
      isRead: true,
      attachmentName,
    };
    state.messages = [...state.messages, optimisticMsg];
    if (state.activeThreadKey === "new-general") state.activeThreadKey = active?.key || "general";
    form.elements.body.value = "";
    if (form.elements.attachment) form.elements.attachment.value = "";
    renderMessagesScreen();
    renderOverview();
    form.elements.body.focus();

    const updated = await rpc("innovator_send_message", {
      p_application_id: active?.applicationId || null,
      p_thread_type: active?.threadType || "general",
      p_subject: subjectText,
      p_body: bodyText,
      p_attachment_name: attachmentName,
      p_attachment_path: attachmentPath,
    });
    if (Array.isArray(updated) && updated.length) {
      state.messages = updated;
      invalidateCache();
      renderMessagesScreen();
      renderOverview();
    }
    announce("Message sent.");
  } catch (err) {
    announce(err.message || "Message saved in this session.");
  }
});

// 5. DOCUMENTS LIBRARY
function renderDocumentsLibrary() {
  const form = document.querySelector("[data-docs-filter-form]");
  const q = String(form?.elements.query?.value || "").trim().toLowerCase();
  const sec = String(form?.elements.section?.value || "");
  const rows = state.documents.filter(d => {
    if (d.uploadStatus === "Removed") return false;
    if (d.sectionKey !== "applicant" || !["Certified identity copy", "Identity back", "Proof of residence", "Company registration certificate", "Director or shareholder records", "Tax clearance certificate"].includes(d.category)) return false;
    if (sec && d.sectionKey !== sec) return false;
    if (!q) return true;
    return [d.title, d.fileName, d.applicationRef, d.sectionKey].some(v => String(v || "").toLowerCase().includes(q));
  });
  const tbody = document.querySelector("[data-docs-tbody]");
  tbody.replaceChildren();
  for (const doc of rows) {
    const tr = tbody.insertRow();
    tr.insertCell().textContent = doc.title || doc.fileName;
    tr.insertCell().textContent = doc.applicationRef;
    tr.insertCell().textContent = doc.sectionKey;
    tr.insertCell().textContent = doc.createdAt;
    tr.insertCell().textContent = doc.docKind === "video_link" ? "HTTPS Link" : formatBytes(doc.fileSize);
    tr.insertCell().textContent = `v${doc.version || 1}`;
    const ac = tr.insertCell();
    const wrap = el("div", "innovator-hero-actions");
    const pre = el("button", "admin-button-secondary", "Preview"); pre.type = "button";
    pre.addEventListener("click", () => openDocumentPreview(doc));
    wrap.append(pre);
    if (doc.storagePath) {
      const dl = el("button", "admin-button-secondary", "Download"); dl.type = "button";
      dl.addEventListener("click", async () => {
        state.previewDoc = doc;
        const blob = await fetchPrivateBlob(doc.storagePath);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = doc.fileName;
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      wrap.append(dl);
    }
    ac.append(wrap);
  }
  document.querySelector("[data-docs-results]").textContent = `${rows.length} document${rows.length === 1 ? "" : "s"}`;
}
document.querySelector("[data-docs-filter-form]")?.addEventListener("input", renderDocumentsLibrary);

// 6. OPTIMUS PRIME & UNIFIED LIVE CHAT / ESCALATIONS
function supportOfficerFirstName(name, fallback = "CEDA Support") {
  const clean = String(name || "").trim();
  if (!clean) return fallback;
  const lower = clean.toLowerCase();
  if (lower === "unassigned" || lower === "ceda support desk") return "CEDA Support Desk";
  return clean.split(/\s+/)[0] || fallback;
}

function computeClientLiveChatAvailability() {
  if (state.liveChatStatus && typeof state.liveChatStatus === "object" && state.liveChatStatus.notificationMessage) {
    return state.liveChatStatus;
  }
  const dt = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Gaborone",
    weekday: "long",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(dt);
  const map = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const weekday = String(map.weekday || "Monday");
  const mmDd = `${map.month || "01"}-${map.day || "01"}`;
  const hrRaw = Number(map.hour ?? 12);
  const hr = hrRaw === 24 ? 0 : hrRaw;
  const isHoliday = ["01-01", "01-02", "05-01", "07-01", "09-30", "10-01", "12-25", "12-26"].includes(mmDd);
  const isWorkingDay = weekday !== "Saturday" && weekday !== "Sunday" && !isHoliday;
  const isWithinHours = hr >= 9 && hr < 16;

  if (!isWorkingDay) {
    return {
      status: "non_working_day",
      isLiveAvailable: false,
      badgeLabel: isHoliday ? "Public Holiday · Offline" : "Weekend · Non-Working Day",
      notificationMessage:
        "Agent not available at the moment: CEDA Live Chat is available from 09:00hrs to 16:00hrs on working days ONLY (Monday to Friday, excluding public holidays). Your message or escalation is saved in the queue for the next working day at 09:00hrs.",
    };
  }
  if (!isWithinHours) {
    return {
      status: "after_hours",
      isLiveAvailable: false,
      badgeLabel: "After Hours (Open 09:00 to 16:00)",
      notificationMessage:
        "Agent not available at the moment: CEDA Live Chat operates from 09:00hrs to 16:00hrs on working days ONLY. Your message or escalation has been queued for the next available service consultant at 09:00hrs.",
    };
  }
  return {
    status: "available",
    isLiveAvailable: true,
    badgeLabel: "Live Chat Online (09:00 to 16:00)",
    notificationMessage:
      "CEDA service consultants are online (09:00hrs to 16:00hrs working days). Multi-user live chat and escalations connect in real time.",
  };
}

function syncLiveChatHoursUi() {
  const avail = computeClientLiveChatAvailability();
  const hoursText = document.querySelector("[data-live-chat-hours-text]");
  if (hoursText) hoursText.textContent = avail.notificationMessage;
  const supportHoursText = document.querySelector("[data-support-live-chat-text]");
  if (supportHoursText) supportHoursText.textContent = avail.notificationMessage;
  const pill = document.querySelector("[data-live-chat-pill]");
  if (pill) {
    pill.textContent = "";
    pill.append(el("i", ""), document.createTextNode(` ${avail.badgeLabel}`));
  }
}

function isClosedSupportRequest(request) {
  return /closed|resolved|complete|cancelled|canceled|done/i.test(String(request?.state || ""));
}

function isOptimusSupportRequest(request) {
  if (!request) return false;
  if (request.title === "Human support follow-up from Optimus Prime") return true;
  if (state.activeLiveChatRef && request.id === state.activeLiveChatRef) return true;
  const combined = [request.title, request.steps, request.escalationSource]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /optimus|live chat|escalat|submission step|wizard step|consultant/i.test(combined);
}

function getActiveOptimusSupportRequest() {
  if (state.activeLiveChatRef) {
    const chosen = state.supportRequests.find(
      request => request.id === state.activeLiveChatRef && !isClosedSupportRequest(request)
    );
    if (chosen) return chosen;
  }
  return state.supportRequests.find(request => isOptimusSupportRequest(request) && !isClosedSupportRequest(request)) || null;
}

function openLiveChatWithContext(ctx = {}) {
  state.pendingLiveChatContext = {
    title: ctx.title || "Live chat with CEDA Service Consultant",
    escalationSource: ctx.escalationSource || "Live Chat",
    applicationRef: ctx.applicationRef || null,
    wizardStep: ctx.wizardStep || null,
  };
  const optimusSection = document.querySelector("#optimus");
  if (optimusSection?.hidden) {
    document.querySelector("[data-optimus-toggle]")?.click();
  }
  const panel = document.querySelector("[data-optimus-escalate-panel]");
  if (panel) panel.hidden = false;
  const summaryField = document.querySelector("#optimus-support-summary");
  if (summaryField) {
    if (ctx.summary && !summaryField.value.trim()) summaryField.value = ctx.summary;
    summaryField.focus();
  }
  syncLiveChatHoursUi();
}

function renderOptimus() {
  syncLiveChatHoursUi();
  const feed = document.querySelector("[data-optimus-feed]");
  if (!feed) return;
  feed.replaceChildren();
  const avail = computeClientLiveChatAvailability();
  const activeSupport = getActiveOptimusSupportRequest();
  const openLiveChats = state.supportRequests.filter(request => !isClosedSupportRequest(request));
  const closedOptimusTickets = state.supportRequests.filter(request => isOptimusSupportRequest(request) && isClosedSupportRequest(request));
  const visibleHistory = state.optimusHistory.filter(item => !closedOptimusTickets.some(request => request.detail?.includes(item.question)));
  const input = document.querySelector("[data-optimus-form]")?.elements.question;
  if (input) input.placeholder = activeSupport ? `Message CEDA Live Chat (${activeSupport.id})…` : "Message Optimus Prime or request a live consultant…";
  const launcher = document.querySelector("[data-optimus-toggle]");
  if (launcher) {
    const label = launcher.querySelector(".innovator-optimus-launcher-label");
    if (label) label.textContent = activeSupport ? "Continue live chat" : "Live Chat & Optimus";
    launcher.setAttribute("aria-label", activeSupport ? "Continue your CEDA human support live chat" : "Open Optimus Prime & CEDA Live Chat");
  }

  if (openLiveChats.length > 1) {
    const switcher = el("div", "innovator-optimus-topics");
    switcher.setAttribute("role", "group");
    switcher.setAttribute("aria-label", "Active live chat conversations");
    for (const chat of openLiveChats) {
      const btn = el(
        "button",
        `innovator-chip${activeSupport?.id === chat.id ? " is-active" : ""}`,
        `${chat.id} · ${chat.title.slice(0, 32)}`
      );
      btn.type = "button";
      btn.addEventListener("click", () => {
        state.activeLiveChatRef = chat.id;
        renderOptimus();
      });
      switcher.append(btn);
    }
    feed.append(switcher);
  }

  if (!visibleHistory.length && !activeSupport) {
    const introTurn = el("div", "innovator-chat-turn");
    introTurn.append(el("span", "innovator-chat-avatar", "OP"));
    const introBubble = el("div", "innovator-chat-bubble innovator-optimus-welcome");
    const firstName = String(state.profile?.fullName || "").trim().split(/\s+/)[0];
    introBubble.append(
      el("strong", "", "Optimus Prime & CEDA Live Chat"),
      el("p", "", `Hi${firstName ? ` ${firstName}` : ""}! Ask me anything about your application, or click "Live chat with consultant" above to connect directly with a CEDA service consultant (09:00hrs to 16:00hrs working days).`)
    );
    const suggestions = document.querySelector(".innovator-optimus-topics");
    if (suggestions) introBubble.append(suggestions.cloneNode(true));
    introTurn.append(introBubble);
    feed.append(introTurn);
  }

  for (const item of [...visibleHistory].reverse()) {
    const userTurn = el("div", "innovator-chat-turn is-user");
    userTurn.append(el("span", "innovator-chat-avatar", "You"));
    const userBubble = el("div", "innovator-chat-bubble");
    userBubble.append(el("p", "", item.question), el("small", "admin-help", item.createdAt || ""));
    userTurn.append(userBubble);
    feed.append(userTurn);

    const botTurn = el("div", "innovator-chat-turn");
    botTurn.append(el("span", "innovator-chat-avatar", "OP"));
    const botBubble = el("div", "innovator-chat-bubble");
    botBubble.append(el("p", "", item.answer));
    if (item.sourceArticle) botBubble.append(el("small", "admin-help", `From the approved portal guidance: ${item.sourceArticle}`));
    botTurn.append(botBubble);
    feed.append(botTurn);
  }

  if (activeSupport) {
    const ownerFirst = supportOfficerFirstName(activeSupport.owner, "");
    const assigned = Boolean(ownerFirst && ownerFirst !== "CEDA Support Desk");
    const status = el("article", `innovator-optimus-queue${assigned ? " is-connected" : ""}`);
    status.append(el("span", "innovator-optimus-queue-icon", assigned ? "OK" : "Q"));
    const copy = el("div");
    copy.append(
      el("strong", "", assigned ? `Connected to ${ownerFirst} (Live Chat ${activeSupport.id})` : `You are in the CEDA Live Chat queue (${activeSupport.id})`),
      el("p", "", `Queue: CEDA Support Desk, Reference ${activeSupport.id}${activeSupport.applicationRef ? `, Application ${activeSupport.applicationRef}` : ""}${activeSupport.wizardStep ? `, Step ${activeSupport.wizardStep}` : ""}. ${assigned ? `${ownerFirst} has joined this live chat.` : avail.isLiveAvailable ? "A CEDA service consultant will reply here in real time." : avail.notificationMessage}`),
    );
    status.append(copy);
    feed.append(status);
    for (const message of activeSupport.thread || []) {
      const isInnovator = message.role === "innovator";
      const isSystem = message.role === "system";
      if (isSystem) {
        const note = el("article", "innovator-optimus-queue is-connected");
        note.append(el("p", "", `${message.body}${message.at ? ` (${message.at})` : ""}`));
        feed.append(note);
        continue;
      }
      const turn = el("div", `innovator-chat-turn${isInnovator ? " is-user" : ""}`);
      const senderFirst = isInnovator ? "You" : supportOfficerFirstName(message.sender);
      turn.append(el("span", "innovator-chat-avatar", isInnovator ? "You" : senderFirst.slice(0, 2).toUpperCase()));
      const bubble = el("div", "innovator-chat-bubble");
      bubble.append(el("strong", "", senderFirst), el("p", "", message.body), el("small", "admin-help", message.at || ""));
      turn.append(bubble);
      feed.append(turn);
    }

    const rateBox = el("div", "innovator-optimus-handoff");
    rateBox.append(el("span", "", activeSupport.satisfactionRating ? `Your chat rating: ${activeSupport.satisfactionRating}/5 ★` : "Rate this live chat:"));
    for (const stars of [1, 2, 3, 4, 5]) {
      const starBtn = el("button", "innovator-chip", `${stars}★`);
      starBtn.type = "button";
      starBtn.addEventListener("click", async () => {
        try {
          state.supportRequests = await rpc("innovator_rate_support_chat", {
            p_reference: activeSupport.id,
            p_rating: stars,
            p_comment: null,
          });
          renderOptimus();
          announce(`Rated live chat ${activeSupport.id} ${stars} out of 5 stars.`);
        } catch (err) {
          announce(err.message);
        }
      });
      rateBox.append(starBtn);
    }
    feed.append(rateBox);
  } else {
    const handoff = el("div", "innovator-optimus-handoff");
    handoff.append(el("span", "", avail.isLiveAvailable ? "Need a human CEDA Service Consultant?" : avail.badgeLabel));
    const request = el("button", "innovator-optimus-handoff-button", "Talk to a CEDA Support Officer");
    request.type = "button";
    request.dataset.optimusRequestHuman = "";
    handoff.append(request);
    feed.append(handoff);
  }

  feed.scrollTop = feed.scrollHeight;
}

document.querySelector("[data-optimus-direct-live-chat]")?.addEventListener("click", () => {
  const activeDraft = state.applications.find(a => a.id === state.wizardAppId) || state.applications[0];
  openLiveChatWithContext({
    title: "Live chat with CEDA Service Consultant",
    summary: "",
    escalationSource: state.activeSection === "submit" ? "Submission Wizard" : "Live Chat",
    applicationRef: activeDraft?.reference || null,
    wizardStep: state.activeSection === "submit" ? state.wizardStep : null,
  });
});

document.querySelector("[data-support-open-live-chat]")?.addEventListener("click", () => {
  openLiveChatWithContext({
    title: "Live chat with CEDA Service Consultant",
    summary: "",
    escalationSource: "Live Chat",
    applicationRef: document.querySelector("[data-support-app-select]")?.value || null,
    wizardStep: null,
  });
});

async function callOptimusAssistant(question, contextSection = "general") {
  const token = state.token || accountToken();
  if (signupConfig?.url && signupConfig?.key && token) {
    try {
      const response = await fetch(`${signupConfig.url}/functions/v1/optimus`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: signupConfig.key,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question, contextSection }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) {
        const edgeData = await response.json();
        if (edgeData && edgeData.latest && Array.isArray(edgeData.history)) {
          return edgeData;
        }
      }
    } catch {
      // Circuit breaker falls back cleanly to SQL controlled assistant RPC
    }
  }
  return rpc("innovator_ask_optimus", { p_question: question, p_context_section: contextSection });
}

async function askOptimusPrompt(question, topic = "general") {
  if (!question || question.length < 3) return;
  try {
    const res = await callOptimusAssistant(question, topic);
    state.optimusHistory = res.history || [];
    if (Array.isArray(res.supportRequests)) {
      state.supportRequests = res.supportRequests;
    }
    if (res.liveChatStatus) {
      state.liveChatStatus = res.liveChatStatus;
    }
    if (res.escalatedTicketRef) {
      state.activeLiveChatRef = res.escalatedTicketRef;
    }
    invalidateCache();
    renderOptimus();
    announce(
      res.autoEscalated
        ? `Optimus escalated this to CEDA Live Chat${res.escalatedTicketRef ? ` (${res.escalatedTicketRef})` : ""}.`
        : "Optimus Prime replied."
    );
  } catch (err) {
    announce(err.message);
  }
}

document.querySelector("[data-optimus-form]")?.addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target;
  const q = f.elements.question.value.trim();
  if (!q) return;
  const activeSupport = getActiveOptimusSupportRequest();
  if (activeSupport) {
    try {
      state.supportRequests = await rpc("innovator_reply_support_request", { p_reference: activeSupport.id, p_message: q });
      await loadWorkspace(true);
      announce("Message sent to CEDA Live Chat.");
    } catch (err) { announce(err.message); }
  } else {
    await askOptimusPrompt(q, "general");
  }
  f.elements.question.value = "";
  f.elements.question.focus();
});
for (const chip of document.querySelectorAll("[data-optimus-prompt]")) {
  chip.addEventListener("click", async () => {
    const prompt = chip.dataset.optimusPrompt;
    const topic = chip.dataset.optimusTopic || "general";
    if (document.querySelector("#optimus")?.hidden) document.querySelector("[data-optimus-toggle]")?.click();
    await askOptimusPrompt(prompt, topic);
  });
}
document.querySelector("[data-optimus-escalate-form]")?.addEventListener("submit", async e => {
  e.preventDefault();
  try {
    const summaryText = e.target.elements.summary.value.trim();
    const ctx = state.pendingLiveChatContext || {};
    const latest = state.optimusHistory[0];
    try {
      state.supportRequests = await rpc("innovator_start_live_chat", {
        p_title: ctx.title || (latest ? "Human support follow-up from Optimus Prime" : "Live chat with CEDA Service Consultant"),
        p_message: summaryText,
        p_escalation_source: ctx.escalationSource || (latest ? "Optimus Prime" : "Live Chat"),
        p_application_ref: ctx.applicationRef || null,
        p_wizard_step: ctx.wizardStep || null,
        p_kind: "Support",
        p_priority: "Normal",
      });
    } catch {
      state.supportRequests = await rpc("innovator_escalate_optimus", {
        p_interaction_id: latest?.id || null,
        p_summary: summaryText,
      });
    }
    state.pendingLiveChatContext = null;
    if (state.supportRequests[0]) {
      state.activeLiveChatRef = state.supportRequests[0].id;
    }
    e.target.reset();
    const escalationPanel = document.querySelector("[data-optimus-escalate-panel]");
    if (escalationPanel) escalationPanel.hidden = true;
    await loadWorkspace(true);
    const ticket = getActiveOptimusSupportRequest();
    const avail = computeClientLiveChatAvailability();
    announce(
      ticket
        ? avail.isLiveAvailable
          ? `Connected to CEDA Live Chat queue. Reference ${ticket.id}.`
          : `${avail.notificationMessage} (Reference ${ticket.id})`
        : "Your request has been sent to CEDA Live Chat."
    );
  } catch (err) {
    announce(err.message);
  }
});
document.querySelector("[data-optimus-clear]")?.addEventListener("click", () => {
  state.optimusHistory = [];
  renderOptimus();
  announce("Chat view reset for this session.");
});
// 7. HELP & SUPPORT
function syncSupportAppSelect() {
  const sel = document.querySelector("[data-support-app-select]");
  if (!sel) return;
  const prev = sel.value;
  sel.replaceChildren(el("option", "", "Not linked to an application"));
  sel.firstChild.value = "";
  for (const app of state.applications) {
    const opt = el("option", "", `${app.reference}: ${app.title}`);
    opt.value = app.reference;
    sel.append(opt);
  }
  sel.value = prev;
}

function renderSupportScreen() {
  syncLiveChatHoursUi();
  renderPortalFormsCatalog(document.querySelector("[data-support-portal-docs]"), true);
  renderRegulatoryContactsList(document.querySelector("[data-support-regulators]"));
  const faqQuery = String(document.querySelector("[data-faq-search-form]")?.elements.query?.value || "").trim().toLowerCase();
  const faqBox = document.querySelector("[data-faq-list]");
  faqBox.replaceChildren();
  const faqs = state.faqs.filter(f => !faqQuery || [f.title, f.summary, f.body].some(v => String(v || "").toLowerCase().includes(faqQuery)));
  if (!faqs.length) faqBox.append(el("p", "admin-help", "No help articles matched your search."));
  for (const f of faqs) {
    const card = el("article", "innovator-faq-item");
    card.append(el("strong", "", f.title), el("p", "", f.body || f.summary));
    faqBox.append(card);
  }

  const tbody = document.querySelector("[data-support-tbody]");
  tbody.replaceChildren();
  if (!state.supportRequests.length) {
    const tr = tbody.insertRow();
    const td = tr.insertCell(); td.colSpan = 8;
    td.textContent = "No support requests created yet.";
  } else {
    for (const req of state.supportRequests) {
      const tr = tbody.insertRow();
      tr.insertCell().textContent = req.id;
      tr.insertCell().textContent = req.kind;
      tr.insertCell().textContent = req.title;
      tr.insertCell().textContent = req.priority;
      tr.insertCell().textContent = req.state;
      const ownerFirst = supportOfficerFirstName(req.owner);
      tr.insertCell().textContent = ownerFirst !== "CEDA Support Desk" ? `Connected to ${ownerFirst}` : "CEDA Support Desk";
      tr.insertCell().textContent = req.reportedAt;
      const ac = tr.insertCell();
      const wrap = el("div", "innovator-hero-actions");
      const btn = el("button", "admin-button-secondary", "View / Reply"); btn.type = "button";
      btn.addEventListener("click", () => { state.activeSupportRef = req.id; renderSupportThread(); });
      wrap.append(btn);
      if (!isClosedSupportRequest(req)) {
        const liveBtn = el("button", "admin-button-secondary", "Live Chat"); liveBtn.type = "button";
        liveBtn.addEventListener("click", () => {
          state.activeLiveChatRef = req.id;
          if (document.querySelector("#optimus")?.hidden) document.querySelector("[data-optimus-toggle]")?.click();
          renderOptimus();
        });
        wrap.append(liveBtn);
      }
      ac.append(wrap);
    }
  }
  renderSupportThread();
}

function renderSupportThread() {
  const detail = document.querySelector("[data-support-detail]");
  const req = state.supportRequests.find(r => r.id === state.activeSupportRef);
  detail.hidden = !req;
  if (!req) return;
  const ownerFirst = supportOfficerFirstName(req.owner);
  const connected = ownerFirst && ownerFirst !== "CEDA Support Desk";
  detail.replaceChildren(
    el("h4", "", `${req.id}: ${req.title} (${req.state})`),
    el("p", "admin-help", `${connected ? `Connected to ${ownerFirst}` : "In CEDA Support Desk queue"}${req.applicationRef ? ` • Application ${req.applicationRef}` : ""}`),
  );
  const stream = el("div", "innovator-message-stream");
  for (const msg of req.thread || []) {
    const b = el("div", `innovator-bubble${msg.role === "innovator" ? " is-mine" : ""}`);
    const senderLabel = msg.role === "innovator" ? msg.sender : supportOfficerFirstName(msg.sender);
    b.append(el("strong", "", `${senderLabel} • ${msg.at || ""}`), el("p", "", msg.body));
    stream.append(b);
  }
  const form = el("form", "admin-form");
  const lbl = el("label", "admin-form-wide", "Reply to Support Officer");
  const ta = el("textarea"); ta.rows = 2; ta.required = true; ta.minLength = 2;
  lbl.append(ta);
  const btn = el("button", "admin-cta", "Send reply"); btn.type = "submit";
  form.append(lbl, btn);
  form.addEventListener("submit", async e => {
    e.preventDefault();
    try {
      state.supportRequests = await rpc("innovator_reply_support_request", { p_reference: req.id, p_message: ta.value.trim() });
      renderSupportScreen();
      announce(`Reply added to ticket ${req.id}.`);
    } catch (err) {
      announce(err.message);
    }
  });
  detail.append(stream, form);
}

document.querySelector("[data-faq-search-form]")?.addEventListener("input", renderSupportScreen);
document.querySelector("[data-support-create-form]")?.addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target;
  try {
    state.supportRequests = await rpc("innovator_create_support_request", {
      p_kind: f.elements.kind.value,
      p_title: f.elements.title.value.trim(),
      p_detail: f.elements.detail.value.trim(),
      p_application_ref: f.elements.applicationRef.value || null,
      p_steps: f.elements.steps.value.trim() || "Not supplied",
    });
    f.reset();
    if (state.supportRequests[0]) state.activeSupportRef = state.supportRequests[0].id;
    await loadWorkspace(true);
    announce("Support request submitted cleanly.");
  } catch (err) {
    announce(err.message);
  }
});

// 8. ACCOUNT & SETTINGS
function renderSettings() {
  const p = state.profile || {};
  const pf = document.querySelector("[data-settings-personal-form]");
  pf.elements.fullName.value = p.fullName || "";
  pf.elements.email.value = p.email || "";
  pf.elements.phone.value = p.phone || "";
  if (p.district) pf.elements.district.value = p.district;
  pf.elements.expertise.value = p.expertise || "";

  const cf = document.querySelector("[data-settings-company-form]");
  cf.elements.companyName.value = p.companyName || "";
  cf.elements.companyRegNumber.value = p.companyRegNumber || "";
  cf.elements.companySector.value = p.companySector || "";
  cf.elements.companyRole.value = p.companyRole || "";

  const prefs = p.preferences || {};
  const nf = document.querySelector("[data-settings-notifications-form]");
  if (nf.elements.emailNotifications) nf.elements.emailNotifications.checked = prefs.emailNotifications !== false;
  if (nf.elements.pushNotifications) nf.elements.pushNotifications.checked = prefs.pushNotifications !== false;
  nf.elements.notifyStatus.checked = prefs.notifyStatus !== false;
  nf.elements.notifyClarifications.checked = prefs.notifyClarifications !== false;
  nf.elements.notifyMessages.checked = prefs.notifyMessages !== false;

  const af = document.querySelector("[data-settings-accessibility-form]");
  af.elements.textSize.value = prefs.textSize || "standard";
  af.elements.highContrast.checked = Boolean(prefs.highContrast);
  af.elements.reducedMotion.checked = Boolean(prefs.reducedMotion);

  document.querySelector("[data-security-email]").textContent = p.email || "";
  document.querySelector("[data-session-email]").textContent = p.email || "";
}

async function saveProfileSettings(overrides = {}) {
  const pf = document.querySelector("[data-settings-personal-form]");
  const cf = document.querySelector("[data-settings-company-form]");
  const nf = document.querySelector("[data-settings-notifications-form]");
  const af = document.querySelector("[data-settings-accessibility-form]");

  const prefs = {
    ...(state.profile?.preferences || {}),
    emailNotifications: nf.elements.emailNotifications ? nf.elements.emailNotifications.checked : true,
    pushNotifications: nf.elements.pushNotifications ? nf.elements.pushNotifications.checked : true,
    freeAlertPlan: true,
    notifyStatus: nf.elements.notifyStatus.checked,
    statusAlerts: nf.elements.notifyStatus.checked,
    notifyClarifications: nf.elements.notifyClarifications.checked,
    clarificationAlerts: nf.elements.notifyClarifications.checked,
    notifyMessages: nf.elements.notifyMessages.checked,
    textSize: af.elements.textSize.value,
    highContrast: af.elements.highContrast.checked,
    reducedMotion: af.elements.reducedMotion.checked,
    ...overrides,
  };
  try {
    state.profile = await rpc("innovator_update_profile", {
      p_full_name: pf.elements.fullName.value.trim(),
      p_phone: pf.elements.phone.value.trim(),
      p_district: pf.elements.district.value,
      p_expertise: pf.elements.expertise.value.trim(),
      p_company_name: cf.elements.companyName.value.trim(),
      p_company_reg_number: cf.elements.companyRegNumber.value.trim(),
      p_company_sector: cf.elements.companySector.value.trim(),
      p_company_role: cf.elements.companyRole.value.trim(),
      p_preferences: prefs,
    });
    await rpc("innovator_update_alert_preferences", {
      p_email_enabled: Boolean(prefs.emailNotifications),
      p_push_enabled: Boolean(prefs.pushNotifications),
      p_notify_status: Boolean(prefs.notifyStatus),
      p_notify_clarifications: Boolean(prefs.notifyClarifications),
      p_notify_messages: Boolean(prefs.notifyMessages),
    }).catch(() => {});
    invalidateCache();
    applyAccessibilityPreferences(state.profile.preferences || {});
    document.querySelector("[data-innovator-name]").textContent = state.profile.fullName || "Innovator";
    if (state.detailAppId) renderApplicationDetail();
    announce(`Account and free alert preferences saved (${FREE_ALERT_FEE_LABEL}).`);
  } catch (err) {
    announce(err.message);
  }
}

for (const sel of [
  "[data-settings-personal-form]",
  "[data-settings-company-form]",
  "[data-settings-notifications-form]",
  "[data-settings-accessibility-form]",
]) {
  document.querySelector(sel)?.addEventListener("submit", e => { e.preventDefault(); saveProfileSettings(); });
}

for (const tabBtn of document.querySelectorAll("[data-settings-tab]")) {
  tabBtn.addEventListener("click", () => {
    const key = tabBtn.dataset.settingsTab;
    for (const b of document.querySelectorAll("[data-settings-tab]")) {
      const active = b === tabBtn;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    }
    for (const panel of document.querySelectorAll("[data-settings-panel]")) {
      panel.hidden = panel.dataset.settingsPanel !== key;
    }
  });
}

document.querySelector("[data-send-password-reset]")?.addEventListener("click", async () => {
  if (!state.profile?.email || !signupConfig) return;
  try {
    const res = await fetch(`${signupConfig.url}/auth/v1/recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: signupConfig.key },
      body: JSON.stringify({ email: state.profile.email }),
    });
    if (!res.ok) throw new Error("Unable to send reset link right now.");
    announce(`Password reset link sent to ${state.profile.email}.`);
  } catch (err) {
    announce(err.message);
  }
});

async function handleSignOut(scope = "local") {
  const token = state.token || accountToken();
  if (scope === "others" && token && signupConfig) {
    await fetch(`${signupConfig.url}/auth/v1/logout?scope=others`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: signupConfig.key },
    }).catch(() => {});
    announce("Signed out all other active sessions.");
    return;
  }
  await logoutSignup(signupConfig, token).catch(() => {});
  clearAccountToken();
  window.location.replace("/signin/");
}

document.querySelector("[data-logout-other-sessions]")?.addEventListener("click", () => handleSignOut("others"));
for (const btn of document.querySelectorAll("[data-innovator-logout], [data-innovator-logout-header], [data-innovator-logout-settings]")) {
  btn.addEventListener("click", () => handleSignOut("local"));
}

// Header Bell Notifications
function syncNotificationBadge() {
  const unread = state.notifications.filter(n => !n.isRead).length;
  const badge = document.querySelector("[data-notification-badge]");
  if (!badge) return;
  badge.hidden = unread === 0;
  badge.textContent = unread > 9 ? "9+" : String(unread);
}

function renderNotificationsModal() {
  const list = document.querySelector("[data-notification-list]");
  list.replaceChildren();
  if (!state.notifications.length) {
    list.append(el("li", "admin-help", "No notifications right now."));
    return;
  }
  for (const n of state.notifications) {
    const li = el("li", `innovator-notification-item${n.isRead ? "" : " is-unread"}`);
    li.append(el("strong", "", n.title), el("p", "", n.message), el("small", "admin-help", `${n.createdAt}${n.applicationRef ? ` • ${n.applicationRef}` : ""}`));
    const btn = el("button", "admin-button-secondary", "Open");
    btn.type = "button";
    btn.addEventListener("click", async () => {
      state.notifications = await rpc("innovator_mark_notifications_read", { p_notification_id: n.id });
      syncNotificationBadge();
      closeDialog();
      const target = String(n.targetHash || "#applications").replace(/^#/, "");
      const linked = n.applicationRef ? state.applications.find(a => a.reference === n.applicationRef) : null;
      if (linked && target === "applications") openApplicationDetail(linked.id);
      else navigateTo(["overview", "applications", "submit", "messages", "documents", "optimus", "support", "settings"].includes(target) ? target : "applications");
    });
    li.append(btn);
    list.append(li);
  }
}

document.querySelector("[data-open-notifications]")?.addEventListener("click", () => {
  renderNotificationsModal();
  openDialog("notifications", "Notifications");
});
document.querySelector("[data-mark-all-notifications]")?.addEventListener("click", async () => {
  state.notifications = await rpc("innovator_mark_notifications_read", { p_notification_id: null });
  syncNotificationBadge();
  renderNotificationsModal();
});

// Global & Toolbar Event Bindings
document.querySelector("[data-innovator-search]")?.addEventListener("submit", e => {
  e.preventDefault();
  const q = e.target.elements.query.value.trim();
  if (!q) return;
  state.appsFilter.query = q;
  state.appsFilter.page = 0;
  document.querySelector("[data-apps-toolbar]").elements.query.value = q;
  navigateTo("applications");
});

document.querySelector("[data-continue-latest-draft]")?.addEventListener("click", () => {
  const draft = state.applications.find(a => a.status === "Draft");
  if (draft) openWizardForApp(draft.id);
});
for (const btn of document.querySelectorAll("[data-start-new-innovation]")) {
  btn.addEventListener("click", () => navigateTo("submit"));
}
document.querySelector("[data-ask-optimus-shortcut]")?.addEventListener("click", event => {
  event.preventDefault();
    if (optimusPanel?.hidden) document.querySelector("[data-optimus-toggle]")?.click();
  document.querySelector("#optimus-question-input")?.focus();
});

for (const pill of document.querySelectorAll("[data-app-status-filter]")) {
  pill.addEventListener("click", () => {
    state.appsFilter.status = pill.dataset.appStatusFilter;
    state.appsFilter.page = 0;
    for (const p of document.querySelectorAll("[data-app-status-filter]")) {
      const active = p === pill;
      p.classList.toggle("is-active", active);
      p.setAttribute("aria-pressed", active ? "true" : "false");
    }
    renderApplicationsTable();
  });
}
const appsToolbar = document.querySelector("[data-apps-toolbar]");
appsToolbar?.addEventListener("input", () => {
  state.appsFilter.query = appsToolbar.elements.query.value;
  state.appsFilter.page = 0;
  renderApplicationsTable();
});
appsToolbar?.addEventListener("change", () => {
  state.appsFilter.sort = appsToolbar.elements.sort.value;
  renderApplicationsTable();
});
document.querySelector("[data-clear-app-filters]")?.addEventListener("click", () => {
  state.appsFilter = { status: "All", query: "", sort: "updated_desc", page: 0 };
  appsToolbar.reset();
  for (const p of document.querySelectorAll("[data-app-status-filter]")) {
    const active = p.dataset.appStatusFilter === "All";
    p.classList.toggle("is-active", active);
    p.setAttribute("aria-pressed", active ? "true" : "false");
  }
  renderApplicationsTable();
});
document.querySelector("[data-apps-prev]")?.addEventListener("click", () => {
  state.appsFilter.page = Math.max(0, state.appsFilter.page - 1);
  renderApplicationsTable();
});
document.querySelector("[data-apps-next]")?.addEventListener("click", () => {
  state.appsFilter.page += 1;
  renderApplicationsTable();
});

function renderActiveSection() {
  renderOverview();
  if (state.activeSection === "applications") {
    if (state.detailAppId) renderApplicationDetail();
    else renderApplicationsTable();
  } else if (state.activeSection === "messages") renderMessagesScreen();
  else if (state.activeSection === "documents") renderDocumentsLibrary();
  else if (state.activeSection === "optimus") renderOptimus();
  else if (state.activeSection === "support") renderSupportScreen();
  else if (state.activeSection === "settings") renderSettings();
}

function renderAll() {
  renderOverview();
  renderApplicationsTable();
  if (state.detailAppId) renderApplicationDetail();
  renderMessagesScreen();
  renderDocumentsLibrary();
  renderOptimus();
  renderSupportScreen();
  renderSettings();
}

// Startup Gate
async function bootstrapPortal() {
  try {
    applyResponsiveSidebar();
    const token = accountToken();
    if (!signupConfig || !token) {
      window.location.replace("/signin/");
      return;
    }
    state.token = token;
    const profile = await verifiedAccountProfile(signupConfig, token);
    if (!profile) {
      clearAccountToken();
      window.location.replace("/signin/");
      return;
    }
    if (profile.account_role !== "innovator") {
      window.location.replace(ROLE_HOMES[profile.account_role] || "/signin/");
      return;
    }
    globalThis.__cedaSetPortalActivityActor?.(profile, signupConfig, token);
    void import("./telemetry.js").then(m => m.initPortalTelemetry?.({ portalRole: "innovator" })).catch(() => {});
    await loadWorkspace(true);
    workspaceEl.hidden = false;
    announce("");
    const hash = window.location.hash.replace(/^#/, "");
    if (["overview", "applications", "submit", "messages", "documents", "optimus", "support", "settings"].includes(hash)) {
      navigateTo(hash, { skipHash: true });
    }
  } catch (err) {
    announce(err?.message || "Unable to open innovator workspace. Reload the page or sign in again.");
  }
}

bootstrapPortal();
