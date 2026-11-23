import { signupConfig } from "./signupConfig.js";
import { logoutSignup, verifiedAccountProfile } from "./signupApi.js";
import { accountToken, clearAccountToken, saveAccountToken } from "./verificationSession.js";
import { kickNotificationDispatch } from "./notificationsDomain.js";
import { buildReviewSteps, scoreLabels } from "./assessmentForm.js";
import {
  assessmentBucket, buildAssessorOverview, buildLeadOverview, buildLibrarySummary, buildMyAssessmentsSummary,
  computeWeightedAssessment, criterionLabel, defaultAssessmentDeadline, defaultAssessmentRubric,
  eligiblePanelCandidates, formatAssessorRole, humanCaseStatus, libraryCategory,
  normalizeRubricCriteria, overviewColors, panelCandidateSubtitle,
} from "./assessmentOverview.js";

const root = document.querySelector("[data-assessor]");
const view = root.querySelector("[data-assessor-view]");
const status = root.querySelector("[data-assessor-status]");
const retry = root.querySelector("[data-assessor-retry]");
const navLinks = [...root.querySelectorAll("#assessor-navigation a")];
const fallbackCriteria = [...root.querySelector("[data-assessor-rubric]").content.children].map(item => item.dataset.criterion);
function activeRubricList(detail = null) {
  const source = detail?.rubric || state.workspace?.rubric || fallbackCriteria;
  return normalizeRubricCriteria(Array.isArray(source) && source.length ? source : defaultAssessmentRubric);
}
const labels = {
  setup: "Panel setup", review: "In review", voting: "Voting open", closed: "Voting closed",
  "awaiting-information": "Awaiting information", released: "Released", awarded: "Award conferred", archived: "Archived",
  pending: "Declaration due", cleared: "No conflict", recused: "Recused",
  approve: "Approve", decline: "Reject", "request-information": "Request information",
};
const tabs = { application: "Application", review: "My review" };
const reviewPositions = new Map();
const localDiscussions = new Map();
let activeDiscussionCaseId = "";
const choiceKeys = ["approve", "decline", "request-information"];
const roleHomes = { admin: "/admin/", innovator: "/account/", support: "/support/", committee: "/committee/" };
const state = { workspace: null, profile: null, request: 0, saving: false };
let discussionPoll = 0;
const dateFormat = new Intl.DateTimeFormat("en-BW", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Gaborone" });
const chatDateFormat = new Intl.DateTimeFormat("en-BW", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Gaborone" });
const chatTimeFormat = new Intl.DateTimeFormat("en-BW", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Gaborone" });

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(text, hash, className = "") {
  const node = element("a", className, text);
  node.href = hash;
  return node;
}

function button(text, handler, className = "admin-button-secondary") {
  const node = element("button", className, text);
  node.type = "button";
  node.addEventListener("click", handler);
  return node;
}

function announce(text = "", error = false) {
  status.textContent = text;
  status.classList.toggle("admin-status-silent", !text);
  status.classList.toggle("assessor-error", error);
}

function formatDate(value) {
  const parsed = new Date(value);
  return value && !Number.isNaN(parsed.valueOf()) ? dateFormat.format(parsed) : "No deadline";
}

function chatDate(value) {
  const parsed = new Date(value);
  return value && !Number.isNaN(parsed.valueOf()) ? chatDateFormat.format(parsed) : "";
}

function chatTime(value) {
  const parsed = new Date(value);
  return value && !Number.isNaN(parsed.valueOf()) ? chatTimeFormat.format(parsed) : "";
}

function initials(name) {
  return String(name || "Panel member").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function stopDiscussionPolling() {
  if (discussionPoll) window.clearInterval(discussionPoll);
  discussionPoll = 0;
}

function startDiscussionPolling(item, update) {
  stopDiscussionPolling();
  discussionPoll = window.setInterval(async () => {
    if (state.saving || document.hidden) return;
    try {
      const latest = await rpc("assessor_case", { p_case_id: item.id });
      update(latest);
      await markDiscussionRead(latest.case);
    } catch { /* The next automatic check retries silently. */ }
  }, 4000);
}

function titleCase(value) {
  const text = value.replaceAll("-", " ").replace(/[A-Z]/g, letter => ` ${letter.toLowerCase()}`);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function heading(title, detail, action) {
  const row = element("div", "admin-users-heading");
  const copy = element("div");
  const h1 = element("h1", "", title);
  h1.tabIndex = -1;
  copy.append(h1);
  if (detail) copy.append(element("p", "", detail));
  row.append(copy);
  if (action) row.append(action);
  return row;
}

function panel(title, ...children) {
  const node = element("section", "admin-overview-panel");
  node.append(element("h2", "", title), ...children);
  return node;
}

function notes(text) { return element("p", "admin-help", text); }

function facts(entries) {
  const list = element("dl", "assessor-facts");
  for (const [label, value] of entries) {
    const item = element("div");
    item.append(element("dt", "", label), element("dd", "", value));
    list.append(item);
  }
  return list;
}

function metricCards(entries) {
  const grid = element("div", "assessor-metrics");
  for (const [label, value] of entries) {
    const item = element("article", "admin-overview-panel assessor-metric");
    item.append(element("span", "", label), element("strong", "", value));
    grid.append(item);
  }
  return grid;
}

function sessionHeaders(token = accountToken()) {
  return { "Content-Type": "application/json", apikey: signupConfig.key, Authorization: `Bearer ${token}` };
}

async function request(path, payload, method = "POST") {
  const token = accountToken();
  if (!token) throw new Error("Sign in to continue.");
  const response = await fetch(new URL(path, signupConfig.url), {
    method, headers: sessionHeaders(token), body: payload === undefined ? undefined : JSON.stringify(payload),
    cache: "no-store", credentials: "omit", redirect: "error",
  });
  const body = await response.json().catch(() => null);
  if (token !== accountToken()) throw new Error("Your session changed. Sign in again.");
  if (response.status === 401) {
    clearAccountToken();
    location.replace("/signin/");
    throw new Error("Your session expired. Sign in again.");
  }
  if (!response.ok) throw new Error(body?.message || body?.msg || "The request could not be completed.");
  return body;
}

function rpc(name, payload = {}) {
  return request(`/rest/v1/rpc/${name}`, payload).then((res) => {
    if (name === "assessor_action" && ["assign-panel", "start-review", "release-outcome", "confer-award", "submit-vote"].includes(payload?.p_action)) {
      kickNotificationDispatch(signupConfig, accountToken());
    }
    return res;
  });
}

function caseHref(item, tab = "application", from = "library") {
  return `#case/${encodeURIComponent(item.id)}/${tab}/${from}`;
}

function statusTone(statusLabel) {
  if (["New", "Assigned", "Voting open"].includes(statusLabel)) return "blue";
  if (["Panel setup", "In progress", "In review", "Changes requested", "On hold", "Awarded", "Award conferred"].includes(statusLabel)) return "amber";
  if (["Approved", "Review submitted", "Outcome released"].includes(statusLabel)) return "teal";
  if (["Rejected", "Decision ready", "Declaration due", "Recused"].includes(statusLabel)) return "rust";
  return "";
}

function workStatus(item, context = "library") {
  return humanCaseStatus(item, context);
}

function caseSubtitle(item, context = "library") {
  const parts = [item.reference, item.sector || "Industry pending"];
  if (item.deadline) parts.push(`Due ${formatDate(item.deadline)}`);
  if (context === "assessments" && item.assigned && !item.submitted && (item.reviewedCount || 0) > 0) {
    parts.push(`${item.reviewedCount}/12 steps`);
  } else if (item.canManage && item.roundId) {
    parts.push(`${item.reviewCount || 0}/${item.memberCount || 0} reviews`);
  } else if (item.canManage && item.status === "Submitted" && !item.roundId) {
    parts.push("Awaiting assessor assignment");
  } else if (!item.canManage && item.assigned && item.conflict === "pending") {
    parts.push("Assigned · Conflict declaration needed");
  }
  return parts.join(" · ");
}

function showCases(container, cases, tab, from) {
  container.replaceChildren();
  if (!cases.length) container.append(notes("No matching applications."));
  const context = from === "assessments" ? "assessments" : "library";
  for (const item of cases) {
    const target = typeof tab === "function" ? tab(item) : tab;
    const canOpen = item.assigned || item.canManage || item.hasHistory;
    const anchor = canOpen ? link("", caseHref(item, target, from), "assessor-case-link") : element("div", "assessor-case-link assessor-case-readonly");
    const identity = element("span");
    identity.append(element("strong", "", item.title), element("small", "", caseSubtitle(item, context)));
    const badgeText = canOpen ? workStatus(item, context) : "Not assigned";
    const tone = statusTone(badgeText);
    anchor.append(identity, element("span", `assessor-pill${tone ? ` assessor-pill-${tone}` : ""}`, badgeText));
    container.append(anchor);
  }
}

function filterToolbar({ cases, context, onChange, includeReset = true }) {
  const filters = element("div", "assessor-filter");
  const search = element("input");
  search.type = "search";
  search.placeholder = "Title, reference or industry";
  const statusFilter = element("select");
  statusFilter.append(new Option("All statuses", ""));
  for (const value of [...new Set(cases.map(item => workStatus(item, context)))].sort()) {
    statusFilter.append(new Option(value, value));
  }
  const industryFilter = element("select");
  industryFilter.append(new Option("All industries", ""));
  for (const value of [...new Set(cases.map(item => item.sector).filter(Boolean))].sort()) {
    industryFilter.append(new Option(value, value));
  }
  filters.append(field("Search applications", search), field("Status", statusFilter), field("Industry", industryFilter));
  let reset = null;
  if (includeReset) {
    reset = button("Clear filters", () => {
      search.value = "";
      statusFilter.value = "";
      industryFilter.value = "";
      onChange();
    }, "assessor-text-link assessor-filter-reset");
    reset.hidden = true;
    filters.append(reset);
  }
  const read = () => ({
    query: search.value.toLocaleLowerCase().trim(),
    status: statusFilter.value,
    industry: industryFilter.value,
  });
  const handle = () => {
    if (reset) reset.hidden = !search.value.trim() && !statusFilter.value && !industryFilter.value;
    onChange();
  };
  filters.addEventListener("input", handle);
  filters.addEventListener("change", handle);
  return { element: filters, read, resetFilters: () => { search.value = ""; statusFilter.value = ""; industryFilter.value = ""; if (reset) reset.hidden = true; } };
}

function listPanel(title, cases, tab, from, enableFilters = true) {
  const list = element("div", "assessor-case-list");
  const container = panel(title);
  const context = from === "assessments" ? "assessments" : "library";
  if (enableFilters && cases.length) {
    const toolbar = filterToolbar({
      cases,
      context,
      onChange: () => {
        const { query, status, industry } = toolbar.read();
        showCases(list, cases.filter(item =>
          (!status || status === workStatus(item, context)) &&
          (!industry || industry === item.sector) &&
          `${item.title} ${item.reference} ${item.sector}`.toLocaleLowerCase().includes(query)
        ), tab, from);
      },
    });
    container.append(toolbar.element);
  }
  showCases(list, cases, tab, from);
  container.append(list);
  return container;
}

function svgElement(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function miniSparkBars(heights, color) {
  const chart = svgElement("svg", { viewBox: "0 0 56 26", class: "assessor-kpi-spark", "aria-hidden": "true" });
  heights.forEach((height, index) => {
    const barHeight = Math.max(4, Math.min(24, height));
    chart.append(svgElement("rect", {
      x: index * 11, y: 26 - barHeight, width: 7, height: barHeight, rx: 2,
      fill: color, opacity: index === heights.length - 1 ? "1" : String(0.35 + index * 0.14),
    }));
  });
  return chart;
}

function miniCoverageRing(pct, color) {
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));
  const dash = (clamped / 100) * circumference;
  const wrap = element("div", "assessor-kpi-ring");
  const svg = svgElement("svg", { viewBox: "0 0 44 44", class: "assessor-kpi-ring-svg", "aria-hidden": "true" });
  svg.append(svgElement("circle", { cx: 22, cy: 22, r: radius, fill: "none", stroke: "#efe9e1", "stroke-width": 5 }));
  if (clamped > 0) {
    svg.append(svgElement("circle", {
      cx: 22, cy: 22, r: radius, fill: "none", stroke: color, "stroke-width": 5, "stroke-linecap": "round",
      "stroke-dasharray": `${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}`, transform: "rotate(-90 22 22)",
    }));
  }
  wrap.append(svg, element("span", "", `${clamped}%`));
  return wrap;
}

function kpiCard({ label, value, caption, href, badge, color, sparkHeights, ringPct }) {
  const card = link("", href, "admin-overview-panel assessor-kpi-card");
  const top = element("div", "assessor-kpi-top");
  top.append(element("span", "assessor-kpi-label", label));
  if (badge) top.append(element("span", "assessor-kpi-badge", badge));
  const middle = element("div", "assessor-kpi-body");
  middle.append(element("strong", "assessor-kpi-value", String(value)));
  middle.append(ringPct !== undefined ? miniCoverageRing(ringPct, color) : miniSparkBars(sparkHeights || [8, 13, 10, 18, 22], color));
  const footer = element("div", "assessor-kpi-footer");
  footer.append(element("small", "assessor-kpi-caption", caption), element("span", "assessor-kpi-arrow", "→"));
  card.append(top, middle, footer);
  return card;
}

function donutVisual(segments, centerValue, centerLabel, ariaLabel) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const positive = segments.filter(segment => segment.value > 0);
  const total = positive.reduce((sum, segment) => sum + segment.value, 0);
  const wrap = element("div", "assessor-donut-wrap");
  const svg = svgElement("svg", { viewBox: "0 0 120 120", class: "assessor-donut-svg", role: "img", "aria-label": ariaLabel });
  svg.append(svgElement("circle", { cx: 60, cy: 60, r: radius, fill: "none", stroke: "#efe9e1", "stroke-width": 14 }));
  let offset = 0;
  for (const segment of positive) {
    const dash = total ? (segment.value / total) * circumference : 0;
    svg.append(svgElement("circle", {
      cx: 60, cy: 60, r: radius, fill: "none", stroke: segment.color, "stroke-width": 14,
      "stroke-dasharray": `${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}`,
      "stroke-dashoffset": (-offset).toFixed(2), transform: "rotate(-90 60 60)",
    }));
    offset += dash;
  }
  const center = element("div", "assessor-donut-center");
  center.append(element("strong", "", String(centerValue)), element("span", "", centerLabel));
  wrap.append(svg, center);
  return wrap;
}

function barRows(entries, maxCount) {
  const list = element("div", "assessor-breakdown");
  const max = Math.max(1, maxCount || Math.max(0, ...entries.map(entry => entry.count)));
  for (const entry of entries) {
    const row = element("div", "assessor-breakdown-row");
    const head = element("div", "assessor-breakdown-head");
    const title = element("span", "assessor-breakdown-label");
    const dot = svgElement("svg", { viewBox: "0 0 10 10", class: "assessor-dot-svg", "aria-hidden": "true" });
    dot.append(svgElement("circle", { cx: 5, cy: 5, r: 5, fill: entry.color }));
    title.append(dot, document.createTextNode(entry.label));
    const metric = element("strong", "", entry.pct !== undefined ? `${entry.count} (${entry.pct}%)` : String(entry.count));
    head.append(title, metric);
    const bar = svgElement("svg", { viewBox: "0 0 240 8", class: "assessor-bar-svg", preserveAspectRatio: "none", "aria-hidden": "true" });
    bar.append(svgElement("rect", { x: 0, y: 0, width: 240, height: 8, rx: 4, fill: "#efe9e1" }));
    const width = Math.max(entry.count > 0 ? 6 : 0, Math.round((entry.count / max) * 240));
    if (width > 0) bar.append(svgElement("rect", { x: 0, y: 0, width, height: 8, rx: 4, fill: entry.color }));
    row.append(head, bar);
    list.append(row);
  }
  return list;
}

function panelHeader(title, linkText, hash) {
  const row = element("div", "assessor-panel-head");
  row.append(element("h2", "", title));
  if (linkText && hash) row.append(link(linkText, hash, "assessor-text-link"));
  return row;
}

function renderSectorBars(sectors) {
  if (!sectors.length) return notes("No applications in your assigned sectors yet.");
  const maxTotal = Math.max(1, ...sectors.map(entry => entry.total));
  const list = element("div", "assessor-sector-bars");
  for (const entry of sectors) {
    const row = element("div", "assessor-sector-row");
    const top = element("div", "assessor-sector-top");
    const title = element("div", "assessor-sector-title");
    title.append(element("strong", "", entry.sector), element("span", "assessor-pill", `${entry.staffCount} assessor${entry.staffCount === 1 ? "" : "s"}`));
    top.append(title, element("small", "", `${entry.reviewed}/${entry.total} reviewed · ${entry.newCount} new`));
    const svg = svgElement("svg", {
      viewBox: "0 0 300 10", class: "assessor-bar-svg", preserveAspectRatio: "none", role: "img",
      "aria-label": `${entry.sector}: ${entry.total} applications, ${entry.reviewed} with reviews, ${entry.decided} decided`,
    });
    svg.append(svgElement("rect", { x: 0, y: 0, width: 300, height: 10, rx: 5, fill: "#efe9e1" }));
    const totalW = Math.round((entry.total / maxTotal) * 300);
    const reviewedW = Math.round((entry.reviewed / maxTotal) * 300);
    const decidedW = Math.round((entry.decided / maxTotal) * 300);
    if (totalW > 0) svg.append(svgElement("rect", { x: 0, y: 0, width: totalW, height: 10, rx: 5, fill: "#c7d8ee" }));
    if (reviewedW > 0) svg.append(svgElement("rect", { x: 0, y: 0, width: reviewedW, height: 10, rx: 5, fill: overviewColors.teal }));
    if (decidedW > 0) svg.append(svgElement("rect", { x: 0, y: 0, width: decidedW, height: 10, rx: 5, fill: overviewColors.green }));
    row.append(top, svg);
    list.append(row);
  }
  const legend = element("div", "assessor-legend");
  for (const [label, color] of [["Total applications", "#c7d8ee"], ["With reviews", overviewColors.teal], ["Outcome released", overviewColors.green]]) {
    const item = element("span", "assessor-legend-item");
    const dot = svgElement("svg", { viewBox: "0 0 10 10", class: "assessor-dot-svg", "aria-hidden": "true" });
    dot.append(svgElement("circle", { cx: 5, cy: 5, r: 5, fill: color }));
    item.append(dot, document.createTextNode(label));
    legend.append(item);
  }
  const wrap = element("div", "assessor-sector-wrap");
  wrap.append(list, legend);
  return wrap;
}

function renderDeadlineHealth(deadlines) {
  const entries = [
    ["Overdue", deadlines.overdue, overviewColors.rust],
    ["Due ≤48h", deadlines.dueSoon, overviewColors.amber],
    ["On track", deadlines.onTrack, overviewColors.green],
    ["On hold", deadlines.onHold, overviewColors.purple],
  ];
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const strip = element("div", "assessor-health-strip");
  strip.append(element("h3", "assessor-subheading", "Round deadline health"));
  const bar = svgElement("svg", {
    viewBox: "0 0 300 10", class: "assessor-bar-svg", preserveAspectRatio: "none", role: "img",
    "aria-label": entries.map(([label, count]) => `${label}: ${count}`).join(", "),
  });
  bar.append(svgElement("rect", { x: 0, y: 0, width: 300, height: 10, rx: 5, fill: "#efe9e1" }));
  let x = 0;
  for (const [, count, color] of entries) {
    if (!count || !total) continue;
    const width = Math.max(4, Math.round((count / total) * 300));
    bar.append(svgElement("rect", { x, y: 0, width: Math.min(width, 300 - x), height: 10, rx: 2, fill: color }));
    x += width;
  }
  const pills = element("div", "assessor-health-pills");
  for (const [label, count, color] of entries) {
    const pill = element("div", "assessor-health-pill");
    const dot = svgElement("svg", { viewBox: "0 0 10 10", class: "assessor-dot-svg", "aria-hidden": "true" });
    dot.append(svgElement("circle", { cx: 5, cy: 5, r: 5, fill: color }));
    pill.append(dot, element("span", "", label), element("strong", "", String(count)));
    pills.append(pill);
  }
  strip.append(bar, pills);
  return strip;
}

function renderActionQueue(entries) {
  const box = element("div", "assessor-case-list");
  if (!entries.length) return notes("All panel assignments and decisions are up to date.");
  for (const entry of entries.slice(0, 6)) {
    const { item } = entry;
    const tab = entry.targetTab === "Decision" ? "decision" : "panel";
    const row = link("", caseHref(item, tab, "overview"), "assessor-case-link");
    const copy = element("span");
    copy.append(element("strong", "", item.title), element("small", "", `${item.reference} · ${entry.detail}`));
    row.append(copy, element("span", `assessor-pill assessor-pill-${entry.tone}`, entry.badge));
    box.append(row);
  }
  return box;
}

function renderLeadOverview(profile, cases, staff) {
  const summary = buildLeadOverview(cases, staff);
  const headerAction = link("Open application library", "#library", "admin-cta");
  const header = heading(
    "Overview",
    `${formatAssessorRole(profile)} · ${summary.activeApplications} active application${summary.activeApplications === 1 ? "" : "s"} · ${summary.staffCount} active assessor${summary.staffCount === 1 ? "" : "s"}`,
    headerAction
  );

  const kpis = element("div", "assessor-kpi-grid");
  kpis.append(
    kpiCard({
      label: "New applications",
      value: summary.newApplications.count,
      badge: summary.newApplications.stagedCount ? `${summary.newApplications.stagedCount} staged` : undefined,
      caption: summary.newApplications.count ? "Open in library to set panel" : summary.newApplications.stagedCount ? "Staged panels ready to start" : "No unassigned submissions",
      href: "#library",
      color: overviewColors.blue,
      sparkHeights: [6, 10, 8, 14, Math.max(8, summary.newApplications.totalIntake * 4)],
    }),
    kpiCard({
      label: "Action needed",
      value: summary.decisions.count,
      badge: "Decisions",
      caption: summary.decisions.count
        ? `${summary.decisions.closedCount} to release · ${summary.decisions.votingCount} voting · ${summary.decisions.readyForVoteCount} vote-ready`
        : "No decisions awaiting action",
      href: "#library",
      color: overviewColors.rust,
      sparkHeights: [9, 14, 11, 18, Math.max(8, summary.decisions.count * 5)],
    }),
    kpiCard({
      label: "Submitted reviews",
      value: `${summary.reviews.reviewedAppsCount} / ${summary.reviews.totalAppsCount}`,
      caption: `${summary.reviews.totalSubmittedReviews} of ${summary.reviews.totalAssignedSlots} assessor reviews submitted`,
      href: "#progress",
      color: overviewColors.teal,
      ringPct: summary.reviews.coveragePct,
    }),
    kpiCard({
      label: "Outcomes decided",
      value: summary.outcomes.decidedCount,
      badge: summary.outcomes.decidedCount ? `${summary.outcomes.approvalRatePct}% approved` : undefined,
      caption: `${summary.outcomes.approved} approved · ${summary.outcomes.rejected} rejected`,
      href: "#library",
      color: overviewColors.green,
      sparkHeights: [7, 11, 15, 13, Math.max(8, summary.outcomes.decidedCount * 5)],
    })
  );

  const visualRow1 = element("div", "assessor-visual-grid");
  const pipelineCard = element("section", "admin-overview-panel");
  const pipelineLayout = element("div", "assessor-visual-split");
  pipelineLayout.append(
    donutVisual(
      summary.pipeline.map(entry => ({ value: entry.count, color: entry.color })),
      summary.totalApplications,
      "Applications",
      `Application pipeline: ${summary.pipeline.map(entry => `${entry.label} ${entry.count}`).join(", ")}`
    ),
    barRows(summary.pipeline, summary.totalApplications)
  );
  pipelineCard.append(panelHeader("Application pipeline", "View library", "#library"), pipelineLayout);

  const reviewCard = element("section", "admin-overview-panel");
  const coverageTop = element("div", "assessor-visual-split assessor-coverage-top");
  const coverageStats = element("div", "assessor-coverage-stats");
  coverageStats.append(
    facts([
      ["Applications with reviews", `${summary.reviews.reviewedAppsCount} of ${summary.reviews.totalAppsCount}`],
      ["Fully reviewed panels", `${summary.reviews.fullyReviewedAppsCount} application${summary.reviews.fullyReviewedAppsCount === 1 ? "" : "s"}`],
      ["Assessor reviews submitted", `${summary.reviews.totalSubmittedReviews} of ${summary.reviews.totalAssignedSlots}`],
    ])
  );
  coverageTop.append(
    donutVisual(
      [
        { value: summary.reviews.reviewedAppsCount, color: overviewColors.teal },
        { value: Math.max(0, summary.reviews.totalAppsCount - summary.reviews.reviewedAppsCount), color: "#efe9e1" },
      ],
      `${summary.reviews.reviewedAppsCount}/${summary.reviews.totalAppsCount}`,
      "Apps reviewed",
      `${summary.reviews.reviewedAppsCount} of ${summary.reviews.totalAppsCount} applications received assessor reviews`
    ),
    coverageStats
  );
  reviewCard.append(
    panelHeader("Review progress & funnel", "Track progress", "#progress"),
    coverageTop,
    element("h3", "assessor-subheading", "Workflow stage distribution"),
    barRows(summary.funnel, summary.activeApplications)
  );
  visualRow1.append(pipelineCard, reviewCard);

  const visualRow2 = element("div", "assessor-visual-grid");
  const sectorCard = element("section", "admin-overview-panel");
  sectorCard.append(
    panelHeader("Sector workload & deadlines", "Reports", "#reports"),
    renderSectorBars(summary.sectors),
    renderDeadlineHealth(summary.deadlines)
  );

  const queueCard = element("section", "admin-overview-panel");
  queueCard.append(
    panelHeader("Decisions & lead action queue", "Open library", "#library"),
    renderActionQueue(summary.actionQueue)
  );
  visualRow2.append(sectorCard, queueCard);

  const nodes = [header, kpis, visualRow1, visualRow2];
  if (summary.personalTasks.length) {
    nodes.push(listPanel("My personal review tasks", summary.personalTasks, item => item.roundState === "voting" ? "decision" : "review", "overview", false));
  }
  view.replaceChildren(...nodes);
}

function renderStandardOverview(profile, cases) {
  const summary = buildAssessorOverview(cases);
  const header = heading(
    "Overview",
    `${formatAssessorRole(profile)} · Check your assigned applications, conflict declarations and upcoming deadlines.`,
    link("My assessments", "#assessments", "admin-cta")
  );
  const kpis = element("div", "assessor-kpi-grid");
  kpis.append(
    kpiCard({ label: "Assigned to me", value: summary.assignedCount, caption: "Active case assignments", href: "#assessments", color: overviewColors.blue }),
    kpiCard({ label: "Declaration due", value: summary.declarationDueCount, caption: "Confirm no conflict before reading", href: "#assessments", color: overviewColors.purple }),
    kpiCard({ label: "Open to review", value: summary.toReviewCount, caption: `${summary.inProgressCount} started`, href: "#assessments", color: overviewColors.amber }),
    kpiCard({ label: "Submitted reviews", value: `${summary.submittedCount} / ${summary.assignedCount}`, caption: "Completed assessments", href: "#assessments", color: overviewColors.green, ringPct: summary.completionPct })
  );
  const progressPanel = element("section", "admin-overview-panel");
  const layout = element("div", "assessor-visual-split");
  layout.append(
    donutVisual(
      summary.breakdown.map(entry => ({ value: entry.count, color: entry.color })),
      `${summary.completionPct}%`,
      "Submitted",
      `Assessment completion ${summary.completionPct}%`
    ),
    barRows(summary.breakdown, summary.assignedCount)
  );
  progressPanel.append(panelHeader("My review progress", "Open assessments", "#assessments"), layout);
  view.replaceChildren(
    header,
    kpis,
    progressPanel,
    listPanel("Next actions", summary.nextActions, item => item.roundState === "voting" ? "decision" : "review", "overview", false)
  );
}

function focusTitle() { view.querySelector("h1")?.focus({ preventScroll: true }); }

function renderMyAssessments(cases, isLead) {
  const summary = buildMyAssessmentsSummary(cases, isLead);
  const subtitle = isLead
    ? "Track received applications across To review, In progress, and Submitted."
    : "Review your assigned applications and track saved or submitted reviews.";
  const header = heading("My assessments", subtitle, isLead ? link("Open application library", "#library", "admin-button-secondary") : undefined);

  let stage = "all";
  const stageButtons = new Map();
  const listTitle = element("h2", "", isLead ? "Applications received" : "Assigned applications");
  const countNote = element("p", "admin-help", "");
  const list = element("div", "assessor-case-list");

  const toolbar = filterToolbar({
    cases: summary.items,
    context: "assessments",
    onChange: () => applyFilters(),
  });

  function applyFilters() {
    for (const [key, control] of stageButtons) {
      control.setAttribute("aria-pressed", String(key === stage));
    }
    const { query, status, industry } = toolbar.read();
    const filtered = summary.items.filter(item => {
      if (stage === "mine" && !item.assigned) return false;
      if (["to-review", "in-progress", "submitted", "previous"].includes(stage) && assessmentBucket(item, isLead) !== stage) return false;
      if (status && status !== workStatus(item, "assessments")) return false;
      if (industry && industry !== item.sector) return false;
      return `${item.title} ${item.reference} ${item.sector}`.toLocaleLowerCase().includes(query);
    });
    countNote.textContent = `Showing ${filtered.length} of ${summary.totalCount} application${summary.totalCount === 1 ? "" : "s"}`;
    showCases(list, filtered, item => item.assigned ? "review" : "application", "assessments");
  }

  function selectStage(nextStage) {
    stage = nextStage;
    applyFilters();
  }

  const pillBar = element("div", "assessor-pill-tabs");
  pillBar.setAttribute("role", "group");
  pillBar.setAttribute("aria-label", "Filter assessments by progress");
  const pillDefs = [
    ["all", `All (${summary.totalCount})`],
    ["to-review", `To review (${summary.toReview.length})`],
    ["in-progress", `In progress (${summary.inProgress.length})`],
    ["submitted", `Submitted (${summary.submitted.length})`],
  ];
  if (summary.previous.length) pillDefs.push(["previous", `Previous / recused (${summary.previous.length})`]);
  if (isLead && summary.assignedCount > 0) pillDefs.push(["mine", `Assigned to me (${summary.assignedCount})`]);
  for (const [key, text] of pillDefs) {
    const pill = button(text, () => selectStage(key), "assessor-pill-tab");
    pill.setAttribute("aria-pressed", String(key === "all"));
    stageButtons.set(key, pill);
    pillBar.append(pill);
  }

  const directory = element("section", "admin-overview-panel assessor-directory");
  const dirTop = element("div", "assessor-directory-head");
  dirTop.append(listTitle, countNote);
  directory.append(dirTop, pillBar);
  if (summary.items.length) directory.append(toolbar.element);
  directory.append(list);

  applyFilters();
  view.replaceChildren(header, directory);
}

function renderApplicationLibrary(cases, isLead) {
  const counts = buildLibrarySummary(cases);
  const subtitle = isLead
    ? "Review incoming applications by status and industry, open any application, and assign assessors."
    : "Browse industry applications and open the applications assigned to you.";
  const header = heading("Application library", subtitle);

  let category = "all";
  const pillButtons = new Map();
  const countNote = element("p", "admin-help", "");
  const list = element("div", "assessor-case-list");

  const toolbar = filterToolbar({
    cases,
    context: "library",
    onChange: () => applyFilters(),
  });

  function applyFilters() {
    for (const [key, control] of pillButtons) {
      control.setAttribute("aria-pressed", String(key === category));
    }
    const { query, status, industry } = toolbar.read();
    const filtered = cases.filter(item => {
      if (category === "assigned" && !item.assigned) return false;
      if (["new", "review", "approved", "awarded", "rejected"].includes(category) && libraryCategory(item) !== category) return false;
      if (status && status !== workStatus(item, "library")) return false;
      if (industry && industry !== item.sector) return false;
      return `${item.title} ${item.reference} ${item.sector}`.toLocaleLowerCase().includes(query);
    });
    countNote.textContent = `Showing ${filtered.length} of ${cases.length} application${cases.length === 1 ? "" : "s"}`;
    showCases(list, filtered, "application", "library");
  }

  const pillBar = element("div", "assessor-pill-tabs");
  pillBar.setAttribute("role", "group");
  pillBar.setAttribute("aria-label", "Filter applications by stage");
  const defs = [
    ["all", `All (${counts.all})`],
    ["new", `New (${counts.new})`],
    ["review", `Under review (${counts.review})`],
    ["approved", `Approved (${counts.approved})`],
    ...(counts.awarded > 0 ? [["awarded", `Awarded (${counts.awarded})`]] : []),
    ["rejected", `Rejected (${counts.rejected})`],
  ];
  if (!isLead) defs.push(["assigned", `Assigned to me (${counts.assignedToMe})`]);
  for (const [key, text] of defs) {
    const pill = button(text, () => { category = key; applyFilters(); }, "assessor-pill-tab");
    pill.setAttribute("aria-pressed", String(key === "all"));
    pillButtons.set(key, pill);
    pillBar.append(pill);
  }

  const directory = element("section", "admin-overview-panel assessor-directory");
  const dirTop = element("div", "assessor-directory-head");
  dirTop.append(element("h2", "", "Applications"), countNote);
  directory.append(dirTop, pillBar);
  if (cases.length) directory.append(toolbar.element);
  directory.append(list);

  applyFilters();
  view.replaceChildren(header, directory);
}

function renderPage(section) {
  const { cases = [], profile, staff = [] } = state.workspace;
  const managed = cases.filter(item => item.canManage);
  const discussionCases = cases.filter(item => item.roundId && (item.canManage || item.conflict === "cleared"));
  const allAccessibleCases = cases.filter(item => item.canManage || item.assigned || item.roundId);
  const lists = {
    discussion: ["Messages & discussion", "Select an application conversation to read messages and send a reply to the panel.", discussionCases.length ? discussionCases : allAccessibleCases, "discussion"],
    progress: ["Review progress", "Track declarations, review submissions and assessment deadlines.", managed.filter(item => item.roundId), "panel"],
  };
  if (section === "assessments") {
    renderMyAssessments(cases, Boolean(profile.lead));
  } else if (section === "library") {
    renderApplicationLibrary(cases, Boolean(profile.lead));
  } else if (lists[section]) {
    const [title, description, rows, tab] = lists[section];
    view.replaceChildren(heading(title, description));
    if (section === "discussion") {
      renderDiscussionWorkspace(rows);
    } else view.append(listPanel("Applications", rows, tab, section));
  } else if (section === "overview") {
    if (profile.lead) renderLeadOverview(profile, cases, staff);
    else renderStandardOverview(profile, cases);
  } else if (section === "guidance") {
    const rubricMeta = state.workspace?.rubric || {};
    const activeRubric = activeRubricList();
    const threshold = Number(rubricMeta.passThreshold ?? 60);
    const version = Number(rubricMeta.version ?? 1);
    const rubric = element("ol", "assessor-list assessor-guidance-rubric");
    for (const item of activeRubric) {
      const entry = element("li", "assessor-guidance-criterion");
      const head = element("div", "assessor-guidance-criterion-head");
      head.append(element("strong", "", item.label), element("span", "assessor-weight-pill", `${Number(item.weight)}% weight`));
      entry.append(head);
      if (item.description) entry.append(element("p", "assessor-guidance-criterion-desc", item.description));
      rubric.append(entry);
    }
    view.replaceChildren(
      heading("Guidance", "Review the active weighted scoring criteria and assessment process."),
      panel(
        `Assessment rubric · v${version} (${activeRubric.length} criteria · ${threshold}% benchmark)`,
        notes("Give each criterion a score from 1 to 5 and explain the score with evidence from the application. Ratings are weighted to total 100%."),
        rubric
      ),
      panel("Review process", notes(`Declare a conflict before opening evidence. Save a draft as you work and submit when all ${activeRubric.length} active criteria have been scored. Follow the panel discussion and vote when the Lead Assessor opens voting.`))
    );
  } else if (section === "notifications") {
    const actionItems = cases.filter(item => item.assigned && (item.conflict === "pending" || (item.conflict === "cleared" && ((item.roundState === "review" && !item.submitted) || (item.roundState === "voting" && item.submitted)))));
    view.replaceChildren(heading("Notifications", "See current reminders based on your assignments."),
      listPanel("Assignment reminders", actionItems, item => item.roundState === "voting" ? "decision" : "review", "notifications", false));
  } else if (section === "reports") {
    renderReports(cases, managed, staff);
  } else if (section === "settings") {
    view.replaceChildren(heading("Account & security"),
      panel("Your account", facts([["Full name", profile.name], ["Email", state.profile.email || ""], ["Role", formatAssessorRole(profile)]])),
      authenticatorPanel(), passwordPanel(), sessionPanel());
  }
}

function reportRingItem(pct, label, sublabel, color) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));
  const dash = (clamped / 100) * circumference;
  const item = element("div", "assessor-ring-stat");
  const ringWrap = element("div", "assessor-ring-stat-wrap");
  const svg = svgElement("svg", {
    viewBox: "0 0 84 84",
    class: "assessor-ring-stat-svg",
    role: "img",
    "aria-label": `${label}: ${clamped}%`,
  });
  svg.append(svgElement("circle", { cx: 42, cy: 42, r: radius, fill: "none", stroke: "#efe9e1", "stroke-width": 8 }));
  if (clamped > 0) {
    svg.append(svgElement("circle", {
      cx: 42, cy: 42, r: radius, fill: "none", stroke: color, "stroke-width": 8, "stroke-linecap": "round",
      "stroke-dasharray": `${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}`, transform: "rotate(-90 42 42)",
    }));
  }
  ringWrap.append(svg, element("strong", "assessor-ring-stat-pct", `${clamped}%`));
  item.append(ringWrap, element("span", "assessor-ring-stat-label", label), element("small", "assessor-ring-stat-sub", sublabel));
  return item;
}

