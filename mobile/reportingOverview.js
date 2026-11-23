// @ts-check

/**
 * Shared real reporting, turnaround calculation, and CSV / print-report builders
 * consumed by Web Admin (`/admin/`), Mobile Admin (`AdminWorkspace`), and automated tests.
 */

export const REPORTING_PERIODS = /** @type {const} */ ([1, 7, 30]);

export const APPLICATION_REPORT_STAGES = /** @type {const} */ ([
  "Submitted",
  "In review",
  "Changes requested",
  "Approved",
  "Awarded",
  "Rejected",
  "Withdrawn",
]);

export const REPORT_PACKAGE_DEFS = /** @type {const} */ ([
  {
    key: "executive",
    title: "Executive portal summary",
    audience: "Executive leadership & board",
    cadence: "Live · 1d / 7d / 30d window",
    description: "Participation, application pipeline, outcomes, turnaround SLAs, and telemetry health in one sheet.",
  },
  {
    key: "outcomes",
    title: "Application outcomes & timeline",
    audience: "Innovation leadership",
    cadence: "Submitted applications only",
    description: "Stage distribution, approval rate, and daily submission counts across the selected window.",
  },
  {
    key: "sectors",
    title: "Sector activity breakdown",
    audience: "Sector leads & operations",
    cadence: "Live sector tally",
    description: "Per-sector submission counts, in-review backlog, approvals, rejections, and turnaround targets.",
  },
  {
    key: "turnaround",
    title: "Assessment & support turnaround",
    audience: "Administration & quality",
    cadence: "Average, median & P95",
    description: "Cycle-time durations across submission, review start, assessor voting, clarification, and support.",
  },
  {
    key: "health",
    title: "Traffic, Web Vitals & assistant health",
    audience: "Technical & service team",
    cadence: "14-day telemetry retention",
    description: "Sanitized portal page views, device shares, route popularity, Core Web Vitals, notifications, and Optimus AI.",
  },
  {
    key: "applications",
    title: "Applications registry & audit",
    audience: "Program administration",
    cadence: "Live & seeded demo records",
    description: "Itemized application records including reference, title, applicant, sector, stage, submission date, and data source.",
  },
  {
    key: "matters",
    title: "Operational & support matters",
    audience: "Operations & support leads",
    cadence: "Live & seeded demo tickets",
    description: "Itemized operational follow-up matters with ticket ref, title, category, priority, status, assignee, and data source.",
  },
]);

const GABORONE_TIMEZONE = "Africa/Gaborone";

/**
 * Returns YYYY-MM-DD in Africa/Gaborone timezone.
 * @param {Date} [date]
 * @returns {string}
 */
export function currentGaboroneDateKey(date = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: GABORONE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Shifts a YYYY-MM-DD calendar date by `deltaDays`.
 * @param {string} dateKey
 * @param {number} deltaDays
 * @returns {string}
 */
export function shiftDateKey(dateKey, deltaDays) {
  const safe = /^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))
    ? String(dateKey)
    : currentGaboroneDateKey();
  const [y, m, d] = safe.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return utc.toISOString().slice(0, 10);
}

/**
 * Normalizes a requested reporting window into one of 1, 7, or 30 days.
 * @param {unknown} value
 * @returns {1 | 7 | 30}
 */
export function normalizeReportingPeriod(value) {
  const num = Number(value);
  if (num === 1) return 1;
  if (num === 30) return 30;
  return 7;
}

/**
 * Builds a clean zero/empty reporting summary for initial state before RPC loads.
 * Contains zero fabricated demo values.
 * @param {unknown} [period]
 * @param {string} [referenceDateKey]
 */
export function emptyReportingSummary(period = 7, referenceDateKey = currentGaboroneDateKey()) {
  const periodDays = normalizeReportingPeriod(period);
  const windowEnd = /^\d{4}-\d{2}-\d{2}$/.test(String(referenceDateKey || ""))
    ? String(referenceDateKey)
    : currentGaboroneDateKey();
  const windowStart = shiftDateKey(windowEnd, -(periodDays - 1));
  const dailyViews = [];
  const dailySubmissions = [];
  for (let i = periodDays - 1; i >= 0; i -= 1) {
    const date = shiftDateKey(windowEnd, -i);
    dailyViews.push({ date, views: 0, uniqueSessions: 0, submissions: 0 });
    dailySubmissions.push({ date, count: 0 });
  }

  return {
    loaded: false,
    generatedAt: "",
    periodDays,
    windowStart,
    windowEnd,
    participation: {
      totalUsers: 0,
      activeUsers: 0,
      suspendedUsers: 0,
      innovators: 0,
      assessors: 0,
      committeeMembers: 0,
      supportOfficers: 0,
      admins: 0,
      individuals: 0,
      registeredCompanies: 0,
      activeVisitorsNow: 0,
    },
    applications: {
      total: 0,
      submitted: 0,
      inReview: 0,
      changesRequested: 0,
      approved: 0,
      awarded: 0,
      rejected: 0,
      withdrawn: 0,
      demoTotal: 0,
      liveTotal: 0,
      draftsExcluded: 0,
      inWindowTotal: 0,
      decidedCount: 0,
      approvalRatePct: /** @type {number | null} */ (null),
      dailySubmissions,
      records: /** @type {Array<{ id: string; reference: string; title: string; applicant: string; sector: string; status: string; applicantType?: string; isDemo?: boolean; source?: string; submittedDate?: string; version?: number }>} */ ([]),
    },
    sectors: /** @type {Array<{ id: string; name: string; status: string; total: number; submitted: number; inReview: number; changesRequested: number; approved: number; awarded?: number; rejected: number; withdrawn: number }>} */ ([]),
    turnaround: {
      submissionToReviewStart: { key: "submissionToReviewStart", label: "Submission to review start", avgHours: /** @type {number | null} */ (null), medianHours: /** @type {number | null} */ (null), p95Hours: /** @type {number | null} */ (null), sampleCount: 0 },
      assessmentRoundDuration: { key: "assessmentRoundDuration", label: "Assessment round turnaround", avgHours: /** @type {number | null} */ (null), medianHours: /** @type {number | null} */ (null), p95Hours: /** @type {number | null} */ (null), sampleCount: 0 },
      submissionToDecision: { key: "submissionToDecision", label: "Submission to final decision", avgHours: /** @type {number | null} */ (null), medianHours: /** @type {number | null} */ (null), p95Hours: /** @type {number | null} */ (null), sampleCount: 0 },
      clarificationCycle: { key: "clarificationCycle", label: "Clarification response cycle", avgHours: /** @type {number | null} */ (null), medianHours: /** @type {number | null} */ (null), p95Hours: /** @type {number | null} */ (null), sampleCount: 0 },
      supportFirstResponse: { key: "supportFirstResponse", label: "Support first response", avgHours: /** @type {number | null} */ (null), medianHours: /** @type {number | null} */ (null), p95Hours: /** @type {number | null} */ (null), sampleCount: 0 },
      supportResolution: { key: "supportResolution", label: "Support ticket resolution", avgHours: /** @type {number | null} */ (null), medianHours: /** @type {number | null} */ (null), p95Hours: /** @type {number | null} */ (null), sampleCount: 0 },
    },
    telemetry: {
      totalViews: 0,
      uniqueSessions: 0,
      dailyViews,
      devices: /** @type {Array<{ name: string; count: number; sharePct: number }>} */ ([]),
      topRoutes: /** @type {Array<{ route: string; label: string; views: number }>} */ ([]),
      webVitals: {
        sampleCount: 0,
        lcpMs: /** @type {number | null} */ (null),
        inpMs: /** @type {number | null} */ (null),
        cls: /** @type {number | null} */ (null),
        ttfbMs: /** @type {number | null} */ (null),
        errorCount: 0,
        errorRatePct: /** @type {number | null} */ (null),
        availabilityPct: /** @type {number | null} */ (null),
      },
      dailyTelemetryHealth: /** @type {Array<{ date: string; lcpMs: number | null; inpMs: number | null; errorCount: number; requestErrorCount: number }>} */ ([]),
    },
    optimus: {
      totalInteractions: 0,
      inWindowInteractions: 0,
      helpfulCount: 0,
      notHelpfulCount: 0,
      helpfulRatePct: /** @type {number | null} */ (null),
      escalations: 0,
      inWindowEscalations: 0,
      escalationRatePct: /** @type {number | null} */ (null),
      avgLatencyMs: /** @type {number | null} */ (null),
      errorCount: 0,
      reliabilityPct: /** @type {number | null} */ (null),
      dailyInteractions: /** @type {Array<{ date: string; count: number; escalations: number; avgLatencyMs: number | null }>} */ ([]),
    },
    notifications: {
      total: 0,
      queued: 0,
      sent: 0,
      failed: 0,
      open: 0,
      active: 0,
    },
    matters: {
      total: 0,
      open: 0,
      investigating: 0,
      waiting: 0,
      resolved: 0,
      demoTotal: 0,
      liveTotal: 0,
      inWindowReported: 0,
      inWindowResolved: 0,
      records: /** @type {Array<{ id: string; reference: string; title: string; kind: string; priority: string; state: string; ownerName?: string; applicationRef?: string; isDemo?: boolean; source?: string; reportedAt?: string; resolvedAt?: string }>} */ ([]),
    },
    owners: /** @type {Array<{ id: string; name: string; role: string }>} */ ([]),
  };
}

