import test from "node:test";
import assert from "node:assert/strict";
import { assessmentAccess, reviseApplication, interveneOnStatus } from "../src/publicSite/assets/applicationAdministration.js";
const original = { title: "Original title", applicant: "Sample applicant", sector: "Education", summary: "Original submitted summary", status: "Submitted" };
const context = { role: "admin", actor: "Sample admin", reason: "Correct a technical issue", version: 1, at: "2026-11-20T12:00:00Z", confirmed: true };
test("every active assessor is included except an explicit exclusion", () => {
  const result = assessmentAccess([{ id: "a" }, { id: "b" }, { id: "c", active: false }], { exclusions: [{ assessorId: "b" }] });
  assert.deepEqual(result.map(p => [p.id, p.excluded]), [["a", false], ["b", true]]);
});
test("corrections preserve original and independent revision snapshots", () => {
  const first = reviseApplication(original, { title: "Corrected title" }, context);
  const second = reviseApplication(first, { summary: "Updated submitted summary" }, { ...context, version: 2 });
  assert.equal(original.title, "Original title");
  assert.equal(second.original.title, "Original title");
  assert.equal(second.history[0].before.title, "Original title");
  assert.equal(second.history[0].after.title, "Corrected title");
  assert.equal(second.history.length, 2); assert.equal(second.reassessmentRequired, true);
});
test("reject unauthorized, stale, unsupported and unexplained corrections", () => {
  for (const overrides of [{ role: "assessor" }, { version: 2 }, { reason: "" }]) assert.throws(() => reviseApplication(original, { title: "Changed title" }, { ...context, ...overrides }));
  assert.throws(() => reviseApplication(original, { scores: [10] }, context));
});
test("status intervention requires confirmation and records separate provenance", () => {
  assert.throws(() => interveneOnStatus(original, "Approved", { ...context, confirmed: false }));
  assert.throws(() => interveneOnStatus(original, "Approved", { ...context, role: "assessor" }));
  assert.throws(() => interveneOnStatus(original, "Approved", { ...context, version: 2 }));
  const changed = interveneOnStatus(original, "Approved", context);
  assert.equal(original.status, "Submitted"); assert.equal(changed.status, "Approved");
  assert.equal(changed.history[0].type, "Admin status intervention");
});