function renderReports(cases, managed, staff) {
  const scopeCases = managed.length ? managed : cases;
  const summary = buildLeadOverview(scopeCases, staff);
  const header = heading(
    "Reports",
    "Assessment workload and outcomes across all industries.",
    link("Open library", "#library", "admin-button-secondary")
  );

  const decidedPct = summary.totalApplications
    ? Math.round((summary.outcomes.decidedCount / summary.totalApplications) * 100)
    : 0;

  const visualRow = element("div", "assessor-visual-grid");

  const summaryCard = element("section", "admin-overview-panel");
  const ringsRow = element("div", "assessor-rings-row");
  ringsRow.append(
    reportRingItem(
      summary.reviews.coveragePct,
      "Review coverage",
      `${summary.reviews.reviewedAppsCount} of ${summary.reviews.totalAppsCount} apps`,
      overviewColors.teal
    ),
    reportRingItem(
      decidedPct,
      "Outcomes released",
      `${summary.outcomes.decidedCount} of ${summary.totalApplications} cases`,
      overviewColors.blue
    ),
    reportRingItem(
      summary.outcomes.approvalRatePct,
      "Approval rate",
      summary.outcomes.awarded
        ? `${summary.outcomes.approved} approved · ${summary.outcomes.awarded} awarded · ${summary.outcomes.rejected} rejected`
        : `${summary.outcomes.approved} approved · ${summary.outcomes.rejected} rejected`,
      overviewColors.green
    )
  );
  summaryCard.append(panelHeader("Assessment summary", "Review progress", "#progress"), ringsRow);

  const outcomesCard = element("section", "admin-overview-panel");
  const outcomesSplit = element("div", "assessor-visual-split");
  outcomesSplit.append(
    donutVisual(
      summary.pipeline.map(entry => ({ value: entry.count, color: entry.color })),
      summary.totalApplications,
      "Total cases",
      `Pipeline distribution: ${summary.pipeline.map(entry => `${entry.label} ${entry.count}`).join(", ")}`
    ),
    barRows(summary.pipeline, summary.totalApplications)
  );
  outcomesCard.append(panelHeader("Pipeline overview", "View all", "#library"), outcomesSplit);
  visualRow.append(summaryCard, outcomesCard);

  const totals = new Map();
  for (const item of managed) {
    const sector = item.sector || "Sector pending";
    const row = totals.get(sector) || { cases: 0, reviews: 0, released: 0, reviewedCases: 0 };
    row.cases += 1;
    row.reviews += item.reviewCount || 0;
    if ((item.reviewCount || 0) > 0) row.reviewedCases += 1;
    if (["released", "awarded"].includes(item.roundState) || ["Approved", "Awarded", "Rejected"].includes(item.status)) {
      row.released += 1;
    }
    totals.set(sector, row);
  }

  const nodes = [header, visualRow];
  if (totals.size) {
    const sectorGrid = element("div", "assessor-reports-grid");
    for (const [sector, row] of totals) {
      const card = element("section", "admin-overview-panel assessor-report-card");
      const top = element("div", "assessor-report-head");
      top.append(
        element("h2", "", sector),
        element("span", "assessor-pill assessor-pill-teal", `${row.released}/${row.cases} released`)
      );

      const bar = svgElement("svg", {
        viewBox: "0 0 240 6", class: "assessor-bar-svg", preserveAspectRatio: "none",
        role: "img", "aria-label": `${sector}: ${row.cases} cases, ${row.reviewedCases} with reviews, ${row.released} released`,
      });
      bar.append(svgElement("rect", { x: 0, y: 0, width: 240, height: 6, rx: 3, fill: "#efe9e1" }));
      const reviewedW = row.cases ? Math.round((row.reviewedCases / row.cases) * 240) : 0;
      const releasedW = row.cases ? Math.round((row.released / row.cases) * 240) : 0;
      if (reviewedW > 0) bar.append(svgElement("rect", { x: 0, y: 0, width: reviewedW, height: 6, rx: 3, fill: overviewColors.teal }));
      if (releasedW > 0) bar.append(svgElement("rect", { x: 0, y: 0, width: releasedW, height: 6, rx: 3, fill: overviewColors.green }));

      card.append(
        top,
        bar,
        metricCards([
          ["Cases", row.cases],
          ["Submitted reviews", row.reviews],
          ["Released", row.released],
        ])
      );
      sectorGrid.append(card);
    }
    nodes.push(sectorGrid);
  } else {
    nodes.push(panel("Sector activity", notes("No applications are available in your scope.")));
  }
  view.replaceChildren(...nodes);
}