/**
 * Coerces a finite number or returns `fallback`.
 * @param {unknown} value
 * @param {number | null} [fallback]
 * @returns {number | null}
 */
function toNullableNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Coerces a non-negative integer count.
 * @param {unknown} value
 * @returns {number}
 */
function toInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.trunc(num);
}

/**
 * Normalizes a turnaround bucket from SQL/JSON.
 * @param {Record<string, unknown> | null | undefined} raw
 * @param {string} key
 * @param {string} label
 */
function normalizeTurnaroundEntry(raw, key, label) {
  const obj = raw && typeof raw === "object" ? raw : {};
  const sampleCount = toInt(obj.sampleCount ?? obj.sample_count);
  return {
    key,
    label,
    avgHours: sampleCount > 0 ? toNullableNumber(obj.avgHours ?? obj.avg_hours) : null,
    medianHours: sampleCount > 0 ? toNullableNumber(obj.medianHours ?? obj.median_hours) : null,
    p95Hours: sampleCount > 0 ? toNullableNumber(obj.p95Hours ?? obj.p95_hours) : null,
    sampleCount,
  };
}

/**
 * Normalizes raw `admin_reporting_summary` RPC output into a deterministic, typed structure.
 * @param {unknown} raw
 * @param {unknown} [fallbackPeriod]
 */
