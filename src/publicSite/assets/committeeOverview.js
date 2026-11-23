export const LIFECYCLE_STAGES = [
  { key: "submission", label: "Submission", stepNumber: 1, statuses: ["Submitted"] },
  { key: "review", label: "Review", stepNumber: 2, statuses: ["In review"] },
  { key: "feedback", label: "Feedback", stepNumber: 3, statuses: ["Changes requested"] },
  { key: "approval", label: "Approval", stepNumber: 4, statuses: ["Approved"] },
  { key: "award", label: "Award", stepNumber: 5, statuses: ["Awarded"] },
];

export const COMMITTEE_STATUS_FILTERS = [
  "All",
  "Submitted",
  "In review",
  "Changes requested",
  "Approved",
  "Awarded",
  "Rejected",
  "Withdrawn",
];

export function classifyCommitteeStage(status) {
  switch (String(status || "")) {
    case "Awarded":
      return "award";
    case "Approved":
      return "approval";
    case "Changes requested":
      return "feedback";
    case "In review":
      return "review";
    case "Rejected":
      return "rejected";
    case "Withdrawn":
      return "withdrawn";
    case "Draft":
      return "draft";
    default:
      return "submission";
  }
}

export function committeeStageLabel(status) {
  switch (classifyCommitteeStage(status)) {
    case "award":
      return "Award";
    case "approval":
      return "Approval";
    case "feedback":
      return "Feedback";
    case "review":
      return "Review";
    case "rejected":
      return "Outcome (Declined)";
    case "withdrawn":
      return "Withdrawn";
    default:
      return "Submission";
  }
}

export function buildLifecycleSteps(app) {
  const status = String(app?.status || "Submitted");
  const timeline = Array.isArray(app?.timeline) ? app.timeline : [];
  const lowerMatch = (patterns) =>
    timeline.find((evt) =>
      patterns.some((p) => `${evt?.label || ""} ${evt?.detail || ""}`.toLowerCase().includes(p))
    ) || null;

  const submissionEvt = lowerMatch(["received", "submitted", "submission"]) || (app?.submittedDate ? { at: app.submittedDate, detail: "Initial application locked for screening." } : null);
  const reviewEvt = lowerMatch(["review", "panel"]);
  const feedbackEvt = lowerMatch(["information", "clarification", "changes"]);
  const approvalEvt = lowerMatch(["outcome", "approved", "declined", "rejected"]);
  const awardEvt = lowerMatch(["award"]);

  const stageKey = classifyCommitteeStage(status);
  const reachedRank =
    stageKey === "award" ? 5
      : stageKey === "approval" ? 4
        : stageKey === "feedback" ? 3
          : stageKey === "review" ? 2
            : stageKey === "rejected" || stageKey === "withdrawn" ? (approvalEvt ? 4 : reviewEvt ? 2 : 1)
              : 1;

  const eventMap = {
    submission: submissionEvt,
    review: reviewEvt,
    feedback: feedbackEvt,
    approval: approvalEvt,
    award: awardEvt,
  };

  return LIFECYCLE_STAGES.map((stage) => {
    const evt = eventMap[stage.key];
    let state = "upcoming";
    if (stage.key === "feedback") {
      if (stageKey === "feedback") state = "current";
      else if (feedbackEvt || reachedRank >= 4) state = "completed";
    } else if (stageKey === "rejected" && stage.key === "approval") {
      state = "halted";
    } else if (stageKey === "withdrawn" && stage.stepNumber === reachedRank) {
      state = "halted";
    } else if (stage.stepNumber < reachedRank) {
      state = "completed";
    } else if (stage.stepNumber === reachedRank) {
      state = stage.key === "award" && stageKey === "award" ? "completed" : "current";
    }
    const label = stage.key === "approval" && stageKey === "rejected" ? "Outcome (Declined)" : stage.label;
    return {
      key: stage.key,
      label,
      stepNumber: stage.stepNumber,
      state,
      at: evt?.at || null,
      detail: evt?.detail || (state === "completed" ? `${label} milestone recorded.` : state === "current" ? `Currently in ${label.toLowerCase()} stage.` : "Pending progression."),
    };
  });
}

