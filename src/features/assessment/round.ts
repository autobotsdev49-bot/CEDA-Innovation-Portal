export const assessmentCriteria = Object.freeze([
  "strategic-alignment",
  "innovation-and-originality",
  "impact-potential",
  "feasibility-and-viability",
  "scalability-and-sustainability",
  "implementation-capacity-team-capability-and-governance",
] as const);

export type RubricCriterion = {
  key: string;
  label?: string;
  weight: number;
};

export const defaultRubricCriteria: readonly RubricCriterion[] = Object.freeze([
  Object.freeze({ key: "strategic-alignment", label: "Strategic alignment", weight: 20 }),
  Object.freeze({ key: "innovation-and-originality", label: "Innovation and originality", weight: 20 }),
  Object.freeze({ key: "impact-potential", label: "Impact potential", weight: 20 }),
  Object.freeze({ key: "feasibility-and-viability", label: "Feasibility and viability", weight: 15 }),
  Object.freeze({ key: "scalability-and-sustainability", label: "Scalability and sustainability", weight: 15 }),
  Object.freeze({ key: "implementation-capacity-team-capability-and-governance", label: "Implementation capacity, team capability and governance", weight: 10 }),
]);

type Criterion = (typeof assessmentCriteria)[number];
type Recommendation = "approve" | "decline" | "request-information";

export type RoundInput = {
  id: string;
  submissionVersionId: string;
  rubricVersionId: string;
  policyVersionId: string;
  primarySectorId: string;
  evidenceVersionIds: readonly string[];
  assignments: readonly { assessorId: string; conflict: "cleared" | "pending" | "recused" }[];
  quorum: number;
  rubric?: readonly RubricCriterion[];
  passThreshold?: number;
};

type Score = { criterion: Criterion | string; rating: number; rationale: string };
type Review = {
  assessorId: string;
  scores: readonly Score[];
  evidenceVersionIds: readonly string[];
};
type Ballot = { assessorId: string; choice: Recommendation };

function resolveRoundRubric(rubric?: readonly RubricCriterion[]) {
  const source = rubric?.length ? rubric : defaultRubricCriteria;
  const seen = new Set<string>();
  let totalWeight = 0;
  const frozen = source.map((entry) => {
    const key = entry.key.trim();
    if (!key || seen.has(key)) throw new Error("Rubric criteria keys must be distinct and present");
    if (!Number.isFinite(entry.weight) || entry.weight <= 0 || entry.weight > 100) {
      throw new Error("Each rubric criterion requires a positive percentage weight");
    }
    seen.add(key);
    totalWeight += Math.round(entry.weight * 100);
    return Object.freeze({ key, label: entry.label?.trim() || key, weight: Math.round(entry.weight * 100) / 100 });
  });
  if (totalWeight !== 10000) throw new Error("Rubric criterion weights must total 100%");
  return Object.freeze(frozen);
}

export function computeWeightedScore(
  scores: readonly Score[],
  rubric: readonly RubricCriterion[] = defaultRubricCriteria,
  passThreshold = 60,
) {
  const weights = new Map(rubric.map((entry) => [entry.key, entry.weight]));
  let totalWeight = 0;
  let weightedSum = 0;
  let unweightedSum = 0;
  let count = 0;
  for (const score of scores) {
    const weight = weights.get(score.criterion) ?? 0;
    if (weight <= 0) continue;
    totalWeight += weight;
    weightedSum += score.rating * weight;
    unweightedSum += score.rating;
    count += 1;
  }
  const weightedScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : null;
  const weightedTotal = weightedScore !== null ? Math.round(weightedScore * 20 * 10) / 10 : null;
  const unweightedMean = count > 0 ? Math.round((unweightedSum / count) * 100) / 100 : null;
  return {
    weightedScore,
    weightedTotal,
    unweightedMean,
    meetsThreshold: weightedTotal !== null ? weightedTotal >= passThreshold : null,
  };
}