export function normalizeReportingSummary(raw, fallbackPeriod = 7) {
  const source = raw && typeof raw === "object" ? /** @type {Record<string, any>} */ (raw) : null;
  const periodDays = normalizeReportingPeriod(source?.periodDays ?? source?.period_days ?? fallbackPeriod);
  const windowEnd = typeof source?.windowEnd === "string"
    ? source.windowEnd
    : typeof source?.window_end === "string"
      ? source.window_end
      : currentGaboroneDateKey();
  const base = emptyReportingSummary(periodDays, windowEnd);

  if (!source) return base;

  const p = source.participation || {};
  const apps = source.applications || {};
  const t = source.turnaround || {};
  const tel = source.telemetry || {};
  const wv = tel.webVitals || tel.web_vitals || {};
  const opt = source.optimus || {};
  const notif = source.notifications || {};
  const mat = source.matters || {};

  const dailySubmissionsMap = new Map(
    Array.isArray(apps.dailySubmissions || apps.daily_submissions)
      ? /** @type {Array<Record<string, any>>} */ (apps.dailySubmissions || apps.daily_submissions).map((row) => [String(row?.date || ""), toInt(row?.count)])
      : []
  );

  const dailyTelemetryMap = new Map(
    Array.isArray(tel.dailyViews || tel.daily_views)
      ? /** @type {Array<Record<string, any>>} */ (tel.dailyViews || tel.daily_views).map((row) => [
          String(row?.date || ""),
          {
            views: toInt(row?.views),
            uniqueSessions: toInt(row?.uniqueSessions ?? row?.unique_sessions),
            submissions: toInt(row?.submissions),
          },
        ])
      : []
  );

  const mergedDailyViews = base.telemetry.dailyViews.map((entry) => {
    const found = dailyTelemetryMap.get(entry.date);
    const subs = dailySubmissionsMap.get(entry.date) ?? found?.submissions ?? 0;
    return {
      date: entry.date,
      views: found ? found.views : 0,
      uniqueSessions: found ? found.uniqueSessions : 0,
      submissions: subs,
    };
  });

  const mergedDailySubmissions = base.applications.dailySubmissions.map((entry) => ({
    date: entry.date,
    count: dailySubmissionsMap.get(entry.date) ?? 0,
  }));

  const decidedCount = toInt(apps.decidedCount ?? apps.decided_count ?? (toInt(apps.approved) + toInt(apps.rejected)));
  const approvedCount = toInt(apps.approved);
  const approvalRatePct = decidedCount > 0
    ? toNullableNumber(apps.approvalRatePct ?? apps.approval_rate_pct, Math.round((approvedCount / decidedCount) * 1000) / 10)
    : null;

  const rawDevices = Array.isArray(tel.devices) ? /** @type {Array<Record<string, any>>} */ (tel.devices) : [];
  const totalDeviceCount = rawDevices.reduce((sum, item) => sum + toInt(item?.count), 0);
  const normalizedDevices = rawDevices
    .map((item) => {
      const count = toInt(item?.count);
      const name = String(item?.name || "Other");
      const sharePct = totalDeviceCount > 0
        ? Math.round((count / totalDeviceCount) * 100)
        : 0;
      return { name, count, sharePct };
    })
    .filter((item) => item.count > 0);

  const rawRoutes = Array.isArray(tel.topRoutes || tel.top_routes)
    ? /** @type {Array<Record<string, any>>} */ (tel.topRoutes || tel.top_routes)
    : [];
  const normalizedRoutes = rawRoutes
    .map((item) => ({
      route: String(item?.route || "/"),
      label: String(item?.label || item?.route || "/"),
      views: toInt(item?.views),
    }))
    .filter((item) => item.views > 0);

  const helpfulCount = toInt(opt.helpfulCount ?? opt.helpful_count);
  const notHelpfulCount = toInt(opt.notHelpfulCount ?? opt.not_helpful_count);
  const ratedTotal = helpfulCount + notHelpfulCount;

  const rawHealthRows = Array.isArray(tel.dailyTelemetryHealth || tel.daily_telemetry_health)
    ? /** @type {Array<Record<string, any>>} */ (tel.dailyTelemetryHealth || tel.daily_telemetry_health)
    : [];
  const dailyHealthRows = rawHealthRows.map((row) => ({
    date: String(row?.date || ""),
    lcpMs: toNullableNumber(row?.lcpMs ?? row?.lcp_ms),
    inpMs: toNullableNumber(row?.inpMs ?? row?.inp_ms),
    errorCount: toInt(row?.errorCount ?? row?.error_count),
    requestErrorCount: toInt(row?.requestErrorCount ?? row?.request_error_count),
  }));

  const rawOptimusRows = Array.isArray(opt.dailyInteractions || opt.daily_interactions)
    ? /** @type {Array<Record<string, any>>} */ (opt.dailyInteractions || opt.daily_interactions)
    : [];
  const dailyOptimusRows = rawOptimusRows.map((row) => ({
    date: String(row?.date || ""),
    count: toInt(row?.count),
    escalations: toInt(row?.escalations),
    avgLatencyMs: toNullableNumber(row?.avgLatencyMs ?? row?.avg_latency_ms),
  }));

  const totalOptimus = toInt(opt.totalInteractions ?? opt.total_interactions);
  const optimusErrors = toInt(opt.errorCount ?? opt.error_count);
  const inWindowOptimus = toInt(opt.inWindowInteractions ?? opt.in_window_interactions);
  const inWindowEscalations = toInt(opt.inWindowEscalations ?? opt.in_window_escalations);

  return {
    loaded: true,
    generatedAt: typeof source.generatedAt === "string"
      ? source.generatedAt
      : typeof source.generated_at === "string"
        ? source.generated_at
        : new Date().toISOString(),
    periodDays,
    windowStart: typeof source.windowStart === "string"
      ? source.windowStart
      : typeof source.window_start === "string"
        ? source.window_start
        : base.windowStart,
    windowEnd,
    participation: {
      totalUsers: toInt(p.totalUsers ?? p.total_users),
      activeUsers: toInt(p.activeUsers ?? p.active_users),
      suspendedUsers: toInt(p.suspendedUsers ?? p.suspended_users),
      innovators: toInt(p.innovators),
      assessors: toInt(p.assessors),
      committeeMembers: toInt(p.committeeMembers ?? p.committee_members),
      supportOfficers: toInt(p.supportOfficers ?? p.support_officers),
      admins: toInt(p.admins),
      individuals: toInt(p.individuals),
      registeredCompanies: toInt(p.registeredCompanies ?? p.registered_companies),
      activeVisitorsNow: toInt(p.activeVisitorsNow ?? p.active_visitors_now),
    },
    applications: {
      total: toInt(apps.total),
      submitted: toInt(apps.submitted),
      inReview: toInt(apps.inReview ?? apps.in_review),
      changesRequested: toInt(apps.changesRequested ?? apps.changes_requested),
      approved: approvedCount,
      awarded: toInt(apps.awarded),
      rejected: toInt(apps.rejected),
      withdrawn: toInt(apps.withdrawn),
      demoTotal: toInt(apps.demoTotal ?? apps.demo_total),
      liveTotal: toInt(apps.liveTotal ?? apps.live_total),
      draftsExcluded: toInt(apps.draftsExcluded ?? apps.drafts_excluded),
      inWindowTotal: toInt(apps.inWindowTotal ?? apps.in_window_total),
      decidedCount,
      approvalRatePct,
      dailySubmissions: mergedDailySubmissions,
      records: Array.isArray(apps.records) ? apps.records : [],
    },
    sectors: Array.isArray(source.sectors)
      ? source.sectors.map((item) => ({
          id: String(item?.id || item?.name || ""),
          name: String(item?.name || "Unnamed sector"),
          status: String(item?.status || "Active"),
          total: toInt(item?.total),
          submitted: toInt(item?.submitted),
          inReview: toInt(item?.inReview ?? item?.in_review),
          changesRequested: toInt(item?.changesRequested ?? item?.changes_requested),
          approved: toInt(item?.approved),
          awarded: toInt(item?.awarded),
          rejected: toInt(item?.rejected),
          withdrawn: toInt(item?.withdrawn),
        }))
      : [],
    turnaround: {
      submissionToReviewStart: normalizeTurnaroundEntry(t.submissionToReviewStart ?? t.submission_to_review_start, "submissionToReviewStart", "Submission to review start"),
      assessmentRoundDuration: normalizeTurnaroundEntry(t.assessmentRoundDuration ?? t.assessment_round_duration, "assessmentRoundDuration", "Assessment round turnaround"),
      submissionToDecision: normalizeTurnaroundEntry(t.submissionToDecision ?? t.submission_to_decision, "submissionToDecision", "Submission to final decision"),
      clarificationCycle: normalizeTurnaroundEntry(t.clarificationCycle ?? t.clarification_cycle, "clarificationCycle", "Clarification response cycle"),
      supportFirstResponse: normalizeTurnaroundEntry(t.supportFirstResponse ?? t.support_first_response, "supportFirstResponse", "Support first response"),
      supportResolution: normalizeTurnaroundEntry(t.supportResolution ?? t.support_resolution, "supportResolution", "Support ticket resolution"),
    },
    telemetry: {
      totalViews: toInt(tel.totalViews ?? tel.total_views),
      uniqueSessions: toInt(tel.uniqueSessions ?? tel.unique_sessions),
      dailyViews: mergedDailyViews,
      devices: normalizedDevices,
      topRoutes: normalizedRoutes,
      webVitals: {
        sampleCount: toInt(wv.sampleCount ?? wv.sample_count),
        lcpMs: toNullableNumber(wv.lcpMs ?? wv.lcp_ms),
        inpMs: toNullableNumber(wv.inpMs ?? wv.inp_ms),
        cls: toNullableNumber(wv.cls),
        ttfbMs: toNullableNumber(wv.ttfbMs ?? wv.ttfb_ms),
        errorCount: toInt(wv.errorCount ?? wv.error_count),
        errorRatePct: toNullableNumber(wv.errorRatePct ?? wv.error_rate_pct),
        availabilityPct: toNullableNumber(wv.availabilityPct ?? wv.availability_pct),
      },
      dailyTelemetryHealth: dailyHealthRows,
    },
    optimus: {
      totalInteractions: totalOptimus,
      inWindowInteractions: inWindowOptimus,
      helpfulCount,
      notHelpfulCount,
      helpfulRatePct: ratedTotal > 0 ? Math.round((helpfulCount / ratedTotal) * 1000) / 10 : null,
      escalations: toInt(opt.escalations),
      inWindowEscalations,
      escalationRatePct: inWindowOptimus > 0
        ? Math.round((inWindowEscalations / inWindowOptimus) * 1000) / 10
        : null,
      avgLatencyMs: toNullableNumber(opt.avgLatencyMs ?? opt.avg_latency_ms),
      errorCount: optimusErrors,
      reliabilityPct: totalOptimus > 0
        ? toNullableNumber(opt.reliabilityPct ?? opt.reliability_pct, Math.round(((totalOptimus - optimusErrors) / totalOptimus) * 1000) / 10)
        : null,
      dailyInteractions: dailyOptimusRows,
    },
    notifications: {
      total: toInt(notif.total),
      queued: toInt(notif.queued),
      sent: toInt(notif.sent),
      failed: toInt(notif.failed),
      open: toInt(notif.open),
      active: toInt(notif.active),
    },
    matters: {
      total: toInt(mat.total),
      open: toInt(mat.open),
      investigating: toInt(mat.investigating),
      waiting: toInt(mat.waiting),
      resolved: toInt(mat.resolved),
      demoTotal: toInt(mat.demoTotal ?? mat.demo_total),
      liveTotal: toInt(mat.liveTotal ?? mat.live_total),
      inWindowReported: toInt(mat.inWindowReported ?? mat.in_window_reported),
      inWindowResolved: toInt(mat.inWindowResolved ?? mat.in_window_resolved),
      records: Array.isArray(mat.records) ? mat.records : [],
    },
    owners: Array.isArray(source.owners)
      ? source.owners
          .map((item) => ({
            id: String(item?.id || ""),
            name: String(item?.name || "").trim(),
            role: String(item?.role || ""),
          }))
          .filter((item) => Boolean(item.name))
      : [],
  };
}

