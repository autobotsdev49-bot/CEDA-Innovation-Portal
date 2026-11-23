/**
 * @typedef {Object} AssessorCaseSummary
 * @property {string} id
 * @property {string} reference
 * @property {string} title
 * @property {string} sector
 * @property {string | null} [sectorId]
 * @property {string} status
 * @property {boolean} assigned
 * @property {boolean} canManage
 * @property {boolean} canRelease
 * @property {string | null} roundId
 * @property {string | null} roundState
 * @property {string | null} deadline
 * @property {string | null} conflict
 * @property {boolean} submitted
 * @property {boolean} hasVoted
 * @property {boolean} hasHistory
 * @property {boolean} hold
 * @property {number} memberCount
 * @property {number} reviewCount
 * @property {number} [reviewedCount]
 * @property {number} [unreadCount]
 */

/**
 * @typedef {Object} AssessorStaffMember
 * @property {string} id
 * @property {string} name
 * @property {string[]} sectors
 * @property {string[]} [sectorNames]
 * @property {boolean} [lead]
 */

/**
 * @typedef {{ key: string, label: string, count: number, pct: number, color: string }} OverviewSegment
 * @typedef {{ item: AssessorCaseSummary, kind: string, badge: string, detail: string, targetTab: "Panel" | "Decision" | "Assessment", tone: "blue" | "amber" | "rust" | "teal" }} LeadActionItem
 * @typedef {{ sector: string, sectorId: string | null, total: number, newCount: number, inReview: number, reviewed: number, decisionReady: number, decided: number, staffCount: number }} SectorSummary
 */

export const overviewColors = Object.freeze({
  blue: "#417AC5",
  amber: "#D39B3B",
  purple: "#695198",
  green: "#2D8B57",
  teal: "#278477",
  rust: "#9A3D2B",
  muted: "#8A9498",
});

const DAY_MS = 86_400_000;

/**
 * Categorize a single application into one mutually exclusive pipeline bucket.
 * @param {AssessorCaseSummary} item
 * @returns {"new" | "review" | "changes" | "approved" | "awarded" | "rejected" | "withdrawn"}
 */
export function classifyPipelineStage(item) {
  if (item.status === "Withdrawn") return "withdrawn";
  if (item.status === "Awarded") return "awarded";
  if (item.status === "Approved") return "approved";
  if (item.status === "Rejected") return "rejected";
  if (item.status === "Changes requested" || item.roundState === "awaiting-information") return "changes";
  if (item.status === "Submitted" && (!item.roundId || item.roundState === "setup")) return "new";
  return "review";
}

/**
 * Check whether an application in active workflow has received at least one submitted review.
 * @param {AssessorCaseSummary} item
 * @returns {boolean}
 */
export function hasSubmittedReview(item) {
  return Number(item.reviewCount || 0) > 0;
}

/**
 * Compute personal review tasks for an assessor (also applicable when a Lead Assessor sits on a panel).
 * @param {AssessorCaseSummary[]} cases
 * @returns {AssessorCaseSummary[]}
 */
export function collectPersonalTasks(cases) {
  return cases.filter(item => {
    if (!item.assigned || item.hold || item.conflict === "recused") return false;
    if (item.conflict === "pending" && ["setup", "review"].includes(String(item.roundState || ""))) return true;
    if (item.conflict === "cleared" && item.roundState === "review" && !item.submitted) return true;
    return item.conflict === "cleared" && item.roundState === "voting" && item.submitted && !item.hasVoted;
  });
}

/**
 * Build visual metrics, pipeline breakdowns, funnel stages, sector load, deadline health,
 * and prioritized Lead Assessor action items from live `assessor_workspace` data.
 * @param {AssessorCaseSummary[]} cases
 * @param {AssessorStaffMember[]} [staff]
 * @param {number} [nowMs]
 */
