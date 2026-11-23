/**
 * Shared domain helpers for Admin-managed Portal Content, Form configuration,
 * Accompanying Copies, and Official Botswana Regulatory Authority contacts.
 */

export const PORTAL_DOCUMENTS_BUCKET = "portal-documents";
export const PORTAL_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export const EDITABLE_CONTENT_TYPES = [
  "Public pages",
  "FAQs",
  "Announcements",
  "Partners",
  "Application form",
  "Accompanying copies",
  "Regulatory contacts",
];

export const CONTENT_TYPES = ["All", ...EDITABLE_CONTENT_TYPES];

export const CONTENT_STAGES = [
  "Draft",
  "Awaiting review",
  "Published",
  "Archived",
];

export const ALLOWED_PORTAL_DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
  "png",
  "jpg",
  "jpeg",
]);

export const REGULATORY_AUTHORITIES_BASELINE = [
  {
    authorityCode: "CIPA",
    title: "CIPA: Companies and Intellectual Property Authority",
    summary: "Company registration, business names, patents, trademarks, industrial designs and copyright.",
    phone: "+267 367 3700 / +267 367 3797",
    whatsapp: "+267 7326 3804",
    email: "info@cipa.co.bw",
    website: "https://www.cipa.co.bw",
    address: "Plot 54358, Prime Plaza, CBD, Gaborone (P.O. Box 102, Gaborone)",
    scope: "Company registration, business names, patents, trademarks, industrial designs & copyright",
  },
  {
    authorityCode: "BURS",
    title: "BURS: Botswana Unified Revenue Service",
    summary: "Taxpayer TIN registration, VAT, PAYE and Tax Clearance Certificates.",
    phone: "17649 / +267 363 8000",
    email: "callcenter@burs.org.bw",
    website: "https://www.burs.org.bw",
    address: "Plot 54379, CBD, Gaborone (Private Bag 0013, Gaborone)",
    scope: "Taxpayer TIN registration, VAT, PAYE & Tax Clearance Certificates",
  },
  {
    authorityCode: "BOBS",
    title: "BOBS: Botswana Bureau of Standards",
    summary: "Product standards, quality certification, conformity assessment and laboratory testing.",
    phone: "+267 390 3200 / Toll-Free 0800 600 941",
    email: "enquiries@bobstandards.bw",
    website: "https://www.bobstandards.bw",
    address: "Plot 55745, Block 8, Airport Road, Gaborone (Private Bag BO 48, Gaborone)",
    scope: "Product standards, quality marks, conformity assessment & laboratory testing",
  },
  {
    authorityCode: "BOCRA",
    title: "BOCRA: Botswana Communications Regulatory Authority",
    summary: "ICT licensing, telecommunications, type approval of radio devices and broadcasting.",
    phone: "+267 395 7755",
    email: "info@bocra.org.bw",
    website: "https://www.bocra.org.bw",
    address: "Plot 50671, Independence Avenue, Gaborone (Private Bag 00495, Gaborone)",
    scope: "ICT licensing, telecoms, radio frequency spectrum & equipment type approval",
  },
  {
    authorityCode: "BOB",
    title: "Bank of Botswana (BoB)",
    summary: "Banking licensing, payment systems oversight and payment-service fintech compliance.",
    phone: "+267 360 6000",
    email: "info@bob.bw",
    website: "https://www.bankofbotswana.bw",
    address: "17938 Khama Crescent, Gaborone (Private Bag 154, Gaborone)",
    scope: "Banking licensing, payment systems oversight & payment fintech regulation",
  },
  {
    authorityCode: "NBFIRA",
    title: "NBFIRA: Non-Bank Financial Institutions Regulatory Authority",
    summary: "Microlending, insurance, capital markets, pensions and non-bank fintech oversight.",
    phone: "+267 310 2595 / +267 368 6100",
    email: "info@nbfira.org.bw",
    website: "https://www.nbfira.org.bw",
    address: "3rd Floor, Exponential Building, Plot 54351, New CBD, Gaborone (Private Bag 00314, Gaborone)",
    scope: "Microlending, insurance, capital markets & non-bank financial services",
  },
  {
    authorityCode: "BERA",
    title: "BERA: Botswana Energy Regulatory Authority",
    summary: "Renewable energy, solar micro-grids, electricity generation and petroleum licensing.",
    phone: "+267 316 1064 / Toll-Free 0800 00 2372",
    email: "info@bera.co.bw",
    website: "https://www.bera.co.bw",
    address: "Plot 75782, Building 2, Pinnacle Park, Setlhoa, Block 10, Gaborone",
    scope: "Electricity generation, solar energy, biofuels & petroleum licensing",
  },
  {
    authorityCode: "BOMRA",
    title: "BOMRA: Botswana Medicines Regulatory Authority",
    summary: "Medicines, diagnostics, medical devices and health-product safety registration.",
    phone: "+267 373 1720 / +267 318 6254",
    email: "info@bomra.org.bw",
    website: "https://www.bomra.org.bw",
    address: "Plot 112, Gaborone International Finance Park, Gaborone",
    scope: "Medicines, medical devices, diagnostics & health-product regulation",
  },
];

