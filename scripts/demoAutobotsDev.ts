import { assessmentCriteria, pinRound, prepareRelease, submitReview, tallyRecommendation } from "../src/features/assessment/round.ts";
import { assignEvidenceGuidance } from "../src/features/experiments/evidenceGuidance.ts";
import { resolveGuidance } from "../src/features/support/approvedGuidance.ts";

const assessorIds = ["demo-reviewer-1", "demo-reviewer-2", "demo-reviewer-3", "demo-reviewer-4", "demo-reviewer-5"];
const round = pinRound({
  id: "demo-round-1",
  submissionVersionId: "demo-submission-v1",
  evidenceVersionIds: ["demo-evidence-v1"],
  rubricVersionId: "demo-rubric-v1",
  policyVersionId: "demo-policy-v1",
  primarySectorId: "agriculture",
  assignments: assessorIds.map((assessorId) => ({ assessorId, conflict: "cleared" })),
  quorum: 3,
});
const reviews = assessorIds.map((assessorId) => submitReview(round, {
  assessorId,
  evidenceVersionIds: round.evidenceVersionIds,
  scores: assessmentCriteria.map((criterion) => ({ criterion, rating: 4, rationale: "Synthetic walkthrough rationale" })),
}));
const split = assessorIds.map((assessorId, i) => ({
  assessorId,
  choice: i < 2 ? "approve" as const : i < 4 ? "decline" as const : "request-information" as const,
}));
const majority = split.map((ballot, index) => index === 4 ? { ...ballot, choice: "approve" as const } : ballot);
const prepared = prepareRelease(round, reviews, majority, {
  actor: { id: "demo-manager", authorizedSectorIds: ["agriculture"], hasReleasePermission: true, hasFreshMfa: true },
  votingClosed: true,
  holdActive: false,
  outcome: "approve",
  publicFeedback: "Your synthetic submission was approved.",
});
const guidance = resolveGuidance([{
  articleId: "demo-evidence-guidance", version: 1, topic: "evidence", sectorId: "agriculture",
  status: "published", audience: "public", approvedBy: "demo-editor",
  answer: "For this synthetic example, include a photo showing what your prototype does.",
}], { topic: "evidence", sectorId: "agriculture" });

const allocation = { A: 0, B: 0 };
for (let i = 0; i < 1000; i++) {
  const { variant } = assignEvidenceGuidance({
    experimentEnabled: true,
    anonymousAssignmentKey: i.toString(16).padStart(32, "0"),
  });
  allocation[variant]++;
}

console.log(JSON.stringify({
  mode: "synthetic walkthrough",
  assistant: "Optimus Prime",
  guidance,
  unansweredQuestion: resolveGuidance([], { topic: "evidence" }),
  splitVote: tallyRecommendation(round, reviews, split),
  preparedDecision: prepared,
  experimentAllocationSmokeCheck: allocation,
}, null, 2));