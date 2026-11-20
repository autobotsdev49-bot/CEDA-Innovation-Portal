import { signupConfig } from "./signupConfig.js";
import { verifiedAccountProfile, logoutSignup } from "./signupApi.js";
import { accountToken, clearAccountToken, saveAccountToken } from "./verificationSession.js";
import { initializeOperations, applications } from "./adminOperations.js";
import { initializeOverview } from "./adminOverview.js";

const status = document.querySelector("[data-admin-status]");
const workspace = document.querySelector("[data-admin-workspace]");
const rows = document.querySelector("[data-users]");
let page = 0;
let search = "";
let editing;
let factor;
let busy = false;
let directoryUsers = [];
let sectorRecords = [];
let selectedSectorId;
let sectorReturnFocus;

function announce(message) {
  status.classList.toggle("admin-status-silent", !message);
  status.textContent = message;
  document.querySelector("[data-dialog-status]").textContent = message;
}
const adminDialog = document.querySelector("[data-admin-dialog]");
const dialogBody = document.querySelector("[data-dialog-body]");
let dialogPanel;
let dialogPlaceholder;
let dialogTrigger;
function closeAdminDialog(restoreFocus = true) {
  const password = dialogPanel?.querySelector('[name="password"]');
  if (password) { password.value = ""; password.type = "password"; }
  const toggle = dialogPanel?.querySelector("[data-create-password-toggle]");
  if (toggle) { toggle.setAttribute("aria-pressed", "false"); toggle.setAttribute("aria-label", "Show password"); }
  if (dialogPanel) {
    dialogPanel.hidden = true;
    dialogPlaceholder.replaceWith(dialogPanel);
    dialogPanel = undefined;
  }
  adminDialog.close();
  adminDialog.classList.remove("is-application-detail");
  document.body.classList.remove("admin-modal-open");
  if (restoreFocus && dialogTrigger?.isConnected && !dialogTrigger.closest("[hidden]")) dialogTrigger.focus();
}
function openAdminDialog(panel, title, focusTarget) {
  const trigger = document.activeElement;
  if (adminDialog.open) closeAdminDialog(false);
  dialogTrigger = trigger?.closest("[data-admin-dialog]") ? (panel.hasAttribute("data-notification-editor") || panel.hasAttribute("data-notification-center") ? document.querySelector("[data-open-notifications]") : document.querySelector('.admin-sidebar [aria-current="page"]')) : trigger;
  dialogPanel = panel;
  dialogPlaceholder = document.createComment("Dialog panel returns here on close");
  panel.replaceWith(dialogPlaceholder);
  dialogBody.replaceChildren(panel);
  panel.hidden = false;
  adminDialog.classList.toggle("is-application-detail", panel.hasAttribute("data-application-details") || panel.hasAttribute("data-notification-center"));
  document.querySelector("[data-admin-dialog] #admin-dialog-title").textContent = title;
  document.querySelector("[data-dialog-status]").textContent = "";
  document.body.classList.add("admin-modal-open");
  adminDialog.showModal();
  const initialFocus = focusTarget?.hidden ? document.querySelector("#admin-dialog-title") : focusTarget;
  (initialFocus || panel.querySelector("input:not([type=hidden]), select, textarea, button") || document.querySelector("#admin-dialog-title"))?.focus();
}
document.querySelector("[data-dialog-close]").addEventListener("click", () => { if (!busy) closeAdminDialog(); });
document.querySelector("[data-open-notifications]").addEventListener("click", () => {
  if (workspace.hidden) return;
  openAdminDialog(document.querySelector("[data-notification-center]"), "Notifications");
});
document.querySelector("[data-notification-followup]").addEventListener("click", () => {
  closeAdminDialog(false);
  const issueForm = document.querySelector("[data-issue-filters]");
  if (issueForm) { issueForm.reset(); issueForm.elements.kind.value = "Delivery"; issueForm.dispatchEvent(new Event("change", { bubbles: true })); }
});
document.querySelector("[data-notification-return]")?.addEventListener("click", () => {
  openAdminDialog(document.querySelector("[data-notification-center]"), "Notifications");
});

