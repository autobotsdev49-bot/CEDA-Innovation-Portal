import { assessmentAccess, reviseApplication, interveneOnStatus } from "./applicationAdministration.js";
export const demoApplications = [
  { id: "DEMO001", title: "Community craft marketplace", applicant: "Sample enterprise A", sector: "Creative Industries", status: "In review", date: "2026-11-18", summary: "A proposed digital marketplace connecting local craft makers with buyers." },
  { id: "DEMO002", title: "Waterwise crop monitoring", applicant: "Sample innovator B", sector: "Agriculture", status: "In review", date: "2026-11-18", summary: "A sensor concept helping growers monitor crop irrigation requirements." },
  { id: "DEMO003", title: "Neighbourhood recycling network", applicant: "Sample enterprise C", sector: "Environment", status: "Submitted", date: "2026-11-19", summary: "A proposed collection network for recyclable household materials." },
  { id: "DEMO004", title: "Accessible learning toolkit", applicant: "Sample innovator D", sector: "Education", status: "Approved", date: "2026-11-15", summary: "An accessible teaching toolkit concept supporting different learning needs." },
  { id: "DEMO005", title: "Creative studio booking", applicant: "Sample enterprise E", sector: "Creative Industries", status: "Rejected", date: "2026-11-14", summary: "A booking service concept for shared creative workspaces." },
  { id: "DEMO006", title: "Solar cold storage", applicant: "Sample innovator F", sector: "Agriculture", status: "In review", date: "2026-11-19", summary: "A solar-powered cold storage concept for small agricultural producers." },
];
demoApplications[0].reportedIssues = [{ id: "BUG001", title: "Attachment picker does not open", description: "Sample innovator report: the attachment control does not open the file picker on a small screen.", reporter: "Sample innovator D", priority: "High", status: "Investigating", owner: "Sample admin C", at: "2026-11-20" }];
demoApplications[0].exclusions = [{ assessorId: "b", reason: "Sample conflict of interest", actor: "Sample lead A" }];