export function buildLeadOverview(cases, staff = [], nowMs = Date.now()) {
  const safeCases = Array.isArray(cases) ? cases : [];
  const safeStaff = Array.isArray(staff) ? staff : [];
  const managed = safeCases.filter(item => item.canManage || item.canRelease);
  const scope = managed.length ? managed : safeCases;
  const activeCases = scope.filter(item => item.status !== "Withdrawn");

  const awaitingPanel = activeCases.filter(item => item.status === "Submitted" && !item.roundId);
  const stagedSetup = activeCases.filter(item => item.status === "Submitted" && item.roundState === "setup");
  const closedReady = activeCases.filter(item => item.roundState === "closed");
  const votingOpen = activeCases.filter(item => item.roundState === "voting");
  const readyToOpenVote = activeCases.filter(
    item => item.roundState === "review" && Number(item.memberCount || 0) > 0 && Number(item.reviewCount || 0) >= Number(item.memberCount || 0)
  );
  const resubmitted = activeCases.filter(item => item.status === "Submitted" && item.roundState === "awaiting-information");

  const reviewedApps = activeCases.filter(hasSubmittedReview);
  const fullyReviewedApps = activeCases.filter(
    item => Number(item.memberCount || 0) > 0 && Number(item.reviewCount || 0) >= Number(item.memberCount || 0)
  );
  const totalSubmittedReviews = activeCases.reduce((sum, item) => sum + Number(item.reviewCount || 0), 0);
  const totalAssignedSlots = activeCases.reduce((sum, item) => sum + Number(item.memberCount || 0), 0);

  const buckets = { new: 0, review: 0, changes: 0, approved: 0, awarded: 0, rejected: 0, withdrawn: 0 };
  for (const item of scope) buckets[classifyPipelineStage(item)] += 1;

  const totalScope = scope.length;
  const pipelineBase = Math.max(1, totalScope);
  /** @type {OverviewSegment[]} */
  const pipeline = [
    { key: "new", label: "New applications", count: buckets.new, pct: Math.round((buckets.new / pipelineBase) * 100), color: overviewColors.blue },
    { key: "review", label: "Under review", count: buckets.review, pct: Math.round((buckets.review / pipelineBase) * 100), color: overviewColors.amber },
    { key: "changes", label: "Changes requested", count: buckets.changes, pct: Math.round((buckets.changes / pipelineBase) * 100), color: overviewColors.purple },
    { key: "approved", label: "Approved", count: buckets.approved, pct: Math.round((buckets.approved / pipelineBase) * 100), color: overviewColors.green },
    ...(buckets.awarded > 0
      ? [{ key: "awarded", label: "Awarded", count: buckets.awarded, pct: Math.round((buckets.awarded / pipelineBase) * 100), color: overviewColors.teal }]
      : []),
    { key: "rejected", label: "Rejected", count: buckets.rejected, pct: Math.round((buckets.rejected / pipelineBase) * 100), color: overviewColors.rust },
  ];
  if (buckets.withdrawn > 0) {
    pipeline.push({
      key: "withdrawn",
      label: "Withdrawn",
      count: buckets.withdrawn,
      pct: Math.round((buckets.withdrawn / pipelineBase) * 100),
      color: overviewColors.muted,
    });
  }

  const activeBase = Math.max(1, activeCases.length);
  const setupOrWaitingReviews = activeCases.filter(
    item => item.roundState === "setup" || (item.roundState === "review" && Number(item.reviewCount || 0) === 0)
  ).length;
  const reviewsInProgress = activeCases.filter(
    item => item.roundState === "review" && Number(item.reviewCount || 0) > 0 && Number(item.reviewCount || 0) < Number(item.memberCount || 0)
  ).length;
  const releasedCount = buckets.approved + buckets.awarded + buckets.rejected;
  /** @type {OverviewSegment[]} */
  const funnel = [
    { key: "awaiting-panel", label: "Awaiting panel", count: awaitingPanel.length, pct: Math.round((awaitingPanel.length / activeBase) * 100), color: overviewColors.blue },
    { key: "panel-setup", label: "Panel setup & conflicts", count: setupOrWaitingReviews, pct: Math.round((setupOrWaitingReviews / activeBase) * 100), color: overviewColors.purple },
    { key: "reviews-progress", label: "Reviews in progress", count: reviewsInProgress, pct: Math.round((reviewsInProgress / activeBase) * 100), color: overviewColors.amber },
    { key: "ready-vote", label: "Ready to open voting", count: readyToOpenVote.length, pct: Math.round((readyToOpenVote.length / activeBase) * 100), color: overviewColors.teal },
    { key: "voting", label: "Voting open", count: votingOpen.length, pct: Math.round((votingOpen.length / activeBase) * 100), color: overviewColors.blue },
    { key: "decision-ready", label: "Ready for decision", count: closedReady.length, pct: Math.round((closedReady.length / activeBase) * 100), color: overviewColors.rust },
  ];

  const sectorStaffCounts = new Map();
  for (const person of safeStaff) {
    for (const sectorId of person.sectors || []) {
      sectorStaffCounts.set(sectorId, (sectorStaffCounts.get(sectorId) || 0) + 1);
    }
  }
  /** @type {Map<string, SectorSummary>} */
  const sectorMap = new Map();
  for (const item of activeCases) {
    const label = item.sector || "Sector pending";
    const key = item.sectorId || label;
    const entry = sectorMap.get(key) || {
      sector: label,
      sectorId: item.sectorId ?? null,
      total: 0,
      newCount: 0,
      inReview: 0,
      reviewed: 0,
      decisionReady: 0,
      decided: 0,
      staffCount: item.sectorId ? (sectorStaffCounts.get(item.sectorId) || 0) : 0,
    };
    entry.total += 1;
    const stage = classifyPipelineStage(item);
    if (stage === "new") entry.newCount += 1;
    if (stage === "review" || stage === "changes") entry.inReview += 1;
    if (hasSubmittedReview(item)) entry.reviewed += 1;
    if (["closed", "voting"].includes(String(item.roundState || "")) || (item.roundState === "review" && Number(item.memberCount || 0) > 0 && Number(item.reviewCount || 0) >= Number(item.memberCount || 0))) {
      entry.decisionReady += 1;
    }
    if (stage === "approved" || stage === "awarded" || stage === "rejected") entry.decided += 1;
    sectorMap.set(key, entry);
  }
  const sectors = [...sectorMap.values()].sort((a, b) => b.total - a.total || a.sector.localeCompare(b.sector));

  const deadlines = { overdue: 0, dueSoon: 0, onTrack: 0, onHold: 0, noDeadline: 0 };
  for (const item of activeCases) {
    if (!["setup", "review", "voting", "closed", "awaiting-information"].includes(String(item.roundState || ""))) continue;
    if (item.hold) {
      deadlines.onHold += 1;
      continue;
    }
    if (!item.deadline) {
      deadlines.noDeadline += 1;
      continue;
    }
    const dueMs = Date.parse(item.deadline);
    if (Number.isNaN(dueMs)) {
      deadlines.noDeadline += 1;
    } else if (dueMs < nowMs) {
      deadlines.overdue += 1;
    } else if (dueMs <= nowMs + 2 * DAY_MS) {
      deadlines.dueSoon += 1;
    } else {
      deadlines.onTrack += 1;
    }
  }

  /** @type {LeadActionItem[]} */
  const decisionQueue = [
    ...closedReady.map(item => ({
      item,
      kind: "decision-release",
      badge: "Decision ready",
      detail: `${item.reviewCount}/${item.memberCount} reviews · Close out & release outcome`,
      targetTab: /** @type {const} */ ("Decision"),
      tone: /** @type {const} */ ("rust"),
    })),
    ...votingOpen.map(item => ({
      item,
      kind: "decision-voting",
      badge: "Voting open",
      detail: `${item.reviewCount}/${item.memberCount} reviews · Monitor & close panel vote`,
      targetTab: /** @type {const} */ ("Decision"),
      tone: /** @type {const} */ ("amber"),
    })),
    ...readyToOpenVote.map(item => ({
      item,
      kind: "decision-open-vote",
      badge: "Open voting",
      detail: `${item.reviewCount}/${item.memberCount} reviews submitted · Ready for vote`,
      targetTab: /** @type {const} */ ("Decision"),
      tone: /** @type {const} */ ("teal"),
    })),
    ...resubmitted.map(item => ({
      item,
      kind: "decision-reassess",
      badge: "Resubmitted",
      detail: "Additional information supplied · Start reassessment",
      targetTab: /** @type {const} */ ("Decision"),
      tone: /** @type {const} */ ("amber"),
    })),
  ];

  /** @type {LeadActionItem[]} */
  const intakeQueue = [
    ...stagedSetup.map(item => ({
      item,
      kind: "panel-start",
      badge: "Start review",
      detail: `${item.memberCount} assessor${item.memberCount === 1 ? "" : "s"} assigned · Start review round`,
      targetTab: /** @type {const} */ ("Panel"),
      tone: /** @type {const} */ ("blue"),
    })),
    ...awaitingPanel.map(item => ({
      item,
      kind: "panel-assign",
      badge: "Assign panel",
      detail: `${item.sector || "Sector pending"} · New application awaiting assessors`,
      targetTab: /** @type {const} */ ("Panel"),
      tone: /** @type {const} */ ("blue"),
    })),
  ];

  const actionQueue = [...decisionQueue, ...intakeQueue];
  const decisionCount = decisionQueue.length;
  const reviewCoveragePct = activeCases.length ? Math.round((reviewedApps.length / activeCases.length) * 100) : 0;
  const slotCoveragePct = totalAssignedSlots ? Math.round((totalSubmittedReviews / totalAssignedSlots) * 100) : 0;
  const approvalRatePct = releasedCount ? Math.round(((buckets.approved + buckets.awarded) / releasedCount) * 100) : 0;

  return {
    totalApplications: totalScope,
    activeApplications: activeCases.length,
    staffCount: safeStaff.length,
    newApplications: {
      count: awaitingPanel.length,
      stagedCount: stagedSetup.length,
      totalIntake: awaitingPanel.length + stagedSetup.length,
      items: [...awaitingPanel, ...stagedSetup],
    },
    decisions: {
      count: decisionCount,
      closedCount: closedReady.length,
      votingCount: votingOpen.length,
      readyForVoteCount: readyToOpenVote.length,
      resubmittedCount: resubmitted.length,
      items: decisionQueue,
    },
    reviews: {
      reviewedAppsCount: reviewedApps.length,
      totalAppsCount: activeCases.length,
      fullyReviewedAppsCount: fullyReviewedApps.length,
      coveragePct: reviewCoveragePct,
      totalSubmittedReviews,
      totalAssignedSlots,
      slotCoveragePct,
    },
    outcomes: {
      approved: buckets.approved,
      awarded: buckets.awarded,
      rejected: buckets.rejected,
      inReview: buckets.review,
      changesRequested: buckets.changes,
      newCount: buckets.new,
      withdrawn: buckets.withdrawn,
      decidedCount: releasedCount,
      approvalRatePct,
    },
    pipeline,
    funnel,
    sectors,
    deadlines,
    actionQueue,
    personalTasks: collectPersonalTasks(safeCases),
  };
}