/**
 * Formats an hour duration cleanly for reports and UI cards.
 * @param {number | null | undefined} hours
 * @returns {string}
 */
export function formatTurnaroundDuration(hours) {
  if (hours === null || hours === undefined || !Number.isFinite(hours) || hours < 0) {
    return "No samples yet";
  }
  if (hours < 1) {
    return `${Math.max(1, Math.round(hours * 60))} min`;
  }
  if (hours < 48) {
    return `${hours.toFixed(1)} hrs`;
  }
  return `${(hours / 24).toFixed(1)} days`;
}

/**
 * Formats Web Vitals / duration metrics without fabricating defaults.
 * @param {number | null | undefined} value
 * @param {"ms" | "s" | "cls" | "pct"} unit
 * @param {string} [emptyText]
 * @returns {string}
 */
export function formatTelemetryMetric(value, unit, emptyText = "No data yet") {
  if (value === null || value === undefined || !Number.isFinite(value)) return emptyText;
  if (unit === "ms") return `${Math.round(value)} ms`;
  if (unit === "s") return `${(value / 1000).toFixed(2)} s`;
  if (unit === "cls") return value.toFixed(2);
  if (unit === "pct") return `${value.toFixed(1)}%`;
  return String(value);
}

/**
 * Returns turnaround metrics in a flat ordered list for display and CSV export.
 * @param {ReturnType<typeof emptyReportingSummary>["turnaround"]} turnaround
 */
export function buildTurnaroundRows(turnaround) {
  const keys = /** @type {const} */ ([
    "submissionToReviewStart",
    "assessmentRoundDuration",
    "submissionToDecision",
    "clarificationCycle",
    "supportFirstResponse",
    "supportResolution",
  ]);
  return keys.map((key) => {
    const entry = turnaround?.[key] || {
      key,
      label: key,
      avgHours: null,
      medianHours: null,
      p95Hours: null,
      sampleCount: 0,
    };
    return {
      ...entry,
      avgDisplay: formatTurnaroundDuration(entry.avgHours),
      medianDisplay: formatTurnaroundDuration(entry.medianHours),
      p95Display: formatTurnaroundDuration(entry.p95Hours),
    };
  });
}

/**
 * Computes CSV-safe RFC-4180 cell encoding while mitigating spreadsheet formula injection.
 * @param {unknown} value
 * @returns {string}
 */
