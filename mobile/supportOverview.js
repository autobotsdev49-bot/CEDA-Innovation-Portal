/**
 * @typedef {Object} OptimusTurnContext
 * @property {string} id
 * @property {string} [topic]
 * @property {string} question
 * @property {string} answer
 * @property {string} [sourceArticle]
 * @property {boolean} [escalated]
 * @property {string} [createdAt]
 */

/**
 * @typedef {Object} SupportThreadMessage
 * @property {string} sender
 * @property {string} role
 * @property {string} body
 * @property {string} [at]
 */

/**
 * @typedef {Object} SupportHistoryEntry
 * @property {string} [actor]
 * @property {string} [action]
 * @property {string} [at]
 */

/**
 * @typedef {Object} SupportTicket
 * @property {string} id
 * @property {string} title
 * @property {"Bug" | "Support" | "Feedback" | string} kind
 * @property {string} reporter
 * @property {"High" | "Normal" | "Low" | string} priority
 * @property {"Open" | "Investigating" | "Waiting" | "Resolved" | string} state
 * @property {string} owner
 * @property {string | null} [ownerFirstName]
 * @property {string} reported
 * @property {string} [updatedAt]
 * @property {string | null} [application]
 * @property {string} detail
 * @property {string} [steps]
 * @property {string} [escalationSource]
 * @property {number | null} [wizardStep]
 * @property {boolean} [queuedOutsideHours]
 * @property {string} [availabilityStatus]
 * @property {string | null} [availabilityNotice]
 * @property {SupportThreadMessage[]} [thread]
 * @property {SupportHistoryEntry[]} [history]
 * @property {OptimusTurnContext[]} [aiConversation]
 * @property {number} [reopenedCount]
 * @property {number | null} [satisfactionRating]
 */

/**
 * @typedef {"Available" | "Busy" | "Offline"} AvailabilityState
 */

/**
 * @typedef {{ key: string, label: string, count: number, pct: number, color: string }} SupportSegment
 */

export const supportOverviewColors = Object.freeze({
  blue: "#417AC5",
  amber: "#D39B3B",
  purple: "#695198",
  green: "#2D8B57",
  rust: "#9A3D2B",
  teal: "#278477",
  slate: "#7C8590",
});

/** @type {readonly AvailabilityState[]} */
export const AVAILABILITY_STATES = Object.freeze(["Available", "Busy", "Offline"]);
export const SUPPORT_STATES = ["Open", "Investigating", "Waiting", "Resolved"];
export const OVERDUE_HOURS = 24;
export const APPROACHING_DEADLINE_HOURS = 18;

export const LIVE_CHAT_HOURS = Object.freeze({
  startHour: 9,
  endHour: 16,
  timezone: "Africa/Gaborone",
  scheduleLabel: "09:00hrs to 16:00hrs on working days ONLY (Monday to Friday CAT)",
  shortScheduleLabel: "09:00 to 16:00 Mon to Fri CAT",
  defaultMaxConcurrentChats: 5,
});

export const BOTSWANA_PUBLIC_HOLIDAYS = Object.freeze([
  "01-01",
  "01-02",
  "05-01",
  "07-01",
  "09-30",
  "10-01",
  "12-25",
  "12-26",
]);

/**
 * Evaluates CEDA Live Chat availability for 09:00hrs to 16:00hrs working days ONLY (Africa/Gaborone)
 * and multi-agent concurrent chat capacity.
 * @param {{
 *   nowMs?: number,
 *   agents?: ReadonlyArray<{ id?: string, name?: string, availability?: string, activeChats?: number, maxConcurrent?: number }>,
 *   tickets?: readonly SupportTicket[],
 *   officerAvailability?: string,
 *   maxConcurrentPerAgent?: number,
 *   holidays?: readonly string[]
 * }} [options]
 */
export function evaluateLiveChatAvailability(options = {}) {
  const nowMs = typeof options.nowMs === "number" ? options.nowMs : Date.now();
  const maxDefault = Number(options.maxConcurrentPerAgent) > 0
    ? Number(options.maxConcurrentPerAgent)
    : LIVE_CHAT_HOURS.defaultMaxConcurrentChats;
  const dt = new Date(nowMs);

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LIVE_CHAT_HOURS.timezone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(dt);

  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const weekday = String(map.weekday || "Monday");
  const year = String(map.year || "2026");
  const month = String(map.month || "01");
  const day = String(map.day || "01");
  const hourRaw = Number(map.hour ?? 12);
  const hour = hourRaw === 24 ? 0 : hourRaw;
  const minute = Number(map.minute ?? 0);

  const dateKey = `${year}-${month}-${day}`;
  const monthDay = `${month}-${day}`;
  const customHolidays = Array.isArray(options.holidays) ? options.holidays : [];
  const isWeekend = weekday === "Saturday" || weekday === "Sunday";
  const isHoliday = BOTSWANA_PUBLIC_HOLIDAYS.includes(monthDay) || customHolidays.includes(dateKey) || customHolidays.includes(monthDay);
  const isWorkingDay = !isWeekend && !isHoliday;
  const isWithinHours = hour >= LIVE_CHAT_HOURS.startHour && hour < LIVE_CHAT_HOURS.endHour;
  const currentTimeCat = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  // Derive agent roster from explicit agents list or active tickets if not provided
  const rawAgents = Array.isArray(options.agents) ? options.agents : [];
  const tickets = Array.isArray(options.tickets) ? options.tickets : [];

  const derivedAgents = rawAgents.length > 0
    ? rawAgents.map(a => {
        const cap = Number(a?.maxConcurrent) > 0 ? Number(a.maxConcurrent) : maxDefault;
        const active = typeof a?.activeChats === "number"
          ? a.activeChats
          : tickets.filter(
              t =>
                t.state === "Investigating" &&
                String(t.owner || "").trim().toLowerCase() === String(a?.name || "").trim().toLowerCase()
            ).length;
        return {
          id: String(a?.id || a?.name || "agent"),
          name: String(a?.name || "CEDA Consultant"),
          availability: AVAILABILITY_STATES.includes(a?.availability) ? a.availability : "Available",
          activeChats: active,
          maxConcurrent: cap,
        };
      })
    : [
        {
          id: "default-pool",
          name: "CEDA Service Consultant Pool",
          availability: AVAILABILITY_STATES.includes(options.officerAvailability) ? options.officerAvailability : "Available",
          activeChats: tickets.filter(t => t.state === "Investigating").length,
          maxConcurrent: maxDefault,
        },
      ];

  const onlineAgents = derivedAgents.filter(a => a.availability === "Available" || a.availability === "Busy");
  const availableAgents = derivedAgents.filter(
    a => a.availability === "Available" && a.activeChats < a.maxConcurrent
  );
  const busyAgents = derivedAgents.filter(
    a => a.availability === "Busy" || (a.availability === "Available" && a.activeChats >= a.maxConcurrent)
  );
  const totalActiveChats = derivedAgents.reduce((sum, a) => sum + Math.max(0, a.activeChats), 0);
  const totalCapacity = onlineAgents.reduce((sum, a) => sum + Math.max(1, a.maxConcurrent), 0);

  /** @type {"available" | "all_agents_busy" | "after_hours" | "non_working_day"} */
  let status = "available";
  let badgeLabel = "Live Chat Online (09:00 to 16:00)";
  let notificationMessage =
    "CEDA service consultants are online (09:00hrs to 16:00hrs working days). Live chat and escalations connect in real time.";

  if (!isWorkingDay) {
    status = "non_working_day";
    badgeLabel = isHoliday ? "Public Holiday, Offline" : "Weekend, Non Working Day";
    notificationMessage =
      "Agent not available at the moment: CEDA Live Chat is available from 09:00hrs to 16:00hrs on working days ONLY (Monday to Friday, excluding public holidays). Your message or escalation is saved in the queue for the next working day at 09:00hrs.";
  } else if (!isWithinHours) {
    status = "after_hours";
    badgeLabel = "After Hours (Open 09:00 to 16:00)";
    notificationMessage =
      "Agent not available at the moment: CEDA Live Chat operates from 09:00hrs to 16:00hrs on working days ONLY. Your message or escalation has been queued for the next available service consultant at 09:00hrs.";
  } else if (availableAgents.length === 0) {
    status = "all_agents_busy";
    badgeLabel = "All Agents Busy, Queue Active";
    notificationMessage =
      "Agent not available at the moment: all CEDA service consultants are currently busy attending to other live chats. Your chat is queued and the next available consultant will connect shortly.";
  }

  return {
    status,
    isLiveAvailable: status === "available",
    isWorkingDay,
    isHoliday,
    isWithinHours,
    dateKey,
    currentDayLabel: weekday,
    currentTimeCat,
    scheduleLabel: LIVE_CHAT_HOURS.scheduleLabel,
    shortScheduleLabel: LIVE_CHAT_HOURS.shortScheduleLabel,
    badgeLabel,
    notificationMessage,
    availableAgentsCount: availableAgents.length,
    busyAgentsCount: busyAgents.length,
    onlineAgentsCount: onlineAgents.length,
    totalActiveChats,
    totalCapacity,
    maxConcurrentPerAgent: maxDefault,
  };
}