/**
 * Build overview visual summary for a regular (non-lead) assessor.
 * @param {AssessorCaseSummary[]} cases
 * @param {number} [nowMs]
 */
export function buildAssessorOverview(cases, nowMs = Date.now()) {
  const safeCases = Array.isArray(cases) ? cases : [];
  const assigned = safeCases.filter(item => item.assigned);
  const activeAssigned = assigned.filter(item => item.conflict !== "recused" && item.status !== "Withdrawn");
  const declarationDue = activeAssigned.filter(item => item.conflict === "pending" && ["setup", "review"].includes(String(item.roundState || "")));
  const toReview = activeAssigned.filter(item => item.conflict === "cleared" && item.roundState === "review" && !item.submitted && !item.hold);
  const votingDue = activeAssigned.filter(item => item.conflict === "cleared" && item.roundState === "voting" && item.submitted && !item.hasVoted && !item.hold);
  const submitted = activeAssigned.filter(item => item.submitted);
  const inProgress = toReview.filter(item => Number(item.reviewedCount || 0) > 0);
  const nextActions = collectPersonalTasks(safeCases).sort((a, b) => {
    const da = a.deadline ? Date.parse(a.deadline) : Number.POSITIVE_INFINITY;
    const db = b.deadline ? Date.parse(b.deadline) : Number.POSITIVE_INFINITY;
    return (Number.isNaN(da) ? Number.POSITIVE_INFINITY : da) - (Number.isNaN(db) ? Number.POSITIVE_INFINITY : db);
  });
  const base = Math.max(1, activeAssigned.length);
  const completionPct = activeAssigned.length ? Math.round((submitted.length / activeAssigned.length) * 100) : 0;
  const overdueCount = nextActions.filter(item => item.deadline && !Number.isNaN(Date.parse(item.deadline)) && Date.parse(item.deadline) < nowMs).length;

  /** @type {OverviewSegment[]} */
  const breakdown = [
    { key: "declaration", label: "Declaration due", count: declarationDue.length, pct: Math.round((declarationDue.length / base) * 100), color: overviewColors.purple },
    { key: "review", label: "Open to review", count: toReview.length, pct: Math.round((toReview.length / base) * 100), color: overviewColors.amber },
    { key: "voting", label: "Voting open", count: votingDue.length, pct: Math.round((votingDue.length / base) * 100), color: overviewColors.blue },
    { key: "submitted", label: "Submitted", count: submitted.length, pct: Math.round((submitted.length / base) * 100), color: overviewColors.green },
  ];

  return {
    assignedCount: activeAssigned.length,
    declarationDueCount: declarationDue.length,
    toReviewCount: toReview.length,
    inProgressCount: inProgress.length,
    votingDueCount: votingDue.length,
    submittedCount: submitted.length,
    completionPct,
    overdueCount,
    breakdown,
    nextActions,
  };
}

