import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MOBILE_OVERVIEW_URL = new URL("../mobile/committeeOverview.js", import.meta.url);
const WEB_OVERVIEW_URL = new URL("../src/publicSite/assets/committeeOverview.js", import.meta.url);

test("committeeOverview modules stay synchronized and compute 5-stage pipeline & award metrics", async () => {
  const [mobileSrc, webSrc] = await Promise.all([
    readFile(MOBILE_OVERVIEW_URL, "utf8"),
    readFile(WEB_OVERVIEW_URL, "utf8"),
  ]);
  assert.equal(mobileSrc, webSrc, "mobile/committeeOverview.js and src/publicSite/assets/committeeOverview.js must match exactly");

  const mod = await import("../mobile/committeeOverview.js");
  assert.deepEqual(
    mod.LIFECYCLE_STAGES.map((s) => s.label),
    ["Submission", "Review", "Feedback", "Approval", "Award"]
  );
  assert.equal(mod.classifyCommitteeStage("Awarded"), "award");
  assert.equal(mod.committeeStageLabel("Awarded"), "Award");
  assert.equal(mod.committeeStageLabel("Approved"), "Approval");
  assert.equal(mod.committeeStageLabel("Changes requested"), "Feedback");

  const summary = mod.buildCommitteeSummary({
    applications: [
      { id: "1", reference: "CEDA-INN-01", title: "Solar Pump", applicant: "Kabo", sector: "Energy", status: "Submitted", updatedAt: "2026-11-20 09:00" },
      { id: "2", reference: "CEDA-INN-02", title: "Bio Feed", applicant: "Mpho", sector: "Agriculture", status: "In review", updatedAt: "2026-11-20 10:00" },
      { id: "3", reference: "CEDA-INN-03", title: "Smart Grid", applicant: "Thabo", sector: "Energy", status: "Changes requested", updatedAt: "2026-11-20 11:00" },
      { id: "4", reference: "CEDA-INN-04", title: "Water Sensor", applicant: "Neo", sector: "Water", status: "Approved", updatedAt: "2026-11-21 12:00" },
      {
        id: "5",
        reference: "CEDA-INN-05",
        title: "Kgosi AgriTech",
        applicant: "Kgosi",
        sector: "Agriculture",
        status: "Awarded",
        awardedAt: "2026-11-22 14:00",
        awardData: {
          awardTitle: "National AgriTech Winner",
          awardCategory: "Seed Innovation Grant",
          awardAmount: "P250,000",
          awardSummary: "Flagship climate-smart irrigation rollout.",
        },
        updatedAt: "2026-11-22 14:00",
      },
      { id: "6", reference: "CEDA-INN-06", title: "Legacy POS", applicant: "Tshepo", sector: "Retail", status: "Rejected", updatedAt: "2026-11-19 08:00" },
    ],
    sectors: [],
    timelineEvents: [
      { applicationId: "5", reference: "CEDA-INN-05", title: "Kgosi AgriTech", applicant: "Kgosi", sector: "Agriculture", status: "Awarded", stage: "Award", label: "Award conferred", detail: "National AgriTech Winner", at: "2026-11-22 14:00" },
    ],
  });

  assert.equal(summary.counts.total, 6);
  assert.equal(summary.counts.awarded, 1);
  assert.equal(summary.counts.approved, 1);
  assert.equal(summary.positiveCount, 2);
  assert.equal(summary.decidedCount, 3);
  assert.equal(summary.approvalRatePct, 67);
  assert.equal(summary.awardConversionPct, 50);
  assert.equal(summary.awardedShowcase.length, 1);
  assert.equal(summary.awaitingAward.length, 1);

  const steps = mod.buildLifecycleSteps({
    status: "Awarded",
    submittedDate: "2026-11-10 09:00",
    timeline: [
      { label: "Application received", detail: "Locked", at: "2026-11-10 09:00" },
      { label: "Review started", detail: "Panel opened", at: "2026-11-12 10:00" },
      { label: "Outcome available", detail: "Approved", at: "2026-11-18 11:00" },
      { label: "Award conferred", detail: "National AgriTech Winner", at: "2026-11-22 14:00" },
    ],
  });
  assert.equal(steps.length, 5);
  assert.equal(steps[4].key, "award");
  assert.equal(steps[4].state, "completed");

  const filtered = mod.filterCommitteeApplications(summary.awardedShowcase, { query: "Kgosi", status: "Awarded" });
  assert.equal(filtered.length, 1);
  const brief = mod.formatAwardSummaryText(summary.awardedShowcase[0]);
  assert.match(brief, /National AgriTech Winner/);
  assert.match(brief, /P250,000/);
  assert.doesNotMatch(brief, /ballot|score/i);
});