export const DEFAULT_APPLICATION_FORM_CONFIG = {
  formTitle: "CEDA Innovation Portal: Official Submission Form",
  formVersion: "2026.1",
  introGuidance: "Complete all required sections and upload relevant accompanying copies matched to your innovation stage.",
  maxEvidenceFileMb: 15,
  maxVideoUrlNote: "Share product demos or pitch videos as HTTPS links (YouTube, Vimeo, or cloud drive preview links).",
  steps: [
    { stepNumber: 1, key: "applicant", title: "Applicant & organisation", description: "Applicant identity, Botswana district and company details when applicable.", enabled: true, mandatoryFields: ["applicantType"] },
    { stepNumber: 2, key: "overview", title: "Innovation overview", description: "Title, primary sector, innovation stage and executive summary.", enabled: true, mandatoryFields: ["title", "primarySector", "innovationStage", "summary"] },
    { stepNumber: 3, key: "problem", title: "Problem & need", description: "Clear problem statement, target beneficiaries and market evidence in Botswana.", enabled: true, mandatoryFields: ["problem"] },
    { stepNumber: 4, key: "solution", title: "Proposed solution", description: "Solution description, innovation novelty and differentiation.", enabled: true, mandatoryFields: ["solution"] },
    { stepNumber: 5, key: "implementation", title: "Implementation readiness", description: "Delivery approach, execution plan and rollout milestones.", enabled: true, mandatoryFields: ["implementationApproach"] },
    { stepNumber: 6, key: "commercial", title: "Market & sustainability", description: "Revenue model, pricing, unit economics and long-term viability.", enabled: true, mandatoryFields: [] },
    { stepNumber: 7, key: "regulatory", title: "IP & regulatory compliance", description: "IP ownership status and approvals needed from Botswana regulatory authorities.", enabled: true, mandatoryFields: [] },
    { stepNumber: 8, key: "impact", title: "Impact & jobs", description: "Projected employment creation, citizen empowerment and socioeconomic impact.", enabled: true, mandatoryFields: [] },
    { stepNumber: 9, key: "financials", title: "Financial request & funding", description: "Funding amount sought, use of funds and financial readiness.", enabled: true, mandatoryFields: [] },
    { stepNumber: 10, key: "risks", title: "Risks & mitigation", description: "Key operational, technical, financial and regulatory risks and mitigations.", enabled: true, mandatoryFields: [] },
    { stepNumber: 11, key: "evidence", title: "Accompanying copies & verification", description: "Upload applicant verification records and supporting copies matching your stage.", enabled: true, mandatoryFields: [] },
    { stepNumber: 12, key: "review", title: "Review & declarations", description: "Confirm authorship permission, accuracy and privacy notices before submission.", enabled: true, mandatoryFields: ["permissionToSubmit", "accuracyConfirmed", "privacyConfirmed"] },
  ],
  requiredDocuments: [
    { id: "doc_identity", label: "Omang / National ID or Passport copy", category: "Applicant verification", required: true, appliesTo: "All applicants", maxSizeMb: 5, acceptedFormats: "PDF, JPG, PNG", guidance: "Clear readable copy of the lead applicant's Omang or passport." },
    { id: "doc_cipa", label: "CIPA Company Extract / Certificate of Incorporation", category: "Registered entity copies", required: false, appliesTo: "Registered companies", maxSizeMb: 10, acceptedFormats: "PDF, DOCX", guidance: "Mandatory when applying as a Registered company; include shareholder and director extract." },
    { id: "doc_burs", label: "BURS Tax Clearance Certificate", category: "Compliance copies", required: false, appliesTo: "Registered companies / Growth stage", maxSizeMb: 5, acceptedFormats: "PDF", guidance: "Active BURS tax clearance or TIN registration confirmation where applicable." },
    { id: "doc_pitch", label: "Pitch Deck / Technical Concept Brief", category: "Technical & commercial evidence", required: true, appliesTo: "All stages", maxSizeMb: 15, acceptedFormats: "PDF, PPTX, DOCX", guidance: "Concise deck or brief outlining problem, solution, traction and budget." },
    { id: "doc_financials", label: "Financial Projections / Cost Breakdown", category: "Financial evidence", required: false, appliesTo: "MVP / Pilot / Growth", maxSizeMb: 10, acceptedFormats: "XLSX, PDF, CSV", guidance: "Itemised use of funds and 12 to 36 month revenue/expense forecast." },
    { id: "doc_regulatory", label: "Sector Regulatory Clearance or Standards Evidence", category: "Regulatory copies", required: false, appliesTo: "Regulated sectors", maxSizeMb: 10, acceptedFormats: "PDF, DOCX", guidance: "BOBS test report, BOCRA type approval, BOMRA dossier, BERA permit, or BoB/NBFIRA correspondence where relevant." },
  ],
  customFields: [],
};

