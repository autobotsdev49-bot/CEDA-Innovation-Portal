import { callCommitteeRpc, type Account } from "./auth.ts";

export type CommitteeSectorRow = {
  id: string;
  name: string;
  status: string;
  totalCount: number;
  submittedCount: number;
  inReviewCount: number;
  changesCount: number;
  approvedCount: number;
  awardedCount: number;
  rejectedCount: number;
};

export type CommitteeTimelineEntry = {
  applicationId: string;
  reference: string;
  title: string;
  applicant: string;
  sector: string;
  status: string;
  stage: string;
  label: string;
  detail: string;
  at: string;
};

export type CommitteeApplication = {
  id: string;
  reference: string;
  title: string;
  applicant: string;
  applicantType?: string;
  sector: string;
  sectorId?: string | null;
  status: string;
  stage: string;
  summary: string;
  innovationStage?: string | null;
  district?: string | null;
  botswanaBenefit?: string | null;
  submittedDate?: string | null;
  updatedAt: string;
  awardedAt?: string | null;
  roundState?: string | null;
  outcomeData?: Record<string, unknown> | null;
  awardData?: Record<string, unknown> | null;
  timeline?: Array<{ label: string; detail: string; at: string }>;
  documentCount?: number;
  readOnly: true;
};

export type CommitteeWorkspaceData = {
  profile: {
    id: string;
    name: string;
    role: "committee";
    readOnly: true;
    sectors: string[];
    sectorNames: string[];
  };
  pipeline: {
    total: number;
    submitted: number;
    inReview: number;
    changesRequested: number;
    approved: number;
    awarded: number;
    rejected: number;
    withdrawn: number;
  };
  sectors: CommitteeSectorRow[];
  applications: CommitteeApplication[];
  timelineEvents: CommitteeTimelineEntry[];
};

export type CommitteeCaseDetail = {
  case: CommitteeApplication;
  roundOverview: {
    roundState: string;
    held: boolean;
    createdAt: string;
    reviewCount: number;
    memberCount: number;
  } | null;
  outcomeData: Record<string, unknown>;
  awardData: Record<string, unknown>;
  timeline: Array<{ label: string; detail: string; at: string }>;
  documents: Array<{
    id: string;
    sectionKey: string;
    docKind: string;
    title: string;
    category: string;
    videoUrl?: string | null;
    createdAt: string;
  }>;
};

export function getCommitteeWorkspace(account: Account): Promise<CommitteeWorkspaceData> {
  return callCommitteeRpc<CommitteeWorkspaceData>(account, "committee_workspace");
}

export function getCommitteeCase(account: Account, caseId: string): Promise<CommitteeCaseDetail> {
  return callCommitteeRpc<CommitteeCaseDetail>(account, "committee_case", { p_case_id: caseId });
}