/**
 * Categorize a case for the Application library stage pills.
 * @param {AssessorCaseSummary} item
 * @returns {"new" | "review" | "approved" | "awarded" | "rejected" | "withdrawn"}
 */
export function libraryCategory(item) {
  return classifyPipelineStage(item) === "changes" ? "review" : classifyPipelineStage(item);
}

/**
 * Categorize an application for My assessments (To review, In progress, Submitted, Previous).
 * @param {AssessorCaseSummary} item
 * @param {boolean} [isLead]
 * @returns {"to-review" | "in-progress" | "submitted" | "previous"}
 */
export function assessmentBucket(item, isLead = false) {
  if (item.status === "Withdrawn" || item.conflict === "recused") return "previous";
  if (item.assigned) {
    if (item.submitted) return "submitted";
    return Number(item.reviewedCount || 0) > 0 ? "in-progress" : "to-review";
  }
  if (!isLead) return "previous";
  if (["Approved", "Awarded", "Rejected"].includes(item.status) || ["voting", "closed", "released", "awarded"].includes(String(item.roundState || ""))) {
    return "submitted";
  }
  if (item.roundState === "review" && Number(item.memberCount || 0) > 0 && Number(item.reviewCount || 0) >= Number(item.memberCount || 0)) {
    return "submitted";
  }
  if ((item.roundState === "review" && Number(item.reviewCount || 0) > 0) || item.status === "Changes requested" || item.roundState === "awaiting-information") {
    return "in-progress";
  }
  return "to-review";
}

