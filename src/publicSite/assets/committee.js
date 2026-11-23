import {
  buildCommitteeSummary,
  buildLifecycleSteps,
  committeeStageLabel,
  filterCommitteeApplications,
  filterCommitteeTimeline,
  formatAwardSummaryText,
} from "./committeeOverview.js";
import { signupConfig } from "./signupConfig.js";
import { verifiedAccountProfile, logoutSignup } from "./signupApi.js";
import { accountToken, clearAccountToken, saveAccountToken } from "./verificationSession.js";

const statusBanner = document.querySelector("[data-committee-status]");
const workspace = document.querySelector("[data-committee-workspace]");
const dialog = document.querySelector("[data-committee-dialog]");
const dialogTitle = document.querySelector("#committee-dialog-title");
const dialogEyebrow = document.querySelector("[data-dialog-eyebrow]");
const dialogBody = document.querySelector("[data-dialog-body]");
const dialogStatus = document.querySelector("[data-dialog-status]");

const ROLE_HOMES = {
  admin: "/admin/",
  innovator: "/account/",
  assessor: "/assessor/",
  support: "/support/",
  committee: "/committee/",
};

const STATUS_CLASSES = {
  Submitted: "submitted",
  "In review": "review",
  "Changes requested": "changes",
  Approved: "approved",
  Awarded: "awarded",
  Rejected: "rejected",
  Withdrawn: "withdrawn",
};

const state = {
  token: accountToken(),
  profile: null,
  workspaceData: null,
  statusFilter: "All",
  mfaFactor: null,
  cache: new Map(),
};

function announce(msg) {
  if (!statusBanner) return;
  statusBanner.classList.toggle("admin-status-silent", !msg);
  statusBanner.textContent = msg || "";
}

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null && text !== "") node.textContent = String(text);
  return node;
}

function badgeForStatus(status) {
  const key = STATUS_CLASSES[status] || "submitted";
  return el("span", `admin-case-badge case-${key}`, status || "Submitted");
}

