import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FrostedSurface } from "./FrostedGlass";
import { fontSizes } from "./theme";
import type { ReportingPeriod } from "./adminPreview";
import type { AdminApplication, AdminAuditEntry, AdminMatter, AdminOptimusOverview, AdminReportingSummary } from "./auth";
import {
  buildReportingSummaryFromRecords,
  emptyReportingSummary,
  formatTelemetryMetric,
  reportingPeriodLabel,
} from "./reportingOverview.js";

const ink = "#192C40", muted = "#7C8590", blue = "#417AC5", rust = "#9A3D2B", teal = "#278477";
export type InsightScreen = "Portal analytics" | "Website health" | "Follow-ups" | "Activity log";
type Destination = InsightScreen | "Innovations" | "Optimus Prime";
export type MobileIconName =
  | "menu" | "back" | "close" | "bell" | "search" | "traffic" | "people" | "application" | "alert"
  | "sector" | "support" | "ai" | "feedback" | "audit" | "shield" | "pulse" | "clock" | "check" | "globe";

export function MobileIcon({ name, color = ink }: { name: MobileIconName; color?: string }) {
  const border = { borderColor: color, borderWidth: 1.6 };
  return <View accessible={false} style={styles.icon}>
    {name === "menu" && <View style={{ gap: 5 }}>{[18, 13, 18].map((width, i) => <View key={i} style={{ width, height: 1.8, backgroundColor: color, borderRadius: 2 }} />)}</View>}
    {name === "back" && <View style={{ width: 18, height: 18, justifyContent: "center", alignItems: "center" }}><View style={{ width: 9, height: 9, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: color, transform: [{ rotate: "45deg" }], marginLeft: 3 }} /><View style={{ position: "absolute", width: 12, height: 1.8, backgroundColor: color, borderRadius: 1, left: 4 }} /></View>}
    {name === "close" && <View style={{ width: 16, height: 16, justifyContent: "center", alignItems: "center" }}><View style={{ position: "absolute", width: 14, height: 1.8, backgroundColor: color, borderRadius: 1, transform: [{ rotate: "45deg" }] }} /><View style={{ position: "absolute", width: 14, height: 1.8, backgroundColor: color, borderRadius: 1, transform: [{ rotate: "-45deg" }] }} /></View>}
    {name === "bell" && <><View style={[border, { width: 15, height: 16, borderTopLeftRadius: 9, borderTopRightRadius: 9, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 }]} /><View style={{ width: 5, height: 2, borderRadius: 2, marginTop: 2, backgroundColor: color }} /></>}
    {name === "search" && <><View style={[border, { width: 13, height: 13, borderRadius: 7, position: "absolute", top: 3, left: 3 }]} /><View style={{ width: 8, height: 1.6, backgroundColor: color, transform: [{ rotate: "45deg" }], position: "absolute", top: 17, left: 14 }} /></>}
    {name === "traffic" && <View style={{ flexDirection: "row", gap: 3, alignItems: "flex-end" }}>{[9, 17, 12].map((height, i) => <View key={i} style={{ width: 3, height, borderRadius: 1, backgroundColor: color }} />)}</View>}
    {name === "people" && <><View style={[border, { width: 8, height: 8, borderRadius: 5 }]} /><View style={[border, { width: 17, height: 9, borderTopLeftRadius: 10, borderTopRightRadius: 10, marginTop: 2 }]} /></>}
    {name === "application" && <View style={[border, { width: 16, height: 19, borderRadius: 3, padding: 3, gap: 3 }]}>{[1, 2, 3].map(i => <View key={i} style={{ height: 1.4, width: i === 3 ? 5 : 8, backgroundColor: color }} />)}</View>}
    {name === "alert" && <View style={[border, { width: 19, height: 19, borderRadius: 10, justifyContent: "center", alignItems: "center" }]}><Text style={{ color, fontWeight: "700", fontSize: 13 }}>!</Text></View>}
    {name === "sector" && <View style={{ width: 18, height: 18, flexDirection: "row", flexWrap: "wrap", gap: 3 }}>{[0, 1, 2, 3].map(i => <View key={i} style={[border, { width: 7, height: 7, borderRadius: 2 }]} />)}</View>}
    {name === "support" && <View style={[border, { width: 18, height: 15, borderRadius: 7, borderBottomLeftRadius: 2, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 2.5 }]}>{[0, 1, 2].map(i => <View key={i} style={{ width: 2.2, height: 2.2, borderRadius: 1.1, backgroundColor: color }} />)}</View>}
    {name === "ai" && <View style={{ width: 18, height: 18, justifyContent: "center", alignItems: "center" }}><View style={[border, { width: 12, height: 12, borderRadius: 3, transform: [{ rotate: "45deg" }] }]} /><View style={{ position: "absolute", width: 4, height: 4, borderRadius: 2, backgroundColor: color }} /></View>}
    {name === "feedback" && <View style={{ width: 18, height: 18, justifyContent: "center", alignItems: "center" }}><View style={[border, { width: 17, height: 13, borderRadius: 4, justifyContent: "center", paddingHorizontal: 3, gap: 2.5 }]}><View style={{ width: 9, height: 1.5, backgroundColor: color, borderRadius: 1 }} /><View style={{ width: 6, height: 1.5, backgroundColor: color, borderRadius: 1 }} /></View></View>}
    {name === "audit" && <View style={[border, { width: 16, height: 19, borderRadius: 4, padding: 3, justifyContent: "space-between" }]}><View style={{ width: 8, height: 1.5, backgroundColor: color }} /><View style={{ width: 6, height: 6, borderRadius: 3, borderWidth: 1.4, borderColor: color, alignSelf: "flex-end" }} /></View>}
    {name === "shield" && <View style={[border, { width: 16, height: 18, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomLeftRadius: 9, borderBottomRightRadius: 9, justifyContent: "center", alignItems: "center" }]}><View style={{ width: 2, height: 6, backgroundColor: color, borderRadius: 1 }} /></View>}
    {name === "pulse" && <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>{[5, 13, 8, 16, 10].map((height, i) => <View key={i} style={{ width: 2.4, height, borderRadius: 1.2, backgroundColor: color }} />)}</View>}
    {name === "clock" && <View style={[border, { width: 18, height: 18, borderRadius: 9, justifyContent: "center", alignItems: "center" }]}><View style={{ width: 1.6, height: 5, backgroundColor: color, marginTop: -3 }} /><View style={{ width: 5, height: 1.6, backgroundColor: color, marginLeft: 3 }} /></View>}
    {name === "check" && <View style={[border, { width: 18, height: 18, borderRadius: 9, justifyContent: "center", alignItems: "center" }]}><View style={{ width: 8, height: 5, borderLeftWidth: 1.8, borderBottomWidth: 1.8, borderColor: color, transform: [{ rotate: "-45deg" }], marginTop: -1 }} /></View>}
    {name === "globe" && <View style={[border, { width: 18, height: 18, borderRadius: 9, justifyContent: "center", alignItems: "center" }]}><View style={{ width: 8, height: 16, borderRadius: 5, borderWidth: 1.2, borderColor: color }} /><View style={{ position: "absolute", width: 15, height: 1.3, backgroundColor: color }} /></View>}
  </View>;
}
export function PreviewLabel({ loaded = false }: { loaded?: boolean }) {
  return (
    <View style={styles.preview}>
      <FrostedSurface variant="bar" borderRadius={999} />
      <View style={[styles.previewDot, { backgroundColor: loaded ? teal : "#BF9958" }]} />
      <Text style={[styles.previewText, { color: loaded ? teal : "#92713D" }]}>
        {loaded ? "Live database" : "Syncing live data"}
      </Text>
      <Text style={styles.previewCaption}>{loaded ? "Real-time records & telemetry" : "Connecting to Supabase"}</Text>
    </View>
  );
}
export function InsightCard({ title, action, onPress, children }: { title: string; action?: string; onPress?: () => void; children: ReactNode }) {
  return <View style={styles.panel}><FrostedSurface variant="card" borderRadius={20} /><View style={styles.sectionHeading}><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>{action && <Pressable accessibilityRole="button" onPress={onPress} style={styles.linkTouch}><Text style={styles.link}>{action}</Text></Pressable>}</View>{children}</View>;
}
export function PeriodControl({ value, onChange }: { value: ReportingPeriod; onChange: (period: ReportingPeriod) => void }) {
  return <View style={styles.periods}><FrostedSurface variant="bar" borderRadius={18} />{([1, 7, 30] as const).map((period, i) => <Pressable key={period} accessibilityRole="button" accessibilityLabel={"Show " + ["today", "last 7 days", "last 30 days"][i]} accessibilityState={{ selected: value === period }} onPress={() => onChange(period)} style={[styles.period, value === period && styles.selectedPeriod]}><Text style={[styles.periodText, value === period && { color: ink, fontWeight: "600" }]}>{["Today", "7 days", "30 days"][i]}</Text></Pressable>)}</View>;
}
function MiniBars({ color }: { color: string }) { return <View accessible={false} style={styles.miniBars}>{[7, 11, 8, 15, 12, 20, 17].map((height, i) => <View key={i} style={{ width: 4, height, borderRadius: 2, backgroundColor: color, opacity: i === 6 ? 1 : 0.35 + i * 0.07 }} />)}</View>; }
function Metric({ label, value, caption, icon, color, onPress }: { label: string; value: string; caption: string; icon: MobileIconName; color: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label + ": " + value + ". " + caption + ". View details"} onPress={onPress} style={({ pressed }) => [styles.metric, pressed && { opacity: 0.65 }]}>
    <FrostedSurface variant="card" borderRadius={18} />
    <View style={styles.metricTop}><View style={[styles.metricIcon, { backgroundColor: color + "15" }]}><MobileIcon name={icon} color={color} /></View><Text style={styles.metricValue}>{value}</Text></View>
    <Text style={styles.metricLabel}>{label}</Text><View style={styles.metricBottom}><Text style={styles.metricCaption}>{caption}</Text><MiniBars color={color} /></View>
  </Pressable>;
}
export function TrafficChart({
  period,
  line = false,
  dailyViews,
  totalViews,
}: {
  period: ReportingPeriod;
  line?: boolean;
  dailyViews?: Array<{ date: string; views: number; uniqueSessions?: number }>;
  totalViews?: number;
}) {
  const days = dailyViews && dailyViews.length
    ? dailyViews
    : emptyReportingSummary(period).telemetry.dailyViews;
  const total = typeof totalViews === "number" ? totalViews : days.reduce((sum, d) => sum + (d.views || 0), 0);
  const [width, setWidth] = useState(250);
  const [selected, setSelected] = useState<string | null>(null);
  const peakViews = Math.max(0, ...days.map(day => day.views || 0));
  const max = Math.max(10, Math.ceil(Math.max(1, peakViews) / 10) * 10);
  const chosen = days.find(day => day.date === selected) ?? days[days.length - 1];
  const plotHeight = 148;
  const plotWidth = Math.max(20, width - 12);
  return <View style={{ gap: 12 }}>
    <View style={styles.chartSummary}><Text style={styles.chartTotal}>{total.toLocaleString("en-BW")}<Text style={styles.chartUnit}> page views</Text></Text><View style={styles.legend}><View style={[styles.legendDot, { backgroundColor: blue }]} /><Text style={styles.small}>Live telemetry</Text></View></View>
    <View style={styles.chart}>
      <View style={styles.yAxis}>{[max, Math.round(max / 2), 0].map((value, idx) => <Text key={`${value}-${idx}`} style={styles.axisText}>{value}</Text>)}</View>
      <View style={styles.plot} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>{[0, 0.5, 1].map(position => <View key={position} style={[styles.gridLine, { top: plotHeight * position }]} />)}</View>
        {line ? <View style={{ height: plotHeight, marginHorizontal: 6 }} accessible accessibilityLabel={"Live page views: " + days.map(day => `${day.date}: ${day.views}`).join(", ")}>
          {days.slice(1).map((day, index) => {
            const x = index / Math.max(1, days.length - 1) * plotWidth;
            const y = plotHeight - days[index].views / max * plotHeight;
            const dx = plotWidth / Math.max(1, days.length - 1), dy = -(day.views - days[index].views) / max * plotHeight;
            const length = Math.hypot(dx, dy);
            return <View key={day.date} style={{ position: "absolute", left: x + dx / 2 - length / 2, top: y + dy / 2 - 1.5, width: length, height: 3, borderRadius: 2, backgroundColor: blue, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }} />;
          })}
          {days.map((day, index) => <View key={day.date} style={{ position: "absolute", left: (days.length === 1 ? plotWidth / 2 : index / Math.max(1, days.length - 1) * plotWidth) - 3, top: plotHeight - day.views / max * plotHeight - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: blue }} />)}
        </View> : <View style={styles.columns}>{days.map(day => <Pressable key={day.date} accessibilityRole="button" accessibilityLabel={day.date + ": " + day.views + " page views"} onPress={() => setSelected(day.date)} style={styles.column}><View style={[styles.bar, { height: day.views / max * plotHeight, backgroundColor: day.date === chosen.date ? blue : "#9DBCE4", maxWidth: period === 1 ? 40 : 23 }]} /></Pressable>)}</View>}
        <View style={styles.xAxis}>{(period === 7 ? days : [days[0], ...(period === 30 && days[14] ? [days[14]] : []), ...(period === 1 || days.length < 2 ? [] : [days[days.length - 1]])]).map(day => <Text key={day.date} style={styles.axisText}>{period === 7 ? new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(new Date(day.date + "T12:00:00Z")) : day.date.slice(5).replace("-", "/")}</Text>)}</View>
      </View>
    </View>
    <Text accessibilityLiveRegion="polite" style={styles.chartDetail}>{total === 0 ? "No live telemetry views recorded in this window yet." : line ? `${reportingPeriodLabel(period)} · live page views` : `${chosen.date}  /  ${chosen.views} page views · tap a bar`}</Text>
  </View>;
}
export function Ring({ segments, center, label }: { segments: { value: number; color: string }[]; center: string; label: string }) {
  const total = Math.max(1, segments.reduce((sum, segment) => sum + segment.value, 0));
  return <View accessible accessibilityLabel={center + " " + label} style={styles.ring}>
    {Array.from({ length: 100 }, (_, i) => {
      let limit = 0;
      const color = segments.find(segment => { limit += segment.value / total * 100; return i < limit; })?.color ?? "#EEF0F3";
      const angle = (i / 100 * 360 - 90) * Math.PI / 180;
      return <View key={i} style={{ position: "absolute", left: 59 + Math.cos(angle) * 50 - 1.8, top: 59 + Math.sin(angle) * 50 - 5, width: 3.6, height: 10, borderRadius: 2, backgroundColor: color, transform: [{ rotate: `${angle + Math.PI / 2}rad` }] }} />;
    })}<Text style={styles.ringValue}>{center}</Text><Text style={styles.small}>{label}</Text>
  </View>;
}
export function Breakdown({ entries, maxValue }: { entries: { label: string; value: number; color: string }[]; maxValue?: number }) {
  const max = maxValue ?? Math.max(1, ...entries.map(entry => entry.value));
  return <View style={{ flex: 1, gap: 13 }}>{entries.map(entry => <View key={entry.label} style={{ gap: 6 }}><View style={styles.sectionHeading}><View style={styles.legend}><View style={[styles.legendDot, { backgroundColor: entry.color }]} /><Text style={styles.small}>{entry.label}</Text></View><Text style={styles.breakdownValue}>{entry.value}</Text></View><View style={styles.progressTrack}><View style={{ width: `${entry.value / max * 100}%`, height: 4, borderRadius: 3, backgroundColor: entry.color }} /></View></View>)}</View>;
}
export function AdminOverview({
  period,
  onPeriodChange,
  onNavigate,
  liveApplications,
  liveMatters,
  liveAudit,
  liveOptimus,
  reportingSummary,
  onExportExecutive,
}: {
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  onNavigate: (screen: Destination) => void;
  liveApplications?: AdminApplication[];
  liveMatters?: AdminMatter[];
  liveAudit?: AdminAuditEntry[];
  liveOptimus?: AdminOptimusOverview | null;
  reportingSummary?: AdminReportingSummary | null;
  onExportExecutive?: () => void;
}) {
  const liveReady = Boolean(reportingSummary?.loaded || (liveApplications && liveApplications.length) || (liveMatters && liveMatters.length));
  const summary = reportingSummary?.loaded
    ? reportingSummary
    : buildReportingSummaryFromRecords({
        periodDays: period,
        applications: liveApplications || [],
        matters: liveMatters || [],
        optimus: liveOptimus || null,
      });
  const appsList = liveApplications || [];
  const mattersList = liveMatters || [];
  const openMatters = mattersList.filter(item => item.state !== "Resolved");
  const outcomes = [
    { label: "Submitted", value: summary.applications.submitted, color: blue },
    { label: "In review", value: summary.applications.inReview, color: "#D7A65C" },
    { label: "Changes requested", value: summary.applications.changesRequested, color: "#B1873E" },
    { label: "Approved", value: summary.applications.approved, color: teal },
    { label: "Awarded", value: summary.applications.awarded, color: "#7C5317" },
    { label: "Rejected", value: summary.applications.rejected, color: "#BF6C62" },
  ];
  const recentAudit = liveAudit && liveAudit.length ? liveAudit.slice(0, 3) : null;
  const optTotal = reportingSummary?.loaded ? summary.optimus.totalInteractions : (liveOptimus?.totalInteractions ?? null);
  const wv = summary.telemetry.webVitals;
  const lcpLabel = wv.lcpMs != null ? formatTelemetryMetric(wv.lcpMs, "s") : "No samples";
  const inpLabel = wv.inpMs != null ? formatTelemetryMetric(wv.inpMs, "ms") : "No INP samples yet";
  const helpful = summary.optimus.helpfulCount;
  const unhelpful = summary.optimus.notHelpfulCount;
  const s = styles;
  return <>
    <View style={s.overviewHeading}><Text accessibilityRole="header" style={s.title}>Overview</Text><Text style={s.small}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Gaborone" }).format(new Date())}</Text></View>
    <PreviewLabel loaded={liveReady} />
    <View style={s.metrics}>
      <Metric label="Portal page views" value={summary.telemetry.totalViews.toLocaleString("en-BW")} caption={`${summary.participation.activeVisitorsNow} active · ${reportingPeriodLabel(period)}`} icon="traffic" color={blue} onPress={() => onNavigate("Portal analytics")} />
      <Metric label="Optimus interactions" value={optTotal !== null ? String(optTotal) : "0"} caption={liveReady ? "Live database logs" : "Awaiting data"} icon="ai" color={teal} onPress={() => onNavigate("Optimus Prime")} />
      <Metric label="Applications" value={String(summary.applications.total || appsList.length)} caption={summary.applications.approvalRatePct != null ? `${summary.applications.approvalRatePct}% approval rate` : "Non-draft total"} icon="application" color={rust} onPress={() => onNavigate("Innovations")} />
      <Metric label="Open follow-ups" value={String(reportingSummary?.loaded ? summary.matters.open + summary.matters.investigating + summary.matters.waiting : openMatters.length)} caption="Matters needing attention" icon="alert" color="#B1873E" onPress={() => onNavigate("Follow-ups")} />
    </View>
    <InsightCard title="Portal traffic" action={onExportExecutive ? "Export CSV" : undefined} onPress={onExportExecutive}>
      <View style={s.sectionHeading}><Text style={s.small}>Reporting period</Text><PeriodControl value={period} onChange={onPeriodChange} /></View>
      <TrafficChart period={period} dailyViews={summary.telemetry.dailyViews} totalViews={summary.telemetry.totalViews} />
      <Pressable accessibilityRole="button" style={s.fullLink} onPress={() => onNavigate("Portal analytics")}><Text style={styles.link}>View full analytics &amp; exports</Text><Text style={styles.link}>→</Text></Pressable>
    </InsightCard>
    <InsightCard title="Performance"><View style={styles.healthRow}><View style={styles.healthCopy}><View style={styles.legend}><View style={[styles.legendDot, { backgroundColor: teal }]} /><Text style={styles.healthTitle}>Website health</Text></View><Text style={styles.healthValue}>{lcpLabel}</Text><Text style={styles.small}>Main content load (p75)</Text></View><View style={styles.healthVisual}><MiniBars color={teal} /><Text style={styles.small}>{inpLabel}</Text></View></View><Pressable accessibilityRole="button" style={styles.fullLink} onPress={() => onNavigate("Website health")}><Text style={styles.link}>View website health</Text><Text style={styles.link}>→</Text></Pressable><View style={styles.healthRow}><View style={styles.healthCopy}><Text style={styles.healthTitle}>Optimus Prime</Text><Text style={styles.healthValue}>{optTotal !== null ? String(optTotal) : "0"}</Text><Text style={styles.small}>{`${summary.optimus.escalations} support escalations`}</Text></View><View style={styles.aiRing}><Ring segments={[{ value: Math.max(1, helpful || 0), color: blue }, { value: Math.max(1, unhelpful || (helpful ? 0 : 1)), color: "#E8ECF1" }]} center={String(summary.optimus.escalations)} label="Escalated" /></View></View><Pressable accessibilityRole="button" style={styles.fullLink} onPress={() => onNavigate("Optimus Prime")}><Text style={styles.link}>View AI configuration &amp; metrics</Text><Text style={styles.link}>→</Text></Pressable></InsightCard>
    <InsightCard title="Application outcomes" action="View all" onPress={() => onNavigate("Innovations")}><View style={styles.outcomeRow}><Ring segments={summary.applications.total || appsList.length ? outcomes : [{ value: 1, color: "#EEF0F3" }]} center={String(summary.applications.total || appsList.length)} label="Applications" /><Breakdown entries={outcomes} /></View></InsightCard>
    <InsightCard title="Follow-ups" action="View all" onPress={() => onNavigate("Follow-ups")}>{openMatters.length ? openMatters.slice(0, 3).map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => onNavigate("Follow-ups")} style={styles.matter}><View style={[styles.matterIcon, { backgroundColor: item.priority === "High" ? "#F9EBE6" : "#F1F3F6" }]}><MobileIcon name="alert" color={item.priority === "High" ? rust : blue} /></View><View style={{ flex: 1, gap: 4 }}><Text style={styles.itemTitle}>{item.title}</Text><Text style={styles.small}>{item.id} · {item.kind} · {item.state}</Text></View><View style={[styles.priorityDot, { backgroundColor: item.priority === "High" ? rust : "#D7A65C" }]} /></Pressable>) : <Text style={s.small}>No open follow-up matters in the live queue.</Text>}</InsightCard>
    <InsightCard title="Recent activity" action="View log" onPress={() => onNavigate("Activity log")}>{recentAudit ? recentAudit.map(entry => <Pressable accessibilityRole="button" key={entry.id} style={styles.matter} onPress={() => onNavigate("Activity log")}><View style={styles.initials}><Text style={styles.initialsText}>{entry.actor.split(" ").slice(-1)[0].slice(0, 2).toUpperCase()}</Text></View><View style={{ flex: 1, gap: 4 }}><Text style={styles.itemTitle}>{entry.actor}</Text><Text style={styles.small}>{entry.action} · {entry.target}</Text><Text style={styles.eventTime}>{entry.created_at.slice(0, 16).replace("T", " ")}</Text></View></Pressable>) : <Text style={s.small}>No recent audit events loaded yet.</Text>}</InsightCard>
    <Text style={styles.footerNote}>All counts, turnaround SLAs, and telemetry come from live Supabase reporting RPCs.</Text>
  </>;
}

