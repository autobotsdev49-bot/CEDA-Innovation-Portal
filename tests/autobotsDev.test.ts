import assert from "node:assert/strict";
import { test } from "node:test";
import { assessmentCriteria, pinRound, prepareRelease, submitReview, tallyRecommendation } from "../src/features/assessment/round.ts";
import { resolveGuidance } from "../src/features/support/approvedGuidance.ts";
import { assignEvidenceGuidance, summarizeEvidenceGuidance } from "../src/features/experiments/evidenceGuidance.ts";
import type { RoundInput } from "../src/features/assessment/round.ts";
import type { GuidanceRevision } from "../src/features/support/approvedGuidance.ts";

const assessors = ["a", "b", "c", "d", "e"];
const input: RoundInput = {
  id: "round-1",
  submissionVersionId: "submission-v1",
  rubricVersionId: "rubric-v1",
  policyVersionId: "policy-v1",
  primarySectorId: "agriculture",
  evidenceVersionIds: ["evidence-v1"],
  assignments: [
    ...assessors.map((assessorId) => ({ assessorId, conflict: "cleared" as const })),
    { assessorId: "recused", conflict: "recused" },
    { assessorId: "pending", conflict: "pending" },
  ],
  quorum: 3,
};
const round = pinRound(input);
const scores = assessmentCriteria.map((criterion) => ({ criterion, rating: 4, rationale: "Synthetic assessment note" }));
const reviewFor = (assessorId: string) => ({ assessorId, scores, evidenceVersionIds: ["evidence-v1"] });
const reviews = assessors.map((assessorId) => submitReview(round, reviewFor(assessorId)));
const majority = assessors.map((assessorId, index) => ({ assessorId, choice: index < 3 ? "approve" as const : "decline" as const }));
const command = {
  actor: { id: "manager", authorizedSectorIds: ["agriculture"], hasReleasePermission: true, hasFreshMfa: true },
  votingClosed: true,
  holdActive: false,
  outcome: "approve" as const,
  publicFeedback: "  Your outcome is ready.  ",
};

test("pins evidence and eligible panel separately from caller-owned input", () => {
  const evidence = ["original"];
  const pinned = pinRound({ ...input, evidenceVersionIds: evidence });
  evidence.push("later");
  assert.deepEqual(pinned.evidenceVersionIds, ["original"]);
  assert.equal(pinned.eligibleAssessorIds.length, 5);
  assert.ok(Object.isFrozen(pinned.evidenceVersionIds));
  assert.throws(() => pinRound({ ...input, quorum: 6 }), /Quorum/);
  assert.throws(() => pinRound({ ...input, assignments: [...input.assignments, input.assignments[0]] }), /distinct assessor/);
});

test("blocks an unassigned, pending, or recused reviewer", () => {
  for (const assessorId of ["other", "pending", "recused"]) {
    assert.throws(() => submitReview(round, reviewFor(assessorId)), /cleared assignment/);
  }
});

test("requires exactly six valid scores with rationales and pinned evidence", () => {
  const review = reviewFor("a");
  for (const badScores of [
    scores.slice(1),
    scores.map((score) => ({ ...score, rating: 6 })),
    scores.map((score) => ({ ...score, rating: 3.5 })),
    scores.map((score) => ({ ...score, rationale: " " })),
    [...scores.slice(1), scores[1]],
  ]) {
    assert.throws(() => submitReview(round, { ...review, scores: badScores }));
  }
  assert.throws(() => submitReview(round, { ...review, evidenceVersionIds: ["later-evidence"] }), /outside/);
  const submitted = submitReview(round, review);
  assert.ok(Object.isFrozen(submitted.scores[0]));
  assert.equal(submitted.roundId, round.id);
});

test("requires quorum and a strict majority, including the 2–2–1 case", () => {
  assert.equal(tallyRecommendation(round, reviews, majority.slice(0, 2)).recommendation, null);
  assert.equal(tallyRecommendation(round, reviews, majority).recommendation, "approve");
  const split = majority.map((ballot, i) => i === 2 ? { ...ballot, choice: "request-information" as const } : ballot);
  assert.equal(tallyRecommendation(round, reviews, split).recommendation, null);
  assert.throws(() => prepareRelease(round, reviews, split, command), /matching majority/);
});

test("rejects duplicate, cross-round, and unreviewed votes or reviews", () => {
  assert.throws(() => tallyRecommendation(round, reviews, [...majority, majority[0]]));
  assert.throws(() => tallyRecommendation(round, reviews.slice(1), majority));
  assert.throws(() => tallyRecommendation(round, [...reviews, reviews[0]], majority));
  assert.throws(() => tallyRecommendation(round, [{ ...reviews[0], roundId: "wrong" }], []));
});