function passwordPanel() {
  const form = element("form", "admin-form");
  const password = input("password", "password");
  const confirm = input("confirmation", "password");
  for (const control of [password, confirm]) {
    control.autocomplete = "new-password";
    control.minLength = 12;
    control.required = true;
  }
  const submit = submitButton("Update password", "password");
  form.append(field("New password", password), field("Confirm new password", confirm), submit);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (submit.disabled) return;
    if (password.value !== confirm.value) return announce("The passwords do not match.", true);
    if (new TextEncoder().encode(password.value).length > 72) return announce("Choose a password up to 72 bytes.", true);
    submit.disabled = true;
    try {
      await request("/auth/v1/user", { password: password.value }, "PUT");
      announce("Password updated.");
    } catch (error) { announce(error.message, true); }
    finally { form.reset(); submit.disabled = false; }
  });
  return panel("Password", notes("Choose at least 12 characters."), form);
}

function sessionPanel() {
  const others = button("Sign out other devices", async () => {
    if (!window.confirm("End your other CEDA sessions?")) return;
    others.disabled = true;
    try {
      await request("/auth/v1/logout?scope=others");
      announce("Other sessions signed out.");
    } catch (error) { announce(error.message, true); }
    finally { others.disabled = false; }
  });
  const actions = element("div", "assessor-actions");
  actions.append(button("Log out", signOut), others);
  return panel("Sessions", actions);
}

