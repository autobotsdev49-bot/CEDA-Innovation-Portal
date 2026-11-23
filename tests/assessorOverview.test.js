import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assessmentBucket, buildAssessorOverview, buildLeadOverview, buildLibrarySummary, buildMyAssessmentsSummary,
  classifyPipelineStage, defaultAssessmentDeadline, eligiblePanelCandidates, formatAssessorRole,
  humanCaseStatus, libraryCategory, panelCandidateSubtitle,
} from "../mobile/assessmentOverview.js";

const now = Date.parse("2026-11-22T06:00:00Z");
const hours = count => new Date(now + count * 3600_000).toISOString();

function makeCase(overrides = {}) {
  return {
    id: "case-1",
    reference: "CEDA-001",
    title: "Solar Microgrid",
    sector: "Energy",
    sectorId: "sec-energy",
    status: "Submitted",
    assigned: false,
    canManage: true,
    canRelease: true,
    roundId: null,
    roundState: null,
    deadline: null,
    conflict: null,
    submitted: false,
    hasVoted: false,
    hasHistory: false,
    hold: false,
    memberCount: 0,
    reviewCount: 0,
    ...overrides,
  };
}

test("lead overview computes new applications, decision actions, 3/10 reviewed ratio, and visual breakdowns", () => {
  const cases = [
    // 1-2: Two brand-new Submitted applications awaiting panel
    makeCase({ id: "c1", reference: "CEDA-101", status: "Submitted" }),
    makeCase({ id: "c2", reference: "CEDA-102", status: "Submitted", sector: "Agriculture", sectorId: "sec-agri" }),
    // 3: Staged setup waiting to start
    makeCase({ id: "c3", reference: "CEDA-103", status: "Submitted", roundId: "r3", roundState: "setup", memberCount: 2, deadline: hours(72) }),
    // 4: In review, 0 reviews submitted yet, overdue deadline
    makeCase({ id: "c4", reference: "CEDA-104", status: "In review", roundId: "r4", roundState: "review", memberCount: 3, reviewCount: 0, deadline: hours(-5) }),
    // 5: In review, 1 of 3 reviews submitted (counts toward apps with reviews), due within 48h
    makeCase({ id: "c5", reference: "CEDA-105", status: "In review", roundId: "r5", roundState: "review", memberCount: 3, reviewCount: 1, deadline: hours(24) }),
    // 6: In review, all 2 of 2 reviews submitted -> ready to open voting (Decision action)
    makeCase({ id: "c6", reference: "CEDA-106", status: "In review", roundId: "r6", roundState: "review", memberCount: 2, reviewCount: 2, deadline: hours(96) }),
    // 7: Voting open (Decision action), on hold
    makeCase({ id: "c7", reference: "CEDA-107", status: "In review", roundId: "r7", roundState: "voting", memberCount: 2, reviewCount: 2, hold: true, deadline: hours(12) }),
    // 8: Voting closed -> ready for Lead decision & release (Decision action, 0 reviews on legacy synthetic check -> won't count as reviewed)
    makeCase({ id: "c8", reference: "CEDA-108", status: "In review", roundId: "r8", roundState: "closed", memberCount: 2, reviewCount: 0 }),
    // 9: Approved outcome (0 current reviewCount in this synthetic check so exactly 3 of 10 have reviews)
    makeCase({ id: "c9", reference: "CEDA-109", status: "Approved", roundId: "r9", roundState: "released", memberCount: 2, reviewCount: 0 }),
    // 10: Rejected outcome
    makeCase({ id: "c10", reference: "CEDA-110", status: "Rejected", roundId: "r10", roundState: "released", memberCount: 2, reviewCount: 0, sector: "Agriculture", sectorId: "sec-agri" }),
  ];

  const staff = [
    { id: "s1", name: "Assessor One", sectors: ["sec-energy"] },
    { id: "s2", name: "Assessor Two", sectors: ["sec-energy", "sec-agri"] },
  ];

  const summary = buildLeadOverview(cases, staff, now);

  assert.equal(summary.totalApplications, 10);
  assert.equal(summary.activeApplications, 10);
  assert.equal(summary.staffCount, 2);

  // New applications awaiting panel vs staged
  assert.equal(summary.newApplications.count, 2);
  assert.equal(summary.newApplications.stagedCount, 1);
  assert.equal(summary.newApplications.totalIntake, 3);

  // Decisions needed: c8 (closed), c7 (voting), c6 (ready to open vote)
  assert.equal(summary.decisions.count, 3);
  assert.equal(summary.decisions.closedCount, 1);
  assert.equal(summary.decisions.votingCount, 1);
  assert.equal(summary.decisions.readyForVoteCount, 1);

  // Submitted reviews: 3 of 10 applications received reviews (c5: 1, c6: 2, c7: 2 => 5 total reviews)
  assert.equal(summary.reviews.reviewedAppsCount, 3);
  assert.equal(summary.reviews.totalAppsCount, 10);
  assert.equal(summary.reviews.coveragePct, 30);
  assert.equal(summary.reviews.totalSubmittedReviews, 5);
  assert.equal(summary.reviews.fullyReviewedAppsCount, 2);

  // Outcomes decided
  assert.equal(summary.outcomes.approved, 1);
  assert.equal(summary.outcomes.rejected, 1);
  assert.equal(summary.outcomes.decidedCount, 2);
  assert.equal(summary.outcomes.approvalRatePct, 50);

  // Pipeline totals match scope
  assert.equal(summary.pipeline.reduce((sum, entry) => sum + entry.count, 0), 10);

  // Deadline health (only active setup/review/voting/closed/awaiting-information rounds)
  assert.equal(summary.deadlines.overdue, 1);
  assert.equal(summary.deadlines.dueSoon, 1);
  assert.equal(summary.deadlines.onTrack, 2);
  assert.equal(summary.deadlines.onHold, 1);

  // Sector breakdown sorted by total count desc
  assert.equal(summary.sectors[0].sector, "Energy");
  assert.equal(summary.sectors[0].total, 8);
  assert.equal(summary.sectors[0].staffCount, 2);
  assert.equal(summary.sectors[1].sector, "Agriculture");
  assert.equal(summary.sectors[1].total, 2);
  assert.equal(summary.sectors[1].staffCount, 1);

  // Action queue puts Decision actions first, then Panel setup/assignment
  assert.equal(summary.actionQueue[0].item.id, "c8");
  assert.equal(summary.actionQueue[0].targetTab, "Decision");
  assert.equal(summary.actionQueue.at(-1).targetTab, "Panel");
});