export function buildCommitteeSummary(workspaceData) {
  const apps = Array.isArray(workspaceData?.applications) ? workspaceData.applications : [];
  const sectors = Array.isArray(workspaceData?.sectors) ? workspaceData.sectors : [];
  const rawTimeline = Array.isArray(workspaceData?.timelineEvents) ? workspaceData.timelineEvents : [];

  const counts = {
    total: apps.length,
    submitted: apps.filter((a) => a.status === "Submitted").length,
    inReview: apps.filter((a) => a.status === "In review").length,
    changesRequested: apps.filter((a) => a.status === "Changes requested").length,
    approved: apps.filter((a) => a.status === "Approved").length,
    awarded: apps.filter((a) => a.status === "Awarded").length,
    rejected: apps.filter((a) => a.status === "Rejected").length,
    withdrawn: apps.filter((a) => a.status === "Withdrawn").length,
  };

  const positiveCount = counts.approved + counts.awarded;
  const decidedCount = positiveCount + counts.rejected;
  const approvalRatePct = decidedCount > 0 ? Math.round((positiveCount / decidedCount) * 100) : 0;
  const awardConversionPct = positiveCount > 0 ? Math.round((counts.awarded / positiveCount) * 100) : 0;

  const pipelineBreakdown = [
    { key: "Submitted", label: "Submission", count: counts.submitted, color: "#28599B" },
    { key: "In review", label: "Review", count: counts.inReview, color: "#94702D" },
    { key: "Changes requested", label: "Feedback", count: counts.changesRequested, color: "#B85B21" },
    { key: "Approved", label: "Approval", count: counts.approved, color: "#236D61" },
    { key: "Awarded", label: "Award", count: counts.awarded, color: "#7C5317" },
    ...(counts.rejected > 0 ? [{ key: "Rejected", label: "Declined", count: counts.rejected, color: "#903925" }] : []),
    ...(counts.withdrawn > 0 ? [{ key: "Withdrawn", label: "Withdrawn", count: counts.withdrawn, color: "#5D5652" }] : []),
  ];

  const awardedShowcase = apps
    .filter((a) => a.status === "Awarded")
    .sort((a, b) => String(b.awardedAt || b.updatedAt || "").localeCompare(String(a.awardedAt || a.updatedAt || "")));

  const awaitingAward = apps
    .filter((a) => a.status === "Approved")
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  return {
    counts,
    positiveCount,
    decidedCount,
    approvalRatePct,
    awardConversionPct,
    pipelineBreakdown,
    awardedShowcase,
    awaitingAward,
    recentMilestones: rawTimeline.slice(0, 60),
    sectors,
  };
}

export function filterCommitteeApplications(apps = [], { query = "", status = "All", sector = "All" } = {}) {
  const q = String(query || "").trim().toLowerCase();
  const sFilter = String(status || "All").trim();
  const secFilter = String(sector || "All").trim().toLowerCase();

  return (Array.isArray(apps) ? apps : []).filter((item) => {
    if (sFilter && sFilter !== "All" && item.status !== sFilter) return false;
    if (secFilter && secFilter !== "all" && String(item.sector || "").toLowerCase() !== secFilter) return false;
    if (q) {
      const hay = `${item.reference || ""} ${item.title || ""} ${item.applicant || ""} ${item.sector || ""} ${item.status || ""} ${item.summary || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function filterCommitteeTimeline(events = [], { query = "", stage = "All", sector = "All" } = {}) {
  const q = String(query || "").trim().toLowerCase();
  const stFilter = String(stage || "All").trim();
  const secFilter = String(sector || "All").trim().toLowerCase();

  return (Array.isArray(events) ? events : []).filter((evt) => {
    if (stFilter && stFilter !== "All" && evt.stage !== stFilter && evt.status !== stFilter) return false;
    if (secFilter && secFilter !== "all" && String(evt.sector || "").toLowerCase() !== secFilter) return false;
    if (q) {
      const hay = `${evt.reference || ""} ${evt.title || ""} ${evt.applicant || ""} ${evt.label || ""} ${evt.detail || ""} ${evt.sector || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function formatAwardSummaryText(app) {
  const award = app?.awardData && typeof app.awardData === "object" ? app.awardData : {};
  const lines = [
    "CITIZEN ENTREPRENEURIAL DEVELOPMENT AGENCY (CEDA)",
    "INNOVATION AWARD RECOGNITION BRIEF (READ-ONLY COMMITTEE RECORD)",
    "--------------------------------------------------------------",
    `Reference: ${app?.reference || "Pending"}`,
    `Title: ${award.awardTitle || `CEDA Innovation Award: ${app?.title || "Innovation"}`}`,
    `Recipient: ${app?.applicant || "Applicant"}`,
    `Sector: ${app?.sector || "Unassigned"}`,
    `Award Category: ${award.awardCategory || "Innovation Recognition & Support"}`,
    ...(award.awardAmount ? [`Package / Grant Value: ${award.awardAmount}`] : []),
    `Conferred At: ${award.conferredAt || app?.awardedAt || app?.updatedAt || "Recorded"}`,
    "",
    "Award Summary:",
    award.awardSummary || app?.outcomeData?.feedback || "Conferred CEDA Innovation Award status.",
  ];
  return lines.join("\n");
}
