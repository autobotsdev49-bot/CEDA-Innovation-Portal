import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AVAILABILITY_STATES,
  buildConversationTimeline,
  buildLiveChatAnalyticsCsv,
  buildLiveChatAnalyticsReport,
  buildOfficerPerformance,
  buildSupportOverview,
  evaluateLiveChatAvailability,
  filterSupportTickets,
  firstNameOnly,
  formatWaitingTime,
  getAgentActiveChats,
  getEscalationChannel,
  getImmediateActionSignals,
  getLatestActivityAt,
  getOptimusConversationSummary,
  getTicketSource,
  isApproachingDeadline,
  isInnovatorRepliedToWaiting,
  isLiveChatEscalation,
  isNewUnopenedRequest,
  isOptimusEscalation,
  isResolvedToday,
  isTicketOverdue,
  isUnansweredRequest,
  isUrgentRequest,
  LIVE_CHAT_HOURS,
  SUPPORT_QUICK_REPLIES,
  ticketDisplayTitle,
  ticketLastPreview,
  ticketProgressPercent,
} from "../mobile/supportOverview.js";

process.env.EXPO_PUBLIC_SUPABASE_URL = "https://demo.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

const {
  connectSupportTicket,
  fetchSupportTickets,
  invalidateSupportCache,
  updateSupportTicket,
} = await import("../mobile/supportApi.ts");

const sampleTickets = [
  {
    id: "SUP-101",
    title: "Human support follow-up from Optimus Prime",
    kind: "Support",
    reporter: "Kabo Modise",
    priority: "High",
    state: "Open",
    owner: "Unassigned",
    reported: "2026-11-22 10:00",
    updatedAt: "2026-11-22 10:05",
    application: "CEDA-009",
    detail: "Applicant asked Optimus Prime about proof of residence limits.",
    thread: [{ sender: "Kabo Modise", role: "innovator", body: "Need help attaching proof of residence.", at: "2026-11-22 10:00" }],
  },
  {
    id: "BUG-102",
    title: "Attachment upload stalls on Android",
    kind: "Bug",
    reporter: "Thabo Kgosi",
    priority: "Normal",
    state: "Investigating",
    owner: "Support Officer",
    reported: "2026-11-21 14:20",
    updatedAt: "2026-11-22 08:30",
    application: null,
    detail: "Tap attach button inside Step 6.",
    thread: [{ sender: "Support Officer", role: "support", body: "Checking upload logs now.", at: "2026-11-22 08:30" }],
  },
  {
    id: "FBK-103",
    title: "Clarify financial projection template",
    kind: "Feedback",
    reporter: "Mpho Setlale",
    priority: "Low",
    state: "Resolved",
    owner: "Support Officer",
    reported: "2026-11-20 09:00",
    updatedAt: "2026-11-21 16:40",
    application: null,
    detail: "Template hint helped once explained.",
    thread: [],
  },
];

