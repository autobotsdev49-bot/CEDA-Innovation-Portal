// Domain rules for the sample workspace; production must enforce these server-side.
export function assessmentAccess(assessors, application) {
  return assessors.filter(person => person.active !== false).map(person => ({
    ...person, excluded: (application.exclusions || []).some(entry => entry.assessorId === person.id),
  }));
}
export function reviseApplication(application, patch, context) {
  if (context.role !== "admin") throw new Error("Administrator access required.");
  if (!context.actor || !context.reason || context.reason.trim().length < 5) throw new Error("Provide an actor and a reason of at least five characters.");
  if (context.version !== (application.version || 1)) throw new Error("This application changed. Reload before editing.");
  const allowed = ["title", "summary", "applicant", "sector"];
  if (!Object.keys(patch).length || Object.keys(patch).some(key => !allowed.includes(key))) throw new Error("Unsupported submission field.");
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value !== "string" || value.trim().length < 2 || value.length > (key === "summary" ? 5000 : 200) || /[\u0000-\u001f<>]/.test(value)) throw new Error("Enter valid submission text.");
  }
  const before = Object.fromEntries(allowed.map(key => [key, application[key]]));
  const after = { ...before, ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value.trim()])) };
  if (allowed.every(key => before[key] === after[key])) throw new Error("Change at least one field before saving.");
  const event = { type: "Admin correction", actor: context.actor, at: context.at, reason: context.reason.trim(), before, after };
  return { ...application, ...after, original: application.original || before, version: (application.version || 1) + 1,
    history: [...(application.history || []), event], reassessmentRequired: true };
}
export function interveneOnStatus(application, status, context) {
  if (context.role !== "admin" || context.confirmed !== true) throw new Error("Confirm the administrator intervention.");
  if (!context.actor || !context.reason || context.reason.trim().length < 5) throw new Error("Provide an actor and intervention reason.");
  if (context.version !== (application.version || 1)) throw new Error("This application changed. Reload before intervening.");
  if (!["Submitted", "In review", "Changes requested", "Approved", "Awarded", "Rejected"].includes(status) || application.status === status) throw new Error("Choose a different supported status.");
  const event = { type: "Admin status intervention", actor: context.actor, at: context.at, reason: context.reason.trim(), before: application.status, after: status };
  return { ...application, status, version: (application.version || 1) + 1, history: [...(application.history || []), event] };
}
