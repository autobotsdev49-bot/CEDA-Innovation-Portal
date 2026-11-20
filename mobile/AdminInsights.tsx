import { useState } from "react";
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { buttonCornerRadius } from "./theme";
import { Breakdown, InsightCard, MobileIcon, PeriodControl, PreviewLabel, Ring, TrafficChart, type InsightScreen, type MobileIconName } from "./AdminOverview";
import { previewEvents, previewMatters, reportingSnapshot, type ReportingPeriod } from "./adminPreview";

type Props = { screen: InsightScreen; period: ReportingPeriod; onPeriodChange: (period: ReportingPeriod) => void; inspect: (title: string, facts: [string, string][]) => void };
const followUpStatuses: Record<string, { color: string; tint: string }> = {
  "All statuses": { color: "#FFFFFF", tint: "#192C40" },
  Open: { color: "#903925", tint: "#FBEDE8" },
  Investigating: { color: "#94702D", tint: "#FCF4E4" },
  Resolved: { color: "#236D61", tint: "#E4F4F0" },
};
const activityRoles: { value: string; label: string; color: string; tint: string }[] = [
  { value: "All", label: "All roles", color: "#66717E", tint: "#F1F3F6" },
  { value: "Administrator", label: "Administrators", color: "#903925", tint: "#FBEDE8" },
  { value: "Support Officer", label: "Support Officers", color: "#236D61", tint: "#E4F4F0" },
  { value: "Innovator", label: "Innovators", color: "#28599B", tint: "#EAF1FC" },
  { value: "System", label: "System", color: "#695198", tint: "#F0ECFB" },
];

function SummaryTile({ label, value, caption, icon, color, badge }: { label: string; value: string; caption: string; icon: MobileIconName; color: string; badge?: string }) {
  return <View style={s.tile}>
    <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFill} />
    <View style={s.tileTop}>
      <View style={[s.tileIcon, { backgroundColor: color + "16" }]}><MobileIcon name={icon} color={color} /></View>
      {badge && <View style={[s.tileBadge, { backgroundColor: color + "16" }]}><Text style={[s.tileBadgeText, { color }]}>{badge}</Text></View>}
    </View>
    <Text style={s.tileValue}>{value}</Text>
    <Text style={s.tileLabel}>{label}</Text>
    <Text style={s.tileCaption}>{caption}</Text>
  </View>;
}

