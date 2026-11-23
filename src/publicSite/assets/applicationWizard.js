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
];

export const INNOVATION_STAGES = [
  "Idea",
  "R&D",
  "Prototype",
  "Pilot",
  "Operational",
  "Scaling",
];

export const STAGE_MATRIX = {
  Idea: {
    summary: "Early concept exploring a verified Botswana problem before a working model is built.",
    evidenceHint: "Concept sketch, problem research notes, or community validation interviews.",
    metricsLabel: "Early validation signals and learning goals",
    metricsPlaceholder: "Describe interviews, desktop research, or initial assumptions you plan to test first.",
    milestoneHint: "Moving from concept design into an initial proof-of-concept or laboratory test.",
  },
  "R&D": {
    summary: "Structured technical research, formulation, software architecture, or lab testing.",
    evidenceHint: "Technical specifications, bench test summaries, or research collaborator letters.",
    metricsLabel: "Research findings, test parameters, and technical feasibility checks",
    metricsPlaceholder: "Summarise technical trials, design parameters, or intellectual property foundations.",
    milestoneHint: "Completing laboratory or component verification toward an integrated prototype.",
  },
  Prototype: {
    summary: "A working early version tested internally or with initial sample users.",
    evidenceHint: "Prototype photos, system walkthrough screenshots, or an HTTPS demo video link.",
    metricsLabel: "Prototype performance and usability feedback",
    metricsPlaceholder: "Share how the working model performed during internal or early user testing.",
    milestoneHint: "Refining reliability, cost, and safety readiness for a structured pilot.",
  },
  Pilot: {
    summary: "Live field deployment with real trial customers, partners, or a defined community.",
    evidenceHint: "Pilot deployment report, partner letter of intent, or anonymised user feedback.",
    metricsLabel: "Pilot traction, active trial users, and operational lessons",
    metricsPlaceholder: "Detail pilot site outcomes, adoption rate, turnaround improvements, and key fixes made.",
    milestoneHint: "Closing pilot gaps, regulatory approvals, and commercial unit economics.",
  },
  Operational: {
    summary: "Actively serving customers or stakeholders in production with repeatable delivery.",
    evidenceHint: "Customer traction overview, unit cost breakdown, or quality/compliance certificates.",
    metricsLabel: "Current customer base, delivery capacity, and recurring demand",
    metricsPlaceholder: "Provide current monthly users, service throughput, pricing validation, and unit sustainability.",
    milestoneHint: "Expanding production reliability and regional distribution across Botswana.",
  },
  Scaling: {
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
];

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
];

export const EVIDENCE_RULES = {
  maxFilesPerSection: 4,
  sectionFileLimits: { applicant: 12, supplementary: 8 },
  maxBytes: 10 * 1024 * 1024,
  acceptedExtensions: [".pdf", ".docx", ".pptx", ".xlsx", ".jpg", ".jpeg", ".png"],
  acceptedMimeTypes: new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/jpeg",
    "image/png",
  ]),
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
  ],
};

export function sectionFileLimit(sectionKey) {
  return EVIDENCE_RULES.sectionFileLimits[sectionKey] || EVIDENCE_RULES.maxFilesPerSection;
}

export function documentChecklist(applicantType, docs = []) {
  const files = docs.filter(doc => doc.docKind === "file" && doc.uploadStatus !== "Removed");
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
  return items.map(item => ({ ...item, attached: files.some(doc => doc.category === item.category) }));
}

export function linkedDocumentIsValid(form, docs, sourceKey, documentKey, sectionKey) {
  if (form[sourceKey] !== "document") return true;
  return docs.some(doc => doc.id === form[documentKey] && doc.sectionKey === sectionKey && doc.docKind === "file" && doc.uploadStatus === "Saved");
}

