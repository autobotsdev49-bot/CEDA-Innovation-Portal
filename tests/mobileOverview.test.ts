import assert from "node:assert/strict";
import test from "node:test";
import { previewApplications, previewDays, previewMatters, reportingSnapshot } from "../mobile/adminPreview.ts";
import { applications } from "../src/publicSite/assets/adminOperations.js";
import { pages, renderPage } from "../src/publicSite/pages.ts";
import {
  clearAccountToken,
  readPortalActivityLog,
  recordPortalActivity,
  saveAccountToken,
  setPortalActivityActor,
} from "../src/publicSite/assets/verificationSession.js";
import { readFileSync } from "node:fs";

test("admin application screens retain base records and mobile fetches live protected applications", () => {
  assert.equal(applications.length, previewApplications.length);
  const source = readFileSync(new URL("../mobile/AdminWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /readAdminApplications\(account\)/);
  assert.match(source, /items=\{cases\}/);
  const week = reportingSnapshot(7);
  assert.equal(week.applications.length, 6);
  assert.equal(week.applications.filter(item => item.status === "In review").length, 3);
  assert.equal(week.followups, previewMatters.filter(item => item.state !== "Resolved").length);
  assert.equal(week.followups, 3);
});

test("reporting periods aggregate actual sample bars and preserve the web preview date window", () => {
  assert.equal(previewDays.length, 30);
  assert.equal(previewDays[0].date, "2026-10-22");
  assert.equal(previewDays.at(-1)?.date, "2026-11-20");
  for (const period of [1, 7, 30] as const) {
    const snapshot = reportingSnapshot(period);
    assert.equal(snapshot.days.length, period);
    assert.equal(snapshot.views, snapshot.days.reduce((sum, row) => sum + row.views, 0));
    assert.ok(snapshot.applications.every(item => item.date >= snapshot.days[0].date && item.date <= "2026-11-20"));
  }
  assert.equal(reportingSnapshot(7).views, 1494);
  assert.equal(reportingSnapshot(1).views, 243);
  assert.equal(reportingSnapshot(1).applications.length, 0);
});

test("mobile workspaces mirror web parity for Admin governance, Assessor security, and Innovator polling", () => {
  const adminWorkspace = readFileSync(new URL("../mobile/AdminWorkspace.tsx", import.meta.url), "utf8");
  const adminInsights = readFileSync(new URL("../mobile/AdminInsights.tsx", import.meta.url), "utf8");
  const adminUserEditor = readFileSync(new URL("../mobile/AdminUserEditor.tsx", import.meta.url), "utf8");
  const assessorWorkspace = readFileSync(new URL("../mobile/AssessorWorkspace.tsx", import.meta.url), "utf8");
  const innovatorWorkspace = readFileSync(new URL("../mobile/InnovatorWorkspace.tsx", import.meta.url), "utf8");
  const wizardSteps = readFileSync(new URL("../mobile/InnovatorWizardSteps.tsx", import.meta.url), "utf8");

  assert.match(adminWorkspace, /readAdminMatters\(account\)/);
  assert.match(adminWorkspace, /readAdminNotifications\(account\)/);
  assert.match(adminWorkspace, /readAdminConfigurations\(account\)/);
  assert.match(adminWorkspace, /readAdminContent\(account\)/);
  assert.match(adminWorkspace, /readAdminAuditFeed\(account,/);
  assert.match(adminWorkspace, /AdminContentScreen/);
  assert.match(adminWorkspace, /AdminPoliciesScreen/);
  assert.match(adminWorkspace, /AdminCaseDetailModalContent/);

  assert.match(adminInsights, /"Feedback"/);
  assert.match(adminUserEditor, /admin_code:\s*temporaryCode/);
  assert.match(adminUserEditor, /12-72 UTF-8 bytes/);
  assert.match(assessorWorkspace, /AccountSecurityCards/);
  assert.match(innovatorWorkspace, /15000\)/);
  assert.match(wizardSteps, /"National \(Botswana\)"/);
});

test("admin screen removes all sample/database-connected notices and supports per-user login, activity, and logout logs", () => {
  const adminHtml = renderPage("/admin/", pages["/admin/"]);
  assert.equal(adminHtml.includes("admin-demo-notice"), false);
  assert.equal(adminHtml.includes("Sample dashboard"), false);
  assert.equal(adminHtml.includes("Sample workspace"), false);
  assert.equal(adminHtml.includes("Sample data"), false);
  assert.equal(adminHtml.includes("Database connected"), false);
  assert.ok(adminHtml.includes("data-activity-user-filter"));
  assert.ok(adminHtml.includes("data-audit-user-filter"));
  assert.ok(adminHtml.includes("data-activity-user-summary"));

  const sessionMap = new Map<string, string>();
  const localMap = new Map<string, string>();
  const prevSession = globalThis.sessionStorage;
  const prevLocal = globalThis.localStorage;
  (globalThis as Record<string, unknown>).sessionStorage = {
    getItem: (k: string) => sessionMap.get(k) ?? null,
    setItem: (k: string, v: string) => { sessionMap.set(k, v); },
    removeItem: (k: string) => { sessionMap.delete(k); },
  };
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => localMap.get(k) ?? null,
    setItem: (k: string, v: string) => { localMap.set(k, v); },
    removeItem: (k: string) => { localMap.delete(k); },
  };
  try {
    saveAccountToken("synthetic-jwt");
    setPortalActivityActor({
      full_name: "Thabo Modise",
      email: "thabo.modise@innovate.bw",
      account_role: "innovator",
    });
    recordPortalActivity({
      action: "application.draft_saved",
      title: "Saved step 4 of Waterwise crop monitoring",
      record: "DEMO002",
      detail: "Thabo Modise saved proposed solution details on DEMO002.",
      skipRemote: true,
    });
    clearAccountToken();

    const logs = readPortalActivityLog().filter((item: { actor: string }) => item.actor === "Thabo Modise");
    assert.equal(logs.length, 3);
    assert.equal(logs[0].category, "Logout");
    assert.equal(logs[1].category, "Activity");
    assert.equal(logs[2].category, "Login");
  } finally {
    if (prevSession === undefined) delete (globalThis as Record<string, unknown>).sessionStorage;
    else globalThis.sessionStorage = prevSession;
    if (prevLocal === undefined) delete (globalThis as Record<string, unknown>).localStorage;
    else globalThis.localStorage = prevLocal;
  }
});