/**
 * Normalize an Admin-edited application_form_config payload onto safe defaults.
 */
export function normalizeApplicationFormConfig(rawConfig) {
  const src = rawConfig && typeof rawConfig === "object" ? rawConfig : {};
  const rawSteps = Array.isArray(src.steps) ? src.steps : [];
  const stepMap = new Map(
    rawSteps
      .filter((s) => s && Number.isFinite(Number(s.stepNumber)))
      .map((s) => [Number(s.stepNumber), s]),
  );

  const steps = DEFAULT_APPLICATION_FORM_CONFIG.steps.map((base) => {
    const override = stepMap.get(base.stepNumber) || {};
    return {
      stepNumber: base.stepNumber,
      key: base.key,
      title: String(override.title || base.title).trim() || base.title,
      description: String(override.description || base.description).trim() || base.description,
      enabled: override.enabled !== false,
      mandatoryFields: Array.isArray(override.mandatoryFields) ? override.mandatoryFields : base.mandatoryFields,
    };
  });

  const requiredDocuments = Array.isArray(src.requiredDocuments) && src.requiredDocuments.length
    ? src.requiredDocuments
        .filter((doc) => doc && String(doc.label || "").trim())
        .map((doc, idx) => ({
          id: String(doc.id || `doc_${idx + 1}`).trim(),
          label: String(doc.label).trim(),
          category: String(doc.category || "Accompanying copies").trim(),
          required: Boolean(doc.required),
          appliesTo: String(doc.appliesTo || "All applicants").trim(),
          maxSizeMb: Math.min(50, Math.max(1, Number(doc.maxSizeMb) || 10)),
          acceptedFormats: String(doc.acceptedFormats || "PDF, DOCX").trim(),
          guidance: String(doc.guidance || "").trim(),
        }))
    : DEFAULT_APPLICATION_FORM_CONFIG.requiredDocuments.map((d) => ({ ...d }));

  const customFields = Array.isArray(src.customFields)
    ? src.customFields
        .filter((f) => f && String(f.label || "").trim())
        .map((f, idx) => {
          const cleanLabel = String(f.label).trim();
          const generatedKey = cleanLabel
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 40) || `custom_field_${idx + 1}`;
          const key = String(f.key || generatedKey).trim().slice(0, 48);
          const allowedTypes = new Set(["text", "textarea", "select", "url", "checkbox"]);
          const fieldType = allowedTypes.has(String(f.fieldType)) ? String(f.fieldType) : "text";
          const stepNumber = Math.min(10, Math.max(1, Number(f.stepNumber) || 2));
          return {
            id: String(f.id || key).trim(),
            key,
            label: cleanLabel,
            stepNumber,
            fieldType,
            required: Boolean(f.required),
            enabled: f.enabled !== false,
            placeholder: String(f.placeholder || "").trim(),
            helpText: String(f.helpText || "").trim(),
            options: Array.isArray(f.options)
              ? f.options.map((o) => String(o).trim()).filter(Boolean)
              : String(f.options || "")
                  .split(",")
                  .map((o) => o.trim())
                  .filter(Boolean),
          };
        })
    : [];

  return {
    formTitle: String(src.formTitle || DEFAULT_APPLICATION_FORM_CONFIG.formTitle).trim(),
    formVersion: String(src.formVersion || DEFAULT_APPLICATION_FORM_CONFIG.formVersion).trim(),
    introGuidance: String(src.introGuidance || DEFAULT_APPLICATION_FORM_CONFIG.introGuidance).trim(),
    maxEvidenceFileMb: Math.min(50, Math.max(1, Number(src.maxEvidenceFileMb) || DEFAULT_APPLICATION_FORM_CONFIG.maxEvidenceFileMb)),
    maxVideoUrlNote: String(src.maxVideoUrlNote || DEFAULT_APPLICATION_FORM_CONFIG.maxVideoUrlNote).trim(),
    steps,
    requiredDocuments,
    customFields,
  };
}