export const SUPPORT_STATE_META = Object.freeze({
  Open: { step: 1, progressPct: 25, color: "#417AC5", caption: "Awaiting triage" },
  Investigating: { step: 2, progressPct: 60, color: "#D39B3B", caption: "Officer reviewing" },
  Waiting: { step: 3, progressPct: 80, color: "#695198", caption: "Awaiting innovator" },
  Resolved: { step: 4, progressPct: 100, color: "#2D8B57", caption: "Completed" },
});

export const SUPPORT_QUICK_REPLIES = Object.freeze([
  {
    id: "investigate",
    label: "Acknowledge & investigate",
    state: "Investigating",
    reason: "Acknowledged request and started investigation",
    reply: "Thank you for contacting CEDA Support. I am reviewing your request now and will share a clear update shortly.",
  },
  {
    id: "clarify",
    label: "Request innovator details",
    state: "Waiting",
    reason: "Requested additional details from the applicant",
    reply: "To help resolve this quickly, please reply with the section or screenshot where you experienced the issue, along with your application reference if applicable.",
  },
  {
    id: "evidence-guide",
    label: "Evidence & PDF reminder",
    state: "Waiting",
    reason: "Shared CEDA document upload and HTTPS link guidance",
    reply: "You can upload up to 4 supporting files per section (12 for Applicant records and 8 for Supplementary, up to 10 MB each in PDF, DOCX, PPTX, XLSX, JPG, or PNG format). Video demonstrations must be shared using a valid HTTPS link.",
  },
  {
    id: "resolved",
    label: "Confirm resolved",
    state: "Resolved",
    reason: "Resolved innovator query and confirmed next steps",
    reply: "Thank you for your patience. Your request has been addressed. Please sign in to check your updated workspace, or open a new support request if you need anything further.",
  },
]);

/**
 * Returns YYYY-MM-DD in Africa/Gaborone timezone.
 * @param {number} [nowMs]
 * @returns {string}
 */
export function botswanaDateKey(nowMs = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Gaborone",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
}

/**
 * Parses a YYYY-MM-DD HH:MM Botswana timestamp into epoch milliseconds.
 * @param {string | undefined | null} value
 * @returns {number}
 */
export function parseBotswanaTimestamp(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (!match) return NaN;
  return Date.parse(`${match[1]}T${match[2]}:00+02:00`);
}

/**
 * Checks whether a support ticket originated from an Optimus Prime escalation.
 * @param {SupportTicket} ticket
 * @returns {boolean}
 */
export function isOptimusEscalation(ticket) {
  const title = String(ticket?.title || "").toLowerCase();
  const detail = String(ticket?.detail || "").toLowerCase();
  const steps = String(ticket?.steps || "").toLowerCase();
  const source = String(ticket?.escalationSource || "").toLowerCase();
  return title.includes("optimus") || detail.includes("optimus") || steps.includes("optimus") || source.includes("optimus");
}

/**
 * Checks whether a support ticket or chat is a live chat session or escalation from any portal flow.
 * @param {SupportTicket} ticket
 * @returns {boolean}
 */
export function isLiveChatEscalation(ticket) {
  if (!ticket) return false;
  if (isOptimusEscalation(ticket)) return true;
  const combined = [
    ticket.title,
    ticket.steps,
    ticket.escalationSource,
    ticket.detail,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /live chat|escalat|consultant|submission step|wizard step|human support/i.test(combined);
}

/**
 * Returns the specific live chat or escalation channel for analytics and UI badges.
 * @param {SupportTicket} ticket
 * @returns {"Optimus Prime" | "Submission Wizard" | "Application Escalation" | "Live Chat" | "Help & Support"}
 */
export function getEscalationChannel(ticket) {
  if (!ticket) return "Help & Support";
  if (isOptimusEscalation(ticket)) return "Optimus Prime";
  const steps = String(ticket.steps || "").toLowerCase();
  const src = String(ticket.escalationSource || "").toLowerCase();
  const title = String(ticket.title || "").toLowerCase();
  if (
    ticket.wizardStep ||
    steps.includes("wizard") ||
    steps.includes("submission step") ||
    src.includes("submission") ||
    title.includes("submission step")
  ) {
    return "Submission Wizard";
  }
  if (
    steps.includes("application") ||
    steps.includes("clarification") ||
    steps.includes("messages") ||
    src.includes("application") ||
    src.includes("escalation") ||
    title.includes("escalat")
  ) {
    return "Application Escalation";
  }
  if (steps.includes("live chat") || src.includes("live chat") || title.includes("live chat")) {
    return "Live Chat";
  }
  return "Help & Support";
}

/**
 * Returns the human-readable source label for a support ticket.
 * @param {SupportTicket} ticket
 * @returns {"Optimus Prime" | "Help & Support"}
 */
export function getTicketSource(ticket) {
  return isOptimusEscalation(ticket) ? "Optimus Prime" : "Help & Support";
}

/**
 * Returns all active (unresolved) live chat sessions currently connected to a specific call centre agent.
 * Enables multi-user live chat where one agent attends to multiple concurrent chats.
 * @param {readonly SupportTicket[]} tickets
 * @param {string} officerName
 * @returns {SupportTicket[]}
 */
export function getAgentActiveChats(tickets, officerName) {
  const list = Array.isArray(tickets) ? tickets : [];
  const norm = String(officerName || "").trim().toLowerCase();
  if (!norm) return [];
  return list.filter(
    t =>
      t &&
      t.state !== "Resolved" &&
      String(t.owner || "").trim().toLowerCase() === norm
  );
}

/**
 * Returns true if an officer has sent at least one reply message in the thread.
 * @param {SupportTicket} ticket
 * @returns {boolean}
 */
export function hasOfficerReply(ticket) {
  const thread = Array.isArray(ticket?.thread) ? ticket.thread : [];
  return thread.some(entry => ["support", "admin"].includes(String(entry?.role || "")));
}

/**
 * Returns the timestamp in epoch ms from which the current waiting period began.
 * @param {SupportTicket} ticket
 * @returns {number}
 */
export function getWaitingStartMs(ticket) {
  if (!ticket || ticket.state === "Resolved") return NaN;
  const thread = Array.isArray(ticket.thread) ? ticket.thread : [];
  if (thread.length > 0) {
    let lastStaffIdx = -1;
    for (let i = thread.length - 1; i >= 0; i--) {
      const role = String(thread[i]?.role || "");
      const body = String(thread[i]?.body || "").toLowerCase();
      if (role === "support" || role === "admin" || (role === "system" && body.includes("waiting"))) {
        lastStaffIdx = i;
        break;
      }
    }
    for (let i = Math.max(0, lastStaffIdx + 1); i < thread.length; i++) {
      if (String(thread[i]?.role || "") === "innovator") {
        const ms = parseBotswanaTimestamp(thread[i]?.at);
        if (Number.isFinite(ms)) return ms;
      }
    }
    if (lastStaffIdx >= 0 && ticket.state === "Waiting") {
      const staffMs = parseBotswanaTimestamp(thread[lastStaffIdx]?.at);
      if (Number.isFinite(staffMs)) return staffMs;
    }
  }
  return parseBotswanaTimestamp(ticket.reported);
}

/**
 * Formats a minute count cleanly into compact human duration text.
 * @param {number} minutes
 * @returns {string}
 */
export function formatDurationMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return "N/A";
  const rounded = Math.round(minutes);
  if (rounded < 1) return "< 1m";
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const remMin = rounded % 60;
  if (hours < 24) return remMin ? `${hours}h ${remMin}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d ${remHours}h` : `${days}d`;
}