/**
 * Produce clear, consistent human-readable status labels for My assessments and Application library filters.
 * @param {AssessorCaseSummary} item
 * @param {"library" | "assessments"} [context]
 * @returns {string}
 */
export function humanCaseStatus(item, context = "library") {
  if (!item.assigned && !item.canManage && !item.hasHistory) return "Not assigned";
  if (item.conflict === "recused") return "Recused";
  if (item.hold) return "On hold";
  if (item.status === "Withdrawn") return "Withdrawn";
  if (item.status === "Awarded") return "Awarded";
  if (item.status === "Approved") return "Approved";
  if (item.status === "Rejected") return "Rejected";
  if (item.status === "Changes requested" || item.roundState === "awaiting-information") return "Changes requested";
  if (item.roundState === "closed") return "Decision ready";
  if (item.roundState === "voting") return "Voting open";
  if (context === "assessments") {
    if (item.assigned) {
      if (item.submitted) return "Review submitted";
      if (item.conflict === "pending") return "Declaration due";
      return Number(item.reviewedCount || 0) > 0 ? "In progress" : "To review";
    }
    if (item.roundState === "setup") return "Panel setup";
    if (item.roundState === "review") return Number(item.reviewCount || 0) > 0 ? "In progress" : "To review";
    return "To review";
  }
  if (item.status === "Submitted" && !item.roundId) return item.assigned ? "Assigned" : "New";
  if (item.roundState === "setup") return item.assigned && item.conflict === "pending" ? "Declaration due" : "Panel setup";
  if (item.roundState === "review") {
    if (item.assigned) {
      if (item.submitted) return "Review submitted";
      if (item.conflict === "pending") return "Declaration due";
      return "In review";
    }
    return "In review";
  }
  if (item.roundState === "awarded") return "Award conferred";
  if (item.roundState === "released") return "Outcome released";
  return item.status || "New";
}

/**
 * Summarize My assessments visuals and unified list items.
 * @param {AssessorCaseSummary[]} cases
 * @param {boolean} [isLead]
 */
export function buildMyAssessmentsSummary(cases, isLead = false) {
  const safeCases = Array.isArray(cases) ? cases : [];
  const items = isLead ? safeCases : safeCases.filter(item => item.assigned || item.hasHistory);
  /** @type {AssessorCaseSummary[]} */
  const toReview = [];
  /** @type {AssessorCaseSummary[]} */
  const inProgress = [];
  /** @type {AssessorCaseSummary[]} */
  const submitted = [];
  /** @type {AssessorCaseSummary[]} */
  const previous = [];

  for (const item of items) {
    const bucket = assessmentBucket(item, isLead);
    if (bucket === "to-review") toReview.push(item);
    else if (bucket === "in-progress") inProgress.push(item);
    else if (bucket === "submitted") submitted.push(item);
    else previous.push(item);
  }

  const activeTotal = toReview.length + inProgress.length + submitted.length;
  const base = Math.max(1, activeTotal);
  const completionPct = activeTotal ? Math.round((submitted.length / activeTotal) * 100) : 0;

  /** @type {OverviewSegment[]} */
  const breakdown = [
    { key: "to-review", label: "To review", count: toReview.length, pct: Math.round((toReview.length / base) * 100), color: overviewColors.blue },
    { key: "in-progress", label: "In progress", count: inProgress.length, pct: Math.round((inProgress.length / base) * 100), color: overviewColors.amber },
    { key: "submitted", label: "Submitted", count: submitted.length, pct: Math.round((submitted.length / base) * 100), color: overviewColors.green },
  ];

  return {
    items,
    totalCount: items.length,
    activeTotal,
    assignedCount: items.filter(item => item.assigned).length,
    toReview,
    inProgress,
    submitted,
    previous,
    completionPct,
    breakdown,
  };
}

/**
 * Summarize Application library filter pill counts.
 * @param {AssessorCaseSummary[]} cases
 */
export function buildLibrarySummary(cases) {
  const safeCases = Array.isArray(cases) ? cases : [];
  const counts = { all: safeCases.length, new: 0, review: 0, approved: 0, awarded: 0, rejected: 0, withdrawn: 0, assignedToMe: 0 };
  for (const item of safeCases) {
    const category = libraryCategory(item);
    counts[category] += 1;
    if (item.assigned) counts.assignedToMe += 1;
  }
  return counts;
}

/**
 * Build a smart default future review deadline (7 days ahead at 17:00 Botswana time / UTC+2).
 * @param {number} [daysAhead]
 * @param {number} [nowMs]
 */
