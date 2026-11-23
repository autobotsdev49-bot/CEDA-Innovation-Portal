import { signupConfig } from "./signupConfig.js";
import { verifiedAccountProfile, logoutSignup } from "./signupApi.js";
import { accountToken, clearAccountToken, saveAccountToken } from "./verificationSession.js";
import { initializeOperations, applications } from "./adminOperations.js";
import { initializeOverview } from "./adminOverview.js";
import { PORTAL_DOCUMENTS_BUCKET, buildPortalDocumentPublicUrl, buildRegulatoryContactPayload, makePortalDocumentStoragePath, normalizeApplicationFormConfig, validatePortalDocumentFile } from "./portalCatalog.js";
import { defaultAssessmentRubric, distributeWeightsEqually, slugifyCriterionKey, validateRubricDraft } from "./assessmentOverview.js";
import { dispatchQueuedNotifications, kickNotificationDispatch } from "./notificationsDomain.js";

const status = document.querySelector("[data-admin-status]");
const workspace = document.querySelector("[data-admin-workspace]");
const rows = document.querySelector("[data-users]");
let page = 0;
let search = "";
let editing;
let editingContentId = null;
let editingContentItem = null;
let deletingContentItem = null;
let factor;
let busy = false;
let directoryUsers = [];
let sectorRecords = [];
let selectedSectorId;
let sectorReturnFocus;

// High-speed in-memory (RAM) cache for frequently accessed Admin reads with explicit invalidation on writes.
const adminRamCache = new Map();
function getCached(key) {
  const entry = adminRamCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { adminRamCache.delete(key); return undefined; }
  return entry.value;
}
function setCached(key, value, ttlMs = 30000) {
  adminRamCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}
function invalidateCache(...prefixes) {
  for (const key of adminRamCache.keys()) {
    if (!prefixes.length || prefixes.some(prefix => key.startsWith(prefix))) {
      adminRamCache.delete(key);
    }
  }
}

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

// Initial fallback data; replaced by protected database RPCs on sign-in.
const governanceContent = [
  { id: null, title: "How to submit an innovation", summary: "Step-by-step guidance for individual and company applicants.", body: "Prepare your innovation overview, problem statement, proposed solution, alignment with Botswana priorities, feasibility evidence and declarations before submitting.", kind: "Public pages", audience: "Public website", stage: "Published", updated: "2026-11-19" },
  { id: null, title: "What information should I prepare?", summary: "Checklist of problem, solution, impact and feasibility evidence.", body: "Applicants may attach up to four supporting files per section (maximum 10 MB each) and provide an HTTPS link for video demonstrations.", kind: "FAQs", audience: "Applicants", stage: "Published", updated: "2026-11-18" },
  { id: null, title: "Innovation submissions are open", summary: "Cycle announcement for the CEDA Innovation Portal.", body: "The CEDA Innovation Portal is open for individual and registered company innovation submissions across published sectors.", kind: "Announcements", audience: "All visitors", stage: "Published", updated: "2026-11-20" },
  { id: null, title: "Partner ecosystem directory", summary: "Overview of CEDA innovation support and institutional partners.", body: "Directory of reviewed innovation ecosystem partners and incubation support institutions.", kind: "Partners", audience: "Public website", stage: "Awaiting review", updated: "2026-11-17" },
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
let notificationOverviewMeta = { emailSummary: null, fcmSummary: null, subscriptionStats: null };

function applyNotificationOverview(data) {
  if (!data || typeof data !== "object") return;
  if (Array.isArray(data.templates)) {
    notificationTemplates.splice(0, notificationTemplates.length, ...data.templates);
  }
  if (Array.isArray(data.inbox)) {
    notificationInbox.splice(0, notificationInbox.length, ...data.inbox);
  }
  notificationOverviewMeta = {
    emailSummary: data.emailSummary || null,
    fcmSummary: data.fcmSummary || null,
    subscriptionStats: data.subscriptionStats || null,
  };
  renderNotifications();
}

function stageBadge(stage) {
  const badge = document.createElement("span");
  const tone = stage === "Published" || stage === "Published preview" || stage === "Enabled" || stage === "Active" || stage === "Sent" ? "sector-published" : stage === "Awaiting review" || stage === "Open" || stage === "Queued" || stage === "Pending" ? "sector-draft" : "sector-archived";
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
      const titleCell = row.insertCell();
      const titleStrong = document.createElement("strong"); titleStrong.textContent = item.title;
      titleCell.append(titleStrong);
      if (item.applicationRef) {
        const refTag = document.createElement("small");
        refTag.className = "admin-case-reference";
        refTag.textContent = `Ref ${item.applicationRef}`;
        titleCell.append(refTag);
      }
      if (item.emailLastError || item.lastError) {
        const errTag = document.createElement("small");
        errTag.className = "admin-case-reference";
        errTag.textContent = item.emailLastError || item.lastError;
        titleCell.append(errTag);
      }
      row.insertCell().textContent = [item.channel || "In-app", item.category].filter(Boolean).join(" · ");
      const statusCell = row.insertCell();
      const statusText = item.emailStatus && item.emailStatus !== "Pending"
        ? `Email: ${item.emailStatus}${item.channel?.includes("Push") ? ` · Push: ${item.status}` : ""}`
        : item.status;
      statusCell.append(stageBadge(statusText));
      row.insertCell().textContent = item.emailSentAt || item.sentAt || item.when;
      const actCell = row.insertCell();
      const actionWrap = document.createElement("span");
      actionWrap.className = "admin-sector-actions";
      if (item.id && (["Queued", "Failed", "Open"].includes(item.status) || ["Queued", "Failed"].includes(item.emailStatus))) {
        const retryBtn = document.createElement("button");
        retryBtn.type = "button";
        retryBtn.textContent = "Retry";
        retryBtn.addEventListener("click", () => void run(async () => {
          const overview = await rpc("admin_retry_notification", { p_queue_id: item.id });
          invalidateCache("admin_notifications_overview", "admin_audit_feed");
          applyNotificationOverview(overview);
          kickNotificationDispatch(signupConfig, accountToken(), { queueId: item.id, mode: "retry" });
          announce("Notification queued for immediate retry dispatch.");
        }));
        actionWrap.append(retryBtn);
      } else {
        const button = document.createElement("button"); button.type = "button";
        button.textContent = item.action === "followup" ? "Inspect" : item.action === "security" ? "Security" : "Templates";
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
        actionWrap.append(button);
      }
      actCell.append(actionWrap);
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
      const button = document.createElement("button"); button.type = "button"; button.textContent = "Edit template";
      button.addEventListener("click", () => {
        const form = document.querySelector("[data-notification-form]");
        form.reset();
        form.elements.kind.value = tpl.kind || "Email template";
        if (form.elements.audience && tpl.audience) form.elements.audience.value = tpl.audience;
        if (form.elements.channel && tpl.channel) form.elements.channel.value = tpl.channel;
        form.elements.title.value = tpl.title;
        form.elements.message.value = tpl.message;
        openAdminDialog(document.querySelector("[data-notification-editor]"), "Update notification template", form.elements.message);
      });
      row.insertCell().append(button);
    }
  }
  const emailSum = notificationOverviewMeta.emailSummary;
  const fcmSum = notificationOverviewMeta.fcmSummary;
  const subSum = notificationOverviewMeta.subscriptionStats;
  const setText = (stat, value) => {
    const el = document.querySelector(`[data-notification-stat="${stat}"]`);
    if (el) el.textContent = String(value);
  };
  setText("email", emailSum ? `${emailSum.sentEmail ?? 0} sent` : `${notificationInbox.length} queued`);
  setText("email-detail", emailSum ? `${emailSum.queuedEmail ?? 0} queued · ${emailSum.failedEmail ?? 0} failed · ${emailSum.skippedEmail ?? 0} skipped` : "Live EmailJS / Resend outbox");
  setText("push", fcmSum ? `${fcmSum.activeDevices ?? 0} devices` : "0 devices");
  setText("push-detail", fcmSum ? `${fcmSum.queuedPush ?? 0} queued · ${fcmSum.sentPush ?? 0} sent` : "Mobile & browser FCM");
  setText("subscriptions", subSum ? `${subSum.activeSubscriptions ?? 0} active` : "All active");
  setText("subscriptions-detail", subSum ? `${subSum.feeLabel || "No charge (Free, P0.00)"} (${subSum.unsubscribedCount ?? 0} paused)` : "No charge (Free, P0.00)");
  setText("templates", notificationTemplates.length);
  setText("drafts", `${notificationDraftCount} saved in session`);
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