test("supportOverview computes open, new, urgent, overdue, resolved today, and stage metrics", () => {
  const nowMs = Date.parse("2026-11-22T12:00:00+02:00");
  const overdueTicket = {
    id: "BUG-104",
    title: "Stale unresolved request over SLA",
    kind: "Bug",
    reporter: "Lesego Molefe",
    priority: "Normal",
    state: "Investigating",
    owner: "Support Officer",
    reported: "2026-11-20 10:00",
    updatedAt: "2026-11-20 11:00",
    application: null,
    detail: "Overdue item.",
    thread: [{ sender: "Support Officer", role: "support", body: "Looking into it.", at: "2026-11-20 11:00" }],
  };
  const resolvedTodayTicket = {
    id: "FBK-105",
    title: "Resolved today feedback",
    kind: "Feedback",
    reporter: "Neo Kgathi",
    priority: "Normal",
    state: "Resolved",
    owner: "Support Officer",
    reported: "2026-11-22 09:00",
    updatedAt: "2026-11-22 11:30",
    application: null,
    detail: "Completed same day.",
    thread: [],
  };
  const allTickets = [...sampleTickets, overdueTicket, resolvedTodayTicket];

  const summary = buildSupportOverview(allTickets, { nowMs });
  assert.deepEqual(AVAILABILITY_STATES, ["Available", "Busy", "Offline"]);
  assert.equal(summary.total, 5);
  assert.equal(summary.openRequests, 3);
  assert.equal(summary.newRequests, 1);
  assert.equal(summary.urgentRequests, 2);
  assert.equal(summary.overdueRequests, 1);
  assert.equal(summary.resolvedToday, 1);
  assert.equal(summary.optimusEscalations, 1);
  assert.equal(summary.urgentQueue[0].id, "BUG-104");
  assert.equal(summary.urgentQueue[1].id, "SUP-101");
  assert.equal(summary.urgentQueue[2].id, "BUG-102");
  assert.equal(isTicketOverdue(overdueTicket, nowMs), true);
  assert.equal(isTicketOverdue(sampleTickets[1], nowMs), false);
  assert.equal(isUrgentRequest(overdueTicket, nowMs), true);
  assert.equal(isResolvedToday(resolvedTodayTicket, nowMs), true);
  assert.equal(isResolvedToday(sampleTickets[2], nowMs), false);
  assert.equal(isNewUnopenedRequest(sampleTickets[0]), true);

  const afterOpen = buildSupportOverview(allTickets, { nowMs, openedIds: new Set(["SUP-101"]) });
  assert.equal(afterOpen.newRequests, 0);
  assert.equal(isOptimusEscalation(sampleTickets[0]), true);
  assert.equal(isOptimusEscalation(sampleTickets[1]), false);
  assert.equal(ticketProgressPercent("Open"), 25);
  assert.equal(ticketProgressPercent("Resolved"), 100);
  assert.equal(ticketLastPreview(sampleTickets[1]), "Checking upload logs now.");
  assert.ok(SUPPORT_QUICK_REPLIES.length >= 4);
});

test("supportApi caches reads in RAM, validates inputs, and invalidates cache on updateSupportTicket", async (t) => {
  invalidateSupportCache();
  const account = {
    token: "support-token",
    name: "Support Officer",
    role: "support",
    expiresAt: Date.now() + 60_000,
  };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls++;
    const path = new URL(url).pathname;
    if (path === "/rest/v1/rpc/support_ticket_list") {
      return Response.json(sampleTickets);
    }
    assert.equal(path, "/rest/v1/rpc/support_update_ticket");
    const body = JSON.parse(String(options.body));
    assert.equal(body.p_reference, "SUP-101");
    assert.equal(body.p_state, "Investigating");
    assert.equal(body.p_reason, "Started investigation");
    return Response.json(sampleTickets.map(item => (item.id === "SUP-101" ? { ...item, state: "Investigating" } : item)));
  });

  const first = await fetchSupportTickets(account);
  const second = await fetchSupportTickets(account);
  assert.equal(first.length, 3);
  assert.equal(second.length, 3);
  assert.equal(calls, 1);

  await assert.rejects(
    updateSupportTicket(account, { reference: "SUP-101", state: "Investigating", reason: "abc" }),
    /5 to 500/
  );
  assert.equal(calls, 1);

  const updated = await updateSupportTicket(account, {
    reference: "SUP-101",
    state: "Investigating",
    reason: "Started investigation",
    reply: "I am reviewing your upload now.",
  });
  assert.equal(updated[0].state, "Investigating");
  assert.equal(calls, 2);
  invalidateSupportCache();
});