test("Award stage and Committee observer migration & built web pages enforce security and CSP", async () => {
  const [sql, committeeHtml, committeeJs, adminJs, assessorJs] = await Promise.all([
    readFile(new URL("../supabase/migrations/20261123041500AwardStageAndCommitteeRole.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/committee/index.html", import.meta.url), "utf8"),
    readFile(new URL("../dist/assets/committee.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/assets/admin.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/assets/assessor.js", import.meta.url), "utf8"),
  ]);

  assert.match(sql, /'Awarded'/);
  assert.match(sql, /'committee'/);
  assert.match(sql, /award_conferred/);
  assert.match(sql, /create or replace function public\.admin_confer_award/);
  assert.match(sql, /create or replace function ceda_private\.require_committee/);
  assert.match(sql, /create or replace function public\.committee_workspace/);
  assert.match(sql, /create or replace function public\.committee_case/);

  assert.doesNotMatch(committeeHtml, /\sstyle=/i);
  assert.match(committeeHtml, /\/assets\/committee\.js/);
  assert.match(committeeJs, /committee_workspace/);
  assert.match(committeeJs, /committee_case/);
  assert.match(adminJs, /admin_confer_award/);
  assert.match(assessorJs, /awardTitle/);
});

test("mobile committeeApi and conferAdminAward enforce role scoping and call expected RPCs", async () => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://cedatestproj.supabase.co";
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key_123456";

  const auth = await import("../mobile/auth.ts");
  const committeeApi = await import("../mobile/committeeApi.ts");

  const calls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await assert.rejects(
      () =>
        committeeApi.getCommitteeWorkspace({
          token: "tok",
          name: "Innovator",
          role: "innovator",
          expiresAt: Date.now() + 60_000,
        }),
      /committee session has expired/i
    );

    const committeeAccount = {
      token: "committee-jwt",
      name: "Committee Observer",
      role: "committee",
      expiresAt: Date.now() + 60_000,
    };
    await committeeApi.getCommitteeWorkspace(committeeAccount);
    await committeeApi.getCommitteeCase(committeeAccount, "case-uuid-1");

    const adminAccount = {
      token: "admin-jwt",
      name: "CEDA Admin",
      role: "admin",
      expiresAt: Date.now() + 60_000,
    };
    await auth.conferAdminAward(adminAccount, {
      app_ref: "CEDA-INN-05",
      expected_version: 2,
      confirmed: true,
      award_title: "Flagship Innovation Award",
      award_category: "Seed Innovation Grant",
      award_amount: "P250,000",
      award_summary: "Approved for onboarding.",
      reason: "Confirmed by executive panel",
    });

    const rpcCalls = calls.filter((c) => c.url.includes("/rest/v1/rpc/"));
    assert.equal(rpcCalls.length, 3);
    assert.match(rpcCalls[0].url, /\/rest\/v1\/rpc\/committee_workspace$/);
    assert.match(rpcCalls[1].url, /\/rest\/v1\/rpc\/committee_case$/);
    assert.equal(rpcCalls[1].body.p_case_id, "case-uuid-1");
    assert.match(rpcCalls[2].url, /\/rest\/v1\/rpc\/admin_confer_award$/);
    assert.equal(rpcCalls[2].body.app_ref, "CEDA-INN-05");
    assert.equal(rpcCalls[2].body.p_award_title, "Flagship Innovation Award");
  } finally {
    globalThis.fetch = origFetch;
  }
});