export const applications = [...demoApplications];
const assessors = [{ id: "a", name: "Naledi Phiri", lead: true }, { id: "b", name: "Kagiso Molefe", lead: false }, { id: "c", name: "Boitumelo Tsheko", lead: false }];
const cell = (row, value) => { const el = row.insertCell(); el.textContent = value; return el; };
function statusBadge(value) {
  const badge = document.createElement("span");
  const classes = { Draft: "draft", Submitted: "submitted", "In review": "review", "Changes requested": "changes", Approved: "approved", Awarded: "awarded", Rejected: "rejected", Withdrawn: "withdrawn" };
  badge.className = "admin-case-badge case-" + (classes[value] || "submitted"); badge.textContent = value;
  return badge;
}
export function initializeOperations(openModal, rpcCall, onMutationSaved, signEvidenceUrl) {
  const form = document.querySelector("[data-application-search]");
  const rows = document.querySelector("[data-applications]");
  let selectedId;
  const current = () => applications.find(item => item.id === selectedId);
  const notify = message => { document.querySelector("[data-dialog-status]").textContent = message; };
  function appendAnswerBlock(container, heading, text) {
    if (!text) return;
    const box = document.createElement("div"); box.className = "case-answer";
    const h = document.createElement("h4"); h.textContent = heading;
    const p = document.createElement("p"); p.textContent = String(text);
    box.append(h, p);
    container.append(box);
  }
  function formatFileSize(bytes) {
    const num = Number(bytes || 0);
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${Math.max(1, Math.round(num / 1024))} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  }
  function renderEvidencePane(item) {
    const host = document.querySelector("[data-case-evidence-list]");
    if (!host) return;
    host.replaceChildren();
    const docs = Array.isArray(item.documents) ? item.documents : [];
    if (!docs.length) {
      const empty = document.createElement("div"); empty.className = "case-empty";
      const h = document.createElement("h4"); h.textContent = "No supporting files attached";
      const p = document.createElement("p"); p.textContent = "No files or video links were uploaded on this record yet.";
      empty.append(h, p); host.append(empty);
      return;
    }
    for (const doc of docs) {
      const card = document.createElement("article"); card.className = "case-issue-entry";
      const title = document.createElement("strong"); title.textContent = doc.title || doc.fileName || "Attachment";
      const meta = document.createElement("small");
      meta.textContent = `${doc.sectionKey} · ${doc.category || doc.docKind} · ${doc.docKind === "video_link" ? "HTTPS video link" : `${doc.fileName} (${formatFileSize(doc.fileSize)})`} · v${doc.version || 1} · ${doc.createdAt || ""}`;
      card.append(title, meta);
      if (doc.description) {
        const desc = document.createElement("p"); desc.textContent = doc.description;
        card.append(desc);
      }
      if (doc.docKind === "video_link" && doc.videoUrl) {
        const link = document.createElement("a");
        link.className = "overview-link"; link.textContent = "Open HTTPS demonstration video";
        link.href = doc.videoUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
        card.append(link);
      } else if (doc.storagePath && signEvidenceUrl) {
        const actions = document.createElement("div"); actions.className = "case-detail-actions";
        const previewBtn = document.createElement("button"); previewBtn.type = "button"; previewBtn.className = "admin-button-secondary"; previewBtn.textContent = "Preview / Download file";
        previewBtn.addEventListener("click", async () => {
          previewBtn.disabled = true;
          try {
            const url = await signEvidenceUrl(doc.storagePath);
            window.open(url, "_blank", "noopener,noreferrer");
            notify("Opened temporary signed link to private evidence.");
          } catch (err) {
            notify(err?.message || "Could not open private evidence file.");
          } finally {
            previewBtn.disabled = false;
          }
        });
        actions.append(previewBtn); card.append(actions);
      }
      host.append(card);
    }
  }
  function renderMessagesPane(item) {
    const list = document.querySelector("[data-case-messages-list]");
    const replyForm = document.querySelector("[data-case-reply-form]");
    if (!list) return;
    list.replaceChildren();
    const msgs = Array.isArray(item.messages) ? item.messages : [];
    if (!msgs.length) {
      const empty = document.createElement("p"); empty.className = "admin-modal-intro";
      empty.textContent = "No applicant messages recorded yet. Type a message below to send an update or clarification.";
      list.append(empty);
    } else {
      for (const msg of msgs) {
        const entry = document.createElement("article"); entry.className = "case-issue-entry";
        const head = document.createElement("strong"); head.textContent = `${msg.senderName || "Administrator"} (${msg.senderRole || "admin"}) · ${msg.threadType || "application"}`;
        const body = document.createElement("p"); body.textContent = msg.body;
        const meta = document.createElement("small"); meta.textContent = `${msg.subject || "Application update"} · ${msg.createdAt || "Just now"}`;
        entry.append(head, body, meta); list.append(entry);
      }
    }
    if (replyForm) {
      replyForm.hidden = false;
      replyForm.reset();
    }
  }
  function syncSectorOptions() {
    const previous = form.elements.sector.value;
    form.elements.sector.replaceChildren();
    const allOpt = document.createElement("option"); allOpt.value = ""; allOpt.textContent = "All sectors";
    form.elements.sector.append(allOpt);
    for (const sector of [...new Set(applications.map(item => item.sector))].sort()) {
      const option = document.createElement("option"); option.value = sector; option.textContent = sector;
      form.elements.sector.append(option);
    }
    form.elements.sector.value = previous;
  }
  syncSectorOptions();
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
  function details(item, initialTab = "submission") {
    selectedId = item.id;
    selectDetailTab(initialTab);
    document.querySelector("[data-case-reference]").textContent = item.id;
    document.querySelector("[data-case-version]").textContent = "Revision " + (item.version || 1);
    document.querySelector("[data-case-subtitle]").textContent = `${item.applicant} / Submitted ${item.date}${item.receiptCode ? ` / Receipt ${item.receiptCode}` : ""}`;
    document.querySelector("[data-case-status-badge]").replaceChildren(statusBadge(item.status));
    const awardBtn = document.querySelector('[data-case-action="award"]');
    if (awardBtn) awardBtn.hidden = !["Approved", "Awarded"].includes(item.status);
    const issues = document.querySelector("[data-case-issues-list]"); issues.replaceChildren();
    if (!item.reportedIssues?.length) {
      const empty=document.createElement("p");empty.className="admin-modal-intro";empty.textContent="No reported issues are linked to this application.";issues.append(empty);
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
    const formData = item.formData && typeof item.formData === "object" ? item.formData : {};
    for (const [label, value] of [
      ["Reference", item.id],
      ["Applicant", item.applicant],
      ...(item.applicantType ? [["Applicant type", item.applicantType]] : []),
      ...(item.receiptCode ? [["Receipt code", item.receiptCode]] : []),
      ["Sector", item.sector],
      ["Status", item.status],
      ["Submitted", item.submittedAt || item.date],
      ...(formData.stage ? [["Innovation stage", formData.stage]] : []),
      ...(formData.district ? [["District / location", formData.district]] : []),
      ["Assessment access", "All active Assessors except Lead-managed exclusions"],
      ["Revision", String(item.version || 1)],
    ]) {
      const term = document.createElement("dt"); term.textContent = label;
      const description = document.createElement("dd"); description.textContent = value;
      facts.append(term, description);
    }
    const answersHost = document.querySelector("[data-application-answers]");
    if (answersHost) {
      answersHost.replaceChildren();
      for (const [heading, text] of [
        ["Problem statement", formData.problem],
        ["Problem urgency", formData.problemUrgency],
        ["Proposed solution", formData.solution],
        ["Existing alternatives", formData.alternativesDetail],
        ["Benefits for Botswana", formData.botswanaBenefit],
        ["Target beneficiaries", formData.targetBeneficiaries],
        ["Market demand & traction", formData.marketDemand],
        ["Implementation approach", formData.implementationApproach],
        ["Key risks & mitigations", formData.risksAndMitigations],
        ["Support & funding requested", formData.supportRequestedSummary || formData.fundingAmountRequested],
        ["Withdrawn reason", item.withdrawnReason],
      ]) {
        appendAnswerBlock(answersHost, heading, text);
      }
      const reqList = Array.isArray(item.requestedChanges) ? item.requestedChanges : (item.requestedChanges && typeof item.requestedChanges === "object" ? [item.requestedChanges] : []);
      for (const req of reqList) {
        appendAnswerBlock(answersHost, `Requested clarification (${req.sectionLabel || req.sectionKey || "general"} · ${req.status || "Open"})`, `${req.feedback || ""}${req.deadline ? ` (Due: ${req.deadline})` : ""}`);
      }
      if (item.outcomeData && (item.outcomeData.feedback || item.outcomeData.applicantFeedback)) {
        appendAnswerBlock(answersHost, `Outcome (${item.outcomeData.status || item.status} · ${item.outcomeData.releasedAt || item.outcomeData.outcomeDate || ""})`, item.outcomeData.feedback || item.outcomeData.applicantFeedback);
      }
      if (item.awardData && (item.awardData.awardTitle || item.awardData.awardSummary)) {
        appendAnswerBlock(
          answersHost,
          `Innovation Award (${item.awardData.awardCategory || "Recognition"} · ${item.awardData.conferredAt || item.awardedAt || ""})`,
          `${item.awardData.awardTitle || ""}${item.awardData.awardAmount ? `, Package: ${item.awardData.awardAmount}` : ""}\n${item.awardData.awardSummary || ""}`.trim()
        );
      }
    }
    renderEvidencePane(item);
    renderMessagesPane(item);
    const timeline = document.querySelector("[data-application-timeline]"); timeline.replaceChildren();
    const events = ["Application submitted on " + item.date];
    events.push("Access granted to all active Assessors by default");
    if (item.reassessmentRequired) events.push("Admin correction: assessment review required");
    for (const event of item.history || []) events.push(event.actor + " / " + event.at + " / " + event.type + " / " + event.reason);
    if (item.status !== "Submitted") events.push("Current status: " + item.status);
    for (const event of events) { const entry = document.createElement("li"); entry.textContent = event; timeline.append(entry); }
    const access = document.querySelector("[data-case-access]"); access.replaceChildren();
    for (const person of assessmentAccess(assessors, item)) {
      const entry = document.createElement("p");
      const exclusion = (item.exclusions || []).find(e => e.assessorId === person.id);
      entry.textContent = person.name + (person.lead ? " / Lead" : "") + " / " + (person.excluded ? "Excluded by Lead: " + (exclusion?.reason || "Conflict declared") : "Included by default");
      access.append(entry);
    }
    openModal(document.querySelector("[data-application-details]"), item.title, document.querySelector("[data-application-title]"));
  }
  function render() {
    for (const [key, value] of Object.entries({ total: applications.length, review: applications.filter(a=>a.status==="In review").length, approved: applications.filter(a=>a.status==="Approved").length, awarded: applications.filter(a=>a.status==="Awarded").length, rejected: applications.filter(a=>a.status==="Rejected").length })) document.querySelector(`[data-application-count="${key}"]`).textContent=String(value);
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
    if (!filtered.length) { const empty = rows.insertRow().insertCell(); empty.colSpan = 6; empty.textContent = "No applications match these filters."; }
    document.querySelector("[data-application-results]").textContent = `Showing ${filtered.length} of ${applications.length} applications${form.elements.from.value ? " / " + form.elements.from.value + " to " + form.elements.until.value : ""}`;
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
    if(action==="award") {
      const formEl = document.querySelector("[data-case-award-form]");
      if (formEl) {
        formEl.reset();
        const existingAward = item.awardData || {};
        formEl.elements.awardTitle.value = existingAward.awardTitle || `CEDA Innovation Award: ${item.title}`;
        formEl.elements.awardCategory.value = existingAward.awardCategory || "Innovation Recognition & Support";
        formEl.elements.awardAmount.value = existingAward.awardAmount || "";
        formEl.elements.awardSummary.value = existingAward.awardSummary || "Selected after CEDA evaluation for official innovation award recognition and onboarding support.";
      }
      openModal(document.querySelector("[data-case-award]"), "Confer innovation award");
    }
    if(action==="history") {
      const list=document.querySelector("[data-case-history-content]");list.replaceChildren();
      const add=(title,value)=>{const term=document.createElement("dt");term.textContent=title;const valueNode=document.createElement("dd");valueNode.textContent=value;list.append(term,valueNode);};
      add("Original submitted information",JSON.stringify(item.original || {title:item.title,applicant:item.applicant,sector:item.sector,summary:item.summary},null,2));
      for(const event of item.history || []) add(event.type+" / "+event.actor+" / "+event.at,JSON.stringify({reason:event.reason,before:event.before,after:event.after},null,2));
      openModal(document.querySelector("[data-case-history]"),"Revision and intervention history");
    }
  });
  function replaceApplications(records) {
    if (!Array.isArray(records)) return;
    const merged = [...records];
    for (const demo of demoApplications) {
      if (!merged.some(r => r.id === demo.id)) {
        merged.push(demo);
      }
    }
    applications.splice(0, applications.length, ...merged);
    syncSectorOptions();
    render();
    document.dispatchEvent(new Event("ceda:sampleapplicationschanged"));
  }
  for(const [selector,kind] of [["[data-case-edit-form]","edit"],["[data-case-status-form]","status"]]) document.querySelector(selector).addEventListener("submit", async event => {
    event.preventDefault(); if(!event.target.reportValidity())return;
    const item=current();const fields=event.target.elements;
    const actorName = document.querySelector("[data-admin-name]")?.textContent || "Administrator";
    const context={role:"admin",actor:actorName,reason:fields.reason.value,version:item.version||1,at:new Date().toISOString(),confirmed:fields.confirmed?.checked};
    try {
      const localUpdated=kind==="edit"?reviseApplication(item,Object.fromEntries(["title","applicant","sector","summary"].map(key=>[key,fields.namedItem(key).value])),context):interveneOnStatus(item,fields.status.value,context);
      if (rpcCall) {
        const dbRecords = kind === "edit"
          ? await rpcCall("admin_revise_application", {
              app_ref: item.id,
              new_title: fields.namedItem("title").value.trim(),
              new_applicant: fields.namedItem("applicant").value.trim(),
              new_sector: fields.namedItem("sector").value.trim(),
              new_summary: fields.namedItem("summary").value.trim(),
              expected_version: item.version || 1,
              reason: fields.reason.value.trim(),
            })
          : await rpcCall("admin_intervene_application_status_ext", {
              app_ref: item.id,
              new_status: fields.status.value,
              expected_version: item.version || 1,
              confirmed: Boolean(fields.confirmed?.checked),
              reason: fields.reason.value.trim(),
              p_section_key: fields.sectionKey?.value || "general",
              p_deadline: fields.deadline?.value || null,
              p_outcome_feedback: fields.outcomeFeedback?.value.trim() || null,
            });
        replaceApplications(dbRecords);
        const refreshed = applications.find(a => a.id === item.id) || localUpdated;
        details(refreshed);
        if (onMutationSaved) void onMutationSaved();
        notify("Change saved to the database and recorded in the administrator audit log.");
      } else {
        applications[applications.indexOf(item)]=localUpdated;render();document.dispatchEvent(new Event("ceda:sampleapplicationschanged"));details(localUpdated);
        notify("Change recorded in this tab.");
      }
    } catch(error){notify(error.message);}
  });
  document.querySelector("[data-case-award-form]")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!event.target.reportValidity()) return;
    const item = current();
    if (!item) return;
    const fields = event.target.elements;
    const actorName = document.querySelector("[data-admin-name]")?.textContent || "Administrator";
    try {
      if (rpcCall) {
        const dbRecords = await rpcCall("admin_confer_award", {
          app_ref: item.id,
          expected_version: item.version || 1,
          confirmed: Boolean(fields.confirmed?.checked),
          p_award_title: fields.awardTitle.value.trim(),
          p_award_category: fields.awardCategory.value.trim(),
          p_award_amount: fields.awardAmount.value.trim() || null,
          p_award_summary: fields.awardSummary.value.trim() || null,
          reason: fields.reason.value.trim(),
        });
        replaceApplications(dbRecords);
        const refreshed = applications.find(a => a.id === item.id) || item;
        details(refreshed);
        if (onMutationSaved) void onMutationSaved();
        notify("Official innovation award conferred and audited.");
      } else {
        const context = { role: "admin", actor: actorName, reason: fields.reason.value, version: item.version || 1, at: new Date().toISOString(), confirmed: fields.confirmed?.checked };
        const localUpdated = {
          ...interveneOnStatus(item, "Awarded", context),
          awardData: {
            awardTitle: fields.awardTitle.value.trim(),
            awardCategory: fields.awardCategory.value.trim(),
            awardAmount: fields.awardAmount.value.trim() || null,
            awardSummary: fields.awardSummary.value.trim(),
            conferredAt: context.at.slice(0, 16).replace("T", " "),
          },
        };
        applications[applications.indexOf(item)] = localUpdated;
        render();
        document.dispatchEvent(new Event("ceda:sampleapplicationschanged"));
        details(localUpdated);
        notify("Award conferred in this tab.");
      }
    } catch (error) {
      notify(error?.message || "Could not confer award.");
    }
  });
  document.querySelector('[data-case-reply-form] textarea[name="reply"]')?.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  });
  document.querySelector("[data-case-reply-form]")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!event.target.reportValidity()) return;
    const item = current();
    if (!item) return;
    const replyBody = event.target.elements.reply.value.trim();
    if (!replyBody) return;
    const threadKind = event.target.elements.threadKind?.value || "application";
    const actorName = document.querySelector("[data-admin-name]")?.textContent || "Administrator";
    const optimistic = {
      senderName: actorName,
      senderRole: "admin",
      threadType: threadKind,
      subject: threadKind === "clarification" ? "Clarification guidance" : "Application update",
      body: replyBody,
      createdAt: new Date().toLocaleTimeString("en-BW", { hour: "2-digit", minute: "2-digit", hour12: false }),
    };
    item.messages = [...(Array.isArray(item.messages) ? item.messages : []), optimistic];
    renderMessagesPane(item);
    if (!rpcCall || !item.hasOwner) {
      notify("Reply added to this application conversation.");
      return;
    }
    try {
      const dbRecords = await rpcCall("admin_reply_application_message", {
        app_ref: item.id,
        reply_body: replyBody,
        thread_kind: threadKind,
      });
      replaceApplications(dbRecords);
      const refreshed = applications.find(a => a.id === item.id) || item;
      details(refreshed, "messages");
      if (onMutationSaved) void onMutationSaved();
      notify("Reply delivered to innovator portal and notifications.");
    } catch (error) {
      notify(error.message || "Reply saved in this session.");
    }
  });
  document.querySelector("[data-view-application-issues]").addEventListener("click", () => {
    const item = current();
    const issueForm = document.querySelector("[data-issue-filters]"); issueForm.reset();
    const report = item?.reportedIssues?.[0];
    issueForm.elements.query.value = report?.id || item?.id || "";
    issueForm.dispatchEvent(new Event("change", { bubbles: true }));
    location.hash = "#followup";
  });
  return { replaceApplications };
}
