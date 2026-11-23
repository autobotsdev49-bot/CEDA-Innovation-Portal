import { useState } from "react";
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FrostedModalBackdrop, FrostedSurface } from "./FrostedGlass";
import { buttonCornerRadius, fontSizes } from "./theme";
import { Breakdown, InsightCard, MobileIcon, PeriodControl, PreviewLabel, Ring, TrafficChart, type InsightScreen, type MobileIconName } from "./AdminOverview";
import type { ReportingPeriod } from "./adminPreview";
import type { AdminAuditEntry, AdminMatter, AdminReportingSummary } from "./auth";
import {
  REPORT_PACKAGE_DEFS,
  buildTurnaroundRows,
  emptyReportingSummary,
  formatTelemetryMetric,
  reportingPeriodLabel,
} from "./reportingOverview.js";

type Props = {
  screen: InsightScreen;
  period: ReportingPeriod;
  onPeriodChange: (period: ReportingPeriod) => void;
  inspect: (title: string, facts: [string, string][]) => void;
  liveMatters?: AdminMatter[];
  liveAudit?: AdminAuditEntry[];
  reportingSummary?: AdminReportingSummary | null;
  onExportReport?: (reportKey: string, format: "csv" | "share") => void;
  onOpenMatter?: (matter: AdminMatter) => void;
};
const followUpStatuses: Record<string, { color: string; tint: string }> = {
  "All statuses": { color: "#FFFFFF", tint: "#192C40" },
  Open: { color: "#903925", tint: "#FBEDE8" },
  Investigating: { color: "#94702D", tint: "#FCF4E4" },
  Waiting: { color: "#603D78", tint: "#F2EAF8" },
  Resolved: { color: "#236D61", tint: "#E4F4F0" },
};

function SummaryTile({ label, value, caption, icon, color, badge }: { label: string; value: string; caption: string; icon: MobileIconName; color: string; badge?: string }) {
  return <View style={s.tile}>
    <FrostedSurface variant="card" borderRadius={18} />
    <View style={s.tileTop}>
      <View style={[s.tileIcon, { backgroundColor: color + "16" }]}><MobileIcon name={icon} color={color} /></View>
      {badge && <View style={[s.tileBadge, { backgroundColor: color + "16" }]}><Text style={[s.tileBadgeText, { color }]}>{badge}</Text></View>}
    </View>
    <Text style={s.tileValue}>{value}</Text>
    <Text style={s.tileLabel}>{label}</Text>
    <Text style={s.tileCaption}>{caption}</Text>
  </View>;
}