export function pinRound(input: RoundInput) {
  const { id, submissionVersionId, rubricVersionId, policyVersionId, primarySectorId } = input;
  if ([id, submissionVersionId, rubricVersionId, policyVersionId, primarySectorId].some((value) => !value.trim())) {
    throw new Error("Round references must be present");
  }
  const passThreshold = input.passThreshold ?? 60;
  if (!Number.isFinite(passThreshold) || passThreshold < 20 || passThreshold > 100) {
    throw new Error("Pass threshold must be between 20% and 100%");
  }
  const rubric = resolveRoundRubric(input.rubric);
  const assessorIds = new Set(input.assignments.map(({ assessorId }) => assessorId));
  if (assessorIds.size !== input.assignments.length || [...assessorIds].some((value) => !value.trim())) {
    throw new Error("Round assignments must contain distinct assessor IDs");
  }
  const eligible = input.assignments.filter(({ conflict }) => conflict === "cleared").map(({ assessorId }) => assessorId);
  if (!Number.isInteger(input.quorum) || input.quorum < 1 || input.quorum > eligible.length) {
    throw new Error("Quorum must fit the cleared panel");
  }
  const evidenceVersionIds = [...new Set(input.evidenceVersionIds)];
  if (evidenceVersionIds.length !== input.evidenceVersionIds.length || evidenceVersionIds.some((value) => !value.trim())) {
    throw new Error("Evidence references must be distinct and present");
  }
  return Object.freeze({
    id, submissionVersionId, rubricVersionId, policyVersionId, primarySectorId, quorum: input.quorum,
    passThreshold,
    rubric,
    evidenceVersionIds: Object.freeze(evidenceVersionIds),
    eligibleAssessorIds: Object.freeze(eligible),
  });
}

type PinnedRound = ReturnType<typeof pinRound>;

export function submitReview(round: PinnedRound, review: Review) {
  if (!round.eligibleAssessorIds.includes(review.assessorId)) {
    throw new Error("Review requires a cleared assignment");
  }
  const expected = new Set<string>(round.rubric.map((entry) => entry.key));
  for (const score of review.scores) {
    if (!expected.delete(score.criterion) || !Number.isInteger(score.rating) ||
        score.rating < 1 || score.rating > 5 || !score.rationale.trim()) {
      throw new Error("Each required criterion needs a single rating from 1 to 5 and a rationale");
    }
  }
  if (expected.size) throw new Error("The review is missing criteria");
  if (review.evidenceVersionIds.some((id) => !round.evidenceVersionIds.includes(id))) {
    throw new Error("Review cites evidence outside the pinned submission");
  }
  const metrics = computeWeightedScore(review.scores, round.rubric, round.passThreshold);
  return Object.freeze({
    roundId: round.id,
    assessorId: review.assessorId,
    scores: Object.freeze(review.scores.map((score) => Object.freeze({ ...score }))),
    evidenceVersionIds: Object.freeze([...new Set(review.evidenceVersionIds)]),
    weightedScore: metrics.weightedScore,
    weightedTotal: metrics.weightedTotal,
    unweightedMean: metrics.unweightedMean,
    meetsThreshold: metrics.meetsThreshold,
  });
}

type SubmittedReview = ReturnType<typeof submitReview>;

