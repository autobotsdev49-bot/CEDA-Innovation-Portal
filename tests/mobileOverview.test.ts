import assert from "node:assert/strict";
import test from "node:test";
import { previewApplications, previewDays, previewMatters, reportingSnapshot } from "../mobile/adminPreview.ts";
import { applications } from "../src/publicSite/assets/adminOperations.js";

test("mobile overview uses the web portal's application fixtures and outcome counts", () => {
  assert.deepEqual(previewApplications.map(({ id, title, sector, status, date }) => ({ id, title, sector, status, date })), applications.map(({ id, title, sector, status, date }) => ({ id, title, sector, status, date })));
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