const styles = StyleSheet.create({
  icon: { width: 24, height: 24, justifyContent: "center", alignItems: "center" }, overviewHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, title: { color: ink, fontSize: fontSizes.title, fontWeight: "700", letterSpacing: -0.6 }, small: { fontSize: fontSizes.subbody, lineHeight: 19, color: muted },
  preview: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "rgba(215,166,92,0.42)", overflow: "hidden" }, previewDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#BF9958" }, previewText: { fontSize: fontSizes.caption, color: "#92713D", fontWeight: "700" }, previewCaption: { color: muted, fontSize: fontSizes.caption },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, metric: { flexBasis: "45%", flexGrow: 1, borderRadius: 20, padding: 14, gap: 8, overflow: "hidden", shadowColor: "#241C19", shadowOpacity: 0.05, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14, elevation: 2 }, metricTop: { flexDirection: "row", alignItems: "center", gap: 9, flexWrap: "wrap" }, metricIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" }, metricValue: { fontSize: fontSizes.title, fontWeight: "700", letterSpacing: -0.6, color: ink }, metricLabel: { fontSize: fontSizes.subbody, fontWeight: "600", color: "#52606E" }, metricBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 4 }, metricCaption: { color: muted, fontSize: fontSizes.caption, flexShrink: 1 }, miniBars: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 20 },
  panel: { borderRadius: 22, padding: 16, gap: 16, overflow: "hidden", shadowColor: "#241C19", shadowOpacity: 0.05, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14, elevation: 2 }, sectionHeading: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }, sectionTitle: { fontSize: fontSizes.heading, fontWeight: "700", color: ink, letterSpacing: -0.3 }, link: { fontSize: fontSizes.subbody, color: blue, fontWeight: "600" }, linkTouch: { minHeight: 44, justifyContent: "center" }, fullLink: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(36,28,25,0.07)", paddingTop: 12, minHeight: 44 },
  periods: { flexDirection: "row", padding: 3, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.88)", overflow: "hidden" }, period: { paddingHorizontal: 11, minHeight: 38, justifyContent: "center", borderRadius: 15 }, selectedPeriod: { backgroundColor: "#fffaf4", shadowColor: "#241C19", shadowOpacity: 0.08, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 1 }, periodText: { fontSize: fontSizes.caption, color: muted },
  chartSummary: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }, chartTotal: { fontSize: fontSizes.title, fontWeight: "700", color: ink }, chartUnit: { fontSize: fontSizes.subbody, color: muted, fontWeight: "400" }, legend: { flexDirection: "row", alignItems: "center", gap: 6 }, legendDot: { width: 6, height: 6, borderRadius: 3 },
  chart: { flexDirection: "row", gap: 10, paddingTop: 5 }, yAxis: { width: 32, height: 148, justifyContent: "space-between" }, axisText: { color: muted, fontSize: fontSizes.caption }, plot: { flex: 1 }, gridLine: { position: "absolute", width: "100%", borderTopWidth: 1, borderTopColor: "#F0F2F5" }, columns: { height: 148, flexDirection: "row", alignItems: "flex-end", gap: 3 }, column: { flex: 1, height: 148, justifyContent: "flex-end", alignItems: "center" }, bar: { width: "72%", minWidth: 2, borderTopLeftRadius: 3, borderTopRightRadius: 3 }, xAxis: { flexDirection: "row", justifyContent: "space-around", paddingTop: 12 }, chartDetail: { fontSize: fontSizes.caption, color: muted, textAlign: "center" },
  healthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, healthCopy: { gap: 6, flex: 1 }, healthTitle: { color: ink, fontSize: fontSizes.body, fontWeight: "600" }, healthValue: { fontSize: fontSizes.title, color: ink, fontWeight: "700" }, healthVisual: { alignItems: "flex-end", gap: 10 }, aiRing: { marginVertical: -10 }, ring: { width: 118, height: 118, justifyContent: "center", alignItems: "center", gap: 2 }, ringValue: { color: ink, fontSize: fontSizes.title, fontWeight: "700" }, outcomeRow: { flexDirection: "row", alignItems: "center", gap: 22 }, breakdownValue: { color: ink, fontSize: fontSizes.subbody, fontWeight: "600" }, progressTrack: { height: 4, backgroundColor: "#F1F3F6", borderRadius: 3 },
  matter: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, minHeight: 58, borderBottomWidth: 1, borderBottomColor: "rgba(218,208,198,0.45)" }, matterIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" }, itemTitle: { color: ink, fontSize: fontSizes.body, fontWeight: "600", lineHeight: 21 }, priorityDot: { width: 6, height: 6, borderRadius: 3 }, initials: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#EBF1F9" }, initialsText: { color: blue, fontSize: fontSizes.subbody, fontWeight: "700" }, eventTime: { color: "#9AA1AA", fontSize: fontSizes.caption }, footerNote: { fontSize: fontSizes.caption, lineHeight: 17, color: muted, textAlign: "center" },
});