// Governance previews are deliberately kept in memory; no privileged write is implied.
const governanceContent = [
  { title: "How to submit an innovation", summary: "Step-by-step guidance for individual and company applicants.", kind: "Public pages", audience: "Public website", stage: "Published preview", updated: "2026-11-19" },
  { title: "What information should I prepare?", summary: "Checklist of problem, solution, impact and feasibility evidence.", kind: "FAQs", audience: "Applicants", stage: "Published preview", updated: "2026-11-18" },
  { title: "Innovation submissions are open", summary: "Cycle announcement for the CEDA Innovation Portal.", kind: "Announcements", audience: "All visitors", stage: "Published preview", updated: "2026-11-20" },
  { title: "Partner ecosystem directory", summary: "Overview of CEDA innovation support and institutional partners.", kind: "Partners", audience: "Public website", stage: "Awaiting review", updated: "2026-11-17" },
];
const notificationInbox = [
  { title: "DEL001 / Application notification delivery failed", category: "Delivery alert", status: "Open", when: "2026-11-18 16:05", action: "followup" },
  { title: "Authenticator verification required for role assignments", category: "Security policy", status: "Active", when: "2026-11-20 08:00", action: "security" },
  { title: "Submission & outcome templates ready for review", category: "Templates", status: "Preview", when: "2026-11-20 09:30", action: "templates" },
];
const notificationTemplates = [
  { title: "Submission received", kind: "Email template", channel: "In-app + Email", audience: "Innovator", status: "Enabled", message: "We have received your CEDA innovation submission. Sign in to view your reference and progress timeline." },
  { title: "Review started", kind: "Email template", channel: "In-app + Email", audience: "Innovator", status: "Enabled", message: "Your innovation submission is now under assessment by the review panel." },
  { title: "Additional information requested", kind: "Email template", channel: "In-app + Email", audience: "Innovator", status: "Enabled", message: "The assessment panel requested clarification on your submission. Sign in to respond." },
  { title: "Assessment panel assignment", kind: "Email template", channel: "In-app + Email", audience: "Assessor", status: "Enabled", message: "A new innovation application is available in your Assessor workspace." },
  { title: "Outcome released", kind: "Email template", channel: "In-app + Email", audience: "Innovator", status: "Enabled", message: "Your CEDA innovation assessment has an update. Sign in to view the released outcome and feedback." },
];
let notificationDraftCount = 0;

function stageBadge(stage) {
  const badge = document.createElement("span");
  const tone = stage === "Published preview" || stage === "Enabled" || stage === "Active" ? "sector-published" : stage === "Awaiting review" || stage === "Open" ? "sector-draft" : "sector-archived";
  badge.className = "admin-sector-badge " + tone;
  badge.textContent = stage;
  return badge;
}

function renderNotifications() {
  const inboxBody = document.querySelector("[data-notification-inbox-rows]");
  const templateBody = document.querySelector("[data-notification-template-rows]");
  if (inboxBody) {
    inboxBody.replaceChildren();
    for (const item of notificationInbox) {
      const row = inboxBody.insertRow();
      const titleStrong = document.createElement("strong"); titleStrong.textContent = item.title;
      row.insertCell().append(titleStrong);
      row.insertCell().textContent = item.category;
      row.insertCell().append(stageBadge(item.status));
      row.insertCell().textContent = item.when;
      const button = document.createElement("button"); button.type = "button";
      button.textContent = item.action === "followup" ? "Inspect issue" : item.action === "security" ? "Account security" : "View templates";
      button.addEventListener("click", () => {
        if (item.action === "followup") {
          document.querySelector("[data-notification-followup]").click();
          location.hash = "#followup";
        } else if (item.action === "security") {
          closeAdminDialog(false);
          location.hash = "#security";
        } else {
          document.querySelector('[data-notification-tab="templates"]')?.click();
        }
      });
      row.insertCell().append(button);
    }
  }
  if (templateBody) {
    templateBody.replaceChildren();
    for (const tpl of notificationTemplates) {
      const row = templateBody.insertRow();
      const titleStrong = document.createElement("strong"); titleStrong.textContent = tpl.title;
      row.insertCell().append(titleStrong);
      row.insertCell().textContent = tpl.channel;
      row.insertCell().textContent = tpl.audience;
      row.insertCell().append(stageBadge(tpl.status));
      const button = document.createElement("button"); button.type = "button"; button.textContent = "Edit draft";
      button.addEventListener("click", () => {
        const form = document.querySelector("[data-notification-form]");
        form.reset();
        form.elements.kind.value = tpl.kind;
        form.elements.title.value = tpl.title;
        form.elements.message.value = tpl.message;
        openAdminDialog(document.querySelector("[data-notification-editor]"), "Prepare notification draft", form.elements.message);
      });
      row.insertCell().append(button);
    }
  }
  const tplStat = document.querySelector('[data-notification-stat="templates"]');
  if (tplStat) tplStat.textContent = String(notificationTemplates.length);
  const draftStat = document.querySelector('[data-notification-stat="drafts"]');
  if (draftStat) draftStat.textContent = String(notificationDraftCount);
}

for (const tab of document.querySelectorAll("[data-notification-tab]")) {
  tab.addEventListener("click", () => {
    const target = tab.dataset.notificationTab;
    for (const button of document.querySelectorAll("[data-notification-tab]")) {
      button.setAttribute("aria-selected", String(button === tab));
    }
    for (const pane of document.querySelectorAll("[data-notification-pane]")) {
      pane.hidden = pane.dataset.notificationPane !== target;
    }
  });
}

