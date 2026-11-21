export const BOTSWANA_DISTRICTS = [
  "Gaborone",
  "Francistown",
  "Lobatse",
  "Selebi-Phikwe",
  "Jwaneng",
  "Sowa Town",
  "South-East",
  "Kweneng",
  "Kgatleng",
  "Southern",
  "Central",
  "North-East",
  "Ngamiland",
  "Chobe",
  "Ghanzi",
  "Kgalagadi",
] as const;

export const INNOVATION_STAGES = [
  "Idea",
  "R&D",
  "Prototype",
  "Pilot",
  "Operational",
  "Scaling",
] as const;

export type InnovationStage = (typeof INNOVATION_STAGES)[number];

export interface StageConfig {
  badge: string;
  summary: string;
  evidenceHint: string;
  metricsLabel: string;
  metricsPlaceholder: string;
  milestoneHint: string;
}

export const STAGE_MATRIX: Record<InnovationStage, StageConfig> = {
  Idea: {
    badge: "Early concept",
    summary: "Early concept exploring a verified Botswana problem before a working model is built.",
    evidenceHint: "Concept sketch, problem research notes, or community validation interviews.",
    metricsLabel: "Early validation signals and learning goals",
    metricsPlaceholder: "Describe interviews, desktop research, or initial assumptions you plan to test first.",
    milestoneHint: "Moving from concept design into an initial proof-of-concept or laboratory test.",
  },
  "R&D": {
    badge: "Research & testing",
    summary: "Structured technical research, formulation, software architecture, or lab testing.",
    evidenceHint: "Technical specifications, bench test summaries, or research collaborator letters.",
    metricsLabel: "Research findings, test parameters, and technical feasibility checks",
    metricsPlaceholder: "Summarise technical trials, design parameters, or intellectual property foundations.",
    milestoneHint: "Completing laboratory or component verification toward an integrated prototype.",
  },
  Prototype: {
    badge: "Working model",
    summary: "A working early version tested internally or with initial sample users.",
    evidenceHint: "Prototype photos, system walkthrough screenshots, or an HTTPS demo video link.",
    metricsLabel: "Prototype performance and usability feedback",
    metricsPlaceholder: "Share how the working model performed during internal or early user testing.",
    milestoneHint: "Refining reliability, cost, and safety readiness for a structured pilot.",
  },
  Pilot: {
    badge: "Field validation",
    summary: "Live field deployment with real trial customers, partners, or a defined community.",
    evidenceHint: "Pilot deployment report, partner letter of intent, or anonymised user feedback.",
    metricsLabel: "Pilot traction, active trial users, and operational lessons",
    metricsPlaceholder: "Detail pilot site outcomes, adoption rate, turnaround improvements, and key fixes made.",
    milestoneHint: "Closing pilot gaps, regulatory approvals, and commercial unit economics.",
  },
  Operational: {
    badge: "Active delivery",
    summary: "Actively serving customers or stakeholders in production with repeatable delivery.",
    evidenceHint: "Customer traction overview, unit cost breakdown, or quality/compliance certificates.",
    metricsLabel: "Current customer base, delivery capacity, and recurring demand",
    metricsPlaceholder: "Provide current monthly users, service throughput, pricing validation, and unit sustainability.",
    milestoneHint: "Expanding production reliability and regional distribution across Botswana.",
  },
  Scaling: {
    badge: "Regional / national growth",
    summary: "Proven model ready to expand across districts, sectors, or regional export markets.",
    evidenceHint: "Expansion plan, multi-site traction summary, audited/management financials, or offtake agreements.",
    metricsLabel: "Growth bottlenecks solved and regional scaling readiness",
    metricsPlaceholder: "Explain current revenue/impact trajectory, supply chain capacity, and scaling milestones.",
    milestoneHint: "Reaching national coverage or cross-border SADC competitiveness.",
  },
};

export const INNOVATION_TYPES = [
  "Digital platform / software",
  "Hardware / IoT device",
  "Agri-tech / food process",
  "Clean energy / climate solution",
  "Manufacturing / industrial process",
  "Service delivery model",
  "Health / biotech product",
  "Financial / inclusion tool",
] as const;

export const BENEFICIARY_GROUPS = [
  "Youth",
  "Older persons",
  "Women entrepreneurs",
  "Smallholder farmers",
  "MSMEs and informal traders",
  "Rural or underserved communities",
  "Students and educators",
  "Public service delivery",
  "Regional export value chains",
] as const;

