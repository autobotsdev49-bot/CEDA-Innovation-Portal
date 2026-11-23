import test from "node:test";
import assert from "node:assert/strict";
import {
  WIZARD_STEPS,
  INNOVATION_STAGES,
  STAGE_MATRIX,
  EVIDENCE_RULES,
  documentChecklist,
  linkedDocumentIsValid,
  sectionFileLimit,
  evaluateStepReadiness,
  evaluateApplicationReadiness,
  validateEvidenceFile,
  validateVideoLink,
  filterAndSortApplications,
  canWithdrawApplication,
  applicationRequiredAction,
  buildSubmissionReceiptDocument,
  buildOutcomeLetterDocument,
  collectRequiredActions,
  collectRecentActivity,
} from "../src/publicSite/assets/applicationWizard.js";
import { pages, renderPage } from "../src/publicSite/pages.ts";

test("Document-backed answers need a saved file belonging to the matching section", () => {
  const form = { problemSource: "document", problemDocument: "one" };
  const file = { id: "one", sectionKey: "problem", docKind: "file", uploadStatus: "Saved" };
  assert.equal(linkedDocumentIsValid(form, [file], "problemSource", "problemDocument", "problem"), true);
  assert.equal(linkedDocumentIsValid(form, [{ ...file, uploadStatus: "Removed" }], "problemSource", "problemDocument", "problem"), false);
  assert.equal(linkedDocumentIsValid(form, [{ ...file, sectionKey: "impact" }], "problemSource", "problemDocument", "problem"), false);
  assert.equal(linkedDocumentIsValid({ ...form, problemSource: "write" }, [], "problemSource", "problemDocument", "problem"), true);
});

test("Document checklist changes by applicant type and evidence limits reserve room for company records", () => {
  const individual = documentChecklist("Individual");
  const company = documentChecklist("Registered company");
  assert.ok(individual.some(item => item.label === "Certified applicant identity"));
  assert.ok(company.some(item => item.label === "Directors, shareholders and certified identity records"));
  assert.ok(!individual.some(item => item.label === "Directors, shareholders and certified identity records"));
  assert.equal(sectionFileLimit("applicant"), 12);
  assert.equal(sectionFileLimit("supplementary"), 8);
  assert.equal(sectionFileLimit("problem"), 4);
});

test("Innovator wizard defines all 12 required steps and 6 adaptive stages", () => {
  assert.equal(WIZARD_STEPS.length, 12);
  assert.deepEqual(
    WIZARD_STEPS.map(s => s.title),
    [
      "Applicant information",
      "Innovation overview",
      "Problem being addressed",
      "Proposed solution",
      "Target users or beneficiaries",
      "Market and impact",
      "Innovation stage",
      "Implementation plan",
      "Team information",
      "Financial or support requirements",
      "Supporting evidence",
      "Declaration and review",
    ],
  );
  assert.deepEqual(INNOVATION_STAGES, ["Idea", "R&D", "Prototype", "Pilot", "Operational", "Scaling"]);
  for (const stage of INNOVATION_STAGES) {
    assert.ok(STAGE_MATRIX[stage]?.summary);
    assert.ok(STAGE_MATRIX[stage]?.metricsLabel);
  }
});

test("Application readiness enforces Individual vs Registered company and declaration blockers", () => {
  const companyDraft = {
    id: "app-1",
    formData: {
      applicantType: "Registered company",
      fullName: "Kabo Modise",
      email: "kabo@example.invalid",
      district: "Gaborone",
      companyName: "",
      representativeRole: "Director",
      companyAuthority: false,
      title: "Kalahari Solar Coldroom",
      primarySector: "Agriculture",
      summary: "Mobile off-grid solar refrigeration unit reducing agricultural harvest spoilage.",
      problem: "Rural horticultural farmers lose perishable produce before reaching town markets.",
      problemUrgency: "High spoilage losses every summer harvest.",
      solution: "Modular phase-change thermal solar cold storage rented per crate.",
      beneficiaries: ["Smallholder farmers"],
      botswanaBenefit: "Preserves harvests across Central and Kweneng districts.",
      marketDemand: "Over 400 horticultural cooperatives seeking cold-chain access.",
      stage: "Pilot",
      stageEvidenceNotes: "Deployed 2 trial containers in Mahalapye with 94% uptime.",
      implementationApproach: "Assemble local enclosures in Gaborone and lease hubs to cooperatives.",
      risksAndMitigations: "Battery theft mitigated by GPS telemetry and cooperative caretakers.",
      teamExperience: "10 years combined solar PV and agribusiness operations.",
      supportRequestedSummary: "Technical scale advisory and pilot working capital facility.",
      permissionToSubmit: true,
      accuracyConfirmed: false,
      privacyConfirmed: true,
    },
  };

  const incomplete = evaluateApplicationReadiness(companyDraft, []);
  assert.equal(incomplete.readyToSubmit, false);
  assert.ok(incomplete.blockers.some(b => b.step === 1));
  assert.ok(incomplete.blockers.some(b => b.step === 12));

  companyDraft.formData.companyName = "Kalahari Cold Systems (Pty) Ltd";
  companyDraft.formData.companyAuthority = true;
  companyDraft.formData.accuracyConfirmed = true;
  const ready = evaluateApplicationReadiness(companyDraft, [
    { id: "doc-1", applicationId: "app-1", sectionKey: "feasibility", docKind: "file", uploadStatus: "Saved" },
  ]);
  assert.equal(ready.readyToSubmit, true);
  assert.equal(ready.percentComplete, 100);
});