export function defaultAssessmentDeadline(daysAhead = 7, nowMs = Date.now()) {
  const catMs = nowMs + 2 * 3600_000 + Math.max(1, daysAhead) * DAY_MS;
  const datePart = new Date(catMs).toISOString().slice(0, 10);
  const iso = new Date(`${datePart}T17:00:00+02:00`).toISOString();
  const mobileInput = `${datePart} 17:00`;
  const local = new Date(Date.parse(iso) - new Date(iso).getTimezoneOffset() * 60_000);
  const webInput = local.toISOString().slice(0, 16);
  return { iso, webInput, mobileInput };
}

/**
 * Format an assessor's role with any strongest-judgement specialty sectors as a subtitle.
 * @param {{ lead?: boolean, sectors?: string[] } | null | undefined} profile
 */
export function formatAssessorRole(profile) {
  const base = profile?.lead ? "Lead Assessor" : "Assessor";
  const specialties = Array.isArray(profile?.sectors) ? profile.sectors.filter(Boolean) : [];
  return specialties.length ? `${base} · ${specialties.join(", ")}` : base;
}

/**
 * Return all active non-recused assessors eligible for panel assignment, prioritizing industry specialists first.
 * @param {AssessorStaffMember[]} staff
 * @param {{ id: string, conflict?: string | null }[]} panelMembers
 * @param {string | null | undefined} sectorId
 */
