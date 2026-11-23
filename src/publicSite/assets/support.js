import { signupConfig } from "./signupConfig.js";
import { logoutSignup, verifiedAccountProfile } from "./signupApi.js";
import { accountToken, clearAccountToken, saveAccountToken } from "./verificationSession.js";
import { kickNotificationDispatch } from "./notificationsDomain.js";
import {
  AVAILABILITY_STATES,
  buildConversationTimeline,
  buildLiveChatAnalyticsCsv,
  buildLiveChatAnalyticsReport,
  buildOfficerPerformance,
  buildSupportOverview,
  evaluateLiveChatAvailability,
  filterSupportTickets,
  firstNameOnly,
  formatChatTime,
  formatWaitingTime,
  getAgentActiveChats,
  getEscalationChannel,
  getLatestActivityAt,
  getTicketSource,
  isDefaultOptimusTitle,
  LIVE_CHAT_HOURS,
  SUPPORT_QUICK_REPLIES,
  SUPPORT_STATES,
  supportOverviewColors,
  ticketDisplayTitle,
  ticketLastPreview,
} from "./supportOverview.js";

const AVAILABILITY_KEY = "ceda.support.availability";
const OPENED_TICKETS_KEY = "ceda.support.opened";

function readStoredAvailability() {
  try {
    const val = sessionStorage.getItem(AVAILABILITY_KEY);
    return AVAILABILITY_STATES.includes(val) ? val : "Available";
  } catch {
    return "Available";
  }
}