export function tallyRecommendation(round: PinnedRound, reviews: readonly SubmittedReview[], ballots: readonly Ballot[]) {
  const submitted = new Set<string>();
  for (const review of reviews) {
    if (review.roundId !== round.id || !round.eligibleAssessorIds.includes(review.assessorId) ||
        submitted.has(review.assessorId)) {
      throw new Error("Submitted reviews must be unique and belong to this cleared panel");
    }
    submitted.add(review.assessorId);
  }

  const totals: Record<Recommendation, number> = {
    approve: 0,
    decline: 0,
    "request-information": 0,
  };
  const voters = new Set<string>();
  for (const ballot of ballots) {
    if (!submitted.has(ballot.assessorId) || voters.has(ballot.assessorId) ||
        !Object.hasOwn(totals, ballot.choice)) {
      throw new Error("Ballots must be unique, valid, and backed by a submitted panel review");
    }
    voters.add(ballot.assessorId);
    totals[ballot.choice] += 1;
  }
  const winner = (Object.keys(totals) as Recommendation[]).find(
    (choice) => totals[choice] > ballots.length / 2,
  );
  return {
    recommendation: voters.size >= round.quorum ? winner ?? null : null,
    validBallots: voters.size,
    totals,
  };
}

export function prepareRelease(round: PinnedRound, reviews: readonly SubmittedReview[], ballots: readonly Ballot[], command: {
  actor: { id: string; authorizedSectorIds: readonly string[]; hasReleasePermission: boolean; hasFreshMfa: boolean };
  votingClosed: boolean;
  holdActive: boolean;
  outcome: "approve" | "decline";
  publicFeedback: string;
}) {
  const { actor } = command;
  if (!actor.id.trim() || !actor.hasReleasePermission || !actor.hasFreshMfa ||
      !actor.authorizedSectorIds.includes(round.primarySectorId) || round.eligibleAssessorIds.includes(actor.id)) {
    throw new Error("Release requires an independent manager with verified authority in this sector");
  }
  if (!command.votingClosed || command.holdActive) throw new Error("The round is blocked for release");
  if (command.outcome !== "approve" && command.outcome !== "decline") {
    throw new Error("Only terminal decisions can be released");
  }
  if (tallyRecommendation(round, reviews, ballots).recommendation !== command.outcome ||
      !command.publicFeedback.trim()) {
    throw new Error("A matching majority and applicant-facing feedback are required");
  }

  // Keep internal decision evidence separate from the applicant response.
  return {
    audit: {
      action: "assessment.decision_release_prepared",
      actorId: actor.id,
      roundId: round.id,
      submissionVersionId: round.submissionVersionId,
      rubricVersionId: round.rubricVersionId,
      policyVersionId: round.policyVersionId,
      evidenceVersionIds: round.evidenceVersionIds,
      outcome: command.outcome,
    },
    applicant: { outcome: command.outcome, feedback: command.publicFeedback.trim() },
  };
}

export function prepareAward(round: PinnedRound, command: {
  actor: { id: string; authorizedSectorIds: readonly string[]; hasReleasePermission: boolean; hasFreshMfa: boolean };
  roundReleased: boolean;
  approvedOutcome: boolean;
  holdActive: boolean;
  awardTitle: string;
  awardCategory?: string;
  awardSummary?: string;
}) {
  const { actor } = command;
  if (!actor.id.trim() || !actor.hasReleasePermission || !actor.hasFreshMfa ||
      !actor.authorizedSectorIds.includes(round.primarySectorId) || round.eligibleAssessorIds.includes(actor.id)) {
    throw new Error("Award conferral requires an independent manager with verified authority in this sector");
  }
  if (!command.roundReleased || !command.approvedOutcome || command.holdActive) {
    throw new Error("Only released Approved rounds can advance to the Award stage");
  }
  if (!command.awardTitle.trim()) {
    throw new Error("An award title is required");
  }
  return {
    audit: {
      action: "assessment.award_prepared",
      actorId: actor.id,
      roundId: round.id,
      awardTitle: command.awardTitle.trim(),
      awardCategory: (command.awardCategory || "Innovation Recognition & Support").trim(),
    },
    applicant: {
      status: "Awarded" as const,
      awardTitle: command.awardTitle.trim(),
      awardCategory: (command.awardCategory || "Innovation Recognition & Support").trim(),
      awardSummary: (command.awardSummary || "Official CEDA Innovation Award conferred.").trim(),
    },
  };
}