// Operational overview, follow-up matters, real reporting, and comprehensive per-user portal activity stream.
import {
  REPORT_PACKAGE_DEFS,
  buildReportExport,
  buildReportPdfBlob,
  emptyReportingSummary,
  formatTelemetryMetric,
  formatTurnaroundDuration,
  buildTurnaroundRows,
  normalizeReportingSummary,
  reportingPeriodLabel,
} from "./reportingOverview.js";

// 30-second RAM cache for the reporting summary (avoids hammering the DB on every period change).
const reportingRamCache = new Map();
function getReportingCached(key) {
  const entry = reportingRamCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { reportingRamCache.delete(key); return undefined; }
  return entry.value;
}
function setReportingCached(key, value) {
  reportingRamCache.set(key, { value, expiresAt: Date.now() + 30_000 });
  return value;
}

// Module-level current reporting summary (shared between all render functions).
let currentSummary = emptyReportingSummary(7);
const todayGaborone = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Gaborone",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const events = [];
const auditFeedEvents = [];
const knownDirectoryUsers = new Map();
const matters = [];

const el = (tag, value, klass) => {
  const n = document.createElement(tag);
  if (value !== undefined) n.textContent = value;
  if (klass) n.className = klass;
  return n;
};
const svg = (tag, attrs) => {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};

function classifyCategory(action = "", title = "", explicit = "") {
  if (explicit === "Login" || explicit === "Logout" || explicit === "Activity") return explicit;
  const text = `${action} ${title}`.toLowerCase();
  if (/\b(auth\.login|login|sign[\s-]*in|signed in)\b/.test(text)) return "Login";
  if (/\b(auth\.logout|logout|sign[\s-]*out|signed out|logged out)\b/.test(text)) return "Logout";
  return "Activity";
}

function humanizeAuditAction(action = "", reason = "", target = "") {
  const code = String(action || "").trim();
  const labels = {
    "auth.login": "Signed in to portal",
    "auth.logout": "Logged out of portal",
    "portal.navigate": reason || `Navigated to ${target}`,
    "portal.action": reason || `Performed action in ${target}`,
    "portal.form_submit": reason || `Submitted form in ${target}`,
    "application.revised": `Revised submitted application ${target}`,
    "application.status.intervened": `Changed application status on ${target}`,
    "application.message.replied": `Sent message reply on ${target}`,
    "content.saved": `Saved public content item (${target})`,
    "notification.saved": `Saved notification template or announcement (${target})`,
    "matter.updated": `Updated follow-up matter ${target}`,
    "configuration.saved": `Updated portal configuration (${target})`,
    "sector.saved": `Saved innovation sector (${target})`,
    "role.assigned": `Updated user role and access (${target})`,
    "user.created": `Created user account (${target})`,
  };
  return labels[code] || (reason && reason.length <= 90 ? reason : code.replace(/[._]/g, " "));
}