function renderGovernanceContent() {
  const active = document.querySelector('[data-content-type][aria-pressed="true"]')?.dataset.contentType || "All";
  const searchForm = document.querySelector("[data-content-search]");
  const query = (searchForm?.elements.query?.value || "").trim().toLowerCase();
  const stageFilter = searchForm?.elements.stage?.value || "";
  const items = governanceContent.filter(item =>
    (active === "All" || item.kind === active) &&
    (!stageFilter || item.stage === stageFilter) &&
    (!query || [item.title, item.summary || "", item.kind].some(v => v.toLowerCase().includes(query)))
  );
  for (const [key, value] of Object.entries({
    total: governanceContent.length,
    guidance: governanceContent.filter(i => i.kind === "Public pages" || i.kind === "FAQs").length,
    announcements: governanceContent.filter(i => i.kind === "Announcements" || i.kind === "Partners").length,
    drafts: governanceContent.filter(i => i.stage === "Tab draft").length,
  })) {
    const node = document.querySelector(`[data-content-stat="${key}"]`);
    if (node) node.textContent = String(value);
  }
  const body = document.querySelector("[data-content-rows]"); body.replaceChildren();
  for (const item of items) {
    const row = body.insertRow();
    const titleCell = row.insertCell();
    const titleStrong = document.createElement("strong"); titleStrong.textContent = item.title;
    titleCell.append(titleStrong);
    if (item.summary) {
      const sub = document.createElement("small"); sub.className = "admin-case-reference"; sub.textContent = item.summary;
      titleCell.append(sub);
    }
    row.insertCell().textContent = item.kind;
    row.insertCell().textContent = item.audience || "Public website";
    row.insertCell().append(stageBadge(item.stage));
    row.insertCell().textContent = item.updated || "2026-11-20";
    const button = document.createElement("button"); button.type = "button"; button.textContent = "Prepare revision";
    button.addEventListener("click", () => {
      const form = document.querySelector("[data-content-form]");
      form.elements.kind.value = item.kind;
      form.elements.title.value = item.title;
      form.elements.body.value = item.summary || "";
      form.elements.reason.value = "";
      openAdminDialog(document.querySelector("[data-content-editor]"), "Prepare content draft", form.elements.body);
    });
    row.insertCell().append(button);
  }
  if (!items.length) {
    const cell = body.insertRow().insertCell(); cell.colSpan = 6;
    cell.textContent = "No content items match these filters.";
  }
  const categoryLabel = active === "All" ? "content" : active.toLowerCase();
  document.querySelector("[data-content-count]").textContent = `Showing ${items.length} of ${governanceContent.length} ${categoryLabel} item${items.length === 1 ? "" : "s"} in this preview`;
}
for (const button of document.querySelectorAll("[data-content-type]")) button.addEventListener("click", () => { for (const tab of document.querySelectorAll("[data-content-type]")) tab.setAttribute("aria-pressed", String(tab === button)); renderGovernanceContent(); });
const contentSearch = document.querySelector("[data-content-search]");
if (contentSearch) {
  contentSearch.addEventListener("input", renderGovernanceContent);
  contentSearch.addEventListener("change", renderGovernanceContent);
  contentSearch.addEventListener("submit", event => { event.preventDefault(); renderGovernanceContent(); });
  contentSearch.addEventListener("reset", () => queueMicrotask(renderGovernanceContent));
}
document.querySelector("[data-create-content]").addEventListener("click", () => {
  const form = document.querySelector("[data-content-form]");
  form.reset();
  const activeType = document.querySelector('[data-content-type][aria-pressed="true"]')?.dataset.contentType;
  form.elements.kind.value = activeType && activeType !== "All" ? activeType : "Public pages";
  openAdminDialog(document.querySelector("[data-content-editor]"), "Prepare content draft", form.elements.title);
});
document.querySelector("[data-content-form]").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  governanceContent.unshift({
    title: form.elements.title.value.trim(),
    summary: form.elements.body.value.trim().slice(0, 140),
    kind: form.elements.kind.value,
    audience: "Public website",
    stage: "Tab draft",
    updated: "2026-11-20",
  });
  renderGovernanceContent();
  closeAdminDialog();
  announce("Content draft added to this tab only. It has not been published.");
});
for (const button of document.querySelectorAll("[data-notification-open]")) button.addEventListener("click", () => {
  const form = document.querySelector("[data-notification-form]");
  form.reset();
  form.elements.kind.value = button.dataset.notificationOpen === "template" ? "Email template" : "Announcement";
  openAdminDialog(document.querySelector("[data-notification-editor]"), "Prepare notification draft", form.elements.title);
});
document.querySelector("[data-notification-form]").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const kind = form.elements.kind.value;
  const title = form.elements.title.value.trim();
  const message = form.elements.message.value.trim();
  notificationDraftCount++;
  if (kind === "Announcement") {
    notificationInbox.unshift({ title, category: "Announcement draft", status: "Tab draft", when: "Just now", action: "templates" });
  } else {
    notificationTemplates.unshift({ title, kind, channel: kind === "Push template" ? "Push" : "In-app + Email", audience: "Innovator", status: "Tab draft", message });
  }
  renderNotifications();
  document.querySelector("[data-notification-draft]").textContent = kind + " draft: " + title + ". Kept only until reload. No message was sent.";
  openAdminDialog(document.querySelector("[data-notification-center]"), "Notifications");
  announce("Notification draft prepared in this tab. No message was sent.");
});
renderGovernanceContent();
renderNotifications();