function syncRegulatoryEditorFields(form, item) {
  const isReg = form.elements.kind.value === "Regulatory contacts";
  const regBox = form.querySelector("[data-regulatory-fields]");
  if (regBox) regBox.hidden = !isReg;
  const cd = item?.contactDetails && typeof item.contactDetails === "object" ? item.contactDetails : {};
  if (form.elements.authorityCode) form.elements.authorityCode.value = item?.authorityCode || cd.authorityCode || "";
  if (form.elements.authorityPhone) form.elements.authorityPhone.value = cd.phone || "";
  if (form.elements.authorityEmail) form.elements.authorityEmail.value = cd.email || "";
  if (form.elements.authorityWebsite) form.elements.authorityWebsite.value = cd.website || item?.externalUrl || "";
  if (form.elements.authorityAddress) form.elements.authorityAddress.value = cd.address || "";
  if (form.elements.authorityScope) form.elements.authorityScope.value = cd.scope || "";
  const attachWrap = form.querySelector("[data-content-attachment-wrap]");
  const attachLabel = form.querySelector("[data-content-attachment-current]");
  if (form.elements.clearAttachment) form.elements.clearAttachment.checked = false;
  if (attachWrap && attachLabel) {
    if (item?.attachmentName && item?.attachmentPath) {
      const sizeKb = item.attachmentSize ? ` (${Math.max(1, Math.round(item.attachmentSize / 1024))} KB)` : "";
      attachLabel.textContent = `Current file: ${item.attachmentName}${sizeKb}`;
      attachWrap.hidden = false;
    } else {
      attachLabel.textContent = "";
      attachWrap.hidden = true;
    }
  }
}

document.querySelector('[data-content-form] select[name="kind"]')?.addEventListener("change", event => {
  const form = event.currentTarget.closest("form");
  const regBox = form?.querySelector("[data-regulatory-fields]");
  if (regBox) regBox.hidden = event.currentTarget.value !== "Regulatory contacts";
});

function renderGovernanceContent() {
  const active = document.querySelector('[data-content-type][aria-pressed="true"]')?.dataset.contentType || "All";
  const searchForm = document.querySelector("[data-content-search]");
  const query = (searchForm?.elements.query?.value || "").trim().toLowerCase();
  const stageFilter = searchForm?.elements.stage?.value || "";
  const items = governanceContent.filter(item => {
    const matchesStage = !stageFilter || item.stage === stageFilter || (stageFilter === "Published preview" && item.stage === "Published") || (stageFilter === "Tab draft" && item.stage === "Draft");
    return (active === "All" || item.kind === active) &&
      matchesStage &&
      (!query || [item.title, item.summary || "", item.kind, item.authorityCode || "", item.attachmentName || ""].some(v => String(v).toLowerCase().includes(query)));
  });
  for (const [key, value] of Object.entries({
    total: governanceContent.length,
    forms: governanceContent.filter(i => i.kind === "Application form" || i.kind === "Accompanying copies").length,
    guidance: governanceContent.filter(i => i.kind === "FAQs" || i.kind === "Regulatory contacts" || i.kind === "Public pages").length,
    drafts: governanceContent.filter(i => i.stage === "Draft" || i.stage === "Tab draft").length,
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
    const downloadUrl = item.attachmentPath && signupConfig?.url
      ? buildPortalDocumentPublicUrl(signupConfig.url, item.attachmentPath)
      : (/^https?:\/\//i.test(item.externalUrl || "") ? item.externalUrl : "");
    if (downloadUrl) {
      const link = document.createElement("a");
      link.className = "admin-attachment-link";
      link.href = downloadUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = item.attachmentName ? `Attachment: ${item.attachmentName}` : `Link: ${item.externalUrl}`;
      titleCell.append(link);
    }
    row.insertCell().textContent = item.kind;
    row.insertCell().textContent = item.audience || "Public website";
    row.insertCell().append(stageBadge(item.stage));
    row.insertCell().textContent = item.updated || "2026-11-23";
    const actionWrap = document.createElement("span");
    actionWrap.className = "admin-sector-actions";
    const editBtn = document.createElement("button"); editBtn.type = "button"; editBtn.textContent = "Edit / revise";
    editBtn.addEventListener("click", () => {
      editingContentId = item.id || null;
      editingContentItem = item;
      const form = document.querySelector("[data-content-form]");
      form.reset();
      form.elements.kind.value = item.kind;
      if (form.elements.stage) form.elements.stage.value = ["Draft", "Awaiting review", "Published", "Archived"].includes(item.stage) ? item.stage : "Published";
      form.elements.title.value = item.title;
      form.elements.body.value = item.body || item.summary || "";
      if (form.elements.externalUrl) form.elements.externalUrl.value = item.externalUrl || "";
      form.elements.reason.value = "";
      syncRegulatoryEditorFields(form, item);
      openAdminDialog(document.querySelector("[data-content-editor]"), "Edit portal content / upload", form.elements.title);
    });
    const deleteBtn = document.createElement("button"); deleteBtn.type = "button"; deleteBtn.textContent = "Delete";
    deleteBtn.setAttribute("aria-label", `Delete ${item.title}`);
    deleteBtn.addEventListener("click", () => {
      deletingContentItem = item;
      const targetEl = document.querySelector("[data-content-delete-target]");
      if (targetEl) targetEl.textContent = `${item.kind}: ${item.title}`;
      const deleteForm = document.querySelector("[data-content-delete-form]");
      if (deleteForm) deleteForm.reset();
      openAdminDialog(document.querySelector("[data-content-delete-panel]"), "Delete portal content", deleteForm?.elements.reason);
    });
    actionWrap.append(editBtn, deleteBtn);
    row.insertCell().append(actionWrap);
  }
  if (!items.length) {
    const cell = body.insertRow().insertCell(); cell.colSpan = 6;
    cell.textContent = "No content items match these filters.";
  }
  const categoryLabel = active === "All" ? "content" : active.toLowerCase();
  document.querySelector("[data-content-count]").textContent = `Showing ${items.length} of ${governanceContent.length} ${categoryLabel} item${items.length === 1 ? "" : "s"}`;
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
  editingContentId = null;
  editingContentItem = null;
  const form = document.querySelector("[data-content-form]");
  form.reset();
  const activeType = document.querySelector('[data-content-type][aria-pressed="true"]')?.dataset.contentType;
  form.elements.kind.value = activeType && activeType !== "All" ? activeType : "Application form";
  syncRegulatoryEditorFields(form, null);
  openAdminDialog(document.querySelector("[data-content-editor]"), "Create or upload portal content", form.elements.title);
});

document.querySelector("[data-open-form-builder]")?.addEventListener("click", () => {
  const section = document.querySelector("[data-form-builder-section]");
  section?.scrollIntoView({ behavior: "smooth", block: "start" });
  section?.querySelector('input[name="formTitle"]')?.focus();
});

document.querySelector("[data-content-delete-cancel]")?.addEventListener("click", () => {
  deletingContentItem = null;
  if (!busy) closeAdminDialog();
});

document.querySelector("[data-content-delete-form]")?.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity() || !deletingContentItem?.id) return;
  const itemToDelete = deletingContentItem;
  const reason = form.elements.reason.value.trim();
  void run(async () => {
    const records = await rpc("admin_delete_content", {
      content_id: itemToDelete.id,
      reason,
    });
    if (itemToDelete.attachmentPath) {
      await removePortalStorageObject(itemToDelete.attachmentPath);
    }
    invalidateCache("admin_content_list", "admin_audit_feed");
    if (Array.isArray(records)) {
      governanceContent.splice(0, governanceContent.length, ...records);
    }
    deletingContentItem = null;
    renderGovernanceContent();
    closeAdminDialog();
    void loadAudit();
    announce(`Deleted "${itemToDelete.title}" and recorded audit entry.`);
  });
});