export const VERIFICATION_DOCUMENT_CATEGORIES = [
  "Certified identity copy",
  "Identity back",
  "Proof of residence",
  "Company registration certificate",
  "Director or shareholder records",
  "Tax clearance certificate",
] as const;

export const INLINE_EVIDENCE_FIELDS: Record<string, EvidenceSectionKey> = {
  problem: "problem",
  problemUrgency: "problem",
  solution: "problem",
  alternativesDetail: "problem",
  botswanaBenefit: "impact",
  marketDemand: "impact",
  jobsAssumptions: "impact",
  stageEvidenceNotes: "feasibility",
  stageMilestoneNext: "feasibility",
  implementationApproach: "feasibility",
  risksAndMitigations: "feasibility",
  financialAssumptions: "supplementary",
  supportRequestedSummary: "supplementary",
};

export const EVIDENCE_SECTION_CATEGORIES = [
  { key: "applicant", label: "Applicant & company records" },
  { key: "problem", label: "Problem & solution research" },
  { key: "impact", label: "Market & socio-economic impact" },
  { key: "feasibility", label: "Prototype & technical feasibility" },
  { key: "supplementary", label: "Financial & supplementary evidence" },
  { key: "clarification", label: "Clarification response" },
] as const;

export type EvidenceSectionKey = (typeof EVIDENCE_SECTION_CATEGORIES)[number]["key"];

export const EVIDENCE_RULES = {
  maxFilesPerSection: 4,
  sectionFileLimits: { applicant: 12, supplementary: 8 } as Record<string, number>,
  maxBytes: 10 * 1024 * 1024,
  acceptedExtensions: [".pdf", ".docx", ".pptx", ".xlsx", ".jpg", ".jpeg", ".png"] as readonly string[],
  acceptedMimeTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/jpeg",
    "image/png",
  ] as readonly string[],
  sectionCategories: [
    "Concept note / overview",
    "Prototype photos or screenshots",
    "Technical or R&D report",
    "Pilot feedback or customer validation",
    "Financial assumptions or unit economics",
    "CIPA / registration / compliance record",
    "Innovation proposal or pitch deck",
    "Project plan or growth strategy",
    "Budget or financial projections",
    "Identity or company verification record",
    "Certified identity copy",
    "Proof of residence",
    "Company registration certificate",
    "Director or shareholder records",
    "Bank statement",
  ] as readonly string[],
};

export function sectionFileLimit(sectionKey: string): number {
  return EVIDENCE_RULES.sectionFileLimits[sectionKey] || EVIDENCE_RULES.maxFilesPerSection;
}

export interface DocumentChecklistItem {
  label: string;
  category: string;
  timing: string;
  attached: boolean;
}

export function documentChecklist(
  applicantType: string | undefined,
  docs: InnovatorDocument[] = []
): DocumentChecklistItem[] {
  const files = (docs || []).filter((doc) => doc.docKind === "file" && doc.uploadStatus !== "Removed");
  const items = [
    { label: "Innovation proposal or pitch deck", category: "Innovation proposal or pitch deck", timing: "Recommended now" },
    { label: "Prototype, research or customer evidence", category: "Pilot feedback or customer validation", timing: "When available" },
    { label: "Project plan or growth strategy", category: "Project plan or growth strategy", timing: "When available" },
    { label: "Budget and financial projections", category: "Budget or financial projections", timing: "If seeking funding" },
  ];
  if (applicantType === "Registered company") {
    items.push({ label: "Company registration certificate and authority", category: "Company registration certificate", timing: "Requested for verification" });
    items.push({ label: "Directors, shareholders and certified identity records", category: "Director or shareholder records", timing: "Requested for verification" });
  } else {
    items.push({ label: "Certified applicant identity", category: "Certified identity copy", timing: "Requested for verification" });
  }
  items.push({ label: "Proof of residence", category: "Proof of residence", timing: "Requested for verification" });
  items.push({ label: "Bank statements", category: "Bank statement", timing: "Only if required for a funding facility" });
  return items.map((item) => ({ ...item, attached: files.some((doc) => doc.category === item.category) }));
}