/**
 * Evaluate required Admin-configured custom fields against an application formData object.
 */
export function validateCustomFormResponses(rawConfig, formData = {}) {
  const config = normalizeApplicationFormConfig(rawConfig);
  const responses = formData?.customResponses && typeof formData.customResponses === "object"
    ? formData.customResponses
    : {};
  const missingFields = [];

  for (const field of config.customFields) {
    if (!field.enabled || !field.required) continue;
    const rawVal = responses[field.key];
    const filled = field.fieldType === "checkbox"
      ? rawVal === true || rawVal === "true" || rawVal === "Yes"
      : String(rawVal ?? "").trim().length > 0;
    if (!filled) {
      missingFields.push({
        key: field.key,
        label: field.label,
        stepNumber: field.stepNumber,
      });
    }
  }

  return {
    missingFields,
    firstMissingStep: missingFields.length ? missingFields[0].stepNumber : null,
  };
}

/**
 * Build public Storage download URL for an Admin-uploaded portal document.
 */
export function buildPortalDocumentPublicUrl(supabaseUrl, attachmentPath) {
  const cleanBase = String(supabaseUrl || "").trim().replace(/\/+$/, "");
  const cleanPath = String(attachmentPath || "").trim().replace(/^\/+/, "");
  if (!cleanBase || !cleanPath || cleanPath.includes("..")) return "";
  const encoded = cleanPath.split("/").map((seg) => encodeURIComponent(seg)).join("/");
  return `${cleanBase}/storage/v1/object/public/${PORTAL_DOCUMENTS_BUCKET}/${encoded}`;
}

/**
 * Validate a local File selected by Admin for upload into portal-documents.
 */
export function validatePortalDocumentFile(file) {
  if (!file) return { valid: false, message: "Choose a file first." };
  const size = Number(file.size || 0);
  if (size <= 0) return { valid: false, message: "Selected file is empty." };
  if (size > PORTAL_DOCUMENT_MAX_BYTES) {
    return { valid: false, message: "File exceeds the 10 MB limit for portal content uploads." };
  }
  const name = String(file.name || "");
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  if (!ALLOWED_PORTAL_DOCUMENT_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      message: "Unsupported file format. Upload PDF, DOCX, XLSX, PPTX, TXT, CSV, PNG or JPG.",
    };
  }
  return { valid: true, message: "" };
}

/**
 * Sanitize a file name into a safe portal-documents storage path under content/.
 */