test("blocks release for wrong sector, another role, stale MFA, own round, open vote or hold", () => {
  for (const actor of [
    { ...command.actor, authorizedSectorIds: ["ict"] },
    { ...command.actor, hasReleasePermission: false },
    { ...command.actor, hasFreshMfa: false },
    { ...command.actor, id: "a" },
  ]) {
    assert.throws(() => prepareRelease(round, reviews, majority, { ...command, actor }), /independent manager/);
  }
  assert.throws(() => prepareRelease(round, reviews, majority, { ...command, votingClosed: false }), /blocked/);
  assert.throws(() => prepareRelease(round, reviews, majority, { ...command, holdActive: true }), /blocked/);
  assert.throws(() => prepareRelease(round, reviews, majority, { ...command, outcome: "decline" }), /matching majority/);
});

test("keeps decision audit references out of the applicant feedback projection", () => {
  const result = prepareRelease(round, reviews, majority, command);
  assert.deepEqual(result.applicant, { outcome: "approve", feedback: "Your outcome is ready." });
  assert.equal(result.audit.submissionVersionId, "submission-v1");
  assert.equal(result.audit.rubricVersionId, "rubric-v1");
  assert.equal(result.audit.policyVersionId, "policy-v1");
  assert.deepEqual(result.audit.evidenceVersionIds, ["evidence-v1"]);
  assert.ok(!Object.hasOwn(result.audit, "publicFeedback"));
});

const general: GuidanceRevision = {
  articleId: "general-evidence", version: 1, topic: "evidence", sectorId: null,
  status: "published", audience: "public", approvedBy: "knowledge-editor", answer: "General synthetic answer",
};
const sector: GuidanceRevision = {
  ...general, articleId: "sector-evidence", sectorId: "agriculture", answer: "Sector synthetic answer",
};
const query = { topic: "evidence", sectorId: "agriculture" };

test("published sector guidance wins, drafts stay private, and retirement removes that article", () => {
  const draft = { ...sector, version: 2, status: "draft" as const, answer: "Private draft" };
  assert.deepEqual(resolveGuidance([draft, sector, general], query), {
    kind: "approved-answer", articleId: sector.articleId, version: 1, answer: sector.answer,
  });
  const retired = { ...sector, version: 3, status: "retired" as const };
  const result = resolveGuidance([retired, sector, general], query);
  assert.equal(result.kind === "approved-answer" && result.articleId, general.articleId);
});

test("offers human handoff when guidance is absent, ambiguous, internal, or lacks approval", () => {
  const unpublishedCases: GuidanceRevision[][] = [
    [],
    [general, { ...general, articleId: "ambiguous" }],
    [{ ...general, audience: "staff" }],
    [{ ...general, approvedBy: null }],
  ];
  for (const catalogue of unpublishedCases) {
    assert.deepEqual(resolveGuidance(catalogue, query), { kind: "human-handoff-offered" });
  }
});

test("A/B eligibility defaults to control and excludes malformed or disabled assignments", () => {
  for (const input of [
    { experimentEnabled: false, anonymousAssignmentKey: "a".repeat(32) },
    { experimentEnabled: true },
    { experimentEnabled: true, anonymousAssignmentKey: "not-an-opaque-key" },
  ]) {
    const result = assignEvidenceGuidance(input);
    assert.equal(result.variant, "A");
    assert.equal(result.enrolled, false);
  }
});

test("A/B allocation is stable and exercises both variants under synthetic traffic", () => {
  const counts = { A: 0, B: 0 };
  for (let index = 0; index < 1000; index++) {
    const key = index.toString(16).padStart(32, "0");
    const result = assignEvidenceGuidance({ experimentEnabled: true, anonymousAssignmentKey: key });
    assert.deepEqual(result, assignEvidenceGuidance({ experimentEnabled: true, anonymousAssignmentKey: key.toUpperCase() }));
    assert.equal(result.enrolled, true);
    counts[result.variant]++;
  }
  assert.ok(counts.A >= 400 && counts.A <= 600, JSON.stringify(counts));
  assert.equal(counts.A + counts.B, 1000);
});
test("A/B reports count only exposed, correctly assigned trials and deduplicate results", () => {
  const assignmentKey = "b".repeat(32);
  const { variant } = assignEvidenceGuidance({ experimentEnabled: true, anonymousAssignmentKey: assignmentKey });
  const wrong = variant === "A" ? "B" : "A";
  const subject = { assignmentKey, variant };
  const report = summarizeEvidenceGuidance([
    { ...subject, kind: "requested-help" },
    { ...subject, variant: wrong, kind: "exposure" },
    { ...subject, kind: "exposure" },
    { ...subject, kind: "exposure" },
    { ...subject, kind: "correct-response" },
    { ...subject, kind: "correct-response" },
  ]);
  assert.deepEqual(report[variant], { exposed: 1, correct: 1, requestedHelp: 0 });
  assert.deepEqual(report[wrong], { exposed: 0, correct: 0, requestedHelp: 0 });
});