function readStoredOpenedIds() {
  try {
    const raw = sessionStorage.getItem(OPENED_TICKETS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

const state = {
  token: accountToken(),
  profile: null,
  tickets: [],
  selected: null,
  availability: readStoredAvailability(),
  openedIds: readStoredOpenedIds(),
  scrollToBottomNext: false,
};
const status = document.querySelector("[data-support-status]");
const retryBtn = document.querySelector("[data-support-retry]");
const rootPanel = document.querySelector("[data-support-root]");
const menuPanel = document.querySelector("[data-support-menu]");
const accountHeader = document.querySelector("[data-support-account]");
const dateLabel = document.querySelector("[data-support-date]");
const availLabel = document.querySelector("[data-support-avail-label]");
const navLinks = [...document.querySelectorAll("#support-navigation a")];
const list = document.querySelector("[data-support-list]");
const conversation = document.querySelector("[data-support-conversation]");
const workspaceEl = document.querySelector("[data-support-workspace]");
const filter = document.querySelector("[data-support-filter]");
const resetFiltersBtn = document.querySelector("[data-support-reset-filters]");
const search = document.querySelector("[data-support-search]");
const refresh = document.querySelector("[data-support-refresh]");
const kpiHost = document.querySelector(".support-kpi-grid");
const perfGrid = document.querySelector("[data-support-performance-grid]");
const perfNameEl = document.querySelector("[data-support-perf-name]");
const bellCount = document.querySelector("[data-support-bell-count]");
const statePills = [...document.querySelectorAll("[data-support-state-pill]")];
const availabilityButtons = [...document.querySelectorAll("[data-support-availability]")];

function setStatus(message = "") {
  status.textContent = message;
  status.classList.toggle("admin-status-silent", !message);
}

function updateActiveSection(focus = false) {
  if (!rootPanel) return;
  const requested = location.hash.slice(1);
  const sectionId = navLinks.some(link => link.hash === `#${requested}`) ? requested : "overview";
  for (const section of rootPanel.children) {
    if (section.tagName === "SECTION") section.hidden = section.id !== sectionId;
  }
  for (const link of navLinks) {
    if (link.hash === `#${sectionId}`) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (focus && !rootPanel.hidden) {
    const heading = document.getElementById(sectionId)?.querySelector("h1, h2");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }
}

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function svgElement(tag, attrs = {}) {
  const item = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) {
    item.setAttribute(k, String(v));
  }
  return item;
}

function statusClass(value) {
  return `is-${String(value || "open").toLowerCase().replaceAll(" ", "-")}`;
}

function initials(name) {
  return String(name || "User")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase() || "U";
}

function verifiedSession() {
  try {
    const seg = String(state.token || "").split(".")[1] || "";
    const b64 = seg.replaceAll("-", "+").replaceAll("_", "/");
    return JSON.parse(atob(b64)).aal === "aal2";
  } catch {
    return false;
  }
}

async function apiRequest(path, payload, method = "POST") {
  if (!signupConfig || !state.token) throw new Error("Sign in to continue.");
  const response = await fetch(new URL(path, signupConfig.url), {
    method,
    headers: { "Content-Type": "application/json", apikey: signupConfig.key, Authorization: `Bearer ${state.token}` },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      clearAccountToken();
      location.replace("/signin/");
    }
    throw new Error(body?.message || body?.msg || body?.hint || "The support request could not be completed.");
  }
  return body;
}

async function rpc(name, payload = {}) {
  const body = await apiRequest(`/rest/v1/rpc/${name}`, payload, "POST");
  if (!name.endsWith("_list") && !name.includes("overview") && !name.includes("performance")) {
    kickNotificationDispatch(signupConfig, accountToken());
  }
  return Array.isArray(body) ? body : [];
}

function markOpened(ticketId) {
  if (!ticketId || state.openedIds.has(ticketId)) return;
  state.openedIds.add(ticketId);
  try {
    sessionStorage.setItem(OPENED_TICKETS_KEY, JSON.stringify([...state.openedIds]));
  } catch { /* Session storage optional */ }
}

function syncLiveChatHoursBanner() {
  const hoursBadge = document.querySelector("[data-support-hours-badge]");
  const hoursNotice = document.querySelector("[data-support-hours-notice]");
  const officerName = String(state.profile?.full_name || "Support Officer").trim();
  const myActive = getAgentActiveChats(state.tickets, officerName).length;
  const avail = evaluateLiveChatAvailability({
    tickets: state.tickets,
    officerAvailability: state.availability,
    agents: [
      {
        id: state.profile?.id || "officer",
        name: officerName,
        availability: state.availability,
        activeChats: myActive,
        maxConcurrent: LIVE_CHAT_HOURS.defaultMaxConcurrentChats,
      },
    ],
  });
  if (hoursBadge) {
    hoursBadge.textContent = `${avail.badgeLabel}, ${myActive}/${avail.maxConcurrentPerAgent} active chats`;
  }
  if (hoursNotice) {
    hoursNotice.textContent = avail.notificationMessage;
  }
}

function setAvailability(nextStatus, announceChange = true) {
  if (!AVAILABILITY_STATES.includes(nextStatus)) return;
  state.availability = nextStatus;
  if (availLabel) availLabel.textContent = nextStatus;
  for (const btn of availabilityButtons) {
    btn.setAttribute("aria-pressed", String(btn.dataset.supportAvailability === nextStatus));
  }
  try {
    sessionStorage.setItem(AVAILABILITY_KEY, nextStatus);
  } catch { /* Session storage optional */ }
  syncLiveChatHoursBanner();
  if (announceChange) {
    setStatus(`Current availability set to ${nextStatus}.`);
    if (signupConfig && state.token) {
      void apiRequest("/rest/v1/rpc/support_set_availability", {
        p_availability: nextStatus,
        p_max_concurrent: LIVE_CHAT_HOURS.defaultMaxConcurrentChats,
      }, "POST").catch(() => undefined);
    }
    globalThis.__cedaRecordPortalActivity?.({
      category: "Activity",
      action: "support.availability",
      title: `Updated availability to ${nextStatus}`,
      record: "Officer availability",
      detail: `${state.profile?.full_name || "Support Officer"} changed support availability to ${nextStatus}.`,
    });
  }
}

function hasActiveQueueFilters() {
  return Boolean(filter.value !== "all" || search.value.trim());
}

function setQueueFilter(nextState = "all") {
  filter.value = nextState;
  for (const pill of statePills) {
    pill.setAttribute("aria-pressed", String(pill.dataset.supportStatePill === nextState));
  }
  if (resetFiltersBtn) resetFiltersBtn.hidden = !hasActiveQueueFilters();
  renderList();
}

function visibleTickets() {
  if (resetFiltersBtn) resetFiltersBtn.hidden = !hasActiveQueueFilters();
  return filterSupportTickets(state.tickets, {
    filterKey: filter.value || "all",
    query: search.value,
    openedIds: state.openedIds,
  });
}

function openConversation(ticketId) {
  state.selected = ticketId;
  state.scrollToBottomNext = false;
  markOpened(ticketId);
  globalThis.__cedaRecordPortalActivity?.({
    category: "Activity",
    action: "support.open_ticket",
    title: `Opened support conversation ${ticketId}`,
    record: ticketId,
    detail: `${state.profile?.full_name || "Support Officer"} opened support ticket ${ticketId} for review.`,
  });
  renderMetricsAndVisuals();
  renderList();
  renderConversation();
}

function closeConversationView() {
  state.selected = null;
  if (workspaceEl) workspaceEl.classList.remove("has-conversation");
  if (conversation) {
    conversation.hidden = true;
    conversation.replaceChildren();
  }
  renderList();
}

function miniSparkBars(heights, color) {
  const chart = svgElement("svg", { viewBox: "0 0 60 28", class: "support-kpi-spark", "aria-hidden": "true" });
  const max = Math.max(1, ...heights);
  heights.slice(-5).forEach((value, idx) => {
    const h = Math.max(4, Math.round((value / max) * 24));
    chart.append(svgElement("rect", {
      x: idx * 12 + 2,
      y: 26 - h,
      width: 7,
      height: h,
      rx: 3,
      fill: idx === 4 ? color : "#e6dcd3",
    }));
  });
  return chart;
}

function miniRing(pct, color) {
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));
  const dash = (clamped / 100) * circumference;
  const wrap = node("div", "support-kpi-ring");
  const svg = svgElement("svg", { viewBox: "0 0 44 44", class: "support-kpi-ring-svg", "aria-hidden": "true" });
  svg.append(svgElement("circle", { cx: 22, cy: 22, r: radius, fill: "none", stroke: "#efe9e1", "stroke-width": 5 }));
  if (clamped > 0) {
    svg.append(svgElement("circle", {
      cx: 22,
      cy: 22,
      r: radius,
      fill: "none",
      stroke: color,
      "stroke-width": 5,
      "stroke-linecap": "round",
      "stroke-dasharray": `${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}`,
      transform: "rotate(-90 22 22)",
    }));
  }
  wrap.append(svg, node("span", "", `${clamped}%`));
  return wrap;
}

function miniMeterSvg(segments, totalValue) {
  const width = 240;
  const bar = svgElement("svg", {
    viewBox: `0 0 ${width} 7`,
    class: "support-kpi-meter",
    preserveAspectRatio: "none",
    "aria-hidden": "true",
  });
  bar.append(svgElement("rect", { x: 0, y: 0, width, height: 7, rx: 3.5, fill: "#efe9e1" }));
  const total = Math.max(1, totalValue || segments.reduce((sum, s) => sum + Math.max(0, s.value), 0));
  let offset = 0;
  for (const seg of segments) {
    if (!seg.value || seg.value <= 0) continue;
    const w = Math.max(6, Math.round((seg.value / total) * width));
    const clipped = Math.min(width - offset, w);
    if (clipped <= 0) break;
    bar.append(svgElement("rect", { x: offset, y: 0, width: clipped, height: 7, rx: 3.5, fill: seg.color }));
    offset += clipped + 2;
  }
  return bar;
}

function buildKpiCard({ label, value, caption, badge, color, spark, ringPct, segments, segmentTotal, filterState, filterKind = "all" }) {
  const card = node("button", "support-kpi-card");
  card.type = "button";
  const top = node("div", "support-kpi-top");
  top.append(node("span", "support-kpi-label", label));
  if (badge) top.append(node("span", "support-kpi-badge", badge));
  const body = node("div", "support-kpi-body");
  body.append(
    node("strong", "support-kpi-value", String(value)),
    ringPct !== undefined ? miniRing(ringPct, color) : miniSparkBars(spark, color)
  );
  const foot = node("div", "support-kpi-footer");
  foot.append(node("small", "support-kpi-caption", caption), node("span", "support-kpi-arrow", "→"));
  card.append(top, body);
  if (segments) card.append(miniMeterSvg(segments, segmentTotal));
  card.append(foot);
  card.addEventListener("click", () => {
    setQueueFilter(filterState);
    location.hash = "#queue";
    updateActiveSection(true);
  });
  return card;
}

function renderMetricsAndVisuals() {
  const summary = buildSupportOverview(state.tickets, { openedIds: state.openedIds });
  const openTotal = Math.max(1, summary.openRequests);

  if (bellCount) {
    bellCount.hidden = summary.openRequests === 0;
    bellCount.textContent = String(summary.openRequests);
  }

  if (kpiHost) {
    kpiHost.replaceChildren(
      buildKpiCard({
        label: "Open requests",
        value: summary.openRequests,
        badge: summary.investigating ? `${summary.investigating} investigating` : undefined,
        caption: "All unresolved support requests",
        color: supportOverviewColors.blue,
        spark: summary.stageBars,
        segments: summary.statusBreakdown.map(s => ({ value: s.count, color: s.color })),
        segmentTotal: openTotal,
        filterState: "all",
      }),
      buildKpiCard({
        label: "New requests",
        value: summary.newRequests,
        badge: summary.newRequests ? "Unopened" : undefined,
        caption: "Requests that have not been opened by an officer",
        color: supportOverviewColors.teal,
        ringPct: summary.openRequests ? Math.round((summary.newRequests / openTotal) * 100) : 0,
        segments: [{ value: summary.newRequests, color: supportOverviewColors.teal }],
        segmentTotal: openTotal,
        filterState: "new",
      }),
      buildKpiCard({
        label: "Urgent requests",
        value: summary.urgentRequests,
        badge: summary.overdueRequests ? `${summary.overdueRequests} overdue` : undefined,
        caption: "High-priority or overdue cases",
        color: supportOverviewColors.rust,
        ringPct: summary.openRequests ? Math.round((summary.urgentRequests / openTotal) * 100) : 0,
        segments: [{ value: summary.urgentRequests, color: supportOverviewColors.rust }],
        segmentTotal: openTotal,
        filterState: "urgent",
      }),
      buildKpiCard({
        label: "Resolved today",
        value: summary.resolvedToday,
        caption: "Requests completed during the current day",
        color: supportOverviewColors.green,
        ringPct: summary.resolutionRatePct,
        segments: [{ value: summary.resolved, color: supportOverviewColors.green }],
        segmentTotal: Math.max(1, summary.total),
        filterState: "Resolved",
      })
    );
  }

  const overviewPanels = document.querySelector("[data-support-overview-panels]");
  if (overviewPanels) {
    const queueCard = node("article", "admin-overview-panel support-overview-card");
    const qHead = node("div", "support-panel-head");
    const qTitleWrap = node("div", "");
    qTitleWrap.append(node("p", "eyebrow", "PRIORITY REQUESTS"), node("h2", "", "Immediate action queue"));
    const qOpenAll = node("button", "admin-button-secondary", "View queue");
    qOpenAll.type = "button";
    qOpenAll.addEventListener("click", () => {
      location.hash = "#queue";
      updateActiveSection(true);
    });
    qHead.append(qTitleWrap, qOpenAll);
    queueCard.append(qHead);

    const priorityTickets = (summary.urgentQueue?.length ? summary.urgentQueue : state.tickets.filter(t => t.state !== "Resolved")).slice(0, 4);
    if (!priorityTickets.length) {
      queueCard.append(node("p", "support-list-empty", "All support requests are currently resolved."));
    } else {
      const uList = node("div", "support-urgent-list");
      const nowMs = Date.now();
      for (const ticket of priorityTickets) {
        const row = node("div", "support-urgent-item");
        const copy = node("div", "support-urgent-copy");
        copy.append(
          node("strong", "", `${ticket.id} · ${ticketDisplayTitle(ticket)}`),
          node("small", "", `${ticket.reporter || "Innovator"} · ${formatWaitingTime(ticket, nowMs)}`)
        );
        const tags = node("div", "support-urgent-tags");
        const src = getTicketSource(ticket);
        tags.append(
          node("span", `support-badge ${src === "Optimus Prime" ? "is-optimus" : "is-source-help"}`, src),
          node("span", `support-badge ${statusClass(ticket.state)}`, ticket.state)
        );
        const actBtn = node("button", "support-open-btn", "Open conversation");
        actBtn.type = "button";
        actBtn.addEventListener("click", event => {
          event.stopPropagation();
          openConversation(ticket.id);
          location.hash = "#queue";
          updateActiveSection(true);
        });
        tags.append(actBtn);
        row.append(copy, tags);
        row.addEventListener("click", () => {
          openConversation(ticket.id);
          location.hash = "#queue";
          updateActiveSection(true);
        });
        uList.append(row);
      }
      queueCard.append(uList);
    }

    const summaryCard = node("article", "admin-overview-panel support-overview-card");
    const sHead = node("div", "support-panel-head");
    const sTitleWrap = node("div", "");
    sTitleWrap.append(node("p", "eyebrow", "WORKLOAD METRICS"), node("h2", "", "Support summary"));
    const sPerfBtn = node("button", "admin-button-secondary", "Performance");
    sPerfBtn.type = "button";
    sPerfBtn.addEventListener("click", () => {
      location.hash = "#performance";
      updateActiveSection(true);
    });
    sHead.append(sTitleWrap, sPerfBtn);

    const totalCount = Math.max(1, summary.total);
    const connectedCount = state.tickets.filter(t => t.owner && String(t.owner).toLowerCase() !== "unassigned").length;
    const connectedPct = state.tickets.length ? Math.round((connectedCount / totalCount) * 100) : 0;
    const openedCount = Math.max(0, summary.openRequests - summary.newRequests);
    const responseCoveragePct = summary.openRequests ? Math.round((openedCount / openTotal) * 100) : 100;

    const ringGrid = node("div", "support-summary-rings");
    for (const [label, pct, sub, color] of [
      ["Response coverage", responseCoveragePct, `${openedCount} of ${summary.openRequests} active opened`, supportOverviewColors.teal],
      ["Resolution rate", summary.resolutionRatePct || 0, `${summary.resolved} of ${summary.total} resolved`, supportOverviewColors.green],
      ["Officer connected", connectedPct, `${connectedCount} of ${summary.total} assigned`, supportOverviewColors.rust],
    ]) {
      const cell = node("div", "support-summary-ring-item");
      cell.append(
        miniRing(pct, color),
        node("strong", "", label),
        node("small", "", sub)
      );
      ringGrid.append(cell);
    }
    summaryCard.append(sHead, ringGrid);
    overviewPanels.replaceChildren(queueCard, summaryCard);
  }
}

function renderActiveConcurrentChatsBar() {
  const bar = document.querySelector("[data-support-active-chats]");
  if (!bar) return;
  const officerName = String(state.profile?.full_name || "").trim();
  const activeChats = getAgentActiveChats(state.tickets, officerName);
  const maxCap = LIVE_CHAT_HOURS.defaultMaxConcurrentChats;
  bar.replaceChildren();
  if (!activeChats.length) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const head = node("div", "support-panel-head");
  head.append(
    node("strong", "", `Your concurrent live chats (${activeChats.length} / ${maxCap} active)`),
    node("small", "admin-help", "Switch between active client chats in one click")
  );
  const strip = node("div", "support-pill-bar");
  for (const chat of activeChats) {
    const isCurrent = state.selected === chat.id;
    const pill = node(
      "button",
      `support-pill-tab${isCurrent ? " is-active" : ""}`,
      `${chat.id} · ${chat.reporter || "Innovator"} (${chat.state})`
    );
    pill.type = "button";
    pill.setAttribute("aria-pressed", String(isCurrent));
    pill.addEventListener("click", () => {
      openConversation(chat.id);
    });
    strip.append(pill);
  }
  bar.append(head, strip);
}

function renderList() {
  renderActiveConcurrentChatsBar();
  const nowMs = Date.now();
  const tickets = visibleTickets();
  list.replaceChildren();
  document.querySelector("[data-support-count]").textContent = `${tickets.length} request${tickets.length === 1 ? "" : "s"}`;
  if (!tickets.length) {
    list.append(node("p", "support-list-empty", "No support requests match the current filters."));
    return;
  }
  for (const ticket of tickets) {
    const source = getTicketSource(ticket);
    const channel = getEscalationChannel(ticket);
    const waiting = formatWaitingTime(ticket, nowMs);
    const displayTitle = ticketDisplayTitle(ticket);
    const showSeparateReporter = !isDefaultOptimusTitle(ticket.title);
    const connectedFirst = firstNameOnly(ticket.owner, "");
    const isConnected = Boolean(connectedFirst && connectedFirst.toLowerCase() !== "unassigned");
    const row = node("article", "support-ticket");
    row.tabIndex = 0;
    row.setAttribute("aria-current", String(state.selected === ticket.id));

    const head = node("div", "support-ticket-head");
    const titleGroup = node("div", "support-ticket-title-group");
    titleGroup.append(
      node("span", "support-ticket-ref", ticket.id),
      node("span", "support-ticket-title", displayTitle)
    );
    const topBadges = node("div", "support-ticket-badges");
    const high = String(ticket.priority).toLowerCase() === "high";
    topBadges.append(
      node("span", `support-badge ${high ? "is-high" : "is-wait-chip"}`, `${ticket.priority} priority`),
      node("span", `support-badge ${statusClass(ticket.state)}`, ticket.state)
    );
    head.append(titleGroup, topBadges);

    const snippet = ticketLastPreview(ticket).replace(/\s*\n+Original question:\s*[\s\S]*$/i, "").trim();
    const foot = node("div", "support-ticket-foot");
    const details = node("div", "support-ticket-details");
    if (showSeparateReporter) {
      details.append(node("span", "support-ticket-innovator", ticket.reporter));
    }
    details.append(
      node("span", `support-badge ${source === "Optimus Prime" ? "is-optimus" : "is-source-help"}`, channel !== source ? `${source} · ${channel}` : source),
      node("span", "support-badge is-wait-chip", waiting)
    );
    if (ticket.wizardStep) {
      details.append(node("span", "support-badge is-wait-chip", `Wizard Step ${ticket.wizardStep}`));
    }
    if (isConnected) {
      details.append(node("span", "support-badge is-connected-chip", `Connected · ${connectedFirst}`));
    }

    const openBtn = node("button", "support-open-btn", "Open conversation");
    openBtn.type = "button";
    openBtn.addEventListener("click", event => {
      event.stopPropagation();
      openConversation(ticket.id);
    });
    foot.append(details, openBtn);

    row.append(head);
    if (snippet) row.append(node("p", "support-ticket-snippet", snippet));
    row.append(foot);

    row.addEventListener("click", () => openConversation(ticket.id));
    row.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openConversation(ticket.id);
      }
    });
    list.append(row);
  }
}