document.querySelector("[data-content-form]").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  const kind = form.elements.kind.value;
  let bodyText = form.elements.body.value.trim();
  let contactDetails = null;
  let authorityCode = null;
  let externalUrl = form.elements.externalUrl?.value?.trim() || null;

  if (kind === "Regulatory contacts") {
    const regPayload = buildRegulatoryContactPayload({
      authorityCode: form.elements.authorityCode?.value,
      fullName: form.elements.title.value.trim(),
      phone: form.elements.authorityPhone?.value,
      email: form.elements.authorityEmail?.value,
      website: form.elements.authorityWebsite?.value || externalUrl || "",
      address: form.elements.authorityAddress?.value,
      scope: form.elements.authorityScope?.value,
    });
    contactDetails = regPayload.contactDetails;
    authorityCode = regPayload.contactDetails.authorityCode || null;
    if (!externalUrl && regPayload.contactDetails.website) {
      externalUrl = regPayload.contactDetails.website;
    }
    if (bodyText.length < 10 && regPayload.formattedBody.length >= 10) {
      bodyText = regPayload.formattedBody;
      form.elements.body.value = bodyText;
    }
  }

  if (!form.reportValidity()) return;
  const pickedFile = form.elements.documentFile?.files?.[0] || null;
  const clearAttachment = Boolean(form.elements.clearAttachment?.checked);

  void run(async () => {
    let attachment = null;
    if (pickedFile) {
      attachment = await uploadPortalContentDocument(pickedFile);
    }
    const selectedStage = form.elements.stage?.value || "Published";
    const records = await rpc("admin_save_content", {
      content_kind: kind,
      content_title: form.elements.title.value.trim(),
      content_body: bodyText,
      reason: form.elements.reason.value.trim(),
      content_id: editingContentId,
      content_stage: selectedStage,
      attachment_name: attachment ? attachment.attachmentName : null,
      attachment_mime: attachment ? attachment.attachmentMime : null,
      attachment_size: attachment ? attachment.attachmentSize : null,
      attachment_path: attachment ? attachment.attachmentPath : null,
      external_url: externalUrl,
      authority_code: authorityCode,
      contact_details: contactDetails,
      clear_attachment: clearAttachment,
    });
    if ((pickedFile || clearAttachment) && editingContentItem?.attachmentPath && (!attachment || editingContentItem.attachmentPath !== attachment.attachmentPath)) {
      await removePortalStorageObject(editingContentItem.attachmentPath);
    }
    invalidateCache("admin_content_list", "admin_audit_feed");
    if (Array.isArray(records)) {
      governanceContent.splice(0, governanceContent.length, ...records);
    }
    editingContentId = null;
    editingContentItem = null;
    renderGovernanceContent();
    closeAdminDialog();
    void loadAudit();
    announce(`Content saved (${selectedStage}) to database and recorded in the administrator audit log.`);
  });
});

let builderFormConfig = normalizeApplicationFormConfig(null);
let builderConfigVersion = 1;

function makeBuilderField(labelText, value, onChange, type = "text", options = {}) {
  const label = document.createElement("label");
  label.textContent = labelText;
  if (type === "checkbox") {
    label.className = "admin-check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(value);
    input.addEventListener("change", () => onChange(input.checked));
    label.prepend(input);
    return label;
  }
  if (type === "select") {
    const select = document.createElement("select");
    for (const opt of options.choices || []) {
      const o = document.createElement("option");
      o.value = String(opt.value);
      o.textContent = opt.label;
      select.append(o);
    }
    select.value = String(value ?? "");
    select.addEventListener("change", () => onChange(select.value));
    label.append(select);
    return label;
  }
  const input = document.createElement("input");
  input.type = type;
  input.value = String(value ?? "");
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.maxLength) input.maxLength = options.maxLength;
  if (options.min !== undefined) input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  input.addEventListener("input", () => onChange(type === "number" ? Number(input.value || 0) : input.value));
  label.append(input);
  return label;
}

function renderApplicationFormBuilder(version = builderConfigVersion) {
  builderConfigVersion = version || builderConfigVersion || 1;
  const form = document.querySelector("[data-form-config-form]");
  if (!form) return;
  const versionBadge = document.querySelector("[data-form-config-version]");
  if (versionBadge) versionBadge.textContent = `v${builderConfigVersion}`;

  if (form.elements.formTitle) form.elements.formTitle.value = builderFormConfig.formTitle;
  if (form.elements.formVersion) form.elements.formVersion.value = builderFormConfig.formVersion;
  if (form.elements.maxEvidenceFileMb) form.elements.maxEvidenceFileMb.value = String(builderFormConfig.maxEvidenceFileMb);
  if (form.elements.introGuidance) form.elements.introGuidance.value = builderFormConfig.introGuidance;
  if (form.elements.maxVideoUrlNote) form.elements.maxVideoUrlNote.value = builderFormConfig.maxVideoUrlNote;

  const stepsWrap = document.querySelector("[data-builder-steps]");
  if (stepsWrap) {
    stepsWrap.replaceChildren();
    for (const step of builderFormConfig.steps) {
      const row = document.createElement("div");
      row.className = "admin-builder-row";
      row.append(
        makeBuilderField(`Step ${step.stepNumber} enabled`, step.enabled, val => { step.enabled = val; }, "checkbox"),
        makeBuilderField(`Step ${step.stepNumber} title`, step.title, val => { step.title = val; }, "text", { maxLength: 100 }),
        makeBuilderField("Guidance description", step.description, val => { step.description = val; }, "text", { maxLength: 240 }),
      );
      stepsWrap.append(row);
    }
  }

  const docsWrap = document.querySelector("[data-builder-docs]");
  if (docsWrap) {
    docsWrap.replaceChildren();
    builderFormConfig.requiredDocuments.forEach((doc, idx) => {
      const row = document.createElement("div");
      row.className = "admin-builder-row";
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "admin-button-secondary";
      removeBtn.textContent = "Remove copy";
      removeBtn.addEventListener("click", () => {
        builderFormConfig.requiredDocuments.splice(idx, 1);
        renderApplicationFormBuilder();
      });
      row.append(
        makeBuilderField("Document label", doc.label, val => { doc.label = val; }, "text", { maxLength: 140 }),
        makeBuilderField("Category", doc.category, val => { doc.category = val; }, "text", { maxLength: 80 }),
        makeBuilderField("Applies to", doc.appliesTo, val => { doc.appliesTo = val; }, "text", { maxLength: 80 }),
        makeBuilderField("Accepted formats", doc.acceptedFormats, val => { doc.acceptedFormats = val; }, "text", { maxLength: 80 }),
        makeBuilderField("Max size (MB)", doc.maxSizeMb, val => { doc.maxSizeMb = val; }, "number", { min: 1, max: 50 }),
        makeBuilderField("Mandatory upload", doc.required, val => { doc.required = val; }, "checkbox"),
        makeBuilderField("Applicant guidance", doc.guidance, val => { doc.guidance = val; }, "text", { maxLength: 240 }),
        removeBtn,
      );
      docsWrap.append(row);
    });
  }

  const fieldsWrap = document.querySelector("[data-builder-fields]");
  if (fieldsWrap) {
    fieldsWrap.replaceChildren();
    if (!builderFormConfig.customFields.length) {
      const emptyNote = document.createElement("p");
      emptyNote.className = "admin-help";
      emptyNote.textContent = "No custom submission fields configured yet. Click \"Add custom field\" to add a question to any step.";
      fieldsWrap.append(emptyNote);
    }
    builderFormConfig.customFields.forEach((field, idx) => {
      const row = document.createElement("div");
      row.className = "admin-builder-row";
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "admin-button-secondary";
      removeBtn.textContent = "Remove field";
      removeBtn.addEventListener("click", () => {
        builderFormConfig.customFields.splice(idx, 1);
        renderApplicationFormBuilder();
      });
      row.append(
        makeBuilderField("Question label", field.label, val => { field.label = val; }, "text", { maxLength: 120 }),
        makeBuilderField("Step (1 to 10)", field.stepNumber, val => { field.stepNumber = Number(val); }, "select", {
          choices: Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: `Step ${i + 1}` })),
        }),
        makeBuilderField("Field type", field.fieldType, val => { field.fieldType = val; }, "select", {
          choices: [
            { value: "text", label: "Short text" },
            { value: "textarea", label: "Long text" },
            { value: "select", label: "Dropdown choices" },
            { value: "url", label: "HTTPS link" },
            { value: "checkbox", label: "Confirmation checkbox" },
          ],
        }),
        makeBuilderField("Dropdown options (comma separated)", (field.options || []).join(", "), val => {
          field.options = String(val).split(",").map(s => s.trim()).filter(Boolean);
        }, "text", { maxLength: 300, placeholder: "Option A, Option B" }),
        makeBuilderField("Help / hint text", field.helpText, val => { field.helpText = val; }, "text", { maxLength: 200 }),
        makeBuilderField("Mandatory", field.required, val => { field.required = val; }, "checkbox"),
        makeBuilderField("Active", field.enabled, val => { field.enabled = val; }, "checkbox"),
        removeBtn,
      );
      fieldsWrap.append(row);
    });
  }
}

