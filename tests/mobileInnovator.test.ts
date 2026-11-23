import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applicationRequiredAction,
  buildOutcomeSummaryText,
  buildReceiptSummaryText,
  canWithdrawApplication,
  collectRecentActivity,
  collectRequiredActions,
  documentChecklist,
  evaluateApplicationReadiness,
  filterAndSortApplications,
  groupMessageThreads,
  INNOVATION_STAGES,
  linkedDocumentIsValid,
  matchesStatusFilter,
  normalizeRequestedChanges,
  sectionFileLimit,
  STAGE_MATRIX,
  validateEvidenceFile,
  validateVideoLink,
  type InnovatorApplication,
  type InnovatorDocument,
  type InnovatorMessage,
} from "../mobile/innovatorDomain.ts";
import {
  createSignedEvidenceUrl,
  encodeStoragePath,
  fetchInnovatorBootstrap,
  generateIdempotencyKey,
  getActiveLiveChatRequests,
  getActiveOptimusSupportRequest,
  invalidateInnovatorCache,
  isClosedSupportRequest,
  isOptimusSupportRequest,
  rateSupportChat,
  startLiveChat,
  submitApplication,
} from "../mobile/innovatorApi.ts";

describe("mobile innovator domain logic", () => {
  it("evaluates 12-step readiness blockers and percent completeness", () => {
    const draft: Pick<InnovatorApplication, "id" | "formData"> = {
      id: "app-1",
      formData: {
        applicantType: "Individual",
        fullName: "Kabo Modise",
        phone: "+26771234567",
        district: "Gaborone",
        title: "Solar Cold Chain",
        summary: "Off-grid cold storage pods for rural horticulturists in Botswana.",
        primarySector: "Agri-Business",
        problem: "Smallholder farmers lose 35% of produce before reaching regional markets.",
        solution: "Modular solar phase-change cold rooms pay-per-crate via mobile money.",
        implementationApproach: "Deploy 6 pilot units in Central and South-East districts in Q1.",
        permissionToSubmit: true,
        accuracyConfirmed: true,
        privacyConfirmed: true,
      },
    };
    const r = evaluateApplicationReadiness(draft, []);
    assert.equal(r.readyToSubmit, true);
    assert.equal(r.blockers.length, 0);
    assert.ok(r.completedSections.includes(1));
    assert.ok(r.completedSections.includes(12));

    const blocked = evaluateApplicationReadiness(
      { id: "app-2", formData: { title: "Hi", privacyConfirmed: false } },
      []
    );
    assert.equal(blocked.readyToSubmit, false);
    assert.equal(blocked.blockers.length, 6);
  });

  it("enforces evidence file type, 10MB cap, 4-file per-section limit, and HTTPS video links", () => {
    const existing: InnovatorDocument[] = [1, 2, 3, 4].map((i) => ({
      id: `d-${i}`,
      applicationId: "app-1",
      applicationRef: "CEDA-01",
      sectionKey: "feasibility",
      docKind: "file",
      title: `Doc ${i}`,
      category: "Supporting document",
      description: "",
      fileName: `doc${i}.pdf`,
      mimeType: "application/pdf",
      fileSize: 1024,
      storagePath: `uid/app-1/doc${i}.pdf`,
      videoUrl: null,
      passwordProtected: false,
      version: 1,
      uploadStatus: "Saved",
      createdAt: "2026-11-21",
    }));

    assert.equal(
      validateEvidenceFile({ name: "script.sh", size: 500, type: "application/x-sh" }, []),
      "Supported formats: PDF, DOCX, PPTX, XLSX, JPG, or PNG."
    );
    assert.equal(
      validateEvidenceFile({ name: "deck.pdf", size: 11 * 1024 * 1024, type: "application/pdf" }, []),
      "Files must be 10 MB or smaller."
    );
    assert.match(
      validateEvidenceFile(
        { name: "extra.pdf", size: 2048, type: "application/pdf" },
        existing,
        "feasibility",
        "file"
      ) || "",
      /Maximum 4 supporting files/
    );
    assert.equal(
      validateEvidenceFile({ name: "extra.pdf", size: 2048, type: "application/pdf" }, existing, "impact", "file"),
      null
    );

    assert.equal(validateVideoLink("http://example.com/demo"), "Video links must begin with https://");
    assert.equal(validateVideoLink("https://vimeo.com/123456"), null);
  });

  it("filters, sorts, checks withdrawal rules, and builds clean applicant summaries", () => {
    const apps: InnovatorApplication[] = [
      {
        id: "1",
        reference: "CEDA-001",
        applicantType: "Individual",
        sector: "ICT",
        applicant: "Kabo",
        title: "Alpha",
        summary: "Test",
        currentStep: 12,
        formData: {},
        status: "Approved",
        requestedChanges: [],
        outcome: { status: "Approved", outcomeDate: "2026-11-20", feedback: "Strong market fit" },
        receiptCode: "RCPT-AA11",
        submittedDate: "2026-11-01",
        applicantTimeline: [],
        version: 2,
        createdAt: "2026-10-20",
        updatedAt: "2026-11-20",
      },
      {
        id: "2",
        reference: "CEDA-002",
        applicantType: "Registered company",
        sector: "Agri",
        applicant: "GreenCo",
        title: "Beta",
        summary: "Draft",
        currentStep: 3,
        formData: {},
        status: "Draft",
        requestedChanges: [],
        applicantTimeline: [],
        version: 1,
        createdAt: "2026-11-18",
        updatedAt: "2026-11-21",
      },
    ];

    assert.equal(matchesStatusFilter("Approved", "Completed"), true);
    assert.equal(matchesStatusFilter("In review", "Completed"), false);
    assert.equal(filterAndSortApplications(apps, { status: "Completed" }).length, 1);
    assert.equal(filterAndSortApplications(apps, { sort: "title_asc" })[0]?.reference, "CEDA-001");

    assert.equal(canWithdrawApplication(apps[1]), true);
    assert.equal(canWithdrawApplication({ status: "In review" }), false);
    assert.equal(canWithdrawApplication("Approved"), false);

    const receipt = buildReceiptSummaryText(apps[0], []);
    assert.match(receipt, /CEDA-001/);
    assert.match(receipt, /RCPT-AA11/);

    const outcome = buildOutcomeSummaryText(apps[0]);
    assert.match(outcome, /Strong market fit/);
    assert.doesNotMatch(outcome, /assessor/i);
  });

  it("enforces alternative contact validation, document linking, 12/8/4 limits, checklist, and overview aggregators", () => {
    const file: InnovatorDocument = {
      id: "doc-prob",
      applicationId: "app-1",
      applicationRef: "CEDA-01",
      sectionKey: "problem",
      docKind: "file",
      title: "Problem Brief",
      category: "Answer: problem",
      description: "",
      fileName: "problem.pdf",
      mimeType: "application/pdf",
      fileSize: 2048,
      storagePath: "uid/app-1/problem.pdf",
      videoUrl: null,
      passwordProtected: false,
      version: 1,
      uploadStatus: "Saved",
      createdAt: "2026-11-21",
    };

    assert.equal(
      linkedDocumentIsValid({ problemSource: "document", problemDocument: "doc-prob" }, [file], "problemSource", "problemDocument", "problem"),
      true
    );
    assert.equal(
      linkedDocumentIsValid({ problemSource: "document", problemDocument: "doc-prob" }, [{ ...file, sectionKey: "impact" }], "problemSource", "problemDocument", "problem"),
      false
    );
    assert.equal(
      linkedDocumentIsValid({ problemSource: "write" }, [], "problemSource", "problemDocument", "problem"),
      true
    );

    assert.equal(sectionFileLimit("applicant"), 12);
    assert.equal(sectionFileLimit("supplementary"), 8);
    assert.equal(sectionFileLimit("problem"), 4);

    const indChecklist = documentChecklist("Individual", []);
    const compChecklist = documentChecklist("Registered company", []);
    assert.ok(indChecklist.some((c) => c.label === "Certified applicant identity"));
    assert.ok(compChecklist.some((c) => c.label === "Directors, shareholders and certified identity records"));

    for (const stage of INNOVATION_STAGES) {
      assert.ok(STAGE_MATRIX[stage]?.summary);
      assert.ok(STAGE_MATRIX[stage]?.metricsLabel);
      assert.ok(STAGE_MATRIX[stage]?.milestoneHint);
    }

    const withBadAltContact = evaluateApplicationReadiness(
      {
        id: "app-alt",
        formData: {
          fullName: "Kabo Modise",
          phone: "+26771234567",
          district: "Gaborone",
          alternativeContactName: "Tebogo",
          alternativeContactPhone: "+26772345678",
          alternativeContactConsent: false,
          title: "Solar Pod",
          summary: "Off-grid cold storage pods for rural horticulturists in Botswana.",
          problem: "Smallholder farmers lose 35% of produce before reaching regional markets.",
          solution: "Modular solar phase-change cold rooms pay-per-crate via mobile money.",
          implementationApproach: "Deploy 6 pilot units in Central and South-East districts.",
          permissionToSubmit: true,
          accuracyConfirmed: true,
          privacyConfirmed: true,
        },
      },
      []
    );
    assert.equal(withBadAltContact.readyToSubmit, false);
    assert.ok(withBadAltContact.blockers.some((b) => b.step === 1));

    assert.equal(normalizeRequestedChanges({ sectionKey: "problem", deadline: "2026-12-01" }).length, 1);
    assert.equal(applicationRequiredAction({ status: "Changes requested", currentStep: 12, requestedChanges: { deadline: "2026-12-01" } }), "Respond by 2026-12-01");

    const requiredActions = collectRequiredActions([
      {
        id: "a",
        reference: "CEDA-1",
        applicantType: "Individual",
        sector: "ICT",
        applicant: "Kabo",
        title: "Draft 1",
        summary: "",
        currentStep: 3,
        formData: {},
        requestedChanges: [],
        version: 1,
        createdAt: "2026-11-18",
        updatedAt: "2026-11-20",
        status: "Draft",
      },
      {
        id: "b",
        reference: "CEDA-2",
        applicantType: "Individual",
        sector: "Energy",
        applicant: "Kabo",
        title: "Clarify 2",
        summary: "",
        currentStep: 12,
        formData: {},
        requestedChanges: { sectionLabel: "Problem clarification", deadline: "2026-11-28" },
        version: 1,
        createdAt: "2026-11-18",
        updatedAt: "2026-11-21",
        status: "Changes requested",
        timeline: [
          { label: "Draft created", detail: "Started", at: "2026-11-18 09:00" },
          { label: "Submitted", detail: "Sent", at: "2026-11-20 14:30" },
        ],
      },
    ]);
    assert.deepEqual(requiredActions.map((a) => a.reference), ["CEDA-2", "CEDA-1"]);

    const activity = collectRecentActivity([
      {
        id: "b",
        reference: "CEDA-2",
        applicantType: "Individual",
        sector: "Energy",
        applicant: "Kabo",
        title: "Clarify 2",
        summary: "",
        currentStep: 12,
        formData: {},
        requestedChanges: [],
        version: 1,
        createdAt: "2026-11-18",
        updatedAt: "2026-11-21",
        status: "Submitted",
        timeline: [
          { label: "Draft created", detail: "Started", at: "2026-11-18 09:00" },
          { label: "Submitted", detail: "Sent", at: "2026-11-20 14:30" },
        ],
      },
    ]);
    assert.equal(activity[0]?.label, "Submitted");

    const openReq = {
      id: "SUP-101",
      title: "Human support follow-up from Optimus Prime",
      kind: "Support",
      priority: "Normal",
      state: "Waiting",
      owner: "CEDA Support Desk",
      applicationRef: null,
      detail: "Help with evidence",
      steps: "",
      thread: [],
      reportedAt: "2026-11-21",
    };
    const closedReq = { ...openReq, id: "SUP-100", state: "Resolved" };
    assert.equal(isOptimusSupportRequest(openReq), true);
    assert.equal(isClosedSupportRequest(closedReq), true);
    assert.equal(getActiveOptimusSupportRequest([closedReq, openReq])?.id, "SUP-101");
  });

  it("groups portal messages into threads with accurate unread counts", () => {
    const msgs: InnovatorMessage[] = [
      {
        id: "m1",
        applicationId: "app-1",
        applicationRef: "CEDA-001",
        threadType: "application",
        subject: "Submission receipt",
        senderName: "CEDA Portal",
        senderRole: "system",
        body: "Received",
        isRead: false,
        createdAt: "2026-11-20 10:00",
      },
      {
        id: "m2",
        applicationId: "app-1",
        applicationRef: "CEDA-001",
        threadType: "application",
        subject: "Submission receipt",
        senderName: "Kabo",
        senderRole: "innovator",
        body: "Thank you",
        isRead: true,
        createdAt: "2026-11-20 10:05",
      },
    ];
    const threads = groupMessageThreads(msgs);
    assert.equal(threads.length, 1);
    assert.equal(threads[0].unread, true);
    assert.equal(threads[0].unreadCount, 1);
  });
});