export function csvEscapeCell(value) {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // Neutralize formula-leading characters in non-numeric text values.
  if (/^[=+\-@\t\r]/.test(str) && Number.isNaN(Number(str))) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

/**
 * Converts headers and rows to RFC-4180 CSV text.
 * @param {readonly string[]} headers
 * @param {ReadonlyArray<ReadonlyArray<unknown>>} rows
 * @returns {string}
 */
export function rowsToCsv(headers, rows) {
  const lines = [
    headers.map(csvEscapeCell).join(","),
    ...rows.map((row) => row.map(csvEscapeCell).join(",")),
  ];
  return lines.join("\r\n");
}

/**
 * Returns the period description label ("Today", "Last 7 days", "Last 30 days").
 * @param {number} periodDays
 * @returns {string}
 */
export function reportingPeriodLabel(periodDays) {
  const normalized = normalizeReportingPeriod(periodDays);
  if (normalized === 1) return "Today";
  if (normalized === 30) return "Last 30 days";
  return "Last 7 days";
}

/**
 * Builds a complete, audited export package (CSV + summary metadata + structured sections)
 * from live `admin_reporting_summary` state.
 * @param {string} reportKey
 * @param {ReturnType<typeof emptyReportingSummary>} summary
 */
export function buildReportExport(reportKey, summary) {
  const s = summary && typeof summary === "object" ? summary : emptyReportingSummary(7);
  const def = REPORT_PACKAGE_DEFS.find((item) => item.key === reportKey) || REPORT_PACKAGE_DEFS[0];
  const periodLabel = reportingPeriodLabel(s.periodDays);
  const dateStamp = s.windowEnd || currentGaboroneDateKey();
  const filename = `ceda-innovation-${def.key}-report-${dateStamp}-${s.periodDays}d.csv`;
  const pdfFilename = `ceda-innovation-${def.key}-report-${dateStamp}-${s.periodDays}d.pdf`;
  const turnaroundRows = buildTurnaroundRows(s.turnaround);

  /** @type {string[]} */
  let headers = [];
  /** @type {Array<Array<unknown>>} */
  let rows = [];

  if (def.key === "applications") {
    headers = [
      "Reference",
      "Title",
      "Applicant",
      "Applicant Type",
      "Sector",
      "Status",
      "Source",
      "Submitted Date",
      "Version",
    ];
    const recs = Array.isArray(s.applications.records) && s.applications.records.length
      ? s.applications.records
      : [];
    rows = recs.length
      ? recs.map((app) => [
          app.reference || app.id,
          app.title,
          app.applicant,
          app.applicantType || "individual",
          app.sector,
          app.status,
          app.source || (app.isDemo ? "Demo" : "Live"),
          app.submittedDate || "",
          app.version || 1,
        ])
      : [["No application records found", "", "", "", "", "", "Live", "", 1]];
  } else if (def.key === "matters") {
    headers = [
      "Reference",
      "Title",
      "Kind",
      "Priority",
      "State",
      "Owner",
      "Related Application",
      "Source",
      "Reported At",
      "Resolved At",
    ];
    const recs = Array.isArray(s.matters.records) && s.matters.records.length
      ? s.matters.records
      : [];
    rows = recs.length
      ? recs.map((m) => [
          m.reference || m.id,
          m.title,
          m.kind || "support",
          m.priority || "Medium",
          m.state || "Open",
          m.ownerName || "Unassigned",
          m.applicationRef || "",
          m.source || (m.isDemo ? "Demo" : "Live"),
          m.reportedAt || "",
          m.resolvedAt || "",
        ])
      : [["No operational matters found", "", "", "", "", "", "", "Live", "", ""]];
  } else if (def.key === "outcomes") {
    headers = ["Section", "Metric", "Value", "Window / Basis", "Details"];
    rows = [
      ["Meta", "Report", def.title, periodLabel, `${s.windowStart} to ${s.windowEnd} (Africa/Gaborone)`],
      ["Meta", "Generated At", s.generatedAt || new Date().toISOString(), "UTC", "Live database reporting export"],
      ["Data Scope", "Live applications", s.applications.liveTotal ?? (s.applications.total - (s.applications.demoTotal ?? 0)), "Live innovator submissions", "Non-draft applications"],
      ["Data Scope", "Demo seeded applications", s.applications.demoTotal ?? 0, "Seeded baseline fixtures", "Included per reporting requirements"],
      ["Data Scope", "Combined total", s.applications.total, "Live + demo applications", "Total active & decided"],
      ["Pipeline", "Submitted", s.applications.submitted, "All submitted applications", "Awaiting initial review"],
      ["Pipeline", "In review", s.applications.inReview, "All submitted applications", "Active panel assessment"],
      ["Pipeline", "Changes requested", s.applications.changesRequested, "All submitted applications", "Awaiting applicant response"],
      ["Pipeline", "Approved", s.applications.approved, "All submitted applications", "Completed positive outcomes"],
      ["Pipeline", "Awarded", s.applications.awarded ?? 0, "All submitted applications", "Conferred innovation awards"],
      ["Pipeline", "Rejected", s.applications.rejected, "All submitted applications", "Completed negative outcomes"],
      ["Pipeline", "Withdrawn", s.applications.withdrawn, "All submitted applications", "Withdrawn by applicant"],
      ["Pipeline", "Total active & decided", s.applications.total, "Excludes Draft", `Drafts excluded: ${s.applications.draftsExcluded}`],
      ["Outcomes", "Approval rate", s.applications.approvalRatePct !== null ? `${s.applications.approvalRatePct}%` : "No decided cases", "Approved / (Approved + Rejected)", `${s.applications.approved} of ${s.applications.decidedCount} decided`],
      ["Window", "Submissions in selected window", s.applications.inWindowTotal, periodLabel, `${s.windowStart} to ${s.windowEnd}`],
      ...s.applications.dailySubmissions.map((day) => [
        "Daily submissions",
        day.date,
        day.count,
        "Africa/Gaborone date",
        "Applications submitted",
      ]),
    ];
  } else if (def.key === "sectors") {
    headers = ["Sector", "Status", "Total", "Submitted", "In review", "Changes requested", "Approved", "Awarded", "Rejected", "Withdrawn"];
    rows = s.sectors.length
      ? s.sectors.map((sec) => [
          sec.name,
          sec.status,
          sec.total,
          sec.submitted,
          sec.inReview,
          sec.changesRequested,
          sec.approved,
          sec.awarded ?? 0,
          sec.rejected,
          sec.withdrawn,
        ])
      : [["No sector records", "", 0, 0, 0, 0, 0, 0, 0, 0]];
  } else if (def.key === "turnaround") {
    headers = ["Workflow metric", "Sample count", "Average (hours)", "Average display", "Median (hours)", "Median display", "P95 (hours)", "P95 display"];
    rows = turnaroundRows.map((row) => [
      row.label,
      row.sampleCount,
      row.avgHours !== null ? Number(row.avgHours.toFixed(2)) : "",
      row.avgDisplay,
      row.medianHours !== null ? Number(row.medianHours.toFixed(2)) : "",
      row.medianDisplay,
      row.p95Hours !== null ? Number(row.p95Hours.toFixed(2)) : "",
      row.p95Display,
    ]);
  } else if (def.key === "health") {
    headers = ["Category", "Metric / Date / Route", "Primary Value", "Secondary Value", "Notes"];
    rows = [
      ["Meta", "Report", def.title, periodLabel, `${s.windowStart} to ${s.windowEnd}`],
      ["Traffic", "Portal page views", s.telemetry.totalViews, `${s.telemetry.uniqueSessions} unique sessions`, `Active last 5 min: ${s.participation.activeVisitorsNow}`],
      ["Web Vitals", "Largest Contentful Paint (P75)", formatTelemetryMetric(s.telemetry.webVitals.lcpMs, "s"), `${s.telemetry.webVitals.sampleCount} samples`, "Main content load"],
      ["Web Vitals", "Interaction to Next Paint (P75)", formatTelemetryMetric(s.telemetry.webVitals.inpMs, "ms"), "P75", "Interaction responsiveness"],
      ["Web Vitals", "Cumulative Layout Shift (P75)", formatTelemetryMetric(s.telemetry.webVitals.cls, "cls"), "P75", "Visual stability"],
      ["Web Vitals", "TTFB / Server response (P75)", formatTelemetryMetric(s.telemetry.webVitals.ttfbMs, "ms"), `Errors: ${s.telemetry.webVitals.errorCount}`, s.telemetry.webVitals.availabilityPct !== null ? `Availability: ${s.telemetry.webVitals.availabilityPct}%` : "No availability samples"],
      ["Optimus AI", "Total interactions", s.optimus.totalInteractions, `Window: ${s.optimus.inWindowInteractions}`, `Escalations: ${s.optimus.escalations}`],
      ["Optimus AI", "Helpful feedback rate", s.optimus.helpfulRatePct !== null ? `${s.optimus.helpfulRatePct}%` : "No ratings yet", `${s.optimus.helpfulCount} helpful / ${s.optimus.notHelpfulCount} unhelpful`, formatTelemetryMetric(s.optimus.avgLatencyMs, "ms", "Latency not recorded")],
      ["Notifications", "Delivery queue", s.notifications.sent, `Queued: ${s.notifications.queued}`, `Failed: ${s.notifications.failed}`],
      ...s.telemetry.devices.map((d) => ["Device mix", d.name, `${d.sharePct}%`, d.count, "Share of page views"]),
      ...s.telemetry.topRoutes.map((r) => ["Popular page", r.label, r.views, r.route, "Sanitized route view count"]),
      ...s.telemetry.dailyViews.map((d) => ["Daily traffic", d.date, d.views, `${d.uniqueSessions} sessions`, `${d.submissions} submissions`]),
    ];
  } else {
    headers = ["Domain", "Metric", "Value", "Context", "Period"];
    rows = [
      ["Report", "Package", def.title, `${s.windowStart} to ${s.windowEnd}`, periodLabel],
      ["Report", "Generated At", s.generatedAt || new Date().toISOString(), "Live PostgreSQL RPC", "Africa/Gaborone"],
      ["Data Scope", "Live applications", s.applications.liveTotal ?? (s.applications.total - (s.applications.demoTotal ?? 0)), "Live innovator submissions", "Non-draft"],
      ["Data Scope", "Demo seeded applications", s.applications.demoTotal ?? 0, "Seeded baseline fixtures", "Retained in reporting"],
      ["Data Scope", "Combined applications", s.applications.total, "Full operational total", "Live + demo records"],
      ["Data Scope", "Live follow-up matters", s.matters.liveTotal ?? (s.matters.total - (s.matters.demoTotal ?? 0)), "Operational matters", "Live tickets"],
      ["Data Scope", "Demo follow-up matters", s.matters.demoTotal ?? 0, "Seeded baseline fixtures", "Retained in reporting"],
      ["Participation", "Total registered accounts", s.participation.totalUsers, `${s.participation.activeUsers} active / ${s.participation.suspendedUsers} suspended`, "Live profiles"],
      ["Participation", "Innovators", s.participation.innovators, `${s.participation.individuals} individual / ${s.participation.registeredCompanies} company applications`, "Role breakdown"],
      ["Participation", "Assessors", s.participation.assessors, "Active & assigned reviewers", "Role breakdown"],
      ["Participation", "Committee observers", s.participation.committeeMembers ?? 0, "External stakeholder observers", "Role breakdown"],
      ["Participation", "Support officers", s.participation.supportOfficers, `${s.matters.open + s.matters.investigating + s.matters.waiting} active matters`, "Role breakdown"],
      ["Participation", "Administrators", s.participation.admins, "Portal governance", "Role breakdown"],
      ["Participation", "Active visitors (5 min)", s.participation.activeVisitorsNow, "Unique telemetry sessions", "Realtime"],
      ["Applications", "Submitted", s.applications.submitted, "Pipeline stage", "All non-draft"],
      ["Applications", "In review", s.applications.inReview, "Pipeline stage", "All non-draft"],
      ["Applications", "Changes requested", s.applications.changesRequested, "Pipeline stage", "All non-draft"],
      ["Applications", "Approved", s.applications.approved, "Final positive outcome", "All non-draft"],
      ["Applications", "Awarded", s.applications.awarded ?? 0, "Conferred award stage", "All non-draft"],
      ["Applications", "Rejected", s.applications.rejected, "Final negative outcome", "All non-draft"],
      ["Applications", "Withdrawn", s.applications.withdrawn, "Applicant withdrawn", "All non-draft"],
      ["Applications", "Submissions in period", s.applications.inWindowTotal, `Approval rate: ${s.applications.approvalRatePct !== null ? `${s.applications.approvalRatePct}%` : "No decided cases"}`, periodLabel],
      ["Telemetry", "Portal page views", s.telemetry.totalViews, `${s.telemetry.uniqueSessions} unique sessions`, periodLabel],
      ["Telemetry", "LCP / INP / CLS (P75)", `${formatTelemetryMetric(s.telemetry.webVitals.lcpMs, "s")} / ${formatTelemetryMetric(s.telemetry.webVitals.inpMs, "ms")} / ${formatTelemetryMetric(s.telemetry.webVitals.cls, "cls")}`, `${s.telemetry.webVitals.sampleCount} Vital samples`, periodLabel],
      ["Optimus AI", "Interactions / Escalations", `${s.optimus.totalInteractions} total (${s.optimus.inWindowInteractions} in window)`, `${s.optimus.escalations} escalations`, periodLabel],
      ["Notifications", "Sent / Queued / Failed", `${s.notifications.sent} / ${s.notifications.queued} / ${s.notifications.failed}`, `Total queue items: ${s.notifications.total}`, "Live queue"],
      ...turnaroundRows.map((row) => [
        "Turnaround SLA",
        row.label,
        row.avgDisplay,
        `Median: ${row.medianDisplay} | P95: ${row.p95Display} (${row.sampleCount} samples)`,
        "Actual elapsed time",
      ]),
      ...s.sectors.map((sec) => [
        "Sector activity",
        sec.name,
        sec.total,
        `Status: ${sec.status} | In review: ${sec.inReview} | Approved: ${sec.approved}`,
        "Live sector tally",
      ]),
    ];
  }

  const csv = rowsToCsv(headers, rows);
  const summaryText = [
    `CEDA Innovation Portal: ${def.title}`,
    `Period: ${periodLabel} (${s.windowStart} to ${s.windowEnd}, Africa/Gaborone)`,
    `Applications: ${s.applications.total} active/decided (${s.applications.inReview} in review, ${s.applications.approved} approved, ${s.applications.awarded ?? 0} awarded, ${s.applications.rejected} rejected)`,
    `Data Scope: ${s.applications.liveTotal ?? (s.applications.total - (s.applications.demoTotal ?? 0))} live / ${s.applications.demoTotal ?? 0} demo applications included`,
    `Participation: ${s.participation.totalUsers} users (${s.participation.innovators} innovators, ${s.participation.assessors} assessors, ${s.participation.supportOfficers} support)`,
    `Traffic: ${s.telemetry.totalViews} page views across ${s.telemetry.uniqueSessions} sessions`,
  ].join("\n");

  const exportPayload = {
    key: def.key,
    title: def.title,
    audience: def.audience,
    periodLabel,
    filename,
    pdfFilename,
    headers,
    rows,
    csv,
    summaryText,
    generatedAt: s.generatedAt || new Date().toISOString(),
  };

  return {
    ...exportPayload,
    buildPdfBytes: () => buildReportPdfBytes(exportPayload),
  };
}

/**
 * Safely escapes characters for PDF text operators (F1/F2).
 * @param {unknown} value
 * @returns {string}
 */
export function escapePdfString(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replace(/[^\x20-\x7E]/g, " ");
}

/**
 * Builds RFC-compliant %PDF-1.4 binary bytes from report export data without external dependencies.
 * @param {{
 *   title?: string;
 *   periodLabel?: string;
 *   headers?: readonly string[];
 *   rows?: ReadonlyArray<ReadonlyArray<unknown>>;
 *   generatedAt?: string;
 * }} reportExport
 * @returns {Uint8Array}
 */
export function buildReportPdfBytes(reportExport) {
  const title = String(reportExport?.title || "CEDA Innovation Report");
  const period = String(reportExport?.periodLabel || "Reporting period");
  const headers = Array.isArray(reportExport?.headers) ? reportExport.headers : [];
  const rows = Array.isArray(reportExport?.rows) ? reportExport.rows : [];
  const dateStamp = reportExport?.generatedAt
    ? String(reportExport.generatedAt).slice(0, 16).replace("T", " ")
    : new Date().toISOString().slice(0, 16).replace("T", " ");

  const rowsPerPage = 34;
  const pageCount = Math.max(1, Math.ceil(Math.max(1, rows.length) / rowsPerPage));
  const pagesData = [];
  const colW = Math.floor(536 / Math.max(1, headers.length));

  for (let pIdx = 0; pIdx < pageCount; pIdx += 1) {
    const pageRows = rows.slice(pIdx * rowsPerPage, (pIdx + 1) * rowsPerPage);
    const cmds = [];

    // Header banner
    cmds.push("BT /F2 14 Tf 38 750 Td (" + escapePdfString(title) + ") Tj ET");
    cmds.push("BT /F1 8.5 Tf 38 737 Td (" + escapePdfString("CEDA Innovation Portal · " + period + " · Generated " + dateStamp + " UTC · Page " + (pIdx + 1) + " of " + pageCount) + ") Tj ET");

    // Table Header Box
    cmds.push("0.92 0.94 0.96 rg 38 710 536 18 re f");
    cmds.push("0.80 0.83 0.87 RG 0.5 w 38 710 536 18 re s");

    headers.forEach((h, hIdx) => {
      const cellText = escapePdfString(h).slice(0, Math.max(8, Math.floor(colW / 6)));
      cmds.push("BT /F2 8 Tf " + (42 + hIdx * colW) + " 716 Td (" + cellText + ") Tj ET");
    });

    let y = 694;
    pageRows.forEach((row, rIdx) => {
      if (rIdx % 2 === 1) {
        cmds.push("0.98 0.98 0.99 rg 38 " + (y - 3) + " 536 15 re f");
      }
      cmds.push("0.90 0.92 0.94 RG 0.3 w 38 " + (y - 3) + " 536 15 re s");
      /** @type {ReadonlyArray<unknown>} */ (row).forEach((cell, cIdx) => {
        const str = escapePdfString(cell).slice(0, Math.max(10, Math.floor(colW / 5)));
        cmds.push("BT /F1 7.5 Tf " + (42 + cIdx * colW) + " " + y + " Td (" + str + ") Tj ET");
      });
      y -= 15;
    });

    // Footer
    cmds.push("0.80 0.83 0.87 RG 0.5 w 38 30 536 0.5 re s");
    cmds.push("BT /F1 7 Tf 38 20 Td (" + escapePdfString("CEDA Botswana Innovation Portal · Confidential Official Report · Page " + (pIdx + 1) + " of " + pageCount) + ") Tj ET");

    pagesData.push(cmds.join("\n"));
  }

  const enc = new TextEncoder();
  const objBuffers = [];

  const catalog = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  objBuffers.push(enc.encode(catalog));

  const pageObjIds = pagesData.map((_, i) => (5 + 2 * i) + " 0 R").join(" ");
  const pagesContainer = "2 0 obj\n<< /Type /Pages /Kids [" + pageObjIds + "] /Count " + pageCount + " >>\nendobj\n";
  objBuffers.push(enc.encode(pagesContainer));

  const f1 = "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";
  const f2 = "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n";
  objBuffers.push(enc.encode(f1));
  objBuffers.push(enc.encode(f2));

  pagesData.forEach((streamText, i) => {
    const pageObjNum = 5 + 2 * i;
    const contentObjNum = 6 + 2 * i;
    const streamBytes = enc.encode(streamText);
    const pageObj = pageObjNum + " 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents " + contentObjNum + " 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>\nendobj\n";
    const contentObjHead = contentObjNum + " 0 obj\n<< /Length " + streamBytes.length + " >>\nstream\n";
    const contentObjTail = "\nendstream\nendobj\n";
    objBuffers.push(enc.encode(pageObj));
    objBuffers.push(enc.encode(contentObjHead));
    objBuffers.push(streamBytes);
    objBuffers.push(enc.encode(contentObjTail));
  });

  const headerBytes = enc.encode("%PDF-1.4\n");
  let currentOffset = headerBytes.length;
  const offsets = [];

  offsets.push(currentOffset); currentOffset += objBuffers[0].length;
  offsets.push(currentOffset); currentOffset += objBuffers[1].length;
  offsets.push(currentOffset); currentOffset += objBuffers[2].length;
  offsets.push(currentOffset); currentOffset += objBuffers[3].length;

  for (let i = 0; i < pageCount; i += 1) {
    offsets.push(currentOffset); currentOffset += objBuffers[4 + 4 * i].length;
    offsets.push(currentOffset); currentOffset += objBuffers[4 + 4 * i + 1].length + objBuffers[4 + 4 * i + 2].length + objBuffers[4 + 4 * i + 3].length;
  }

  const totalObjs = 4 + 2 * pageCount;
  let xref = "xref\n0 " + (totalObjs + 1) + "\n0000000000 65535 f \n";
  for (const off of offsets) {
    xref += String(off).padStart(10, "0") + " 00000 n \n";
  }
  const xrefBytes = enc.encode(xref);
  const startxref = currentOffset;
  const trailer = "trailer\n<< /Size " + (totalObjs + 1) + " /Root 1 0 R >>\nstartxref\n" + startxref + "\n%%EOF\n";
  const trailerBytes = enc.encode(trailer);

  const totalLen = headerBytes.length + objBuffers.reduce((s, b) => s + b.length, 0) + xrefBytes.length + trailerBytes.length;
  const out = new Uint8Array(totalLen);
  let pos = 0;
  out.set(headerBytes, pos); pos += headerBytes.length;
  for (const b of objBuffers) { out.set(b, pos); pos += b.length; }
  out.set(xrefBytes, pos); pos += xrefBytes.length;
  out.set(trailerBytes, pos); pos += trailerBytes.length;

  return out;
}

/**
 * Builds a browser-downloadable PDF Blob from report export data.
 * @param {Parameters<typeof buildReportPdfBytes>[0]} reportExport
 * @returns {Blob}
 */
export function buildReportPdfBlob(reportExport) {
  const bytes = buildReportPdfBytes(reportExport);
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}

/**
 * Strips query parameters, hash fragments, UUIDs, CEDA reference codes, and email patterns
 * before recording client telemetry routes.
 * @param {unknown} rawRoute
 * @returns {string}
 */
export function sanitizeTelemetryRoute(rawRoute) {
  let route = String(rawRoute || "/").trim();
  route = route.split("?")[0].split("#")[0];
  if (!route) return "/";
  if (!route.startsWith("/")) route = `/${route}`;
  route = route
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/CEDA-INN-[0-9-]+/gi, ":ref")
    .replace(/[^\s/@]+@[^\s/]+/g, ":email");
  return route.slice(0, 120) || "/";
}