test("connectSupportTicket connects officer cleanly and AI conversation timeline shows handoff first", async (t) => {
  invalidateSupportCache();
  const account = {
    token: "support-token",
    name: "Lehenza mabuto",
    role: "support",
    expiresAt: Date.now() + 60_000,
  };
  let lastPath = "";
  t.mock.method(globalThis, "fetch", async url => {
    lastPath = new URL(url).pathname;
    return Response.json([
      {
        ...sampleTickets[0],
        owner: "Lehenza mabuto",
        ownerFirstName: "Lehenza",
        state: "Investigating",
      },
    ]);
  });

  const connected = await connectSupportTicket(account, "SUP-101");
  assert.equal(lastPath, "/rest/v1/rpc/support_connect_ticket");
  assert.equal(connected[0].ownerFirstName, "Lehenza");
  invalidateSupportCache();

  assert.equal(firstNameOnly("Lehenza mabuto"), "Lehenza");
  assert.equal(firstNameOnly("Unassigned"), "Unassigned");
  assert.equal(ticketDisplayTitle(sampleTickets[0]), "Kabo Modise");
  assert.equal(ticketDisplayTitle(sampleTickets[1]), "Attachment upload stalls on Android");

  const timeline = buildConversationTimeline({
    id: "TKT-DDB3AD",
    title: "Human support follow-up from Optimus Prime",
    kind: "Support",
    reporter: "Tomson Ntebang",
    priority: "Normal",
    state: "Open",
    owner: "Unassigned",
    reported: "2026-11-21 22:38",
    detail: "I need more help with: uploading documents\n\nOriginal question: Okay",
    steps: "Escalated from Optimus Prime",
    aiConversation: [
      {
        id: "ai-1",
        question: "How do I submit?",
        answer: "Prepare your overview first.",
        sourceArticle: "How to submit",
        escalated: false,
        createdAt: "2026-11-21 22:37",
      },
      {
        id: "ai-2",
        question: "Okay",
        answer: "Use Request human support if you need help.",
        sourceArticle: "Portal Knowledge",
        escalated: true,
        createdAt: "2026-11-21 22:38",
      },
    ],
    thread: [
      {
        sender: "Tomson Ntebang",
        role: "innovator",
        body: "I need more help with: uploading documents\n\nOriginal question: Okay",
        at: "2026-11-21 22:38",
      },
      {
        sender: "Tomson Ntebang",
        role: "innovator",
        body: "Hello",
        at: "2026-11-22 18:17",
      },
    ],
  });

  assert.equal(timeline[0].kind, "divider");
  assert.equal(timeline[0].tone, "ai");
  assert.equal(timeline[1].role, "innovator");
  assert.equal(timeline[2].role, "ai");
  const handoffIdx = timeline.findIndex(item => item.kind === "divider" && item.tone === "handoff");
  assert.ok(handoffIdx > 2);
  assert.equal(timeline[handoffIdx + 1].tone, "date");
  assert.equal(timeline[handoffIdx + 2].body, "I need more help with: uploading documents");
  assert.equal(timeline[timeline.length - 1].body, "Hello");
});