export function makePortalDocumentStoragePath(fileName) {
  const raw = String(fileName || "document.pdf");
  const lastDot = raw.lastIndexOf(".");
  const base = (lastDot > 0 ? raw.slice(0, lastDot) : raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "document";
  const ext = (lastDot > 0 ? raw.slice(lastDot + 1) : "pdf")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8) || "pdf";
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `content/${stamp}-${rand}-${base}.${ext}`;
}

/**
 * Format structured Botswana regulatory authority contact details into normalized JSON + readable body.
 */
export function buildRegulatoryContactPayload(details = {}) {
  const clean = {
    authorityCode: String(details.authorityCode || "").trim().toUpperCase().slice(0, 32),
    fullName: String(details.fullName || "").trim().slice(0, 160),
    phone: String(details.phone || "").trim().slice(0, 120),
    whatsapp: String(details.whatsapp || "").trim().slice(0, 60),
    email: String(details.email || "").trim().slice(0, 140),
    website: String(details.website || "").trim().slice(0, 300),
    address: String(details.address || "").trim().slice(0, 240),
    scope: String(details.scope || "").trim().slice(0, 240),
  };
  const parts = [];
  if (clean.fullName) parts.push(clean.fullName + (clean.authorityCode ? ` (${clean.authorityCode})` : ""));
  if (clean.scope) parts.push(`Scope: ${clean.scope}.`);
  if (clean.phone) parts.push(`Phone: ${clean.phone}.`);
  if (clean.whatsapp) parts.push(`WhatsApp: ${clean.whatsapp}.`);
  if (clean.email) parts.push(`Email: ${clean.email}.`);
  if (clean.website) parts.push(`Website: ${clean.website}.`);
  if (clean.address) parts.push(`Address: ${clean.address}.`);
  return {
    contactDetails: clean,
    formattedBody: parts.join(" "),
  };
}

export const HOSTING_SUPPORT_SLA = Object.freeze({
  hostingStack: "Supabase Managed PostgreSQL / Auth / Storage / Edge Functions + Vercel Edge CDN (Africa/Gaborone UTC+2)",
  availabilityTarget: "99.9% monthly portal availability with automated circuit breakers and zero-downtime deployments",
  supportHours: "Live CEDA consultant desk Mon to Fri 09:00 to 16:00 CAT · 24/7 P1 emergency hosting & security remediation",
  backupRecovery: {
    rpo: "24 hours daily automated encrypted snapshots (PITR enabled in production)",
    rto: "4 hours full database & storage restoration turnaround",
    rollbackTurnaround: "15 minutes instant deployment rollback on Vercel Edge",
  },
  channels: {
    portalQueue: "In-portal Follow-ups & Live Chat Escalations",
    email: "support@ceda.co.bw",
    securityEscalation: "Administrator Audit & MFA Incident Containment",
  },
  tiers: [
    {
      severity: "P1: Critical",
      scope: "Portal unreachable, authentication outage, or data-isolation security fault",
      acknowledgement: "15 minutes",
      containment: "1 hour",
      resolutionTurnaround: "4 hours",
      escalationOwner: "24/7 On-Call SRE & Security Lead",
    },
    {
      severity: "P2: High",
      scope: "Evidence uploads failing, live chat down during 09:00 to 16:00 working days, or alert outbox stalled",
      acknowledgement: "30 minutes",
      containment: "2 hours",
      resolutionTurnaround: "8 working hours",
      escalationOwner: "Tier-2 Platform Engineer & Support Lead",
    },
    {
      severity: "P3: Normal",
      scope: "Non-blocking UI fault, report export edge case, or delayed catalog cache refresh",
      acknowledgement: "2 working hours",
      containment: "1 working day",
      resolutionTurnaround: "2 working days",
      escalationOwner: "Product Support & Maintenance Engineering",
    },
    {
      severity: "P4: Low",
      scope: "Minor copy, cosmetic layout, or planned enhancement request",
      acknowledgement: "1 working day",
      containment: "Scheduled release",
      resolutionTurnaround: "5 working days",
      escalationOwner: "Release & UX Maintenance Cycle",
    },
  ],
});