describe("mobile innovator API and storage contracts", () => {
  it("encodes private storage segments safely and caches bootstrap reads in RAM until mutated", async () => {
    assert.equal(
      encodeStoragePath("user-1/app-1/my report (v1).pdf"),
      "user-1/app-1/my%20report%20(v1).pdf"
    );
    assert.ok(generateIdempotencyKey().length >= 12);

    invalidateInnovatorCache();
    const originalFetch = globalThis.fetch;
    const calls: { url: string; body: string }[] = [];

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const bodyStr = String(init?.body || "");
      calls.push({ url, body: bodyStr });
      assert.equal(init?.credentials, "omit");
      assert.equal(init?.redirect, "error");

      if (url.includes("innovator_workspace_bootstrap")) {
        return new Response(
          JSON.stringify({
            profile: { id: "u1", fullName: "Kabo", email: "k@example.com", preferences: {} },
            sectors: [{ id: "sec-1", name: "Agri-Business" }],
            applications: [],
            documents: [],
            messages: [],
            notifications: [],
            supportRequests: [],
            faqs: [],
            optimusHistory: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("innovator_submit_application")) {
        return new Response(JSON.stringify({ id: "app-1", reference: "CEDA-100", status: "Submitted" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/storage/v1/object/sign/innovation-evidence/")) {
        return new Response(JSON.stringify({ signedURL: "/object/sign/innovation-evidence/u1/a1/doc.pdf?token=abc" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    try {
      const cfg = { origin: "https://example.supabase.co", key: "anon-key" };
      const first = await fetchInnovatorBootstrap("jwt-token-abc", false, cfg);
      assert.equal(first.profile.id, "u1");
      assert.equal(calls.length, 1);

      // Second read hits RAM cache
      const second = await fetchInnovatorBootstrap("jwt-token-abc", false, cfg);
      assert.equal(second.profile.fullName, "Kabo");
      assert.equal(calls.length, 1);

      // Submission sends exact RPC payload and invalidates cache
      const sub = await submitApplication(
        "jwt-token-abc",
        {
          appId: "app-1",
          formData: { title: "Solar Pod" },
          expectedVersion: 1,
          idempotencyKey: "mob-sub-123456",
        },
        cfg
      );
      assert.equal(sub.reference, "CEDA-100");
      assert.match(calls[1].body, /p_idempotency_key/);

      await fetchInnovatorBootstrap("jwt-token-abc", false, cfg);
      assert.equal(calls.length, 3);

      const signed = await createSignedEvidenceUrl("jwt-token-abc", "u1/a1/doc.pdf", 120, cfg);
      assert.equal(
        signed,
        "https://example.supabase.co/storage/v1/object/sign/innovation-evidence/u1/a1/doc.pdf?token=abc"
      );
    } finally {
      globalThis.fetch = originalFetch;
      invalidateInnovatorCache();
    }
  });

  it("handles submission-process live chats, unified escalations, and CSAT rating via startLiveChat and rateSupportChat", async () => {
    const originalFetch = globalThis.fetch;
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const cfg = { origin: "https://example.supabase.co", key: "anon-key" };

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      calls.push({ url, body });

      if (url.includes("innovator_start_live_chat")) {
        return new Response(
          JSON.stringify([
            {
              id: "CHAT-WIZ7",
              title: body.p_title,
              kind: "Support",
              priority: "Normal",
              state: "Open",
              owner: "CEDA Support Desk",
              applicationRef: body.p_application_ref,
              escalationSource: body.p_escalation_source,
              wizardStep: body.p_wizard_step,
              detail: body.p_message,
              steps: `Live Chat · Submission Step ${body.p_wizard_step}`,
              thread: [],
              reportedAt: "2026-11-23 10:15",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("innovator_rate_support_chat")) {
        return new Response(
          JSON.stringify([
            {
              id: body.p_reference,
              title: "Submission live chat · Step 7",
              kind: "Support",
              priority: "Normal",
              state: "Investigating",
              owner: "Kagiso",
              applicationRef: "CEDA-007",
              escalationSource: "Submission Wizard",
              wizardStep: 7,
              satisfactionRating: body.p_rating,
              detail: "Help on step 7",
              steps: "Live Chat · Submission Step 7",
              thread: [],
              reportedAt: "2026-11-23 10:15",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    try {
      const started = await startLiveChat(
        "jwt-token-abc",
        {
          message: "Need help describing our Pilot milestone on Step 7",
          escalationSource: "Submission Wizard",
          applicationRef: "CEDA-007",
          wizardStep: 7,
        },
        cfg
      );
      assert.equal(started.length, 1);
      assert.equal(started[0].id, "CHAT-WIZ7");
      assert.equal(started[0].wizardStep, 7);
      assert.equal(isOptimusSupportRequest(started[0]), true);
      assert.equal(getActiveOptimusSupportRequest(started)?.id, "CHAT-WIZ7");
      assert.equal(getActiveLiveChatRequests(started).length, 1);

      const rated = await rateSupportChat("jwt-token-abc", "CHAT-WIZ7", 5, "Quick consultant help", cfg);
      assert.equal(rated[0].satisfactionRating, 5);
      assert.equal(calls.length, 2);
    } finally {
      globalThis.fetch = originalFetch;
      invalidateInnovatorCache();
    }
  });
});