export function AdminInsights({ screen, period, onPeriodChange, inspect }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [state, setState] = useState("All statuses");
  const [priority, setPriority] = useState("All priorities");
  const [filterOpen, setFilterOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const snapshot = reportingSnapshot(period);
  const maxDayViews = Math.max(1, ...snapshot.days.map(day => day.views));
  const matters = previewMatters.filter(item => (filter === "All" || item.kind === filter) && (state === "All statuses" || item.state === state) && (priority === "All priorities" || item.priority === priority) && (item.title + item.reporter + item.id).toLowerCase().includes(query.trim().toLowerCase()));
  const hasFilters = !!query.trim() || filter !== "All" || state !== "All statuses" || priority !== "All priorities";
  const reset = () => { setQuery(""); setFilter("All"); setState("All statuses"); setPriority("All priorities"); };
  const events = previewEvents.filter(item => (filter === "All" || item.role === filter) && (item.actor + item.title + item.record).toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <View style={s.topRow}>
      <PreviewLabel />
      {screen === "Portal analytics" && <PeriodControl value={period} onChange={onPeriodChange} />}
    </View>
    {screen === "Portal analytics" && <>
      <View style={s.tileGrid}>
        <SummaryTile label="Total page views" value={snapshot.views.toLocaleString("en-BW")} caption={period === 1 ? "Today's window" : `Last ${period} days`} icon="traffic" color="#417AC5" badge="Sample" />
        <SummaryTile label="Active visitors" value={String(snapshot.active)} caption="Last 5 minutes" icon="people" color="#278477" badge="Live preview" />
        <SummaryTile label="Primary device" value="64%" caption="Mobile traffic share" icon="globe" color="#695198" badge="Mobile" />
        <SummaryTile label="Top destination" value="Home" caption="Popularity index 64/100" icon="application" color="#9A3D2B" badge="Index" />
      </View>
      <InsightCard title="Audience over time"><TrafficChart period={period} line /><Text style={s.small}>{snapshot.days[0].date} to 2026-11-20 · sample reporting window</Text></InsightCard>
      <InsightCard title="Device breakdown"><View style={s.ringRow}><Ring segments={[{ value: 64, color: "#417AC5" }, { value: 30, color: "#9DBCE4" }, { value: 6, color: "#D7A65C" }]} center="64%" label="Mobile" /><Breakdown maxValue={100} entries={[{ label: "Mobile (%)", value: 64, color: "#417AC5" }, { label: "Desktop (%)", value: 30, color: "#9DBCE4" }, { label: "Tablet (%)", value: 6, color: "#D7A65C" }]} /></View><Text style={s.small}>Illustrative device snapshot, independent of period.</Text></InsightCard>
      <InsightCard title="Popular pages"><Breakdown maxValue={100} entries={[{ label: "Home", value: 64, color: "#417AC5" }, { label: "How it works", value: 42, color: "#6996D0" }, { label: "Eligibility", value: 28, color: "#9DBCE4" }, { label: "Help", value: 16, color: "#C7D8EE" }]} /><Text style={s.small}>Sample popularity index out of 100, not page-view counts.</Text></InsightCard>
      <InsightCard title="Daily page views">{snapshot.days.map((day, index) => <View key={day.date} style={[s.dayRow, index === snapshot.days.length - 1 && { borderBottomWidth: 0 }]}><Text style={s.dayDate}>{day.date}</Text><View style={s.dayTrack}><View style={[s.dayFill, { width: `${Math.max(10, day.views / maxDayViews * 100)}%` }]} /></View><Text style={s.value}>{day.views}</Text></View>)}</InsightCard>
    </>}
    {screen === "Website health" && <>
      <View style={s.tileGrid}>
        <SummaryTile label="Main content load" value="2.1 s" caption="Largest Contentful Paint" icon="pulse" color="#278477" badge="Good" />
        <SummaryTile label="Interaction response" value="168 ms" caption="Interaction to Next Paint" icon="clock" color="#417AC5" badge="Fast" />
        <SummaryTile label="Visual stability" value="0.08" caption="Cumulative Layout Shift" icon="check" color="#236D61" badge="Stable" />
        <SummaryTile label="Request failures" value="3" caption="Latest sample snapshot" icon="alert" color="#B1873E" badge="Sample" />
      </View>
      <InsightCard title="Speed & stability">{[["Main content load", "2.1 s", "Largest Contentful Paint", "#278477", "#E4F4F0"], ["Interaction response", "168 ms", "Interaction to Next Paint", "#28599B", "#EAF1FC"], ["Visual stability", "0.08", "Cumulative Layout Shift", "#236D61", "#E4F4F0"], ["Request failures", "3", "Latest sample snapshot", "#94702D", "#FCF4E4"]].map(([label, value, note, color, tint], index) => <View key={label} style={[s.fact, index === 3 && { borderBottomWidth: 0 }]}><View style={[s.healthIcon, { backgroundColor: tint }]}><MobileIcon name={index === 3 ? "alert" : "pulse"} color={color} /></View><View style={{ flex: 1, gap: 3 }}><Text style={s.rowTitle}>{label}</Text><Text style={s.small}>{note}</Text></View><Text style={s.healthValue}>{value}</Text></View>)}</InsightCard>
      <InsightCard title="Loading speed · sample week"><View style={s.loadingBars}>{[2.6, 2.4, 2.5, 2.2, 2.3, 2.0, 2.1].map((value, index) => <View key={index} accessible accessibilityLabel={"November " + (14 + index) + ": " + value + " seconds"} style={s.loadColumn}><Text style={s.small}>{value.toFixed(1)}</Text><View style={{ height: value / 3 * 100, width: "70%", borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: index === 6 ? "#278477" : "#B7D7D1" }} /><Text style={s.small}>{14 + index}</Text></View>)}</View><Text style={s.small}>14–20 November · main content load in seconds.</Text></InsightCard>
      <InsightCard title="What the measurements mean"><Text style={s.small}>Main content load measures when the page's main content appears. Interaction response measures how quickly a page reacts. Visual stability measures unexpected shifts in visible content.</Text><Text style={s.small}>Server response starts after 540 ms in this sample. These measures are illustrative, not a live health check.</Text></InsightCard>
    </>}
    {(screen === "Follow-ups" || screen === "Activity log") && <>
      {screen === "Follow-ups" ? <>
        <View style={s.toolbar}>
          <View style={s.search}><BlurView intensity={25} tint="light" style={StyleSheet.absoluteFill} /><MobileIcon name="search" color="#8B929C" /><TextInput accessibilityLabel="Search issue or reporter" value={query} onChangeText={setQuery} placeholder="Search issue or reporter" placeholderTextColor="#8B929C" autoCorrect={false} maxLength={100} returnKeyType="search" style={s.searchInput} />{!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear follow-up search" onPress={() => setQuery("")} style={s.close}><Text style={s.closeText}>×</Text></Pressable>}</View>
          <Pressable accessibilityRole="button" accessibilityLabel={"Filter by type and priority. " + filter + ", " + priority} accessibilityState={{ expanded: filterOpen }} onPress={() => { Keyboard.dismiss(); setFilterOpen(true); }} style={[s.funnelButton, (filter !== "All" || priority !== "All priorities") && s.funnelSelected]}><BlurView intensity={25} tint="light" style={StyleSheet.absoluteFill} /><View accessible={false} style={s.funnel}><View style={[s.funnelTop, { borderTopColor: filter === "All" && priority === "All priorities" ? "#66717E" : "#28599B" }]} /><View style={[s.funnelStem, { backgroundColor: filter === "All" && priority === "All priorities" ? "#66717E" : "#28599B" }]} /></View>{(filter !== "All" || priority !== "All priorities") && <View style={s.filterDot} />}</Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>{["All statuses", "Open", "Investigating", "Resolved"].map(option => { const appearance = followUpStatuses[option]; return <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: state === option }} onPress={() => setState(option)} style={[s.pill, state === option && { backgroundColor: appearance.tint }]}>{option !== "All statuses" && <View style={[s.dot, { backgroundColor: appearance.color }]} />}<Text style={[s.pillText, state === option && { color: appearance.color, fontWeight: "700" }]}>{option === "All statuses" ? "All" : option}</Text></Pressable>; })}</ScrollView>
        <View style={s.countRow}><Text accessibilityLiveRegion="polite" style={s.small}><Text style={s.countNumber}>{matters.length}</Text> sample {matters.length === 1 ? "matter" : "matters"}{filter !== "All" ? " · " + filter : ""}{priority !== "All priorities" ? " · " + priority + " priority" : ""}</Text>{hasFilters && <Pressable accessibilityRole="button" style={s.clear} onPress={reset}><Text style={s.link}>Clear filters</Text></Pressable>}</View>
      </> : <>
        <View style={s.toolbar}>
          <View style={s.search}><BlurView intensity={25} tint="light" style={StyleSheet.absoluteFill} /><MobileIcon name="search" color="#8B929C" /><TextInput accessibilityLabel="Search actor, action or record" value={query} onChangeText={setQuery} placeholder="Search actor, action or record" placeholderTextColor="#8B929C" autoCorrect={false} maxLength={100} returnKeyType="search" style={s.searchInput} />{!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear activity search" onPress={() => setQuery("")} style={s.close}><Text style={s.closeText}>×</Text></Pressable>}</View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>{activityRoles.map(option => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: filter === option.value }} onPress={() => setFilter(option.value)} style={[s.pill, filter === option.value && { backgroundColor: option.value === "All" ? "#192C40" : option.tint }]}>{option.value !== "All" && <View style={[s.dot, { backgroundColor: option.color }]} />}<Text style={[s.pillText, filter === option.value && { color: option.value === "All" ? "white" : option.color, fontWeight: "700" }]}>{option.label}</Text></Pressable>)}</ScrollView>
        <View style={s.countRow}><Text accessibilityLiveRegion="polite" style={s.small}><Text style={s.countNumber}>{events.length}</Text> sample {events.length === 1 ? "event" : "events"}{filter !== "All" ? " · " + filter : ""}</Text>{hasFilters && <Pressable accessibilityRole="button" style={s.clear} onPress={reset}><Text style={s.link}>Clear filters</Text></Pressable>}</View>
      </>}
      {screen === "Follow-ups" && <InsightCard title="Reported matters">{matters.length ? matters.map((item, index) => {
        const stateVisual = followUpStatuses[item.state] ?? followUpStatuses.Open;
        return <Pressable key={item.id} accessibilityRole="button" style={({ pressed }) => [s.itemRow, index === matters.length - 1 && { borderBottomWidth: 0 }, pressed && { backgroundColor: "rgba(244,246,249,0.75)" }]} onPress={() => inspect(item.title, [["Reference", item.id], ["Type", item.kind], ["Reported by", item.reporter], ["Owner", item.owner], ["Priority", item.priority], ["Status", item.state], ["Report", item.detail]])}>
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
      {screen === "Activity log" && <InsightCard title="Who did what">{events.length ? events.map((item, index) => {
        const roleVisual = activityRoles.find(option => option.value === item.role) ?? activityRoles[0];
        return <Pressable key={item.record} accessibilityRole="button" style={({ pressed }) => [s.itemRow, index === events.length - 1 && { borderBottomWidth: 0 }, pressed && { backgroundColor: "rgba(244,246,249,0.75)" }]} onPress={() => inspect(item.title, [["Actor", item.actor], ["Role", item.role], ["Action", item.title], ["Record", item.record], ["When", item.date + " " + item.time + " CAT"], ["Details", item.detail]])}>
          <View style={[s.itemBadge, { backgroundColor: roleVisual.tint }]}><Text style={[s.initials, { color: roleVisual.color }]}>{item.actor.split(" ").slice(-1)[0].slice(0, 2).toUpperCase()}</Text></View>
          <View style={s.itemBody}>
            <View style={s.itemHeader}><Text style={s.reference}>{item.record}</Text><Text style={s.reference}>{item.date} · {item.time} CAT</Text></View>
            <Text style={s.rowTitle}>{item.title}</Text>
            <Text style={s.small}>{item.actor}</Text>
            <View style={s.tagRow}><View style={[s.stateBadge, { backgroundColor: roleVisual.tint }]}><Text style={[s.stateText, { color: roleVisual.color }]}>{item.role}</Text></View></View>
          </View>
          <Text accessible={false} style={s.chevron}>{"\u203a"}</Text>
        </Pressable>;
      }) : <View style={s.emptyState}><Text style={s.rowTitle}>No activity matches these filters</Text><Text style={s.small}>Try clearing your search or selecting All roles.</Text></View>}</InsightCard>}
      {screen === "Follow-ups" && <Modal visible={filterOpen} transparent statusBarTranslucent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <View style={s.overlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close follow-up filters" onPress={() => setFilterOpen(false)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 22) }]}>
            <BlurView intensity={55} tint="light" style={StyleSheet.absoluteFill} />
            <View style={s.handle} />
            <View style={s.sheetHeader}><View><Text style={s.sheetEyebrow}>FOLLOW-UPS</Text><Text accessibilityRole="header" style={s.sheetTitle}>Filter follow-ups</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close follow-up filters" onPress={() => setFilterOpen(false)} style={s.closeCircle}><MobileIcon name="close" color="#52606E" /></Pressable></View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
              <View style={s.modalCard}>
                <Text style={s.groupTitle}>TYPE</Text>
                {["All", "Bug", "Support", "Delivery"].map((option, index) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: filter === option }} onPress={() => setFilter(option)} style={[s.option, index === 0 && { borderTopWidth: 0 }]}><Text style={s.optionText}>{option === "All" ? "All types" : option}</Text><View style={[s.radio, filter === option && s.radioSelected]}>{filter === option && <View style={s.radioCenter} />}</View></Pressable>)}
              </View>
              <View style={s.modalCard}>
                <Text style={s.groupTitle}>PRIORITY</Text>
                {["All priorities", "High", "Normal"].map((option, index) => <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: priority === option }} onPress={() => setPriority(option)} style={[s.option, index === 0 && { borderTopWidth: 0 }]}><Text style={s.optionText}>{option}</Text><View style={[s.radio, priority === option && s.radioSelected]}>{priority === option && <View style={s.radioCenter} />}</View></Pressable>)}
              </View>
            </ScrollView>
            <Pressable accessibilityRole="button" onPress={() => setFilterOpen(false)} style={s.apply}><Text style={s.applyText}>Show {matters.length} {matters.length === 1 ? "matter" : "matters"}</Text></Pressable>
          </View>
        </View>
      </Modal>}
    </>}
  </>;
}
const s = StyleSheet.create({
  topRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { flexBasis: "46%", flexGrow: 1, backgroundColor: "rgba(255,255,255,0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.92)", borderRadius: 18, padding: 14, gap: 6, overflow: "hidden" },
  tileTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 2 },
  tileIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  tileBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tileBadgeText: { fontSize: 9, fontWeight: "700" },
  tileValue: { fontSize: 22, fontWeight: "700", color: "#192C40", letterSpacing: -0.6 },
  tileLabel: { fontSize: 12, fontWeight: "600", color: "#445364" },
  tileCaption: { fontSize: 10, color: "#7C8590" },
  dayRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#EEF1F5" },
  dayDate: { width: 84, fontSize: 11, color: "#66717E" },
  dayTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "#EEF2F7", overflow: "hidden" },
  dayFill: { height: "100%", borderRadius: 3, backgroundColor: "#417AC5" },
  healthIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  toolbar: { flexDirection: "row", gap: 10, alignItems: "center" }, search: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9, backgroundColor: "rgba(255,255,255,0.82)", paddingLeft: 13, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.92)", overflow: "hidden" }, searchInput: { flex: 1, minWidth: 0, minHeight: 46, color: "#192C40", fontSize: 13 }, close: { width: 44, height: 44, justifyContent: "center", alignItems: "center" }, closeText: { color: "#7C8590", fontSize: 22 },
  funnelButton: { width: 46, height: 46, borderRadius: buttonCornerRadius, backgroundColor: "rgba(255,255,255,0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.92)", justifyContent: "center", alignItems: "center", overflow: "hidden" }, funnelSelected: { backgroundColor: "rgba(234,241,252,0.92)", borderColor: "#D9E5F7" }, funnel: { alignItems: "center" }, funnelTop: { width: 0, height: 0, borderLeftWidth: 9, borderRightWidth: 9, borderTopWidth: 10, borderLeftColor: "transparent", borderRightColor: "transparent" }, funnelStem: { width: 3, height: 7, marginTop: -1, borderBottomRightRadius: 1 }, filterDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#28599B", position: "absolute", right: 8, top: 8 },
  pills: { gap: 7, paddingVertical: 2 }, pill: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.78)", borderWidth: 1, borderColor: "rgba(255,255,255,0.88)", flexDirection: "row", alignItems: "center", gap: 6 }, pillText: { color: "#66717E", fontSize: 12, fontWeight: "500" }, dot: { width: 5, height: 5, borderRadius: 3 }, countRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, countNumber: { color: "#192C40", fontWeight: "700" },
  overlay: { flex: 1, backgroundColor: "rgba(15,28,42,0.42)", justifyContent: "flex-end" }, sheet: { backgroundColor: "rgba(255,255,255,0.93)", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.96)", paddingHorizontal: 20, paddingTop: 10, maxHeight: "82%", gap: 14, overflow: "hidden" }, handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#D8DEE6", alignSelf: "center" }, sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, sheetEyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.2, color: "#7C8590", marginBottom: 2 }, sheetTitle: { color: "#192C40", fontWeight: "700", fontSize: 19 }, closeCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(241,244,248,0.9)", alignItems: "center", justifyContent: "center" }, modalCard: { backgroundColor: "rgba(255,255,255,0.88)", borderRadius: 20, borderWidth: 1, borderColor: "#E8ECF2", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, overflow: "hidden" }, groupTitle: { color: "#7C8590", fontWeight: "700", fontSize: 10, letterSpacing: 1.1, marginBottom: 4 }, option: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 52, borderTopWidth: 1, borderTopColor: "#EEF1F5" }, optionText: { color: "#192C40", fontSize: 13, fontWeight: "600" }, radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: "#D8DDE3", alignItems: "center", justifyContent: "center" }, radioSelected: { borderColor: "#28599B" }, radioCenter: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#28599B" }, apply: { minHeight: 48, borderRadius: buttonCornerRadius, backgroundColor: "#9A3D2B", alignItems: "center", justifyContent: "center" }, applyText: { color: "white", fontWeight: "600", fontSize: 13 },
  small: { fontSize: 11, color: "#7C8590", lineHeight: 18 }, ringRow: { flexDirection: "row", alignItems: "center", gap: 20 }, fact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#EEF1F5" }, value: { fontSize: 13, color: "#192C40", fontWeight: "600" }, rowTitle: { color: "#192C40", fontWeight: "600", fontSize: 14, lineHeight: 20 }, healthValue: { fontSize: 21, fontWeight: "700", color: "#192C40" }, loadingBars: { flexDirection: "row", gap: 8, alignItems: "flex-end" }, loadColumn: { flex: 1, alignItems: "center", gap: 8 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomColor: "#EEF1F5", borderBottomWidth: 1 }, itemBadge: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", alignSelf: "flex-start", marginTop: 2 }, initials: { fontSize: 13, fontWeight: "700" }, itemBody: { flex: 1, gap: 4 }, itemHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 }, stateBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }, stateText: { fontSize: 9, fontWeight: "600" }, chevron: { fontSize: 22, color: "#A1A8B1" }, emptyState: { paddingVertical: 20, alignItems: "center", gap: 6 }, reference: { fontSize: 10, color: "#7C8590" }, priority: { fontSize: 10, fontWeight: "600", color: "#806536", backgroundColor: "#FCF4E4", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 7 }, clear: { minHeight: 44, justifyContent: "center" }, link: { color: "#417AC5", fontSize: 12, fontWeight: "600" },
});
