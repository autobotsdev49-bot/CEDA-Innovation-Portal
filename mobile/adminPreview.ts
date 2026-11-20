// Same reproducible, fictional reporting window as the web portal. No live telemetry.
export type ReportingPeriod = 1 | 7 | 30;
export const previewDays = Array.from({ length: 30 }, (_, index) => ({
  date: new Date(Date.UTC(2026, 10, index - 9)).toISOString().slice(0, 10),
  views: 120 + (index * 37 % 190),
}));
export const previewApplications = [
  { id: "DEMO001", title: "Community craft marketplace", owner: "Sample enterprise A", sector: "Creative Industries", status: "In review", date: "2026-11-18", assessor: "Sample assessor A", summary: "A proposed digital marketplace connecting local craft makers with buyers." },
  { id: "DEMO002", title: "Waterwise crop monitoring", owner: "Sample innovator B", sector: "Agriculture", status: "In review", date: "2026-11-18", assessor: "Sample assessor B", summary: "A sensor concept helping growers monitor crop irrigation requirements." },
  { id: "DEMO003", title: "Neighbourhood recycling network", owner: "Sample enterprise C", sector: "Environment", status: "Submitted", date: "2026-11-19", assessor: "Unassigned", summary: "A proposed collection network for recyclable household materials." },
  { id: "DEMO004", title: "Accessible learning toolkit", owner: "Sample innovator D", sector: "Education", status: "Approved", date: "2026-11-15", assessor: "Sample assessor C", summary: "An accessible teaching toolkit concept supporting different learning needs." },
  { id: "DEMO005", title: "Creative studio booking", owner: "Sample enterprise E", sector: "Creative Industries", status: "Rejected", date: "2026-11-14", assessor: "Sample assessor A", summary: "A booking service concept for shared creative workspaces." },
  { id: "DEMO006", title: "Solar cold storage", owner: "Sample innovator F", sector: "Agriculture", status: "In review", date: "2026-11-19", assessor: "Sample assessor C", summary: "A solar-powered cold storage concept for small agricultural producers." },
];
export const previewEvents = [
  { date: "2026-11-20", time: "14:20", actor: "Sample officer A", role: "Support Officer", record: "TKT001", title: "Support request resolved", detail: "Explained email verification steps and closed the fictional enquiry." },
  { date: "2026-11-19", time: "11:10", actor: "Sample innovator B", role: "Innovator", record: "DEMO003", title: "Application submitted", detail: "Submitted Neighbourhood recycling network for review." },
  { date: "2026-11-19", time: "09:45", actor: "Sample admin C", role: "Administrator", record: "SECTOR001", title: "Sector published", detail: "Published a fictional sector after content review." },
  { date: "2026-11-18", time: "16:05", actor: "Notification service", role: "System", record: "DEL001", title: "Email delivery failed", detail: "A fictional notification could not be delivered. No recipient address is included." },
];
export const previewMatters = [
  { id: "BUG001", title: "Attachment picker does not open", kind: "Bug", reporter: "Sample innovator D", priority: "High", state: "Investigating", owner: "Sample admin C", detail: "Selecting the attachment control on a small screen does not open the file picker." },
  { id: "TKT002", title: "Unable to access verification email", kind: "Support", reporter: "Sample officer A", priority: "Normal", state: "Open", owner: "Unassigned", detail: "Support escalation requiring investigation of email delivery configuration." },
  { id: "DEL001", title: "Application notification delivery failed", kind: "Delivery", reporter: "Notification service", priority: "Normal", state: "Open", owner: "Sample admin C", detail: "Inspect delivery logs before any retry. No live retry is available." },
  { id: "BUG002", title: "Help link on mobile overlaps text", kind: "Bug", reporter: "Sample innovator E", priority: "Normal", state: "Resolved", owner: "Sample admin C", detail: "A fictional layout issue recorded as resolved for interface review." },
];
export function reportingSnapshot(period: ReportingPeriod) {
  const days = previewDays.slice(-period);
  const applications = previewApplications.filter(item => item.date >= days[0].date);
  return { days, applications, views: days.reduce((sum, day) => sum + day.views, 0), active: 24, followups: previewMatters.filter(item => item.state !== "Resolved").length };
}