export function applicantVerificationSlots(applicantType: string | undefined): { category: string; label: string }[] {
  return applicantType === "Registered company"
    ? [
        { category: "Certified identity copy", label: "Certified ID front of the authorized representative" },
        { category: "Identity back", label: "Certified ID back of the authorized representative" },
        { category: "Proof of residence", label: "Proof of residence" },
        { category: "Company registration certificate", label: "Company registration certificate" },
        { category: "Director or shareholder records", label: "Share certificates and director records" },
        { category: "Tax clearance certificate", label: "Tax clearance certificate (when applicable)" },
      ]
    : [
        { category: "Certified identity copy", label: "Certified Omang front" },
        { category: "Identity back", label: "Certified Omang back" },
        { category: "Proof of residence", label: "Proof of residence" },
      ];
}

export interface WizardStepMeta {
  number: number;
  key: string;
  title: string;
  short: string;
  hint: string;
}

export const WIZARD_STEPS: WizardStepMeta[] = [
  { number: 1, key: "applicant", title: "Applicant information", short: "Applicant", hint: "Confirm applicant type, contact details, and company authority if applying as a business." },
  { number: 2, key: "overview", title: "Innovation overview", short: "Overview", hint: "Give a clear name, concise plain-language summary, and primary sector." },
  { number: 3, key: "problem", title: "Problem being addressed", short: "Problem", hint: "Explain who faces this challenge in Botswana and why existing solutions fall short." },
  { number: 4, key: "solution", title: "Proposed solution", short: "Solution", hint: "Describe how your innovation works, what is novel, and any testing done so far." },
  { number: 5, key: "beneficiaries", title: "Target users & beneficiaries", short: "Users", hint: "Identify your target adopters, deployment footprint, and empowerment focus." },
  { number: 6, key: "impact", title: "Market & national impact", short: "Impact", hint: "Outline economic benefit to Botswana, environmental care, demand, and job creation." },
  { number: 7, key: "stage", title: "Innovation stage", short: "Stage", hint: "Choose your current maturity stage; guidance adapts automatically." },
  { number: 8, key: "implementation", title: "Implementation plan", short: "Plan", hint: "Share delivery milestones for Years 1, 3, and 5 plus key risks and mitigations." },
  { number: 9, key: "team", title: "Team & partnerships", short: "Team", hint: "Highlight execution capability, key technical partners, and critical resource gaps." },
  { number: 10, key: "support", title: "Financial & support needs", short: "Support", hint: "State the funding, mentorship, or market access support you seek from CEDA." },
  { number: 11, key: "evidence", title: "Supporting evidence", short: "Evidence", hint: "Upload private pitch decks, diagrams, or add approved HTTPS video demo links." },
  { number: 12, key: "declaration", title: "Declaration & review", short: "Review", hint: "Confirm authorship, accuracy, and confidentiality consent before final submission." },
];

export const APPLICATION_STATUS_FILTERS = [
  "All",
  "Draft",
  "Submitted",
  "In review",
  "Changes requested",
  "Completed",
  "Withdrawn",
] as const;

export type ApplicationStatusFilter = (typeof APPLICATION_STATUS_FILTERS)[number];

export type ApplicationSortKey =
  | "updated_desc"
  | "created_desc"
  | "submitted_desc"
  | "title_asc"
  | "status"
  | "updated_asc";

export const APPLICATION_SORT_OPTIONS: { key: ApplicationSortKey; label: string }[] = [
  { key: "updated_desc", label: "Last updated (newest)" },
  { key: "created_desc", label: "Date created (newest)" },
  { key: "submitted_desc", label: "Date submitted (newest)" },
  { key: "title_asc", label: "Innovation title (A-Z)" },
  { key: "status", label: "Current status" },
  { key: "updated_asc", label: "Oldest updated" },
];

export const OPTIMUS_SUGGESTED_PROMPTS = [
  { label: "Portal navigation", topic: "navigation", prompt: "How do I navigate the portal between applications, documents, and messages?" },
  { label: "Eligibility", topic: "eligibility", prompt: "Who is eligible to apply as an individual or registered company?" },
  { label: "Application sections", topic: "sections", prompt: "How do the 12 application sections work?" },
  { label: "Evidence requirements", topic: "evidence", prompt: "What supporting evidence files and video links are allowed?" },
  { label: "Status definitions", topic: "status", prompt: "What do Draft, Submitted, In review, and Changes requested mean?" },
] as const;

