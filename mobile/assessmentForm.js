/** @type {Array<{title: string, section: string, fields: [string, string][]}>} */
export const reviewSteps = [
  { title: "Application information", section: "applicant", fields: [["applicantType","Applicant type"],["fullName","Full name"],["email","Email address"],["phone","Phone number"],["district","District"],["expertise","Applicant role or background"],["hasCollaborators","Applying with co-founders or collaborators?"],["collaboratorsText","Co-founders / collaborators"],["alternativeContactName","Alternative contact name"],["alternativeContactRelationship","Relationship"],["alternativeContactPhone","Alternative contact phone"],["alternativeContactConsent","Alternative contact consent"],["companyName","Registered company name"],["companyRegNumber","CIPA / Registration number"],["companySector","Company sector"],["representativeRole","Your role in the company"],["companyAuthority","Authorized company representative"]] },
  { title: "Innovation", section: "applicant", fields: [["title","Innovation title"],["summary","Plain-language summary"],["primarySector","Primary sector"],["technologyMethod","Core technology or method"],["innovationType","What kind of innovation is this?"]] },
  { title: "Problem being addressed", section: "problem", fields: [["problem","Problem being addressed"],["problemUrgency","Why this problem needs solving now"]] },
  { title: "Proposed solution", section: "problem", fields: [["solution","Proposed solution & how it works"],["hasAlternatives","Are alternatives already available in the market?"],["testedWithUsers","Have you tested with users?"],["alternativesDetail","Existing alternatives"],["testingLessons","Lessons from testing"]] },
  { title: "Target users or beneficiaries", section: "impact", fields: [["beneficiaries","Target users or beneficiaries"],["deploymentFootprint","Deployment footprint"],["empowermentFocus","Empowerment focus"],["botswanaBenefit","Benefit to Botswana"],["environmentalImpact","Environmental impact"],["environmentalNotes","Environmental notes"]] },
  { title: "Market and impact", section: "impact", fields: [["marketDemand","Market demand"],["createsJobs","Will this create jobs?"],["jobsYear1","Jobs in year 1"],["jobsYear3","Jobs in year 3"],["jobsYear5","Jobs in year 5"],["jobsAssumptions","Job creation assumptions"]] },
  { title: "Innovation stage", section: "feasibility", fields: [["stage","Current innovation stage"],["stageEvidenceNotes","Stage evidence"],["stageMilestoneNext","Next milestone"]] },
  { title: "Implementation plan", section: "feasibility", fields: [["implementationApproach","Implementation approach"],["milestone1Year","Year 1 milestone"],["milestone3Year","Year 3 milestone"],["milestone5Year","Year 5 milestone"],["risksAndMitigations","Risks and mitigations"]] },
  { title: "Team information", section: "feasibility", fields: [["teamExperience","Team experience"],["resourcesNeeded","Resources needed"],["partnerships","Partnerships"]] },
  { title: "Financial or support requirements", section: "supplementary", fields: [["supportRequestedSummary","Support requested"],["hasBusinessPlan","Business plan available?"],["hasFinancialProjections","Financial projections available?"],["financialAssumptions","Financial assumptions"]] },
  { title: "Supporting evidence", section: "supplementary", fields: [] },
  { title: "Declaration and review", section: "supplementary", fields: [["selfDeveloped","Developed by you or your team?"],["otherContributors","Third-party IP contributors?"],["sharedPublicly","Technical trade secrets published openly?"],["existingAgreements","Existing funding or investor agreements?"],["permissionToSubmit","Permission to submit"],["accuracyConfirmed","Accuracy declaration"],["privacyConfirmed","Consent to confidential processing"]] },
];
export const scoreLabels = ["", "Very poor", "Poor", "Adequate", "Good", "Excellent"];
const documentAnswer = { problem: "problemDocument", solution: "solutionDocument", implementationApproach: "implementationDocument" };
const generalEvidenceStep = { applicant: 0, problem: 2, impact: 5, feasibility: 7, supplementary: 10, clarification: 10 };
/** @param {unknown} value @returns {string} */
export function reviewAnswer(value) {
  if (Array.isArray(value)) return value.map(reviewAnswer).filter(Boolean).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
/** @param {Record<string, unknown>} form @param {Array<{id: string, category?: string, sectionKey?: string, videoUrl?: string|null, docKind?: string}>} documents */
export function buildReviewSteps(form, documents) {
  const linkedFields = new Map();
  for (const [field, key] of Object.entries(documentAnswer)) {
    if (form[key]) linkedFields.set(form[key], field);
  }
  for (const doc of documents) {
    const field = doc.category?.startsWith("Answer: ") ? doc.category.slice(8) : "";
    const normalized = field === "implementation" ? "implementationApproach" : field;
    if (Object.hasOwn(documentAnswer, normalized) && !linkedFields.has(doc.id)) linkedFields.set(doc.id, normalized);
  }
  return reviewSteps.map((step, index) => ({
    ...step,
    answers: step.fields.filter(([key]) => form.applicantType !== "Individual" || !["companyName","companyRegNumber","companySector","representativeRole","companyAuthority"].includes(key))
      .map(([key, label]) => ({
        key, label, value: reviewAnswer(form[key]),
        documentIds: documents.filter(doc => linkedFields.get(doc.id) === key).map(doc => doc.id)
      })).filter(answer => answer.value.trim() || answer.documentIds.length),
    documentIds: documents.filter(doc => !linkedFields.has(doc.id) &&
      (doc.videoUrl || doc.docKind === "video_link" ? index === 10 : (Object.entries(generalEvidenceStep).find(([key]) => key === doc.sectionKey)?.[1] ?? 10) === index))
      .map(doc => doc.id)
  }));
}