export function eligiblePanelCandidates(staff, panelMembers, sectorId) {
  const safeStaff = Array.isArray(staff) ? staff : [];
  const recusedIds = new Set(
    (Array.isArray(panelMembers) ? panelMembers : [])
      .filter(member => member.conflict === "recused")
      .map(member => member.id)
  );
  return safeStaff
    .filter(member => !recusedIds.has(member.id))
    .sort((a, b) => {
      const aMatch = Boolean(sectorId && Array.isArray(a.sectors) && a.sectors.includes(sectorId));
      const bMatch = Boolean(sectorId && Array.isArray(b.sectors) && b.sectors.includes(sectorId));
      if (aMatch !== bMatch) return Number(bMatch) - Number(aMatch);
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
}

/**
 * Format an assessor's panel selection subtitle showing strongest judgement specialty without hiding cross-sector candidates.
 * @param {AssessorStaffMember} person
 * @param {string | null | undefined} sectorId
 * @param {boolean} checked
 */
export function panelCandidateSubtitle(person, sectorId, checked) {
  const names = Array.isArray(person?.sectorNames) && person.sectorNames.length
    ? person.sectorNames.filter(Boolean).join(", ")
    : "All industries";
  const isMatch = Boolean(sectorId && Array.isArray(person?.sectors) && person.sectors.includes(sectorId));
  const prefix = checked ? "Selected for panel" : isMatch ? "Industry match" : "Available";
  const roleTag = person?.lead ? "Lead Assessor · " : "";
  return `${prefix} · ${roleTag}Strongest judgement: ${names}`;
}

/**
 * Default CEDA evaluation criteria and percentage weights (summing to 100%).
 * Used as fallback before dynamic rubric metadata loads or for legacy snapshots.
 */
export const defaultAssessmentRubric = Object.freeze([
  Object.freeze({
    key: "strategic-alignment",
    label: "Strategic alignment",
    description: "Alignment with CEDA mandate, Botswana national priorities, and target sector needs.",
    weight: 20,
    sortOrder: 1,
    active: true,
  }),
  Object.freeze({
    key: "innovation-and-originality",
    label: "Innovation and originality",
    description: "Novelty of the solution, differentiation from existing alternatives, and creative approach.",
    weight: 20,
    sortOrder: 2,
    active: true,
  }),
  Object.freeze({
    key: "impact-potential",
    label: "Impact potential",
    description: "Measurable benefit to target beneficiaries, job creation, inclusion, and environmental outcomes.",
    weight: 20,
    sortOrder: 3,
    active: true,
  }),
  Object.freeze({
    key: "feasibility-and-viability",
    label: "Feasibility and viability",
    description: "Technical, operational, and commercial readiness supported by evidence at the current stage.",
    weight: 15,
    sortOrder: 4,
    active: true,
  }),
  Object.freeze({
    key: "scalability-and-sustainability",
    label: "Scalability and sustainability",
    description: "Capacity for sustainable growth, unit economics, and long-term market or community adoption.",
    weight: 15,
    sortOrder: 5,
    active: true,
  }),
  Object.freeze({
    key: "implementation-capacity-team-capability-and-governance",
    label: "Implementation capacity, team capability and governance",
    description: "Team capability, delivery roadmap, risk mitigation, IP protection, and governance readiness.",
    weight: 10,
    sortOrder: 6,
    active: true,
  }),
]);

/**
 * @typedef {{ key: string, label: string, description?: string, weight?: number, sortOrder?: number, active?: boolean, criterion?: string }} RubricCriterionItem
 */

function roundTo(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Generate a URL/JSON-safe criterion slug key from a human label.
 * @param {string} label
 * @param {number} [index]
 */
export function slugifyCriterionKey(label, index = 1) {
  const slug = String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "");
  return slug.length >= 2 ? slug : `criterion-${Math.max(1, Math.trunc(index || 1))}`;
}

/**
 * Normalize dynamic rubric input (workspace.rubric, round.rubric array, or legacy keys) into active sorted criteria.
 * @param {RubricCriterionItem[] | { criteria?: RubricCriterionItem[] } | string[] | null | undefined} rubricInput
 * @returns {RubricCriterionItem[]}
 */
export function normalizeRubricCriteria(rubricInput) {
  const rawList = Array.isArray(rubricInput)
    ? rubricInput
    : Array.isArray(rubricInput?.criteria)
      ? rubricInput.criteria
      : [];
  const normalized = rawList
    .map((item, idx) => {
      if (typeof item === "string") {
        const key = item.trim();
        if (!key) return null;
        const known = defaultAssessmentRubric.find(entry => entry.key === key);
        return known ? { ...known } : {
          key,
          label: criterionLabel(key),
          description: "",
          weight: roundTo(100 / Math.max(1, rawList.length), 2),
          sortOrder: idx + 1,
          active: true,
        };
      }
      if (!item || typeof item !== "object") return null;
      const active = item.active !== false;
      if (!active) return null;
      const key = String(item.key || item.criterion || "").trim();
      const label = String(item.label || "").trim() || criterionLabel(key);
      const numericWeight = Number(item.weight);
      if (!key && !label) return null;
      return {
        key: key || slugifyCriterionKey(label, idx + 1),
        label,
        description: String(item.description || "").trim(),
        weight: Number.isFinite(numericWeight) && numericWeight > 0 ? roundTo(numericWeight, 2) : 0,
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : idx + 1,
        active: true,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.key.localeCompare(b.key));
  return normalized.length ? normalized : defaultAssessmentRubric.map(item => ({ ...item }));
}

/**
 * Resolve a human-readable criterion label using a round/active rubric with baseline fallback.
 * @param {string} key
 * @param {RubricCriterionItem[] | { criteria?: RubricCriterionItem[] } | null | undefined} [rubricInput]
 */
export function criterionLabel(key, rubricInput) {
  const target = String(key || "").trim();
  const list = Array.isArray(rubricInput)
    ? rubricInput
    : Array.isArray(rubricInput?.criteria)
      ? rubricInput.criteria
      : defaultAssessmentRubric;
  const found = list.find(item => item && typeof item === "object" && (item.key === target || item.criterion === target));
  if (found && String(found.label || "").trim()) return String(found.label).trim();
  const baseline = defaultAssessmentRubric.find(item => item.key === target);
  if (baseline) return baseline.label;
  return target
    .split("-")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Compute weighted and unweighted scorecard metrics from assessor ratings and rubric weights.
 * @param {{ criterion: string, rating: number | null | undefined, rationale?: string }[] | null | undefined} scores
 * @param {RubricCriterionItem[] | { criteria?: RubricCriterionItem[] } | null | undefined} [rubricInput]
 * @param {number} [passThreshold]
 */
export function computeWeightedAssessment(scores, rubricInput, passThreshold = 60) {
  const criteria = normalizeRubricCriteria(rubricInput);
  const scoreMap = new Map();
  for (const entry of Array.isArray(scores) ? scores : []) {
    if (!entry || typeof entry !== "object") continue;
    const key = String(entry.criterion || entry.key || "").trim();
    const rating = Number(entry.rating);
    if (key && Number.isInteger(rating) && rating >= 1 && rating <= 5) {
      scoreMap.set(key, rating);
    }
  }
  const hasExplicitWeights = criteria.every(item => item.weight > 0);
  let totalWeight = 0;
  let scoredWeight = 0;
  let weightedSum = 0;
  let unweightedSum = 0;
  let scoredCount = 0;

  const breakdown = criteria.map((item) => {
    const effectiveWeight = hasExplicitWeights ? item.weight : roundTo(100 / criteria.length, 2);
    const rating = scoreMap.has(item.key) ? scoreMap.get(item.key) : null;
    totalWeight += effectiveWeight;
    if (rating !== null) {
      scoredCount += 1;
      scoredWeight += effectiveWeight;
      weightedSum += rating * effectiveWeight;
      unweightedSum += rating;
    }
    return {
      key: item.key,
      label: item.label,
      weight: item.weight,
      rating,
      maxContribution: roundTo(effectiveWeight, 2),
      weightedContribution: rating !== null ? roundTo((rating / 5) * effectiveWeight, 2) : 0,
    };
  });

  const weightedScore = scoredWeight > 0 ? roundTo(weightedSum / scoredWeight, 2) : null;
  const weightedTotal = weightedScore !== null ? roundTo(weightedScore * 20, 1) : null;
  const earnedPercentage = totalWeight > 0 ? roundTo((weightedSum / (totalWeight * 5)) * 100, 1) : 0;
  const unweightedMean = scoredCount > 0 ? roundTo(unweightedSum / scoredCount, 2) : null;
  const cleanThreshold = Number.isFinite(Number(passThreshold)) ? Number(passThreshold) : 60;
  const meetsThreshold =
    scoredCount === criteria.length && weightedTotal !== null ? weightedTotal >= cleanThreshold : null;

  return {
    totalCriteria: criteria.length,
    scoredCount,
    totalWeight: roundTo(totalWeight, 2),
    scoredWeight: roundTo(scoredWeight, 2),
    weightedScore,
    weightedTotal,
    earnedPercentage,
    unweightedMean,
    passThreshold: roundTo(cleanThreshold, 2),
    meetsThreshold,
    breakdown,
  };
}

/**
 * Distribute 100.00% evenly across active criteria (exact to 0.01% so weights always sum to 100).
 * @param {RubricCriterionItem[]} criteriaList
 * @returns {RubricCriterionItem[]}
 */
export function distributeWeightsEqually(criteriaList) {
  const list = Array.isArray(criteriaList) ? criteriaList.map(item => ({ ...item })) : [];
  const activeIndices = [];
  list.forEach((item, index) => {
    if (item.active !== false) activeIndices.push(index);
  });
  if (!activeIndices.length) return list;
  const totalBasisPoints = 10000;
  const baseShare = Math.floor(totalBasisPoints / activeIndices.length);
  let remainder = totalBasisPoints - baseShare * activeIndices.length;
  for (const idx of activeIndices) {
    const share = baseShare + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    list[idx].weight = roundTo(share / 100, 2);
  }
  return list;
}

/**
 * Validate an admin rubric draft before submission to the backend.
 * @param {{ key?: string, label: string, description?: string, weight: number | string, active?: boolean }[]} criteriaList
 * @param {number | string} [passThreshold]
 */
export function validateRubricDraft(criteriaList, passThreshold = 60) {
  const errors = [];
  const list = Array.isArray(criteriaList) ? criteriaList : [];
  const threshold = Number(passThreshold);
  if (!Number.isFinite(threshold) || threshold < 20 || threshold > 100) {
    errors.push("Pass benchmark must be between 20% and 100%.");
  }
  if (!list.length || list.length > 25) {
    errors.push("Maintain between 1 and 25 total criteria entries.");
  }

  const seenKeys = new Set();
  const normalized = [];
  let activeCount = 0;
  let activeWeightBasisPoints = 0;

  list.forEach((entry, idx) => {
    const label = String(entry?.label || "").trim();
    const description = String(entry?.description || "").trim();
    const active = entry?.active !== false;
    const rawKey = String(entry?.key || "").trim();
    const key = rawKey ? slugifyCriterionKey(rawKey, idx + 1) : slugifyCriterionKey(label, idx + 1);
    const weight = Number(entry?.weight);

    if (label.length < 2 || label.length > 140 || /[<>]/.test(label)) {
      errors.push(`Criterion ${idx + 1} needs a valid label (2 to 140 characters).`);
    }
    if (description.length > 600) {
      errors.push(`"${label || `Criterion ${idx + 1}`}" description cannot exceed 600 characters.`);
    }
    if (seenKeys.has(key)) {
      errors.push(`Duplicate criterion identifier "${key}". Rename to keep criteria distinct.`);
    }
    seenKeys.add(key);

    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
      errors.push(`Weight for "${label || key}" must be greater than 0% and at most 100%.`);
    }

    if (active) {
      activeCount += 1;
      if (Number.isFinite(weight) && weight > 0) {
        activeWeightBasisPoints += Math.round(weight * 100);
      }
    }

    normalized.push({
      key,
      label,
      description,
      weight: Number.isFinite(weight) ? roundTo(weight, 2) : 0,
      sortOrder: idx + 1,
      active,
    });
  });

  if (activeCount < 1 || activeCount > 15) {
    errors.push("Keep between 1 and 15 active criteria enabled.");
  }
  const totalWeight = roundTo(activeWeightBasisPoints / 100, 2);
  if (activeWeightBasisPoints !== 10000) {
    errors.push(`Active criterion weights must total 100% (currently ${totalWeight.toFixed(2)}%).`);
  }

  return {
    valid: errors.length === 0,
    errors,
    activeCount,
    totalWeight,
    remainingWeight: roundTo((10000 - activeWeightBasisPoints) / 100, 2),
    passThreshold: Number.isFinite(threshold) ? roundTo(threshold, 2) : 60,
    normalized,
  };
}