export const WIZARD_STEPS = [
  { step: 1, key: "applicant", title: "Applicant information", shortTitle: "Applicant", sectionKey: "applicant", hint: "Confirm applicant contact details, district, and company authority if applying as a registered company." },
  { step: 2, key: "overview", title: "Innovation overview", shortTitle: "Overview", sectionKey: "applicant", hint: "Provide a clear innovation title, plain-language summary, primary sector, and core technology or method." },
  { step: 3, key: "problem", title: "Problem being addressed", shortTitle: "Problem", sectionKey: "problem", hint: "Explain the specific problem in Botswana, who experiences it, and why existing options fall short." },
  { step: 4, key: "solution", title: "Proposed solution", shortTitle: "Solution", sectionKey: "problem", hint: "Describe how your innovation works, what differentiates it from alternatives, and what user testing taught you." },
  { step: 5, key: "beneficiaries", title: "Target users or beneficiaries", shortTitle: "Beneficiaries", sectionKey: "impact", hint: "Identify target groups, geographic footprint across Botswana, citizen empowerment, and environmental notes." },
  { step: 6, key: "market", title: "Market and impact", shortTitle: "Market & impact", sectionKey: "impact", hint: "Outline market demand, expected social or economic value, and realistic 1-to-5 year job creation estimates." },
  { step: 7, key: "stage", title: "Innovation stage", shortTitle: "Stage", sectionKey: "feasibility", hint: "Select your current maturity level so CEDA evaluates you fairly with stage-appropriate evidence." },
  { step: 8, key: "implementation", title: "Implementation plan", shortTitle: "Implementation", sectionKey: "feasibility", hint: "Set out your execution approach, 1, 3, and 5-year milestones, delivery risks, and practical mitigations." },
  { step: 9, key: "team", title: "Team information", shortTitle: "Team", sectionKey: "feasibility", hint: "Highlight the founder and team capabilities, collaborators, key partners, and critical capability gaps." },
  { step: 10, key: "financial", title: "Financial or support requirements", shortTitle: "Support & finance", sectionKey: "supplementary", hint: "Specify CEDA support needed (mentorship, technical validation, market access, or funding readiness) and cost assumptions." },
  { step: 11, key: "evidence", title: "Supporting evidence", shortTitle: "Evidence", sectionKey: "supplementary", hint: "Attach supporting files in private storage (up to 4 files per section, 10 MB each) and HTTPS video links." },
  { step: 12, key: "review", title: "Declaration and review", shortTitle: "Review & submit", sectionKey: "supplementary", hint: "Inspect completed vs. missing sections, confirm declarations, and submit a locked snapshot for review." },
];

export const APPLICATION_STATUS_FILTERS = [
  "All",
  "Draft",
  "Submitted",
  "In review",
  "Changes requested",
  "Completed",
  "Withdrawn",
];

export function wordCount(value) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

export function charGuidance(value, minChars, maxChars) {
  const text = String(value ?? "");
  const len = text.trim().length;
  const words = wordCount(text);
  return {
    chars: len,
    words,
    maxChars,
    minChars,
    meetsMin: len >= minChars,
    label: `${words} words (${len}/${maxChars} chars${minChars > 0 ? `, min ${minChars}` : ""})`,
  };
}

export function formatBytes(bytes) {
  const num = Number(bytes || 0);
  if (!num) return "N/A";
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
}

export function sanitizeFileName(name) {
  const raw = String(name ?? "document").trim();
  return raw.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120) || "document";
}

export function validateVideoLink(url) {
  const value = String(url ?? "").trim();
  if (!value) return "Enter a video demonstration link starting with https://";
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return "Video links must use https:// for secure preview.";
    return null;
  } catch {
    return "Enter a valid https:// web address for the video link.";
  }
}