document.querySelector("[data-builder-add-doc]")?.addEventListener("click", () => {
  builderFormConfig.requiredDocuments.push({
    id: `doc_${Date.now().toString(36)}`,
    label: "New accompanying document",
    category: "Supporting copies",
    required: false,
    appliesTo: "All applicants",
    maxSizeMb: 10,
    acceptedFormats: "PDF, DOCX",
    guidance: "Attach supporting copy.",
  });
  renderApplicationFormBuilder();
});

document.querySelector("[data-builder-add-field]")?.addEventListener("click", () => {
  builderFormConfig.customFields.push({
    id: `cf_${Date.now().toString(36)}`,
    key: `custom_${Date.now().toString(36)}`,
    label: "Additional submission question",
    stepNumber: 2,
    fieldType: "text",
    required: false,
    enabled: true,
    placeholder: "",
    helpText: "",
    options: [],
  });
  renderApplicationFormBuilder();
});

document.querySelector("[data-form-config-form]")?.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const reason = form.elements.reason.value.trim();
  const nextPayload = normalizeApplicationFormConfig({
    ...builderFormConfig,
    formTitle: form.elements.formTitle.value.trim(),
    formVersion: form.elements.formVersion.value.trim(),
    maxEvidenceFileMb: Number(form.elements.maxEvidenceFileMb.value || 15),
    introGuidance: form.elements.introGuidance.value.trim(),
    maxVideoUrlNote: form.elements.maxVideoUrlNote.value.trim(),
  });
  void run(async () => {
    const configs = await rpc("admin_save_configuration", {
      target_key: "application_form_config",
      new_payload: nextPayload,
      reason,
    });
    invalidateCache("admin_get_configurations", "admin_audit_feed");
    builderFormConfig = normalizeApplicationFormConfig(configs?.application_form_config?.payload || nextPayload);
    renderApplicationFormBuilder(configs?.application_form_config?.version || builderConfigVersion + 1);
    form.elements.reason.value = "";
    void loadAudit();
    announce("Application form configuration and accompanying copies checklist saved and audited.");
  });
});

renderApplicationFormBuilder();
document.querySelector("[data-notification-dispatch-now]")?.addEventListener("click", () => void run(async () => {
  const result = await dispatchQueuedNotifications(signupConfig, accountToken(), { mode: "drain", limit: 25 });
  invalidateCache("admin_notifications_overview");
  await loadNotifications();
  const emailMsg = result.email?.configured ? `${result.email.sent ?? 0} email(s) sent` : "email provider waiting secrets";
  const pushMsg = result.push?.configured ? `${result.push.sent ?? 0} push batch(es) sent` : "push waiting FCM secrets";
  document.querySelector("[data-notification-draft]").textContent = `Dispatch run complete: ${emailMsg}; ${pushMsg}.`;
  announce("Notification queue dispatch completed.");
}));

document.querySelector("[data-notification-test-email]")?.addEventListener("click", () => void run(async () => {
  const res = await rpc("admin_send_test_email", {});
  if (res?.overview) applyNotificationOverview(res.overview);
  const dispatch = await dispatchQueuedNotifications(signupConfig, accountToken(), { queueId: res?.queueId, mode: "retry", emailOnly: true });
  invalidateCache("admin_notifications_overview", "admin_audit_feed");
  await loadNotifications();
  document.querySelector("[data-notification-draft]").textContent = dispatch.email?.configured
    ? `Test email dispatched (${dispatch.email.sent ?? 0} sent, ${dispatch.email.failed ?? 0} failed).`
    : "Test email queued in database (configure RESEND_API_KEY or EMAILJS_* secrets to send live email).";
  void loadAudit();
  announce("Test email processed.");
}));

document.querySelector("[data-notification-test-push]")?.addEventListener("click", () => void run(async () => {
  const res = await rpc("admin_send_test_push", {});
  if (res?.overview) applyNotificationOverview(res.overview);
  const dispatch = await dispatchQueuedNotifications(signupConfig, accountToken(), { queueId: res?.queueId, mode: "retry", pushOnly: true });
  invalidateCache("admin_notifications_overview", "admin_audit_feed");
  await loadNotifications();
  document.querySelector("[data-notification-draft]").textContent = dispatch.push?.configured
    ? `Test push dispatched (${dispatch.push.sent ?? 0} sent, ${dispatch.push.failed ?? 0} failed).`
    : "Test push queued in database (configure FCM secrets to deliver live push).";
  void loadAudit();
  announce("Test push processed.");
}));

for (const button of document.querySelectorAll("[data-notification-open]")) button.addEventListener("click", () => {
  const form = document.querySelector("[data-notification-form]");
  form.reset();
  form.elements.kind.value = button.dataset.notificationOpen === "template" ? "Email template" : "Announcement";
  openAdminDialog(document.querySelector("[data-notification-editor]"), "Prepare notification", form.elements.title);
});
document.querySelector("[data-notification-form]").addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const kind = form.elements.kind.value;
  const audience = form.elements.audience?.value || (kind === "Announcement" ? "All visitors" : "Innovator");
  const channel = form.elements.channel?.value || (kind === "Push template" ? "Push" : "In-app + Email + Push");
  const title = form.elements.title.value.trim();
  const message = form.elements.message.value.trim();
  void run(async () => {
    const overview = await rpc("admin_save_notification_with_target", {
      entry_kind: kind,
      entry_title: title,
      entry_message: message,
      reason: "Saved via Admin Notification Center",
      entry_audience: audience,
      entry_channel: channel,
    });
    invalidateCache("admin_notifications_overview", "admin_audit_feed");
    notificationDraftCount++;
    applyNotificationOverview(overview);
    if (kind === "Announcement") {
      kickNotificationDispatch(signupConfig, accountToken());
    }
    document.querySelector("[data-notification-draft]").textContent = `${kind} saved to database queue (${audience} · ${channel}): "${title}". Audited in administrator log.`;
    openAdminDialog(document.querySelector("[data-notification-center]"), "Notifications");
    void loadAudit();
    announce("Notification saved to database and recorded in the administrator audit log.");
  });
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
document.querySelector("[data-audit-refresh]")?.addEventListener("click", () => {
  invalidateCache("admin_audit_feed");
  void loadAudit();
});

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
  const reason = form.elements.reason.value.trim();
  void run(async () => {
    const configs = await rpc("admin_save_configuration", {
      target_key: "portal_policies",
      new_payload: { area, proposal },
      reason,
    });
    invalidateCache("admin_get_configurations", "admin_audit_feed");
    const ver = configs?.portal_policies?.version || 1;
    document.querySelector("[data-settings-draft-status]").textContent = `Policy configuration v${ver} saved to database: ${area}: "${proposal}".`;
    form.reset();
    void loadAudit();
    announce("Portal policy configuration saved and recorded in the administrator audit log.");
  });
});

let criteriaServerVersion = 1;
let criteriaPassThreshold = 60;
let criteriaDraft = defaultAssessmentRubric.map(item => ({ ...item, persisted: true }));
let criteriaHistory = [];