export interface WizardFormData {
  applicantType?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  district?: string;
  expertise?: string;
  hasCollaborators?: string;
  collaboratorsText?: string;
  alternativeContactName?: string;
  alternativeContactRelationship?: string;
  alternativeContactPhone?: string;
  alternativeContactConsent?: boolean;
  problemSource?: string;
  problemDocument?: string;
  solutionSource?: string;
  solutionDocument?: string;
  implementationSource?: string;
  implementationDocument?: string;
  companyName?: string;
  companyRegNumber?: string;
  companySector?: string;
  representativeRole?: string;
  companyAuthority?: boolean;
  title?: string;
  summary?: string;
  primarySector?: string;
  technologyMethod?: string;
  innovationType?: string[];
  problem?: string;
  problemUrgency?: string;
  solution?: string;
  hasAlternatives?: string;
  testedWithUsers?: string;
  alternativesDetail?: string;
  testingLessons?: string;
  beneficiaries?: string[];
  deploymentFootprint?: string;
  empowermentFocus?: string;
  botswanaBenefit?: string;
  environmentalImpact?: string;
  environmentalNotes?: string;
  marketDemand?: string;
  createsJobs?: string;
  jobsYear1?: string;
  jobsYear3?: string;
  jobsYear5?: string;
  jobsAssumptions?: string;
  stage?: string;
  stageEvidenceNotes?: string;
  stageMilestoneNext?: string;
  implementationApproach?: string;
  milestone1Year?: string;
  milestone3Year?: string;
  milestone5Year?: string;
  risksAndMitigations?: string;
  teamExperience?: string;
  resourcesNeeded?: string;
  partnerships?: string;
  supportRequestedSummary?: string;
  hasBusinessPlan?: string;
  hasFinancialProjections?: string;
  financialAssumptions?: string;
  selfDeveloped?: string;
  otherContributors?: string;
  sharedPublicly?: string;
  existingAgreements?: string;
  permissionToSubmit?: boolean;
  accuracyConfirmed?: boolean;
  privacyConfirmed?: boolean;
  [key: string]: unknown;
}

export interface TimelineEntry {
  label: string;
  detail?: string;
  at?: string;
}

export interface RequestedChangeItem {
  id?: string;
  section?: string;
  sectionKey?: string;
  sectionLabel?: string;
  label?: string;
  feedback?: string;
  message?: string;
  reason?: string;
  deadline?: string;
  status?: string;
  resolvedAt?: string;
}

export interface ApplicationOutcome {
  status?: string;
  decision?: string;
  outcomeDate?: string;
  releasedAt?: string;
  feedback?: string;
  applicantFeedback?: string;
  summary?: string;
  nextSteps?: string | string[];
  recommendedNextSteps?: string | string[];
  supportContact?: string;
  letterReference?: string;
  appealAllowed?: boolean;
  appealPermitted?: boolean;
  clarificationAllowed?: boolean;
}

export interface InnovatorApplication {
  id: string;
  reference: string;
  applicantType: string;
  sectorId?: string | null;
  sector: string;
  applicant: string;
  title: string;
  summary: string;
  currentStep: number;
  formData: WizardFormData;
  originalSnapshot?: WizardFormData | null;
  requestedChanges: RequestedChangeItem[] | RequestedChangeItem | null;
  outcome?: ApplicationOutcome | null;
  outcomeData?: ApplicationOutcome | null;
  withdrawnReason?: string | null;
  receiptCode?: string | null;
  submittedDate?: string | null;
  timeline?: TimelineEntry[];
  applicantTimeline?: TimelineEntry[];
  deadlines?: Array<string | { label?: string; title?: string; date?: string; deadline?: string }>;
  version: number;
  createdAt: string;
  updatedAt: string;
  status: string;
}

export function normalizeRequestedChanges(
  raw: RequestedChangeItem[] | RequestedChangeItem | null | undefined
): RequestedChangeItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "object" && Object.keys(raw).length > 0) return [raw];
  return [];
}

export function linkedDocumentIsValid(
  form: WizardFormData | Record<string, unknown> = {},
  docs: InnovatorDocument[] = [],
  sourceKey: keyof WizardFormData,
  documentKey: keyof WizardFormData,
  sectionKey: string
): boolean {
  if (form?.[sourceKey] !== "document") return true;
  return (docs || []).some(
    (doc) =>
      doc.id === form?.[documentKey] &&
      doc.sectionKey === sectionKey &&
      doc.docKind === "file" &&
      doc.uploadStatus === "Saved"
  );
}