test("support queue ordering, source/waiting helpers, conversation preview, and filters work cleanly", () => {
  const nowMs = Date.parse("2026-11-22T12:00:00+02:00");
  const waitingRepliedTicket = {
    id: "TKT-WAIT",
    title: "Clarify collateral form",
    kind: "Support",
    reporter: "Mpho Dube",
    priority: "Normal",
    state: "Open",
    owner: "Kagiso Modise",
    reported: "2026-11-22 08:00",
    updatedAt: "2026-11-22 11:20",
    application: "CEDA-015",
    detail: "Initial query.",
    thread: [
      { sender: "Kagiso Modise", role: "support", body: "Please share your company reg.", at: "2026-11-22 09:00" },
      { sender: "Mpho Dube", role: "innovator", body: "Uploaded now, please verify.", at: "2026-11-22 11:20" },
    ],
  };
  const nearDeadlineTicket = {
    id: "TKT-DEAD",
    title: "Approaching 24h response deadline",
    kind: "Support",
    reporter: "Palesa Tsheko",
    priority: "Normal",
    state: "Investigating",
    owner: "Kagiso Modise",
    reported: "2026-11-21 17:00",
    updatedAt: "2026-11-21 17:30",
    application: null,
    detail: "Checking status.",
    thread: [{ sender: "Kagiso Modise", role: "support", body: "Checking now.", at: "2026-11-21 17:30" }],
  };
  const oldUnanswered = {
    id: "TKT-OLD",
    title: "Oldest unanswered enquiry",
    kind: "Support",
    reporter: "Bame Kgotla",
    priority: "Normal",
    state: "Open",
    owner: "Unassigned",
    reported: "2026-11-22 07:30",
    updatedAt: "2026-11-22 07:30",
    application: "CEDA-020",
    detail: "Original question: Can two founders co-apply?",
    thread: [{ sender: "Bame Kgotla", role: "innovator", body: "Please confirm co-applicant rule.", at: "2026-11-22 07:30" }],
  };

  const ranked = filterSupportTickets([nearDeadlineTicket, waitingRepliedTicket, oldUnanswered, ...sampleTickets], {
    filterKey: "Immediate action",
    nowMs,
  });

  // Urgent first (SUP-101 High priority), then unanswered (BUG-102 has officer reply; TKT-OLD unanswered > 4.5h), etc.
  assert.equal(ranked[0].id, "SUP-101");
  assert.equal(ranked[1].id, "TKT-OLD");
  assert.equal(getTicketSource(sampleTickets[0]), "Optimus Prime");
  assert.equal(getTicketSource(oldUnanswered), "Help & Support");
  assert.equal(isUnansweredRequest(oldUnanswered), true);
  assert.equal(isInnovatorRepliedToWaiting(waitingRepliedTicket), true);
  assert.equal(isApproachingDeadline(nearDeadlineTicket, nowMs), true);
  assert.equal(formatWaitingTime(oldUnanswered, nowMs), "4h 30m waiting");
  assert.equal(formatWaitingTime(sampleTickets[2], nowMs), "Resolved");
  assert.equal(getLatestActivityAt(waitingRepliedTicket), "2026-11-22 11:20");

  const signals = getImmediateActionSignals(waitingRepliedTicket, { nowMs });
  assert.ok(signals.some(s => s.key === "replied"));

  const optimusFilter = filterSupportTickets([waitingRepliedTicket, oldUnanswered, ...sampleTickets], {
    filterKey: "Optimus Prime",
    nowMs,
  });
  assert.equal(optimusFilter.length, 1);
  assert.equal(optimusFilter[0].id, "SUP-101");

  const repliedFilter = filterSupportTickets([waitingRepliedTicket, oldUnanswered, ...sampleTickets], {
    filterKey: "Replied",
    nowMs,
  });
  assert.deepEqual(repliedFilter.map(t => t.id), ["TKT-WAIT"]);

  const sourceFiltered = filterSupportTickets([waitingRepliedTicket, ...sampleTickets], {
    filterKey: "Immediate action",
    sourceFilter: "Optimus Prime",
    nowMs,
  });
  assert.deepEqual(sourceFiltered.map(t => t.id), ["SUP-101"]);

  const previewOptimus = getOptimusConversationSummary({
    ...sampleTickets[0],
    detail: "Applicant asked Optimus Prime.\n\nOriginal question: Can I attach PDF?",
  });
  assert.equal(previewOptimus.isOptimus, true);
  assert.equal(previewOptimus.sectionLabel, "Conversation with Optimus Prime");
  assert.equal(previewOptimus.originalQuestion, "Can I attach PDF?");

  const previewStandard = getOptimusConversationSummary(waitingRepliedTicket);
  assert.equal(previewStandard.isOptimus, false);
  assert.equal(previewStandard.sectionLabel, "Latest message preview");
});