function updateCriteriaAllocationSummary() {
  const check = validateRubricDraft(criteriaDraft, criteriaPassThreshold);
  const labelNode = document.querySelector("[data-criteria-total-label]");
  const badgeNode = document.querySelector("[data-criteria-balance-badge]");
  const meterNode = document.querySelector("[data-criteria-total-meter]");
  const saveButton = document.querySelector("[data-criteria-save]");
  const versionBadge = document.querySelector("[data-criteria-version-badge]");
  const statTitle = document.querySelector("[data-admin-stat-criteria]");
  const statSub = document.querySelector("[data-admin-stat-criteria-sub]");
  if (labelNode) labelNode.textContent = `${check.totalWeight.toFixed(0)}% / 100%`;
  if (meterNode) {
    meterNode.value = Math.min(100, Math.max(0, check.totalWeight));
    meterNode.classList.toggle("is-balanced", check.totalWeight === 100);
    meterNode.classList.toggle("is-over", check.totalWeight > 100);
    meterNode.classList.toggle("is-under", check.totalWeight < 100);
  }
  if (badgeNode) {
    badgeNode.classList.remove("is-balanced", "is-over", "is-under");
    if (Math.round(check.totalWeight * 100) === 10000) {
      badgeNode.classList.add("is-balanced");
      badgeNode.textContent = `Balanced (100% across ${check.activeCount} active)`;
    } else if (check.totalWeight > 100) {
      badgeNode.classList.add("is-over");
      badgeNode.textContent = `Over by ${(check.totalWeight - 100).toFixed(2)}%`;
    } else {
      badgeNode.classList.add("is-under");
      badgeNode.textContent = `${check.remainingWeight.toFixed(2)}% remaining to allocate`;
    }
  }
  if (versionBadge) versionBadge.textContent = `v${criteriaServerVersion} active · ${Number(criteriaPassThreshold).toFixed(0)}% pass`;
  if (statTitle) statTitle.textContent = `${check.activeCount} ${check.activeCount === 1 ? "criterion" : "criteria"}`;
  if (statSub) statSub.textContent = `Weighted 100% · ${Number(criteriaPassThreshold).toFixed(0)}% pass · v${criteriaServerVersion}`;
  if (saveButton) saveButton.disabled = !check.valid;
  return check;
}

function renderCriteriaHistory() {
  const host = document.querySelector("[data-criteria-history]");
  if (!host) return;
  if (!criteriaHistory.length) {
    const empty = document.createElement("p");
    empty.className = "admin-help";
    empty.textContent = "Baseline rubric version v1 is active.";
    host.replaceChildren(empty);
    return;
  }
  const nodes = criteriaHistory.map((entry) => {
    const card = document.createElement("article");
    card.className = "admin-criteria-history-item";
    const head = document.createElement("div");
    head.className = "admin-criteria-history-head";
    const title = document.createElement("strong");
    title.textContent = `Rubric v${entry.version} · ${entry.criteriaCount ?? (entry.criteria?.length || 0)} criteria · ${Number(entry.passThreshold ?? 60).toFixed(0)}% pass`;
    const date = document.createElement("span");
    date.textContent = entry.createdAt || "";
    head.append(title, date);
    const reason = document.createElement("p");
    reason.className = "admin-criteria-history-reason";
    reason.textContent = entry.reason || "";
    const pills = document.createElement("div");
    pills.className = "admin-criteria-history-pills";
    for (const item of Array.isArray(entry.criteria) ? entry.criteria : []) {
      const pill = document.createElement("span");
      pill.className = "admin-criteria-history-pill";
      pill.textContent = `${item.label || item.key} (${Number(item.weight || 0)}%)`;
      pills.append(pill);
    }
    card.append(head, reason, pills);
    return card;
  });
  host.replaceChildren(...nodes);
}

function renderCriteriaEditor() {
  const list = document.querySelector("[data-criteria-list]");
  const thresholdInput = document.querySelector("[data-criteria-threshold]");
  if (thresholdInput) thresholdInput.value = String(criteriaPassThreshold);
  if (!list) {
    updateCriteriaAllocationSummary();
    renderCriteriaHistory();
    return;
  }
  const cards = criteriaDraft.map((item, idx) => {
    const row = document.createElement("article");
    row.className = "admin-criteria-card" + (item.active === false ? " is-archived" : "");

    const head = document.createElement("div");
    head.className = "admin-criteria-card-head";
    const orderBadge = document.createElement("span");
    orderBadge.className = "admin-criteria-order";
    orderBadge.textContent = item.active === false ? "Archived" : `#${idx + 1}`;
    const keyTag = document.createElement("code");
    keyTag.className = "admin-criteria-key";
    keyTag.textContent = item.key || slugifyCriterionKey(item.label, idx + 1);

    const actions = document.createElement("div");
    actions.className = "admin-criteria-card-actions";
    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "admin-button-secondary admin-criteria-mini-btn";
    upBtn.textContent = "Up";
    upBtn.disabled = idx === 0;
    upBtn.addEventListener("click", () => {
      if (idx === 0) return;
      [criteriaDraft[idx - 1], criteriaDraft[idx]] = [criteriaDraft[idx], criteriaDraft[idx - 1]];
      renderCriteriaEditor();
    });
    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "admin-button-secondary admin-criteria-mini-btn";
    downBtn.textContent = "Down";
    downBtn.disabled = idx === criteriaDraft.length - 1;
    downBtn.addEventListener("click", () => {
      if (idx >= criteriaDraft.length - 1) return;
      [criteriaDraft[idx + 1], criteriaDraft[idx]] = [criteriaDraft[idx], criteriaDraft[idx + 1]];
      renderCriteriaEditor();
    });
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "admin-button-secondary admin-criteria-mini-btn";
    toggleBtn.textContent = item.active === false ? "Restore" : item.persisted ? "Archive" : "Remove";
    toggleBtn.addEventListener("click", () => {
      if (item.active !== false && !item.persisted && criteriaDraft.length > 1) {
        criteriaDraft.splice(idx, 1);
      } else {
        criteriaDraft[idx].active = item.active === false;
      }
      renderCriteriaEditor();
    });
    actions.append(upBtn, downBtn, toggleBtn);
    head.append(orderBadge, keyTag, actions);

    const fields = document.createElement("div");
    fields.className = "admin-criteria-fields";

    const labelWrap = document.createElement("label");
    labelWrap.textContent = "Criterion name";
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.required = true;
    labelInput.minLength = 2;
    labelInput.maxLength = 140;
    labelInput.value = item.label || "";
    labelInput.placeholder = "e.g., Commercial readiness";
    labelInput.addEventListener("input", () => {
      item.label = labelInput.value;
      if (!item.persisted) {
        item.key = slugifyCriterionKey(labelInput.value, idx + 1);
        keyTag.textContent = item.key;
      }
      updateCriteriaAllocationSummary();
    });
    labelWrap.append(labelInput);

    const weightWrap = document.createElement("label");
    weightWrap.textContent = "Weight (%)";
    const weightInput = document.createElement("input");
    weightInput.type = "number";
    weightInput.required = true;
    weightInput.min = "0.5";
    weightInput.max = "100";
    weightInput.step = "0.5";
    weightInput.value = String(item.weight ?? "");
    const itemMeter = document.createElement("progress");
    itemMeter.className = "admin-criteria-item-meter";
    itemMeter.max = 100;
    itemMeter.value = Math.min(100, Math.max(0, Number(item.weight) || 0));
    weightInput.addEventListener("input", () => {
      const val = Number(weightInput.value);
      item.weight = Number.isFinite(val) ? val : 0;
      itemMeter.value = Math.min(100, Math.max(0, item.weight));
      updateCriteriaAllocationSummary();
    });
    weightWrap.append(weightInput, itemMeter);

    const descWrap = document.createElement("label");
    descWrap.className = "admin-form-wide";
    descWrap.textContent = "Assessor scoring guidance";
    const descInput = document.createElement("textarea");
    descInput.rows = 2;
    descInput.maxLength = 600;
    descInput.value = item.description || "";
    descInput.placeholder = "Explain what evidence justifies scores 1 through 5.";
    descInput.addEventListener("input", () => {
      item.description = descInput.value;
    });
    descWrap.append(descInput);

    fields.append(labelWrap, weightWrap, descWrap);
    row.append(head, fields);
    return row;
  });
  list.replaceChildren(...cards);
  updateCriteriaAllocationSummary();
  renderCriteriaHistory();
}

function applyCriteriaServerPayload(payload) {
  if (!payload || !Array.isArray(payload.criteria)) return;
  criteriaServerVersion = Number(payload.version || 1);
  criteriaPassThreshold = Number(payload.passThreshold ?? 60);
  criteriaDraft = payload.criteria.map((item, idx) => ({
    key: item.key,
    label: item.label,
    description: item.description || "",
    weight: Number(item.weight || 0),
    sortOrder: Number(item.sortOrder || idx + 1),
    active: item.active !== false,
    persisted: true,
  }));
  criteriaHistory = Array.isArray(payload.history) ? payload.history : [];
  renderCriteriaEditor();
}