function verifiedSession() {
  try {
    const payload = accountToken().split(".")[1].replaceAll("-", "+").replaceAll("_", "/");
    return JSON.parse(atob(payload)).aal === "aal2";
  } catch { return false; }
}

function authenticatorPanel() {
  const verified = verifiedSession();
  const copy = notes(verified ? "This session is verified with your authenticator." : "Verify this session with an authenticator app.");
  const setup = element("div");
  let factorId;
  let started = false;
  const begin = button("Set up or verify authenticator", async () => {
    begin.disabled = true;
    try {
      const user = await request("/auth/v1/user", undefined, "GET");
      const factors = (user.factors || []).filter(factor => factor.factor_type === "totp");
      factorId = factors.find(factor => factor.status === "verified")?.id;
      if (!factorId) {
        for (const pending of factors.filter(factor => factor.status === "unverified")) {
          await request(`/auth/v1/factors/${encodeURIComponent(pending.id)}`, undefined, "DELETE");
        }
        const result = await request("/auth/v1/factors", { factor_type: "totp", friendly_name: "CEDA Assessor" });
        const qrCode = result?.totp?.qr_code;
        if (!result?.id || !qrCode) throw new Error("Authenticator setup is unavailable. Try again.");
        factorId = result.id;
        const qr = element("img", "assessor-mfa-qr");
        qr.alt = "Authenticator setup QR code";
        qr.src = qrCode.startsWith("data:image/") ? qrCode : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrCode)}`;
        setup.append(notes("Scan this code or use the setup key in your authenticator app."), qr);
        if (result.totp.secret) setup.append(element("p", "", result.totp.secret.match(/.{1,4}/g).join(" ")));
      }
      started = true;
      form.hidden = false;
      code.focus();
    } catch (error) { announce(error.message, true); }
    finally { begin.disabled = started; }
  });
  const form = element("form", "admin-form");
  form.hidden = true;
  const code = input("code", "text");
  code.inputMode = "numeric";
  code.autocomplete = "one-time-code";
  code.pattern = "[0-9]{6}";
  code.maxLength = 6;
  code.required = true;
  const verify = submitButton("Verify this session", "verify");
  form.append(field("Six digit code", code), verify);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!factorId || verify.disabled) return;
    verify.disabled = true;
    try {
      const path = `/auth/v1/factors/${encodeURIComponent(factorId)}`;
      const challenge = await request(`${path}/challenge`, {});
      const result = await request(`${path}/verify`, { challenge_id: challenge.id, code: code.value });
      if (!result?.access_token || !saveAccountToken(result.access_token)) throw new Error("The verified session could not be saved. Sign in again.");
      await renderRoute();
      announce("Authenticator verification complete.");
    } catch (error) { announce(error.message, true); }
    finally { code.value = ""; verify.disabled = false; }
  });
  return panel("Authenticator", copy, ...(verified ? [] : [begin, setup, form]));
}

function field(label, control) {
  const wrapper = element("label");
  wrapper.append(element("span", "", label), control);
  return wrapper;
}

function input(name, type, value = "") {
  const node = element("input");
  node.type = type;
  node.name = name;
  node.value = value;
  return node;
}

function area(name, value = "", limit = 2000) {
  const node = element("textarea");
  node.name = name;
  node.value = value;
  node.rows = 3;
  node.maxLength = limit;
  return node;
}

function submitButton(text, value, secondary = false) {
  const node = element("button", secondary ? "admin-button-secondary" : "admin-cta", text);
  node.type = "submit";
  node.value = value;
  return node;
}

function actionForm(item, action, label, read, fields, onSaved, onFailure) {
  const form = element("form", "admin-form");
  const controls = element("div", "admin-form-actions admin-form-wide");
  controls.append(submitButton(label, action));
  form.append(...fields, controls);
  form.addEventListener("submit", event => {
    event.preventDefault();
    void sendAction(item, action, () => read(new FormData(form)), event.submitter, onSaved, null, onFailure);
  });
  return form;
}

function basicAction(item, action, label, confirmText) {
  return button(label, event => {
    if (!confirmText || window.confirm(confirmText)) void sendAction(item, action, () => ({}), event.currentTarget);
  });
}

function reasonForm(item, action, label) {
  const reason = area("reason", "", 1000);
  reason.required = true;
  return actionForm(item, action, label, data => ({ reason: String(data.get("reason")).trim() }), [field("Reason", reason)]);
}

function renderApplication(detail, from = "library") {
  const application = detail.application;
  const item = detail.case;
  if (!application?.summary && !Object.keys(application?.formData || {}).length) {
    return item.conflict === "pending" ? renderReview(detail) : panel("Application", notes("The submission is unavailable for this assignment."));
  }
  const documents = detail.documents || [];
  const steps = buildReviewSteps({ title: item.title, summary: application.summary, ...application.formData }, documents);
  const reviewed = new Set(detail.reviewedSteps || []);
  const stepIndex = steps.findIndex((_, index) => !reviewed.has(index + 1));
  const position = reviewPositions.get(item.roundId || item.id) ?? (stepIndex < 0 ? 0 : stepIndex);
  const section = steps[position];
  const editable = item.conflict === "cleared" && item.roundState === "review" && !item.submitted && !item.hold &&
    (!item.deadline || new Date(item.deadline) > new Date());
  const content = element("div", "assessor-step-content");
  function go(index) {
    reviewPositions.set(item.roundId || item.id, index);
    renderCase(detail, "application", from);
    view.querySelector(".assessor-step-content h2")?.focus();
  }
  const stepNav = element("nav", "assessor-step-nav");
  stepNav.setAttribute("aria-label", "Application steps");
  steps.forEach((step, index) => {
    const target = link(`${index + 1}. ${step.title}${reviewed.has(index + 1) ? " ✓" : ""}`, caseHref(item, "application", from), "assessor-text-link");
    const complete = reviewed.has(index + 1);
    target.className = `assessor-step-link${complete ? " is-complete" : ""}`;
    target.replaceChildren(element("span", "assessor-step-dot", complete ? "✓" : String(index + 1)), element("span", "assessor-step-label", step.title));
    if (position === index) target.setAttribute("aria-current", "step");
    target.addEventListener("click", event => { event.preventDefault(); go(index); });
    stepNav.append(target);
  });
  const recommendationStep = link("13. Scoring, comments & recommendation", caseHref(item, "review", from), `assessor-step-link assessor-step-final${item.submitted ? " is-complete" : ""}`);
  recommendationStep.replaceChildren(element("span", "assessor-step-dot", item.submitted ? "✓" : "13"), element("span", "assessor-step-label", "Scoring, comments & recommendation"));
  stepNav.append(recommendationStep);
  function evidence(id) {
    const doc = documents.find(row => row.id === id);
    const row = element("div", "assessor-inline-evidence");
    row.append(element("span", "", doc.title));
    if (doc.storagePath) {
      row.append(button("View document", event => void openDocument(doc, event.currentTarget, detail), "assessor-document-action"));
    } else {
      let url;
      try { url = new URL(doc.videoUrl); } catch { /* Missing or invalid evidence link. */ }
      if (url?.protocol === "https:") {
        const anchor = link("Open link", url.href, "assessor-text-link");
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        row.append(anchor);
      }
    }
    row.append(annotationControls(detail, `document:${id}`, doc.title));
    return row;
  }
  const title = element("h2", "", section.title);
  title.tabIndex = -1;
  content.append(element("p", "admin-help", `Step ${position + 1} of ${steps.length} · ${reviewed.size} reviewed`), title);
  for (const answer of section.answers) {
    const row = element("section", "assessor-answer");
    const top = element("div", "assessor-answer-title");
    top.append(element("h3", "", answer.label), annotationControls(detail, `field:${answer.key}`, answer.label));
    row.append(top);
    if (answer.value) row.append(element("p", "assessor-answer-text", answer.value));
    row.append(...answer.documentIds.map(evidence));
    content.append(row);
  }
  content.append(...section.documentIds.map(evidence));
  if (!section.answers.length && !section.documentIds.length) content.append(notes("No answers or attachments were submitted in this step."));
  const navigation = element("div", "assessor-step-footer");
  if (position > 0) navigation.append(button("Previous step", () => go(position - 1), "assessor-text-link"));
  if (editable && !reviewed.has(position + 1)) {
    navigation.append(button(position === steps.length - 1 ? "Save & continue" : "Save & next", event => {
      const next = Math.min(position + 1, steps.length - 1);
      void sendAction(item, "review-step", () => ({ step: position + 1 }), event.currentTarget,
        () => {
          reviewPositions.set(item.roundId || item.id, next);
          if (position === steps.length - 1) location.hash = caseHref(item, "review", from);
        });
    }, "admin-cta"));
  } else if (position < steps.length - 1) navigation.append(button("Next step", () => go(position + 1), "assessor-text-link"));
  if (position === steps.length - 1 && item.assigned) navigation.append(link("Go to my review", caseHref(item, "review", from), "assessor-text-link"));
  content.append(navigation);
  const layout = element("div", "assessor-guided-review");
  layout.append(stepNav, content);
  return layout;
}

function openCaseChat(detail) {
  const dialog = element("dialog", "assessor-thread assessor-chat-drawer");
  const render = current => dialog.replaceChildren(
    button("Close discussion", () => dialog.close(), "assessor-text-link"),
    renderDiscussion(current, render)
  );
  render(detail);
  document.body.append(dialog);
  dialog.addEventListener("close", () => { stopDiscussionPolling(); dialog.remove(); }, { once: true });
  dialog.showModal();
  void markDiscussionRead(detail.case);
}

async function markDiscussionRead(item) {
  if (!item.roundId) return;
  try {
    await rpc("assessor_action", { p_case_id: item.id, p_round_id: item.roundId, p_action: "read-discussion", p_data: {} });
    const row = state.workspace.cases.find(entry => entry.id === item.id);
    if (row) row.unreadCount = 0;
  } catch { /* Retry when this conversation is next opened. */ }
}

function annotationControls(detail, anchor, label) {
  const item = detail.case;
  const thread = (detail.annotations || []).filter(entry => entry.anchor === anchor);
  const canComment = item.roundId && !item.hold && ["review", "voting"].includes(item.roundState)
    && (item.conflict === "cleared" || (!item.assigned && item.canManage));
  const controls = element("div", "assessor-annotation-controls");
  if (!thread.length && !canComment) return controls;
  function open(author) {
    const dialog = element("dialog", "assessor-thread");
    const close = button("Close", () => dialog.close(), "assessor-text-link");
    dialog.append(close, element("h2", "", label));
    const formHost = element("div");
    const feedback = element("p", "assessor-error");
    feedback.setAttribute("role", "alert");
    const compose = parentId => {
      const body = area("body", "", 4000);
      body.required = true;
      feedback.textContent = "";
      const commentForm = actionForm(item, "annotate", parentId ? "Save reply" : "Save comment", data =>
        ({ anchor, parentId, body: String(data.get("body")).trim() }),
      [field(parentId ? "Reply" : "Comment", body)], () => {
        dialog.close();
        if (evidenceDialog?.open) evidenceDialog.close();
      }, error => { feedback.textContent = error; });
      commentForm.classList.add("assessor-comment-composer");
      formHost.replaceChildren(commentForm);
      body.focus();
    };
    for (const entry of thread) {
      const message = element("article", "assessor-comment");
      message.append(element("strong", "", entry.name), element("p", "assessor-answer-text", entry.body));
      if (entry.parentId) {
        const original = thread.find(parent => parent.id === entry.parentId);
        if (original) message.prepend(element("small", "", `Reply to ${original.name}`));
      }
      if (canComment) message.append(button("Reply", () => compose(entry.id), "assessor-text-link"));
      dialog.append(message);
      if (entry.name === author) message.tabIndex = -1;
    }
    const evidenceDialog = controls.closest("dialog.assessor-document");
    dialog.append(formHost, feedback);
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.showModal();
    if (canComment) compose(null);
  }
  for (const name of new Set(thread.map(entry => entry.name))) {
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
    const avatar = button(initials || "•", () => open(name), "assessor-comment-avatar");
    avatar.setAttribute("aria-label", `Read comments by ${name} on ${label}`);
    controls.append(avatar);
  }
  if (canComment) {
    const add = button("+", () => open(), "assessor-comment-avatar");
    add.setAttribute("aria-label", `Comment on ${label}`);
    controls.append(add);
  }
  return controls;
}

async function openDocument(doc, trigger, detail) {
  trigger.disabled = true;
  const path = doc.storagePath.split("/").map(encodeURIComponent).join("/");
  try {
    const response = await fetch(new URL(`/storage/v1/object/sign/innovation-evidence/${path}`, signupConfig.url), {
      method: "POST", headers: sessionHeaders(), body: JSON.stringify({ expiresIn: 120 }),
      cache: "no-store", credentials: "omit", redirect: "error",
    });
    const body = await response.json();
    if (!response.ok || !body.signedURL) throw new Error("This evidence file is unavailable or your access has expired.");
    const url = new URL(`/storage/v1${body.signedURL}`, signupConfig.url);
    const file = await fetch(url, { credentials: "omit", cache: "no-store", redirect: "error" });
    if (!file.ok) throw new Error("The evidence file could not be loaded.");
    const objectUrl = URL.createObjectURL(await file.blob());
    const download = link("Download", objectUrl, "assessor-document-action");
    download.download = typeof doc.fileName === "string" ? doc.fileName : doc.storagePath.split("/").at(-1);
    const dialog = element("dialog", "assessor-thread assessor-document");
    const open = link("Open preview", objectUrl, "assessor-document-action");
    open.target = "_blank";
    open.rel = "noopener noreferrer";
    dialog.append(button("Close", () => dialog.close(), "assessor-text-link"), element("h2", "", doc.title));
    const actions = element("div", "assessor-document-actions");
    actions.append(download);
    if (["application/pdf", "image/jpeg", "image/png"].includes(doc.mimeType)) actions.append(open);
    dialog.append(actions);
    if (["image/jpeg", "image/png"].includes(doc.mimeType)) {
      const preview = element("img");
      preview.src = objectUrl;
      preview.alt = doc.title;
      dialog.append(preview);
    }
    dialog.append(annotationControls(detail, "document:" + doc.id, doc.title));
    document.body.append(dialog);
    dialog.addEventListener("close", () => { dialog.remove(); URL.revokeObjectURL(objectUrl); }, { once: true });
    dialog.showModal();
    announce();
  } catch (error) {
    announce(error.message || "The evidence file could not be opened.", true);
  } finally {
    trigger.disabled = false;
  }
}

function weightedScoreBanner(summary, rubricVersion = 1) {
  const banner = element("div", "assessor-weighted-banner");
  const top = element("div", "assessor-weighted-banner-top");
  const titleGroup = element("div");
  const totalText = summary.weightedTotal !== null
    ? `${summary.weightedTotal}% weighted (${summary.weightedScore}/5)`
    : "No scores entered yet";
  const subText = `Rubric v${rubricVersion} · ${summary.scoredCount} of ${summary.totalCriteria} criteria scored · Pass benchmark ${summary.passThreshold}%`;
  titleGroup.append(element("strong", "", totalText), element("span", "assessor-weighted-banner-sub", subText));
  const pill = element(
    "span",
    `assessor-weight-status${summary.meetsThreshold === true ? " is-pass" : summary.meetsThreshold === false ? " is-below" : ""}`,
    summary.meetsThreshold === true
      ? "Meets benchmark"
      : summary.meetsThreshold === false
        ? "Below benchmark"
        : `${summary.earnedPercentage}% earned so far`
  );
  top.append(titleGroup, pill);
  const meter = document.createElement("progress");
  meter.className = "assessor-weighted-meter";
  meter.max = 100;
  meter.value = Math.min(100, Math.max(0, summary.weightedTotal !== null ? summary.weightedTotal : summary.earnedPercentage));
  banner.append(top, meter);
  return banner;
}

function reviewScoreCards(scores, rubricInput = null, passThreshold = 60, rubricVersion = 1) {
  const grid = element("div", "assessor-review-scores");
  const rubricList = normalizeRubricCriteria(rubricInput || state.workspace?.rubric || defaultAssessmentRubric);
  const rubricKeys = new Set(rubricList.map(item => item.key));
  const extraKeys = [...scores.keys()].filter(key => !rubricKeys.has(key));
  const ordered = [
    ...rubricList.filter(item => scores.has(item.key)).map(item => ({ key: item.key, label: item.label, weight: item.weight })),
    ...extraKeys.map(key => ({ key, label: criterionLabel(key, rubricList), weight: 0 })),
  ];
  const scoreEntries = ordered.map(item => scores.get(item.key));
  const summary = computeWeightedAssessment(scoreEntries, rubricList, passThreshold);
  const wrapper = element("div", "assessor-review-summary-stack");
  if (ordered.length) wrapper.append(weightedScoreBanner(summary, rubricVersion));
  for (const item of ordered) {
    const score = scores.get(item.key);
    const rating = Number(score.rating) || 0;
    const card = element("article", `assessor-review-score score-${rating}`);
    const ring = element("div", "assessor-score-ring");
    ring.setAttribute("aria-label", `${rating} out of 5`);
    ring.append(element("strong", "", String(rating)), element("span", "", "/5"));
    const copy = element("div", "assessor-review-score-copy");
    const titleRow = element("div", "assessor-review-score-head");
    titleRow.append(element("h3", "", item.label));
    if (item.weight > 0) {
      const contrib = ((rating / 5) * item.weight).toFixed(1);
      titleRow.append(element("span", "assessor-weight-pill", `${Number(item.weight)}% weight · +${contrib}%`));
    }
    const reviewNote = element("div", "assessor-review-note");
    const noteIcon = element("span", "assessor-review-note-icon");
    noteIcon.setAttribute("aria-hidden", "true");
    noteIcon.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><path d="M6.75 3.75h7.7l2.8 2.8v13.7H6.75z"/><path d="M14.25 3.75v3h3M9.5 11h5M9.5 14.5h5"/></svg>';
    reviewNote.append(noteIcon, element("p", "", score.rationale || "No comments were recorded."));
    copy.append(titleRow, element("small", "", scoreLabels[rating] || "Unscored"), reviewNote);
    card.append(ring, copy);
    grid.append(card);
  }
  wrapper.append(grid);
  return wrapper;
}

function renderReview(detail) {
  const item = detail.case;
  if (!item.assigned) return panel("My review", notes("This case is outside your personal assignments."));
  if (item.conflict === "recused") return panel("My review", notes("You are recused from this round."));
  if (item.conflict !== "cleared") {
    if (item.hold) return panel("My review", notes("This round is on hold. Conflict declarations will reopen when the round resumes."));
    if (!["setup", "review"].includes(item.roundState)) return panel("My review", notes("Conflict declarations for this round are closed."));
    const select = element("select");
    select.name = "conflict";
    for (const [value, label] of [["", "Select a declaration"], ["cleared", "I have no conflict"], ["recused", "Declare a conflict and recuse myself"]]) select.append(new Option(label, value));
    select.required = true;
    const reason = area("reason", "", 1000);
    select.addEventListener("change", () => { reason.required = select.value === "recused"; });
    return panel("Conflict declaration", notes("Declare any personal, financial or professional interest before reviewing this application."),
      actionForm(item, "declare", "Confirm declaration", data => ({ conflict: data.get("conflict"), reason: String(data.get("reason")).trim() }), [field("Declaration", select), field("Reason for recusal", reason)]));
  }
  const scores = new Map((detail.scores || []).map(score => [score.criterion, score]));
  const roundRubric = activeRubricList(detail);
  const rubricVersion = Number(detail.rubricVersion ?? state.workspace?.rubric?.version ?? 1);
  const passThreshold = Number(detail.passThreshold ?? state.workspace?.rubric?.passThreshold ?? 60);
  const editable = item.roundState === "review" && !item.submitted && !item.hold && (!item.deadline || new Date(item.deadline) > new Date());
  if (!editable) return panel("My review", notes(item.submitted ? "Your review was submitted." : "Scoring opens when the round enters review."),
    reviewScoreCards(scores, roundRubric, passThreshold, rubricVersion), facts([["Final recommendation", labels[detail.ballot] || "Not recorded"], ["Overall comments", detail.overallComment || "None"]]));
  const form = element("form", "admin-form");
  const liveBannerHost = element("div", "admin-form-wide");
  const readDraftEntries = () => {
    const values = new FormData(form);
    return roundRubric.map(c => ({
      criterion: c.key,
      rating: Number(values.get(`${c.key}-rating`)) || null,
      rationale: String(values.get(`${c.key}-rationale`) || "").trim(),
    }));
  };
  const contribBadges = new Map();
  const refreshLiveWeightedBanner = () => {
    const entries = readDraftEntries();
    const summary = computeWeightedAssessment(entries, roundRubric, passThreshold);
    liveBannerHost.replaceChildren(weightedScoreBanner(summary, rubricVersion));
    for (const row of summary.breakdown) {
      const badge = contribBadges.get(row.key);
      if (badge) {
        badge.textContent = row.rating !== null
          ? `${Number(row.weight)}% weight · +${row.weightedContribution}%`
          : `${Number(row.weight)}% weight`;
      }
    }
  };
  form.append(liveBannerHost);
  roundRubric.forEach((criterionItem, index) => {
    const criterion = criterionItem.key;
    const group = element("fieldset", "admin-form-wide assessor-criterion-fieldset");
    const fields = element("div", "assessor-score-fields");
    const score = scores.get(criterion);
    const rating = element("select");
    rating.name = `${criterion}-rating`;
    rating.append(new Option("Select score", ""));
    for (let value = 1; value <= 5; value++) rating.append(new Option(value + " · " + scoreLabels[value], String(value)));
    rating.value = String(score?.rating || "");
    rating.addEventListener("change", refreshLiveWeightedBanner);
    const rationale = area(`${criterion}-rationale`, score?.rationale || "");
    fields.append(field("Score", rating), field("Rationale", rationale));
    const legend = element("legend", "assessor-criterion-legend");
    const weightBadge = element("span", "assessor-weight-pill", `${Number(criterionItem.weight)}% weight`);
    contribBadges.set(criterion, weightBadge);
    legend.append(element("span", "", `${index + 1}. ${criterionItem.label}`), weightBadge);
    group.append(legend);
    if (criterionItem.description) group.append(element("p", "assessor-criterion-guidance", criterionItem.description));
    group.append(fields);
    form.append(group);
  });
  refreshLiveWeightedBanner();
  const controls = element("div", "admin-form-actions admin-form-wide");
  const recommendation = element("select");
  recommendation.name = "choice";
  recommendation.append(new Option("Select your recommendation", ""), ...choiceKeys.map(key => new Option(labels[key], key)));
  recommendation.value = detail.draftChoice || "";
  form.append(field("Final recommendation", recommendation), field("Overall comments", area("overallComment", detail.overallComment || "", 4000)));
  controls.append(submitButton("Save draft", "save", true), submitButton("Submit review", "submit"));
  form.append(controls);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const action = event.submitter?.value || "save";
    const values = new FormData(form);
    const entries = readDraftEntries();
    if (action === "submit" && (entries.some(score => !score.rating || !score.rationale) || !values.get("choice") || detail.reviewedSteps?.length !== 12)) {
      announce(`Review all twelve steps, score all ${roundRubric.length} criteria with rationales, and choose a recommendation.`, true);
      return;
    }
    if (action !== "submit" || window.confirm("Submit and lock this review?")) {
      void sendAction(item, action, () => ({ scores: entries.filter(score => score.rating || score.rationale), choice: values.get("choice"), overallComment: values.get("overallComment") }), event.submitter);
    }
  });
  const reason = area("reason", "", 1000);
  reason.required = true;
  const conflict = element("details");
  conflict.append(element("summary", "", "Declare a conflict and recuse myself"),
    actionForm(item, "declare", "Confirm recusal", data => {
      if (!window.confirm("Recuse yourself from this assessment round?")) return null;
      return { conflict: "recused", reason: String(data.get("reason")).trim() };
    }, [field("Reason for recusal", reason)]));
  return panel("My review", notes("Score every criterion from 1 to 5 and explain how the evidence supports your score."), form, conflict);
}

function discussionMessages(discussion) {
  const messages = element("ol", "assessor-chat");
  let currentDate = "";
  for (const message of discussion || []) {
    const messageDate = chatDate(message.at);
    if (messageDate && messageDate !== currentDate) {
      messages.append(element("li", "assessor-chat-date", messageDate));
      currentDate = messageDate;
    }
    const entry = element("li", `assessor-chat-message${message.mine ? " assessor-chat-mine" : ""}`);
    const avatar = element("span", "assessor-chat-avatar", initials(message.name));
    avatar.setAttribute("aria-hidden", "true");
    const content = element("div", "assessor-chat-content");
    const meta = element("div", "assessor-chat-meta");
    meta.append(element("strong", "", message.mine ? "You" : message.name), element("span", "", chatTime(message.at)));
    content.append(meta, element("p", "assessor-chat-bubble", message.body));
    entry.append(avatar, content);
    messages.append(entry);
  }
  return messages.children.length ? messages : notes("No discussion messages yet.");
}

function mergeDiscussionMessages(caseId, serverMessages = []) {
  const local = localDiscussions.get(caseId) || [];
  const combined = [...serverMessages];
  for (const msg of local) {
    const exists = combined.some(serverMsg =>
      serverMsg.body === msg.body &&
      Math.abs(Date.parse(serverMsg.at || "") - Date.parse(msg.at || "")) < 120_000
    );
    if (!exists) combined.push(msg);
  }
  return combined;
}

function renderDiscussion(detail, refresh, onMessageSent) {
  const item = detail.case;
  const currentList = () => mergeDiscussionMessages(item.id, detail.discussion || []);
  const messages = element("div");
  messages.append(discussionMessages(currentList()));
  const content = element("section", "assessor-conversation-panel");
  const head = element("div", "assessor-conversation-head");
  const titleWrap = element("div");
  titleWrap.append(
    element("h2", "assessor-conversation-title", item.title || "Panel discussion"),
    element("small", "assessor-conversation-sub", `${item.reference || "Panel"} · ${item.sector || "Discussion"}`)
  );
  head.append(titleWrap);
  if (item.id) {
    head.append(link("Open case", caseHref(item, "application", "discussion"), "assessor-text-link"));
  }
  content.append(head, messages);
  let messageSignature = JSON.stringify(currentList());
  const scrollToLatest = () => {
    const chat = messages.querySelector(".assessor-chat");
    if (chat) chat.scrollTop = chat.scrollHeight;
  };
  queueMicrotask(scrollToLatest);
  if (item.roundId) {
    startDiscussionPolling(item, latest => {
      detail.discussion = latest.discussion || [];
      const merged = currentList();
      const nextSignature = JSON.stringify(merged);
      if (nextSignature === messageSignature) return;
      messageSignature = nextSignature;
      messages.replaceChildren(discussionMessages(merged));
      scrollToLatest();
    });
  }
  const body = area("body");
  body.required = true;
  body.placeholder = "Type your message here...";
  body.setAttribute("aria-label", "Message");
  const form = element("form", "assessor-message-composer");
  body.rows = 1;
  const send = element("button", "assessor-message-send");
  send.type = "submit";
  send.name = "action";
  send.value = "comment";
  send.setAttribute("aria-label", "Send message");
  send.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><path d="m4 4 17 8-17 8 3-8z"/><path d="M7 12h14"/></svg>';
  form.append(body, send);

  const submitMessage = async () => {
    const text = body.value.trim();
    if (!text) return;
    const nowIso = new Date().toISOString();
    const authorName = state.workspace?.profile?.name || "You";
    const entry = { name: authorName, body: text, at: nowIso, mine: true };
    const existingLocal = localDiscussions.get(item.id) || [];
    existingLocal.push(entry);
    localDiscussions.set(item.id, existingLocal);

    const workspaceRow = state.workspace?.cases?.find(c => c.id === item.id);
    if (workspaceRow) {
      workspaceRow.lastMessage = text;
      workspaceRow.lastMessageAt = nowIso;
    }
    item.lastMessage = text;
    item.lastMessageAt = nowIso;

    body.value = "";
    const merged = currentList();
    messageSignature = JSON.stringify(merged);
    messages.replaceChildren(discussionMessages(merged));
    scrollToLatest();
    onMessageSent?.(text, nowIso);
    body.focus();

    const canSyncServer = item.roundId && !item.hold && ["review", "voting"].includes(item.roundState) &&
      (item.conflict === "cleared" || (item.canManage && !item.assigned));
    if (canSyncServer) {
      try {
        const updated = await rpc("assessor_action", {
          p_case_id: item.id,
          p_round_id: item.roundId,
          p_action: "comment",
          p_data: { body: text },
        });
        if (updated?.discussion) {
          detail.discussion = updated.discussion;
          const synced = currentList();
          messageSignature = JSON.stringify(synced);
          messages.replaceChildren(discussionMessages(synced));
          scrollToLatest();
        }
        if (refresh) refresh(updated);
      } catch {
        /* Local message remains visible in the active discussion thread. */
      }
    }
  };

  body.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    void submitMessage();
  });
  content.append(form);
  return content;
}

function renderDiscussionWorkspace(rows) {
  const sorted = [...rows].sort((a, b) => String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")));
  if (!sorted.length) {
    view.append(panel("Panel discussions", notes("No case conversations are available yet.")));
    return;
  }
  if (!activeDiscussionCaseId || !sorted.some(item => item.id === activeDiscussionCaseId)) {
    activeDiscussionCaseId = sorted[0].id;
  }

  const workspace = element("div", "assessor-discussion-workspace");
  const inbox = element("div", "assessor-inbox");
  const stage = element("div", "assessor-discussion-stage");
  const rowNodes = new Map();

  async function selectConversation(item) {
    activeDiscussionCaseId = item.id;
    item.unreadCount = 0;
    for (const [id, node] of rowNodes) {
      if (id === item.id) node.setAttribute("aria-current", "true");
      else node.removeAttribute("aria-current");
      const badge = node.querySelector(".assessor-unread");
      if (id === item.id && badge) badge.remove();
    }

    const updateSnippet = (text, atIso) => {
      const node = rowNodes.get(item.id);
      if (!node) return;
      const snippetEl = node.querySelector(".assessor-inbox-snippet");
      const timeEl = node.querySelector("small");
      if (snippetEl) snippetEl.textContent = text;
      if (timeEl) timeEl.textContent = formatDate(atIso);
    };

    stage.replaceChildren(renderDiscussion({ case: item, discussion: [] }, null, updateSnippet));
    try {
      const detail = await rpc("assessor_case", { p_case_id: item.id });
      if (activeDiscussionCaseId !== item.id) return;
      stage.replaceChildren(renderDiscussion(detail, null, updateSnippet));
      void markDiscussionRead(detail.case);
    } catch {
      /* Fallback local discussion composer is already mounted and interactive. */
    }
  }

  for (const item of sorted) {
    const entry = element("button", "assessor-inbox-row");
    entry.type = "button";
    if (item.id === activeDiscussionCaseId) entry.setAttribute("aria-current", "true");
    const lastLocal = (localDiscussions.get(item.id) || []).at(-1);
    const snippetText = lastLocal?.body || item.lastMessage || "Start the panel discussion…";
    const timeText = lastLocal?.at ? formatDate(lastLocal.at) : item.lastMessageAt ? formatDate(item.lastMessageAt) : item.reference || "";
    entry.append(
      element("strong", "", item.title),
      element("span", "assessor-inbox-snippet", snippetText),
      element("small", "", timeText)
    );
    if (item.unreadCount && item.id !== activeDiscussionCaseId) {
      entry.append(element("span", "assessor-unread", String(item.unreadCount)));
    }
    entry.addEventListener("click", () => void selectConversation(item));
    rowNodes.set(item.id, entry);
    inbox.append(entry);
  }

  workspace.append(inbox, stage);
  view.append(workspace);
  const initialCase = sorted.find(item => item.id === activeDiscussionCaseId) || sorted[0];
  void selectConversation(initialCase);
}

function dateValue(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.valueOf())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function savePanelAssignment(item, payload, startReview, trigger, onComplete, onFailure) {
  if (state.saving) return;
  const hash = location.hash;
  state.saving = true;
  if (trigger) trigger.disabled = true;
  try {
    announce(startReview ? "Assigning assessors and starting review…" : "Saving panel…");
    let updated = await rpc("assessor_action", {
      p_case_id: item.id,
      p_round_id: item.roundId || null,
      p_action: "configure",
      p_data: payload,
    });
    if (startReview && updated?.case?.roundId && updated.case.roundState === "setup") {
      updated = await rpc("assessor_action", {
        p_case_id: updated.case.id,
        p_round_id: updated.case.roundId,
        p_action: "start",
        p_data: {},
      });
    }
    onComplete?.(updated);
    state.workspace = await rpc("assessor_workspace");
    await renderRoute();
    if (location.hash === hash) {
      announce(startReview ? "Assessors assigned and review started." : "Panel saved.");
    }
  } catch (error) {
    const message = error.message || "Could not assign assessors.";
    announce(message, true);
    onFailure?.(message);
  } finally {
    state.saving = false;
    if (trigger) trigger.disabled = false;
  }
}

function buildPanelAssignmentForm(detail, onComplete, onFailure) {
  const item = detail.case;
  const members = detail.panel || [];
  const staff = eligiblePanelCandidates(state.workspace.staff, members, item.sectorId);
  const form = element("form", "admin-form");
  const fieldset = element("fieldset", "admin-form-wide");
  fieldset.append(element("legend", "", "Select assessors for this panel"));
  const staffGrid = element("div", "assessor-staff-list");
  for (const person of staff) {
    const checkbox = input("member", "checkbox", person.id);
    checkbox.checked = members.some(member => member.id === person.id);
    const label = element("label", "assessor-staff-pick");
    const avatar = element("span", "assessor-staff-avatar", initials(person.name));
    avatar.setAttribute("aria-hidden", "true");
    const copy = element("span", "assessor-staff-copy");
    const statusText = element("small", "", panelCandidateSubtitle(person, item.sectorId, checkbox.checked));
    checkbox.addEventListener("change", () => {
      statusText.textContent = panelCandidateSubtitle(person, item.sectorId, checkbox.checked);
    });
    copy.append(element("strong", "", person.name), statusText);
    label.append(checkbox, avatar, copy);
    staffGrid.append(label);
  }
  if (staff.length) fieldset.append(notes("Tick any active assessor to add them to this application's panel, or untick to remove them. Matching industry specialists appear first."), staffGrid);
  else fieldset.append(notes("No eligible active assessors are available for this application."));

  const defaultDue = item.deadline ? dateValue(item.deadline) : defaultAssessmentDeadline().webInput;
  const deadline = input("deadline", "datetime-local", defaultDue);
  deadline.required = true;
  const quorum = input("quorum", "number", String(detail.decision?.quorum || 1));
  quorum.min = "1";
  quorum.required = true;
  const errorLine = element("p", "assessor-error admin-form-wide");
  errorLine.setAttribute("role", "alert");
  errorLine.hidden = true;

  const controls = element("div", "admin-form-actions admin-form-wide");
  const assignNow = submitButton("Assign assessors & start review", "assign-start");
  const saveDraft = submitButton("Save panel draft", "configure", true);
  if (!staff.length) {
    assignNow.disabled = true;
    saveDraft.disabled = true;
  }
  controls.append(assignNow, saveDraft);
  form.append(fieldset, field("Assessment deadline (browser time)", deadline), field("Minimum reviews / quorum", quorum), errorLine, controls);

  form.addEventListener("submit", event => {
    event.preventDefault();
    errorLine.hidden = true;
    errorLine.textContent = "";
    const values = new FormData(form);
    const selected = values.getAll("member");
    const minimum = Number(values.get("quorum"));
    const parsedDeadline = new Date(String(values.get("deadline")));
    if (!selected.length) {
      errorLine.textContent = "Tick at least one assessor to assign.";
      errorLine.hidden = false;
      return;
    }
    if (!Number.isInteger(minimum) || minimum < 1 || minimum > selected.length) {
      errorLine.textContent = `Enter a quorum between 1 and ${selected.length}.`;
      errorLine.hidden = false;
      return;
    }
    if (Number.isNaN(parsedDeadline.valueOf()) || parsedDeadline <= new Date()) {
      errorLine.textContent = "Choose a future assessment deadline.";
      errorLine.hidden = false;
      return;
    }
    const startReview = event.submitter?.value !== "configure";
    void savePanelAssignment(
      item,
      { members: selected, deadline: parsedDeadline.toISOString(), quorum: minimum },
      startReview,
      event.submitter,
      onComplete,
      message => {
        errorLine.textContent = message;
        errorLine.hidden = false;
        onFailure?.(message);
      }
    );
  });
  return form;
}

function openAssignAssessorsModal(detail) {
  const item = detail.case;
  const dialog = element("dialog", "assessor-thread assessor-assign-dialog");
  const head = element("div", "assessor-panel-head");
  head.append(element("h2", "", "Assign assessors"), button("Close", () => dialog.close(), "assessor-text-link"));
  const intro = notes(`${item.reference} · ${item.title}: Tick assessors for ${item.sector || "this industry"} (strongest judgement match shown first) and set when the assessment is due.`);
  const form = buildPanelAssignmentForm(detail, () => dialog.close());
  dialog.append(head, intro, form);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
}

function renderPanel(detail) {
  const item = detail.case;
  const members = detail.panel || [];
  const roundRubric = activeRubricList(detail);
  const panelList = element("ul", "assessor-list");
  for (const member of members) {
    const row = element("li");
    const weightedTag = member.weightedTotal !== undefined && member.weightedTotal !== null
      ? ` · Weighted ${member.weightedTotal}% (${member.weightedScore}/5)`
      : "";
    row.append(element("strong", "", member.name), element("span", "", ` · ${labels[member.conflict] || "Declaration due"}${member.submitted ? " · Review submitted" : ""}${weightedTag}`));
    if (member.scores?.length) {
      const scores = element("details");
      scores.append(
        element("summary", "", `Read submitted review${weightedTag ? ` (${member.weightedTotal}%)` : ""}`),
        facts(member.scores.map(score => {
          const item = roundRubric.find(entry => entry.key === score.criterion);
          const label = item ? `${item.label} (${item.weight}%)` : criterionLabel(score.criterion, roundRubric);
          return [label, `${score.rating}/5 · ${score.rationale}`];
        }))
      );
      row.append(scores);
    }
    panelList.append(row);
  }
  const canConfigure = item.canManage && (!item.roundId || item.roundState === "setup") && ["Submitted", "In review"].includes(item.status) && !item.hold;
  const display = panel(
    "Assessment panel",
    notes(members.length ? `${item.reviewCount || 0} of ${item.memberCount || 0} reviews submitted` : "No assessors are assigned to this application yet."),
    panelList
  );
  if (canConfigure) {
    display.append(buildPanelAssignmentForm(detail));
  } else if (item.canManage && item.roundState === "review") {
    display.append(notes("Review is in progress. Once reviews are submitted, open the Decision tab to run voting and record the outcome."));
  }
  return display;
}

function renderDecision(detail) {
  const item = detail.case;
  const decision = detail.decision || {};
  const reviewedCount = Number(item.reviewCount || 0);
  const memberCount = Number(item.memberCount || 0);
  const outcomeValue = ["Approved", "Awarded", "Rejected"].includes(item.status) ? item.status : "Pending";
  const display = panel("Decision");
  if (["Approved", "Awarded", "Rejected"].includes(item.status)) {
    const tone = statusTone(item.status);
    const pillRow = element("div", "assessor-actions");
    pillRow.append(element("span", `assessor-pill${tone ? ` assessor-pill-${tone}` : ""}`, item.status));
    display.append(pillRow);
  }
  display.append(facts([
    ["Reviews submitted", `${reviewedCount} of ${memberCount}`],
    ["Round stage", labels[item.roundState] || "Awaiting panel"],
    ["Application outcome", outcomeValue],
    ["Your vote", labels[detail.ballot] || "No vote cast"],
  ]));
  if (item.status === "Awarded" && item.awardData) {
    const awd = item.awardData;
    display.append(facts([
      ["Award title", awd.awardTitle || `CEDA Innovation Award: ${item.title}`],
      ["Award category", awd.awardCategory || "Innovation Recognition & Support"],
      ...(awd.awardAmount ? [["Support package", awd.awardAmount]] : []),
      ["Conferred", awd.conferredAt || item.awardedAt || "Recorded"],
    ]));
    if (awd.awardSummary) display.append(element("h3", "", "Award summary"), element("p", "", awd.awardSummary));
  }
  if (item.roundState === "review") {
    if (memberCount > 0 && reviewedCount >= memberCount) {
      display.append(notes(`All ${memberCount} of ${memberCount} assessors have finished reviewing. Ready to move to the decision vote.`));
    } else {
      display.append(notes(`${reviewedCount} of ${memberCount} assessors have submitted their reviews so far.`));
    }
  }
  if (item.assigned && item.conflict === "cleared" && item.submitted && item.roundState === "voting" && !detail.ballot && !item.hold && (!item.deadline || new Date(item.deadline) > new Date())) {
    const choice = element("select");
    choice.name = "choice";
    choice.required = true;
    choice.append(new Option("Select a recommendation", ""));
    for (const key of ["approve", "decline", "request-information"]) choice.append(new Option(labels[key], key));
    display.append(actionForm(item, "vote", "Cast vote", values => {
      if (!window.confirm("Submit this vote?")) return null;
      return { choice: values.get("choice") };
    }, [field("Decision vote", choice)]));
  }
  if (!item.canManage || !item.roundId) {
    if (decision.recommendation) display.append(facts([["Panel recommendation", labels[decision.recommendation] || "Pending"]]));
    if (["released", "awarded"].includes(item.roundState) && decision.feedback) display.append(element("h3", "", "Released feedback"), element("p", "", decision.feedback));
    return display;
  }
  display.append(facts([["Votes counted", decision.validBallots ?? "Pending"], ["Quorum", decision.quorum ?? "Pending"], ["Recommendation", labels[decision.recommendation] || "Pending"], ["Procedural status", item.hold ? "On hold" : "Active"]]));
  if (detail.scoreStats?.count) {
    const stats = detail.scoreStats;
    const meanText = stats.weightedTotalMean !== undefined && stats.weightedTotalMean !== null
      ? `${stats.weightedTotalMean}% (${stats.mean}/5)`
      : stats.mean;
    const medianText = stats.weightedTotalMedian !== undefined && stats.weightedTotalMedian !== null
      ? `${stats.weightedTotalMedian}% (${stats.median}/5)`
      : stats.median;
    const statRows = [
      ["Reviews included", stats.count],
      ["Weighted mean", meanText],
      ["Weighted median", medianText],
    ];
    if (stats.unweightedMean !== undefined && stats.unweightedMean !== null) {
      statRows.push(["Unweighted mean", `${stats.unweightedMean}/5`]);
    }
    if (stats.passThreshold !== undefined && stats.passThreshold !== null) {
      const benchLabel = stats.meetsThreshold === true ? "Meets benchmark" : stats.meetsThreshold === false ? "Below benchmark" : "Pending";
      statRows.push(["Pass benchmark", `${stats.passThreshold}% · ${benchLabel}`]);
    }
    display.append(facts(statRows));
    if (Array.isArray(stats.criterionBreakdown) && stats.criterionBreakdown.length) {
      const breakdownDetails = element("details");
      breakdownDetails.open = true;
      breakdownDetails.append(
        element("summary", "", "Criterion weight breakdown"),
        facts(stats.criterionBreakdown.map(entry => [
          `${entry.label || criterionLabel(entry.criterion, detail.rubric)} (${entry.weight}%)`,
          entry.avgRating !== null && entry.avgRating !== undefined
            ? `Avg ${entry.avgRating}/5 · +${entry.weightedContribution}% of 100%`
            : "Pending",
        ]))
      );
      display.append(breakdownDetails);
    }
  }
  if (decision.eligibleReviewers !== undefined) display.append(facts([["Cleared panel members", decision.eligibleReviewers]]));
  if (decision.totals && ["closed", "awaiting-information", "released", "awarded", "archived"].includes(item.roundState)) {
    display.append(facts(Object.entries(decision.totals).map(([key, value]) => [labels[key] || key, value])));
  }
  if (item.hold) {
    display.append(reasonForm(item, "resume", "Resume round"));
    return display;
  }
  const actions = element("div", "assessor-actions");
  if (item.roundState === "review" && item.reviewCount >= decision.quorum) {
    const deadline = input("deadline", "datetime-local");
    display.append(notes("Voting stays open for 24 hours if you leave the deadline blank."),
      actionForm(item, "open-vote", "Open voting", values => {
        const value = String(values.get("deadline"));
        return value ? { deadline: new Date(value).toISOString() } : {};
      }, [field("Voting deadline (browser time)", deadline)]));
  }
  if (item.roundState === "voting") actions.append(basicAction(item, "close-vote", "Close voting", "Close voting and calculate the recommendation?"));
  if (item.roundState === "closed" && ["approve", "decline"].includes(decision.recommendation)) {
    const feedback = area("feedback", decision.feedback || "", 4000);
    feedback.required = true;
    display.append(actionForm(item, "decision", "Save decision feedback", data => ({ feedback: String(data.get("feedback")).trim() }), [field("Applicant-facing feedback", feedback)]));
    if (item.canRelease && decision.feedback) actions.append(verifiedSession()
      ? basicAction(item, "release", `Release outcome (${decision.recommendation === "approve" ? "Approved" : "Rejected"})`, "Release this outcome and its feedback to the applicant?")
      : link("Verify session to release", "#settings", "admin-button-secondary"));
  }
  if (item.canRelease && item.status === "Approved" && item.roundState === "released" && !item.hold) {
    if (verifiedSession()) {
      const awardTitle = element("input");
      awardTitle.name = "awardTitle";
      awardTitle.required = true;
      awardTitle.maxLength = 160;
      awardTitle.value = `CEDA Innovation Award: ${item.title}`;

      const awardCategory = element("select");
      awardCategory.name = "awardCategory";
      for (const opt of ["Innovation Recognition & Support", "Seed Innovation Grant", "Commercialization & Incubation", "Export Readiness Award"]) {
        awardCategory.append(new Option(opt, opt));
      }

      const awardAmount = element("input");
      awardAmount.name = "awardAmount";
      awardAmount.maxLength = 120;
      awardAmount.placeholder = "Optional grant or support value";

      const awardSummary = area("awardSummary", "Approved by the CEDA Assessment Panel and conferred an official innovation award.", 2000);

      display.append(
        element("h3", "", "Award stage conferral"),
        notes("Advance this Approved application into the final Award stage. Prefilled defaults can be tailored before confirming."),
        actionForm(item, "award", "Confer award", values => ({
          awardTitle: String(values.get("awardTitle") || "").trim(),
          awardCategory: String(values.get("awardCategory") || "").trim(),
          awardAmount: String(values.get("awardAmount") || "").trim(),
          awardSummary: String(values.get("awardSummary") || "").trim(),
        }), [
          field("Award title", awardTitle),
          field("Award category", awardCategory),
          field("Support / grant package (optional)", awardAmount),
          field("Applicant-facing award summary", awardSummary),
        ])
      );
    } else {
      actions.append(link("Verify session to confer award", "#settings", "admin-button-secondary"));
    }
  }
  if (item.roundState === "closed" && decision.recommendation === "request-information") {
    const feedback = area("feedback", "", 4000);
    feedback.required = true;
    const deadline = input("deadline", "datetime-local");
    deadline.required = true;
    display.append(actionForm(item, "request-information", "Send information request", data => ({ feedback: String(data.get("feedback")).trim(), deadline: new Date(String(data.get("deadline"))).toISOString() }), [field("Information requested", feedback), field("Response deadline (browser time)", deadline)]));
  }
  if (["review", "closed", "awaiting-information"].includes(item.roundState) && item.status !== "Changes requested") {
    display.append(reasonForm(item, "reassess", "Prepare reassessment"));
  }
  if (["setup", "review", "voting", "closed", "awaiting-information"].includes(item.roundState)) display.append(reasonForm(item, "hold", "Place round on hold"));
  if (actions.children.length) display.append(actions);
  return display;
}

function renderCase(detail, current, from) {
  const item = detail.case;
  const headerActions = element("div", "assessor-case-header-actions");
  if (item.canManage && (!item.roundId || item.roundState === "setup") && ["Submitted", "In review"].includes(item.status) && !item.hold) {
    headerActions.append(button("Assign assessors", () => openAssignAssessorsModal(detail), "admin-cta"));
  }
  headerActions.append(link("Back to workspace", "#" + from, "assessor-text-link"));
  const header = heading(item.title, `${item.reference} · ${item.sector || "Industry pending"} · ${workStatus(item, from === "assessments" ? "assessments" : "library")}`, headerActions);

  const availableTabs = [];
  if (item.assigned || item.canManage || item.hasHistory) availableTabs.push(["application", tabs.application]);
  if (item.canManage) availableTabs.push(["panel", "Panel"]);
  else if (item.submitted && item.conflict === "cleared") availableTabs.push(["panel", "Panel"]);
  if (item.assigned || item.hasHistory) availableTabs.push(["review", tabs.review]);
  if (item.roundId && (item.canManage || item.conflict === "cleared")) availableTabs.push(["decision", "Decision"]);

  const reviewContext = ["assessments", "notifications"].includes(from);
  const fallbackTab = reviewContext && (item.assigned || item.hasHistory) ? "review" : "application";
  const tabKeys = new Set(availableTabs.map(([key]) => key));
  const activeTab = current === "discussion" && item.roundId && (item.canManage || item.conflict === "cleared")
    ? "discussion"
    : tabKeys.has(current) ? current : fallbackTab;

  const nav = element("nav", "assessor-tabs");
  nav.setAttribute("aria-label", "Case sections");
  for (const [key, title] of availableTabs) {
    const anchor = link(title, caseHref(item, key, from), "assessor-case-tab");
    if (key === activeTab) anchor.setAttribute("aria-current", "page");
    nav.append(anchor);
  }
  if (item.roundId && (item.conflict === "cleared" || (item.canManage && !item.assigned))) {
    const discussionControl = current === "discussion"
      ? link("Discussion", caseHref(item, "discussion", from), "assessor-case-tab")
      : button("Discussion", () => openCaseChat(detail), "assessor-case-tab");
    if (current === "discussion") discussionControl.setAttribute("aria-current", "page");
    nav.append(discussionControl);
  }

  let body;
  if (activeTab === "panel") body = renderPanel(detail);
  else if (activeTab === "decision") body = renderDecision(detail);
  else if (activeTab === "discussion") body = renderDiscussion(detail);
  else if (activeTab === "review") body = renderReview(detail);
  else body = renderApplication(detail, from);

  view.replaceChildren(header, nav, body);
  if (detail.history?.length && activeTab !== "discussion") {
    const rounds = detail.history.map(round => {
      const entry = element("details");
      const versionTag = round.rubricVersion ? ` · Rubric v${round.rubricVersion}` : "";
      const weightedTag = round.weightedTotal !== undefined && round.weightedTotal !== null ? ` · Weighted ${round.weightedTotal}%` : "";
      entry.append(element("summary", "", `${formatDate(round.date)} · ${labels[round.recommendation] || "No recommendation"}${versionTag}${weightedTag}`));
      if (round.scores?.length) entry.append(facts(round.scores.map(score => [criterionLabel(score.criterion, round.rubric), `${score.rating ?? "Unscored"}/5 · ${score.rationale}`])));
      return entry;
    });
    view.append(panel("Archived rounds", ...rounds));
  }
}

async function sendAction(item, action, data, trigger, onSaved, refreshDetail, onFailure) {
  if (state.saving) return;
  const hash = location.hash;
  state.saving = true;
  if (trigger) trigger.disabled = true;
  try {
    const payload = data();
    if (!payload) return;
    announce("Saving your changes…");
    const updated = await rpc("assessor_action", { p_case_id: item.id, p_round_id: item.roundId || null, p_action: action, p_data: payload });
    globalThis.__cedaRecordPortalActivity?.({
      category: "Activity",
      action: `assessor.${action}`,
      title: `Assessment action (${action}) on ${item.reference || item.title || "application"}`,
      record: item.reference || item.id || "Application",
      detail: `${state.workspace?.profile?.name || state.profile?.full_name || "Assessor"} recorded "${action}" on ${item.reference || item.title || "application"}.`,
    });
    onSaved?.();
    if (refreshDetail) { refreshDetail(updated); announce("Message sent."); return; }
    try {
      state.workspace = await rpc("assessor_workspace");
      await renderRoute();
      if (location.hash === hash) announce(action === "submit" ? "Review submitted." : "Changes saved.");
    } catch {
      announce("Changes saved. Refresh the workspace to see the latest status.", true);
      retry.hidden = false;
    }
  } catch (error) {
    announce(error.message || "Could not save this change.", true);
    onFailure?.(error.message || "Could not save this change.");
  } finally {
    state.saving = false;
    if (trigger) trigger.disabled = false;
  }
}

function permittedSection(section) {
  if (section === "panels" || section === "decisions") {
    const lib = navLinks.find(item => item.hash === "#library");
    return lib && !lib.hidden ? "library" : "overview";
  }
  const anchor = navLinks.find(item => item.hash === `#${section}`);
  return anchor && !anchor.hidden ? section : "overview";
}

async function renderRoute() {
  if (!state.workspace) return;
  stopDiscussionPolling();
  const request = ++state.request;
  const [section, caseId, tab, origin] = location.hash.slice(1).split("/");
  if (["main", "assessor-main"].includes(section) && view.children.length) return;
  const parent = permittedSection(section === "case" ? origin || "library" : section);
  for (const anchor of navLinks) {
    if (anchor.hash === `#${parent}`) anchor.setAttribute("aria-current", "page");
    else anchor.removeAttribute("aria-current");
  }
  if (section === "case" && caseId) {
    announce("Loading case…");
    view.replaceChildren();
    try {
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(caseId)) throw new Error("This application link is invalid.");
      const detail = await rpc("assessor_case", { p_case_id: caseId });
      if (request !== state.request) return;
      renderCase(detail, tab, parent);
      if (tab === "discussion") void markDiscussionRead(detail.case);
    } catch (error) {
      if (request !== state.request) return;
      view.replaceChildren(heading("Application unavailable", error.message, link("Back to workspace", `#${parent}`, "admin-button-secondary")));
    }
  } else renderPage(parent);
  if (request === state.request) {
    announce();
    focusTitle();
  }
}

async function start() {
  retry.hidden = true;
  try {
    const token = accountToken();
    if (!token) return location.replace("/signin/");
    if (!signupConfig) return announce("Assessor access is temporarily unavailable.", true);
    state.profile = await verifiedAccountProfile(signupConfig, token);
    if (token !== accountToken()) return;
    if (!state.profile) {
      clearAccountToken();
      location.replace("/signin/");
      return;
    }
    if (state.profile.account_role !== "assessor") return location.replace(roleHomes[state.profile.account_role] || "/signin/");
    globalThis.__cedaSetPortalActivityActor?.(state.profile, signupConfig, token);
    void import("./telemetry.js").then(m => m.initPortalTelemetry?.({ portalRole: "assessor" })).catch(() => {});
    state.workspace = await rpc("assessor_workspace");
    const { profile } = state.workspace;
    root.querySelector("[data-assessor-name]").textContent = profile.name;
    root.querySelector("[data-assessor-role]").textContent = formatAssessorRole(profile);
    for (const anchor of root.querySelectorAll("[data-assessor-lead]")) anchor.hidden = !profile.lead;
    root.querySelector("[data-assessor-menu]").hidden = false;
    root.querySelector("[data-assessor-account]").hidden = false;
    view.hidden = false;
    await renderRoute();
  } catch (error) {
    announce(error.message || "Could not load your workspace. Try again.", true);
    retry.hidden = false;
  }
}

async function signOut() {
  const token = accountToken();
  clearAccountToken();
  view.hidden = true;
  try { if (token) await logoutSignup(signupConfig, token); } catch { /* Local session ended. */ }
  location.replace("/signin/");
}

const toggle = root.querySelector("[data-assessor-menu-toggle]");
const layout = root.querySelector("[data-assessor-layout]");
function collapseMenu(collapsed) {
  layout.classList.toggle("is-collapsed", collapsed);
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.setAttribute("aria-label", collapsed ? "Expand workspace menu" : "Collapse workspace menu");
}
try { collapseMenu(localStorage.getItem("ceda.assessorMenuCollapsed") === "true"); } catch { /* Session can use the default. */ }
toggle.addEventListener("click", () => {
  const collapsed = !layout.classList.contains("is-collapsed");
  collapseMenu(collapsed);
  try { localStorage.setItem("ceda.assessorMenuCollapsed", String(collapsed)); } catch { /* Session-only preference. */ }
});
root.querySelector("[data-assessor-logout]").addEventListener("click", signOut);
retry.addEventListener("click", () => void start());
window.addEventListener("hashchange", () => void renderRoute());
window.addEventListener("pageshow", event => { if (event.persisted) void start(); });
void start();
