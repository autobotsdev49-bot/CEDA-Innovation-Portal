import { assessmentAccess, reviseApplication, interveneOnStatus } from "./applicationAdministration.js";
// Fictional fixtures for UI review only. Never use these as production aggregates.
export const applications = [
  { id: "DEMO001", title: "Community craft marketplace", applicant: "Sample enterprise A", sector: "Creative Industries", status: "In review", date: "2026-11-18", summary: "A proposed digital marketplace connecting local craft makers with buyers." },
  { id: "DEMO002", title: "Waterwise crop monitoring", applicant: "Sample innovator B", sector: "Agriculture", status: "In review", date: "2026-11-18", summary: "A sensor concept helping growers monitor crop irrigation requirements." },
  { id: "DEMO003", title: "Neighbourhood recycling network", applicant: "Sample enterprise C", sector: "Environment", status: "Submitted", date: "2026-11-19", summary: "A proposed collection network for recyclable household materials." },
  { id: "DEMO004", title: "Accessible learning toolkit", applicant: "Sample innovator D", sector: "Education", status: "Approved", date: "2026-11-15", summary: "An accessible teaching toolkit concept supporting different learning needs." },
  { id: "DEMO005", title: "Creative studio booking", applicant: "Sample enterprise E", sector: "Creative Industries", status: "Rejected", date: "2026-11-14", summary: "A booking service concept for shared creative workspaces." },
  { id: "DEMO006", title: "Solar cold storage", applicant: "Sample innovator F", sector: "Agriculture", status: "In review", date: "2026-11-19", summary: "A solar-powered cold storage concept for small agricultural producers." },
];
const assessors = [
  { id: "a", name: "Sample assessor A", lead: true },
  { id: "b", name: "Sample assessor B", lead: false },
  { id: "c", name: "Sample assessor C", lead: false },
];
applications[0].reportedIssues = [{ id: "BUG001", title: "Attachment picker does not open", description: "Sample innovator report: the attachment control does not open the file picker on a small screen.", reporter: "Sample innovator D", priority: "High", status: "Investigating", owner: "Sample admin C", at: "2026-11-20" }];
applications[0].exclusions = [{ assessorId: "b", reason: "Sample conflict of interest", actor: "Sample lead A" }];
const cell = (row, value) => { const el = row.insertCell(); el.textContent = value; return el; };
function statusBadge(value) {
  const badge = document.createElement("span");
  const classes = { Submitted: "submitted", "In review": "review", Approved: "approved", Rejected: "rejected" };
  badge.className = "admin-case-badge case-" + classes[value]; badge.textContent = value;
  return badge;
}
export function initializeOperations(openModal) {
  const form = document.querySelector("[data-application-search]");
  const rows = document.querySelector("[data-applications]");
  let selectedId;
  const current = () => applications.find(item => item.id === selectedId);
  const notify = message => { document.querySelector("[data-dialog-status]").textContent = message; };
  for (const sector of [...new Set(applications.map(item => item.sector))].sort()) {
    const option = document.createElement("option"); option.value = sector; option.textContent = sector;
    form.elements.sector.append(option);
  }
  for (const [key, value] of Object.entries({ total: applications.length, review: applications.filter(a => a.status === "In review").length, approved: applications.filter(a => a.status === "Approved").length, rejected: applications.filter(a => a.status === "Rejected").length })) document.querySelector(`[data-application-count="${key}"]`).textContent = String(value);
  const detailTabs = [...document.querySelectorAll("[data-case-tab]")];
  function selectDetailTab(key, focus = false) {
    for (const tab of detailTabs) {
      const active = tab.dataset.caseTab === key;
      tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !active;
      if (active && focus) tab.focus();
    }
  }
  for (const [index, tab] of detailTabs.entries()) {
    tab.addEventListener("click", () => selectDetailTab(tab.dataset.caseTab));
    tab.addEventListener("keydown", event => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % detailTabs.length;
      if (event.key === "ArrowLeft") next = (index - 1 + detailTabs.length) % detailTabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = detailTabs.length - 1;
      if (next !== undefined) { event.preventDefault(); selectDetailTab(detailTabs[next].dataset.caseTab, true); }
    });
  }
  for (const button of document.querySelectorAll("[data-case-return]")) button.addEventListener("click", () => { if (current()) details(current()); });
  function details(item) {
    selectedId = item.id;
    selectDetailTab("submission");
    document.querySelector("[data-case-reference]").textContent = item.id;
    document.querySelector("[data-case-version]").textContent = "Revision " + (item.version || 1);
    document.querySelector("[data-case-subtitle]").textContent = item.applicant + " / Submitted " + item.date;
    document.querySelector("[data-case-status-badge]").replaceChildren(statusBadge(item.status));
    const issues = document.querySelector("[data-case-issues-list]"); issues.replaceChildren();
    if (!item.reportedIssues?.length) {
      const empty=document.createElement("p");empty.className="admin-modal-intro";empty.textContent="No reported issues are linked to this sample application.";issues.append(empty);
    }
    for (const issue of item.reportedIssues || []) {
      const card=document.createElement("article");card.className="case-issue-entry";
      const heading=document.createElement("strong");heading.textContent=issue.id+" / "+issue.title;
      const text=document.createElement("p");text.textContent=issue.description;
      const meta=document.createElement("small");meta.textContent="Reported by "+issue.reporter+" / "+issue.at+" / "+issue.status+" / "+issue.priority+" priority / Owner: "+issue.owner;
      card.append(heading,text,meta);issues.append(card);
    }
    document.querySelector("[data-application-title]").textContent = item.title;
    document.querySelector("[data-application-summary]").textContent = item.summary;
    const facts = document.querySelector("[data-application-facts]"); facts.replaceChildren();
    for (const [label, value] of [["Reference", item.id], ["Applicant", item.applicant], ["Sector", item.sector], ["Status", item.status], ["Submitted", item.date], ["Assessment access", "All active Assessors except Lead-managed exclusions"], ["Revision", String(item.version || 1)]]) {
      const term = document.createElement("dt"); term.textContent = label;
      const description = document.createElement("dd"); description.textContent = value;
      facts.append(term, description);
    }
    const timeline = document.querySelector("[data-application-timeline]"); timeline.replaceChildren();
    const events = ["Sample application submitted on " + item.date];
    events.push("Access granted to all active Assessors by default");
    if (item.reassessmentRequired) events.push("Admin correction: assessment review required");
    for (const event of item.history || []) events.push(event.actor + " / " + event.at + " / " + event.type + " / " + event.reason);
    if (item.status !== "Submitted") events.push("Current sample status: " + item.status);
    for (const event of events) { const entry = document.createElement("li"); entry.textContent = event; timeline.append(entry); }
    const access = document.querySelector("[data-case-access]"); access.replaceChildren();
    for (const person of assessmentAccess(assessors, item)) {
      const entry = document.createElement("p");
      entry.textContent = person.name + (person.lead ? " / Lead" : "") + " / " + (person.excluded ? "Excluded by Lead: " + item.exclusions.find(e=>e.assessorId===person.id).reason : "Included by default"); access.append(entry);
    }
    openModal(document.querySelector("[data-application-details]"), item.title, document.querySelector("[data-application-title]"));
  }
  function render() {
    for (const [key, value] of Object.entries({ total: applications.length, review: applications.filter(a=>a.status==="In review").length, approved: applications.filter(a=>a.status==="Approved").length, rejected: applications.filter(a=>a.status==="Rejected").length })) document.querySelector(`[data-application-count="${key}"]`).textContent=String(value);
    const query = form.elements.query.value.trim().toLowerCase();
    const filtered = applications.filter(item => [item.id, item.title, item.applicant].some(value => value.toLowerCase().includes(query)) && (!form.elements.from.value || item.date >= form.elements.from.value) && (!form.elements.until.value || item.date <= form.elements.until.value) && (!form.elements.status.value || item.status === form.elements.status.value) && (!form.elements.sector.value || item.sector === form.elements.sector.value));
    rows.replaceChildren();
    for (const item of filtered) {
      const row = rows.insertRow(); const identity = cell(row, "");
      const title = document.createElement("strong"); title.textContent = item.title;
      const reference = document.createElement("small"); reference.className = "admin-case-reference"; reference.textContent = item.id;
      identity.append(title, reference); cell(row, item.applicant); cell(row, item.sector); cell(row, "").append(statusBadge(item.status)); cell(row, item.date);
      const button = document.createElement("button"); button.type = "button"; button.textContent = "View details";
      button.setAttribute("aria-label", "View " + item.title); button.addEventListener("click", () => details(item)); cell(row, "").append(button);
    }
    if (!filtered.length) { const empty = rows.insertRow().insertCell(); empty.colSpan = 6; empty.textContent = "No sample applications match these filters."; }
    document.querySelector("[data-application-results]").textContent = `Showing ${filtered.length} of ${applications.length} sample applications${form.elements.from.value ? " / " + form.elements.from.value + " to " + form.elements.until.value : ""}`;
  }
  form.addEventListener("submit", event => { event.preventDefault(); render(); });
  form.addEventListener("input", render); form.addEventListener("change", render);
  document.querySelector("[data-reset-applications]").addEventListener("click", () => { form.reset(); render(); });
  render();
  for (const button of document.querySelectorAll("[data-case-action]")) button.addEventListener("click", () => {
    const item=current(); if (!item) return;
    const action=button.dataset.caseAction;
    if(action==="edit") {
      const editor=document.querySelector("[data-case-edit-form]"); editor.reset();
      for(const key of ["title","applicant","sector","summary"]) editor.elements.namedItem(key).value=item[key];
      openModal(document.querySelector("[data-case-editor]"),"Correct submitted information");
    }
    if(action==="status") { document.querySelector("[data-case-status-form]").reset(); openModal(document.querySelector("[data-case-status]"),"Change application status"); }
    if(action==="history") {
      const list=document.querySelector("[data-case-history-content]");list.replaceChildren();
      const add=(title,value)=>{const term=document.createElement("dt");term.textContent=title;const valueNode=document.createElement("dd");valueNode.textContent=value;list.append(term,valueNode);};
      add("Original submitted information",JSON.stringify(item.original || {title:item.title,applicant:item.applicant,sector:item.sector,summary:item.summary},null,2));
      for(const event of item.history || []) add(event.type+" / "+event.actor+" / "+event.at,JSON.stringify({reason:event.reason,before:event.before,after:event.after},null,2));
      openModal(document.querySelector("[data-case-history]"),"Revision and intervention history");
    }

  });
  for(const [selector,kind] of [["[data-case-edit-form]","edit"],["[data-case-status-form]","status"]]) document.querySelector(selector).addEventListener("submit",event=>{
    event.preventDefault(); if(!event.target.reportValidity())return;
    const item=current();const fields=event.target.elements;
    const context={role:"admin",actor:"Sample Administrator",reason:fields.reason.value,version:item.version||1,at:new Date().toISOString(),confirmed:fields.confirmed?.checked};
    try {
      const updated=kind==="edit"?reviseApplication(item,Object.fromEntries(["title","applicant","sector","summary"].map(key=>[key,fields.namedItem(key).value])),context):interveneOnStatus(item,fields.status.value,context);
      applications[applications.indexOf(item)]=updated;render();document.dispatchEvent(new Event("ceda:sampleapplicationschanged"));details(updated);notify("Sample change recorded in this tab only. No database update or notification was sent.");
    } catch(error){notify(error.message);}
  });
  document.querySelector("[data-view-application-issues]").addEventListener("click", () => {
    const item = current();
    const issueForm = document.querySelector("[data-issue-filters]"); issueForm.reset();
    const report = item?.reportedIssues?.[0];
    issueForm.elements.query.value = report?.id || item?.id || "";
    issueForm.dispatchEvent(new Event("change", { bubbles: true }));
    location.hash = "#followup";
  });
}