document.querySelector("[data-criteria-threshold]")?.addEventListener("input", (event) => {
  const val = Number(event.currentTarget.value);
  criteriaPassThreshold = Number.isFinite(val) ? val : 60;
  updateCriteriaAllocationSummary();
});

document.querySelector("[data-criteria-add]")?.addEventListener("click", () => {
  const check = validateRubricDraft(criteriaDraft, criteriaPassThreshold);
  const suggested = Math.max(5, Math.min(25, Math.round((check.remainingWeight > 0 ? check.remainingWeight : 10) * 100) / 100));
  const index = criteriaDraft.length + 1;
  criteriaDraft.push({
    key: `criterion-${index}`,
    label: "",
    description: "",
    weight: suggested,
    sortOrder: index,
    active: true,
    persisted: false,
  });
  renderCriteriaEditor();
  document.querySelector("[data-criteria-list]")?.lastElementChild?.querySelector("input")?.focus();
});

document.querySelector("[data-criteria-equalize]")?.addEventListener("click", () => {
  criteriaDraft = distributeWeightsEqually(criteriaDraft);
  renderCriteriaEditor();
  const statusEl = document.querySelector("[data-criteria-status]");
  if (statusEl) statusEl.textContent = "Balanced active criterion weights to total 100%. Enter a reason and save.";
});

document.querySelector("[data-criteria-reset]")?.addEventListener("click", () => {
  const baselineKeys = new Set(defaultAssessmentRubric.map(item => item.key));
  const archivedOthers = criteriaDraft
    .filter(item => item.persisted && !baselineKeys.has(item.key))
    .map(item => ({ ...item, active: false }));
  criteriaDraft = [
    ...defaultAssessmentRubric.map(item => ({ ...item, persisted: true })),
    ...archivedOthers,
  ];
  criteriaPassThreshold = 60;
  renderCriteriaEditor();
  const statusEl = document.querySelector("[data-criteria-status]");
  if (statusEl) statusEl.textContent = "Loaded baseline 6 criteria (100% total) into draft. Save to publish a new rubric version.";
});

for (const chip of document.querySelectorAll("[data-criteria-starter]")) {
  chip.addEventListener("click", () => {
    const label = chip.dataset.criteriaStarter || "";
    const description = chip.dataset.criteriaStarterDesc || "";
    const suggestedWeight = Number(chip.dataset.criteriaStarterWeight || 10);
    const key = slugifyCriterionKey(label, criteriaDraft.length + 1);
    const existing = criteriaDraft.find(item => item.key === key);
    if (existing) {
      existing.active = true;
      if (!existing.description) existing.description = description;
    } else {
      criteriaDraft.push({
        key,
        label,
        description,
        weight: suggestedWeight,
        sortOrder: criteriaDraft.length + 1,
        active: true,
        persisted: false,
      });
    }
    renderCriteriaEditor();
  });
}

document.querySelector("[data-criteria-form]")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const check = validateRubricDraft(criteriaDraft, criteriaPassThreshold);
  const statusEl = document.querySelector("[data-criteria-status]");
  if (!check.valid) {
    if (statusEl) statusEl.textContent = check.errors[0];
    return;
  }
  const reason = form.elements.reason.value.trim();
  if (reason.length < 5) {
    if (statusEl) statusEl.textContent = "Enter an audit reason (at least 5 characters) before saving.";
    form.elements.reason.focus();
    return;
  }
  void run(async () => {
    const saved = await rpc("admin_save_assessment_criteria", {
      p_criteria: check.normalized,
      p_reason: reason,
      p_pass_threshold: check.passThreshold,
    });
    invalidateCache("admin_assessment_criteria_get", "admin_audit_feed", "admin_get_configurations");
    applyCriteriaServerPayload(saved);
    form.elements.reason.value = "";
    if (statusEl) statusEl.textContent = `Published rubric v${criteriaServerVersion} (${check.activeCount} criteria, 100% total, ${check.passThreshold}% pass threshold).`;
    void loadAudit();
    announce(`Saved evaluation rubric v${criteriaServerVersion} and logged administrator audit entry.`);
  });
});

renderCriteriaEditor();