test("Evidence validation enforces file type, 10 MB limit, 4-file section cap, and HTTPS video links", () => {
  const existing = Array.from({ length: 4 }, (_, i) => ({
    sectionKey: "problem",
    docKind: "file",
    uploadStatus: "Saved",
    fileName: `doc-${i}.pdf`,
  }));

  assert.match(
    validateEvidenceFile({ name: "extra.pdf", type: "application/pdf", size: 2048 }, existing, "problem", "file"),
    /Maximum 4 supporting files/,
  );
  assert.equal(
    validateEvidenceFile({ name: "impact.pdf", type: "application/pdf", size: 2048 }, existing, "impact", "file"),
    null,
  );
  assert.match(
    validateEvidenceFile({ name: "script.exe", type: "application/x-msdownload", size: 512 }, [], "impact", "file"),
    /Supported formats/,
  );
  assert.match(
    validateEvidenceFile({ name: "huge.pdf", type: "application/pdf", size: EVIDENCE_RULES.maxBytes + 1 }, [], "impact", "file"),
    /10 MB maximum/,
  );

  assert.equal(validateVideoLink("https://video.example.com/demo"), null);
  assert.match(validateVideoLink("http://video.example.com/demo"), /https:\/\//);
  assert.match(validateVideoLink("javascript:alert(1)"), /https:\/\//);
});

test("My applications filter, sort, pagination, withdrawal eligibility, and required action behave cleanly", () => {
  const apps = [
    { id: "1", reference: "CEDA-001", title: "Alpha Grid", applicant: "A", applicantType: "Individual", sector: "Energy", status: "Draft", currentStep: 4, updatedAt: "2026-11-20", createdAt: "2026-11-18" },
    { id: "2", reference: "CEDA-002", title: "Beta Water", applicant: "B", applicantType: "Registered company", sector: "Agriculture", status: "Approved", updatedAt: "2026-11-21", createdAt: "2026-11-10", submittedDate: "2026-11-12" },
    { id: "3", reference: "CEDA-003", title: "Gamma Seed", applicant: "C", applicantType: "Individual", sector: "Agriculture", status: "Changes requested", requestedChanges: { deadline: "2026-11-30" }, updatedAt: "2026-11-19", createdAt: "2026-11-11" },
  ];

  const completed = filterAndSortApplications(apps, { status: "Completed" });
  assert.equal(completed.total, 1);
  assert.equal(completed.items[0].reference, "CEDA-002");

  const search = filterAndSortApplications(apps, { query: "seed" });
  assert.equal(search.total, 1);
  assert.equal(search.items[0].status, "Changes requested");

  assert.equal(canWithdrawApplication("Draft"), true);
  assert.equal(canWithdrawApplication("In review"), false);
  assert.equal(canWithdrawApplication("Approved"), false);
  assert.match(applicationRequiredAction(apps[2]), /2026-11-30/);
});

test("Receipt and outcome letters escape HTML cleanly and strip unsafe script tags", () => {
  const dirtyApp = {
    id: "app-x",
    reference: "CEDA-INN-2026-00099",
    title: 'Smart <script>alert("xss")</script> Grid',
    applicant: "Test <Founder>",
    applicantType: "Individual",
    sector: "Energy",
    status: "Approved",
    receiptCode: "RCPT-1234ABCD",
    submittedDate: "2026-11-21",
    outcomeData: {
      outcomeDate: "2026-11-25",
      applicantFeedback: "Strong <b>technical</b> merit.",
      recommendedNextSteps: ["Schedule contracting briefing"],
    },
  };

  const receipt = buildSubmissionReceiptDocument(dirtyApp, []);
  assert.equal(receipt.filename, "CEDA-Receipt-CEDA-INN-2026-00099.html");
  assert.equal(receipt.content.includes("<script>"), false);
  assert.equal(receipt.content.includes("&lt;script&gt;"), true);

  const letter = buildOutcomeLetterDocument(dirtyApp);
  assert.equal(letter.filename, "CEDA-Outcome-CEDA-INN-2026-00099.html");
  assert.equal(letter.content.includes("<b>technical</b>"), false);
  assert.equal(letter.content.includes("&lt;b&gt;technical&lt;/b&gt;"), true);
});

test("Rendered Innovator portal /account/ enforces CSP safety, unique IDs, and required navigation structure", () => {
  const html = renderPage("/account/", pages["/account/"]);
  assert.match(html, /\/assets\/innovator\.css/);
  assert.match(html, /\/assets\/admin\.css/);
  assert.match(html, /\/assets\/innovator\.js/);
  assert.equal(/\sstyle="/i.test(html), false, "Inline style attributes violate strict style-src 'self' CSP");

  // Every required navigation destination exists with collapsed tooltip
  for (const label of ["Overview", "My applications", "Submit innovation", "Messages", "Verification documents", "Help and support", "Account and settings"]) {
    assert.ok(html.includes(`data-tooltip="${label}"`), `Missing nav tooltip for ${label}`);
  }
  assert.equal(html.includes('data-tooltip="Optimus Prime"'), false, "The assistant is opened as a floating chat, not sidebar navigation");

  // Notifications bell stays in header, not in sidebar <nav>
  const navMatch = html.match(/<nav id="innovator-primary-navigation"[\s\S]*?<\/nav>/);
  assert.ok(navMatch);
  assert.equal(navMatch[0].includes("data-open-notifications"), false);
  assert.ok(html.includes('data-open-notifications'));

  // All element IDs in rendered /account/ are strictly unique
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const uniqueIds = new Set(ids);
  assert.equal(ids.length, uniqueIds.size, "Duplicate HTML id detected in rendered Innovator page");
});

test("Overview stays focused and Optimus Prime provides dedicated chat, topics, disclaimer and support handoff", () => {
  const html = renderPage("/account/", pages["/account/"]);
  const overviewMatch = html.match(/<section id="overview"[\s\S]*?<\/section>/);
  assert.ok(overviewMatch);
  const overviewHtml = overviewMatch[0];
  assert.ok(overviewHtml.includes('data-overview-progress'));
  assert.ok(overviewHtml.includes('data-overview-required-actions'));
  assert.ok(overviewHtml.includes('data-overview-recent-activity'));
  assert.ok(overviewHtml.includes('data-overview-messages-deadlines'));
  // Ensure Overview is not crowded with inline Optimus chat widgets
  assert.equal(overviewHtml.includes('data-optimus-feed'), false);
  assert.equal(overviewHtml.includes('data-quick-optimus'), false);

  const optimusMatch = html.match(/<section id="optimus"[\s\S]*?<\/section>/);
  assert.ok(optimusMatch);
  const optimusHtml = optimusMatch[0];
  assert.ok(optimusHtml.includes('role="log"'));
  assert.ok(optimusHtml.includes('id="optimus-question-input"'));
  assert.ok(optimusHtml.includes('data-optimus-clear'));
  assert.ok(optimusHtml.includes('data-optimus-disclaimer'));
  assert.ok(optimusHtml.includes('data-optimus-escalate-form'));
  for (const topic of ["Portal navigation", "Eligibility", "Application sections", "Evidence requirements"]) {
    assert.ok(optimusHtml.includes(topic), `Missing Optimus topic: ${topic}`);
  }

  const actions = collectRequiredActions([
    { id: "a", reference: "CEDA-1", title: "Draft 1", status: "Draft", currentStep: 3, formData: {} },
    { id: "b", reference: "CEDA-2", title: "Clarify 2", status: "Changes requested", requestedChanges: { deadline: "2026-11-28" } },
    { id: "c", reference: "CEDA-3", title: "Done 3", status: "Approved", outcomeData: { outcomeDate: "2026-11-20" } },
  ], []);
  assert.deepEqual(actions.map(a => a.reference), ["CEDA-2", "CEDA-1", "CEDA-3"]);

  const activity = collectRecentActivity([
    { id: "a", reference: "CEDA-1", title: "App 1", status: "Submitted", timeline: [{ label: "Draft created", detail: "Started", at: "2026-11-18 09:00" }, { label: "Submitted", detail: "Sent", at: "2026-11-20 14:30" }] },
  ], 5);
  assert.equal(activity.length, 2);
  assert.equal(activity[0].label, "Submitted");
});