test("buildOfficerPerformance scopes metrics strictly to the signed-in officer and respects feedback availability", () => {
  const nowMs = Date.parse("2026-11-22T15:00:00+02:00");
  const tickets = [
    {
      id: "TKT-A",
      title: "Handled and resolved today",
      kind: "Support",
      reporter: "Innovator One",
      priority: "Normal",
      state: "Resolved",
      owner: "Kagiso Modise",
      reported: "2026-11-22 10:00",
      updatedAt: "2026-11-22 12:00",
      detail: "Issue solved.",
      thread: [
        { sender: "Innovator One", role: "innovator", body: "Help", at: "2026-11-22 10:00" },
        { sender: "Kagiso Modise", role: "support", body: "Checking now", at: "2026-11-22 10:30" },
      ],
      history: [{ actor: "Kagiso Modise", action: "Updated status from Investigating to Resolved", at: "2026-11-22 12:00" }],
      reopenedCount: 0,
      satisfactionRating: null,
    },
    {
      id: "TKT-B",
      title: "Reopened ticket handled by Kagiso",
      kind: "Bug",
      reporter: "Innovator Two",
      priority: "High",
      state: "Investigating",
      owner: "Kagiso Modise",
      reported: "2026-11-22 08:00",
      updatedAt: "2026-11-22 13:00",
      detail: "Bug report.",
      thread: [{ sender: "Kagiso Modise", role: "support", body: "Looking again", at: "2026-11-22 09:00" }],
      history: [{ actor: "Innovator Two", action: "Innovator reopened from Resolved to Open", at: "2026-11-22 12:30" }],
      reopenedCount: 1,
      satisfactionRating: null,
    },
    {
      id: "TKT-OTHER",
      title: "Resolved by another officer",
      kind: "Support",
      reporter: "Innovator Three",
      priority: "Low",
      state: "Resolved",
      owner: "Naledi Phiri",
      reported: "2026-11-22 09:00",
      updatedAt: "2026-11-22 10:00",
      detail: "Should not count toward Kagiso.",
      thread: [{ sender: "Naledi Phiri", role: "support", body: "Done", at: "2026-11-22 10:00" }],
      reopenedCount: 0,
      satisfactionRating: 5,
    },
  ];

  const kagisoPerf = buildOfficerPerformance(tickets, "Kagiso Modise", { nowMs });
  assert.equal(kagisoPerf.personalCount, 2);
  assert.equal(kagisoPerf.handledToday, 2);
  assert.equal(kagisoPerf.resolvedToday, 1);
  assert.equal(kagisoPerf.avgFirstResponseMinutes, 45);
  assert.equal(kagisoPerf.avgFirstResponseLabel, "45m");
  assert.equal(kagisoPerf.avgResolutionMinutes, 120);
  assert.equal(kagisoPerf.avgResolutionLabel, "2h");
  assert.equal(kagisoPerf.reopenedRequests, 1);
  assert.equal(kagisoPerf.satisfactionRatingAvg, null);
  assert.equal(kagisoPerf.satisfactionLabel, "Pending feedback");

  const withRatings = buildOfficerPerformance(
    tickets.map(item => (item.id === "TKT-A" ? { ...item, satisfactionRating: 4 } : item)),
    "Kagiso Modise",
    { nowMs }
  );
  assert.equal(withRatings.satisfactionRatingAvg, 4);
  assert.equal(withRatings.satisfactionLabel, "4.0 / 5");
});