test("lead overview separates resubmitted awaiting-information and handles empty state safely", () => {
  const resubmitted = makeCase({ id: "resub", status: "Submitted", roundId: "r-old", roundState: "awaiting-information" });
  assert.equal(classifyPipelineStage(resubmitted), "changes");
  const withResub = buildLeadOverview([resubmitted], [], now);
  assert.equal(withResub.newApplications.count, 0);
  assert.equal(withResub.decisions.resubmittedCount, 1);
  assert.equal(withResub.decisions.count, 1);

  const empty = buildLeadOverview([], [], now);
  assert.equal(empty.totalApplications, 0);
  assert.equal(empty.reviews.coveragePct, 0);
  assert.equal(empty.outcomes.approvalRatePct, 0);
  assert.equal(empty.actionQueue.length, 0);
});

test("assessor overview tracks assigned workload and completion ratio", () => {
  const cases = [
    makeCase({ id: "a1", assigned: true, canManage: false, canRelease: false, roundId: "r1", roundState: "review", conflict: "pending" }),
    makeCase({ id: "a2", assigned: true, canManage: false, canRelease: false, roundId: "r2", roundState: "review", conflict: "cleared", reviewedCount: 4 }),
    makeCase({ id: "a3", assigned: true, canManage: false, canRelease: false, roundId: "r3", roundState: "voting", conflict: "cleared", submitted: true, hasVoted: false }),
    makeCase({ id: "a4", assigned: true, canManage: false, canRelease: false, roundId: "r4", roundState: "released", conflict: "cleared", submitted: true, hasVoted: true }),
    makeCase({ id: "a5", assigned: false, canManage: false, canRelease: false, roundId: null, roundState: null }),
  ];
  const summary = buildAssessorOverview(cases, now);
  assert.equal(summary.assignedCount, 4);
  assert.equal(summary.declarationDueCount, 1);
  assert.equal(summary.toReviewCount, 1);
  assert.equal(summary.inProgressCount, 1);
  assert.equal(summary.votingDueCount, 1);
  assert.equal(summary.submittedCount, 2);
  assert.equal(summary.completionPct, 50);
  assert.equal(summary.nextActions.length, 3);
});