function createSendSvg() {
  const svg = svgElement("svg", { viewBox: "0 0 24 24", focusable: "false", "aria-hidden": "true" });
  svg.append(
    svgElement("path", { d: "m4 4 17 8-17 8 3-8z" }),
    svgElement("path", { d: "M7 12h14" })
  );
  return svg;
}

function renderConversation() {
  const ticket = state.tickets.find(item => item.id === state.selected);
  if (!ticket) {
    if (workspaceEl) workspaceEl.classList.remove("has-conversation");
    if (conversation) {
      conversation.hidden = true;
      conversation.replaceChildren();
    }
    return;
  }
  if (workspaceEl) workspaceEl.classList.add("has-conversation");
  conversation.hidden = false;
  conversation.replaceChildren();

  const source = getTicketSource(ticket);
  const latestAt = getLatestActivityAt(ticket);
  const officerFullName = String(state.profile?.full_name || "").trim();
  const officerFirst = firstNameOnly(officerFullName, "Officer");
  const isAssignedToMe = Boolean(
    officerFullName &&
    String(ticket.owner || "").trim().toLowerCase() === officerFullName.toLowerCase()
  );
  const assignedOtherFirst =
    !isAssignedToMe && ticket.owner && String(ticket.owner).toLowerCase() !== "unassigned"
      ? firstNameOnly(ticket.owner, "Support")
      : "";

  const room = node("div", "support-chat-room");

  const head = node("header", "support-detail-head");
  const top = node("div", "support-detail-top");
  const titleBox = node("div", "support-detail-identity");
  const heading = node("h2", "", ticket.reporter || "Innovator");
  heading.id = "support-conversation-title";

  const subMeta = node("div", "support-detail-sub");
  subMeta.append(
    node("span", "support-ticket-ref", ticket.id),
    node("span", `support-badge ${source === "Optimus Prime" ? "is-optimus" : "is-source-help"}`, source)
  );
  if (ticket.application) {
    subMeta.append(node("span", "support-badge is-wait-chip", `App ${ticket.application}`));
  }
  subMeta.append(node("span", "support-detail-time", `Latest ${latestAt || ticket.reported} CAT`));
  titleBox.append(heading, subMeta);
  if (!isDefaultOptimusTitle(ticket.title) && ticket.title) {
    titleBox.append(node("p", "support-detail-subject", ticket.title));
  }

  const headActions = node("div", "support-conv-actions");

  const connectBtn = node(
    "button",
    `support-connect-btn${isAssignedToMe ? " is-connected" : ""}`,
    isAssignedToMe ? `Connected · ${officerFirst}` : "Connect"
  );
  connectBtn.type = "button";
  connectBtn.dataset.supportConnectBtn = "true";
  if (isAssignedToMe) {
    connectBtn.disabled = true;
    connectBtn.setAttribute("aria-pressed", "true");
    connectBtn.title = `Innovator sees Connected to ${officerFirst}`;
  } else {
    if (assignedOtherFirst) {
      connectBtn.title = `Currently connected to ${assignedOtherFirst}. Click to connect as ${officerFirst}.`;
    }
    connectBtn.addEventListener("click", async () => {
      connectBtn.disabled = true;
      setStatus(`Connecting as ${officerFirst}…`);
      try {
        state.scrollToBottomNext = true;
        state.tickets = await rpc("support_connect_ticket", { p_reference: ticket.id });
        setStatus(`Connected to ${ticket.reporter} (visible to innovator as ${officerFirst}).`);
        renderAll();
      } catch (error) {
        setStatus(error.message);
        connectBtn.disabled = false;
      }
    });
  }
  headActions.append(connectBtn);

  if (ticket.state !== "Resolved") {
    const closeBtn = node("button", "support-close-ticket-btn", "Close ticket");
    closeBtn.type = "button";
    closeBtn.dataset.supportCloseTicket = "true";
    closeBtn.addEventListener("click", async () => {
      closeBtn.disabled = true;
      setStatus("Marking ticket resolved…");
      try {
        state.scrollToBottomNext = true;
        state.tickets = await rpc("support_update_ticket", {
          p_reference: ticket.id,
          p_state: "Resolved",
          p_reason: "Marked resolved by Support Officer.",
          p_reply: null,
        });
        setStatus(`Ticket ${ticket.id} marked resolved.`);
        renderAll();
      } catch (error) {
        setStatus(error.message);
        closeBtn.disabled = false;
      }
    });
    headActions.append(closeBtn);
  }

  top.append(titleBox, headActions);

  const stageButtons = node("div", "support-stage-pills");
  stageButtons.setAttribute("role", "group");
  stageButtons.setAttribute("aria-label", "Conversation stage");
  for (const stageName of ["Open", "Investigating", "Waiting"]) {
    const btn = node(
      "button",
      `support-stage-pill ${statusClass(stageName)}${ticket.state === stageName ? " is-active" : ""}`,
      stageName
    );
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(ticket.state === stageName));
    btn.disabled = ticket.state === stageName;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      setStatus(`Updating status to ${stageName}…`);
      try {
        state.scrollToBottomNext = true;
        state.tickets = await rpc("support_update_ticket", {
          p_reference: ticket.id,
          p_state: stageName,
          p_reason: `Status updated from ${ticket.state} to ${stageName}.`,
          p_reply: null,
        });
        setStatus(`Ticket ${ticket.id} marked ${stageName}.`);
        renderAll();
      } catch (error) {
        setStatus(error.message);
        btn.disabled = false;
      }
    });
    stageButtons.append(btn);
  }
  if (ticket.state === "Resolved") {
    stageButtons.append(node("span", "support-stage-pill is-resolved is-active", "Resolved"));
  }

  head.append(top, stageButtons);

  const thread = node("ol", "support-chat-feed");
  thread.setAttribute("aria-label", "Conversation timeline");
  const timeline = buildConversationTimeline(ticket);
  let handoffEl = null;

  for (const item of timeline) {
    if (item.kind === "divider") {
      const dividerLi = node("li", `support-chat-divider is-tone-${item.tone || "date"}`);
      const pill = node("span", "support-chat-divider-pill", item.at ? `${item.label} · ${item.at} CAT` : item.label);
      dividerLi.append(pill);
      if (item.tone === "handoff") handoffEl = dividerLi;
      thread.append(dividerLi);
      continue;
    }

    const isAi = item.role === "ai";
    const isOfficer = item.role === "support" || item.role === "admin";
    const row = node(
      "li",
      `support-chat-message${isOfficer ? " is-mine" : ""}${isAi ? " is-ai" : ""}`
    );
    const avatarLabel = isAi ? "OP" : initials(item.sender || ticket.reporter);
    const avatar = node("span", "support-chat-avatar", avatarLabel);
    avatar.setAttribute("aria-hidden", "true");

    const content = node("div", "support-chat-content");
    const meta = node("div", "support-chat-meta");
    const displaySender = isOfficer
      ? (officerFullName && item.sender?.toLowerCase() === officerFullName.toLowerCase() ? "You" : item.sender)
      : item.sender;
    meta.append(
      node("strong", "", displaySender),
      node("span", "", formatChatTime(item.at))
    );
    const bubble = node("p", "support-chat-bubble", item.body || "");
    content.append(meta, bubble);
    if (item.sourceArticle) {
      content.append(node("small", "support-chat-source", `Source: ${item.sourceArticle}`));
    }
    row.append(avatar, content);
    thread.append(row);
  }

  const composerWrap = node("div", "support-composer-wrap");
  const quickRow = node("div", "support-quick-chips");
  quickRow.setAttribute("role", "region");
  quickRow.setAttribute("aria-label", "Quick replies");

  let selectedState = ticket.state === "Open" ? "Investigating" : (SUPPORT_STATES.includes(ticket.state) ? ticket.state : "Investigating");
  let selectedTemplateReason = "";

  const actions = node("form", "support-message-composer");
  const reply = node("textarea");
  reply.name = "reply";
  reply.rows = 1;
  reply.minLength = 2;
  reply.maxLength = 2000;
  reply.placeholder = "Type your message here...";
  reply.setAttribute("aria-label", "Message");

  const toolbar = node("div", "support-composer-toolbar");
  const filterWrap = node("div", "support-status-dropdown");
  const filterBtn = node("button", "support-status-trigger", `Status: ${selectedState} ▾`);
  filterBtn.type = "button";
  filterBtn.setAttribute("aria-haspopup", "listbox");
  filterBtn.setAttribute("aria-expanded", "false");
  filterBtn.dataset.supportStatusTrigger = "true";

  const filterMenu = node("div", "support-status-menu");
  filterMenu.setAttribute("role", "listbox");
  filterMenu.setAttribute("aria-label", "Select reply status");
  filterMenu.hidden = true;

  const syncSelectedState = nextVal => {
    selectedState = nextVal;
    filterBtn.textContent = `Status: ${selectedState} ▾`;
    for (const optBtn of filterMenu.querySelectorAll("[data-status-option]")) {
      const active = optBtn.dataset.statusOption === selectedState;
      optBtn.setAttribute("aria-selected", String(active));
      optBtn.classList.toggle("is-selected", active);
    }
  };

  for (const value of SUPPORT_STATES) {
    const optBtn = node("button", `support-status-option${value === selectedState ? " is-selected" : ""}`, value);
    optBtn.type = "button";
    optBtn.role = "option";
    optBtn.dataset.statusOption = value;
    optBtn.setAttribute("aria-selected", String(value === selectedState));
    optBtn.addEventListener("click", () => {
      syncSelectedState(value);
      filterMenu.hidden = true;
      filterBtn.setAttribute("aria-expanded", "false");
      reply.focus();
    });
    filterMenu.append(optBtn);
  }

  filterBtn.addEventListener("click", event => {
    event.stopPropagation();
    const open = filterMenu.hidden;
    filterMenu.hidden = !open;
    filterBtn.setAttribute("aria-expanded", String(open));
  });

  filterWrap.append(filterBtn, filterMenu);

  const send = node("button", "support-message-send");
  send.type = "submit";
  send.setAttribute("aria-label", "Send message");
  send.append(createSendSvg());

  toolbar.append(filterWrap, send);
  actions.append(reply, toolbar);

  reply.addEventListener("input", () => {
    selectedTemplateReason = "";
  });
  reply.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      actions.requestSubmit();
    }
  });

  for (const template of SUPPORT_QUICK_REPLIES) {
    const chip = node("button", "support-quick-chip", template.label);
    chip.type = "button";
    chip.addEventListener("click", () => {
      syncSelectedState(template.state);
      selectedTemplateReason = template.reason;
      reply.value = template.reply;
      reply.focus();
    });
    quickRow.append(chip);
  }

  actions.addEventListener("submit", async event => {
    event.preventDefault();
    const replyText = reply.value.trim();
    if (!replyText && selectedState === ticket.state) {
      setStatus("Write a message or choose a new status before sending.");
      reply.focus();
      return;
    }
    if (replyText && replyText.length < 2) {
      setStatus("Enter a reply of at least 2 characters.");
      reply.focus();
      return;
    }
    send.disabled = true;
    const reasonNote =
      selectedTemplateReason ||
      (replyText ? `Support officer replied (${selectedState})` : `Updated status to ${selectedState}`);
    const nowTime = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Gaborone",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()) + " " + new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Gaborone",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());

    if (replyText) {
      ticket.thread = [
        ...(Array.isArray(ticket.thread) ? ticket.thread : []),
        {
          sender: officerFullName || "Support Officer",
          role: "support",
          body: replyText,
          at: nowTime,
        },
      ];
    }
    ticket.state = selectedState;
    ticket.updatedAt = nowTime;
    if (!ticket.owner || String(ticket.owner).toLowerCase() === "unassigned") {
      ticket.owner = officerFullName || "Support Officer";
    }
    reply.value = "";
    state.scrollToBottomNext = true;
    renderAll();

    globalThis.__cedaRecordPortalActivity?.({
      category: "Activity",
      action: "support.reply_ticket",
      title: replyText ? `Replied to support ticket ${ticket.id} (${selectedState})` : `Updated ticket ${ticket.id} to ${selectedState}`,
      record: ticket.id,
      detail: `${officerFullName || "Support Officer"} ${replyText ? `sent a reply on ${ticket.id}: "${replyText.slice(0, 120)}"` : `updated ${ticket.id} status to ${selectedState}`}.`,
    });

    try {
      setStatus("Saving message…");
      const fresh = await rpc("support_update_ticket", {
        p_reference: ticket.id,
        p_state: selectedState,
        p_reason: reasonNote,
        p_reply: replyText || null,
      });
      if (Array.isArray(fresh) && fresh.length) {
        state.tickets = fresh;
      }
      state.scrollToBottomNext = true;
      setStatus("Message sent.");
      renderAll();
    } catch (error) {
      setStatus(replyText ? "Message added to conversation." : error.message);
    } finally {
      send.disabled = false;
    }
  });

  conversation.addEventListener("click", event => {
    if (!filterMenu.hidden && !filterWrap.contains(event.target)) {
      filterMenu.hidden = true;
      filterBtn.setAttribute("aria-expanded", "false");
    }
  });

  composerWrap.append(quickRow, actions);
  room.append(head, thread, composerWrap);
  conversation.append(room);

  requestAnimationFrame(() => {
    if (state.scrollToBottomNext) {
      thread.scrollTop = thread.scrollHeight;
      state.scrollToBottomNext = false;
    } else if (handoffEl && timeline.some(entry => entry.kind === "message" && entry.role === "ai")) {
      thread.scrollTop = 0;
    } else {
      thread.scrollTop = 0;
    }
  });
}