function getCached(key) {
  const hit = state.cache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    state.cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function setCached(key, value, ttlMs = 30000) {
  state.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

async function rpc(name, body = {}) {
  const response = await fetch(new URL(`/rest/v1/rpc/${name}`, signupConfig.url), {
    method: "POST",
    headers: {
      apikey: signupConfig.key,
      Authorization: `Bearer ${state.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
  if (!response.ok) {
    throw new Error(parsed?.message || "Committee workspace data could not be loaded.");
  }
  return parsed;
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function populateSectorDropdowns(sectors) {
  const names = (Array.isArray(sectors) ? sectors : []).map(s => s.name).filter(Boolean);
  for (const sel of [
    document.querySelector("[data-timeline-sector-select]"),
    document.querySelector("[data-apps-sector-select]"),
  ]) {
    if (!sel) continue;
    const prev = sel.value || "All";
    sel.replaceChildren(new Option("All sectors", "All"));
    for (const name of names) sel.append(new Option(name, name));
    sel.value = names.includes(prev) ? prev : "All";
  }
}

function navigateTo(sectionId) {
  const valid = ["overview", "timeline", "applications", "awards", "settings"];
  const target = valid.includes(sectionId) ? sectionId : "overview";
  for (const sec of document.querySelectorAll(".admin-work-section")) {
    sec.hidden = sec.id !== target;
  }
  for (const link of document.querySelectorAll("#committee-primary-navigation a")) {
    const active = link.dataset.navTarget === target;
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (location.hash.replace(/^#/, "") !== target) {
    history.replaceState(null, "", `#${target}`);
  }
}

async function openApplicationDetail(appId, fallbackApp = null) {
  if (!dialog || !dialogBody) return;
  dialogStatus.textContent = "Loading read-only record...";
  dialogEyebrow.textContent = fallbackApp?.reference || "READ-ONLY APPLICATION RECORD";
  dialogTitle.textContent = fallbackApp?.title || "Application progression";
  dialogBody.replaceChildren();
  if (!dialog.open) dialog.showModal();
  dialogTitle.focus();

  try {
    const cacheKey = `case:${appId}`;
    let detail = getCached(cacheKey);
    if (!detail) {
      detail = await rpc("committee_case", { p_case_id: appId });
      setCached(cacheKey, detail, 30000);
    }
    const item = detail.case || fallbackApp;
    const timeline = detail.timeline || fallbackApp?.timeline || [];
    const outcome = detail.outcomeData || {};
    const award = detail.awardData || {};
    const roundOverview = detail.roundOverview || null;
    const docs = Array.isArray(detail.documents) ? detail.documents : [];

    dialogStatus.textContent = "";
    dialogEyebrow.textContent = `${item.reference} · READ-ONLY`;
    dialogTitle.textContent = item.title;

    // 1. 5-Stage Lifecycle Stepper
    const stepsWrap = el("div", "committee-stepper");
    const lifecycleSteps = buildLifecycleSteps({ ...item, timeline });
    for (const step of lifecycleSteps) {
      const card = el("div", `committee-step-card is-${step.state}`);
      card.append(
        el("small", "", `Stage ${step.stepNumber}`),
        el("strong", "", step.label),
        el("small", "", step.at ? step.at : (step.state === "upcoming" ? "Pending" : step.detail)),
      );
      stepsWrap.append(card);
    }
    dialogBody.append(el("h3", "", "Stage progression (Submission → Award)"), stepsWrap);

    // 2. Award highlight card if Awarded
    if (item.status === "Awarded") {
      const awardCard = el("article", "committee-award-card");
      awardCard.append(
        el("span", "admin-case-badge case-awarded", award.awardCategory || "Innovation Award"),
        el("h3", "", award.awardTitle || `CEDA Innovation Award: ${item.title}`),
        el("p", "", award.awardSummary || outcome.feedback || "Official CEDA Innovation Award conferred."),
        el("small", "admin-help", `Conferred ${award.conferredAt || item.awardedAt || item.updatedAt}${award.awardAmount ? ` · Package: ${award.awardAmount}` : ""}`),
      );
      const exportBtn = el("button", "admin-cta", "Download award brief");
      exportBtn.type = "button";
      exportBtn.addEventListener("click", () => {
        downloadTextFile(`${item.reference}-award-brief.txt`, formatAwardSummaryText({ ...item, outcomeData: outcome, awardData: award }));
      });
      awardCard.append(exportBtn);
      dialogBody.append(awardCard);
    }

    // 3. Key facts & sanitized oversight summary
    const facts = el("dl", "admin-case-facts");
    for (const [k, v] of [
      ["Applicant", `${item.applicant || "Innovator"} (${item.applicantType || "Individual"})`],
      ["Sector", item.sector || "Pending"],
      ["Current stage", committeeStageLabel(item.status)],
      ["Submitted", item.submittedDate || "N/A"],
      ["Last updated", item.updatedAt || "N/A"],
      ...(item.district ? [["District", item.district]] : []),
      ...(item.innovationStage ? [["Maturity level", item.innovationStage]] : []),
      ...(roundOverview ? [["Assessment round", `${roundOverview.roundState} (${roundOverview.reviewCount}/${roundOverview.memberCount} reviews submitted)`]] : []),
    ]) {
      facts.append(el("dt", "", k), el("dd", "", String(v)));
    }
    dialogBody.append(el("p", "", item.summary || ""), facts);

    // 4. Official outcome notice if released
    if (["Approved", "Awarded", "Rejected"].includes(item.status) && (outcome.feedback || outcome.applicantFeedback)) {
      const box = el("article", "admin-overview-panel");
      box.append(
        el("p", "eyebrow", "RELEASED OUTCOME SUMMARY"),
        el("p", "", outcome.applicantFeedback || outcome.feedback),
      );
      if (outcome.nextSteps || outcome.recommendedNextSteps) {
        const steps = Array.isArray(outcome.recommendedNextSteps) ? outcome.recommendedNextSteps.join("; ") : String(outcome.nextSteps || outcome.recommendedNextSteps);
        box.append(el("small", "admin-help", `Next steps: ${steps}`));
      }
      dialogBody.append(box);
    }

    // 5. Full chronological timeline
    const tlList = el("ol", "committee-timeline-stream");
    if (!timeline.length) {
      tlList.append(el("li", "committee-timeline-entry", "No timeline milestones recorded yet."));
    } else {
      for (const evt of timeline) {
        const entry = el("li", "committee-timeline-entry");
        const head = el("div", "committee-timeline-head");
        head.append(el("strong", "", evt.label || "Milestone"), el("small", "", evt.at || ""));
        entry.append(head, el("p", "", evt.detail || ""));
        tlList.append(entry);
      }
    }
    dialogBody.append(el("h3", "", "Milestone timeline"), tlList);

    // 6. Evidence metadata
    if (docs.length) {
      const docBox = el("div", "committee-compact-list");
      for (const doc of docs) {
        const row = el("div", "committee-list-item");
        const left = el("div");
        left.append(el("h4", "", doc.title || "Supporting evidence"), el("p", "", `${doc.sectionKey || "general"} · ${doc.category || doc.docKind}`));
        row.append(left);
        if (doc.docKind === "video_link" && doc.videoUrl) {
          const a = el("a", "overview-link", "Watch demo");
          a.href = doc.videoUrl;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          row.append(a);
        }
        docBox.append(row);
      }
      dialogBody.append(el("h3", "", `Verified evidence index (${docs.length})`), docBox);
    }
  } catch (err) {
    dialogStatus.textContent = err?.message || "Unable to load application details.";
  }
}

function renderOverview() {
  const summary = buildCommitteeSummary(state.workspaceData);
  const kpiHost = document.querySelector("[data-committee-kpis]");
  if (kpiHost) {
    kpiHost.replaceChildren();
    for (const [label, value, sub] of [
      ["Visible submissions", String(summary.counts.total), "Non-draft applications in scope"],
      ["Review & feedback", String(summary.counts.inReview + summary.counts.changesRequested), `${summary.counts.changesRequested} awaiting clarification`],
      ["Approved (awaiting award)", String(summary.counts.approved), `${summary.approvalRatePct}% positive outcome rate`],
      ["Awards conferred", String(summary.counts.awarded), `${summary.awardConversionPct}% converted from Approved`],
    ]) {
      const card = el("article", "admin-user-stat");
      const wrap = el("div");
      wrap.append(el("span", "", label), el("strong", "", value), el("small", "", sub));
      card.append(wrap);
      kpiHost.append(card);
    }
  }

  const funnelHost = document.querySelector("[data-committee-funnel]");
  if (funnelHost) {
    funnelHost.replaceChildren();
    const funnelCounts = [
      ["Stage 1", "Submission", summary.counts.submitted, false],
      ["Stage 2", "Review", summary.counts.inReview, false],
      ["Stage 3", "Feedback", summary.counts.changesRequested, false],
      ["Stage 4", "Approval", summary.counts.approved, false],
      ["Stage 5", "Award", summary.counts.awarded, true],
    ];
    for (const [stepTag, label, count, isAward] of funnelCounts) {
      const box = el("article", `committee-funnel-step${isAward ? " is-award" : ""}`);
      box.append(
        el("small", "", stepTag),
        el("strong", "", String(count)),
        el("span", "", label),
      );
      funnelHost.append(box);
    }
  }

  const awardsHost = document.querySelector("[data-overview-awards]");
  if (awardsHost) {
    awardsHost.replaceChildren();
    if (!summary.awardedShowcase.length) {
      awardsHost.append(el("p", "admin-help", "No awards conferred in your visible scope yet."));
    } else {
      for (const app of summary.awardedShowcase.slice(0, 4)) {
        const row = el("button", "committee-list-item");
        row.type = "button";
        const info = el("div");
        info.append(
          el("h4", "", app.awardData?.awardTitle || app.title),
          el("p", "", `${app.reference} · ${app.applicant} · ${app.awardedAt || app.updatedAt}`),
        );
        row.append(info, el("span", "admin-case-badge case-awarded", "Awarded"));
        row.addEventListener("click", () => void openApplicationDetail(app.id, app));
        awardsHost.append(row);
      }
    }
  }

  const recentHost = document.querySelector("[data-overview-timeline]");
  if (recentHost) {
    recentHost.replaceChildren();
    if (!summary.recentMilestones.length) {
      recentHost.append(el("p", "admin-help", "Milestone events will appear as applications progress."));
    } else {
      for (const evt of summary.recentMilestones.slice(0, 5)) {
        const row = el("button", "committee-list-item");
        row.type = "button";
        const info = el("div");
        info.append(
          el("h4", "", `${evt.reference} · ${evt.label}`),
          el("p", "", `${evt.title}, ${evt.at}`),
        );
        row.append(info, badgeForStatus(evt.status));
        row.addEventListener("click", () => void openApplicationDetail(evt.applicationId, { id: evt.applicationId, reference: evt.reference, title: evt.title, status: evt.status }));
        recentHost.append(row);
      }
    }
  }

  const sectorTbody = document.querySelector("[data-committee-sectors]");
  if (sectorTbody) {
    sectorTbody.replaceChildren();
    if (!summary.sectors.length) {
      const cell = sectorTbody.insertRow().insertCell();
      cell.colSpan = 7;
      cell.textContent = "No active sectors in scope.";
    } else {
      for (const sec of summary.sectors) {
        const row = sectorTbody.insertRow();
        row.insertCell().append(el("strong", "", sec.name));
        row.insertCell().textContent = String(sec.submittedCount ?? 0);
        row.insertCell().textContent = String(sec.inReviewCount ?? 0);
        row.insertCell().textContent = String(sec.changesCount ?? 0);
        row.insertCell().textContent = String(sec.approvedCount ?? 0);
        row.insertCell().textContent = String(sec.awardedCount ?? 0);
        row.insertCell().textContent = String(sec.totalCount ?? 0);
      }
    }
  }
}

function renderTimeline() {
  const form = document.querySelector("[data-timeline-filters]");
  const host = document.querySelector("[data-committee-timeline-list]");
  const countEl = document.querySelector("[data-timeline-results]");
  if (!host) return;
  const events = state.workspaceData?.timelineEvents || [];
  const filtered = filterCommitteeTimeline(events, {
    query: form?.elements.query?.value || "",
    stage: form?.elements.stage?.value || "All",
    sector: form?.elements.sector?.value || "All",
  });
  if (countEl) countEl.textContent = `Showing ${filtered.length} of ${events.length} recorded milestones`;
  host.replaceChildren();
  if (!filtered.length) {
    host.append(el("li", "committee-timeline-entry", "No timeline events match these filters."));
    return;
  }
  for (const evt of filtered) {
    const item = el("li", "committee-timeline-entry");
    const head = el("div", "committee-timeline-head");
    const titleWrap = el("div");
    titleWrap.append(el("strong", "", `${evt.reference} · ${evt.label}`));
    const badges = el("div", "committee-timeline-meta");
    badges.append(badgeForStatus(evt.status), el("span", "", evt.at || ""));
    head.append(titleWrap, badges);

    const openBtn = el("button", "overview-link", `Inspect ${evt.title}`);
    openBtn.type = "button";
    openBtn.addEventListener("click", () => void openApplicationDetail(evt.applicationId, { id: evt.applicationId, reference: evt.reference, title: evt.title, status: evt.status }));

    item.append(head, el("p", "", `${evt.detail} (${evt.applicant} · ${evt.sector})`), openBtn);
    host.append(item);
  }
}

function renderApplications() {
  const form = document.querySelector("[data-apps-filters]");
  const tbody = document.querySelector("[data-committee-apps-tbody]");
  const countEl = document.querySelector("[data-committee-apps-results]");
  if (!tbody) return;
  const allApps = state.workspaceData?.applications || [];
  const filtered = filterCommitteeApplications(allApps, {
    query: form?.elements.query?.value || "",
    status: state.statusFilter,
    sector: form?.elements.sector?.value || "All",
  });
  if (countEl) countEl.textContent = `Showing ${filtered.length} of ${allApps.length} non-draft applications (read-only)`;
  tbody.replaceChildren();
  if (!filtered.length) {
    const empty = tbody.insertRow().insertCell();
    empty.colSpan = 7;
    empty.textContent = "No applications match these filters.";
    return;
  }
  for (const app of filtered) {
    const row = tbody.insertRow();
    const idCell = row.insertCell();
    idCell.append(el("strong", "", app.title), el("small", "admin-case-reference", app.reference));
    row.insertCell().textContent = app.applicant || "";
    row.insertCell().textContent = app.sector || "";
    row.insertCell().textContent = committeeStageLabel(app.status);
    row.insertCell().append(badgeForStatus(app.status));
    row.insertCell().textContent = app.updatedAt || app.submittedDate || "";
    const btn = el("button", "admin-button-secondary", "Timeline & details");
    btn.type = "button";
    btn.addEventListener("click", () => void openApplicationDetail(app.id, app));
    row.insertCell().append(btn);
  }
}

function renderAwards() {
  const summary = buildCommitteeSummary(state.workspaceData);
  const awardsHost = document.querySelector("[data-committee-awards-list]");
  const awaitingHost = document.querySelector("[data-committee-awaiting-list]");
  if (awardsHost) {
    awardsHost.replaceChildren();
    if (!summary.awardedShowcase.length) {
      const empty = el("article", "admin-overview-panel");
      empty.append(el("h3", "", "No awarded applications yet"), el("p", "admin-help", "Approved innovations will appear here once their formal Award stage is conferred."));
      awardsHost.append(empty);
    } else {
      for (const app of summary.awardedShowcase) {
        const award = app.awardData || {};
        const card = el("article", "committee-award-card");
        card.append(
          el("span", "admin-case-badge case-awarded", award.awardCategory || "Innovation Award"),
          el("h3", "", award.awardTitle || `CEDA Innovation Award: ${app.title}`),
          el("p", "", award.awardSummary || app.outcomeData?.feedback || "Conferred CEDA Innovation Award status."),
          el("small", "admin-help", `${app.reference} · ${app.applicant} (${app.sector}) · Conferred ${award.conferredAt || app.awardedAt || app.updatedAt}`),
        );
        const actions = el("div", "admin-form-actions");
        const detailBtn = el("button", "admin-cta", "View stage timeline");
        detailBtn.type = "button";
        detailBtn.addEventListener("click", () => void openApplicationDetail(app.id, app));
        const briefBtn = el("button", "admin-button-secondary", "Download award brief");
        briefBtn.type = "button";
        briefBtn.addEventListener("click", () => downloadTextFile(`${app.reference}-award-brief.txt`, formatAwardSummaryText(app)));
        actions.append(detailBtn, briefBtn);
        card.append(actions);
        awardsHost.append(card);
      }
    }
  }
  if (awaitingHost) {
    awaitingHost.replaceChildren();
    if (!summary.awaitingAward.length) {
      awaitingHost.append(el("p", "admin-help", "No Approved applications currently awaiting award conferral."));
    } else {
      for (const app of summary.awaitingAward) {
        const row = el("button", "committee-list-item");
        row.type = "button";
        const info = el("div");
        info.append(el("h4", "", `${app.reference} · ${app.title}`), el("p", "", `${app.applicant} · ${app.sector} · Approved ${app.updatedAt}`));
        row.append(info, badgeForStatus("Approved"));
        row.addEventListener("click", () => void openApplicationDetail(app.id, app));
        awaitingHost.append(row);
      }
    }
  }
}

function renderProfileFacts() {
  const facts = document.querySelector("[data-committee-profile-facts]");
  if (!facts) return;
  facts.replaceChildren();
  const scope = state.workspaceData?.profile?.sectorNames || [];
  for (const [k, v] of [
    ["Full name", state.profile?.full_name || "Committee Observer"],
    ["Email", state.profile?.email || "Verified"],
    ["Role", "Committee Observer (External Stakeholder)"],
    ["Permissions", "Strict Read-Only Oversight (No Mutations)"],
    ["Sector scope", scope.length ? scope.join(", ") : "All visible sectors"],
  ]) {
    facts.append(el("dt", "", k), el("dd", "", v));
  }
}

async function refreshMfaStatus() {
  const statusEl = document.querySelector("[data-mfa-status]");
  const enrollBtn = document.querySelector("[data-mfa-enroll]");
  const verifyBtn = document.querySelector("[data-mfa-verify]");
  if (!statusEl) return;
  try {
    const res = await fetch(new URL("/auth/v1/user", signupConfig.url), {
      headers: { apikey: signupConfig.key, Authorization: `Bearer ${state.token}` },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
    const user = await res.json();
    const factors = (user.factors || []).filter(f => f.factor_type === "totp" && f.status === "verified");
    state.mfaFactor = factors[0] || null;
    if (state.mfaFactor) {
      statusEl.textContent = "Authenticator app (TOTP) is active on your committee account.";
      if (enrollBtn) enrollBtn.hidden = true;
      if (verifyBtn) verifyBtn.hidden = false;
    } else {
      statusEl.textContent = "Set up an authenticator app to strengthen committee account security.";
      if (enrollBtn) enrollBtn.hidden = false;
      if (verifyBtn) verifyBtn.hidden = true;
    }
  } catch {
    statusEl.textContent = "Authenticator status unavailable right now.";
  }
}

function renderAll() {
  populateSectorDropdowns(state.workspaceData?.sectors || []);
  renderOverview();
  renderTimeline();
  renderApplications();
  renderAwards();
  renderProfileFacts();
}

async function loadWorkspace(forceRefresh = false) {
  const cacheKey = "workspace:committee";
  let data = forceRefresh ? undefined : getCached(cacheKey);
  if (!data) {
    data = await rpc("committee_workspace");
    setCached(cacheKey, data, 30000);
  }
  state.workspaceData = data;
  const scopeNames = data?.profile?.sectorNames || [];
  const scopeNote = document.querySelector("[data-committee-scope-note]");
  if (scopeNote) {
    scopeNote.textContent = scopeNames.length ? `${scopeNames.length} sector(s) scoped · Read-only` : "All sectors · Read-only";
  }
  renderAll();
}

function wireEvents() {
  dialog?.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
  document.querySelector("[data-dialog-close]")?.addEventListener("click", () => dialog?.close());

  for (const link of document.querySelectorAll("#committee-primary-navigation a")) {
    link.addEventListener("click", e => {
      e.preventDefault();
      navigateTo(link.dataset.navTarget);
    });
  }

  document.querySelector("[data-committee-sidebar-toggle]")?.addEventListener("click", e => {
    const layout = document.querySelector("[data-committee-layout]");
    const collapsed = layout?.classList.toggle("is-collapsed");
    e.currentTarget.setAttribute("aria-expanded", String(!collapsed));
  });

  document.querySelector("[data-committee-search]")?.addEventListener("submit", e => {
    e.preventDefault();
    const q = e.target.elements.query?.value || "";
    const appsSearch = document.querySelector("[data-apps-filters] input[name='query']");
    if (appsSearch) appsSearch.value = q;
    navigateTo("applications");
    renderApplications();
  });

  document.querySelector("[data-committee-refresh]")?.addEventListener("click", async () => {
    announce("Refreshing read-only portfolio...");
    try {
      await loadWorkspace(true);
      announce("");
    } catch (err) {
      announce(err?.message || "Could not refresh committee workspace.");
    }
  });

  document.querySelector("[data-committee-logout]")?.addEventListener("click", async () => {
    await logoutSignup(signupConfig, state.token);
    clearAccountToken();
    location.replace("/signin/");
  });

  const tlForm = document.querySelector("[data-timeline-filters]");
  tlForm?.addEventListener("submit", e => { e.preventDefault(); renderTimeline(); });
  tlForm?.addEventListener("input", renderTimeline);
  tlForm?.addEventListener("change", renderTimeline);
  document.querySelector("[data-reset-timeline]")?.addEventListener("click", () => {
    tlForm?.reset();
    renderTimeline();
  });

  const appsForm = document.querySelector("[data-apps-filters]");
  appsForm?.addEventListener("submit", e => { e.preventDefault(); renderApplications(); });
  appsForm?.addEventListener("input", renderApplications);
  appsForm?.addEventListener("change", renderApplications);
  document.querySelector("[data-reset-apps]")?.addEventListener("click", () => {
    appsForm?.reset();
    state.statusFilter = "All";
    for (const btn of document.querySelectorAll("[data-committee-status-filter]")) {
      const active = btn.dataset.committeeStatusFilter === "All";
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    }
    renderApplications();
  });

  for (const btn of document.querySelectorAll("[data-committee-status-filter]")) {
    btn.addEventListener("click", () => {
      state.statusFilter = btn.dataset.committeeStatusFilter || "All";
      for (const peer of document.querySelectorAll("[data-committee-status-filter]")) {
        const active = peer === btn;
        peer.classList.toggle("is-active", active);
        peer.setAttribute("aria-pressed", String(active));
      }
      renderApplications();
    });
  }

  document.querySelector("[data-password-form]")?.addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const pw = form.elements.password.value;
    const conf = form.elements.confirmation.value;
    if (pw !== conf) {
      announce("Passwords do not match.");
      return;
    }
    try {
      const res = await fetch(new URL("/auth/v1/user", signupConfig.url), {
        method: "PUT",
        headers: { apikey: signupConfig.key, Authorization: `Bearer ${state.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (!res.ok) throw new Error("Password update failed.");
      form.reset();
      announce("Password updated cleanly.");
    } catch (err) {
      announce(err?.message || "Could not update password.");
    }
  });

  document.querySelector("[data-mfa-enroll]")?.addEventListener("click", async () => {
    try {
      const res = await fetch(new URL("/auth/v1/factors", signupConfig.url), {
        method: "POST",
        headers: { apikey: signupConfig.key, Authorization: `Bearer ${state.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ factor_type: "totp", friendly_name: "CEDA Committee Authenticator" }),
      });
      const enrolled = await res.json();
      if (!res.ok || !enrolled.id) throw new Error("Authenticator enrollment failed.");
      state.mfaFactor = enrolled;
      const mfaForm = document.querySelector("[data-mfa-form]");
      const setup = document.querySelector("[data-mfa-setup]");
      if (setup && enrolled.totp?.qr_code) {
        const img = document.createElement("img");
        img.className = "committee-qrcode-frame";
        img.alt = "Scan authenticator QR code";
        img.src = enrolled.totp.qr_code.startsWith("data:") ? enrolled.totp.qr_code : `data:image/svg+xml;utf8,${encodeURIComponent(enrolled.totp.qr_code)}`;
        setup.replaceChildren(img, el("p", "admin-help", `Secret: ${enrolled.totp.secret || ""}`));
      }
      if (mfaForm) mfaForm.hidden = false;
    } catch (err) {
      announce(err?.message || "Could not start MFA setup.");
    }
  });

  document.querySelector("[data-mfa-verify]")?.addEventListener("click", () => {
    const mfaForm = document.querySelector("[data-mfa-form]");
    const setup = document.querySelector("[data-mfa-setup]");
    setup?.replaceChildren(el("p", "admin-help", "Enter a 6-digit code from your authenticator app to verify this session."));
    if (mfaForm) mfaForm.hidden = false;
  });

  document.querySelector("[data-mfa-form]")?.addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const code = String(form.elements.code.value || "").trim();
    if (!state.mfaFactor?.id) return;
    try {
      const chRes = await fetch(new URL(`/auth/v1/factors/${state.mfaFactor.id}/challenge`, signupConfig.url), {
        method: "POST",
        headers: { apikey: signupConfig.key, Authorization: `Bearer ${state.token}` },
      });
      const challenge = await chRes.json();
      const verRes = await fetch(new URL(`/auth/v1/factors/${state.mfaFactor.id}/verify`, signupConfig.url), {
        method: "POST",
        headers: { apikey: signupConfig.key, Authorization: `Bearer ${state.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ challenge_id: challenge.id, code }),
      });
      const verified = await verRes.json();
      if (!verRes.ok || !verified.access_token) throw new Error(verified?.message || "Invalid authenticator code.");
      saveAccountToken(verified.access_token, Number(verified.expires_in || 3600));
      state.token = verified.access_token;
      form.hidden = true;
      form.reset();
      await refreshMfaStatus();
      announce("Session verified.");
    } catch (err) {
      announce(err?.message || "Authenticator verification failed.");
    }
  });
}

let committeeRefreshTimer = null;
function ensureCommitteeRealtimeSync() {
  if (committeeRefreshTimer) return;
  committeeRefreshTimer = setInterval(() => {
    if (document.visibilityState === "visible") {
      void loadWorkspace(true).catch(() => {});
    }
  }, 15000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void loadWorkspace(true).catch(() => {});
    }
  });
}

async function start() {
  if (!signupConfig || !state.token) {
    location.replace("/signin/");
    return;
  }
  try {
    const profile = await verifiedAccountProfile(signupConfig, state.token);
    if (!profile) {
      clearAccountToken();
      location.replace("/signin/");
      return;
    }
    if (profile.account_role !== "committee") {
      location.replace(ROLE_HOMES[profile.account_role] || "/signin/");
      return;
    }
    state.profile = profile;
    const nameEl = document.querySelector("[data-committee-name]");
    const emailEl = document.querySelector("[data-committee-email]");
    if (nameEl) nameEl.textContent = profile.full_name || "Committee Observer";
    if (emailEl) emailEl.textContent = profile.email || "";

    wireEvents();
    void import("./telemetry.js").then(m => m.initPortalTelemetry?.({ portalRole: "committee" })).catch(() => {});
    void import("./webFcm.js").then(m => m.registerWebFcmIfSupported?.(signupConfig, state.token)).catch(() => {});
    await loadWorkspace(true);
    await refreshMfaStatus();
    ensureCommitteeRealtimeSync();
    if (workspace) workspace.hidden = false;
    announce("");
    const hash = location.hash.replace(/^#/, "");
    navigateTo(hash || "overview");
  } catch (err) {
    announce(err?.message || "Unable to open committee observer workspace.");
  }
}

start();