// Audit & Activity tabs
function selectAuditTab(target) {
  for (const button of document.querySelectorAll("[data-audit-tab]")) {
    button.setAttribute("aria-selected", String(button.dataset.auditTab === target));
  }
  for (const pane of document.querySelectorAll("[data-audit-pane]")) {
    pane.hidden = pane.dataset.auditPane !== target;
  }
}
for (const tab of document.querySelectorAll("[data-audit-tab]")) {
  tab.addEventListener("click", () => selectAuditTab(tab.dataset.auditTab));
}
document.querySelector("[data-audit-refresh]")?.addEventListener("click", () => { void loadAudit(); });

// Account & Settings tabs
function selectSettingsTab(target) {
  for (const button of document.querySelectorAll("[data-settings-tab]")) {
    button.setAttribute("aria-selected", String(button.dataset.settingsTab === target));
  }
  for (const pane of document.querySelectorAll("[data-settings-pane]")) {
    pane.hidden = pane.dataset.settingsPane !== target;
  }
}
for (const tab of document.querySelectorAll("[data-settings-tab]")) {
  tab.addEventListener("click", () => selectSettingsTab(tab.dataset.settingsTab));
}
for (const button of document.querySelectorAll("[data-switch-settings-tab]")) {
  button.addEventListener("click", () => selectSettingsTab(button.dataset.switchSettingsTab));
}
document.querySelector("[data-settings-form]")?.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const area = form.elements.area.value;
  const proposal = form.elements.proposal.value.trim();
  document.querySelector("[data-settings-draft-status]").textContent = `Policy draft saved in this tab: ${area} — "${proposal}". Not applied to production.`;
  form.reset();
  announce("Policy draft kept in this tab only. Live portal configuration has not changed.");
});