/**
 * Maps viewport width or user agent into Mobile / Tablet / Desktop device classes.
 * @param {number} [viewportWidth]
 * @param {string} [userAgent]
 * @returns {"Mobile" | "Tablet" | "Desktop"}
 */
export function detectDeviceClass(viewportWidth = 1280, userAgent = "") {
  const ua = String(userAgent || "").toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua)) return "Tablet";
  if (/mobi|android|iphone|ipod/.test(ua)) {
    return Number.isFinite(viewportWidth) && viewportWidth >= 768 ? "Tablet" : "Mobile";
  }
  if (Number.isFinite(viewportWidth)) {
    if (viewportWidth < 680) return "Mobile";
    if (viewportWidth < 1024) return "Tablet";
  }
  return "Desktop";
}

/**
 * Derives a truthful reporting summary from already-loaded real domain lists if
 * `admin_reporting_summary` RPC is temporarily unavailable (zero demo fabrication).
 * @param {{
 *   periodDays?: unknown;
 *   applications?: ReadonlyArray<Record<string, any>>;
 *   matters?: ReadonlyArray<Record<string, any>>;
 *   users?: ReadonlyArray<Record<string, any>>;
 *   sectors?: ReadonlyArray<Record<string, any>>;
 *   notifications?: ReadonlyArray<Record<string, any>>;
 *   optimus?: Record<string, any> | null;
 * }} inputs
 */