/**
 * Formats waiting time on an open request cleanly for queue rows.
 * @param {SupportTicket} ticket
 * @param {number} [nowMs]
 * @returns {string}
 */
export function formatWaitingTime(ticket, nowMs = Date.now()) {
  if (!ticket) return "";
  if (ticket.state === "Resolved") return "Resolved";
  const startMs = getWaitingStartMs(ticket);
  const reportedMs = parseBotswanaTimestamp(ticket.reported);
  const refMs = Number.isFinite(startMs) ? startMs : reportedMs;
  if (!Number.isFinite(refMs)) return "Open";
  const label = formatDurationMinutes(Math.max(0, (nowMs - refMs) / 60_000));
  if (isTicketOverdue(ticket, nowMs)) return `${label} overdue`;
  if (ticket.state === "Waiting") return `${label} on innovator`;
  return `${label} waiting`;
}

/**
 * Returns the formatted Botswana timestamp of the latest thread or ticket activity.
 * @param {SupportTicket} ticket
 * @returns {string}
 */
export function getLatestActivityAt(ticket) {
  if (!ticket) return "";
  const thread = Array.isArray(ticket.thread) ? ticket.thread : [];
  let bestAt = String(ticket.updatedAt || ticket.reported || "").trim();
  let bestMs = parseBotswanaTimestamp(bestAt);
  for (const entry of thread) {
    const at = String(entry?.at || "").trim();
    const ms = parseBotswanaTimestamp(at);
    if (Number.isFinite(ms) && (!Number.isFinite(bestMs) || ms >= bestMs)) {
      bestMs = ms;
      bestAt = at;
    }
  }
  return bestAt || String(ticket.reported || "");
}

/**
 * Checks whether an unresolved request has exceeded the 24-hour response SLA.
 * @param {SupportTicket} ticket
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function isTicketOverdue(ticket, nowMs = Date.now()) {
  if (!ticket || ticket.state === "Resolved") return false;
  const reportedMs = parseBotswanaTimestamp(ticket.reported);
  if (!Number.isFinite(reportedMs)) return false;
  return nowMs - reportedMs > OVERDUE_HOURS * 3_600_000;
}

/**
 * Checks whether an unresolved request has not yet received any officer reply.
 * @param {SupportTicket} ticket
 * @returns {boolean}
 */
export function isUnansweredRequest(ticket) {
  return Boolean(ticket && ticket.state !== "Resolved" && !hasOfficerReply(ticket));
}

/**
 * Checks whether an unresolved Optimus Prime escalation still needs officer attention.
 * @param {SupportTicket} ticket
 * @param {ReadonlySet<string>} [openedIds]
 * @returns {boolean}
 */
export function isNewOptimusEscalation(ticket, openedIds) {
  if (!ticket || ticket.state === "Resolved" || !isOptimusEscalation(ticket)) return false;
  return ticket.state === "Open" || !hasOfficerReply(ticket) || Boolean(openedIds && !openedIds.has(ticket.id));
}

/**
 * Checks whether an innovator replied after a ticket was previously Waiting or answered by staff.
 * @param {SupportTicket} ticket
 * @returns {boolean}
 */
export function isInnovatorRepliedToWaiting(ticket) {
  if (!ticket || ticket.state === "Resolved") return false;
  const history = Array.isArray(ticket.history) ? ticket.history : [];
  if (history.some(h => /from waiting|after waiting/i.test(String(h?.action || "")))) {
    return true;
  }
  const thread = Array.isArray(ticket.thread) ? ticket.thread : [];
  if (thread.length < 2) return false;
  let sawWaitingOrOfficer = false;
  for (let i = 0; i < thread.length - 1; i++) {
    const role = String(thread[i]?.role || "");
    const body = String(thread[i]?.body || "").toLowerCase();
    if (role === "support" || role === "admin" || (role === "system" && body.includes("waiting"))) {
      sawWaitingOrOfficer = true;
    }
  }
  const latest = thread[thread.length - 1];
  return sawWaitingOrOfficer && String(latest?.role || "") === "innovator";
}

/**
 * Checks whether an unresolved request is within 6 hours of the 24-hour response deadline.
 * @param {SupportTicket} ticket
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function isApproachingDeadline(ticket, nowMs = Date.now()) {
  if (!ticket || ticket.state === "Resolved" || isTicketOverdue(ticket, nowMs)) return false;
  const startMs = getWaitingStartMs(ticket);
  const baseMs = Number.isFinite(startMs) ? startMs : parseBotswanaTimestamp(ticket.reported);
  if (!Number.isFinite(baseMs)) return false;
  const elapsedHours = (nowMs - baseMs) / 3_600_000;
  return elapsedHours >= APPROACHING_DEADLINE_HOURS && elapsedHours <= OVERDUE_HOURS;
}

/**
 * Checks whether an unresolved request has not yet been opened or acted on by an officer.
 * @param {SupportTicket} ticket
 * @param {ReadonlySet<string>} [openedIds]
 * @returns {boolean}
 */
export function isNewUnopenedRequest(ticket, openedIds) {
  if (!ticket || ticket.state !== "Open") return false;
  if (openedIds && openedIds.has(ticket.id)) return false;
  const owner = String(ticket.owner || "").trim();
  if (owner && owner.toLowerCase() !== "unassigned") return false;
  return !hasOfficerReply(ticket);
}