export function validateEvidenceFile(file, existingDocs, sectionKey, docKind = "file") {
  if (!file) return "Select a file to upload.";
  if (Number(file.size || 0) <= 0) return "The selected file is empty.";
  if (Number(file.size) > EVIDENCE_RULES.maxBytes) {
    return `"${file.name}" exceeds the 10 MB maximum file size.`;
  }
  const lowerName = String(file.name || "").toLowerCase();
  const extOk = EVIDENCE_RULES.acceptedExtensions.some(ext => lowerName.endsWith(ext));
  const mimeOk = file.type ? EVIDENCE_RULES.acceptedMimeTypes.has(file.type) : extOk;
  if (!extOk || !mimeOk) {
    return "Supported formats are PDF, DOCX, PPTX, XLSX, JPG, and PNG.";
  }
  if (docKind === "file") {
    const count = (existingDocs || []).filter(
      doc => doc.sectionKey === sectionKey && doc.docKind === "file" && doc.uploadStatus !== "Removed",
    ).length;
    if (count >= sectionFileLimit(sectionKey)) {
      return `Maximum ${sectionFileLimit(sectionKey)} supporting files already uploaded for this section.`;
    }
  }
  return null;
}

export function evaluateStepReadiness(stepNumber, formData = {}, docs = []) {
  const f = formData || {};
  const hasText = (key, minLen = 1) => String(f[key] ?? "").trim().length >= minLen;
  const hasItems = key => Array.isArray(f[key]) && f[key].length > 0;
  const checks = [];
  const add = (label, ok) => checks.push({ label, ok: Boolean(ok) });

  switch (stepNumber) {
    case 1:
      add("Full name", hasText("fullName", 2));
      add("Email address", hasText("email", 5));
      add("District", hasText("district", 2));
      if (f.alternativeContactName || f.alternativeContactPhone || f.alternativeContactRelationship) {
        add("Alternative contact name and phone", hasText("alternativeContactName", 2) && hasText("alternativeContactPhone", 6));
        add("Alternative contact agreed", f.alternativeContactConsent === true);
      }
      if (f.applicantType === "Registered company") {
        add("Registered company name", hasText("companyName", 2));
        add("Representative role", hasText("representativeRole", 2));
        add("Company authority confirmation", f.companyAuthority === true);
      }
      break;
    case 2:
      add("Innovation title (3+ characters)", hasText("title", 3));
      add("Plain-language summary (20+ characters)", hasText("summary", 20));
      add("Primary sector", hasText("primarySector", 2));
      break;
    case 3:
      add("Problem statement (20+ characters)", hasText("problem", 20));
      add("Problem document selected", linkedDocumentIsValid(f, docs, "problemSource", "problemDocument", "problem"));
      add("Urgency / cost of inaction", hasText("problemUrgency", 5));
      break;
    case 4:
      add("Proposed solution (20+ characters)", hasText("solution", 20));
      add("Solution document selected", linkedDocumentIsValid(f, docs, "solutionSource", "solutionDocument", "problem"));
      break;
    case 5:
      add("Target beneficiaries", hasItems("beneficiaries") || hasText("botswanaBenefit", 5));
      add("How Botswana benefits", hasText("botswanaBenefit", 10));
      break;
    case 6:
      add("Market demand & value", hasText("marketDemand", 10));
      break;
    case 7:
      add("Current innovation stage", INNOVATION_STAGES.includes(f.stage));
      add("Stage evidence or validation notes", hasText("stageEvidenceNotes", 5));
      break;
    case 8:
      add("Implementation approach (10+ characters)", hasText("implementationApproach", 10));
      add("Implementation document selected", linkedDocumentIsValid(f, docs, "implementationSource", "implementationDocument", "feasibility"));
      add("Key risks & mitigations", hasText("risksAndMitigations", 5));
      break;
    case 9:
      add("Founder / team capability summary", hasText("teamExperience", 5));
      break;
    case 10:
      add("Support or financing needs", hasText("supportRequestedSummary", 5));
      break;
    case 11:
      add("At least one supporting file or video link (recommended)", (docs || []).length > 0 || hasText("stageEvidenceNotes", 15));
      break;
    case 12:
      add("Permission / original authorship confirmation", f.permissionToSubmit === true);
      add("Accuracy declaration", f.accuracyConfirmed === true);
      add("Privacy & assessment consent", f.privacyConfirmed === true);
      break;
    default:
      break;
  }

  const missingLabels = checks.filter(c => !c.ok).map(c => c.label);
  return {
    step: stepNumber,
    complete: missingLabels.length === 0,
    missingLabels,
    filledCount: checks.length - missingLabels.length,
    totalChecks: checks.length,
  };
}