function renderPerformance() {
  if (!perfGrid) return;
  const officerName = state.profile?.full_name || "";
  if (perfNameEl && officerName) perfNameEl.textContent = officerName;
  const perf = buildOfficerPerformance(state.tickets, officerName);
  const personalTotal = Math.max(1, perf.personalCount || state.tickets.length || 1);
  const cards = [
    {
      label: "Requests handled today",
      value: String(perf.handledToday),
      caption: "Personal tickets you updated or replied to today",
      ringPct: Math.min(100, Math.round((perf.handledToday / personalTotal) * 100)),
      color: supportOverviewColors.blue,
    },
    {
      label: "Requests resolved today",
      value: String(perf.resolvedToday),
      caption: "Assigned requests you completed today",
      ringPct: perf.handledToday ? Math.min(100, Math.round((perf.resolvedToday / Math.max(1, perf.handledToday)) * 100)) : 0,
      color: supportOverviewColors.green,
    },
    {
      label: "Average first response time",
      value: perf.avgFirstResponseLabel,
      caption: perf.firstResponseCount
        ? `Across ${perf.firstResponseCount} first reply record${perf.firstResponseCount === 1 ? "" : "s"}`
        : "Recorded once you send your first replies",
      ringPct: perf.avgFirstResponseMinutes !== null ? Math.max(15, Math.min(100, 100 - Math.round(perf.avgFirstResponseMinutes / 3))) : 100,
      color: supportOverviewColors.teal,
    },
    {
      label: "Average resolution time",
      value: perf.avgResolutionLabel,
      caption: perf.resolutionCount
        ? `Across ${perf.resolutionCount} resolved request${perf.resolutionCount === 1 ? "" : "s"}`
        : "Shown once requests you handle are resolved",
      ringPct: perf.avgResolutionMinutes !== null ? Math.max(20, Math.min(100, 100 - Math.round(perf.avgResolutionMinutes / 15))) : 100,
      color: supportOverviewColors.amber,
    },
    {
      label: "Reopened requests",
      value: String(perf.reopenedRequests),
      caption: "Handled requests reopened after resolution",
      ringPct: perf.reopenedRequests === 0 ? 100 : Math.max(10, 100 - perf.reopenedRequests * 25),
      color: supportOverviewColors.rust,
    },
    {
      label: "Satisfaction rating",
      value: perf.satisfactionLabel,
      caption: perf.satisfactionCount
        ? `Average from ${perf.satisfactionCount} innovator rating${perf.satisfactionCount === 1 ? "" : "s"}`
        : "Shown once innovator feedback is available",
      ringPct: perf.satisfactionRatingAvg !== null ? Math.round((perf.satisfactionRatingAvg / 5) * 100) : 92,
      color: supportOverviewColors.green,
    },
  ];
  perfGrid.replaceChildren(
    ...cards.map(item => {
      const card = node("article", "support-perf-card");
      const top = node("div", "support-perf-card-top");
      const meta = node("div", "support-perf-card-meta");
      meta.append(
        node("span", "support-perf-label", item.label),
        node("strong", "support-perf-value", item.value)
      );
      top.append(meta, miniRing(item.ringPct, item.color));
      card.append(top, node("small", "support-perf-caption", item.caption));
      return card;
    })
  );

  const reportHost = document.querySelector("[data-support-chat-analytics]");
  if (reportHost) {
    const report = buildLiveChatAnalyticsReport(state.tickets, {
      officerAvailability: state.availability,
      agents: officerName
        ? [
            {
              id: state.profile?.id || "officer",
              name: officerName,
              availability: state.availability,
              activeChats: getAgentActiveChats(state.tickets, officerName).length,
              maxConcurrent: LIVE_CHAT_HOURS.defaultMaxConcurrentChats,
            },
          ]
        : [],
    });

    const head = node("div", "support-panel-head");
    const hWrap = node("div", "");
    hWrap.append(
      node("p", "eyebrow", "PORTAL REQUIREMENT 4(IV) · ONLINE CHAT ANALYTICS & STATISTICS"),
      node("h3", "", "Live chat & escalation analytics report"),
      node("p", "admin-help", `Operating hours: ${report.availability.scheduleLabel} · Status: ${report.availability.badgeLabel}`)
    );
    head.append(hWrap);

    const kpiStrip = node("div", "support-perf-grid");
    for (const [lbl, val, cap] of [
      ["Total live chats", String(report.totalChats), `${report.totalMessagesExchanged} messages exchanged`],
      ["Working hours (09:00 to 16:00)", `${report.workingHoursCount} (${report.workingHoursPct}%)`, "Mon to Fri CAT working window"],
      ["After-hours / holiday queued", `${report.afterHoursOrNonWorkingCount} (${report.afterHoursOrNonWorkingPct}%)`, "Queued with automatic availability notice"],
      ["SLA compliance rate", `${report.slaCompliancePct}%`, `Overall avg first reply: ${report.avgFirstResponseLabel}`],
    ]) {
      const c = node("article", "support-perf-card");
      const m = node("div", "support-perf-card-meta");
      m.append(node("span", "support-perf-label", lbl), node("strong", "support-perf-value", val));
      c.append(m, node("small", "support-perf-caption", cap));
      kpiStrip.append(c);
    }

    const channelTitle = node("h4", "", "Live chat & escalation channels");
    const channelList = node("div", "support-urgent-list");
    for (const ch of report.channelBreakdown) {
      const row = node("div", "support-urgent-item");
      const copy = node("div", "support-urgent-copy");
      copy.append(node("strong", "", ch.label), node("small", "", `${ch.count} chat${ch.count === 1 ? "" : "s"} (${ch.pct}% share)`));
      row.append(copy, node("span", "support-badge is-wait-chip", `${ch.pct}%`));
      channelList.append(row);
    }

    const agentTitle = node("h4", "", "Multi-user consultant load & concurrency");
    const agentList = node("div", "support-urgent-list");
    if (!report.agentRows.length) {
      agentList.append(node("p", "admin-help", "No consultant chat sessions recorded yet."));
    } else {
      for (const ag of report.agentRows) {
        const row = node("div", "support-urgent-item");
        const copy = node("div", "support-urgent-copy");
        copy.append(
          node("strong", "", `${ag.name} · ${ag.activeChats}/${ag.maxConcurrent} concurrent active (${ag.utilizationPct}% load)`),
          node("small", "", `Total handled: ${ag.handledCount} · Resolved today: ${ag.resolvedToday} · Avg 1st reply: ${ag.avgFirstResponseLabel} · CSAT: ${ag.satisfactionLabel}`)
        );
        row.append(copy);
        agentList.append(row);
      }
    }

    reportHost.replaceChildren(head, kpiStrip, channelTitle, channelList, agentTitle, agentList);
  }
}