/**
 * Checks whether an unresolved request is high-priority or overdue.
 * @param {SupportTicket} ticket
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function isUrgentRequest(ticket, nowMs = Date.now()) {
  if (!ticket || ticket.state === "Resolved") return false;
  return String(ticket.priority || "").toLowerCase() === "high" || isTicketOverdue(ticket, nowMs);
}

/**
 * Checks whether a request was resolved during the current Botswana calendar day.
 * @param {SupportTicket} ticket
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function isResolvedToday(ticket, nowMs = Date.now()) {
  if (!ticket || ticket.state !== "Resolved") return false;
  const datePart = String(ticket.updatedAt || ticket.reported || "").trim().slice(0, 10);
  return datePart === botswanaDateKey(nowMs);
}

/**
 * Returns the immediate action reason tags for a support ticket.
 * @param {SupportTicket} ticket
 * @param {{ nowMs?: number, openedIds?: ReadonlySet<string> }} [options]
 * @returns {Array<{ key: string, label: string, tone: string }>}
 */
export function getImmediateActionSignals(ticket, options = {}) {
  if (!ticket || ticket.state === "Resolved") return [];
  const nowMs = typeof options.nowMs === "number" ? options.nowMs : Date.now();
  const openedIds = options.openedIds;
  /** @type {Array<{ key: string, label: string, tone: string }>} */
  const signals = [];
  if (isUrgentRequest(ticket, nowMs)) {
    signals.push({ key: "urgent", label: isTicketOverdue(ticket, nowMs) ? "Overdue" : "Urgent", tone: "rust" });
  }
  if (isUnansweredRequest(ticket)) {
    signals.push({ key: "unanswered", label: "Unanswered", tone: "amber" });
  }
  if (isNewOptimusEscalation(ticket, openedIds)) {
    signals.push({ key: "optimus", label: "New Optimus", tone: "teal" });
  }
  if (isInnovatorRepliedToWaiting(ticket)) {
    signals.push({ key: "replied", label: "Innovator replied", tone: "purple" });
  }
  if (isApproachingDeadline(ticket, nowMs)) {
    signals.push({ key: "deadline", label: "Near deadline", tone: "amber" });
  }
  return signals;
}

/**
 * Computes numeric action priority tier (higher = needs officer action sooner).
 * @param {SupportTicket} ticket
 * @param {{ nowMs?: number, openedIds?: ReadonlySet<string> }} [options]
 * @returns {number}
 */
export function getActionPriorityTier(ticket, options = {}) {
  if (!ticket || ticket.state === "Resolved") return -1;
  const nowMs = typeof options.nowMs === "number" ? options.nowMs : Date.now();
  const openedIds = options.openedIds;
  if (isUrgentRequest(ticket, nowMs)) return 5;
  if (isUnansweredRequest(ticket)) return 4;
  if (isNewOptimusEscalation(ticket, openedIds)) return 3;
  if (isInnovatorRepliedToWaiting(ticket)) return 2;
  if (isApproachingDeadline(ticket, nowMs)) return 1;
  return 0;
}

/**
 * Comparator ordering support requests for immediate action:
 * urgent first, oldest unanswered, new Optimus, waiting replies, approaching deadline.
 * @param {SupportTicket} a
 * @param {SupportTicket} b
 * @param {{ nowMs?: number, openedIds?: ReadonlySet<string> }} [options]
 * @returns {number}
 */
export function compareSupportQueueTickets(a, b, options = {}) {
  const nowMs = typeof options.nowMs === "number" ? options.nowMs : Date.now();
  const tierDiff = getActionPriorityTier(b, options) - getActionPriorityTier(a, options);
  if (tierDiff !== 0) return tierDiff;
  if (a.state === "Resolved" && b.state === "Resolved") {
    return String(b.updatedAt || b.reported || "").localeCompare(String(a.updatedAt || a.reported || ""));
  }
  const overdueDiff = Number(isTicketOverdue(b, nowMs)) - Number(isTicketOverdue(a, nowMs));
  if (overdueDiff !== 0) return overdueDiff;
  const waitA = getWaitingStartMs(a);
  const waitB = getWaitingStartMs(b);
  const fallbackA = parseBotswanaTimestamp(a.reported);
  const fallbackB = parseBotswanaTimestamp(b.reported);
  const startA = Number.isFinite(waitA) ? waitA : fallbackA;
  const startB = Number.isFinite(waitB) ? waitB : fallbackB;
  if (Number.isFinite(startA) && Number.isFinite(startB) && startA !== startB) {
    return startA - startB;
  }
  return String(a.id || "").localeCompare(String(b.id || ""));
}

/**
 * Filters and ranks support queue requests using normalized filter pills and facet controls.
 * @param {readonly SupportTicket[]} tickets
 * @param {{
 *   filterKey?: string,
 *   kindFilter?: string,
 *   sourceFilter?: string,
 *   priorityFilter?: string,
 *   query?: string,
 *   nowMs?: number,
 *   openedIds?: ReadonlySet<string>
 * }} [options]
 * @returns {SupportTicket[]}
 */
export function filterSupportTickets(tickets, options = {}) {
  const list = Array.isArray(tickets) ? tickets : [];
  const nowMs = typeof options.nowMs === "number" ? options.nowMs : Date.now();
  const openedIds = options.openedIds;
  const rawFilter = String(options.filterKey || "active").trim();
  const normalizedFilter =
    {
      "Immediate action": "active",
      "Open requests": "active",
      Urgent: "urgent",
      Unanswered: "unanswered",
      "Optimus Prime": "optimus",
      Replied: "replied",
      "Innovator replied": "replied",
      "Near deadline": "deadline",
      New: "new",
      All: "all",
    }[rawFilter] || rawFilter;
  const kindFilter = String(options.kindFilter || "all");
  const sourceFilter = String(options.sourceFilter || "all");
  const priorityFilter = String(options.priorityFilter || "all");
  const term = String(options.query || "").trim().toLowerCase();

  return list
    .filter(ticket => {
      let stateOk = true;
      if (normalizedFilter === "active") stateOk = ticket.state !== "Resolved";
      else if (normalizedFilter === "new") stateOk = isNewUnopenedRequest(ticket, openedIds);
      else if (normalizedFilter === "urgent") stateOk = isUrgentRequest(ticket, nowMs);
      else if (normalizedFilter === "unanswered") stateOk = isUnansweredRequest(ticket);
      else if (normalizedFilter === "optimus") stateOk = isOptimusEscalation(ticket) && ticket.state !== "Resolved";
      else if (normalizedFilter === "replied") stateOk = isInnovatorRepliedToWaiting(ticket);
      else if (normalizedFilter === "deadline") {
        stateOk = isApproachingDeadline(ticket, nowMs) || isTicketOverdue(ticket, nowMs);
      } else if (normalizedFilter !== "all") {
        stateOk = ticket.state === normalizedFilter;
      }

      const kindOk = !kindFilter || kindFilter.toLowerCase() === "all" || ticket.kind === kindFilter;
      const source = getTicketSource(ticket);
      const sourceOk =
        !sourceFilter ||
        sourceFilter.toLowerCase() === "all" ||
        sourceFilter === "All sources" ||
        source === sourceFilter;
      const priorityOk =
        !priorityFilter ||
        priorityFilter.toLowerCase() === "all" ||
        priorityFilter === "All priorities" ||
        String(ticket.priority || "").toLowerCase() === priorityFilter.toLowerCase();

      const haystack = [ticket.id, ticket.title, ticket.reporter, ticket.kind, source, ticket.application]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return stateOk && kindOk && sourceOk && priorityOk && (!term || haystack.includes(term));
    })
    .sort((a, b) => compareSupportQueueTickets(a, b, { nowMs, openedIds }));
}