export interface InnovatorDocument {
  id: string;
  applicationId: string;
  applicationRef: string;
  sectionKey: string;
  docKind: "file" | "video_link" | "supplemental" | string;
  title: string;
  category: string;
  description: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string | null;
  videoUrl: string | null;
  passwordProtected: boolean;
  version: number;
  uploadStatus: string;
  createdAt: string;
}

export interface InnovatorMessage {
  id: string;
  applicationId: string | null;
  applicationRef: string | null;
  threadType: "application" | "support" | "clarification" | "general" | string;
  subject: string;
  senderName: string;
  senderRole: string;
  body: string;
  attachmentName?: string | null;
  attachmentPath?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface InnovatorThread {
  key: string;
  applicationId: string | null;
  applicationRef: string | null;
  threadType: string;
  title: string;
  unread: boolean;
  unreadCount: number;
  messages: InnovatorMessage[];
}

export function wordCount(value: unknown): number {
  const cleaned = String(value ?? "").trim();
  return cleaned ? cleaned.split(/\s+/).length : 0;
}

export function charGuidance(value: unknown, min: number, recommended: number, max: number) {
  const text = String(value ?? "").trim();
  const chars = text.length;
  const words = wordCount(text);
  const state =
    chars === 0
      ? "empty"
      : chars < min
        ? "short"
        : chars > max
          ? "over"
          : chars >= recommended
            ? "strong"
            : "ok";
  return {
    chars,
    words,
    state,
    label:
      state === "short"
        ? `${chars}/${min} min chars (${words} words)`
        : `${chars}/${max} chars • ${words} words`,
  };
}

export function formatBytes(bytes: number): string {
  const n = Number(bytes || 0);
  if (!n || n <= 0) return "0 KB";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function sanitizeFileName(name: string): string {
  return String(name || "document")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "document";
}

export function validateVideoLink(url: string): string | null {
  const trimmed = String(url ?? "").trim();
  if (!trimmed) return "Enter an HTTPS video link (e.g. YouTube unlisted, Vimeo, or Loom).";
  if (!/^https:\/\/[^\s]+$/i.test(trimmed)) return "Video links must begin with https://";
  if (trimmed.length > 500) return "Video link is too long (maximum 500 characters).";
  return null;
}

export interface FileLikeInput {
  name?: string | null;
  size?: number | null;
  type?: string | null;
}

export function validateEvidenceFile(
  file: FileLikeInput | null | undefined,
  existingDocs: InnovatorDocument[] = [],
  sectionKey = "supplementary",
  docKind = "file"
): string | null {
  if (!file) return "Select a file to upload.";
  const name = String(file.name ?? "");
  const lower = name.toLowerCase();
  const hasValidExt = EVIDENCE_RULES.acceptedExtensions.some((ext) => lower.endsWith(ext));
  const mime = String(file.type ?? "").toLowerCase();
  const hasValidMime = !mime || EVIDENCE_RULES.acceptedMimeTypes.includes(mime);
  if (!hasValidExt || !hasValidMime) {
    return "Supported formats: PDF, DOCX, PPTX, XLSX, JPG, or PNG.";
  }
  const size = Number(file.size ?? 0);
  if (!size || size < 1) return "The selected file appears empty.";
  if (size > EVIDENCE_RULES.maxBytes) return "Files must be 10 MB or smaller.";
  if (docKind === "file") {
    const activeCount = existingDocs.filter(
      (d) => d.sectionKey === sectionKey && d.docKind === "file" && d.uploadStatus !== "Removed"
    ).length;
    const limit = sectionFileLimit(sectionKey);
    if (activeCount >= limit) {
      return `Maximum ${limit} supporting files reached for this section.`;
    }
  }
  return null;
}

export function evaluateStepReadiness(
  stepNumber: number,
  formData: WizardFormData = {},
  docs: InnovatorDocument[] = []
): boolean {
  const f = formData || {};
  const str = (key: keyof WizardFormData) => String(f[key] ?? "").trim();
  const hasDocs = (docs || []).some((d) => d.uploadStatus !== "Removed");
  const isCompany = (f.applicantType || "Individual") === "Registered company";
  const contactEntered = Boolean(
    f.alternativeContactName || f.alternativeContactRelationship || f.alternativeContactPhone
  );

  switch (stepNumber) {
    case 1:
      return (
        str("fullName").length >= 2 &&
        (str("phone").length >= 6 || str("email").length >= 5) &&
        str("district").length >= 2 &&
        (!isCompany || (str("companyName").length >= 2 && Boolean(f.companyAuthority))) &&
        (!contactEntered ||
          (str("alternativeContactName").length >= 2 &&
            str("alternativeContactPhone").length >= 6 &&
            f.alternativeContactConsent === true))
      );
    case 2:
      return str("title").length >= 3 && str("summary").length >= 20 && str("primarySector").length >= 2;
    case 3:
      return str("problem").length >= 20 && linkedDocumentIsValid(f, docs, "problemSource", "problemDocument", "problem");
    case 4:
      return str("solution").length >= 20 && linkedDocumentIsValid(f, docs, "solutionSource", "solutionDocument", "problem");
    case 5:
      return (
        (Array.isArray(f.beneficiaries) && f.beneficiaries.length > 0) ||
        str("botswanaBenefit").length >= 10 ||
        str("deploymentFootprint").length >= 3
      );
    case 6:
      return str("botswanaBenefit").length >= 15 || str("marketDemand").length >= 10;
    case 7:
      return INNOVATION_STAGES.includes(f.stage as InnovationStage) && str("stageEvidenceNotes").length >= 5;
    case 8:
      return (
        str("implementationApproach").length >= 10 &&
        linkedDocumentIsValid(f, docs, "implementationSource", "implementationDocument", "feasibility")
      );
    case 9:
      return str("teamExperience").length >= 5;
    case 10:
      return str("supportRequestedSummary").length >= 5;
    case 11:
      return hasDocs || str("stageEvidenceNotes").length >= 15;
    case 12:
      return Boolean(f.permissionToSubmit && f.accuracyConfirmed && f.privacyConfirmed);
    default:
      return false;
  }
}

export function evaluateApplicationReadiness(
  app: Pick<InnovatorApplication, "id" | "formData"> | null | undefined,
  docs: InnovatorDocument[] = []
) {
  const f = app?.formData || {};
  const appDocs = (docs || []).filter((d) => d.applicationId === app?.id && d.uploadStatus !== "Removed");
  const completedSections = WIZARD_STEPS.filter((s) => evaluateStepReadiness(s.number, f, appDocs)).map((s) => s.number);
  const missingSections = WIZARD_STEPS.filter((s) => !completedSections.includes(s.number));
  const blockers: { step: number; label: string }[] = [];

  if (!evaluateStepReadiness(1, f, appDocs)) blockers.push({ step: 1, label: "Applicant, contact & company/alternative contact confirmation" });
  if (!evaluateStepReadiness(2, f, appDocs)) blockers.push({ step: 2, label: "Innovation title & plain-language summary (20+ chars)" });
  if (!evaluateStepReadiness(3, f, appDocs)) blockers.push({ step: 3, label: "Problem statement (20+ chars) & linked document" });
  if (!evaluateStepReadiness(4, f, appDocs)) blockers.push({ step: 4, label: "Proposed solution (20+ chars) & linked document" });
  if (!evaluateStepReadiness(8, f, appDocs)) blockers.push({ step: 8, label: "Implementation approach (10+ chars) & linked document" });
  if (!evaluateStepReadiness(12, f, appDocs)) blockers.push({ step: 12, label: "All three applicant declarations & consent checks" });

  return {
    completedSections,
    missingSections,
    blockers,
    evidenceCount: appDocs.length,
    percentComplete: Math.round((completedSections.length / WIZARD_STEPS.length) * 100),
    readyToSubmit: blockers.length === 0,
  };
}

export type ApplicationReadiness = ReturnType<typeof evaluateApplicationReadiness>;

export function applicationRequiredAction(
  app: Pick<InnovatorApplication, "status" | "currentStep" | "requestedChanges"> | null | undefined
): string {
  if (!app) return "Open workspace";
  switch (app.status) {
    case "Draft":
      return `Continue draft (Step ${Number(app.currentStep || 1)} of 12)`;
    case "Changes requested": {
      const firstReq = normalizeRequestedChanges(app.requestedChanges).find((r) => r.status !== "Resolved");
      return firstReq?.deadline
        ? `Respond by ${firstReq.deadline}`
        : "Submit clarification or extra evidence";
    }
    case "Submitted":
      return "Submitted — awaiting CEDA triage";
    case "In review":
      return "Under CEDA review";
    case "Completed":
    case "Approved":
    case "Rejected":
      return "Outcome available — view letter";
    case "Withdrawn":
      return "Withdrawn by applicant";
    default:
      return "View details";
  }
}

export function canWithdrawApplication(
  appOrStatus: Pick<InnovatorApplication, "status"> | string | null | undefined
): boolean {
  const status = typeof appOrStatus === "string" ? appOrStatus : appOrStatus?.status;
  return ["Draft", "Submitted", "In review", "Changes requested"].includes(String(status ?? ""));
}

export function matchesStatusFilter(
  status: string | undefined,
  filterValue: string | undefined
): boolean {
  if (!filterValue || filterValue === "All") return true;
  if (filterValue === "Completed") return ["Completed", "Approved", "Rejected"].includes(String(status ?? ""));
  return status === filterValue;
}

export function filterAndSortApplications(
  apps: InnovatorApplication[] = [],
  {
    query = "",
    status = "All",
    sort = "updated_desc",
  }: { query?: string; status?: string; sort?: ApplicationSortKey | string } = {}
): InnovatorApplication[] {
  const q = String(query || "").trim().toLowerCase();
  const filtered = (apps || []).filter((a) => {
    if (!matchesStatusFilter(a.status, status)) return false;
    if (!q) return true;
    return [a.reference, a.title, a.sector, a.applicant, a.applicantType, a.status].some((v) =>
      String(v || "").toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (sort === "created_desc") return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    if (sort === "title_asc") return String(a.title || "").localeCompare(String(b.title || ""));
    if (sort === "submitted_desc") return String(b.submittedDate || "").localeCompare(String(a.submittedDate || ""));
    if (sort === "status") return String(a.status || "").localeCompare(String(b.status || ""));
    if (sort === "updated_asc") return String(a.updatedAt || "").localeCompare(String(b.updatedAt || ""));
    return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
  });
  return sorted;
}

export interface RequiredActionItem {
  priority: number;
  applicationId: string;
  reference: string;
  title: string;
  actionLabel: string;
  detail: string;
  buttonText: string;
  targetMode: "changes" | "wizard" | "summary" | "settings";
}

export function collectRequiredActions(
  apps: InnovatorApplication[] = [],
  docs: InnovatorDocument[] = []
): RequiredActionItem[] {
  const actions: RequiredActionItem[] = [];
  for (const app of apps || []) {
    if (!app?.id) continue;
    if (app.status === "Changes requested") {
      const req = normalizeRequestedChanges(app.requestedChanges).find((r) => r.status !== "Resolved");
      const sectionLabel = req?.sectionLabel || req?.section || req?.label || "Requested update";
      actions.push({
        priority: 1,
        applicationId: app.id,
        reference: app.reference,
        title: `${app.reference} — ${app.title}`,
        actionLabel: "Submit requested clarification",
        detail: req?.deadline ? `${sectionLabel} due by ${req.deadline}` : sectionLabel,
        buttonText: "Respond",
        targetMode: "changes",
      });
    } else if (app.status === "Draft") {
      const readiness = evaluateApplicationReadiness(app, docs);
      actions.push({
        priority: 2,
        applicationId: app.id,
        reference: app.reference,
        title: `${app.reference} — ${app.title}`,
        actionLabel: `Finish Step ${Number(app.currentStep || 1)} of 12`,
        detail: `${readiness.percentComplete}% ready (${readiness.completedSections.length}/12 steps ready to submit)`,
        buttonText: "Continue draft",
        targetMode: "wizard",
      });
    } else if (app.status === "Approved" || app.status === "Rejected") {
      const out = (app.outcomeData && Object.keys(app.outcomeData).length ? app.outcomeData : app.outcome) || {};
      actions.push({
        priority: 3,
        applicationId: app.id,
        reference: app.reference,
        title: `${app.reference} — ${app.title}`,
        actionLabel: `Outcome available: ${app.status}`,
        detail: out.outcomeDate ? `Released ${out.outcomeDate}` : "View feedback and outcome letter",
        buttonText: "View outcome",
        targetMode: "summary",
      });
    }
  }
  return actions.sort((a, b) => a.priority - b.priority);
}

export interface RecentActivityEvent {
  applicationId: string;
  reference: string;
  title: string;
  status: string;
  label: string;
  detail: string;
  at: string;
}

export function collectRecentActivity(
  apps: InnovatorApplication[] = [],
  limit = 6
): RecentActivityEvent[] {
  const events: RecentActivityEvent[] = [];
  for (const app of apps || []) {
    const timeline = app.timeline || app.applicantTimeline;
    if (!app?.id || !Array.isArray(timeline)) continue;
    for (const item of timeline) {
      events.push({
        applicationId: app.id,
        reference: app.reference,
        title: app.title,
        status: app.status,
        label: item.label || "Update",
        detail: item.detail || "",
        at: item.at || "",
      });
    }
  }
  return events
    .sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")))
    .slice(0, Math.max(1, Number(limit || 6)));
}

export function statusTone(status: string): { bg: string; border: string; text: string } {
  switch (status) {
    case "Approved":
    case "Completed":
    case "Resolved":
    case "Published":
      return { bg: "rgba(33, 108, 66, 0.13)", border: "rgba(33, 108, 66, 0.28)", text: "#1c5e3a" };
    case "Changes requested":
    case "Waiting":
      return { bg: "rgba(180, 92, 24, 0.14)", border: "rgba(180, 92, 24, 0.30)", text: "#8f430b" };
    case "In review":
    case "Submitted":
    case "Open":
      return { bg: "rgba(30, 84, 145, 0.12)", border: "rgba(30, 84, 145, 0.24)", text: "#18477d" };
    case "Rejected":
    case "Withdrawn":
      return { bg: "rgba(154, 61, 43, 0.13)", border: "rgba(154, 61, 43, 0.28)", text: "#872c1b" };
    default:
      return { bg: "rgba(36, 28, 25, 0.08)", border: "rgba(36, 28, 25, 0.16)", text: "#4f433c" };
  }
}

export function groupMessageThreads(messages: InnovatorMessage[] = []): InnovatorThread[] {
  const map = new Map<string, InnovatorThread>();
  for (const m of messages) {
    const key = m.applicationId || m.threadType || "general";
    if (!map.has(key)) {
      map.set(key, {
        key,
        applicationId: m.applicationId || null,
        applicationRef: m.applicationRef || null,
        threadType: m.threadType || "general",
        title: m.applicationRef ? `${m.applicationRef} — ${m.subject}` : m.subject || "CEDA Support Desk",
        unread: false,
        unreadCount: 0,
        messages: [],
      });
    }
    const g = map.get(key)!;
    g.messages.push(m);
    if (!m.isRead) {
      g.unread = true;
      g.unreadCount += 1;
    }
  }
  return [...map.values()].reverse();
}

export function buildReceiptSummaryText(
  app: InnovatorApplication,
  docs: InnovatorDocument[] = []
): string {
  const appDocs = docs.filter((d) => d.applicationId === app.id && d.uploadStatus !== "Removed");
  const lines = [
    "CEDA INNOVATION PORTAL — OFFICIAL SUBMISSION RECEIPT",
    `Reference: ${app.reference}`,
    `Receipt code: ${app.receiptCode || "Recorded"}`,
    `Title: ${app.title}`,
    `Applicant: ${app.applicant} (${app.applicantType})`,
    `Sector: ${app.sector}`,
    `Submitted date: ${app.submittedDate || app.updatedAt}`,
    `Status: ${app.status}`,
    "",
    `Supporting evidence recorded (${appDocs.length}):`,
    ...(appDocs.length
      ? appDocs.map((d) => `- ${d.title || d.fileName} (${d.sectionKey})`)
      : ["- No external evidence files attached."]),
    "",
    "Applicant privacy note: Assessment notes, scores, and internal administrative deliberations stay isolated from public and applicant channels.",
  ];
  return lines.join("\n");
}

export function buildOutcomeSummaryText(app: InnovatorApplication): string {
  const o = (app.outcomeData && Object.keys(app.outcomeData).length ? app.outcomeData : app.outcome) || {};
  const rawSteps = o.recommendedNextSteps ?? o.nextSteps;
  const formattedSteps = Array.isArray(rawSteps)
    ? rawSteps.map((s, idx) => `${idx + 1}. ${s}`).join("\n")
    : rawSteps || "Contact CEDA Innovation Support if clarification or guidance is needed.";
  return [
    "CEDA INNOVATION PORTAL — OFFICIAL OUTCOME NOTICE",
    `Reference: ${app.reference}`,
    `Title: ${app.title}`,
    `Applicant: ${app.applicant}`,
    `Final status: ${o.status || o.decision || app.status}`,
    `Outcome date: ${o.outcomeDate || o.releasedAt || app.updatedAt}`,
    "",
    "Approved feedback:",
    o.applicantFeedback || o.feedback || o.summary || "Formal feedback has been issued on your application workspace.",
    "",
    "Recommended next steps:",
    formattedSteps,
  ].join("\n");
}