export function AdminInsights({ screen, period, onPeriodChange, inspect, liveMatters, liveAudit, reportingSummary, onExportReport, onOpenMatter }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [state, setState] = useState("All statuses");
  const [priority, setPriority] = useState("All priorities");
  const [filterOpen, setFilterOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const summary = reportingSummary?.loaded ? reportingSummary : emptyReportingSummary(period);
  const tele = summary.telemetry;
  const wv = tele.webVitals;
  const dailyViews = tele.dailyViews;
  const maxDayViews = Math.max(1, ...dailyViews.map(day => day.views));
  const topDevice = tele.devices[0];
  const topRoute = tele.topRoutes[0];
  const turnaroundRows = buildTurnaroundRows(summary.turnaround);
  const deviceEntries = tele.devices.map((d, idx) => ({
    label: `${d.name} (${d.sharePct}%)`,
    value: d.count,
    color: ["#417AC5", "#278477", "#D7A65C"][idx % 3],
  }));
  const routeEntries = tele.topRoutes.slice(0, 6).map((r, idx) => ({
    label: r.label || r.route,
    value: r.views,
    color: ["#417AC5", "#6996D0", "#278477", "#9DBCE4", "#D7A65C", "#C7D8EE"][idx % 6],
  }));
  const baseMatters: AdminMatter[] = liveMatters || [];
  const matters = baseMatters.filter(item => (filter === "All" || item.kind === filter) && (state === "All statuses" || item.state === state) && (priority === "All priorities" || item.priority === priority) && (item.title + item.reporter + item.id).toLowerCase().includes(query.trim().toLowerCase()));
  const hasFilters = !!query.trim() || filter !== "All" || state !== "All statuses" || priority !== "All priorities";
  const reset = () => { setQuery(""); setFilter("All"); setState("All statuses"); setPriority("All priorities"); };
  const filteredAudit = (liveAudit || []).filter(item => (item.actor + item.action + item.target + item.reason).toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <View style={s.topRow}>
      <PreviewLabel loaded={summary.loaded} />
      {(screen === "Portal analytics" || screen === "Website health") && <PeriodControl value={period} onChange={onPeriodChange} />}
    </View>
    {screen === "Portal analytics" && <>
      <View style={s.tileGrid}>
        <SummaryTile label="Total page views" value={tele.totalViews.toLocaleString("en-BW")} caption={reportingPeriodLabel(period)} icon="traffic" color="#417AC5" badge={summary.loaded ? "Live" : "Sync"} />
        <SummaryTile label="Active visitors" value={String(summary.participation.activeVisitorsNow)} caption="Last 5 minutes" icon="people" color="#278477" badge="Sessions" />
        <SummaryTile label="Primary device" value={topDevice ? `${topDevice.sharePct}%` : "N/A"} caption={topDevice ? `${topDevice.name} (${topDevice.count})` : "No telemetry yet"} icon="globe" color="#695198" badge={topDevice ? topDevice.name : "Device"} />
        <SummaryTile label="Top destination" value={topRoute ? topRoute.route : "N/A"} caption={topRoute ? `${topRoute.views} views` : "No route views yet"} icon="application" color="#9A3D2B" badge="Route" />
      </View>
      <InsightCard title="Audience over time">
        <TrafficChart period={period} line dailyViews={dailyViews} totalViews={tele.totalViews} />
        <Text style={s.small}>{summary.windowStart} to {summary.windowEnd} (Africa/Gaborone) · {tele.uniqueSessions} unique sessions</Text>
      </InsightCard>
      <InsightCard title="Device breakdown">
        {deviceEntries.length ? (
          <View style={s.ringRow}>
            <Ring segments={deviceEntries.map(d => ({ value: d.value, color: d.color }))} center={topDevice ? `${topDevice.sharePct}%` : "0%"} label={topDevice ? topDevice.name : "Devices"} />
            <Breakdown entries={deviceEntries} />
          </View>
        ) : <Text style={s.small}>No live device telemetry samples recorded in this window yet.</Text>}
      </InsightCard>
      <InsightCard title="Popular routes">
        {routeEntries.length ? <Breakdown entries={routeEntries} /> : <Text style={s.small}>No route views recorded in this window yet.</Text>}
      </InsightCard>
      <InsightCard title="Daily page views">
        {dailyViews.map((day, index) => (
          <View key={day.date} style={[s.dayRow, index === dailyViews.length - 1 && { borderBottomWidth: 0 }]}>
            <Text style={s.dayDate}>{day.date}</Text>
            <View style={s.dayTrack}><View style={[s.dayFill, { width: `${day.views > 0 ? Math.max(8, day.views / maxDayViews * 100) : 0}%` }]} /></View>
            <Text style={s.value}>{day.views}</Text>
          </View>
        ))}
      </InsightCard>
      <InsightCard title="Turnaround SLAs (Average / Median / P95)">
        {turnaroundRows.map((row, idx) => (
          <View key={row.key} style={[s.fact, idx === turnaroundRows.length - 1 && { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.rowTitle}>{row.label}</Text>
              <Text style={s.small}>{row.sampleCount} samples · Median {row.medianDisplay} · P95 {row.p95Display}</Text>
            </View>
            <Text style={s.value}>{row.avgDisplay}</Text>
          </View>
        ))}
      </InsightCard>
      <InsightCard title="Export audited reports">
        <Text style={s.small}>Every CSV export and executive brief share is logged to admin_audit with Africa/Gaborone timestamps.</Text>
        {REPORT_PACKAGE_DEFS.map((pkg, idx) => (
          <View key={pkg.key} style={[s.exportRow, idx === REPORT_PACKAGE_DEFS.length - 1 && { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.rowTitle}>{pkg.title}</Text>
              <Text style={s.small}>{pkg.audience} · {pkg.cadence}</Text>
            </View>
            {onExportReport && (
              <View style={s.exportActions}>
                <Pressable accessibilityRole="button" onPress={() => onExportReport(pkg.key, "csv")} style={s.exportBtn}>
                  <Text style={s.exportBtnText}>CSV</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => onExportReport(pkg.key, "share")} style={[s.exportBtn, s.exportBtnPrimary]}>
                  <Text style={s.exportBtnPrimaryText}>Share</Text>
                </Pressable>
              </View>
            )}
          </View>
        ))}
      </InsightCard>
    </>}
    {screen === "Website health" && <>
      <View style={s.tileGrid}>
        <SummaryTile label="Main content load" value={formatTelemetryMetric(wv.lcpMs, "s", "N/A")} caption="Largest Contentful Paint (p75)" icon="pulse" color="#278477" badge={wv.lcpMs != null ? (wv.lcpMs <= 2500 ? "Good" : "Watch") : "Pending"} />
        <SummaryTile label="Interaction response" value={formatTelemetryMetric(wv.inpMs, "ms", "N/A")} caption="Interaction to Next Paint (p75)" icon="clock" color="#417AC5" badge={wv.inpMs != null ? (wv.inpMs <= 200 ? "Fast" : "Watch") : "Pending"} />
        <SummaryTile label="Visual stability" value={formatTelemetryMetric(wv.cls, "cls", "N/A")} caption="Cumulative Layout Shift (p75)" icon="check" color="#236D61" badge={wv.cls != null ? (wv.cls <= 0.1 ? "Stable" : "Shift") : "Pending"} />
        <SummaryTile label="Request failures" value={String(wv.errorCount ?? 0)} caption={`${reportingPeriodLabel(period)} · ${wv.sampleCount} samples`} icon="alert" color="#B1873E" badge={wv.availabilityPct != null ? `${wv.availabilityPct}% up` : "Live"} />
      </View>
      <InsightCard title="Speed &amp; stability">{[
        ["Main content load", formatTelemetryMetric(wv.lcpMs, "s", "No live samples yet"), "Largest Contentful Paint (p75)", "#278477", "#E4F4F0"],
        ["Interaction response", formatTelemetryMetric(wv.inpMs, "ms", "No live samples yet"), "Interaction to Next Paint (p75)", "#28599B", "#EAF1FC"],
        ["Visual stability", formatTelemetryMetric(wv.cls, "cls", "No live samples yet"), "Cumulative Layout Shift (p75)", "#236D61", "#E4F4F0"],
        ["Server TTFB", formatTelemetryMetric(wv.ttfbMs, "ms", "No live samples yet"), "Time to First Byte (p75)", "#94702D", "#FCF4E4"],
      ].map(([label, value, note, color, tint], index) => <View key={label} style={[s.fact, index === 3 && { borderBottomWidth: 0 }]}><View style={[s.healthIcon, { backgroundColor: tint }]}><MobileIcon name={index === 3 ? "clock" : "pulse"} color={color} /></View><View style={{ flex: 1, gap: 3 }}><Text style={s.rowTitle}>{label}</Text><Text style={s.small}>{note}</Text></View><Text style={s.healthValue}>{value}</Text></View>)}</InsightCard>
      <InsightCard title="Platform delivery &amp; AI health">
        <View style={s.fact}><Text style={s.rowTitle}>Notification queue</Text><Text style={s.small}>{summary.notifications.sent} sent · {summary.notifications.queued} queued · {summary.notifications.failed} failed</Text></View>
        <View style={[s.fact, { borderBottomWidth: 0 }]}><Text style={s.rowTitle}>Optimus Prime</Text><Text style={s.small}>{summary.optimus.totalInteractions} total · {summary.optimus.escalations} escalations</Text></View>
      </InsightCard>
    </>}
    {(screen === "Follow-ups" || screen === "Activity log") && <>
      {screen === "Follow-ups" ? <>
        <View style={s.toolbar}>
          <View style={s.search}><FrostedSurface variant="bar" borderRadius={24} /><MobileIcon name="search" color="#8B929C" /><TextInput accessibilityLabel="Search issue or reporter" value={query} onChangeText={setQuery} placeholder="Search issue or reporter" placeholderTextColor="#8B929C" autoCorrect={false} maxLength={100} returnKeyType="search" style={s.searchInput} />{!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear follow-up search" onPress={() => setQuery("")} style={s.close}><Text style={s.closeText}>×</Text></Pressable>}</View>
          <Pressable accessibilityRole="button" accessibilityLabel={"Filter by type and priority. " + filter + ", " + priority} accessibilityState={{ expanded: filterOpen }} onPress={() => { Keyboard.dismiss(); setFilterOpen(true); }} style={[s.funnelButton, (filter !== "All" || priority !== "All priorities") && s.funnelSelected]}><FrostedSurface variant="bar" borderRadius={buttonCornerRadius} /><View accessible={false} style={s.funnel}><View style={[s.funnelTop, { borderTopColor: filter === "All" && priority === "All priorities" ? "#66717E" : "#28599B" }]} /><View style={[s.funnelStem, { backgroundColor: filter === "All" && priority === "All priorities" ? "#66717E" : "#28599B" }]} /></View>{(filter !== "All" || priority !== "All priorities") && <View style={s.filterDot} />}</Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>{["All statuses", "Open", "Investigating", "Waiting", "Resolved"].map(option => { const appearance = followUpStatuses[option]; return <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: state === option }} onPress={() => setState(option)} style={[s.pill, state === option && { backgroundColor: appearance.tint }]}>{option !== "All statuses" && <View style={[s.dot, { backgroundColor: appearance.color }]} />}<Text style={[s.pillText, state === option && { color: appearance.color, fontWeight: "700" }]}>{option === "All statuses" ? "All" : option}</Text></Pressable>; })}</ScrollView>
        <View style={s.countRow}><Text accessibilityLiveRegion="polite" style={s.small}><Text style={s.countNumber}>{matters.length}</Text> live {matters.length === 1 ? "matter" : "matters"}{filter !== "All" ? " · " + filter : ""}{priority !== "All priorities" ? " · " + priority + " priority" : ""}</Text>{hasFilters && <Pressable accessibilityRole="button" style={s.clear} onPress={reset}><Text style={s.link}>Clear filters</Text></Pressable>}</View>
      </> : <>
        <View style={s.toolbar}>
          <View style={s.search}><FrostedSurface variant="bar" borderRadius={24} /><MobileIcon name="search" color="#8B929C" /><TextInput accessibilityLabel="Search actor, action or record" value={query} onChangeText={setQuery} placeholder="Search actor, action or record" placeholderTextColor="#8B929C" autoCorrect={false} maxLength={100} returnKeyType="search" style={s.searchInput} />{!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear activity search" onPress={() => setQuery("")} style={s.close}><Text style={s.closeText}>×</Text></Pressable>}</View>
        </View>
        <View style={s.countRow}><Text accessibilityLiveRegion="polite" style={s.small}><Text style={s.countNumber}>{filteredAudit.length}</Text> recorded audit {filteredAudit.length === 1 ? "event" : "events"}</Text>{hasFilters && <Pressable accessibilityRole="button" style={s.clear} onPress={reset}><Text style={s.link}>Clear filters</Text></Pressable>}</View>
      </>}
      {screen === "Follow-ups" && <InsightCard title="Reported matters">{matters.length ? matters.map((item, index) => {
        const stateVisual = followUpStatuses[item.state] ?? followUpStatuses.Open;
        return <Pressable key={item.id} accessibilityRole="button" style={({ pressed }) => [s.itemRow, index === matters.length - 1 && { borderBottomWidth: 0 }, pressed && { backgroundColor: "rgba(247,242,235,0.65)" }]} onPress={() => onOpenMatter ? onOpenMatter(item) : inspect(item.title, [["Reference", item.id], ["Type", item.kind], ["Reported by", item.reporter], ["Owner", item.owner], ["Priority", item.priority], ["Status", item.state], ["Report", item.detail]])}>
          <View style={[s.itemBadge, { backgroundColor: item.priority === "High" ? "#FBEDE8" : "#EAF1FC" }]}><MobileIcon name="alert" color={item.priority === "High" ? "#903925" : "#28599B"} /></View>
          <View style={s.itemBody}>
            <View style={s.itemHeader}><Text style={s.reference}>{item.id} · {item.kind}</Text><Text style={[s.priority, item.priority === "High" && { color: "#9A3D2B", backgroundColor: "#FAEDE8" }]}>{item.priority}</Text></View>
            <Text style={s.rowTitle}>{item.title}</Text>
            <Text style={s.small}>Reported by {item.reporter} · Owner: {item.owner}</Text>
            <View style={s.tagRow}><View style={[s.stateBadge, { backgroundColor: stateVisual.tint }]}><View style={[s.dot, { backgroundColor: stateVisual.color }]} /><Text style={[s.stateText, { color: stateVisual.color }]}>{item.state}</Text></View></View>
          </View>
          <Text accessible={false} style={s.chevron}>{"\u203a"}</Text>
        </Pressable>;
      }) : <View style={s.emptyState}><Text style={s.rowTitle}>No matters match these filters</Text><Text style={s.small}>Try clearing your search or choosing another status.</Text></View>}</InsightCard>}
      {screen === "Activity log" && <InsightCard title="Who did what">{filteredAudit.length ? filteredAudit.map((item, index) => (
        <Pressable key={String(item.id)} accessibilityRole="button" style={({ pressed }) => [s.itemRow, index === filteredAudit.length - 1 && { borderBottomWidth: 0 }, pressed && { backgroundColor: "rgba(247,242,235,0.65)" }]} onPress={() => inspect(item.action, [["Actor", item.actor], ["Action", item.action], ["Target", item.target], ["When", item.created_at.slice(0, 16).replace("T", " ")], ["Reason", item.reason || "Recorded"]])}>
          <View style={[s.itemBadge, { backgroundColor: "#EAF1FC" }]}><Text style={[s.initials, { color: "#28599B" }]}>{item.actor.split(" ").slice(-1)[0].slice(0, 2).toUpperCase()}</Text></View>
          <View style={s.itemBody}>
            <View style={s.itemHeader}><Text style={s.reference}>{item.target}</Text><Text style={s.reference}>{item.created_at.slice(0, 16).replace("T", " ")}</Text></View>
            <Text style={s.rowTitle}>{item.action}</Text>
            <Text style={s.small}>{item.actor}{item.reason ? ` · ${item.reason}` : ""}</Text>
          </View>
          <Text accessible={false} style={s.chevron}>{"\u203a"}</Text>
        </Pressable>
      )) : <View style={s.emptyState}><Text style={s.rowTitle}>No recorded audit events match</Text><Text style={s.small}>Open the Audit logs screen or adjust your filter.</Text></View>}</InsightCard>}
      {screen === "Follow-ups" && <Modal visible={filterOpen} transparent statusBarTranslucent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <FrostedModalBackdrop>
          <View style={s.overlay}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close follow-up filters" onPress={() => setFilterOpen(false)} style={StyleSheet.absoluteFill} />
            <View accessibilityViewIsModal style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 22) }]}>
              <FrostedSurface variant="sheet" />
              <View style={s.handle} />
              <View style={s.sheetHeader}><View><Text style={s.sheetEyebrow}>FOLLOW-UPS</Text><Text accessibilityRole="header" style={s.sheetTitle}>Filter follow-ups</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close follow-up filters" onPress={() => setFilterOpen(false)} style={s.closeCircle}><MobileIcon name="close" color="#52606E" /></Pressable></View>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
                <View style={s.modalCard}>
                  <Text style={s.groupTitle}>TYPE</Text>
                  {["All", "Bug", "Support", "Delivery", "Feedback"].map((option, index) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: filter === option }} onPress={() => setFilter(option)} style={[s.option, index === 0 && { borderTopWidth: 0 }]}><Text style={s.optionText}>{option === "All" ? "All types" : option}</Text><View style={[s.radio, filter === option && s.radioSelected]}>{filter === option && <View style={s.radioCenter} />}</View></Pressable>)}
                </View>
                <View style={s.modalCard}>
                  <Text style={s.groupTitle}>PRIORITY</Text>
                  {["All priorities", "High", "Normal"].map((option, index) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: priority === option }} onPress={() => setPriority(option)} style={[s.option, index === 0 && { borderTopWidth: 0 }]}><Text style={s.optionText}>{option}</Text><View style={[s.radio, priority === option && s.radioSelected]}>{priority === option && <View style={s.radioCenter} />}</View></Pressable>)}
                </View>
              </ScrollView>
              <Pressable accessibilityRole="button" onPress={() => setFilterOpen(false)} style={s.apply}><Text style={s.applyText}>Show {matters.length} {matters.length === 1 ? "matter" : "matters"}</Text></Pressable>
            </View>
          </View>
        </FrostedModalBackdrop>
      </Modal>}
    </>}
  </>;
}
const s = StyleSheet.create({
  topRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { flexBasis: "46%", flexGrow: 1, borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", borderRadius: 18, padding: 14, gap: 6, overflow: "hidden" },
  tileTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 2 },
  tileIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  tileBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tileBadgeText: { fontSize: fontSizes.caption, fontWeight: "700" },
  tileValue: { fontSize: fontSizes.title, fontWeight: "700", color: "#192C40", letterSpacing: -0.6 },
  tileLabel: { fontSize: fontSizes.subbody, fontWeight: "600", color: "#445364" },
  tileCaption: { fontSize: fontSizes.caption, color: "#7C8590" },
  dayRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(218,208,198,0.45)" },
  dayDate: { width: 92, fontSize: fontSizes.subbody, color: "#66717E" },
  dayTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "#EEF2F7", overflow: "hidden" },
  dayFill: { height: "100%", borderRadius: 3, backgroundColor: "#417AC5" },
  healthIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  toolbar: { flexDirection: "row", gap: 10, alignItems: "center" }, search: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9, paddingLeft: 13, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", overflow: "hidden" }, searchInput: { flex: 1, minWidth: 0, minHeight: 46, color: "#192C40", fontSize: fontSizes.body }, close: { width: 44, height: 44, justifyContent: "center", alignItems: "center" }, closeText: { color: "#7C8590", fontSize: 22 },
  funnelButton: { width: 46, height: 46, borderRadius: buttonCornerRadius, borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", justifyContent: "center", alignItems: "center", overflow: "hidden" }, funnelSelected: { borderColor: "#D9E5F7" }, funnel: { alignItems: "center" }, funnelTop: { width: 0, height: 0, borderLeftWidth: 9, borderRightWidth: 9, borderTopWidth: 10, borderLeftColor: "transparent", borderRightColor: "transparent" }, funnelStem: { width: 3, height: 7, marginTop: -1, borderBottomRightRadius: 1 }, filterDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#28599B", position: "absolute", right: 8, top: 8 },
  pills: { gap: 7, paddingVertical: 2 }, pill: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "rgba(255,250,244,0.88)", borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", flexDirection: "row", alignItems: "center", gap: 6 }, pillText: { color: "#66717E", fontSize: fontSizes.subbody, fontWeight: "500" }, dot: { width: 6, height: 6, borderRadius: 3 }, countRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, countNumber: { color: "#192C40", fontWeight: "700" },
  overlay: { flex: 1, justifyContent: "flex-end" }, sheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 32, borderTopRightRadius: 32, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.96)", paddingHorizontal: 20, paddingTop: 10, maxHeight: "82%", gap: 14, overflow: "hidden" }, handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(101,86,77,0.28)", alignSelf: "center" }, sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, sheetEyebrow: { fontSize: fontSizes.caption, fontWeight: "700", letterSpacing: 1.1, color: "#4A5564", marginBottom: 2 }, sheetTitle: { color: "#192C40", fontWeight: "700", fontSize: fontSizes.heading }, closeCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#F5F1EC", borderWidth: 1, borderColor: "#E5DDD3", alignItems: "center", justifyContent: "center" }, modalCard: { backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1, borderColor: "#E5DDD3", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, overflow: "hidden" }, groupTitle: { color: "#4A5564", fontWeight: "700", fontSize: fontSizes.caption, letterSpacing: 1.1, marginBottom: 4 }, option: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 52, borderTopWidth: 1, borderTopColor: "rgba(218,208,198,0.45)" }, optionText: { color: "#192C40", fontSize: fontSizes.body, fontWeight: "600" }, radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: "#D8DDE3", alignItems: "center", justifyContent: "center" }, radioSelected: { borderColor: "#28599B" }, radioCenter: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#28599B" }, apply: { minHeight: 48, borderRadius: buttonCornerRadius, backgroundColor: "#9A3D2B", alignItems: "center", justifyContent: "center" }, applyText: { color: "white", fontWeight: "600", fontSize: fontSizes.body },
  small: { fontSize: fontSizes.subbody, color: "#7C8590", lineHeight: 19 }, ringRow: { flexDirection: "row", alignItems: "center", gap: 20 }, fact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "rgba(218,208,198,0.45)" }, value: { fontSize: fontSizes.body, color: "#192C40", fontWeight: "600" }, rowTitle: { color: "#192C40", fontWeight: "600", fontSize: fontSizes.body, lineHeight: 22 }, healthValue: { fontSize: fontSizes.title, fontWeight: "700", color: "#192C40" }, loadingBars: { flexDirection: "row", gap: 8, alignItems: "flex-end" }, loadColumn: { flex: 1, alignItems: "center", gap: 8 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 15, borderBottomColor: "rgba(218,208,198,0.45)", borderBottomWidth: 1 }, itemBadge: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", alignSelf: "flex-start", marginTop: 2 }, initials: { fontSize: fontSizes.subbody, fontWeight: "700" }, itemBody: { flex: 1, gap: 4 }, itemHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 }, stateBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7 }, stateText: { fontSize: fontSizes.caption, fontWeight: "600" }, chevron: { fontSize: 22, color: "#A1A8B1" }, emptyState: { paddingVertical: 20, alignItems: "center", gap: 6 }, reference: { fontSize: fontSizes.caption, color: "#7C8590" }, priority: { fontSize: fontSizes.caption, fontWeight: "600", color: "#806536", backgroundColor: "#FCF4E4", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7 }, clear: { minHeight: 44, justifyContent: "center" }, link: { color: "#417AC5", fontSize: fontSizes.subbody, fontWeight: "600" },
  exportRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(218,208,198,0.45)" },
  exportActions: { flexDirection: "row", gap: 6 },
  exportBtn: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: "#D8CFC4", backgroundColor: "#FFFFFF" },
  exportBtnPrimary: { backgroundColor: "#9A3D2B", borderColor: "#9A3D2B" },
  exportBtnText: { fontSize: fontSizes.caption, fontWeight: "700", color: "#192C40" },
  exportBtnPrimaryText: { fontSize: fontSizes.caption, fontWeight: "700", color: "#FFFFFF" },
});