/**
 * Extracts clean preview and Optimus Prime escalation details for conversation view headers.
 * @param {SupportTicket} ticket
 * @returns {{
 *   isOptimus: boolean,
 *   sectionLabel: string,
 *   previewSender: string,
 *   previewAt: string,
 *   previewBody: string,
 *   originalQuestion: string
 * }}
 */
export function getOptimusConversationSummary(ticket) {
  const isOptimus = isOptimusEscalation(ticket);
  const thread = Array.isArray(ticket?.thread) ? ticket.thread : [];
  const latest = thread.length
    ? thread[thread.length - 1]
    : { sender: ticket?.reporter || "Innovator", role: "innovator", body: ticket?.detail || "", at: ticket?.reported || "" };
  const detailText = String(ticket?.detail || "").trim();
  const qMatch = detailText.match(/Original question:\s*([\s\S]+)$/i);
  return {
    isOptimus,
    sectionLabel: isOptimus ? "Conversation with Optimus Prime" : "Latest message preview",
    previewSender: String(latest?.sender || ticket?.reporter || "Innovator"),
    previewAt: String(latest?.at || ticket?.updatedAt || ticket?.reported || ""),
    previewBody: String(latest?.body || detailText).trim(),
    originalQuestion: qMatch ? qMatch[1].trim() : "",
  };
}

/**
 * Extracts only the first name for innovator-facing connected officer attribution.
 * @param {string | null | undefined} name
 * @param {string} [fallback]
 * @returns {string}
 */
export function firstNameOnly(name, fallback = "") {
  const clean = String(name || "").trim();
  if (!clean) return fallback;
  const lower = clean.toLowerCase();
  if (lower === "unassigned" || lower === "ceda support desk") return clean;
  return clean.split(/\s+/)[0] || fallback;
}

/**
 * Returns true if the stored ticket title is the generic Optimus escalation boilerplate.
 * @param {string | null | undefined} title
 * @returns {boolean}
 */
export function isDefaultOptimusTitle(title) {
  return /^human support follow-up/i.test(String(title || "").trim());
}

/**
 * Formats the primary heading for a ticket row or chat room (person's name for escalations, never boilerplate).
 * @param {SupportTicket | null | undefined} ticket
 * @returns {string}
 */
export function ticketDisplayTitle(ticket) {
  if (!ticket) return "Support chat";
  if (isDefaultOptimusTitle(ticket.title)) {
    return String(ticket.reporter || "Innovator").trim() || "Innovator";
  }
  return String(ticket.title || ticket.reporter || "Support chat").trim();
}

/**
 * Formats compact HH:MM time from a Botswana timestamp string.
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function formatChatTime(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/\b(\d{2}:\d{2})$/);
  return match ? match[1] : raw;
}

/**
 * Builds the chronological chat room timeline showing prior AI turns, exact handoff divider, date markers, and live messages.
 * @param {SupportTicket} ticket
 * @returns {Array<
 *   | { kind: "divider", tone: "ai" | "handoff" | "date" | "system", label: string, at?: string }
 *   | { kind: "message", sender: string, senderFirstName: string, role: "innovator" | "ai" | "support" | "admin", body: string, at: string, sourceArticle?: string, escalated?: boolean }
 * >}
 */
export function buildConversationTimeline(ticket) {
  if (!ticket) return [];
  const reporter = String(ticket.reporter || "Innovator").trim() || "Innovator";
  const aiTurns = Array.isArray(ticket.aiConversation) ? ticket.aiConversation : [];
  const summary = getOptimusConversationSummary(ticket);
  const isOptimus = isOptimusEscalation(ticket);
  const timeline = [];
  let renderedAiContext = false;

  if (aiTurns.length > 0) {
    renderedAiContext = true;
    timeline.push({
      kind: "divider",
      tone: "ai",
      label: "Optimus Prime conversation",
      at: String(aiTurns[0]?.createdAt || ""),
    });
    let handoffInserted = false;
    for (const turn of aiTurns) {
      if (turn?.question) {
        timeline.push({
          kind: "message",
          sender: reporter,
          senderFirstName: firstNameOnly(reporter, "Innovator"),
          role: "innovator",
          body: String(turn.question),
          at: String(turn.createdAt || ""),
        });
      }
      if (turn?.answer) {
        timeline.push({
          kind: "message",
          sender: "Optimus Prime",
          senderFirstName: "Optimus",
          role: "ai",
          body: String(turn.answer),
          sourceArticle: String(turn.sourceArticle || ""),
          escalated: Boolean(turn.escalated),
          at: String(turn.createdAt || ""),
        });
      }
      if (turn?.escalated && !handoffInserted) {
        handoffInserted = true;
        timeline.push({
          kind: "divider",
          tone: "handoff",
          label: "Handed off from Optimus Prime to CEDA Support",
          at: String(ticket.reported || turn.createdAt || ""),
        });
      }
    }
    if (!handoffInserted && isOptimus) {
      timeline.push({
        kind: "divider",
        tone: "handoff",
        label: "Handed off from Optimus Prime to CEDA Support",
        at: String(ticket.reported || ""),
      });
    }
  } else if (isOptimus) {
    if (summary.originalQuestion) {
      renderedAiContext = true;
      timeline.push({
        kind: "divider",
        tone: "ai",
        label: "Optimus Prime conversation",
        at: String(ticket.reported || ""),
      });
      timeline.push({
        kind: "message",
        sender: reporter,
        senderFirstName: firstNameOnly(reporter, "Innovator"),
        role: "innovator",
        body: summary.originalQuestion,
        at: String(ticket.reported || ""),
      });
    }
    timeline.push({
      kind: "divider",
      tone: "handoff",
      label: "Handed off from Optimus Prime to CEDA Support",
      at: String(ticket.reported || ""),
    });
  }

  const rawThread =
    Array.isArray(ticket.thread) && ticket.thread.length > 0
      ? ticket.thread
      : [{ sender: reporter, role: "innovator", body: String(ticket.detail || ""), at: String(ticket.reported || "") }];

  let currentDay = "";
  rawThread.forEach((msg, index) => {
    const role = String(msg?.role || "innovator");
    const at = String(msg?.at || "");
    if (role === "system") {
      timeline.push({
        kind: "divider",
        tone: "system",
        label: String(msg?.body || "").trim(),
        at,
      });
      return;
    }

    const day = at.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day !== currentDay) {
      currentDay = day;
      timeline.push({ kind: "divider", tone: "date", label: day });
    }

    let body = String(msg?.body || "").trim();
    if (index === 0 && role === "innovator" && renderedAiContext) {
      body = body.replace(/\s*\n+Original question:\s*[\s\S]*$/i, "").trim() || body;
    }
    const sender = String(msg?.sender || (role === "innovator" ? reporter : "Support Officer"));
    timeline.push({
      kind: "message",
      sender,
      senderFirstName: firstNameOnly(sender, role === "innovator" ? "Innovator" : "Support"),
      role: role === "support" || role === "admin" ? role : "innovator",
      body,
      at,
    });
  });

  return timeline;
}

/**
 * Returns workflow completion percentage for a ticket's state.
 * @param {string} state
 * @returns {number}
 */
export function ticketProgressPercent(state) {
  return SUPPORT_STATE_META[state]?.progressPct ?? 25;
}

/**
 * Returns a concise snippet of the latest conversation message on a ticket.
 * @param {SupportTicket} ticket
 * @returns {string}
 */
