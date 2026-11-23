import { callAssessorRpc, type Account } from "./auth.ts";
import { kickFcmDispatch } from "./notificationsApi.ts";
export const rubric = {
  "strategic-alignment": "Strategic alignment",
  "innovation-and-originality": "Innovation and originality",
  "impact-potential": "Impact potential",
  "feasibility-and-viability": "Feasibility and viability",
  "scalability-and-sustainability": "Scalability and sustainability",
  "implementation-capacity-team-capability-and-governance": "Implementation capacity, team capability and governance",
} as const;
export type Criterion = keyof typeof rubric;
export const criteria = Object.keys(rubric) as Criterion[];

export type RubricCriterion = {
  id?: string;
  key: string;
  label: string;
  description?: string;
  weight: number;
  sortOrder?: number;
  active?: boolean;
};
export type RubricInfo = {
  version: number;
  passThreshold: number;
  reason?: string;
  updatedAt?: string;
  criteria: RubricCriterion[];
};
export type WeightedScoreSummary = {
  totalCriteria: number;
  scoredCount: number;
  scoredWeight: number;
  totalWeight: number;
  weightedScore: number | null;
  weightedTotal: number | null;
  unweightedMean: number | null;
};
export type CriterionBreakdown = {
  criterion: string;
  label: string;
  weight: number;
  avgRating: number | null;
  weightedContribution: number | null;
  count: number;
};

export type Score = { criterion: string; rating: number | null; rationale: string };
export type RoundState = "setup" | "review" | "voting" | "closed" | "awaiting-information" | "released" | "awarded" | "archived";
export type Conflict = "pending" | "cleared" | "recused";
export type Choice = "approve" | "decline" | "request-information";
export const ballotLabels: Readonly<Record<Choice, string>> = { approve: "Approve", decline: "Reject", "request-information": "Request information" };

export type AssessorCase = {
  id: string;
  reference: string;
  title: string;
  sector: string;
  sectorId: string | null;
  status: string;
  assigned: boolean;
  canManage: boolean;
  canRelease: boolean;
  roundId: string | null;
  roundState: RoundState | null;
  deadline: string | null;
  conflict: Conflict | null;
  submitted: boolean;
  hasVoted: boolean;
  hasHistory: boolean;
  hold: boolean;
  memberCount: number;
  reviewCount: number;
  reviewedCount?: number;
  unreadCount?: number;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  awardData?: Record<string, unknown> | null;
  awardedAt?: string | null;
};

export type AssessorStaff = { id: string; name: string; sectors: string[]; sectorNames?: string[]; lead?: boolean };
export type AssessorData = { profile: { name: string; lead: boolean; sectors?: string[] }; rubric?: RubricInfo; cases: AssessorCase[]; staff: AssessorStaff[] };
export type AssessmentAnnotation = { id: string; anchor: string; parentId: string | null; name: string; body: string; at: string };
export type CaseDetail = {
  case: AssessorCase;
  rubricVersion?: number;
  passThreshold?: number;
  rubric?: RubricCriterion[];
  application: { summary: string | null; formData: Record<string, unknown> } | null;
  documents: { id: string; title: string; storagePath: string | null; videoUrl: string | null; sectionKey?: string; category?: string; docKind?: string }[];
  scores: Score[];
  myScoreSummary?: WeightedScoreSummary | null;
  panel: {
    id: string;
    name: string;
    conflict: Conflict;
    submitted: boolean;
    scores: Score[] | null;
    weightedScore?: number | null;
    weightedTotal?: number | null;
    unweightedMean?: number | null;
  }[];
  discussion: { name: string; body: string; at: string; mine?: boolean }[];
  reviewedSteps?: number[];
  annotations?: AssessmentAnnotation[];
  overallComment?: string;
  draftChoice?: Choice | null;
  scoreStats?: {
    count: number;
    mean: number | null;
    median: number | null;
    weightedTotalMean?: number | null;
    weightedTotalMedian?: number | null;
    unweightedMean?: number | null;
    passThreshold?: number | null;
    meetsThreshold?: boolean | null;
    criterionBreakdown?: CriterionBreakdown[];
  };
  ballot: Choice | null;
  history: {
    id: string;
    date: string;
    rubricVersion?: number;
    passThreshold?: number;
    rubric?: RubricCriterion[];
    weightedScore?: number | null;
    weightedTotal?: number | null;
    recommendation: Choice | null;
    scores: Score[];
  }[];
  decision: { quorum: number; validBallots?: number; eligibleReviewers?: number; recommendation?: Choice | null; totals?: Record<Choice, number>; feedback: string | null; hold: boolean } | null;
};

export type Action =
  | { name: "declare"; data: { conflict: Exclude<Conflict, "pending">; reason: string } }
  | { name: "save" | "submit"; data: { scores: Score[]; choice?: Choice | ""; overallComment?: string } }
  | { name: "review-step"; data: { step: number } }
  | { name: "annotate"; data: { anchor: string; parentId: string | null; body: string } }
  | { name: "read-discussion" }
  | { name: "comment"; data: { body: string } }
  | { name: "configure"; data: { members: string[]; deadline: string; quorum: number } }
  | { name: "vote"; data: { choice: Choice } }
  | { name: "decision"; data: { feedback: string } }
  | { name: "hold" | "resume" | "reassess"; data: { reason: string } }
  | { name: "request-information"; data: { feedback: string; deadline: string } }
  | { name: "open-vote"; data: { deadline?: string } }
  | { name: "award"; data: { awardTitle?: string; awardCategory?: string; awardAmount?: string; awardSummary?: string } }
  | { name: "start" | "close-vote" | "release" };

export function getAssessorWorkspace(account: Account) {
  return callAssessorRpc<AssessorData>(account, "assessor_workspace");
}

export function getAssessorCase(account: Account, id: string) {
  return callAssessorRpc<CaseDetail>(account, "assessor_case", { p_case_id: id });
}

export async function runAssessorAction(account: Account, item: AssessorCase, action: Action) {
  const result = await callAssessorRpc<CaseDetail>(account, "assessor_action", {
    p_case_id: item.id,
    p_round_id: item.roundId,
    p_action: action.name,
    p_data: "data" in action ? action.data : {},
  });
  kickFcmDispatch(account.token, { limit: 10 });
  return result;
}

const gaboroneDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Gaborone" });

export function assessmentDate(value: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : gaboroneDate.format(date);
}

export function deadlineIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const date = new Date(value.replace(" ", "T") + ":00+02:00");
  if (Number.isNaN(date.valueOf())) return null;
  const local = new Date(date.valueOf() + 2 * 3600000).toISOString().slice(0, 16).replace("T", " ");
  return local === value ? date.toISOString() : null;
}

export function deadlineInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return new Date(date.valueOf() + 2 * 3600000).toISOString().slice(0, 16).replace("T", " ");
}

export function roundLabel(item: AssessorCase) {
  if (item.roundState === "awaiting-information") return "Awaiting information";
  if (item.roundState === "setup") return "Panel setup";
  if (item.roundState === "review") return "In review";
  if (item.roundState === "voting") return "Voting open";
  if (item.roundState === "closed") return "Voting closed";
  if (item.roundState === "released") return "Outcome released";
  if (item.roundState === "awarded") return "Award conferred";
  if (item.roundState === "archived") return "Archived";
  return item.status;
}
