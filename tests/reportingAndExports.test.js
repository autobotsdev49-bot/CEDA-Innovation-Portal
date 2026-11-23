import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  REPORT_PACKAGE_DEFS,
  buildReportExport,
  buildReportPdfBytes,
  buildReportingSummaryFromRecords,
  buildTurnaroundRows,
  csvEscapeCell,
  detectDeviceClass,
  emptyReportingSummary,
  formatTurnaroundDuration,
  normalizeReportingSummary,
  rowsToCsv,
  sanitizeTelemetryRoute,
} from "../mobile/reportingOverview.js";

test("reportingOverview computes empty states, normalized live metrics, turnarounds, CSV exports, and PDF bytes safely", () => {
  const empty = emptyReportingSummary(7, "2026-11-23");
  assert.equal(empty.loaded, false);
  assert.equal(empty.periodDays, 7);
  assert.equal(empty.windowEnd, "2026-11-23");
  assert.equal(empty.telemetry.dailyViews.length, 7);
  assert.equal(empty.applications.total, 0);

  assert.equal(formatTurnaroundDuration(null), "No samples yet");
  assert.equal(formatTurnaroundDuration(0.5), "30 min");
  assert.equal(formatTurnaroundDuration(36), "36.0 hrs");
  assert.equal(formatTurnaroundDuration(72), "3.0 days");

  assert.equal(sanitizeTelemetryRoute("/applications/550e8400-e29b-41d4-a716-446655440000?token=abc#sec"), "/applications/:id");
  assert.equal(sanitizeTelemetryRoute("/case/CEDA-INN-2026-01/user@example.com"), "/case/:ref/:email");
  assert.equal(detectDeviceClass(390, "Mozilla/5.0 (Linux; Android 14)"), "Mobile");
  assert.equal(detectDeviceClass(1440, "Mozilla/5.0 (Windows NT 10.0)"), "Desktop");

  assert.equal(csvEscapeCell("=SUM(A1:A2)"), "'=SUM(A1:A2)");
  assert.equal(csvEscapeCell('Hello, "CEDA"'), '"Hello, ""CEDA"""');
  assert.match(rowsToCsv(["A", "B"], [["+cmd|'/C calc'", "ok"]]), /'\+cmd/);

  const summary = normalizeReportingSummary(
    {
      periodDays: 7,
      windowStart: "2026-11-17",
      windowEnd: "2026-11-23",
      participation: { totalUsers: 20, activeUsers: 18, innovators: 12, assessors: 4, committeeMembers: 2, supportOfficers: 1, admins: 1, activeVisitorsNow: 3 },
      applications: {
        total: 5,
        submitted: 1,
        inReview: 1,
        changesRequested: 0,
        approved: 1,
        awarded: 1,
        rejected: 1,
        withdrawn: 0,
        approvalRatePct: 66.7,
        decidedCount: 3,
        records: [{ reference: "CEDA-INN-10", title: "Bio Solar", applicant: "Kabo", sector: "Energy", status: "Awarded", source: "Live", submittedDate: "2026-11-20", version: 2 }],
      },
      sectors: [{ id: "s1", name: "Energy", status: "Active", total: 5, submitted: 1, inReview: 1, approved: 1, awarded: 1, rejected: 1 }],
      turnaround: { submissionToReviewStart: { sampleCount: 4, avgHours: 12, medianHours: 10, p95Hours: 24 } },
      telemetry: { totalViews: 140, uniqueSessions: 42, devices: [{ name: "Mobile", count: 90 }, { name: "Desktop", count: 50 }], webVitals: { sampleCount: 10, lcpMs: 1450, inpMs: 85, cls: 0.02, ttfbMs: 190, errorCount: 1, availabilityPct: 99.3 } },
      matters: { total: 2, open: 1, investigating: 0, waiting: 0, resolved: 1, records: [{ reference: "TKT-9", title: "Clarify PDF", kind: "Support", priority: "Normal", state: "Open", ownerName: "Support Lead", source: "Live" }] },
    },
    7
  );

  assert.equal(summary.loaded, true);
  assert.equal(summary.applications.awarded, 1);
  assert.equal(summary.telemetry.devices[0].sharePct, 64);
  assert.equal(buildTurnaroundRows(summary.turnaround)[0].avgDisplay, "12.0 hrs");

  assert.equal(REPORT_PACKAGE_DEFS.length, 7);
  for (const pkg of REPORT_PACKAGE_DEFS) {
    const exp = buildReportExport(pkg.key, summary);
    assert.ok(exp.csv.length > 20);
    assert.ok(exp.filename.endsWith(".csv"));
    const pdfBytes = buildReportPdfBytes(exp);
    const pdfHeader = Buffer.from(pdfBytes.slice(0, 8)).toString("latin1");
    assert.match(pdfHeader, /^%PDF-1\./);
  }

  const fromRecs = buildReportingSummaryFromRecords({
    applications: [{ id: "1", title: "AgroBot", owner: "Kabo", sector: "Agriculture", status: "Awarded", date: "2026-11-22" }],
    matters: [],
    optimus: { totalInteractions: 3, helpfulCount: 2, unhelpfulCount: 1, escalatedCount: 0, recentCount: 1 },
  });
  assert.equal(fromRecs.applications.awarded, 1);
  assert.equal(fromRecs.optimus.totalInteractions, 3);
});

test("Real reporting SQL migration, telemetry & mobile reporting screens contain zero fabricated sample numbers", async () => {
  const [sql, adminJs, adminOverviewJs, mobileOverview, mobileInsights] = await Promise.all([
    readFile(new URL("../supabase/migrations/20261123043000RealReportingAndExport.sql", import.meta.url), "utf8"),
    readFile(new URL("../dist/assets/admin.js", import.meta.url), "utf8"),
    readFile(new URL("../src/publicSite/assets/adminOverview.js", import.meta.url), "utf8"),
    readFile(new URL("../mobile/AdminOverview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../mobile/AdminInsights.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(sql, /create table if not exists public\.telemetry_events/i);
  assert.match(sql, /'committee'/);
  assert.match(sql, /create or replace function public\.record_telemetry_event/i);
  assert.match(sql, /create or replace function public\.admin_reporting_summary/i);
  assert.match(sql, /create or replace function public\.admin_log_report_export/i);

  assert.match(adminJs, /admin_reporting_summary/);
  assert.match(adminJs, /admin_log_report_export/);
  assert.doesNotMatch(adminOverviewJs, /Active sessions: 24/);

  for (const src of [mobileOverview, mobileInsights]) {
    assert.doesNotMatch(src, /"2\.1 s"|2\.1<Text|"168 ms"|"98\.6%"|Sample period traffic|Sample page views|2026-11-20/);
  }
  assert.match(mobileInsights, /REPORT_PACKAGE_DEFS/);
  assert.match(mobileInsights, /Turnaround SLAs/);
  assert.match(mobileInsights, /"Feedback"/);
});

test("mobile auth reporting RPC helpers call admin_reporting_summary and admin_log_report_export", async () => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://cedatestproj.supabase.co";
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key_123456";

  const auth = await import("../mobile/auth.ts");
  const calls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ periodDays: 30, applications: { total: 2 }, ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const admin = { token: "admin-jwt", name: "Admin", role: "admin", expiresAt: Date.now() + 60_000 };
    const summary = await auth.readAdminReportingSummary(admin, 30, { forceRefresh: true });
    assert.equal(summary.periodDays, 30);
    assert.equal(summary.applications.total, 2);

    const logged = await auth.logAdminReportExport(admin, "turnaround", "csv", 30);
    assert.equal(logged.ok, true);

    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/rest\/v1\/rpc\/admin_reporting_summary$/);
    assert.equal(calls[0].body.p_period_days, 30);
    assert.match(calls[1].url, /\/rest\/v1\/rpc\/admin_log_report_export$/);
    assert.equal(calls[1].body.p_report_key, "turnaround");
    assert.equal(calls[1].body.p_format, "csv");
  } finally {
    globalThis.fetch = origFetch;
  }
});