export function ticketLastPreview(ticket) {
  const thread = Array.isArray(ticket?.thread) ? ticket.thread : [];
  if (thread.length > 0) {
    const latest = thread[thread.length - 1];
    return String(latest?.body || ticket?.detail || "").trim();
  }
  return String(ticket?.detail || "").trim();
}

/**
 * Computes concise Support Officer overview metrics and needs-action triage queue.
 * @param {readonly SupportTicket[]} tickets
 * @param {{ nowMs?: number, openedIds?: ReadonlySet<string> }} [options]
 */
export function buildSupportOverview(tickets, options = {}) {
  const nowMs = typeof options.nowMs === "number" ? options.nowMs : Date.now();
  const openedIds = options.openedIds;
  const list = Array.isArray(tickets) ? tickets : [];
  const total = list.length;

  const openList = list.filter(item => item.state !== "Resolved");
  const openRequests = openList.length;
  const newRequestsList = openList.filter(item => isNewUnopenedRequest(item, openedIds));
  const newRequests = newRequestsList.length;
  const urgentList = openList.filter(item => isUrgentRequest(item, nowMs));
  const urgentRequests = urgentList.length;
  const overdueRequests = openList.filter(item => isTicketOverdue(item, nowMs)).length;
  const resolvedToday = list.filter(item => isResolvedToday(item, nowMs)).length;

  const open = list.filter(item => item.state === "Open").length;
  const investigating = list.filter(item => item.state === "Investigating").length;
  const waiting = list.filter(item => item.state === "Waiting").length;
  const resolved = list.filter(item => item.state === "Resolved").length;
  const active = openRequests;
  const resolutionRatePct = total ? Math.round((resolved / total) * 100) : 0;

  const highPriorityActive = openList.filter(
    item => String(item.priority || "").toLowerCase() === "high"
  ).length;
  const optimusEscalations = openList.filter(item => isOptimusEscalation(item)).length;

  const activeTotal = Math.max(1, openRequests);
  const openPct = count => (openRequests ? Math.round((count / activeTotal) * 100) : 0);

  /** @type {SupportSegment[]} */
  const statusBreakdown = [
    { key: "Open", label: "Open & new", count: open, pct: openPct(open), color: supportOverviewColors.blue },
    { key: "Investigating", label: "Investigating", count: investigating, pct: openPct(investigating), color: supportOverviewColors.amber },
    { key: "Waiting", label: "Waiting on applicant", count: waiting, pct: openPct(waiting), color: supportOverviewColors.purple },
  ];

  const supportCount = list.filter(item => item.kind === "Support").length;
  const bugCount = list.filter(item => item.kind === "Bug").length;
  const feedbackCount = list.filter(item => item.kind === "Feedback").length;
  const totalPct = count => (total ? Math.round((count / total) * 100) : 0);

  /** @type {SupportSegment[]} */
  const kindBreakdown = [
    { key: "Support", label: "General & Optimus support", count: supportCount, pct: totalPct(supportCount), color: supportOverviewColors.teal },
    { key: "Bug", label: "Technical bug reports", count: bugCount, pct: totalPct(bugCount), color: supportOverviewColors.rust },
    { key: "Feedback", label: "Applicant feedback", count: feedbackCount, pct: totalPct(feedbackCount), color: supportOverviewColors.amber },
  ];

  const urgentQueue = [...openList]
    .sort((a, b) => compareSupportQueueTickets(a, b, { nowMs, openedIds }))
    .slice(0, 6);

  const stageBars = [
    Math.max(4, openRequests * 5 + 4),
    Math.max(4, newRequests * 6 + 4),
    Math.max(4, urgentRequests * 7 + 4),
    Math.max(4, investigating * 5 + 4),
    Math.max(4, resolvedToday * 6 + 4),
  ];

  return {
    total,
    active,
    openRequests,
    newRequests,
    urgentRequests,
    overdueRequests,
    resolvedToday,
    open,
    investigating,
    waiting,
    resolved,
    resolutionRatePct,
    highPriorityActive,
    optimusEscalations,
    statusBreakdown,
    kindBreakdown,
    urgentQueue,
    stageBars,
  };
}

/**
 * Computes personal workload and turnaround metrics exclusively for the signed-in officer.
 * @param {readonly SupportTicket[]} tickets
 * @param {string} officerName
 * @param {{ nowMs?: number }} [options]
 */
export function buildOfficerPerformance(tickets, officerName, options = {}) {
  const nowMs = typeof options.nowMs === "number" ? options.nowMs : Date.now();
  const normalizedOfficer = String(officerName || "").trim().toLowerCase();
  const todayKey = botswanaDateKey(nowMs);
  const list = Array.isArray(tickets) ? tickets : [];

  const matchesOfficer = candidate => {
    const clean = String(candidate || "").trim().toLowerCase();
    return Boolean(normalizedOfficer && clean && clean === normalizedOfficer);
  };

  const personalTickets = normalizedOfficer
    ? list.filter(ticket => {
        if (matchesOfficer(ticket.owner)) return true;
        const thread = Array.isArray(ticket.thread) ? ticket.thread : [];
        if (thread.some(m => ["support", "admin", "system"].includes(String(m?.role || "")) && matchesOfficer(m?.sender))) {
          return true;
        }
        const history = Array.isArray(ticket.history) ? ticket.history : [];
        return history.some(h => matchesOfficer(h?.actor));
      })
    : [];

  let handledToday = 0;
  let resolvedToday = 0;
  let reopenedRequests = 0;
  const firstResponseMinutes = [];
  const resolutionMinutes = [];
  const satisfactionScores = [];

  for (const ticket of personalTickets) {
    const thread = Array.isArray(ticket.thread) ? ticket.thread : [];
    const history = Array.isArray(ticket.history) ? ticket.history : [];
    const reportedMs = parseBotswanaTimestamp(ticket.reported);
    const updatedKey = String(ticket.updatedAt || ticket.reported || "").trim().slice(0, 10);

    const officerTouchedToday =
      thread.some(
        m =>
          ["support", "admin", "system"].includes(String(m?.role || "")) &&
          matchesOfficer(m?.sender) &&
          String(m?.at || "").trim().slice(0, 10) === todayKey
      ) ||
      history.some(h => matchesOfficer(h?.actor) && String(h?.at || "").trim().slice(0, 10) === todayKey) ||
      (matchesOfficer(ticket.owner) && updatedKey === todayKey);

    if (officerTouchedToday) handledToday++;
    if (ticket.state === "Resolved" && matchesOfficer(ticket.owner) && isResolvedToday(ticket, nowMs)) {
      resolvedToday++;
    }

    if (Number.isFinite(reportedMs)) {
      const staffCandidates = [];
      for (const m of thread) {
        if (["support", "admin"].includes(String(m?.role || "")) && (matchesOfficer(m?.sender) || matchesOfficer(ticket.owner))) {
          const ms = parseBotswanaTimestamp(m?.at);
          if (Number.isFinite(ms) && ms >= reportedMs) staffCandidates.push(ms);
        }
      }
      for (const h of history) {
        if (matchesOfficer(h?.actor)) {
          const ms = parseBotswanaTimestamp(h?.at);
          if (Number.isFinite(ms) && ms >= reportedMs) staffCandidates.push(ms);
        }
      }
      if (staffCandidates.length > 0) {
        const earliestMs = Math.min(...staffCandidates);
        firstResponseMinutes.push((earliestMs - reportedMs) / 60_000);
      }
    }

    if (ticket.state === "Resolved" && Number.isFinite(reportedMs)) {
      const resolvedHist = history
        .filter(h => /to resolved/i.test(String(h?.action || "")))
        .map(h => parseBotswanaTimestamp(h?.at))
        .filter(Number.isFinite);
      const resolvedMs = resolvedHist.length
        ? Math.max(...resolvedHist)
        : parseBotswanaTimestamp(ticket.updatedAt);
      if (Number.isFinite(resolvedMs) && resolvedMs >= reportedMs) {
        resolutionMinutes.push((resolvedMs - reportedMs) / 60_000);
      }
    }

    let wasReopened = Number(ticket.reopenedCount || 0) > 0;
    if (!wasReopened && history.some(h => /from resolved to |reopened/i.test(String(h?.action || "")))) {
      wasReopened = true;
    }
    if (!wasReopened && thread.length > 1) {
      let resolvedIdx = -1;
      for (let i = 0; i < thread.length - 1; i++) {
        if (/updated to resolved|marked resolved/i.test(String(thread[i]?.body || ""))) {
          resolvedIdx = i;
          break;
        }
      }
      if (resolvedIdx >= 0 && thread.length - 1 > resolvedIdx) wasReopened = true;
    }
    if (wasReopened) reopenedRequests++;

    const score = Number(ticket.satisfactionRating);
    if (Number.isFinite(score) && score >= 1 && score <= 5) {
      satisfactionScores.push(score);
    }
  }

  const avgOf = arr => (arr.length ? arr.reduce((sum, v) => sum + v, 0) / arr.length : NaN);
  const avgFirstResponseMinutes = avgOf(firstResponseMinutes);
  const avgResolutionMinutes = avgOf(resolutionMinutes);
  const satisfactionCount = satisfactionScores.length;
  const satisfactionRatingAvg = satisfactionCount
    ? Number((satisfactionScores.reduce((sum, s) => sum + s, 0) / satisfactionCount).toFixed(1))
    : null;

  return {
    officerName: String(officerName || "").trim(),
    personalCount: personalTickets.length,
    handledToday,
    resolvedToday,
    avgFirstResponseMinutes: Number.isFinite(avgFirstResponseMinutes) ? Math.round(avgFirstResponseMinutes) : null,
    avgFirstResponseLabel: formatDurationMinutes(avgFirstResponseMinutes),
    firstResponseCount: firstResponseMinutes.length,
    avgResolutionMinutes: Number.isFinite(avgResolutionMinutes) ? Math.round(avgResolutionMinutes) : null,
    avgResolutionLabel: formatDurationMinutes(avgResolutionMinutes),
    resolutionCount: resolutionMinutes.length,
    reopenedRequests,
    satisfactionRatingAvg,
    satisfactionCount,
    satisfactionLabel: satisfactionRatingAvg !== null ? `${satisfactionRatingAvg.toFixed(1)} / 5` : "Pending feedback",
  };
}