document.querySelector("[data-support-export-csv]")?.addEventListener("click", () => {
  const officerName = state.profile?.full_name || "Support Officer";
  const report = buildLiveChatAnalyticsReport(state.tickets, {
    officerAvailability: state.availability,
    agents: [
      {
        id: state.profile?.id || "officer",
        name: officerName,
        availability: state.availability,
        activeChats: getAgentActiveChats(state.tickets, officerName).length,
        maxConcurrent: LIVE_CHAT_HOURS.defaultMaxConcurrentChats,
      },
    ],
  });
  const csv = buildLiveChatAnalyticsCsv(report);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `CEDA-Live-Chat-Analytics-${report.availability.dateKey}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus("Online chat analytics report exported as CSV.");
});

function renderAll(preserveDraft = false) {
  syncLiveChatHoursBanner();
  renderMetricsAndVisuals();
  renderList();
  renderPerformance();
  const form = conversation.querySelector(".support-message-composer");
  const hasDraft = preserveDraft && Boolean(form?.elements?.reply?.value?.trim());
  if (state.selected && !hasDraft) renderConversation();
}

function setupSecuritySection() {
  const mfaStatus = document.querySelector("[data-support-mfa-status]");
  const enrollBtn = document.querySelector("[data-support-enroll-mfa]");
  const setupBox = document.querySelector("[data-support-mfa-setup]");
  const qrImg = document.querySelector("[data-support-mfa-qr]");
  const secretOut = document.querySelector("[data-support-mfa-secret]");
  const mfaForm = document.querySelector("[data-support-mfa-form]");
  const mfaFeedback = document.querySelector("[data-support-mfa-feedback]");
  const pwForm = document.querySelector("[data-support-password-form]");
  const pwFeedback = document.querySelector("[data-support-pw-feedback]");
  const signOutOthersBtn = document.querySelector("[data-support-signout-others]");

  let activeFactorId = "";
  const refreshMfaLabel = () => {
    if (mfaStatus) mfaStatus.textContent = verifiedSession() ? "Verified (AAL2 session)" : "Not verified on this session";
  };
  refreshMfaLabel();

  enrollBtn?.addEventListener("click", async () => {
    enrollBtn.disabled = true;
    mfaFeedback.textContent = "Checking authenticator status…";
    try {
      const user = await apiRequest("/auth/v1/user", undefined, "GET");
      const factors = (user?.factors || []).filter(f => f.factor_type === "totp");
      const verified = factors.find(f => f.status === "verified");
      if (verified) {
        activeFactorId = verified.id;
        setupBox.hidden = true;
        mfaForm.hidden = false;
        mfaFeedback.textContent = "Enter the 6-digit code from your authenticator app.";
      } else {
        for (const pending of factors.filter(f => f.status === "unverified")) {
          await apiRequest(`/auth/v1/factors/${encodeURIComponent(pending.id)}`, undefined, "DELETE").catch(() => undefined);
        }
        const created = await apiRequest("/auth/v1/factors", { factor_type: "totp", friendly_name: "CEDA Support Officer" }, "POST");
        const qr = created?.totp?.qr_code;
        if (!created?.id || !qr) throw new Error("Authenticator setup is unavailable.");
        activeFactorId = created.id;
        qrImg.src = qr.startsWith("data:image/") ? qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`;
        secretOut.textContent = created?.totp?.secret ? created.totp.secret.match(/.{1,4}/g).join(" ") : "";
        setupBox.hidden = false;
        mfaForm.hidden = false;
        mfaFeedback.textContent = "Scan the QR code or enter the setup key, then enter the 6-digit code.";
      }
    } catch (error) {
      mfaFeedback.textContent = error.message || "Could not prepare authenticator setup.";
      enrollBtn.disabled = false;
    }
  });

  mfaForm?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!activeFactorId) return;
    const codeInput = mfaForm.elements.code;
    const submitBtn = mfaForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    mfaFeedback.textContent = "Verifying code…";
    try {
      const base = `/auth/v1/factors/${encodeURIComponent(activeFactorId)}`;
      const challenge = await apiRequest(`${base}/challenge`, {}, "POST");
      const result = await apiRequest(`${base}/verify`, { challenge_id: challenge.id, code: codeInput.value.trim() }, "POST");
      if (!result?.access_token || !saveAccountToken(result.access_token)) {
        throw new Error("Could not upgrade session. Sign in again.");
      }
      state.token = result.access_token;
      codeInput.value = "";
      setupBox.hidden = true;
      mfaForm.hidden = true;
      enrollBtn.disabled = false;
      refreshMfaLabel();
      mfaFeedback.textContent = "Authenticator verified for this session.";
    } catch (error) {
      mfaFeedback.textContent = error.message || "Verification failed.";
    } finally {
      submitBtn.disabled = false;
    }
  });

  pwForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const pw = pwForm.elements.password.value;
    const confirm = pwForm.elements.confirm.value;
    if (pw !== confirm) { pwFeedback.textContent = "The passwords do not match."; return; }
    const bytes = new TextEncoder().encode(pw).length;
    if (pw.length < 12 || bytes > 72 || !/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw) || !/[^a-zA-Z0-9\s]/.test(pw)) {
      pwFeedback.textContent = "Use 12-72 UTF-8 bytes with uppercase, lowercase, a number and a symbol.";
      return;
    }
    const submitBtn = pwForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    pwFeedback.textContent = "Updating password…";
    try {
      await apiRequest("/auth/v1/user", { password: pw }, "PUT");
      pwForm.reset();
      pwFeedback.textContent = "Password updated successfully.";
    } catch (error) {
      pwFeedback.textContent = error.message || "Could not update password.";
    } finally {
      submitBtn.disabled = false;
    }
  });

  signOutOthersBtn?.addEventListener("click", async () => {
    if (!window.confirm("End your other signed-in CEDA sessions?")) return;
    signOutOthersBtn.disabled = true;
    try {
      await apiRequest("/auth/v1/logout?scope=others", {}, "POST");
      setStatus("Other sessions signed out.");
    } catch (error) {
      setStatus(error.message || "Could not end other sessions.");
    } finally {
      signOutOthersBtn.disabled = false;
    }
  });
}

