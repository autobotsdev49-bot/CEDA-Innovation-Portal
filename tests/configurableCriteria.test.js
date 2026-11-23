import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  computeWeightedAssessment,
  criterionLabel,
  defaultAssessmentRubric,
  distributeWeightsEqually,
  normalizeRubricCriteria,
  slugifyCriterionKey,
  validateRubricDraft,
} from "../mobile/assessmentOverview.js";

test("weighted rubric helpers normalize, equalize to 100.00%, validate constraints, and compute weighted scores", () => {
  assert.equal(defaultAssessmentRubric.length, 6);
  assert.equal(defaultAssessmentRubric.reduce((sum, item) => sum + item.weight, 0), 100);

  const normalized = normalizeRubricCriteria(defaultAssessmentRubric);
  assert.equal(normalized.length, 6);
  assert.equal(criterionLabel("strategic-alignment", normalized), "Strategic alignment");
  assert.equal(criterionLabel("custom-export-potential", [{ key: "custom-export-potential", label: "Export potential", weight: 20 }]), "Export potential");
  assert.equal(slugifyCriterionKey("Commercial Viability & Scale!", 1), "commercial-viability-scale");

  // Exact 100.00% basis-point split even on odd active counts (e.g., 3 criteria = 33.34 + 33.33 + 33.33)
  const three = distributeWeightsEqually([
    { key: "c1", label: "One", weight: 10, active: true },
    { key: "c2", label: "Two", weight: 20, active: true },
    { key: "c3", label: "Three", weight: 70, active: true },
    { key: "c4", label: "Archived", weight: 5, active: false },
  ]);
  const activeSum = three.filter((c) => c.active !== false).reduce((sum, c) => sum + Math.round(c.weight * 100), 0);
  assert.equal(activeSum, 10000);

  const valid = validateRubricDraft(
    [
      { key: "market-fit", label: "Market fit", weight: 60, active: true },
      { key: "delivery", label: "Delivery plan", weight: 40, active: true },
    ],
    70
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.totalWeight, 100);
  assert.equal(valid.passThreshold, 70);

  const badSum = validateRubricDraft([{ key: "only", label: "Only", weight: 80, active: true }], 60);
  assert.equal(badSum.valid, false);
  assert.ok(badSum.errors.some((e) => /100%/.test(e)));

  const badThresh = validateRubricDraft([{ key: "only", label: "Only", weight: 100, active: true }], 10);
  assert.equal(badThresh.valid, false);
  assert.ok(badThresh.errors.some((e) => /20% and 100%/.test(e)));

  const scored = computeWeightedAssessment(
    [
      { criterion: "market-fit", rating: 5, rationale: "Strong verified demand" },
      { criterion: "delivery", rating: 3, rationale: "Needs milestones" },
    ],
    [
      { key: "market-fit", label: "Market fit", weight: 60 },
      { key: "delivery", label: "Delivery plan", weight: 40 },
    ],
    75
  );
  // (5 * 60 + 3 * 40) / 100 = 4.20 / 5 = 84.0%
  assert.equal(scored.weightedScore, 4.2);
  assert.equal(scored.weightedTotal, 84);
  assert.equal(scored.meetsThreshold, true);
  assert.equal(scored.breakdown.length, 2);
});

test("Configurable criteria migration and built web Admin/Assessor bundles enforce versioned rubrics", async () => {
  const [sql, adminHtml, adminJs, assessorJs] = await Promise.all([
    readFile(new URL("../supabase/migrations/20261123034500ConfigurableAssessmentCriteria.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/admin/index.html", import.meta.url), "utf8"),
    readFile(new URL("../dist/assets/admin.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/assets/assessor.js", import.meta.url), "utf8"),
  ]);

  assert.match(sql, /create table if not exists public\.assessment_criteria/i);
  assert.match(sql, /create table if not exists public\.assessment_rubric_versions/i);
  assert.match(sql, /add column if not exists rubric_version/i);
  assert.match(sql, /create or replace function public\.admin_assessment_criteria_get/i);
  assert.match(sql, /create or replace function public\.admin_save_assessment_criteria/i);
  assert.match(sql, /ceda_private\.member_weighted_scores/);
  assert.match(sql, /ceda_private\.round_score_stats/);

  assert.doesNotMatch(adminHtml, /\sstyle=/i);
  assert.match(adminHtml, /data-criteria-total-meter/);
  assert.match(adminJs, /admin_save_assessment_criteria/);
  assert.match(assessorJs, /computeWeightedAssessment/);
  assert.match(assessorJs, /assessor-weighted-banner/);
});

test("mobile admin criteria and assessor weighted submission APIs send expected RPC payloads", async () => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://cedatestproj.supabase.co";
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key_123456";

  const auth = await import("../mobile/auth.ts");
  const assessorApi = await import("../mobile/assessorApi.ts");

  const calls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const parsedUrl = String(url);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: parsedUrl, body });
    if (parsedUrl.endsWith("/admin_assessment_criteria_get") || parsedUrl.endsWith("/admin_save_assessment_criteria")) {
      return new Response(
        JSON.stringify({
          version: 2,
          passThreshold: 65,
          criteria: [{ key: "impact", label: "Impact", weight: 100, sortOrder: 1, active: true }],
          history: [{ version: 1, passThreshold: 60, reason: "Baseline", createdAt: "2026-11-22", criteriaCount: 6, criteria: [] }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const admin = { token: "admin-jwt", name: "Admin", role: "admin", expiresAt: Date.now() + 60_000 };
    const loaded = await auth.readAdminAssessmentCriteria(admin, { forceRefresh: true });
    assert.equal(loaded.version, 2);
    assert.equal(loaded.passThreshold, 65);

    const saved = await auth.saveAdminAssessmentCriteria(
      admin,
      [{ key: "impact", label: "Impact", description: "Measured impact", weight: 100, sortOrder: 1, active: true }],
      "Switch to focused 100% impact rubric",
      65
    );
    assert.equal(saved.version, 2);

    const assessor = { token: "assessor-jwt", name: "Assessor", role: "assessor", expiresAt: Date.now() + 60_000 };
    await assessorApi.runAssessorAction(
      assessor,
      { id: "case-1", roundId: "round-1" },
      { name: "submit", data: { scores: [{ criterion: "impact", rating: 4, rationale: "Verified pilot" }], choice: "approve", overallComment: "Ready" } }
    );

    const rpcCalls = calls.filter((c) => c.url.includes("/rest/v1/rpc/"));
    assert.equal(rpcCalls.length, 3);
    assert.match(rpcCalls[1].url, /\/admin_save_assessment_criteria$/);
    assert.equal(rpcCalls[1].body.p_pass_threshold, 65);
    assert.match(rpcCalls[2].url, /\/assessor_action$/);
    assert.equal(rpcCalls[2].body.p_action, "submit");
    assert.equal(rpcCalls[2].body.p_data.scores[0].criterion, "impact");
  } finally {
    globalThis.fetch = origFetch;
  }
});