export function initializeOverview(openModal, applications, rpcCall, onMutationSaved) {
  const period = document.querySelector("[data-overview-period]");
  const range = () => {
    const pDays = Number(period.value) || 7;
    const liveDaily = Array.isArray(currentSummary?.telemetry?.dailyViews) ? currentSummary.telemetry.dailyViews : [];
    const fallbackDaily = emptyReportingSummary(pDays).telemetry.dailyViews;
    const rows = liveDaily.length >= pDays ? liveDaily.slice(-pDays) : fallbackDaily;
    const start = new Date(Date.now() - (pDays - 1) * 86400000).toLocaleDateString("en-CA", {
      timeZone: "Africa/Gaborone",
    });
    return { rows, start };
  };
  const cases = () => applications.filter(a => a.date >= range().start && a.date <= todayGaborone);

  function rebuildUnifiedEvents() {
    const localLogs = typeof globalThis.__cedaReadPortalActivityLog === "function"
      ? globalThis.__cedaReadPortalActivityLog()
      : [];
    const combined = [];
    const seen = new Set();

    const pushEntry = raw => {
      if (!raw || !raw.actor) return;
      const actor = String(raw.actor).trim();
      const date = String(raw.date || "").slice(0, 10) || todayGaborone;
      const time = String(raw.time || "00:00").slice(0, 5);
      const title = String(raw.title || raw.action || "Portal activity").trim();
      const record = String(raw.record || raw.target || "Portal").trim();
      const category = classifyCategory(raw.action, title, raw.category);
      const dedupeKey = `${actor.toLowerCase()}|${date}|${time}|${category}|${title.toLowerCase()}|${record.toLowerCase()}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      const known = knownDirectoryUsers.get(actor.toLowerCase());
      const role = raw.role && raw.role !== "Portal User"
        ? raw.role
        : known?.role || "Administrator";
      const email = raw.email || known?.email || "";

      combined.push({
        id: raw.id || dedupeKey,
        date,
        time,
        actor,
        email,
        role,
        category,
        action: raw.action || "portal.activity",
        title,
        record,
        detail: raw.detail || raw.reason || `${actor} (${role}) performed ${title} on ${record}.`,
      });
    };

    for (const item of localLogs) pushEntry(item);
    for (const item of auditFeedEvents) pushEntry(item);

    combined.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
    events.splice(0, events.length, ...combined);
    syncUserDropdowns();
  }

  function syncUserDropdowns() {
    const userMap = new Map();
    for (const u of knownDirectoryUsers.values()) {
      if (u.name) userMap.set(u.name.toLowerCase(), u);
    }
    for (const e of events) {
      if (!e.actor) continue;
      const key = e.actor.toLowerCase();
      const existing = userMap.get(key);
      userMap.set(key, {
        name: existing?.name || e.actor,
        role: existing?.role || e.role || "Innovator",
        email: existing?.email || e.email || "",
      });
    }
    const sortedUsers = [...userMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    const userStat = document.querySelector('[data-audit-stat="users"]');
    if (userStat) userStat.textContent = String(sortedUsers.length);

    for (const selector of ["[data-activity-user-filter]", "[data-audit-user-filter]"]) {
      const select = document.querySelector(selector);
      if (!select) continue;
      const previous = select.value;
      select.replaceChildren();
      const allOpt = el("option", `All users (${sortedUsers.length})`);
      allOpt.value = "";
      select.append(allOpt);
      for (const user of sortedUsers) {
        const opt = el("option", `${user.name} · ${user.role}`);
        opt.value = user.name;
        select.append(opt);
      }
      if (previous && sortedUsers.some(u => u.name.toLowerCase() === previous.toLowerCase())) {
        const match = sortedUsers.find(u => u.name.toLowerCase() === previous.toLowerCase());
        select.value = match.name;
      }
    }
  }

  function detail(title, paragraphs, entries = []) {
    const body = document.querySelector("[data-overview-detail-body]");
    body.replaceChildren();
    for (const text of paragraphs) body.append(el("p", text, "admin-modal-intro"));
    if (entries.length) {
      const dl = el("dl", undefined, "admin-ai-draft");
      for (const [key, value] of entries) dl.append(el("dt", key), el("dd", value));
      body.append(dl);
    }
    openModal(document.querySelector("[data-overview-detail]"), title);
  }

  function filterBySpecificUser(userName) {
    if (!userName) return;
    rebuildUnifiedEvents();
    const form = document.querySelector("[data-activity-filters]");
    if (form) {
      form.reset();
      const userSelect = form.elements.user;
      if (userSelect) {
        if (![...userSelect.options].some(o => o.value === userName)) {
          const opt = el("option", userName);
          opt.value = userName;
          userSelect.append(opt);
        }
        userSelect.value = userName;
      }
    }
    renderActivity();
    document.querySelector('[data-audit-tab="activity"]')?.click();
    location.hash = "#audit";
  }

  function open(key) {
    if (key === "applications" || key === "review") {
      const form = document.querySelector("[data-application-search]");
      form.reset();
      form.elements.from.value = range().start;
      form.elements.until.value = todayGaborone;
      if (key === "review") form.elements.status.value = "In review";
      form.dispatchEvent(new Event("change", { bubbles: true }));
      location.hash = "#applications";
      return;
    }
    const routes = {
      traffic: "analytics",
      active: "analytics",
      web: "health",
      ai: "optimus",
      support: "followup",
      delivery: "followup",
      feedback: "followup",
      audit: "audit",
      followup: "followup",
    };
    if (key === "traffic" || key === "active") {
      document.querySelector("[data-analytics-period]").value = period.value;
      renderAnalytics();
    }
    if (key === "support" || key === "delivery" || key === "feedback") {
      const form = document.querySelector("[data-issue-filters]");
      form.reset();
      form.elements.kind.value = key === "support" ? "Support" : key === "delivery" ? "Delivery" : "Feedback";
      renderMatters();
    }
    if (key === "audit") {
      document.querySelector('[data-audit-tab="activity"]')?.click();
    }
    if (routes[key]) location.hash = "#" + routes[key];
  }

  function tableRow(body, values) {
    const row = body.insertRow();
    for (const value of values) row.insertCell().textContent = value;
    return row;
  }

  function render() {
    rebuildUnifiedEvents();
    const { rows, start } = range();
    const selected = cases();
    for (const [key, value] of Object.entries({
      applications: selected.length,
      review: selected.filter(a => a.status === "In review").length,
      active: Number(currentSummary?.participation?.activeVisitorsNow || 0),
      visits: rows.reduce((n, r) => n + Number(r.views || 0), 0),
    })) {
      document.querySelector(`[data-overview-metric="${key}"]`).textContent = value.toLocaleString("en-BW");
    }
    const host = document.querySelector("[data-overview-chart]");
    host.replaceChildren();
    const max = Math.max(1, ...rows.map(r => Number(r.views || 0)));
    const chart = svg("svg", {
      viewBox: "0 0 600 205",
      role: "img",
      "aria-label": "Portal page views over time. Exact daily values appear in Analytics and reports.",
      class: "overview-traffic-chart",
    });
    for (let i = 0; i < 4; i++) {
      const y = 20 + i * 48;
      chart.append(svg("line", { x1: 40, x2: 590, y1: y, y2: y, class: "ai-grid" }));
      const label = svg("text", { x: 0, y: y + 4, class: "overview-axis" });
      label.textContent = String(Math.round(max * (1 - i / 3)));
      chart.append(label);
    }
    rows.forEach((r, i) => {
      const viewsCount = Number(r.views || 0);
      const height = (viewsCount / max) * 144;
      const step = 540 / rows.length;
      const bar = svg("rect", {
        x: 42 + i * step,
        y: 164 - height,
        width: Math.min(30, step * 0.65),
        height,
        rx: 4,
        class: "overview-traffic-bar",
      });
      bar.append(svg("title", {}));
      bar.firstChild.textContent = r.date + ": " + viewsCount + " page views";
      chart.append(bar);
      if (i === 0 || i === rows.length - 1 || rows.length <= 7) {
        const label = svg("text", { x: 42 + i * step, y: 190, class: "overview-axis" });
        label.textContent = r.date.slice(5);
        chart.append(label);
      }
    });
    host.append(chart);

    const outcomes = document.querySelector("[data-overview-outcomes]");
    outcomes.replaceChildren();
    for (const [label, klass] of [
      ["Submitted", "submitted"],
      ["In review", "review"],
      ["Approved", "approved"],
      ["Awarded", "awarded"],
      ["Rejected", "rejected"],
    ]) {
      const count = selected.filter(a => a.status === label).length;
      const row = el("div", undefined, "overview-outcome-row");
      const meter = el("meter");
      meter.min = 0;
      meter.max = Math.max(1, selected.length);
      meter.value = count;
      meter.setAttribute("aria-label", `${label}: ${count} of ${selected.length} applications`);
      row.append(el("span", label, "admin-case-badge case-" + klass), el("strong", String(count)), meter);
      outcomes.append(row);
    }
    if (!selected.length) outcomes.append(el("p", "No submissions in this period.", "admin-help"));

    const attention = document.querySelector("[data-overview-attention]");
    attention.replaceChildren();
    for (const [label, count, key] of [
      ["Reported bugs", matters.filter(m => m.kind === "Bug" && m.state !== "Resolved").length, "followup"],
      ["Support escalations", matters.filter(m => m.kind === "Support" && m.state !== "Resolved").length, "support"],
      ["Delivery failures", matters.filter(m => m.kind === "Delivery" && m.state !== "Resolved").length, "delivery"],
      ["User feedback", matters.filter(m => m.kind === "Feedback" && m.state !== "Resolved").length, "feedback"],
    ]) {
      const button = el("button");
      button.type = "button";
      button.append(el("span", label), el("strong", String(count)));
      button.addEventListener("click", () => open(key));
      attention.append(button);
    }

    const list = document.querySelector("[data-overview-events]");
    list.replaceChildren();
    const recentEvents = events.filter(e => e.date >= start).slice(0, 6);
    for (const entry of recentEvents.length ? recentEvents : events.slice(0, 6)) {
      const li = el("li");
      const button = el("button");
      button.type = "button";
      button.append(
        el("strong", `${entry.actor} · ${entry.title}`),
        el("time", `${entry.date} ${entry.time}`)
      );
      button.addEventListener("click", () => filterBySpecificUser(entry.actor));
      li.append(button);
      list.append(li);
    }
    document.querySelector("[data-overview-updated]").textContent =
      "Refreshed " +
      new Intl.DateTimeFormat("en-BW", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Gaborone" }).format(
        new Date()
      ) +
      " / Botswana time.";
    renderPipelineReport();
  }

  function renderPipelineReport() {
    const pipeline = document.querySelector("[data-report-pipeline]");
    if (!pipeline) return;
    pipeline.replaceChildren();
    const total = Math.max(1, applications.length);
    for (const [label, klass] of [
      ["Submitted", "submitted"],
      ["In review", "review"],
      ["Approved", "approved"],
      ["Awarded", "awarded"],
      ["Rejected", "rejected"],
    ]) {
      const count = applications.filter(a => a.status === label).length;
      const row = pipeline.insertRow();
      const badge = el("span", label, "admin-case-badge case-" + klass);
      row.insertCell().append(badge);
      row.insertCell().textContent = String(count);
      row.insertCell().textContent = Math.round((count / total) * 100) + "%";
    }
  }

  function renderAnalytics() {
    const p = Number(document.querySelector("[data-analytics-period]").value) || 7;
    if (currentSummary?.loaded && Number(currentSummary.periodDays) === p) {
      renderAnalyticsFromSummary(currentSummary);
      return;
    }
    const base = emptyReportingSummary(p);
    renderAnalyticsFromSummary(base);
    renderPipelineReport();
  }

  // ─── Real Reporting: render + export functions ────────────────────────────

  /** Update every analytics stat and sub-panel from a live reporting summary. */
  function renderReportingSummary(summary) {
    currentSummary = summary;
    renderAnalyticsFromSummary(summary);
    renderSectorTable(summary);
    renderParticipationTable(summary);
    renderTurnaroundTable(summary);
    renderReportPackages(summary);
    renderHealthSection(summary);
    render();
  }

  /** Overlay the analytics stats panel with live data from the RPC summary. */
  function renderAnalyticsFromSummary(summary) {
    const p = summary.periodDays;
    const tele = summary.telemetry;
    const part = summary.participation;
    const apps = summary.applications;

    // Stats
    const viewsStat = document.querySelector('[data-analytics-stat="views"]');
    if (viewsStat) viewsStat.textContent = (tele.totalViews || 0).toLocaleString("en-BW");

    const activeStat = document.querySelector('[data-analytics-stat="active"]');
    if (activeStat) activeStat.textContent = String(part.activeVisitorsNow ?? 0);

    const appsStat = document.querySelector('[data-analytics-stat="applications"]');
    if (appsStat) appsStat.textContent = String(apps.total ?? applications.length);

    const rateStat = document.querySelector('[data-analytics-stat="approvalRate"]');
    if (rateStat) rateStat.textContent = apps.approvalRatePct !== null && apps.approvalRatePct !== undefined ? apps.approvalRatePct + "%" : "N/A";

    const rateNote = document.querySelector('[data-analytics-stat-note="approvalRate"]');
    if (rateNote) rateNote.textContent = (apps.decidedCount ?? 0) + " decided applications";

    // Range label
    const rangeEl = document.querySelector("[data-analytics-range]");
    if (rangeEl) {
      const label = reportingPeriodLabel ? reportingPeriodLabel(p) : `Last ${p} day${p === 1 ? "" : "s"}`;
      rangeEl.textContent = `${label} · ${(tele.totalViews || 0).toLocaleString("en-BW")} page views · ${part.activeVisitorsNow ?? 0} active visitors now`;
    }

    // Daily breakdown table (always live database rows; zero-filled empty window before load)
    const dailyBody = document.querySelector("[data-analytics-days]");
    if (dailyBody) {
      dailyBody.replaceChildren();
      const liveDays = tele.dailyViews && tele.dailyViews.length ? tele.dailyViews : emptyReportingSummary(p).telemetry.dailyViews;
      for (const row of liveDays) {
        tableRow(dailyBody, [
          row.date,
          (row.views ?? 0).toLocaleString("en-BW"),
          row.uniqueSessions !== undefined ? String(row.uniqueSessions) : (row.sessions !== undefined ? String(row.sessions) : "0"),
          row.submissions !== undefined ? String(row.submissions) : "0",
        ]);
      }
    }

    // Live chart overlay (zero-filled live window when telemetry is empty)
    const chartHost = document.querySelector("[data-analytics-chart]");
    if (chartHost) {
      const rows = tele.dailyViews && tele.dailyViews.length ? tele.dailyViews : emptyReportingSummary(p).telemetry.dailyViews;
      const max = Math.max(1, ...rows.map(r => r.views || 0));
      chartHost.replaceChildren();
      const graph = svg("svg", {
        viewBox: "0 0 600 200",
        class: "overview-traffic-chart",
        role: "img",
        "aria-label": "Portal page views: live data. Exact daily values appear in the table.",
      });
      graph.append(
        svg("polyline", {
          points: rows.map((r, i) => `${30 + (i * 540) / Math.max(1, rows.length - 1)},${160 - ((r.views || 0) / max) * 130}`).join(" "),
          class: "ai-trend",
        })
      );
      if (rows.length === 1) graph.append(svg("circle", { cx: 30, cy: 30, r: 5, class: "insight-line-dot" }));
      chartHost.append(graph);
    }

    // Device breakdown
    const devicesEl = document.querySelector("[data-analytics-devices]");
    if (devicesEl) {
      devicesEl.replaceChildren();
      const deviceEntries = Array.isArray(tele.devices)
        ? tele.devices.map(d => [d.name || "Other", d.sharePct != null ? `${d.count ?? 0} (${d.sharePct}%)` : String(d.count ?? 0)])
        : tele.devices && typeof tele.devices === "object"
          ? Object.entries(tele.devices).map(([k, v]) => [k, String(v)])
          : [];
      if (deviceEntries.length) {
        for (const [device, countText] of deviceEntries) {
          const row = el("p");
          row.append(el("strong", device + ": "), document.createTextNode(countText));
          devicesEl.append(row);
        }
      } else {
        devicesEl.append(el("p", "No live device telemetry recorded in this window yet.", "admin-help"));
      }
    }

    // Top routes
    const routesEl = document.querySelector("[data-analytics-routes]");
    if (routesEl) {
      routesEl.replaceChildren();
      if (Array.isArray(tele.topRoutes) && tele.topRoutes.length) {
        for (const route of tele.topRoutes) {
          const row = el("p");
          row.append(el("code", route.path || route.route || "/"), document.createTextNode(`: ${route.views ?? route.count ?? 0} views`));
          routesEl.append(row);
        }
      } else {
        routesEl.append(el("p", "No live route telemetry recorded in this window yet.", "admin-help"));
      }
    }
  }

  /** Fill [data-report-sectors] tbody with live sector data. */
  function renderSectorTable(summary) {
    const body = document.querySelector("[data-report-sectors]");
    if (!body) return;
    body.replaceChildren();
    const sectors = summary.sectors;
    if (!sectors || !sectors.length) {
      const r = body.insertRow();
      const c = r.insertCell();
      c.colSpan = 5;
      c.textContent = "No live sector data recorded yet.";
      return;
    }
    for (const sec of sectors) {
      tableRow(body, [
        sec.name,
        String(sec.total ?? 0),
        String(sec.inReview ?? 0),
        String((sec.approved ?? 0) + (sec.awarded ?? 0)),
        String(sec.rejected ?? 0),
      ]);
    }
  }

  /** Fill [data-report-participation] tbody with user segment counts. */
  function renderParticipationTable(summary) {
    const body = document.querySelector("[data-report-participation]");
    if (!body) return;
    body.replaceChildren();
    const p = summary.participation;
    for (const [segment, count, notes] of [
      ["Total users", p.totalUsers ?? 0, `${p.activeUsers ?? 0} active / ${p.suspendedUsers ?? 0} suspended`],
      ["Innovators", p.innovators ?? 0, `${p.individuals ?? 0} individual / ${p.registeredCompanies ?? 0} registered company`],
      ["Assessors", p.assessors ?? 0, "Active reviewers"],
      ["Committee", p.committeeMembers ?? 0, "External observers"],
      ["Support officers", p.supportOfficers ?? 0, "Active queue"],
      ["Administrators", p.admins ?? 0, "Portal governance"],
      ["Active visitors now", p.activeVisitorsNow ?? 0, "Last 5 minutes"],
    ]) {
      tableRow(body, [segment, String(count), notes]);
    }
  }

  /** Fill [data-report-turnaround] tbody with turnaround SLA rows. */
  function renderTurnaroundTable(summary) {
    const body = document.querySelector("[data-report-turnaround]");
    if (!body) return;
    body.replaceChildren();
    const rows = buildTurnaroundRows(summary.turnaround);
    if (!rows || !rows.length) {
      const r = body.insertRow();
      const c = r.insertCell();
      c.colSpan = 5;
      c.textContent = "No turnaround data yet.";
      return;
    }
    for (const row of rows) {
      tableRow(body, [
        row.label,
        String(row.sampleCount ?? 0),
        row.avgDisplay ?? "N/A",
        row.medianDisplay ?? "N/A",
        row.p95Display ?? "N/A",
      ]);
    }
  }

  /** Fill [data-report-packages] tbody with the 7 report package rows + export buttons. */
  function renderReportPackages(summary) {
    const body = document.querySelector("[data-report-packages]");
    if (!body) return;
    body.replaceChildren();
    for (const pkg of REPORT_PACKAGE_DEFS) {
      const row = body.insertRow();
      const titleCell = row.insertCell();
      titleCell.append(el("strong", pkg.title), el("small", ": " + pkg.description, "admin-help"));
      row.insertCell().textContent = pkg.audience;
      row.insertCell().textContent = pkg.cadence;
      const actionsCell = row.insertCell();
      const csvBtn = el("button", "Export CSV", "admin-button-secondary");
      csvBtn.type = "button";
      csvBtn.addEventListener("click", () => triggerExport(pkg.key, "csv", summary));
      const pdfBtn = el("button", "Print / PDF", "admin-cta");
      pdfBtn.type = "button";
      pdfBtn.addEventListener("click", () => triggerExport(pkg.key, "pdf", summary));
      actionsCell.append(csvBtn, " ", pdfBtn);
    }
  }

  /** Fill the #health panel from live telemetry + optimus + notifications. */
  function renderHealthSection(summary) {
    const wv = summary.telemetry && summary.telemetry.webVitals ? summary.telemetry.webVitals : {};
    const opt = summary.optimus || {};
    const notif = summary.notifications || {};

    for (const [attr, val] of [
      ["lcp", formatTelemetryMetric ? formatTelemetryMetric(wv.lcpMs, "s") : (wv.lcpMs != null ? (wv.lcpMs / 1000).toFixed(2) + "s" : "N/A")],
      ["inp", formatTelemetryMetric ? formatTelemetryMetric(wv.inpMs, "ms") : (wv.inpMs != null ? wv.inpMs + "ms" : "N/A")],
      ["cls", formatTelemetryMetric ? formatTelemetryMetric(wv.cls, "cls") : (wv.cls != null ? String(wv.cls) : "N/A")],
      ["errors", String(wv.errorCount ?? 0)],
    ]) {
      const statEl = document.querySelector(`[data-health-stat="${attr}"]`);
      if (statEl) statEl.textContent = val;
    }

    const ttfbEl = document.querySelector("[data-health-ttfb]");
    if (ttfbEl) ttfbEl.textContent = formatTelemetryMetric ? formatTelemetryMetric(wv.ttfbMs, "ms", "No live samples yet.") : (wv.ttfbMs != null ? wv.ttfbMs + "ms" : "No live samples yet.");

    const availEl = document.querySelector("[data-health-availability]");
    if (availEl) availEl.textContent = wv.availabilityPct != null ? `${Number(wv.availabilityPct).toFixed(1)}%` : "No live samples yet.";

    const notifEl = document.querySelector("[data-health-notifications]");
    if (notifEl) notifEl.textContent = `${notif.sent ?? 0} sent / ${notif.queued ?? 0} queued / ${notif.failed ?? 0} failed (${notif.total ?? 0} total)`;

    const optimusEl = document.querySelector("[data-health-optimus]");
    if (optimusEl) {
      const helpful = opt.helpfulRatePct != null ? opt.helpfulRatePct + "% helpful" : "No ratings";
      optimusEl.textContent = `${opt.totalInteractions ?? 0} interactions (${opt.inWindowInteractions ?? 0} in window) · ${opt.escalations ?? 0} escalations · ${helpful}`;
    }
  }

  /**
   * Download a CSV or PDF export for a report package, then log the action to admin_audit.
   * Demo data is always included via buildReportExport (which merges demo records).
   */
  function triggerExport(key, format, summary) {
    const statusEl = document.querySelector("[data-export-status]");
    if (statusEl) { statusEl.hidden = false; statusEl.textContent = "Preparing export…"; }
    try {
      const exp = buildReportExport(key, summary || currentSummary);
      if (format === "csv") {
        const blob = new Blob([exp.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = exp.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else {
        const pdfBlob = buildReportPdfBlob(exp);
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = exp.pdfFilename || exp.filename.replace(/\.csv$/i, ".pdf");
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      if (statusEl) statusEl.textContent = `Exported "${exp.title}" as ${format.toUpperCase()}. Logging to audit…`;
      // Log to admin_audit (non-blocking, failures silently swallowed)
      if (rpcCall) {
        void rpcCall("admin_log_report_export", {
          p_report_key: key,
          p_format: format,
          p_period_days: (summary || currentSummary).periodDays || 7,
        }).then(() => {
          if (statusEl) statusEl.textContent = `Export logged. "${exp.title}" (${format.toUpperCase()}) recorded in audit log.`;
        }).catch(() => {
          if (statusEl) statusEl.textContent = `Exported "${exp.title}" as ${format.toUpperCase()}. (Audit log unavailable, will retry on reload.)`;
        });
      }
    } catch (err) {
      if (statusEl) { statusEl.hidden = false; statusEl.textContent = "Export failed: " + (err instanceof Error ? err.message : String(err)); }
    }
  }

  /**
   * Load the reporting summary from the RPC (with 30s RAM cache), then render all panels.
   * Falls back to emptyReportingSummary(periodDays) if the RPC errors or returns nothing.
   */
  async function loadReportingSummary(periodDays) {
    const days2 = [1, 7, 30].includes(Number(periodDays)) ? Number(periodDays) : 7;
    const cacheKey = `reporting_summary_${days2}`;
    const cached = getReportingCached(cacheKey);
    if (cached) {
      renderReportingSummary(cached);
      return;
    }
    try {
      const raw = rpcCall ? await rpcCall("admin_reporting_summary", { p_period_days: days2 }) : null;
      const summary = raw ? normalizeReportingSummary(raw, days2) : emptyReportingSummary(days2);
      setReportingCached(cacheKey, summary);
      renderReportingSummary(summary);
    } catch {
      renderReportingSummary(emptyReportingSummary(days2));
    }
  }

  // ─── End reporting functions ───────────────────────────────────────────────

  function replaceMatters(records) {
    if (!Array.isArray(records)) return;
    matters.splice(0, matters.length, ...records);
    renderMatters();
    render();
  }

  function showMatter(m) {
    const body = document.querySelector("[data-overview-detail-body]");
    body.replaceChildren();
    body.append(el("p", "Updates are saved and recorded in the administrator audit log.", "admin-modal-intro"));
    const dl = el("dl", undefined, "admin-ai-draft");
    for (const [label, value] of [
      ["Reference", m.id],
      ["Type", m.kind],
      ["Reported by", m.reporter],
      ["Reported (Botswana)", m.reported],
      ["Priority", m.priority],
      ["Status", m.state],
      ["Owner", m.owner],
      ["Report", m.detail],
      ["Steps to reproduce", m.steps || "Not supplied"],
    ]) {
      dl.append(el("dt", label), el("dd", value));
    }
    body.append(dl);
    if (m.application) {
      const link = el("button", "Open linked application " + m.application, "admin-button-secondary");
      link.type = "button";
      link.addEventListener("click", () => {
        document.querySelector("[data-dialog-close]").click();
        const form = document.querySelector("[data-application-search]");
        form.reset();
        form.elements.query.value = m.application;
        form.dispatchEvent(new Event("change", { bubbles: true }));
        location.hash = "#applications";
      });
      body.append(link);
    }
    if (m.kind === "Delivery") {
      body.append(el("p", "Inspect delivery logs before sending a notification again.", "admin-modal-intro"));
    }
    if (Array.isArray(m.thread) && m.thread.length) {
      body.append(el("h3", "Applicant & staff thread"));
      for (const entry of m.thread) {
        const card = el("article", undefined, "case-issue-entry");
        card.append(el("strong", `${entry.sender || "Portal"} (${entry.role || "user"}) · ${entry.at || ""}`), el("p", entry.body || ""));
        body.append(card);
      }
    }
    body.append(el("h3", "Investigation history"));
    const history = el("ol", undefined, "admin-case-timeline");
    if (!m.history?.length) history.append(el("li", "No updates recorded yet."));
    for (const item of m.history || []) history.append(el("li", `${item.at} (Botswana) / ${item.actor}: ${item.action}`));
    body.append(history);
    const adminName = document.querySelector("[data-admin-name]")?.textContent || "Administrator";
    const ownerOptions = [...new Set(["Unassigned", "Mpho Setlhare", adminName, m.owner])];
    const form = el("form", undefined, "admin-form followup-editor");
    const ownerLabel = el("label", "Owner");
    const owner = el("select");
    const statusLabel = el("label", "Status");
    const status = el("select");
    owner.name = "owner";
    status.name = "status";
    for (const value of ownerOptions) {
      const option = el("option", value);
      option.value = value;
      owner.append(option);
    }
    owner.value = m.owner;
    for (const value of ["Open", "Investigating", "Waiting", "Resolved"]) {
      const option = el("option", value);
      option.value = value;
      status.append(option);
    }
    status.value = m.state;
    ownerLabel.append(owner);
    statusLabel.append(status);
    const replyLabel = el("label", "Reply visible to innovator (optional)", "admin-form-wide");
    const reply = el("textarea");
    reply.name = "replyMessage";
    reply.maxLength = 2000;
    reply.rows = 2;
    reply.placeholder = "Optional message delivered directly to the innovator support thread & inbox...";
    replyLabel.append(reply);
    const reasonLabel = el("label", "Internal investigation note or reason for change", "admin-form-wide");
    const reason = el("textarea");
    reason.name = "reason";
    reason.maxLength = 500;
    reason.rows = 3;
    reason.placeholder = "Describe what you checked or why the status changed";
    reasonLabel.append(reason);
    const save = el("button", "Save update");
    save.type = "submit";
    form.append(ownerLabel, statusLabel, replyLabel, reasonLabel, save);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const message = reason.value.trim();
      const replyText = reply.value.trim();
      const changed = owner.value !== m.owner || status.value !== m.state;
      if (!changed && !message && !replyText) return;
      if (message.length < 5) {
        reason.setCustomValidity("Enter at least five characters explaining the update.");
        reason.reportValidity();
        return;
      }
      reason.setCustomValidity("");
      if (replyText && replyText.length < 2) {
        reply.setCustomValidity("Enter at least 2 characters for an applicant reply.");
        reply.reportValidity();
        return;
      }
      reply.setCustomValidity("");
      try {
        if (rpcCall) {
          const dbRecords = replyText
            ? await rpcCall("admin_update_matter_with_reply", {
                matter_ref: m.id,
                new_owner: owner.value,
                new_state: status.value,
                reason: message,
                reply_message: replyText,
              })
            : await rpcCall("admin_update_matter", {
                matter_ref: m.id,
                new_owner: owner.value,
                new_state: status.value,
                reason: message,
              });
          replaceMatters(dbRecords);
          const updated = matters.find(item => item.id === m.id) || m;
          showMatter(updated);
          if (onMutationSaved) void onMutationSaved();
          document.querySelector("[data-dialog-status]").textContent = replyText
            ? "Matter updated and reply sent to innovator."
            : "Matter updated and recorded in the administrator audit log.";
        } else {
          const action = `Owner: ${m.owner} to ${owner.value}; status: ${m.state} to ${status.value}. ${message}`;
          m.owner = owner.value;
          m.state = status.value;
          m.history.push({
            actor: adminName,
            action,
            at: new Intl.DateTimeFormat("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Gaborone" }).format(
              new Date()
            ),
          });
          renderMatters();
          render();
          showMatter(m);
          document.querySelector("[data-dialog-status]").textContent = "Matter updated.";
        }
      } catch (err) {
        document.querySelector("[data-dialog-status]").textContent = err.message || "Update could not be saved.";
      }
    });
    body.append(form);
    body.append(el("p", "All status and ownership updates are audited with your verified administrator account.", "admin-help"));
    openModal(document.querySelector("[data-overview-detail]"), m.id + " / " + m.title);
  }

  function renderMatters() {
    const form = document.querySelector("[data-issue-filters]").elements;
    const query = form.query.value.trim().toLowerCase();
    for (const state of ["Open", "Investigating", "Waiting", "Resolved"]) {
      document.querySelector(`[data-issue-total="${state}"]`).textContent = String(matters.filter(m => m.state === state).length);
    }
    for (const button of document.querySelectorAll("[data-issue-summary]")) {
      button.setAttribute("aria-pressed", String(form.state.value === button.dataset.issueSummary));
    }
    const selected = matters.filter(
      m =>
        [m.id, m.title, m.reporter, m.application || ""].some(v => v.toLowerCase().includes(query)) &&
        (!form.kind.value || m.kind === form.kind.value) &&
        (!form.state.value || m.state === form.state.value) &&
        (!form.priority.value || m.priority === form.priority.value) &&
        (!form.owner.value || m.owner === form.owner.value)
    );
    const body = document.querySelector("[data-issue-rows]");
    body.replaceChildren();
    for (const m of selected) {
      const row = tableRow(body, [m.id + " / " + m.title, m.kind, m.priority, m.state, m.owner, m.reported]);
      const button = el("button", "View issue");
      for (const [index, category, value] of [
        [1, "type", m.kind],
        [2, "priority", m.priority],
        [3, "status", m.state],
      ]) {
        const cell = row.cells[index];
        cell.replaceChildren(el("span", value, "followup-badge followup-" + category + "-" + value.toLowerCase()));
      }
      button.type = "button";
      button.setAttribute("aria-label", "View issue " + m.id);
      button.addEventListener("click", () => showMatter(m));
      row.insertCell().append(button);
    }
    if (!selected.length) {
      const cell = body.insertRow().insertCell();
      cell.colSpan = 7;
      cell.textContent = matters.length ? "No matters match these filters. Clear filters to see the full queue." : "No follow-up matters recorded yet.";
    }
    document.querySelector("[data-issue-count]").textContent = `Showing ${selected.length} of ${matters.length} matters`;
  }

  function renderUserSummaryBanner(userFilter, userEvents) {
    const summaryHost = document.querySelector("[data-activity-user-summary]");
    if (!summaryHost) return;
    if (!userFilter) {
      summaryHost.hidden = true;
      summaryHost.replaceChildren();
      return;
    }
    summaryHost.hidden = false;
    summaryHost.replaceChildren();

    const known = knownDirectoryUsers.get(userFilter.toLowerCase());
    const sampleEvent = userEvents[0];
    const role = known?.role || sampleEvent?.role || "Portal User";
    const email = known?.email || sampleEvent?.email || "";
    const loginCount = userEvents.filter(e => e.category === "Login").length;
    const actionCount = userEvents.filter(e => e.category === "Activity").length;
    const logoutCount = userEvents.filter(e => e.category === "Logout").length;
    const latest = sampleEvent ? `${sampleEvent.date} ${sampleEvent.time} CAT` : "No events yet";

    const head = el("div", undefined, "admin-activity-user-head");
    const titleWrap = el("div", undefined, "admin-activity-user-identity");
    const strong = el("strong", userFilter);
    const roleBadge = el("span", role, "admin-role-badge " + ({
      Administrator: "admin-role-admin",
      Assessor: "admin-role-assessor",
      "Support Officer": "admin-role-support",
      Committee: "admin-role-committee",
      Innovator: "admin-role-innovator",
    }[role] || ""));
    titleWrap.append(strong, roleBadge);
    if (email) titleWrap.append(el("span", email, "admin-case-reference"));

    const clearBtn = el("button", "Show all users", "admin-button-secondary");
    clearBtn.type = "button";
    clearBtn.addEventListener("click", () => {
      const form = document.querySelector("[data-activity-filters]");
      if (form?.elements.user) form.elements.user.value = "";
      renderActivity();
    });
    head.append(titleWrap, clearBtn);

    const pills = el("div", undefined, "admin-activity-user-metrics");
    for (const [label, val, tone] of [
      ["Total logs", userEvents.length, ""],
      ["Logins", loginCount, "is-login"],
      ["Portal actions", actionCount, "is-activity"],
      ["Logouts", logoutCount, "is-logout"],
      ["Latest activity", latest, ""],
    ]) {
      const chip = el("span", `${label}: ${val}`, `admin-activity-metric-pill ${tone}`.trim());
      pills.append(chip);
    }
    summaryHost.append(head, pills);
  }

  function renderActivity() {
    rebuildUnifiedEvents();
    const formEl = document.querySelector("[data-activity-filters]");
    if (!formEl) return;
    const form = formEl.elements;
    const query = (form.query?.value || "").trim().toLowerCase();
    const userFilter = (form.user?.value || "").trim();
    const roleFilter = (form.role?.value || "").trim();
    const categoryFilter = (form.category?.value || "").trim();

    const userEvents = userFilter
      ? events.filter(e => e.actor.toLowerCase() === userFilter.toLowerCase())
      : events;
    renderUserSummaryBanner(userFilter, userEvents);

    const selected = userEvents.filter(
      e =>
        (!query ||
          [e.actor, e.email || "", e.title, e.record, e.detail || "", e.action || ""].some(v =>
            v.toLowerCase().includes(query)
          )) &&
        (!roleFilter || e.role === roleFilter) &&
        (!categoryFilter || e.category === categoryFilter)
    );

    const body = document.querySelector("[data-activity-rows]");
    body.replaceChildren();
    const roleClasses = {
      Administrator: "admin-role-admin",
      Assessor: "admin-role-assessor",
      "Support Officer": "admin-role-support",
      Innovator: "admin-role-innovator",
      System: "",
    };
    const categoryClasses = {
      Login: "sector-published",
      Activity: "sector-draft",
      Logout: "sector-archived",
    };

    for (const entry of selected) {
      const row = body.insertRow();
      row.insertCell().textContent = `${entry.date} ${entry.time}`;

      const userCell = row.insertCell();
      const userBtn = el("button", entry.actor, "overview-link");
      userBtn.type = "button";
      userBtn.title = `Filter all portal logs for ${entry.actor}`;
      userBtn.addEventListener("click", () => {
        if (form.user) {
          form.user.value = entry.actor;
          renderActivity();
        }
      });
      userCell.append(userBtn);
      if (entry.email) {
        const sub = el("small", entry.email, "admin-case-reference");
        userCell.append(sub);
      }

      const roleCell = row.insertCell();
      roleCell.append(el("span", entry.role, "admin-role-badge " + (roleClasses[entry.role] || "")));

      const catCell = row.insertCell();
      catCell.append(el("span", entry.category || "Activity", "admin-sector-badge " + (categoryClasses[entry.category] || "sector-draft")));

      row.insertCell().textContent = entry.title;
      row.insertCell().textContent = entry.record;

      const actionCell = row.insertCell();
      const button = el("button", "View details");
      button.type = "button";
      button.addEventListener("click", () =>
        detail(
          entry.title,
          [entry.detail],
          [
            ["User", entry.email ? `${entry.actor} (${entry.email})` : entry.actor],
            ["Role", entry.role],
            ["Event category", entry.category || "Activity"],
            ["Action code", entry.action || "portal.activity"],
            ["Target / record", entry.record],
            ["Time (Botswana)", `${entry.date} ${entry.time}`],
          ]
        )
      );
      actionCell.append(button);
    }

    if (!selected.length) {
      const cell = body.insertRow().insertCell();
      cell.colSpan = 7;
      cell.textContent = userFilter
        ? `No recorded ${categoryFilter ? categoryFilter.toLowerCase() + " " : ""}events for ${userFilter} match these filters.`
        : "No activity matches these filters.";
    }

    document.querySelector("[data-activity-count]").textContent = userFilter
      ? `Showing ${selected.length} of ${userEvents.length} logged events for ${userFilter} (${events.length} total portal events)`
      : `Showing ${selected.length} of ${events.length} logged portal events`;
    const stat = document.querySelector('[data-audit-stat="activity"]');
    if (stat) stat.textContent = String(events.length);
  }

  function syncAuditRecords(records = [], directoryUsers = []) {
    if (Array.isArray(directoryUsers)) {
      for (const u of directoryUsers) {
        if (!u || !u.full_name) continue;
        const roleLabel = {
          admin: "Administrator",
          assessor: "Assessor",
          support: "Support Officer",
          committee: "Committee Observer",
          innovator: "Innovator",
        }[u.account_role] || "Innovator";
        knownDirectoryUsers.set(u.full_name.trim().toLowerCase(), {
          name: u.full_name.trim(),
          email: u.email || "",
          role: roleLabel,
        });
      }
    }
    if (Array.isArray(records)) {
      auditFeedEvents.length = 0;
      for (const item of records) {
        if (!item) continue;
        const d = item.created_at ? new Date(item.created_at) : new Date();
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
          hour12: false,
        }).format(d);
        const title = item.title && item.title !== item.action
          ? item.title
          : humanizeAuditAction(item.action, item.reason, item.target);
        auditFeedEvents.push({
          id: `audit-${item.id || Date.now()}`,
          date: dateStr,
          time: timeStr,
          actor: item.actor || "Administrator",
          email: item.actor_email || "",
          role: item.role && item.role !== "Portal User" ? item.role : "Administrator",
          category: classifyCategory(item.action, title, item.category),
          action: item.action || "admin.audit",
          title,
          record: item.target || "Portal",
          detail: item.reason ? `${title}: ${item.reason}` : title,
        });
      }
    }
    renderActivity();
    render();
  }

  document.querySelector("[data-analytics-period]").addEventListener("change", renderAnalytics);
  // Reload live reporting summary when analytics period selector changes.
  document.querySelector("[data-analytics-period]").addEventListener("change", () => {
    const p = Number(document.querySelector("[data-analytics-period]").value);
    void loadReportingSummary(p);
  });
  // Top-level export buttons (executive summary CSV / PDF).
  for (const btn of document.querySelectorAll("[data-export-csv]")) {
    btn.addEventListener("click", () => triggerExport(btn.dataset.exportCsv || "executive", "csv", currentSummary));
  }
  for (const btn of document.querySelectorAll("[data-export-pdf]")) {
    btn.addEventListener("click", () => triggerExport(btn.dataset.exportPdf || "executive", "pdf", currentSummary));
  }
  for (const [selector, update] of [
    ["[data-issue-filters]", renderMatters],
    ["[data-activity-filters]", renderActivity],
  ]) {
    const form = document.querySelector(selector);
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    form.addEventListener("submit", e => {
      e.preventDefault();
      update();
    });
    form.addEventListener("reset", () => queueMicrotask(update));
  }
  for (const button of document.querySelectorAll("[data-issue-summary]")) {
    button.addEventListener("click", () => {
      const form = document.querySelector("[data-issue-filters]");
      form.elements.state.value = form.elements.state.value === button.dataset.issueSummary ? "" : button.dataset.issueSummary;
      renderMatters();
    });
  }

  document.addEventListener("ceda:portalactivity", () => {
    renderActivity();
    render();
  });
  if (typeof window !== "undefined") {
    window.addEventListener("storage", event => {
      if (!event.key || event.key === "ceda.portal.activity.v1") {
        renderActivity();
        render();
      }
    });
  }

  renderAnalytics();
  renderMatters();
  renderActivity();
  for (const button of document.querySelectorAll("[data-overview-open]")) {
    button.addEventListener("click", () => open(button.dataset.overviewOpen));
  }
  document.addEventListener("ceda:sampleapplicationschanged", render);
  period.addEventListener("change", () => {
    render();
    void loadReportingSummary(Number(period.value));
  });
  document.querySelector("[data-overview-refresh]").addEventListener("click", () => {
    reportingRamCache.clear();
    render();
    void loadReportingSummary(Number(period.value));
  });
  render();
  return { replaceMatters, syncAuditRecords, filterBySpecificUser, loadReportingSummary };
}