async function loadTickets(silent = false) {
  refresh.disabled = true;
  if (!silent) setStatus("Loading support requests…");
  try {
    state.tickets = await rpc("support_ticket_list");
    if (state.selected && !state.tickets.some(ticket => ticket.id === state.selected)) {
      closeConversationView();
    }
    if (!state.selected && state.tickets.length) {
      const initialTicket = visibleTickets()[0] || state.tickets[0];
      if (initialTicket) {
        state.selected = initialTicket.id;
        markOpened(initialTicket.id);
      }
    }
    renderAll(silent);
    if (!silent) setStatus("");
  } catch (error) {
    setStatus(error.message);
  } finally {
    refresh.disabled = false;
  }
}

async function verifiedProfileWithTimeout(timeoutMs = 12000) {
  let timerId = 0;
  try {
    return await Promise.race([
      verifiedAccountProfile(signupConfig, state.token),
      new Promise((_, reject) => {
        timerId = window.setTimeout(() => reject(new Error("Access check timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    window.clearTimeout(timerId);
  }
}

async function start() {
  if (retryBtn) retryBtn.hidden = true;
  if (!signupConfig || !state.token) {
    location.replace("/signin/");
    return;
  }
  try {
    const profile = await verifiedProfileWithTimeout();
    if (!profile || profile.account_role !== "support") {
      const destination = { admin: "/admin/", innovator: "/account/", assessor: "/assessor/", committee: "/committee/" }[profile?.account_role] || "/signin/";
      location.replace(destination);
      return;
    }
    state.profile = profile;
    globalThis.__cedaSetPortalActivityActor?.(profile, signupConfig, state.token);
    void import("./telemetry.js").then(m => m.initPortalTelemetry?.({ portalRole: "support" })).catch(() => {});
    const officerName = String(profile.full_name || "Support Officer").trim();
    const nameEl = document.querySelector("[data-support-name]");
    const firstEl = document.querySelector("[data-support-first-name]");
    if (nameEl) nameEl.textContent = officerName;
    if (firstEl) firstEl.textContent = officerName.split(/\s+/)[0] || "Officer";
    const pName = document.querySelector("[data-support-profile-name]");
    const pEmail = document.querySelector("[data-support-profile-email]");
    if (pName) pName.textContent = officerName;
    if (pEmail) pEmail.textContent = profile.email || "Verified email";
    if (dateLabel) {
      dateLabel.textContent = new Intl.DateTimeFormat("en-BW", {
        dateStyle: "full",
        timeZone: "Africa/Gaborone",
      }).format(new Date());
    }
    setAvailability(state.availability, false);

    if (menuPanel) menuPanel.hidden = false;
    if (accountHeader) accountHeader.hidden = false;
    if (rootPanel) rootPanel.hidden = false;
    updateActiveSection(false);

    setupSecuritySection();
    await loadTickets();
    setInterval(() => {
      if (document.visibilityState === "visible" && !refresh.disabled) void loadTickets(true);
    }, 20000);
  } catch (error) {
    if (retryBtn) retryBtn.hidden = false;
    setStatus(error?.message || "The support workspace could not load. Check your connection and try again.");
  }
}

for (const btn of availabilityButtons) {
  btn.setAttribute("aria-pressed", String(btn.dataset.supportAvailability === state.availability));
  btn.addEventListener("click", () => setAvailability(btn.dataset.supportAvailability));
}
for (const pill of statePills) {
  pill.addEventListener("click", () => {
    setQueueFilter(pill.dataset.supportStatePill || "all");
  });
}
filter.addEventListener("change", () => setQueueFilter(filter.value));
resetFiltersBtn?.addEventListener("click", () => {
  search.value = "";
  setQueueFilter("all");
});
search.addEventListener("input", renderList);
refresh.addEventListener("click", () => void loadTickets());
retryBtn?.addEventListener("click", () => void start());

const menu = document.querySelector("[data-support-layout]");
const menuToggle = document.querySelector("[data-support-menu-toggle]");
function collapseSupportMenu(collapsed) {
  menu?.classList.toggle("is-collapsed", collapsed);
  menuToggle?.setAttribute("aria-expanded", String(!collapsed));
  menuToggle?.setAttribute("aria-label", collapsed ? "Expand workspace menu" : "Collapse workspace menu");
}
try { collapseSupportMenu(localStorage.getItem("ceda.supportMenuCollapsed") === "true"); } catch {}
menuToggle?.addEventListener("click", () => {
  const collapsed = !menu?.classList.contains("is-collapsed");
  collapseSupportMenu(Boolean(collapsed));
  try { localStorage.setItem("ceda.supportMenuCollapsed", String(collapsed)); } catch {}
});

for (const link of navLinks) {
  link.addEventListener("click", () => {
    for (const item of navLinks) item.removeAttribute("aria-current");
    link.setAttribute("aria-current", "page");
  });
}
window.addEventListener("hashchange", () => updateActiveSection(true));

document.querySelector("[data-support-logout]").addEventListener("click", async event => {
  const button = event.currentTarget;
  button.disabled = true;
  const token = state.token;
  clearAccountToken();
  try {
    if (signupConfig && token) await logoutSignup(signupConfig, token);
  } finally {
    location.replace("/");
  }
});

void start();