test("web and mobile support workspaces enforce CSP safety, queue rows, conversation close, and performance view", () => {
  const supportTs = readFileSync(new URL("../src/publicSite/support.ts", import.meta.url), "utf8");
  const supportCss = readFileSync(new URL("../src/publicSite/assets/support.css", import.meta.url), "utf8");
  const supportJs = readFileSync(new URL("../src/publicSite/assets/support.js", import.meta.url), "utf8");
  const previewTs = readFileSync(new URL("../scripts/previewPublic.ts", import.meta.url), "utf8");
  const distSupportJs = readFileSync(new URL("../dist/assets/support.js", import.meta.url), "utf8");
  const mobileSupport = readFileSync(new URL("../mobile/SupportWorkspace.tsx", import.meta.url), "utf8");
  const mobileModal = readFileSync(new URL("../mobile/SupportConversationModal.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(supportJs, /\.style\./);
  assert.doesNotMatch(supportJs, /setAttribute\(["']style["']/);
  assert.doesNotMatch(distSupportJs, /^\s*import\s+/m);
  assert.match(distSupportJs, /buildSupportOverview/);
  assert.match(distSupportJs, /buildOfficerPerformance/);
  assert.match(distSupportJs, /filterSupportTickets/);
  assert.match(distSupportJs, /updateActiveSection/);
  assert.match(previewTs, /"support\.css"/);
  assert.match(previewTs, /"support\.js"/);
  assert.match(previewTs, /"supportOverview\.js"/);
  assert.match(supportCss, /--support-bg:\s*#ffffff/);
  assert.match(supportCss, /\.support-kpi-grid[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(supportTs, /support-visual-grid/);
  assert.doesNotMatch(supportTs, /Active stage balance/);
  assert.match(supportTs, /data-support-root hidden/);
  assert.match(supportTs, /id="queue" class="admin-work-section support-section" hidden/);
  assert.match(supportTs, /id="performance" class="admin-work-section support-section" hidden/);
  assert.match(supportTs, /data-support-refresh/);
  assert.match(supportTs, /Current availability/);
  assert.match(supportTs, /Performance summary/);
  assert.match(supportTs, /data-support-performance-grid/);
  assert.match(supportTs, /Admin portal/);
  assert.match(supportTs, /support-mfa-qr/);
  assert.match(supportTs, /data-support-password-form/);

  for (const label of ["Open requests", "New requests", "Urgent requests", "Resolved today"]) {
    assert.match(supportJs, new RegExp(label));
    assert.match(mobileSupport, new RegExp(label));
  }

  for (const metric of [
    "Requests handled today",
    "Requests resolved today",
    "Average first response time",
    "Average resolution time",
    "Reopened requests",
    "Satisfaction rating",
  ]) {
    assert.match(supportJs, new RegExp(metric));
    assert.match(mobileSupport, new RegExp(metric));
  }

  assert.match(supportJs, /Open conversation/);
  assert.match(supportJs, /Close ticket/);
  assert.match(supportJs, /"Connect"/);
  assert.doesNotMatch(supportJs, /Back to queue/);
  assert.match(supportJs, /buildConversationTimeline/);
  assert.match(supportJs, /support_connect_ticket/);
  assert.match(supportCss, /\.support-quick-chips[\s\S]*flex-wrap:\s*nowrap/);
  assert.match(supportCss, /\.support-quick-chips[\s\S]*overflow-x:\s*auto/);
  assert.match(supportCss, /\.support-message-composer/);
  assert.match(mobileSupport, /Open conversation/);
  assert.match(mobileModal, /Close ticket/);
  assert.match(mobileModal, /"Connect"/);
  assert.match(mobileModal, /buildConversationTimeline/);
  assert.match(mobileModal, /Time of latest activity/);
  assert.match(mobileModal, /Application reference/);

  assert.match(mobileSupport, /buildSupportOverview/);
  assert.match(mobileSupport, /buildOfficerPerformance/);
  assert.match(mobileSupport, /filterSupportTickets/);
  assert.match(mobileSupport, /Current availability/);
  assert.match(mobileSupport, /AVAILABILITY_STATES/);
  assert.match(mobileSupport, /label=\{refreshing \? "Refreshing\.\.\." : "Refresh"\}/);
  assert.doesNotMatch(mobileSupport, /Categories & priority balance/);
  assert.doesNotMatch(mobileSupport, /Active stage balance/);
  assert.doesNotMatch(mobileSupport, /Urgent & new requests/);
  assert.match(mobileSupport, /options=\{\["All", "New", "Urgent", "Resolved"\]\}/);
  assert.doesNotMatch(mobileSupport, /"All sources"/);
  assert.doesNotMatch(supportTs, /data-support-source-filter/);
  assert.doesNotMatch(supportTs, /data-support-priority-filter/);
  assert.doesNotMatch(supportTs, /"Replied to waiting"/);
  assert.match(distSupportJs, /verifiedProfileWithTimeout/);
  assert.match(mobileSupport, /<ProgressBar/);
  assert.match(mobileSupport, /AccountSecurityCards/);
  assert.match(mobileModal, /SUPPORT_QUICK_REPLIES/);
  assert.match(mobileModal, /updateSupportTicket/);
});

test("live chat enforces 09:00-16:00 working days ONLY, busy/after-hours/non-working notifications, multi-user concurrency, unified escalations, and analytics CSV report", () => {
  assert.equal(LIVE_CHAT_HOURS.startHour, 9);
  assert.equal(LIVE_CHAT_HOURS.endHour, 16);
  assert.equal(LIVE_CHAT_HOURS.timezone, "Africa/Gaborone");

  // 1. Working day during 09:00-16:00 CAT (Monday 2026-11-23 10:30 CAT) with available agent
  const mondayWorkingMs = Date.parse("2026-11-23T10:30:00+02:00");
  const onlineAvail = evaluateLiveChatAvailability({
    nowMs: mondayWorkingMs,
    agents: [
      { id: "ag-1", name: "Kagiso Modise", availability: "Available", activeChats: 2, maxConcurrent: 5 },
      { id: "ag-2", name: "Naledi Phiri", availability: "Available", activeChats: 1, maxConcurrent: 5 },
    ],
  });
  assert.equal(onlineAvail.status, "available");
  assert.equal(onlineAvail.isLiveAvailable, true);
  assert.equal(onlineAvail.isWorkingDay, true);
  assert.equal(onlineAvail.isWithinHours, true);
  assert.equal(onlineAvail.availableAgentsCount, 2);
  assert.equal(onlineAvail.totalActiveChats, 3);

  // 2. Working day during 09:00-16:00 CAT when ALL agents are busy or at max concurrent capacity
  const allBusyAvail = evaluateLiveChatAvailability({
    nowMs: mondayWorkingMs,
    agents: [
      { id: "ag-1", name: "Kagiso Modise", availability: "Busy", activeChats: 3, maxConcurrent: 5 },
      { id: "ag-2", name: "Naledi Phiri", availability: "Available", activeChats: 5, maxConcurrent: 5 },
    ],
  });
  assert.equal(allBusyAvail.status, "all_agents_busy");
  assert.equal(allBusyAvail.isLiveAvailable, false);
  assert.match(allBusyAvail.notificationMessage, /Agent not available at the moment/i);

  // 3. Working day AFTER HOURS (Monday 2026-11-23 16:05 CAT and 08:15 CAT)
  const afterHoursEvening = evaluateLiveChatAvailability({
    nowMs: Date.parse("2026-11-23T16:05:00+02:00"),
    agents: [{ id: "ag-1", name: "Kagiso Modise", availability: "Available", activeChats: 0, maxConcurrent: 5 }],
  });
  assert.equal(afterHoursEvening.status, "after_hours");
  assert.equal(afterHoursEvening.isLiveAvailable, false);
  assert.match(afterHoursEvening.notificationMessage, /Agent not available at the moment/i);
  assert.match(afterHoursEvening.notificationMessage, /09:00hrs to 16:00hrs on working days ONLY/i);

  const beforeHoursMorning = evaluateLiveChatAvailability({
    nowMs: Date.parse("2026-11-23T08:15:00+02:00"),
  });
  assert.equal(beforeHoursMorning.status, "after_hours");
  assert.equal(beforeHoursMorning.isLiveAvailable, false);

  // 4. NON-WORKING DAYS: Weekend (Sunday 2026-11-22 11:00 CAT) and Botswana Public Holiday (2026-09-30 11:00 CAT)
  const sundayAvail = evaluateLiveChatAvailability({
    nowMs: Date.parse("2026-11-22T11:00:00+02:00"),
  });
  assert.equal(sundayAvail.status, "non_working_day");
  assert.equal(sundayAvail.isWorkingDay, false);
  assert.equal(sundayAvail.isLiveAvailable, false);
  assert.match(sundayAvail.notificationMessage, /Agent not available at the moment/i);

  const holidayAvail = evaluateLiveChatAvailability({
    nowMs: Date.parse("2026-09-30T11:00:00+02:00"),
  });
  assert.equal(holidayAvail.status, "non_working_day");
  assert.equal(holidayAvail.isHoliday, true);
  assert.match(holidayAvail.notificationMessage, /Agent not available at the moment/i);

  // 5. Multi-user live chat & unified escalations across Optimus Prime, Submission Wizard, Application Escalation, and Help & Support
  const chatTickets = [
    {
      id: "TKT-OPT1",
      title: "Human support follow-up from Optimus Prime",
      kind: "Support",
      reporter: "Kabo Modise",
      priority: "High",
      state: "Investigating",
      owner: "Kagiso Modise",
      reported: "2026-11-23 09:15",
      updatedAt: "2026-11-23 09:20",
      escalationSource: "Optimus Prime",
      detail: "Escalated from Optimus Prime.",
      thread: [
        { sender: "Kabo Modise", role: "innovator", body: "Need help with locked application.", at: "2026-11-23 09:15" },
        { sender: "Kagiso Modise", role: "support", body: "I am reviewing your application lock now.", at: "2026-11-23 09:20" },
      ],
      satisfactionRating: 5,
    },
    {
      id: "CHAT-WIZ2",
      title: "Submission live chat · Step 6 (Market and impact)",
      kind: "Support",
      reporter: "Thabo Kgosi",
      priority: "Normal",
      state: "Investigating",
      owner: "Kagiso Modise",
      reported: "2026-11-23 10:00",
      updatedAt: "2026-11-23 10:05",
      escalationSource: "Submission Wizard",
      wizardStep: 6,
      detail: "Need consultant guidance on Step 6 market sizing.",
      thread: [
        { sender: "Thabo Kgosi", role: "innovator", body: "What market data is required on Step 6?", at: "2026-11-23 10:00" },
        { sender: "Kagiso Modise", role: "support", body: "Include your target district customer count.", at: "2026-11-23 10:05" },
      ],
      satisfactionRating: 4,
    },
    {
      id: "CHAT-APP3",
      title: "Escalated enquiry · CEDA-2026-0042",
      kind: "Support",
      reporter: "Lesego Molefe",
      priority: "High",
      state: "Investigating",
      owner: "Naledi Phiri",
      reported: "2026-11-22 18:30",
      updatedAt: "2026-11-23 09:10",
      escalationSource: "Application Escalation",
      queuedOutsideHours: true,
      detail: "Clarification deadline question.",
      thread: [
        { sender: "Lesego Molefe", role: "innovator", body: "Can I attach 3 PDFs for my clarification?", at: "2026-11-22 18:30" },
        { sender: "Naledi Phiri", role: "support", body: "Yes, up to 8 supplementary files are allowed.", at: "2026-11-23 09:10" },
      ],
    },
    {
      id: "TKT-GEN4",
      title: "General portal enquiry",
      kind: "Support",
      reporter: "Mpho Setlale",
      priority: "Normal",
      state: "Resolved",
      owner: "Kagiso Modise",
      reported: "2026-11-23 09:00",
      updatedAt: "2026-11-23 09:40",
      detail: "Resolved general inquiry.",
      thread: [
        { sender: "Mpho Setlale", role: "innovator", body: "Where do I download my receipt?", at: "2026-11-23 09:00" },
        { sender: "Kagiso Modise", role: "support", body: "Open My applications and click Download receipt.", at: "2026-11-23 09:10" },
      ],
      satisfactionRating: 5,
    },
  ];

  // Multi-user concurrency: Kagiso Modise is attending to 2 active live chats simultaneously while Naledi Phiri attends to 1
  const kagisoActive = getAgentActiveChats(chatTickets, "Kagiso Modise");
  const nalediActive = getAgentActiveChats(chatTickets, "Naledi Phiri");
  assert.equal(kagisoActive.length, 2);
  assert.equal(nalediActive.length, 1);

  assert.equal(isLiveChatEscalation(chatTickets[0]), true);
  assert.equal(isLiveChatEscalation(chatTickets[1]), true);
  assert.equal(isLiveChatEscalation(chatTickets[2]), true);
  assert.equal(getEscalationChannel(chatTickets[0]), "Optimus Prime");
  assert.equal(getEscalationChannel(chatTickets[1]), "Submission Wizard");
  assert.equal(getEscalationChannel(chatTickets[2]), "Application Escalation");
  assert.equal(getEscalationChannel(chatTickets[3]), "Help & Support");

  // 6. Online Chat Analytics Report & CSV export (Portal Requirement 4(iv))
  const report = buildLiveChatAnalyticsReport(chatTickets, {
    nowMs: mondayWorkingMs,
    agents: [
      { id: "ag-1", name: "Kagiso Modise", availability: "Available", activeChats: 2, maxConcurrent: 5 },
      { id: "ag-2", name: "Naledi Phiri", availability: "Available", activeChats: 1, maxConcurrent: 5 },
    ],
  });

  assert.equal(report.totalChats, 4);
  assert.equal(report.activeCount, 3);
  assert.equal(report.resolvedCount, 1);
  assert.equal(report.workingHoursCount, 3);
  assert.equal(report.afterHoursOrNonWorkingCount, 1);
  assert.equal(report.satisfactionCount, 3);
  assert.equal(report.satisfactionAvg, 4.7);
  assert.equal(report.agentRows.length, 2);

  const csv = buildLiveChatAnalyticsCsv(report);
  assert.match(csv, /Online Live Chat & Escalation Analytics Report/);
  assert.match(csv, /09:00hrs to 16:00hrs on working days ONLY/);
  assert.match(csv, /Optimus Prime AI Escalations,1,25%/);
  assert.match(csv, /Submission Process Live Chat,1,25%/);
  assert.match(csv, /Application & Clarification Escalations,1,25%/);
  assert.match(csv, /Kagiso Modise,2,5,40%/);
});