test("web and mobile assessor workflows enforce CSP safety, self-contained bundling, and lead-only assignment controls", () => {
  const assessorJs = readFileSync(new URL("../src/publicSite/assets/assessor.js", import.meta.url), "utf8");
  const mobileCase = readFileSync(new URL("../mobile/AssessorCaseView.tsx", import.meta.url), "utf8");
  const buildPublic = readFileSync(new URL("../scripts/buildPublic.ts", import.meta.url), "utf8");
  const previewPublic = readFileSync(new URL("../scripts/previewPublic.ts", import.meta.url), "utf8");

  assert.match(assessorJs, /from "\.\/assessmentOverview\.js"/);
  assert.match(assessorJs, /void start\(\);/);
  assert.match(assessorJs, /if \(item\.canManage[^}]*openAssignAssessorsModal/);
  assert.match(mobileCase, /canAssignPanel && <ActionButton label="Assign assessors"/);
  assert.doesNotMatch(assessorJs, /\.style\./);
  assert.doesNotMatch(assessorJs, /setAttribute\(["']style["']/);
  assert.match(buildPublic, /"assessmentOverview\.js"/);
  assert.match(buildPublic, /"assessor\.css"/);
  assert.match(buildPublic, /assessmentOverviewSource/);
  assert.doesNotMatch(buildPublic, /assessmentOverview\\\.js"\);\r?\n/);
  assert.match(previewPublic, /"assessmentOverview\.js"/);

  const distAssessor = readFileSync(new URL("../dist/assets/assessor.js", import.meta.url), "utf8");
  assert.doesNotMatch(distAssessor, /^\s*import\s+/m);
  assert.match(distAssessor, /const \{ signupConfig \} = await import\("\.\/signupConfig\.js"\);/);
  assert.match(distAssessor, /const \{ logoutSignup, verifiedAccountProfile \} = await import\("\.\/signupApi\.js"\);/);
  assert.match(distAssessor, /const \{ accountToken, clearAccountToken, saveAccountToken \} = await import\("\.\/verificationSession\.js"\);/);

  const assessorPage = readFileSync(new URL("../src/publicSite/assessor.ts", import.meta.url), "utf8");
  const assessorCss = readFileSync(new URL("../src/publicSite/assets/assessor.css", import.meta.url), "utf8");
  const mobileWorkspace = readFileSync(new URL("../mobile/AssessorWorkspace.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(assessorPage, /Panel management|Decision desk/);
  assert.doesNotMatch(mobileWorkspace, /Panel management|Decision desk/);
  assert.doesNotMatch(assessorCss, /assessor-stage-(?:blue|amber|teal)/);
  assert.match(assessorJs, /availableTabs\.push\(\["panel", "Panel"\]\)/);
  assert.match(assessorJs, /\["Reviews submitted", `\$\{reviewedCount\} of \$\{memberCount\}`\]/);
  assert.match(assessorJs, /\["Application outcome", outcomeValue\]/);
  assert.match(mobileCase, /label="Reviews submitted"/);
  assert.match(mobileCase, /label="Application outcome"/);
});

test("my assessments, application library filters, human statuses, and default deadline work for leads and assessors", () => {
  const cases = [
    makeCase({ id: "n1", status: "Submitted", roundId: null, roundState: null }),
    makeCase({ id: "s1", status: "Submitted", roundId: "r-s1", roundState: "setup", memberCount: 2 }),
    makeCase({ id: "r1", status: "In review", roundId: "r-r1", roundState: "review", assigned: true, conflict: "cleared", reviewedCount: 0, memberCount: 2, reviewCount: 0 }),
    makeCase({ id: "r2", status: "In review", roundId: "r-r2", roundState: "review", assigned: true, conflict: "cleared", reviewedCount: 5, memberCount: 2, reviewCount: 1 }),
    makeCase({ id: "v1", status: "In review", roundId: "r-v1", roundState: "voting", assigned: true, conflict: "cleared", submitted: true, memberCount: 2, reviewCount: 2 }),
    makeCase({ id: "a1", status: "Approved", roundId: "r-a1", roundState: "released", canManage: true, assigned: false }),
    makeCase({ id: "x1", status: "Rejected", roundId: "r-x1", roundState: "released", canManage: false, assigned: false }),
  ];

  assert.equal(libraryCategory(cases[0]), "new");
  assert.equal(libraryCategory(cases[1]), "new");
  assert.equal(libraryCategory(cases[2]), "review");
  assert.equal(libraryCategory(cases[5]), "approved");
  assert.equal(libraryCategory(cases[6]), "rejected");

  const libSummary = buildLibrarySummary(cases);
  assert.equal(libSummary.all, 7);
  assert.equal(libSummary.new, 2);
  assert.equal(libSummary.review, 3);
  assert.equal(libSummary.approved, 1);
  assert.equal(libSummary.rejected, 1);
  assert.equal(libSummary.assignedToMe, 3);

  const leadAssessments = buildMyAssessmentsSummary(cases, true);
  assert.equal(leadAssessments.totalCount, 7);
  assert.equal(leadAssessments.toReview.length, 3);
  assert.equal(leadAssessments.inProgress.length, 1);
  assert.equal(leadAssessments.submitted.length, 3);
  assert.equal(leadAssessments.assignedCount, 3);

  const regularAssessments = buildMyAssessmentsSummary(cases, false);
  assert.equal(regularAssessments.totalCount, 3);
  assert.equal(regularAssessments.toReview.length, 1);
  assert.equal(regularAssessments.inProgress.length, 1);
  assert.equal(regularAssessments.submitted.length, 1);
  assert.equal(assessmentBucket(cases[3], false), "in-progress");

  assert.equal(humanCaseStatus(cases[0], "library"), "New");
  assert.equal(humanCaseStatus(cases[6], "library"), "Not assigned");
  assert.equal(humanCaseStatus(cases[3], "assessments"), "In progress");
  assert.equal(humanCaseStatus(cases[4], "assessments"), "Voting open");

  const deadline = defaultAssessmentDeadline(7, now);
  assert.ok(Date.parse(deadline.iso) > now);
  assert.match(deadline.mobileInput, /^\d{4}-\d{2}-\d{2} 17:00$/);
  assert.match(deadline.webInput, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test("lead role subtitle and cross-sector panel assignment allow assigning any non-recused assessor", () => {
  assert.equal(formatAssessorRole({ lead: true, sectors: ["Creative Industries"] }), "Lead Assessor · Creative Industries");
  assert.equal(formatAssessorRole({ lead: true, sectors: [] }), "Lead Assessor");
  assert.equal(formatAssessorRole({ lead: false, sectors: ["Agriculture", "Education"] }), "Assessor · Agriculture, Education");

  const staff = [
    { id: "u1", name: "Gorata Thomas", sectors: ["sec-creative"], sectorNames: ["Creative Industries"], lead: true },
    { id: "u2", name: "Kabo Modise", sectors: [], sectorNames: [], lead: false },
    { id: "u3", name: "Tebogo Seleka", sectors: ["sec-agri"], sectorNames: ["Agriculture"], lead: false },
    { id: "u4", name: "Recused Assessor", sectors: ["sec-agri"], sectorNames: ["Agriculture"], lead: false },
  ];
  const panel = [{ id: "u4", conflict: "recused" }, { id: "u1", conflict: "pending" }];
  const candidates = eligiblePanelCandidates(staff, panel, "sec-agri");
  assert.deepEqual(candidates.map(c => c.id), ["u3", "u1", "u2"]);
  assert.equal(
    panelCandidateSubtitle(staff[2], "sec-agri", false),
    "Industry match · Strongest judgement: Agriculture"
  );
  assert.equal(
    panelCandidateSubtitle(staff[0], "sec-agri", true),
    "Selected for panel · Lead Assessor · Strongest judgement: Creative Industries"
  );
  assert.equal(
    panelCandidateSubtitle(staff[1], "sec-agri", false),
    "Available · Strongest judgement: All industries"
  );

  const assessorJs = readFileSync(new URL("../src/publicSite/assets/assessor.js", import.meta.url), "utf8");
  const mobileCase = readFileSync(new URL("../mobile/AssessorCaseView.tsx", import.meta.url), "utf8");
  const mobileWorkspace = readFileSync(new URL("../mobile/AssessorWorkspace.tsx", import.meta.url), "utf8");
  assert.match(assessorJs, /eligiblePanelCandidates\(state\.workspace\.staff,\s*members,\s*item\.sectorId\)/);
  assert.match(assessorJs, /formatAssessorRole\(profile\)/);
  assert.doesNotMatch(assessorJs, /person\.sectors\.includes\(item\.sectorId\)/);
  assert.match(mobileCase, /eligiblePanelCandidates\(staff,\s*detail\.panel,\s*item\.sectorId\)/);
  assert.doesNotMatch(mobileCase, /member\.sectors\.includes\(item\.sectorId\)\s*&&/);
  assert.match(mobileCase, /<SubscreenHero/);
  assert.match(mobileWorkspace, /formatAssessorRole\(data\?\.profile\s*\?\?\s*\{\s*lead\s*\}\)/);
  assert.match(mobileWorkspace, /<MetricTile/);
  assert.match(mobileWorkspace, /<SubscreenHero/);
  assert.match(mobileWorkspace, /<AccountSecurityCards/);
  assert.match(mobileWorkspace, /title="Filter applications"/);
});