export function evaluateApplicationReadiness(app = {}, docs = [], formConfig = null) {
  const form = app?.formData || {};
  const appDocs = (docs || []).filter(doc => doc.applicationId === app?.id && doc.uploadStatus !== "Removed");
  const stepResults = WIZARD_STEPS.map(meta => ({
    ...meta,
    ...evaluateStepReadiness(meta.step, form, appDocs),
  }));
  const completedSections = stepResults.filter(step => step.complete);
  const missingSections = stepResults.filter(step => !step.complete);
  const blockers = [];

  if (String(form.title ?? "").trim().length < 3) blockers.push({ step: 2, label: "Step 2: Innovation title (minimum 3 characters)" });
  if (String(form.summary ?? "").trim().length < 20) blockers.push({ step: 2, label: "Step 2: Plain-language summary (minimum 20 characters)" });
  if (String(form.problem ?? "").trim().length < 20) blockers.push({ step: 3, label: "Step 3: Problem being addressed (minimum 20 characters)" });
  if (String(form.solution ?? "").trim().length < 20) blockers.push({ step: 4, label: "Step 4: Proposed solution (minimum 20 characters)" });
  if (String(form.implementationApproach ?? "").trim().length < 10) blockers.push({ step: 8, label: "Step 8: Implementation approach (minimum 10 characters)" });
  if ((form.alternativeContactName || form.alternativeContactPhone || form.alternativeContactRelationship) &&
      (!form.alternativeContactName || !form.alternativeContactPhone || form.alternativeContactConsent !== true)) {
    blockers.push({ step: 1, label: "Step 1: Complete the optional alternative contact and confirm their agreement, or leave it blank" });
  }
  for (const [step, source, document, section] of [[3, "problemSource", "problemDocument", "problem"], [4, "solutionSource", "solutionDocument", "problem"], [8, "implementationSource", "implementationDocument", "feasibility"]]) {
    if (!linkedDocumentIsValid(form, appDocs, source, document, section)) blockers.push({ step, label: `Step ${step}: Select an uploaded document for your answer` });
  }
  if (form.applicantType === "Registered company" && (String(form.companyName ?? "").trim().length < 2 || form.companyAuthority !== true)) {
    blockers.push({ step: 1, label: "Step 1: Company name and authority confirmation" });
  }
  if (form.permissionToSubmit !== true || form.accuracyConfirmed !== true || form.privacyConfirmed !== true) {
    blockers.push({ step: 12, label: "Step 12: Authorship, accuracy, and privacy declarations" });
  }

  if (formConfig && Array.isArray(formConfig.customFields)) {
    const customResponses = form.customResponses && typeof form.customResponses === "object" ? form.customResponses : {};
    for (const field of formConfig.customFields) {
      if (!field || field.enabled === false || !field.required) continue;
      const val = customResponses[field.key];
      const filled = field.fieldType === "checkbox"
        ? val === true || val === "true" || val === "Yes"
        : String(val ?? "").trim().length > 0;
      if (!filled) {
        const stepNum = Math.min(10, Math.max(1, Number(field.stepNumber) || 2));
        blockers.push({ step: stepNum, label: `Step ${stepNum}: ${field.label || field.key}` });
      }
    }
  }

  const percentComplete = Math.round((completedSections.length / WIZARD_STEPS.length) * 100);
  return {
    stepResults,
    completedSections,
    missingSections,
    blockers,
    percentComplete,
    readyToSubmit: blockers.length === 0,
    evidenceCount: appDocs.length,
  };
}

export function normalizeRequestedChanges(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(item => item && typeof item === "object");
  if (typeof raw === "object") return [raw];
  return [];
}

export function activeRequestedChange(app) {
  const list = normalizeRequestedChanges(app?.requestedChanges);
  return list.find(item => item.status !== "Resolved") || list[list.length - 1] || null;
}