export function buildReportingSummaryFromRecords(inputs = {}) {
  const base = emptyReportingSummary(inputs.periodDays ?? 7);
  const apps = Array.isArray(inputs.applications) ? inputs.applications : [];
  const matters = Array.isArray(inputs.matters) ? inputs.matters : [];
  const users = Array.isArray(inputs.users) ? inputs.users : [];
  const sectors = Array.isArray(inputs.sectors) ? inputs.sectors : [];
  const notifications = Array.isArray(inputs.notifications) ? inputs.notifications : [];
  const opt = inputs.optimus && typeof inputs.optimus === "object" ? inputs.optimus : null;

  const nonDraft = apps.filter((a) => String(a?.status || "") !== "Draft");
  const draftsExcluded = apps.length - nonDraft.length;
  const subDayCounts = new Map(base.applications.dailySubmissions.map((d) => [d.date, 0]));
  let inWindowTotal = 0;

  let submitted = 0;
  let inReview = 0;
  let changesRequested = 0;
  let approved = 0;
  let awarded = 0;
  let rejected = 0;
  let withdrawn = 0;
  let individuals = 0;
  let registeredCompanies = 0;
  let demoAppsCount = 0;
  let liveAppsCount = 0;

  const appRecords = [];

  for (const app of nonDraft) {
    const status = String(app?.status || "");
    const ref = String(app?.reference || app?.id || "");
    const isDemo = ref.startsWith("DEMO") || ref.startsWith("demo") || Boolean(app?.isDemo);
    if (isDemo) demoAppsCount += 1;
    else liveAppsCount += 1;

    if (status === "Submitted") submitted += 1;
    else if (status === "In review") inReview += 1;
    else if (status === "Changes requested") changesRequested += 1;
    else if (status === "Approved") approved += 1;
    else if (status === "Awarded") awarded += 1;
    else if (status === "Rejected") rejected += 1;
    else if (status === "Withdrawn") withdrawn += 1;

    const appType = String(app?.applicantType ?? app?.applicant_type ?? "").toLowerCase();
    if (appType.includes("company") || appType.includes("enterprise") || appType.includes("entity")) {
      registeredCompanies += 1;
    } else {
      individuals += 1;
    }

    const rawDate = String(app?.submitted ?? app?.submitted_date ?? app?.submittedAt ?? app?.date ?? "").slice(0, 10);
    if (rawDate >= base.windowStart && rawDate <= base.windowEnd) {
      inWindowTotal += 1;
      if (subDayCounts.has(rawDate)) {
        subDayCounts.set(rawDate, (subDayCounts.get(rawDate) || 0) + 1);
      }
    }

    appRecords.push({
      id: String(app?.id || ref),
      reference: ref,
      title: String(app?.title || "Untitled application"),
      applicant: String(app?.applicant || "Applicant"),
      applicantType: appType.includes("company") ? "company" : "individual",
      sector: String(app?.sector || "General"),
      status,
      isDemo,
      source: isDemo ? "Demo" : "Live",
      submittedDate: rawDate || "",
      version: Number(app?.version) || 1,
    });
  }

  const decidedCount = approved + awarded + rejected;
  base.applications = {
    total: nonDraft.length,
    submitted,
    inReview,
    changesRequested,
    approved,
    awarded,
    rejected,
    withdrawn,
    demoTotal: demoAppsCount,
    liveTotal: liveAppsCount,
    draftsExcluded,
    inWindowTotal,
    decidedCount,
    approvalRatePct: decidedCount > 0 ? Math.round(((approved + awarded) / decidedCount) * 1000) / 10 : null,
    dailySubmissions: base.applications.dailySubmissions.map((d) => ({
      date: d.date,
      count: subDayCounts.get(d.date) || 0,
    })),
    records: appRecords,
  };

  base.participation = {
    totalUsers: users.length,
    activeUsers: users.filter((u) => String(u?.accountStatus ?? u?.account_status ?? "active") === "active").length,
    suspendedUsers: users.filter((u) => String(u?.accountStatus ?? u?.account_status ?? "active") !== "active").length,
    innovators: users.filter((u) => String(u?.accountRole ?? u?.account_role ?? "").toLowerCase() === "innovator").length,
    assessors: users.filter((u) => String(u?.accountRole ?? u?.account_role ?? "").toLowerCase() === "assessor").length,
    committeeMembers: users.filter((u) => String(u?.accountRole ?? u?.account_role ?? "").toLowerCase() === "committee").length,
    supportOfficers: users.filter((u) => String(u?.accountRole ?? u?.account_role ?? "").toLowerCase() === "support").length,
    admins: users.filter((u) => String(u?.accountRole ?? u?.account_role ?? "").toLowerCase() === "admin").length,
    individuals,
    registeredCompanies,
    activeVisitorsNow: 0,
  };

  const sectorTallies = new Map();
  for (const sec of sectors) {
    const name = String(sec?.name || "");
    if (!name) continue;
    sectorTallies.set(name.toLowerCase(), {
      id: String(sec?.id || name),
      name,
      status: String(sec?.status || "Active"),
      total: 0,
      submitted: 0,
      inReview: 0,
      changesRequested: 0,
      approved: 0,
      awarded: 0,
      rejected: 0,
      withdrawn: 0,
    });
  }
  for (const app of nonDraft) {
    const secName = String(app?.sector || "Other").trim() || "Other";
    const key = secName.toLowerCase();
    if (!sectorTallies.has(key)) {
      sectorTallies.set(key, {
        id: key,
        name: secName,
        status: "Active",
        total: 0,
        submitted: 0,
        inReview: 0,
        changesRequested: 0,
        approved: 0,
        awarded: 0,
        rejected: 0,
        withdrawn: 0,
      });
    }
    const bucket = sectorTallies.get(key);
    bucket.total += 1;
    const status = String(app?.status || "");
    if (status === "Submitted") bucket.submitted += 1;
    else if (status === "In review") bucket.inReview += 1;
    else if (status === "Changes requested") bucket.changesRequested += 1;
    else if (status === "Approved") bucket.approved += 1;
    else if (status === "Awarded") bucket.awarded += 1;
    else if (status === "Rejected") bucket.rejected += 1;
    else if (status === "Withdrawn") bucket.withdrawn += 1;
  }
  base.sectors = Array.from(sectorTallies.values()).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const matterRecords = matters.map((m) => {
    const ref = String(m?.reference || m?.id || "");
    const isDemo = ref.startsWith("BUG") || ref.startsWith("TKT") || ref.startsWith("DEL") || ref.startsWith("FB") || Boolean(m?.isDemo);
    return {
      id: String(m?.id || ref),
      reference: ref,
      title: String(m?.title || "Operational issue"),
      kind: String(m?.kind || "support"),
      priority: String(m?.priority || "Medium"),
      state: String(m?.state || "Open"),
      ownerName: String(m?.ownerName || m?.owner || "Unassigned"),
      applicationRef: String(m?.applicationRef || m?.application_ref || ""),
      isDemo,
      source: isDemo ? "Demo" : "Live",
      reportedAt: String(m?.reportedAt ?? m?.reported_at ?? m?.at ?? ""),
      resolvedAt: String(m?.resolvedAt ?? m?.resolved_at ?? ""),
    };
  });

  const demoMattersCount = matterRecords.filter((m) => m.isDemo).length;
  base.matters = {
    total: matters.length,
    open: matters.filter((m) => String(m?.state || "") === "Open").length,
    investigating: matters.filter((m) => String(m?.state || "") === "Investigating").length,
    waiting: matters.filter((m) => String(m?.state || "") === "Waiting").length,
    resolved: matters.filter((m) => String(m?.state || "") === "Resolved").length,
    demoTotal: demoMattersCount,
    liveTotal: matters.length - demoMattersCount,
    inWindowReported: 0,
    inWindowResolved: 0,
    records: matterRecords,
  };

  base.notifications = {
    total: notifications.length,
    queued: notifications.filter((n) => String(n?.status || "") === "Queued").length,
    sent: notifications.filter((n) => String(n?.status || "") === "Sent").length,
    failed: notifications.filter((n) => String(n?.status || "") === "Failed").length,
    open: notifications.filter((n) => String(n?.status || "") === "Open").length,
    active: notifications.filter((n) => String(n?.status || "") === "Active").length,
  };

  if (opt) {
    const helpfulCount = toInt(opt.helpfulCount);
    const notHelpfulCount = toInt(opt.unhelpfulCount ?? opt.notHelpfulCount);
    const rated = helpfulCount + notHelpfulCount;
    base.optimus = {
      ...base.optimus,
      totalInteractions: toInt(opt.totalInteractions),
      helpfulCount,
      notHelpfulCount,
      helpfulRatePct: rated > 0 ? Math.round((helpfulCount / rated) * 1000) / 10 : null,
      escalations: toInt(opt.escalatedCount ?? opt.escalations),
    };
  }

  base.owners = users
    .filter((u) => {
      const role = String(u?.accountRole ?? u?.account_role ?? "").toLowerCase();
      const status = String(u?.accountStatus ?? u?.account_status ?? "active").toLowerCase();
      return status === "active" && (role === "admin" || role === "support") && String(u?.fullName ?? u?.full_name ?? "").trim();
    })
    .map((u) => ({
      id: String(u?.id || ""),
      name: String(u?.fullName ?? u?.full_name ?? "").trim(),
      role: String(u?.accountRole ?? u?.account_role ?? ""),
    }));

  base.loaded = true;
  base.generatedAt = new Date().toISOString();
  return base;
}