let auditPage = 0;
let auditCanNext = false;
async function loadAudit() {
  const status = document.querySelector("[data-audit-state]");
  const body = document.querySelector("[data-audit-rows]");
  const stat = document.querySelector('[data-audit-stat="protected"]');
  status.textContent = "Loading protected audit records.";
  try {
    const records = await rpc("admin_audit_feed", { search_text: document.querySelector('[data-audit-search] input[name="query"]').value.trim(), page_number: auditPage });
    if (!Array.isArray(records)) throw new Error("Invalid audit response");
    body.replaceChildren();
    for (const item of records) {
      const row = body.insertRow();
      for (const value of [new Intl.DateTimeFormat("en-BW", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Gaborone" }).format(new Date(item.created_at)), item.actor, item.action, item.target, item.reason || "Not recorded"]) row.insertCell().textContent = value;
    }
    if (!records.length) { const cell = body.insertRow().insertCell(); cell.colSpan = 5; cell.textContent = auditPage ? "No more audit entries." : "No audit entries match this search."; }
    status.textContent = `Showing ${records.length} protected audit entries on page ${auditPage + 1}.`;
    if (stat) stat.textContent = String(records.length);
    document.querySelector("[data-audit-page]").textContent = `Page ${auditPage + 1}`;
    document.querySelector("[data-audit-previous]").disabled = auditPage === 0;
    auditCanNext = records.length === 25;
    document.querySelector("[data-audit-next]").disabled = !auditCanNext;
  } catch {
    body.replaceChildren();
    const cell = body.insertRow().insertCell(); cell.colSpan = 5;
    cell.textContent = "Protected audit feed unavailable until the audit migration is applied. Use the Portal activity stream tab for sample operational events.";
    status.textContent = "Audit entries could not load. Check your administrator session and database migration, then search again.";
    if (stat) stat.textContent = "—";
    auditCanNext = false;
    document.querySelector("[data-audit-next]").disabled = true;
  }
}
document.querySelector("[data-audit-search]").addEventListener("submit", event => { event.preventDefault(); auditPage = 0; void loadAudit(); });
document.querySelector("[data-audit-previous]").addEventListener("click", () => { if (auditPage) { auditPage--; void loadAudit(); } });
document.querySelector("[data-audit-next]").addEventListener("click", () => { auditPage++; void loadAudit(); });
initializeOperations(openAdminDialog);
initializeOverview(openAdminDialog, applications);
adminDialog.addEventListener("cancel", event => { event.preventDefault(); if (!busy) closeAdminDialog(); });
adminDialog.addEventListener("close", () => { if (!adminDialog.open && dialogPanel) closeAdminDialog(); });
for (const button of document.querySelectorAll("[data-open-security]")) {
  button.addEventListener("click", () => {
    openAdminDialog(document.querySelector("[data-security-panel]"), "Authenticator verification");
  });
}
const aiDraft = { tone: "Clear and professional", length: "Balanced", instructions: "", handoff: "", source: "", notes: "", questions: "" };
function renderAiDraft() {
  const list = document.querySelector("[data-ai-draft]"); list.replaceChildren();
  for (const [key, label] of [["tone","Tone"],["length","Answer length"],["instructions","Instructions"],["handoff","Human support"],["source","Source URL"],["notes","Knowledge notes"],["questions","Example questions"]]) {
    const term = document.createElement("dt"); term.textContent = label;
    const detail = document.createElement("dd"); detail.textContent = aiDraft[key] || "Not provided";
    list.append(term, detail);
  }
}
for (const button of document.querySelectorAll("[data-ai-open]")) button.addEventListener("click", () => {
  const key = button.dataset.aiOpen;
  const panel = document.querySelector(`[data-ai-panel="${key}"]`);
  if (!panel) return;
  if (key === "preview") renderAiDraft();
  openAdminDialog(panel, panel.querySelector("h3").textContent);
});
for (const [selector, fields] of [["[data-ai-guidance-form]",["tone","length","instructions","handoff"]],["[data-ai-knowledge-form]",["source","notes","questions"]]]) {
  document.querySelector(selector).addEventListener("submit", event => {
    event.preventDefault();
    if (!event.target.reportValidity()) return;
    for (const key of fields) aiDraft[key] = event.target.elements.namedItem(key).value.trim();
    announce("Draft kept in this tab. It will be cleared on reload. The live assistant has not changed.");
  });
}
const sectionLinks = [...document.querySelectorAll('.admin-sidebar nav a[href^="#"]')];
const sectionAliases = {
  activity: { id: "audit", onEnter: () => selectAuditTab("activity") },
  account: { id: "settings", onEnter: () => selectSettingsTab("profile") },
  security: { id: "settings", onEnter: () => selectSettingsTab("security") },
  reports: { id: "analytics" },
  feedback: { id: "followup", onEnter: () => {
    const form = document.querySelector("[data-issue-filters]");
    if (form) { form.reset(); form.elements.kind.value = "Feedback"; form.dispatchEvent(new Event("change", { bubbles: true })); }
  } },
};
const adminLayout = document.querySelector(".admin-layout");
const sidebarToggle = document.querySelector("[data-admin-sidebar-toggle]");
function setSidebarCollapsed(collapsed, save = true) {
  adminLayout.classList.toggle("is-collapsed", collapsed);
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  sidebarToggle.setAttribute("aria-label", collapsed ? "Expand administration menu" : "Collapse administration menu");
  sidebarToggle.title = collapsed ? "Expand menu" : "Collapse menu";
  if (save) {
    try { localStorage.setItem("ceda-admin-sidebar-collapsed", String(collapsed)); } catch {}
  }
}
try { setSidebarCollapsed(localStorage.getItem("ceda-admin-sidebar-collapsed") === "true", false); } catch {}
sidebarToggle.addEventListener("click", () => setSidebarCollapsed(!adminLayout.classList.contains("is-collapsed")));
function updateActiveSection(focus = false) {
  if (adminDialog.open) closeAdminDialog(false);
  const requested = location.hash.slice(1);
  const alias = sectionAliases[requested];
  if (alias?.onEnter) alias.onEnter();
  const targetId = alias ? alias.id : requested;
  const sectionId = sectionLinks.some(link => link.hash === "#" + targetId) ? targetId : "overview";
  for (const section of workspace.children) {
    if (section.tagName === "SECTION") section.hidden = section.id !== sectionId;
  }
  for (const link of sectionLinks) {
    if (link.hash === "#" + sectionId) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (focus && !workspace.hidden) {
    const heading = document.getElementById(sectionId)?.querySelector("h1, h2");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }
}
for (const link of sectionLinks) link.addEventListener("click", () => {
  for (const item of sectionLinks) item.removeAttribute("aria-current");
  link.setAttribute("aria-current", "page");
});
window.addEventListener("hashchange", () => updateActiveSection(true));
updateActiveSection();
document.querySelector("[data-workspace-search]").addEventListener("submit", event => {
  event.preventDefault();
  const query = event.target.elements.query.value.trim();
  if (!query) return;
  const q = query.toLowerCase();
  const aliasMatch = Object.keys(sectionAliases).find(key => key.includes(q));
  if (aliasMatch) {
    location.hash = "#" + aliasMatch;
    updateActiveSection(true);
    announce("");
    return;
  }
  const destination = sectionLinks.find(link => link.textContent.trim().toLowerCase().includes(q));
  if (destination) {
    location.hash = destination.hash;
    updateActiveSection(true);
    announce("");
    return;
  }
  search = query;
  page = 0;
  document.querySelector('[data-user-search] input[name="search"]').value = query;
  location.hash = "#users";
  updateActiveSection(true);
  void run(async () => { await loadUsers(); announce("User search results updated."); });
});
async function request(path, body, method = "POST") {
  const token = accountToken();
  if (!signupConfig || !token) throw new Error("Sign in to continue.");
  const response = await fetch(new URL(path, signupConfig.url), {
    method, headers: { apikey: signupConfig.key, Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message ?? data?.error ?? "";
    if (/Multi-factor/.test(message)) throw new Error("Verify your authenticator in Account & settings before changing user access.");
    if (response.status === 401) throw new Error("Your session expired. Sign in again.");
    if (response.status === 404 && path === "/functions/v1/admincreate") throw new Error("Password-based account creation has not been deployed yet. Contact the project maintainer.");
    if (response.status === 403) throw new Error("You do not have access to this action.");
    if (/Account already exists/.test(message)) throw new Error("This email already has an account. Use the user directory to update its access.");
    if (/invitation was reserved|Invitation could not be prepared/.test(message)) throw new Error(message);
    if (response.status === 409 || /duplicate key/.test(message)) throw new Error("This record already exists. Refresh and check the current entries.");
    throw new Error("The action could not be completed. Check the values and try again.");
  }
  return data;
}
const rpc = (name, body = {}) => request("/rest/v1/rpc/" + name, body);

async function run(action) {
  if (busy) return;
  busy = true;
  workspace.querySelectorAll("button").forEach(button => { button.disabled = true; });
  try { await action(); }
  catch (error) { announce(error.message); }
  finally {
    busy = false;
    workspace.querySelectorAll("button").forEach(button => { button.disabled = false; });
    document.querySelector("[data-audit-previous]").disabled = auditPage === 0;
    document.querySelector("[data-audit-next]").disabled = !auditCanNext;
    document.querySelector("[data-previous]").disabled = page === 0;
    document.querySelector("[data-next]").disabled = directoryUsers.length < 25;
  }
}
function appendCell(row, text) {
  const cell = row.insertCell();
  cell.textContent = text;
  return cell;
}
async function loadUsers() {
  directoryUsers = await rpc("admin_directory", { search_text: search, page_number: page });
  renderUsers();
}
function renderUsers() {
  const filter = document.querySelector("[data-user-search]").elements;
  const users = directoryUsers.filter(user => (!filter.roleFilter.value || user.account_role === filter.roleFilter.value) &&
    (!filter.statusFilter.value || user.account_status === filter.statusFilter.value));
  for (const [key, value] of Object.entries({ total: directoryUsers.length, active: directoryUsers.filter(u => u.account_status === "active").length,
    inactive: directoryUsers.filter(u => u.account_status !== "active").length, admins: directoryUsers.filter(u => u.account_role === "admin").length })) {
    document.querySelector(`[data-user-count="${key}"]`).textContent = String(value);
  }
  rows.replaceChildren();
  for (const user of users) {
    const row = rows.insertRow();
    const identity = appendCell(row, "");
    const initials = document.createElement("span");
    initials.className = "admin-user-avatar";
    initials.setAttribute("aria-hidden", "true");
    initials.textContent = (user.full_name || "User").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("");
    const name = document.createElement("strong");
    name.textContent = user.full_name || "User";
    const identityWrap = document.createElement("span");
    identityWrap.className = "admin-user-identity";
    identityWrap.append(initials, name); identity.append(identityWrap);
    appendCell(row, user.email);
    const roleBadge = document.createElement("span");
    roleBadge.className = "admin-role-badge";
    if (["admin", "assessor", "support", "innovator"].includes(user.account_role)) {
      roleBadge.classList.add("admin-role-" + user.account_role);
    }
    roleBadge.textContent = ({admin:"Administrator",assessor:"Assessor",support:"Support Officer",innovator:"Innovator"}[user.account_role] || "Unknown");
    const roleCell = appendCell(row, "");
    const roleTags = document.createElement("span");
    roleTags.className = "admin-role-tags";
    roleTags.append(roleBadge);
    if (user.account_role === "assessor" && user.lead_assessor) {
      const leadBadge = document.createElement("span");
      leadBadge.className = "admin-role-badge admin-role-lead";
      leadBadge.textContent = "Lead";
      leadBadge.setAttribute("aria-label", "Lead Assessor powers");
      roleTags.append(leadBadge);
    }
    roleCell.append(roleTags);
    const statusBadge = document.createElement("span");
    statusBadge.className = "admin-account-badge" + (user.account_status === "active" ? " is-active" : "");
    statusBadge.textContent = user.account_status;
    appendCell(row, "").append(statusBadge);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Edit access";
    button.setAttribute("aria-label", "Edit access for " + (user.full_name || "user"));
    button.addEventListener("click", () => {
      document.querySelector("[data-create-panel]").hidden = true;
      editing = user.id;
      const form = document.querySelector("[data-role-form]");
      form.elements.role.value = user.account_role;
      form.elements.lead.checked = user.lead_assessor;
      for (const option of form.elements.sectors.options) option.selected = user.sector_ids.includes(option.value);
      document.querySelector("[data-edit-name]").textContent = user.full_name;
      openAdminDialog(document.querySelector("[data-edit-role]"), "Change access: " + user.full_name, form.elements.role);
    });
    appendCell(row, "").append(button);
  }
  if (!users.length) {
    const cell = rows.insertRow().insertCell();
    cell.colSpan = 5;
    cell.textContent = "No users match these filters on this page.";
  }
  document.querySelector("[data-page]").textContent = "Page " + (page + 1);
  document.querySelector("[data-user-results]").textContent = `Showing ${users.length} of ${directoryUsers.length} users on page ${page + 1}`;
}
async function loadSectors() {
  const sectors = await rpc("admin_sectors");
  sectorRecords = sectors;
  renderSectors();
  if (selectedSectorId) {
    const selected = sectorRecords.find(item => item.id === selectedSectorId);
    if (selected) showSectorDetails(selected, false);
  }
  for (const select of workspace.querySelectorAll('select[name="sectors"]')) {
    select.replaceChildren();
    for (const sector of sectors.filter(item => item.status !== "archived")) {
      const option = document.createElement("option");
      option.value = sector.id;
      option.textContent = sector.name;
      select.append(option);
    }
  }
}
function renderSectors() {
  const filters = document.querySelector("[data-sector-search]").elements;
  const query = filters.query.value.trim().toLowerCase();
  const filtered = sectorRecords.filter(sector => sector.name.toLowerCase().includes(query) && (!filters.status.value || sector.status === filters.status.value));
  document.querySelector("[data-sector-total]").textContent = String(sectorRecords.length);
  for (const state of ["published", "draft", "archived"]) document.querySelector(`[data-sector-${state}]`).textContent = String(sectorRecords.filter(sector => sector.status === state).length);
  const list = document.querySelector("[data-sector-list]");
  list.replaceChildren();
  for (const sector of filtered) {
    const row = list.insertRow();
    const name = document.createElement("strong"); name.textContent = sector.name;
    appendCell(row, "").append(name);
    const badge = document.createElement("span");
    badge.className = "admin-sector-badge";
    if (["published", "draft", "archived"].includes(sector.status)) badge.classList.add("sector-" + sector.status);
    badge.textContent = sector.status;
    appendCell(row, "").append(badge);
    for (let i = 0; i < 4; i++) {
      const count = appendCell(row, "—"); count.setAttribute("aria-label", "Awaiting submission data");
    }
    const actions = document.createElement("span"); actions.className = "admin-sector-actions";
    for (const [label, action] of [["View", showSectorDetails], ["Edit", openSectorEditor]]) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label;
      button.setAttribute("aria-label", label + " " + sector.name);
      button.addEventListener("click", () => { sectorReturnFocus = button; action(sector); });
      actions.append(button);
    }
    appendCell(row, "").append(actions);
  }
  if (!filtered.length) {
    const cell = list.insertRow().insertCell(); cell.colSpan = 7; cell.textContent = "No sectors match your search.";
  }
  document.querySelector("[data-sector-results]").textContent = `Showing ${filtered.length} of ${sectorRecords.length} sectors`;
}
function showSectorDetails(sector, focus = true) {
  selectedSectorId = sector.id;
  document.querySelector("[data-sector-detail-name]").textContent = sector.name;
  document.querySelector("[data-sector-detail-status]").textContent = "Sector status: " + sector.status;
  if (focus) openAdminDialog(document.querySelector("[data-sector-detail]"), sector.name);
}
function openSectorEditor(sector) {
  const form = document.querySelector("[data-sector-form]");
  form.reset();
  form.elements.id.value = sector?.id || "";
  form.elements.name.value = sector?.name || "";
  form.elements.status.value = sector?.status || "draft";
  document.querySelector("[data-sector-editor-title]").textContent = sector ? "Edit sector" : "Create sector";
  openAdminDialog(document.querySelector("[data-sector-editor]"), sector ? "Edit sector" : "Create sector", form.elements.name);
}
const sectorSearch = document.querySelector("[data-sector-search]");
sectorSearch.addEventListener("submit", event => { event.preventDefault(); renderSectors(); });
sectorSearch.elements.query.addEventListener("input", renderSectors);
sectorSearch.elements.status.addEventListener("change", renderSectors);
document.querySelector("[data-new-sector]").addEventListener("click", event => { sectorReturnFocus = event.currentTarget; openSectorEditor(); });
document.querySelector("[data-edit-selected-sector]").addEventListener("click", event => {
  const sector = sectorRecords.find(item => item.id === selectedSectorId);
  if (sector) { sectorReturnFocus = event.currentTarget; openSectorEditor(sector); }
});
const directoryForm = document.querySelector("[data-user-search]");
for (const name of ["roleFilter", "statusFilter"]) directoryForm.elements[name].addEventListener("change", renderUsers);
document.querySelector("[data-open-create]").addEventListener("click", () => {
  document.querySelector("[data-edit-role]").hidden = true;
  openAdminDialog(document.querySelector("[data-create-panel]"), "Create user", document.querySelector("[data-create-user]").elements.fullName);
});
function accessValues(form) {
  return {
    new_role: form.elements.role.value,
    lead: form.elements.lead.checked,
    sectors: [...form.elements.sectors.selectedOptions].map(option => option.value),
    reason: form.elements.reason.value.trim(),
  };
}
document.querySelector("[data-user-search]").addEventListener("submit", event => {
  event.preventDefault(); search = event.target.elements.search.value.trim(); page = 0;
  void run(async () => { await loadUsers(); announce("Directory updated."); });
});
for (const [selector, increment] of [["[data-previous]", -1], ["[data-next]", 1]]) {
  document.querySelector(selector).addEventListener("click", () => void run(async () => {
    page = Math.max(0, page + increment); await loadUsers(); announce("Directory updated.");
  }));
}
document.querySelector("[data-sector-form]").addEventListener("submit", event => {
  event.preventDefault(); const form = event.target;
  void run(async () => {
    await rpc("admin_save_sector", { sector_name: form.elements.name.value.trim(), sector_status: form.elements.status.value, reason: form.elements.reason.value.trim(), sector_id: form.elements.id.value || null });
    await loadSectors(); closeAdminDialog(); announce("Sector saved and audited.");
  });
});
document.querySelector("[data-role-form]").addEventListener("submit", event => {
  event.preventDefault(); const form = event.target;
  void run(async () => {
    await rpc("admin_assign_role", { target_id: editing, ...accessValues(form) });
    closeAdminDialog(); await loadUsers(); announce("Access updated and audited.");
  });
});
document.querySelector("[data-create-password-toggle]").addEventListener("click", event => {
  const input = document.querySelector('[data-create-user] input[name="password"]');
  const visible = input.type === "password"; input.type = visible ? "text" : "password";
  event.currentTarget.setAttribute("aria-pressed", String(visible));
  event.currentTarget.setAttribute("aria-label", visible ? "Hide password" : "Show password");
});
document.querySelector("[data-create-user]").addEventListener("submit", event => {
  event.preventDefault(); const form = event.target;
  if (!form.reportValidity()) return;
  const password = form.elements.password.value;
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9\s]/.test(password)) { announce("Use uppercase, lowercase, a number and a symbol in the password."); return; }
  void run(async () => {
    try {
      const result = await request("/functions/v1/admincreate", { address: form.elements.email.value.trim(), display_name: form.elements.fullName.value.trim(), password, ...accessValues(form) });
      if (result?.status !== "created") throw new Error("Account creation was not confirmed. Check the directory before retrying.");
      form.reset(); closeAdminDialog(); await loadUsers(); announce("User account created. The user can sign in with the password you supplied.");
    } finally { form.elements.password.value = ""; }
  });
});
document.querySelector("[data-enroll-factor]").addEventListener("click", () => void run(async () => {
  const user = await request("/auth/v1/user", undefined, "GET");
  const existing = (user.factors ?? []).find(item => item.factor_type === "totp" && item.status === "verified");
  if (existing) { factor = existing.id; announce("Enter the code from your authenticator."); return; }
  const data = await request("/auth/v1/factors", { factor_type: "totp", friendly_name: "CEDA Admin" });
  factor = data.id;
  const qr = document.querySelector("[data-factor-qr]");
  const svg = data.totp.qr_code;
  qr.src = svg.startsWith("data:image/svg+xml;") ? svg : "data:image/svg+xml;base64," + btoa(svg);
  document.querySelector("[data-factor-setup]").hidden = false;
  announce("Scan the code with your authenticator, then enter its six-digit code.");
}));
document.querySelector("[data-mfa-form]").addEventListener("submit", event => {
  event.preventDefault(); const form = event.target;
  void run(async () => {
    if (!factor) throw new Error("Select Set up authenticator first.");
    const challenge = await request("/auth/v1/factors/" + factor + "/challenge", {});
    const verified = await request("/auth/v1/factors/" + factor + "/verify", { challenge_id: challenge.id, code: form.elements.code.value });
    if (!verified.access_token || !saveAccountToken(verified.access_token)) throw new Error("Your verified session could not be saved. Sign in again.");
    form.reset(); document.querySelector("[data-factor-setup]").hidden = true;
    document.querySelector("[data-factor-qr]").removeAttribute("src");
    announce("Multi-factor verification complete.");
  });
});
async function performLogout() {
  const token = accountToken(); clearAccountToken(); workspace.hidden = true;
  try { if (signupConfig && token) await logoutSignup(signupConfig, token); } finally { location.replace("/signin/"); }
}
document.querySelector("[data-admin-logout]").addEventListener("click", performLogout);
document.querySelector("[data-settings-logout]")?.addEventListener("click", performLogout);
void run(async () => {
  const profile = signupConfig && accountToken() && await verifiedAccountProfile(signupConfig, accountToken());
  if (!profile) { location.replace("/signin/"); return; }
  if (profile.account_role !== "admin") { location.replace("/account/"); return; }
  const adminName = profile.full_name || "Administrator";
  const adminEmail = profile.email || "Verified administrator session";
  document.querySelector("[data-admin-name]").textContent = adminName;
  document.querySelector("[data-admin-email]").textContent = profile.email || "";
  const profileName = document.querySelector("[data-profile-name]");
  if (profileName) profileName.textContent = adminName;
  const profileCardName = document.querySelector("[data-profile-card-name]");
  if (profileCardName) profileCardName.textContent = adminName;
  const profileEmail = document.querySelector("[data-profile-email]");
  if (profileEmail) profileEmail.textContent = adminEmail;
  document.querySelector("[data-admin-date]").textContent = new Intl.DateTimeFormat("en-BW", { weekday: "long", day: "numeric", month: "short" }).format(new Date());
  workspace.hidden = false; updateActiveSection(); announce("");
  void loadAudit();
  const results = await Promise.allSettled([loadUsers(), loadSectors()]);
  if (results.some(result => result.status === "rejected")) {
    announce("Administrator access confirmed. Some directory data could not load. Reload to retry, or sign in again if your session has expired.");
  }
});