/**
 * Builds the comprehensive Online Chat Analytics & Escalation Report required by Portal Requirement 4(iv).
 * Covers multi-agent load, working hours (09:00-16:00 Mon-Fri) vs after-hours queuing, channel/escalation mix,
 * response & resolution turnaround times, SLA compliance, and client satisfaction (CSAT).
 * @param {readonly SupportTicket[]} tickets
 * @param {{
 *   nowMs?: number,
 *   officerAvailability?: string,
 *   agents?: ReadonlyArray<{ id?: string, name?: string, availability?: string, activeChats?: number, maxConcurrent?: number }>,
 *   maxConcurrentPerAgent?: number
 * }} [options]
 */
export function buildLiveChatAnalyticsReport(tickets, options = {}) {
  const nowMs = typeof options.nowMs === "number" ? options.nowMs : Date.now();
  const list = Array.isArray(tickets) ? tickets : [];
  const totalChats = list.length;
  const maxConcurrent = Number(options.maxConcurrentPerAgent) > 0
    ? Number(options.maxConcurrentPerAgent)
    : LIVE_CHAT_HOURS.defaultMaxConcurrentChats;

  const availability = evaluateLiveChatAvailability({
    nowMs,
    tickets: list,
    agents: options.agents,
    officerAvailability: options.officerAvailability,
    maxConcurrentPerAgent: maxConcurrent,
  });

  const queuedCount = list.filter(t => t.state === "Open").length;
  const connectedActiveCount = list.filter(t => t.state === "Investigating").length;
  const waitingOnClientCount = list.filter(t => t.state === "Waiting").length;
  const resolvedCount = list.filter(t => t.state === "Resolved").length;
  const activeCount = totalChats - resolvedCount;
  const resolvedTodayCount = list.filter(t => isResolvedToday(t, nowMs)).length;
  const resolutionRatePct = totalChats ? Math.round((resolvedCount / totalChats) * 100) : 0;

  let workingHoursCount = 0;
  let afterHoursOrNonWorkingCount = 0;
  let optimusEscalations = 0;
  let submissionWizardChats = 0;
  let applicationEscalations = 0;
  let generalEnquiryChats = 0;
  let totalMessagesExchanged = 0;
  let reopenedTotal = 0;
  let withinSlaCount = 0;

  const firstResponseMinutes = [];
  const resolutionMinutes = [];
  const satisfactionScores = [];
  const agentNamesSet = new Set();

  if (Array.isArray(options.agents)) {
    for (const a of options.agents) {
      if (a?.name && String(a.name).toLowerCase() !== "unassigned") {
        agentNamesSet.add(String(a.name).trim());
      }
    }
  }

  for (const ticket of list) {
    const channel = getEscalationChannel(ticket);
    if (channel === "Optimus Prime") optimusEscalations++;
    else if (channel === "Submission Wizard") submissionWizardChats++;
    else if (channel === "Application Escalation") applicationEscalations++;
    else generalEnquiryChats++;

    const thread = Array.isArray(ticket.thread) ? ticket.thread : [];
    totalMessagesExchanged += Math.max(1, thread.filter(m => m?.role !== "system").length);

    if (ticket.owner && !["unassigned", "ceda support desk"].includes(String(ticket.owner).trim().toLowerCase())) {
      agentNamesSet.add(String(ticket.owner).trim());
    }
    for (const m of thread) {
      if (
        ["support", "admin"].includes(String(m?.role || "")) &&
        m?.sender &&
        !["unassigned", "ceda support desk", "optimus prime"].includes(String(m.sender).trim().toLowerCase())
      ) {
        agentNamesSet.add(String(m.sender).trim());
      }
    }

    const reportedMs = parseBotswanaTimestamp(ticket.reported);
    if (ticket.queuedOutsideHours === true) {
      afterHoursOrNonWorkingCount++;
    } else if (Number.isFinite(reportedMs)) {
      const check = evaluateLiveChatAvailability({ nowMs: reportedMs });
      if (check.isWorkingDay && check.isWithinHours) workingHoursCount++;
      else afterHoursOrNonWorkingCount++;
    } else {
      workingHoursCount++;
    }

    if (Number.isFinite(reportedMs)) {
      const staffTimes = thread
        .filter(m => ["support", "admin"].includes(String(m?.role || "")))
        .map(m => parseBotswanaTimestamp(m?.at))
        .filter(ms => Number.isFinite(ms) && ms >= reportedMs);
      if (staffTimes.length > 0) {
        const firstMin = (Math.min(...staffTimes) - reportedMs) / 60_000;
        firstResponseMinutes.push(firstMin);
        if (firstMin <= OVERDUE_HOURS * 60) withinSlaCount++;
      } else if (!isTicketOverdue(ticket, nowMs)) {
        withinSlaCount++;
      }

      if (ticket.state === "Resolved") {
        const resMs = parseBotswanaTimestamp(ticket.updatedAt || ticket.reported);
        if (Number.isFinite(resMs) && resMs >= reportedMs) {
          resolutionMinutes.push((resMs - reportedMs) / 60_000);
        }
      }
    }

    if (Number(ticket.reopenedCount || 0) > 0) reopenedTotal++;
    const rating = Number(ticket.satisfactionRating);
    if (Number.isFinite(rating) && rating >= 1 && rating <= 5) {
      satisfactionScores.push(rating);
    }
  }

  const avgOf = arr => (arr.length ? arr.reduce((sum, v) => sum + v, 0) / arr.length : NaN);
  const avgFirstResp = avgOf(firstResponseMinutes);
  const avgRes = avgOf(resolutionMinutes);
  const csatAvg = satisfactionScores.length
    ? Number((satisfactionScores.reduce((s, v) => s + v, 0) / satisfactionScores.length).toFixed(1))
    : null;
  const slaCompliancePct = totalChats ? Math.round((withinSlaCount / totalChats) * 100) : 100;

  const agentRows = [...agentNamesSet].map(agentName => {
    const perf = buildOfficerPerformance(list, agentName, { nowMs });
    const activeChats = getAgentActiveChats(list, agentName).length;
    const utilizationPct = Math.min(100, Math.round((activeChats / Math.max(1, maxConcurrent)) * 100));
    return {
      name: agentName,
      firstName: firstNameOnly(agentName, "Agent"),
      activeChats,
      maxConcurrent,
      utilizationPct,
      handledCount: perf.personalCount,
      handledToday: perf.handledToday,
      resolvedToday: perf.resolvedToday,
      avgFirstResponseMinutes: perf.avgFirstResponseMinutes,
      avgFirstResponseLabel: perf.avgFirstResponseLabel,
      avgResolutionMinutes: perf.avgResolutionMinutes,
      avgResolutionLabel: perf.avgResolutionLabel,
      satisfactionLabel: perf.satisfactionLabel,
    };
  });

  const pct = count => (totalChats ? Math.round((count / totalChats) * 100) : 0);

  return {
    generatedAtCat: `${availability.dateKey} ${availability.currentTimeCat} CAT`,
    availability,
    totalChats,
    activeCount,
    queuedCount,
    connectedActiveCount,
    waitingOnClientCount,
    resolvedCount,
    resolvedTodayCount,
    resolutionRatePct,
    totalMessagesExchanged,
    workingHoursCount,
    workingHoursPct: pct(workingHoursCount),
    afterHoursOrNonWorkingCount,
    afterHoursOrNonWorkingPct: pct(afterHoursOrNonWorkingCount),
    avgFirstResponseMinutes: Number.isFinite(avgFirstResp) ? Math.round(avgFirstResp) : null,
    avgFirstResponseLabel: formatDurationMinutes(avgFirstResp),
    firstResponseSampleCount: firstResponseMinutes.length,
    avgResolutionMinutes: Number.isFinite(avgRes) ? Math.round(avgRes) : null,
    avgResolutionLabel: formatDurationMinutes(avgRes),
    resolutionSampleCount: resolutionMinutes.length,
    slaCompliancePct,
    reopenedTotal,
    satisfactionAvg: csatAvg,
    satisfactionCount: satisfactionScores.length,
    satisfactionLabel: csatAvg !== null ? `${csatAvg.toFixed(1)} / 5` : "Pending feedback",
    channelBreakdown: [
      { key: "Optimus Prime", label: "Optimus Prime AI Escalations", count: optimusEscalations, pct: pct(optimusEscalations), color: supportOverviewColors.teal },
      { key: "Submission Wizard", label: "Submission Process Live Chat", count: submissionWizardChats, pct: pct(submissionWizardChats), color: supportOverviewColors.blue },
      { key: "Application Escalation", label: "Application & Clarification Escalations", count: applicationEscalations, pct: pct(applicationEscalations), color: supportOverviewColors.purple },
      { key: "Help & Support", label: "General Enquiry & Technical Support", count: generalEnquiryChats, pct: pct(generalEnquiryChats), color: supportOverviewColors.amber },
    ],
    agentRows,
  };
}

