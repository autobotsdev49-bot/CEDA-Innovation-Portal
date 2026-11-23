import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CONTENT_TYPES,
  DEFAULT_APPLICATION_FORM_CONFIG,
  PORTAL_DOCUMENTS_BUCKET,
  REGULATORY_AUTHORITIES_BASELINE,
  buildPortalDocumentPublicUrl,
  buildRegulatoryContactPayload,
  makePortalDocumentStoragePath,
  normalizeApplicationFormConfig,
  validateCustomFormResponses,
  validatePortalDocumentFile,
} from "../src/publicSite/assets/portalCatalog.js";
import { evaluateApplicationReadiness as webEvaluateReadiness } from "../src/publicSite/assets/applicationWizard.js";
import { evaluateApplicationReadiness as mobileEvaluateReadiness } from "../mobile/innovatorDomain.ts";
import * as mobileCatalog from "../mobile/portalCatalog.ts";
import { pages, renderPage } from "../src/publicSite/pages.ts";

process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://cedatest.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_test_key_123456";
const { deleteAdminContent, saveAdminContent } = await import("../mobile/auth.ts?test=adminGovernance");

test("portalCatalog and mobile/portalCatalog stay synchronized for content kinds, regulatory contacts and default form config", () => {
  for (const kind of ["Application form", "Accompanying copies", "Regulatory contacts", "FAQs", "Public pages", "Announcements", "Partners"]) {
    assert.ok(CONTENT_TYPES.includes(kind), `Missing content kind: ${kind}`);
    assert.ok(mobileCatalog.CONTENT_TYPES.includes(kind), `Mobile missing content kind: ${kind}`);
  }

  const webCodes = REGULATORY_AUTHORITIES_BASELINE.map((r) => r.authorityCode);
  const mobileCodes = mobileCatalog.REGULATORY_AUTHORITIES_BASELINE.map((r) => r.authorityCode);
  assert.deepEqual(webCodes, ["CIPA", "BURS", "BOBS", "BOCRA", "BOB", "NBFIRA", "BERA", "BOMRA"]);
  assert.deepEqual(mobileCodes, webCodes);

  for (const auth of REGULATORY_AUTHORITIES_BASELINE) {
    assert.match(auth.website, /^https:\/\//);
    assert.match(auth.email, /@/);
    assert.ok(auth.phone.length >= 5);
  }

  assert.equal(DEFAULT_APPLICATION_FORM_CONFIG.steps.length, 12);
  assert.equal(mobileCatalog.DEFAULT_APPLICATION_FORM_CONFIG.steps.length, 12);
  assert.ok(DEFAULT_APPLICATION_FORM_CONFIG.requiredDocuments.length >= 6);
});

test("portal document validation, safe storage path generation and public download URL prevent traversal and oversized files", () => {
  assert.equal(validatePortalDocumentFile({ name: "form.pdf", size: 1024 }).valid, true);
  assert.equal(validatePortalDocumentFile({ name: "checklist.docx", size: 2048 }).valid, true);
  assert.equal(validatePortalDocumentFile({ name: "budget.xlsx", size: 2048 }).valid, true);
  assert.equal(validatePortalDocumentFile({ name: "empty.pdf", size: 0 }).valid, false);
  assert.equal(validatePortalDocumentFile({ name: "huge.pdf", size: 11 * 1024 * 1024 }).valid, false);
  assert.equal(validatePortalDocumentFile({ name: "script.exe", size: 512 }).valid, false);
  assert.equal(validatePortalDocumentFile({ name: "vector.svg", size: 512 }).valid, false);

  const safePath = makePortalDocumentStoragePath("../../Secret Application Form (2026).PDF");
  assert.match(safePath, /^content\/[a-z0-9-]+-secret-application-form-2026\.pdf$/);
  assert.equal(safePath.includes(".."), false);

  const url = buildPortalDocumentPublicUrl("https://demo.supabase.co/", safePath);
  assert.equal(
    url,
    `https://demo.supabase.co/storage/v1/object/public/${PORTAL_DOCUMENTS_BUCKET}/${safePath.split("/").map(encodeURIComponent).join("/")}`,
  );
  assert.equal(buildPortalDocumentPublicUrl("https://demo.supabase.co", "../secret.pdf"), "");
});

test("custom form configuration normalizes cleanly and enforces mandatory custom fields in both web and mobile readiness", () => {
  const config = normalizeApplicationFormConfig({
    formTitle: "CEDA 2026 Special Call Form",
    formVersion: "2026.2",
    maxEvidenceFileMb: 20,
    customFields: [
      {
        key: "cipa_number",
        label: "CIPA Registration File Number",
        stepNumber: 1,
        fieldType: "text",
        required: true,
        enabled: true,
      },
      {
        key: "optional_note",
        label: "Additional Note",
        stepNumber: 2,
        fieldType: "textarea",
        required: false,
        enabled: true,
      },
    ],
  });

  assert.equal(config.formTitle, "CEDA 2026 Special Call Form");
  assert.equal(config.maxEvidenceFileMb, 20);
  assert.equal(config.steps.length, 12);

  const baseApp = {
    id: "app-1",
    formData: {
      applicantType: "Individual",
      fullName: "Kabo Modise",
      email: "kabo@example.bw",
      phone: "+26771234567",
      district: "Gaborone",
      primarySector: "AgriTech",
      title: "Solar Grain Dryer",
      summary: "Low-cost solar grain drying unit for smallholder farms in Botswana.",
      problem: "Post-harvest grain spoilage destroys up to 25% of smallholder harvests during rainy months.",
      solution: "Modular solar-thermal cabinet dryer with low-cost humidity sensors and local servicing.",
      implementationApproach: "Pilot across 10 farms in Central District with BUAN and BOBS testing.",
      permissionToSubmit: true,
      accuracyConfirmed: true,
      privacyConfirmed: true,
      customResponses: {},
    },
  };

  const customMissing = validateCustomFormResponses(config, baseApp.formData);
  assert.equal(customMissing.missingFields.length, 1);
  assert.equal(customMissing.firstMissingStep, 1);

  const webBlocked = webEvaluateReadiness(baseApp, [], config);
  const mobileBlocked = mobileEvaluateReadiness(baseApp, [], config);
  assert.equal(webBlocked.readyToSubmit, false);
  assert.equal(mobileBlocked.readyToSubmit, false);
  assert.ok(webBlocked.blockers.some((b) => b.label.includes("CIPA Registration File Number")));
  assert.ok(mobileBlocked.blockers.some((b) => b.label.includes("CIPA Registration File Number")));

  baseApp.formData.customResponses = { cipa_number: "BW0000123456" };
  assert.equal(webEvaluateReadiness(baseApp, [], config).readyToSubmit, true);
  assert.equal(mobileEvaluateReadiness(baseApp, [], config).readyToSubmit, true);
});

test("regulatory contact builder produces structured JSON details and readable body text", () => {
  const result = buildRegulatoryContactPayload({
    authorityCode: "bobs",
    fullName: "Botswana Bureau of Standards",
    phone: "+267 390 3200",
    email: "enquiries@bobstandards.bw",
    website: "https://www.bobstandards.bw",
    address: "Plot 55745, Gaborone",
    scope: "Standards & conformity testing",
  });
  assert.equal(result.contactDetails.authorityCode, "BOBS");
  assert.equal(result.contactDetails.website, "https://www.bobstandards.bw");
  assert.match(result.formattedBody, /Botswana Bureau of Standards \(BOBS\)/);
  assert.match(result.formattedBody, /enquiries@bobstandards\.bw/);
});

test("public /help/, /contact/, and /eligibility/ pages render Botswana regulatory contacts and downloadable checklists", () => {
  const helpHtml = renderPage("/help/", pages["/help/"]);
  const contactHtml = renderPage("/contact/", pages["/contact/"]);
  const eligibilityHtml = renderPage("/eligibility/", pages["/eligibility/"]);

  for (const code of ["CIPA", "BURS", "BOBS", "BOCRA", "NBFIRA", "BERA", "BOMRA"]) {
    assert.ok(helpHtml.includes(code), `/help/ missing regulatory authority ${code}`);
    assert.ok(contactHtml.includes(code), `/contact/ missing regulatory authority ${code}`);
  }
  assert.ok(helpHtml.includes("Bank of Botswana"));
  assert.ok(contactHtml.includes("Bank of Botswana"));
  assert.ok(helpHtml.includes("data-public-downloads"));
  assert.ok(helpHtml.includes("data-public-regulators"));
  assert.ok(eligibilityHtml.includes("data-public-downloads"));
  assert.ok(eligibilityHtml.includes("Omang / National ID or Passport copy"));
});

test("SQL migration and web/mobile bundles include upload, hard delete, form builder and live catalog without inline styles", async () => {
  const migrationSql = await readFile(
    new URL("../supabase/migrations/20261123033000AdminManagedFormContentFaqs.sql", import.meta.url),
    "utf8",
  );
  assert.match(migrationSql, /insert into storage\.buckets[\s\S]*'portal-documents'/);
  assert.match(migrationSql, /create or replace function public\.admin_delete_content/);
  assert.match(migrationSql, /'content\.deleted'/);
  assert.match(migrationSql, /create or replace function public\.public_portal_catalog/);
  assert.match(migrationSql, /'application_form_config'/);
  assert.match(migrationSql, /Complete the required form field:/);

  const distAdminJs = await readFile(new URL("../dist/assets/admin.js", import.meta.url), "utf8");
  const distInnovatorJs = await readFile(new URL("../dist/assets/innovator.js", import.meta.url), "utf8");
  const adminHtml = await readFile(new URL("../dist/admin/index.html", import.meta.url), "utf8");
  const innovatorHtml = await readFile(new URL("../dist/account/index.html", import.meta.url), "utf8");

  assert.match(distAdminJs, /const \{[^}]*uploadPortalContentDocument|makePortalDocumentStoragePath/);
  assert.match(distAdminJs, /admin_delete_content/);
  assert.match(distAdminJs, /application_form_config/);
  assert.match(distInnovatorJs, /renderPortalFormsCatalog/);
  assert.match(distInnovatorJs, /renderRegulatoryContactsList/);
  assert.match(distInnovatorJs, /renderWizardCustomFields/);

  assert.equal(/\sstyle="/i.test(adminHtml), false);
  assert.equal(/\sstyle="/i.test(innovatorHtml), false);
  assert.ok(adminHtml.includes("data-form-config-form"));
  assert.ok(adminHtml.includes("data-content-delete-form"));
  assert.ok(innovatorHtml.includes("data-wizard-forms-guide"));
  assert.ok(innovatorHtml.includes("data-support-regulators"));
});

test("mobile admin API deleteAdminContent and extended saveAdminContent post clean RPC payloads", async () => {
  const originalFetch = globalThis.fetch;

  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body || "{}")) });
    return new Response(JSON.stringify([{ id: "c-1", title: "Saved item", summary: "Summary", body: "Detailed instructions", kind: "Application form", audience: "Public website & Innovators", stage: "Published", updated: "2026-11-23 06:00" }]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const account = { token: "admin-jwt", name: "Admin", role: "admin", expiresAt: Date.now() + 60000 };
    const saved = await saveAdminContent(account, {
      content_kind: "Application form",
      content_title: "2026 Application Worksheet",
      content_body: "Complete offline before uploading.",
      reason: "Uploaded approved PDF worksheet",
      content_stage: "Published",
      attachment_name: "worksheet.pdf",
      attachment_mime: "application/pdf",
      attachment_size: 4096,
      attachment_path: "content/worksheet.pdf",
    });
    assert.equal(saved.length, 1);

    const afterDelete = await deleteAdminContent(account, "c-1", "Superseded by 2027 version");
    assert.ok(Array.isArray(afterDelete));
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/rest\/v1\/rpc\/admin_save_content$/);
    assert.equal(calls[0].body.attachment_path, "content/worksheet.pdf");
    assert.match(calls[1].url, /\/rest\/v1\/rpc\/admin_delete_content$/);
    assert.equal(calls[1].body.content_id, "c-1");
    assert.equal(calls[1].body.reason, "Superseded by 2027 version");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