let auditPage = 0;
let auditCanNext = false;
async function loadAudit() {
  const status = document.querySelector("[data-audit-state]");
  const body = document.querySelector("[data-audit-rows]");
  const stat = document.querySelector('[data-audit-stat="protected"]');
  status.textContent = "Loading protected audit records.";
  try {
    const queryText = document.querySelector('[data-audit-search] input[name="query"]').value.trim();
    const userFilter = document.querySelector('[data-audit-search] select[name="user"]')?.value?.trim() || "";
    const effectiveSearch = [userFilter, queryText].filter(Boolean).join(" ").trim();
    const records = await rpc("admin_audit_feed", { search_text: effectiveSearch, page_number: auditPage });
    if (!Array.isArray(records)) throw new Error("Invalid audit response");
    const visibleRecords = userFilter
      ? records.filter(item => String(item.actor || "").toLowerCase() === userFilter.toLowerCase())
      : records;
    body.replaceChildren();
    for (const item of visibleRecords) {
      const row = body.insertRow();
      for (const value of [new Intl.DateTimeFormat("en-BW", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Gaborone" }).format(new Date(item.created_at)), item.actor, item.action, item.target, item.reason || "Recorded in audit log"]) row.insertCell().textContent = value;
    }
    if (!visibleRecords.length) { const cell = body.insertRow().insertCell(); cell.colSpan = 5; cell.textContent = auditPage ? "No more audit entries." : "No audit entries match this search."; }
    status.textContent = userFilter
      ? `Showing ${visibleRecords.length} protected audit entries for ${userFilter} on page ${auditPage + 1}.`
      : `Showing ${visibleRecords.length} protected audit entries on page ${auditPage + 1}.`;
    if (stat) stat.textContent = String(visibleRecords.length);
    document.querySelector("[data-audit-page]").textContent = `Page ${auditPage + 1}`;
    document.querySelector("[data-audit-previous]").disabled = auditPage === 0;
    auditCanNext = records.length === 25;
    document.querySelector("[data-audit-next]").disabled = !auditCanNext;
    overviewController?.syncAuditRecords?.(records, directoryUsers);
  } catch {
    body.replaceChildren();
    const cell = body.insertRow().insertCell(); cell.colSpan = 5;
    cell.textContent = "Protected audit feed unavailable. Check your administrator session, then search again.";
    status.textContent = "Audit entries could not load. Check your administrator session and search again.";
    if (stat) stat.textContent = "N/A";
    auditCanNext = false;
    document.querySelector("[data-audit-next]").disabled = true;
    overviewController?.syncAuditRecords?.([], directoryUsers);
  }
}
document.querySelector("[data-audit-search]").addEventListener("submit", event => { event.preventDefault(); auditPage = 0; void loadAudit(); });
document.querySelector('[data-audit-search] select[name="user"]')?.addEventListener("change", () => { auditPage = 0; void loadAudit(); });
document.querySelector("[data-audit-previous]").addEventListener("click", () => { if (auditPage) { auditPage--; void loadAudit(); } });
document.querySelector("[data-audit-next]").addEventListener("click", () => { auditPage++; void loadAudit(); });

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
    if (/Multi-factor|authenticator verification/i.test(message)) throw new Error("Complete authenticator verification in Account & settings, then try creating the user again.");
    if (response.status === 401) throw new Error("Your session expired. Sign in again.");
    if (response.status === 404 && path === "/functions/v1/admincreate") throw new Error("Password-based account creation has not been deployed yet. Contact the project maintainer.");
    if (response.status === 403) throw new Error("You do not have access to this action.");
    if (/Account already exists/.test(message)) throw new Error("This email already has an account. Use the user directory to update its access.");
    if (/invitation was reserved|Invitation could not be prepared/.test(message)) throw new Error(message);
    if (response.status === 409 || /duplicate key/.test(message)) throw new Error("This record already exists. Refresh and check the current entries.");
    if (message) throw new Error(message);
    throw new Error("The action could not be completed. Check the values and try again.");
  }
  return data;
}
const rpc = (name, body = {}) => request("/rest/v1/rpc/" + name, body).then(res => {
  if (["admin_intervene_application", "admin_confer_award", "admin_correct_application"].includes(name)) {
    kickNotificationDispatch(signupConfig, accountToken());
  }
  return res;
});
async function cachedRpc(name, body = {}, ttlMs = 30000) {
  const key = name + ":" + JSON.stringify(body);
  const hit = getCached(key);
  if (hit !== undefined) return hit;
  const fresh = await rpc(name, body);
  return setCached(key, fresh, ttlMs);
}

async function createSignedEvidenceUrl(storagePath) {
  const encodedPath = String(storagePath || "").split("/").map(seg => encodeURIComponent(seg)).join("/");
  const res = await request(`/storage/v1/object/sign/innovation-evidence/${encodedPath}`, { expiresIn: 120 });
  const signed = res?.signedURL || res?.signedUrl;
  if (!signed) throw new Error("Unable to create a signed link for this file.");
  return signed.startsWith("http") ? signed : new URL(`/storage/v1${signed.startsWith("/") ? signed : `/${signed}`}`, signupConfig.url).href;
}

async function uploadPortalContentDocument(file) {
  const validation = validatePortalDocumentFile(file);
  if (!validation.valid) throw new Error(validation.message);
  const token = accountToken();
  if (!signupConfig || !token) throw new Error("Sign in to continue.");
  const storagePath = makePortalDocumentStoragePath(file.name);
  const encodedPath = storagePath.split("/").map(seg => encodeURIComponent(seg)).join("/");
  const response = await fetch(new URL(`/storage/v1/object/${PORTAL_DOCUMENTS_BUCKET}/${encodedPath}`, signupConfig.url), {
    method: "POST",
    headers: {
      apikey: signupConfig.key,
      Authorization: `Bearer ${token}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true",
    },
    body: file,
    cache: "no-store",
    credentials: "omit",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null);
    throw new Error(err?.message || err?.error || "Could not upload portal document.");
  }
  return {
    attachmentName: file.name,
    attachmentMime: file.type || "application/octet-stream",
    attachmentSize: Number(file.size || 0),
    attachmentPath: storagePath,
  };
}

async function removePortalStorageObject(storagePath) {
  const token = accountToken();
  if (!signupConfig || !token || !storagePath || String(storagePath).includes("..")) return;
  const encodedPath = String(storagePath).split("/").map(seg => encodeURIComponent(seg)).join("/");
  await fetch(new URL(`/storage/v1/object/${PORTAL_DOCUMENTS_BUCKET}/${encodedPath}`, signupConfig.url), {
    method: "DELETE",
    headers: { apikey: signupConfig.key, Authorization: `Bearer ${token}` },
    cache: "no-store",
    credentials: "omit",
  }).catch(() => {});
}

async function onChildMutationSaved() {
  invalidateCache("admin_applications", "admin_sectors", "admin_matters_list", "admin_notifications_overview", "admin_audit_feed");
  await Promise.allSettled([loadSectors(), loadApplications(), loadMatters(), loadNotifications(), loadAudit()]);
}
const operationsController = initializeOperations(openAdminDialog, rpc, onChildMutationSaved, createSignedEvidenceUrl);
const overviewController = initializeOverview(openAdminDialog, applications, rpc, onChildMutationSaved);

adminDialog.addEventListener("cancel", event => { event.preventDefault(); if (!busy) closeAdminDialog(); });
adminDialog.addEventListener("close", () => { if (!adminDialog.open && dialogPanel) closeAdminDialog(); });
for (const button of document.querySelectorAll("[data-open-security]")) {
  button.addEventListener("click", () => {
    openAdminDialog(document.querySelector("[data-security-panel]"), "Authenticator verification");
  });
}
const aiDraft = { tone: "Clear and professional", length: "Balanced", instructions: "", handoff: "", source: "", notes: "", questions: "" };
function syncAiForms() {
  const guidanceForm = document.querySelector("[data-ai-guidance-form]");
  if (guidanceForm) {
    for (const key of ["tone", "length", "instructions", "handoff"]) {
      const control = guidanceForm.elements.namedItem(key);
      if (control && aiDraft[key]) control.value = aiDraft[key];
    }
  }
  const knowledgeForm = document.querySelector("[data-ai-knowledge-form]");
  if (knowledgeForm) {
    for (const key of ["source", "notes", "questions"]) {
      const control = knowledgeForm.elements.namedItem(key);
      if (control && aiDraft[key]) control.value = aiDraft[key];
    }
  }
}
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
  else syncAiForms();
  openAdminDialog(panel, panel.querySelector("h3").textContent);
});
for (const [selector, configKey, fields] of [
  ["[data-ai-guidance-form]", "optimus_guidance", ["tone","length","instructions","handoff"]],
  ["[data-ai-knowledge-form]", "optimus_knowledge", ["source","notes","questions"]],
]) {
  document.querySelector(selector).addEventListener("submit", event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const payload = {};
    for (const key of fields) {
      const val = form.elements.namedItem(key).value.trim();
      aiDraft[key] = val;
      payload[key] = val;
    }
    void run(async () => {
      await rpc("admin_save_configuration", {
        target_key: configKey,
        new_payload: payload,
        reason: `Updated ${configKey.replace("_", " ")} via Optimus Prime workspace`,
      });
      invalidateCache("admin_get_configurations", "admin_audit_feed");
      closeAdminDialog();
      void loadAudit();
      announce("Optimus Prime configuration saved to database and recorded in the administrator audit log.");
    });
  });
}
const sectionLinks = [...document.querySelectorAll('.admin-sidebar nav a[href^="#"]')];
const sectionAliases = {
  activity: { id: "audit", onEnter: () => selectAuditTab("activity") },
  account: { id: "settings", onEnter: () => selectSettingsTab("profile") },
  security: { id: "settings", onEnter: () => selectSettingsTab("security") },
  criteria: { id: "settings", onEnter: () => selectSettingsTab("criteria") },
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

async function run(action) {
  if (busy) return;
  busy = true;
  workspace.querySelectorAll("button").forEach(button => { button.disabled = true; });
  try { await action(); }
  catch (error) { announce(error?.message || "Could not verify administrator access. Reload to retry."); }
  finally {
    busy = false;
    workspace.querySelectorAll("button").forEach(button => { button.disabled = false; });
    const auditPrev = document.querySelector("[data-audit-previous]");
    const auditNext = document.querySelector("[data-audit-next]");
    const dirPrev = document.querySelector("[data-previous]");
    const dirNext = document.querySelector("[data-next]");
    if (auditPrev) auditPrev.disabled = auditPage === 0;
    if (auditNext) auditNext.disabled = !auditCanNext;
    if (dirPrev) dirPrev.disabled = page === 0;
    if (dirNext) dirNext.disabled = directoryUsers.length < 25;
  }
}
function appendCell(row, text) {
  const cell = row.insertCell();
  cell.textContent = text;
  return cell;
}
async function loadUsers() {
  directoryUsers = await cachedRpc("admin_directory", { search_text: search, page_number: page }, 15000);
  overviewController?.syncAuditRecords?.(undefined, directoryUsers);
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
    if (["admin", "assessor", "support", "committee", "innovator"].includes(user.account_role)) {
      roleBadge.classList.add("admin-role-" + user.account_role);
    }
    roleBadge.textContent = ({admin:"Administrator",assessor:"Assessor",support:"Support Officer",committee:"Committee",innovator:"Innovator"}[user.account_role] || "Unknown");
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
    const actionsWrap = document.createElement("span");
    actionsWrap.className = "admin-sector-actions";
    const activityBtn = document.createElement("button");
    activityBtn.type = "button";
    activityBtn.textContent = "Activity log";
    activityBtn.setAttribute("aria-label", "View portal activity log for " + (user.full_name || "user"));
    activityBtn.addEventListener("click", () => {
      overviewController?.filterBySpecificUser?.(user.full_name || user.email || "User");
    });
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
    actionsWrap.append(activityBtn, button);
    appendCell(row, "").append(actionsWrap);
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
  const sectors = await cachedRpc("admin_sectors");
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
async function loadApplications() {
  const records = await cachedRpc("admin_applications");
  if (Array.isArray(records)) {
    operationsController.replaceApplications(records);
  }
}
async function loadMatters() {
  const records = await cachedRpc("admin_matters_list");
  if (Array.isArray(records)) {
    overviewController.replaceMatters(records);
  }
}
async function loadReportingSummary(periodDays = 7) {
  await overviewController?.loadReportingSummary?.(periodDays);
}
async function loadContent() {
  const records = await cachedRpc("admin_content_list");
  if (Array.isArray(records)) {
    governanceContent.splice(0, governanceContent.length, ...records);
    renderGovernanceContent();
  }
}
async function loadNotifications() {
  const data = await cachedRpc("admin_notifications_overview");
  applyNotificationOverview(data);
}
async function loadConfigurations() {
  const [configs, optimusStats, criteriaPayload] = await Promise.all([
    cachedRpc("admin_get_configurations"),
    cachedRpc("admin_optimus_overview").catch(() => null),
    cachedRpc("admin_assessment_criteria_get").catch(() => null),
  ]);
  if (criteriaPayload) {
    applyCriteriaServerPayload(criteriaPayload);
  }
  if (configs) {
    if (configs.optimus_guidance?.payload) {
      Object.assign(aiDraft, configs.optimus_guidance.payload);
    }
    if (configs.optimus_knowledge?.payload) {
      Object.assign(aiDraft, configs.optimus_knowledge.payload);
    }
    syncAiForms();
    if (configs.portal_policies?.payload) {
      const p = configs.portal_policies.payload;
      const ver = configs.portal_policies.version || 1;
      const statusNode = document.querySelector("[data-settings-draft-status]");
      if (statusNode && p.area && p.proposal) {
        statusNode.textContent = `Active database policy v${ver}: ${p.area}: "${p.proposal}".`;
      }
    }
    if (configs.application_form_config?.payload) {
      builderFormConfig = normalizeApplicationFormConfig(configs.application_form_config.payload);
      renderApplicationFormBuilder(configs.application_form_config.version || 1);
    }
  }
  if (optimusStats) {
    for (const [k, v] of [["total", optimusStats.totalInteractions ?? 0], ["helpful", optimusStats.helpfulCount ?? 0], ["escalated", optimusStats.escalatedCount ?? 0]]) {
      const node = document.querySelector(`[data-ai-stat="${k}"]`);
      if (node) node.textContent = String(v);
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
    for (const key of ["applications_count", "approved_count", "in_review_count", "rejected_count"]) {
      const val = sector[key];
      appendCell(row, val !== undefined && val !== null ? String(val) : "0");
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
  const outcomeNodes = document.querySelectorAll(".admin-sector-outcomes strong");
  const counts = [sector.applications_count ?? 0, sector.approved_count ?? 0, sector.in_review_count ?? 0, sector.rejected_count ?? 0];
  outcomeNodes.forEach((node, idx) => {
    node.textContent = String(counts[idx] ?? 0);
    node.removeAttribute("aria-label");
  });
  const sectorAppsBox = document.querySelector(".admin-sector-applications p");
  if (sectorAppsBox) {
    const matching = applications.filter(a => a.sector.toLowerCase() === sector.name.toLowerCase());
    sectorAppsBox.textContent = matching.length
      ? matching.map(a => `${a.id}: ${a.title} (${a.status})`).join(" · ")
      : "No applications submitted in this sector yet.";
  }
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
  const newRole = form.elements.role.value;
  return {
    new_role: newRole,
    lead: newRole === "assessor" && form.elements.lead.checked,
    sectors: ["assessor", "committee"].includes(newRole)
      ? [...form.elements.sectors.selectedOptions].map(option => option.value)
      : [],
    reason: form.elements.reason.value.trim(),
  };
}
document.querySelector("[data-user-search]").addEventListener("submit", event => {
  event.preventDefault(); search = event.target.elements.search.value.trim(); page = 0;
  invalidateCache("admin_directory");
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
    invalidateCache("admin_sectors", "admin_audit_feed");
    await loadSectors(); closeAdminDialog(); void loadAudit(); announce("Sector saved and audited.");
  });
});
document.querySelector("[data-role-form]").addEventListener("submit", event => {
  event.preventDefault(); const form = event.target;
  void run(async () => {
    await rpc("admin_assign_role", { target_id: editing, ...accessValues(form) });
    invalidateCache("admin_directory", "admin_audit_feed");
    closeAdminDialog(); await loadUsers(); void loadAudit(); announce("Access updated and audited.");
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
    if (new TextEncoder().encode(password).length > 72 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9\s]/.test(password)) { announce("Use 12-72 UTF-8 bytes with uppercase, lowercase, a number and a symbol in the password."); return; }
  void run(async () => {
    try {
      const result = await request("/functions/v1/admincreate", { address: form.elements.email.value.trim(), display_name: form.elements.fullName.value.trim(), password, admin_code: form.elements.adminCode.value.trim(), ...accessValues(form) });
      if (result?.status !== "created") throw new Error("Account creation was not confirmed. Check the directory before retrying.");
      invalidateCache("admin_directory", "admin_audit_feed");
      form.reset(); closeAdminDialog(); await loadUsers(); void loadAudit(); announce("User account created. The user can sign in with the password you supplied.");
    } finally { form.elements.password.value = ""; form.elements.adminCode.value = ""; }
  });
});
document.querySelector("[data-enroll-factor]").addEventListener("click", () => void run(async () => {
  const user = await request("/auth/v1/user", undefined, "GET");
  const existing = (user.factors ?? []).find(item => item.factor_type === "totp" && item.status === "verified");
  if (existing) { factor = existing.id; announce("Enter the code from your authenticator."); return; }
  const incomplete = (user.factors ?? []).filter(item => item.factor_type === "totp" && item.status === "unverified");
  for (const pending of incomplete) await request("/auth/v1/factors/" + encodeURIComponent(pending.id), undefined, "DELETE");
  const data = await request("/auth/v1/factors", { factor_type: "totp", friendly_name: "CEDA Admin" });
  factor = data.id;
  const qr = document.querySelector("[data-factor-qr]");
  const qrCode = data?.totp?.qr_code ?? "";
  if (!qrCode) throw new Error("Authenticator setup could not be prepared. Please try again.");
  qr.src = qrCode.startsWith("data:image/") ? qrCode : "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qrCode);
  const secret = document.querySelector("[data-factor-secret]");
  secret.textContent = data?.totp?.secret ? data.totp.secret.match(/.{1,4}/g).join(" ") : "Setup key unavailable";
  document.querySelector("[data-factor-setup]").hidden = false;
  announce("Scan the QR code or enter the setup key in your authenticator app, then enter the generated six digit code.");
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
    document.querySelector("[data-factor-secret]").textContent = "";
    announce("Multi-factor verification complete.");
  });
});
async function performLogout() {
  const token = accountToken(); clearAccountToken(); invalidateCache(); workspace.hidden = true;
  try { if (signupConfig && token) await logoutSignup(signupConfig, token); } finally { location.replace("/signin/"); }
}
document.querySelector("[data-admin-logout]").addEventListener("click", performLogout);
document.querySelector("[data-settings-logout]")?.addEventListener("click", performLogout);
async function verifiedAdminProfileWithTimeout(timeoutMs = 12000) {
  const token = accountToken();
  if (!signupConfig || !token) return null;
  let timerId = 0;
  try {
    return await Promise.race([
      verifiedAccountProfile(signupConfig, token),
      new Promise((_, reject) => {
        timerId = window.setTimeout(() => reject(new Error("Administrator access check timed out. Reload to try again.")), timeoutMs);
      }),
    ]);
  } finally {
    window.clearTimeout(timerId);
  }
}

void run(async () => {
  const profile = await verifiedAdminProfileWithTimeout();
  if (!profile) { location.replace("/signin/"); return; }
  if (profile.account_role !== "admin") {
    const destinations = { innovator: "/account/", assessor: "/assessor/", support: "/support/", committee: "/committee/" };
    location.replace(destinations[profile.account_role] || "/signin/");
    return;
  }
  globalThis.__cedaSetPortalActivityActor?.(profile, signupConfig, accountToken());
  void import("./telemetry.js").then(m => m.initPortalTelemetry?.({ portalRole: "admin" })).catch(() => {});
  void import("./webFcm.js").then(m => m.registerWebFcmIfSupported?.(signupConfig, accountToken())).catch(() => {});
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
  const results = await Promise.allSettled([
    loadUsers(),
    loadSectors(),
    loadApplications(),
    loadMatters(),
    loadContent(),
    loadNotifications(),
    loadConfigurations(),
  ]);
  if (results.some(result => result.status === "rejected")) {
    announce("Administrator access confirmed. Some directory data could not load. Reload to retry, or sign in again if your session has expired.");
  }
  // Load the reporting summary after the main boot sequence (non-blocking).
  void loadReportingSummary(7);
});