/**
 * Generates an RFC-4180 compliant CSV string for the Online Chat Analytics Report.
 * @param {ReturnType<typeof buildLiveChatAnalyticsReport>} report
 * @returns {string}
 */
export function buildLiveChatAnalyticsCsv(report) {
  const esc = val => {
    const str = String(val ?? "");
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const rows = [
    ["CEDA Innovation Portal - Online Live Chat & Escalation Analytics Report"],
    ["Generated At", report?.generatedAtCat || ""],
    ["Operating Window", LIVE_CHAT_HOURS.scheduleLabel],
    ["Current Live Chat Status", report?.availability?.badgeLabel || ""],
    [],
    ["Metric", "Value", "Detail"],
    ["Total Live Chats & Escalations", report?.totalChats ?? 0, "All recorded chat threads"],
    ["Active Chats (Unresolved)", report?.activeCount ?? 0, `${report?.queuedCount ?? 0} queued, ${report?.connectedActiveCount ?? 0} connected, ${report?.waitingOnClientCount ?? 0} waiting`],
    ["Resolved Chats", report?.resolvedCount ?? 0, `${report?.resolutionRatePct ?? 0}% resolution rate (${report?.resolvedTodayCount ?? 0} today)`],
    ["Total Messages Exchanged", report?.totalMessagesExchanged ?? 0, "Client and consultant turns"],
    ["Working Hours Volume (09:00-16:00 Mon-Fri)", report?.workingHoursCount ?? 0, `${report?.workingHoursPct ?? 0}% of total`],
    ["After-Hours / Non-Working Day Queued", report?.afterHoursOrNonWorkingCount ?? 0, `${report?.afterHoursOrNonWorkingPct ?? 0}% of total`],
    ["Average First Response Time", report?.avgFirstResponseLabel || "N/A", `${report?.firstResponseSampleCount ?? 0} measured chats`],
    ["Average Resolution Time", report?.avgResolutionLabel || "N/A", `${report?.resolutionSampleCount ?? 0} resolved chats`],
    ["SLA Compliance Rate (<= 24h)", `${report?.slaCompliancePct ?? 100}%`, "Response SLA adherence"],
    ["Reopened Conversations", report?.reopenedTotal ?? 0, "Reopened after resolution"],
    ["Client Satisfaction (CSAT)", report?.satisfactionLabel || "Pending feedback", `${report?.satisfactionCount ?? 0} ratings`],
    [],
    ["Channel / Escalation Source", "Chats", "Share (%)"],
    ...(report?.channelBreakdown || []).map(c => [c.label, c.count, `${c.pct}%`]),
    [],
    ["Consultant / Agent", "Active Concurrent Chats", "Max Capacity", "Utilization (%)", "Total Handled", "Resolved Today", "Avg First Response", "Avg Resolution", "CSAT"],
    ...(report?.agentRows || []).map(a => [
      a.name,
      a.activeChats,
      a.maxConcurrent,
      `${a.utilizationPct}%`,
      a.handledCount,
      a.resolvedToday,
      a.avgFirstResponseLabel,
      a.avgResolutionLabel,
      a.satisfactionLabel,
    ]),
  ];
  return rows.map(r => r.map(esc).join(",")).join("\r\n");
}