export function applicationRequiredAction(app) {
  if (!app) return "Open workspace";
  switch (app.status) {
    case "Draft":
      return `Continue draft (Step ${Number(app.currentStep || 1)} of 12)`;
    case "Changes requested": {
      const req = activeRequestedChange(app);
      return req?.deadline
        ? `Respond by ${req.deadline}`
        : "Submit clarification or extra evidence";
    }
    case "Submitted":
      return "Submitted, awaiting CEDA triage";
    case "In review":
      return "Under CEDA review";
    case "Approved":
    case "Rejected":
      return "Outcome available, view letter";
    case "Awarded":
      return "Award conferred, view notice";
    case "Withdrawn":
      return "Withdrawn by applicant";
    default:
      return "View details";
  }
}

export function canWithdrawApplication(status) {
  return ["Draft", "Submitted", "Changes requested"].includes(status);
}

export function matchesStatusFilter(appStatus, filterValue) {
  if (!filterValue || filterValue === "All") return true;
  if (filterValue === "Completed") return appStatus === "Approved" || appStatus === "Awarded" || appStatus === "Rejected";
  return appStatus === filterValue;
}

export function filterAndSortApplications(apps = [], options = {}) {
  const {
    status = "All",
    query = "",
    sort = "updated_desc",
    page = 0,
    pageSize = 6,
  } = options;
  const search = String(query ?? "").trim().toLowerCase();

  const filtered = (apps || []).filter(app => {
    if (!matchesStatusFilter(app.status, status)) return false;
    if (!search) return true;
    return [app.reference, app.title, app.sector, app.applicant, app.applicantType, app.status]
      .some(field => String(field ?? "").toLowerCase().includes(search));
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case "created_desc":
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      case "submitted_desc":
        return String(b.submittedDate || "").localeCompare(String(a.submittedDate || ""));
      case "title_asc":
        return String(a.title || "").localeCompare(String(b.title || ""));
      case "status":
        return String(a.status || "").localeCompare(String(b.status || ""));
      case "updated_desc":
      default:
        return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
    }
  });

  const safePageSize = Math.max(1, Number(pageSize || 6));
  const totalPages = Math.max(1, Math.ceil(sorted.length / safePageSize));
  const clampedPage = Math.max(0, Math.min(Number(page || 0), totalPages - 1));
  const start = clampedPage * safePageSize;

  return {
    items: sorted.slice(start, start + safePageSize),
    total: sorted.length,
    page: clampedPage,
    pageSize: safePageSize,
    totalPages,
  };
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildSubmissionReceiptDocument(app, docs = []) {
  const safeRef = String(app?.reference || "CEDA-INN-DRAFT");
  const appDocs = (docs || []).filter(doc => doc.applicationId === app?.id && doc.uploadStatus !== "Removed");
  const nextSteps = [
    "CEDA acknowledges receipt of your locked application snapshot.",
    "Initial screening checks completeness, sector alignment, and private evidence integrity.",
    "If CEDA needs clarification or extra evidence, you will be notified via the header bell and Messages.",
    "You can track progress anytime from My applications or download this receipt for your records.",
  ];
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CEDA Submission Receipt: ${escapeHtml(safeRef)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #241c19; background: #ffffff; margin: 40px auto; max-width: 760px; line-height: 1.5; padding: 0 20px; }
  header { border-bottom: 3px solid #9a3d2b; padding-bottom: 16px; margin-bottom: 24px; }
  .eyebrow { text-transform: uppercase; font-size: 12px; letter-spacing: 0.1em; color: #65564d; margin: 0 0 6px; }
  h1 { margin: 0 0 6px; font-size: 24px; }
  .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; background: #f7f2eb; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
  .meta dt { font-size: 12px; color: #65564d; }
  .meta dd { margin: 2px 0 0; font-weight: 700; }
  h2 { font-size: 16px; margin: 22px 0 8px; border-bottom: 1px solid #d9d0c6; padding-bottom: 4px; }
  ul, ol { padding-left: 20px; }
  footer { margin-top: 32px; font-size: 12px; color: #65564d; border-top: 1px solid #d9d0c6; padding-top: 12px; }
</style>
</head>
<body>
  <header>
    <p class="eyebrow">CEDA Innovation Portal: Official Submission Receipt</p>
    <h1>${escapeHtml(app?.title || "Innovation Application")}</h1>
    <p>Receipt code: <strong>${escapeHtml(app?.receiptCode || "Pending")}</strong></p>
  </header>
  <dl class="meta">
    <div><dt>Application reference</dt><dd>${escapeHtml(safeRef)}</dd></div>
    <div><dt>Current status</dt><dd>${escapeHtml(app?.status || "Submitted")}</dd></div>
    <div><dt>Applicant</dt><dd>${escapeHtml(app?.applicant || "Innovator")} (${escapeHtml(app?.applicantType || "Individual")})</dd></div>
    <div><dt>Sector</dt><dd>${escapeHtml(app?.sector || "General")}</dd></div>
    <div><dt>Submitted date</dt><dd>${escapeHtml(app?.submittedDate || app?.updatedAt || "Recorded")}</dd></div>
    <div><dt>Supporting evidence files/links</dt><dd>${appDocs.length}</dd></div>
  </dl>
  <h2>What happens next</h2>
  <ol>${nextSteps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
  <h2>Submitted evidence summary</h2>
  ${appDocs.length ? `<ul>${appDocs.map(doc => `<li>${escapeHtml(doc.title)} (${escapeHtml(doc.fileName)}): ${escapeHtml(doc.sectionKey)}</li>`).join("")}</ul>` : "<p>No files attached to this submission.</p>"}
  <footer>Generated securely for applicant records by the CEDA Innovation Portal. Internal staff and assessor notes remain confidential.</footer>
</body>
</html>`;

  return {
    filename: `CEDA-Receipt-${safeRef.replace(/[^A-Za-z0-9_-]/g, "")}.html`,
    mimeType: "text/html;charset=utf-8",
    content: html,
  };
}

export function buildOutcomeLetterDocument(app) {
  const safeRef = String(app?.reference || "CEDA-INN");
  const outcome = app?.outcomeData || {};
  const award = app?.awardData || {};
  const isAward = app?.status === "Awarded";
  const rawSteps = outcome.recommendedNextSteps ?? outcome.nextSteps;
  const steps = Array.isArray(rawSteps)
    ? rawSteps
    : typeof rawSteps === "string" && rawSteps.trim()
      ? [rawSteps.trim()]
      : [];
  const outcomeDate = (isAward ? award.conferredAt : null) || outcome.outcomeDate || outcome.releasedAt || app?.updatedAt || "Recorded";
  const feedback = (isAward && award.awardSummary) || outcome.applicantFeedback || outcome.feedback || "CEDA has released the formal outcome for your application.";
  const headingEyebrow = isAward
    ? "Citizen Entrepreneurial Development Agency: Innovation Award Notice"
    : "Citizen Entrepreneurial Development Agency: Innovation Outcome";
  const awardSection = isAward
    ? `<h2>Innovation award recognition</h2><div class="box"><p><strong>${escapeHtml(award.awardTitle || `CEDA Innovation Award: ${app?.title || ""}`)}</strong></p><p>Category: ${escapeHtml(award.awardCategory || "Innovation Recognition & Support")}${award.awardAmount ? ` &nbsp;|&nbsp; Package: ${escapeHtml(award.awardAmount)}` : ""}</p></div>`
    : "";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CEDA ${isAward ? "Innovation Award" : "Official Outcome"} Letter: ${escapeHtml(safeRef)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #241c19; background: #ffffff; margin: 40px auto; max-width: 760px; line-height: 1.55; padding: 0 20px; }
  header { border-bottom: 3px solid #9a3d2b; padding-bottom: 16px; margin-bottom: 24px; }
  .eyebrow { text-transform: uppercase; font-size: 12px; letter-spacing: 0.1em; color: #65564d; margin: 0 0 6px; }
  .status { display: inline-block; padding: 4px 12px; border-radius: 999px; font-weight: 700; background: #f7f2eb; border: 1px solid #d9d0c6; }
  h2 { font-size: 16px; margin: 22px 0 8px; }
  .box { background: #f7f2eb; padding: 16px; border-radius: 8px; }
  footer { margin-top: 32px; font-size: 12px; color: #65564d; border-top: 1px solid #d9d0c6; padding-top: 12px; }
</style>
</head>
<body>
  <header>
    <p class="eyebrow">${headingEyebrow}</p>
    <h1>${escapeHtml(app?.title || "Innovation Application")}</h1>
    <p>Reference: <strong>${escapeHtml(safeRef)}</strong> &nbsp;|&nbsp; Outcome: <span class="status">${escapeHtml(app?.status || "Completed")}</span></p>
    <p>${isAward ? "Award date" : "Outcome date"}: ${escapeHtml(outcomeDate)}</p>
  </header>
  ${awardSection}
  <h2>Official applicant feedback</h2>
  <div class="box"><p>${escapeHtml(feedback)}</p></div>
  <h2>Recommended next steps</h2>
  ${steps.length ? `<ol>${steps.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ol>` : "<p>Contact CEDA Support Desk inside the portal for tailored follow-up guidance.</p>"}
  <p>Support contact: ${escapeHtml(outcome.supportContact || "CEDA Innovation Support Desk (in-portal Help & support)")}</p>
  <footer>Issued through the CEDA Innovation Portal. This letter reflects the approved applicant-facing decision only.</footer>
</body>
</html>`;

  return {
    filename: `CEDA-${isAward ? "Award" : "Outcome"}-${safeRef.replace(/[^A-Za-z0-9_-]/g, "")}.html`,
    mimeType: "text/html;charset=utf-8",
    content: html,
  };
}

export function collectRequiredActions(apps = [], docs = []) {
  const actions = [];
  for (const app of apps || []) {
    if (!app?.id) continue;
    if (app.status === "Changes requested") {
      const req = activeRequestedChange(app);
      const deadline = req?.deadline;
      const sectionLabel = req?.sectionLabel || req?.section;
      actions.push({
        priority: 1,
        applicationId: app.id,
        reference: app.reference,
        title: `${app.reference}: ${app.title}`,
        actionLabel: "Submit requested clarification",
        detail: deadline
          ? `${sectionLabel || "Requested update"} due by ${deadline}`
          : (sectionLabel || "Provide additional information requested by CEDA"),
        buttonText: "Respond",
        targetMode: "changes",
      });
    } else if (app.status === "Draft") {
      const readiness = evaluateApplicationReadiness(app, docs);
      actions.push({
        priority: 2,
        applicationId: app.id,
        reference: app.reference,
        title: `${app.reference}: ${app.title}`,
        actionLabel: `Finish Step ${Number(app.currentStep || 1)} of 12`,
        detail: `${readiness.percentComplete}% ready (${readiness.completedSections.length}/12 steps ready to submit)`,
        buttonText: "Continue draft",
        targetMode: "wizard",
      });
    } else if (app.status === "Approved" || app.status === "Awarded" || app.status === "Rejected") {
      const isAward = app.status === "Awarded";
      const outDate = (isAward ? app.awardData?.conferredAt : null) || app.outcomeData?.outcomeDate || app.outcomeData?.releasedAt;
      actions.push({
        priority: 3,
        applicationId: app.id,
        reference: app.reference,
        title: `${app.reference}: ${app.title}`,
        actionLabel: isAward ? "Award conferred" : `Outcome available: ${app.status}`,
        detail: isAward
          ? (app.awardData?.awardTitle || (outDate ? `Conferred ${outDate}` : "View award notice and onboarding details"))
          : (outDate ? `Released ${outDate}` : "View feedback and outcome letter"),
        buttonText: isAward ? "View award" : "View outcome",
        targetMode: "summary",
      });
    }
  }
  return actions.sort((a, b) => a.priority - b.priority);
}

export function collectRecentActivity(apps = [], limit = 6) {
  const events = [];
  for (const app of apps || []) {
    if (!app?.id || !Array.isArray(app.timeline)) continue;
    for (const item of app.timeline) {
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
