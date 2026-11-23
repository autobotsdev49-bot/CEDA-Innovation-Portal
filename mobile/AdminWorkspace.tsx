import { buttonCornerRadius, fontSizes } from "./theme";
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from "react";
import { ActivityIndicator, BackHandler, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FrostedModalBackdrop, FrostedScreenBackdrop, FrostedSurface } from "./FrostedGlass";
import { AdminOverview, InsightCard, MobileIcon, PreviewLabel, type InsightScreen, type MobileIconName } from "./AdminOverview";
import { AdminInnovations } from "./AdminInnovations";
import { AdminUserEditor } from "./AdminUserEditor";
import { AdminUsers } from "./AdminUsers";
import { AdminInsights } from "./AdminInsights";
import { previewApplications, previewMatters, type ReportingPeriod } from "./adminPreview";
import { portalUrl, readAdminApplications, readAdminRecords, type Account, type AdminApplication, type AdminSector, type AdminUser } from "./auth";

const colors = { navy: "#192C40", rust: "#9A3D2B", teal: "#278477", blue: "#28599B", muted: "#66717E", subtle: "#7C8590", line: "#E5DDD3", canvas: "#F7F2EB" };
const tabs = ["Overview", "Users", "Innovations", "Follow-ups", "More"] as const;
const extras = ["Sectors", "Support", "Optimus Prime", "Feedback & insights", "Audit logs", "Account security", "Portal analytics", "Website health", "Activity log"] as const;
type Screen = typeof tabs[number] | typeof extras[number];
type ExtraScreen = typeof extras[number];

const extraMeta: Record<ExtraScreen, { icon: MobileIconName; color: string; tint: string; badge: string; category: string; detail: string; summary: string }> = {
  Sectors: { icon: "sector", color: "#236D61", tint: "#E4F4F0", badge: "Directory", category: "OPERATIONS & DIRECTORY", detail: "Sector directory and application breakdown", summary: "Protected sector directory · application counts await the submission API." },
  Support: { icon: "support", color: "#28599B", tint: "#EAF1FC", badge: "Handoffs", category: "OPERATIONS & DIRECTORY", detail: "Human handoffs and conversations", summary: "Human escalation rules, support inbox readiness and role boundaries." },
  "Optimus Prime": { icon: "ai", color: "#695198", tint: "#F0ECFB", badge: "98.6% reply", category: "OPERATIONS & DIRECTORY", detail: "AI performance and guidance drafts", summary: "Monitor assistant latency and prepare in-memory response guidance drafts." },
  "Portal analytics": { icon: "traffic", color: "#417AC5", tint: "#EAF1FC", badge: "Traffic", category: "INSIGHTS & MONITORING", detail: "Audience, devices and popular pages", summary: "Illustrative portal traffic, device distribution and page popularity." },
  "Website health": { icon: "pulse", color: "#278477", tint: "#E4F4F0", badge: "2.1s load", category: "INSIGHTS & MONITORING", detail: "Loading speed, responsiveness and errors", summary: "Core loading speed, responsiveness and stability snapshots." },
  "Feedback & insights": { icon: "feedback", color: "#94702D", tint: "#FCF4E4", badge: "Service", category: "INSIGHTS & MONITORING", detail: "Feedback trends and service insights", summary: "Service quality dimensions and applicant feedback readiness." },
  "Activity log": { icon: "clock", color: "#28599B", tint: "#EAF1FC", badge: "Events", category: "GOVERNANCE & SECURITY", detail: "Who did what, and when", summary: "Chronological operational activity across portal roles." },
  "Audit logs": { icon: "audit", color: "#903925", tint: "#FBEDE8", badge: "Protected", category: "GOVERNANCE & SECURITY", detail: "Privileged changes and event history", summary: "Server-recorded privileged mutations and mandatory audit reasons." },
  "Account security": { icon: "shield", color: "#236D61", tint: "#E4F4F0", badge: "MFA", category: "GOVERNANCE & SECURITY", detail: "Authenticator and session controls", summary: "In-memory session protection and AAL2 authenticator verification." },
};

const moreSections: { title: string; items: ExtraScreen[] }[] = [
  { title: "OPERATIONS & DIRECTORY", items: ["Sectors", "Support", "Optimus Prime"] },
  { title: "INSIGHTS & MONITORING", items: ["Portal analytics", "Website health", "Feedback & insights"] },
  { title: "GOVERNANCE & SECURITY", items: ["Activity log", "Audit logs", "Account security"] },
];

const sectorStatuses = [
  { value: "All", label: "All", color: "#66717E", tint: "#F1F3F6" },
  { value: "published", label: "Published", color: "#236D61", tint: "#E4F4F0" },
  { value: "draft", label: "Draft", color: "#94702D", tint: "#FCF4E4" },
  { value: "archived", label: "Archived", color: "#903925", tint: "#FBEDE8" },
];

const badgeColors: Record<string, [string, string]> = {
  admin: ["#FBEDE8", "#903925"], innovator: ["#EAF1FC", "#28599B"], assessor: ["#F0ECFB", "#695198"], support: ["#E4F4F0", "#236D61"],
  Lead: ["#FFF3D8", "#795B17"], active: ["#E4F4F0", "#236D61"], Approved: ["#E4F4F0", "#236D61"], published: ["#E4F4F0", "#236D61"],
  draft: ["#FCF4E4", "#94702D"], archived: ["#FBEDE8", "#903925"],
  "In review": ["#FFF3D8", "#795B17"], Rejected: ["#FBEDE8", "#903925"], Submitted: ["#EAF1FC", "#28599B"],
};
type SampleCase = AdminApplication;
type Sheet = { title: string; eyebrow?: string; kind: "notifications" | "insight" | "sector" | "case" | "guidance" | "knowledge" | "review"; sector?: AdminSector; item?: SampleCase; facts?: [string, string][] };

function Button({ title, onPress, secondary = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondary, (disabled || pressed) && { opacity: 0.6 }]}><Text style={[s.buttonText, secondary && { color: colors.navy }]}>{title}</Text></Pressable>;
}
function Badge({ value, label }: { value: string; label?: string }) {
  const [backgroundColor, color] = badgeColors[value] ?? ["#EEF0F2", "#52606C"];
  return <View style={[s.badge, { backgroundColor }]}><View style={[s.badgeDot, { backgroundColor: color }]} /><Text style={[s.badgeText, { color }]}>{label ?? value}</Text></View>;
}
function GlassCard({ children }: { children: ReactNode }) {
  return <View style={s.card}><FrostedSurface variant="card" borderRadius={20} />{children}</View>;
}
function Heading({ children }: { children: ReactNode }) { return <Text accessibilityRole="header" style={s.heading}>{children}</Text>; }
function Note({ children }: { children: ReactNode }) { return <Text style={s.note}>{children}</Text>; }
function MetricTiles({ entries }: { entries: { label: string; value: string; caption: string; icon: MobileIconName; color: string }[] }) {
  return <View style={s.stats}>{entries.map(item => <View style={s.stat} key={item.label}>
    <FrostedSurface variant="card" borderRadius={18} />
    <View style={[s.statIcon, { backgroundColor: item.color + "16" }]}><MobileIcon name={item.icon} color={item.color} /></View>
    <Text style={s.statValue}>{item.value}</Text>
    <Text style={s.statLabel}>{item.label}</Text>
    <Text style={s.statCaption}>{item.caption}</Text>
  </View>)}</View>;
}
function Fact({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <View style={[s.fact, last && { borderBottomWidth: 0 }]}><Text style={s.factLabel}>{label}</Text><Text style={s.factValue}>{value}</Text></View>;
}
function IconRow({ title, detail, icon, color = colors.blue, tint = "#EAF1FC", badge, last = false, onPress, children }: {
  title: string; detail?: string; icon: MobileIconName; color?: string; tint?: string; badge?: string; last?: boolean; onPress?: () => void; children?: ReactNode;
}) {
  const content = <>
    <View accessible={false} style={[s.rowIcon, { backgroundColor: tint }]}><MobileIcon name={icon} color={color} /></View>
    <View style={s.rowBody}>
      <View style={s.rowTop}><Text style={s.rowTitle}>{title}</Text>{badge && <View style={[s.rowBadge, { backgroundColor: tint }]}><Text style={[s.rowBadgeText, { color }]}>{badge}</Text></View>}</View>
      {detail && <Text style={s.note}>{detail}</Text>}
      {children && <View style={s.tags}>{children}</View>}
    </View>
    {onPress && <Text style={s.chevron} accessible={false}>›</Text>}
  </>;
  if (!onPress) return <View style={[s.row, last && { borderBottomWidth: 0 }]}>{content}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={"Open " + title} onPress={onPress} style={({ pressed }) => [s.row, last && { borderBottomWidth: 0 }, pressed && { backgroundColor: "rgba(244,246,249,0.75)" }]}>{content}</Pressable>;
}
function Field({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return <View style={s.field}><Text style={s.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} multiline={multiline} maxLength={4000} style={[s.input, multiline && s.multiline]} placeholderTextColor={colors.subtle} /></View>;
}
function Bars({ values, labels, color = colors.teal }: { values: number[]; labels: string[]; color?: string }) {
  const max = Math.max(...values, 1);
  return <View accessible accessibilityLabel={"Sample chart. " + labels.map((label, index) => `${label}: ${values[index]}`).join(", ")} style={s.chart}>{values.map((value, index) => <View key={labels[index]} style={s.barColumn}><Text style={s.barValue}>{(value / 1000).toFixed(1)}s</Text><View style={s.barTrack}><View style={{ height: Math.max(6, value / max * 104), backgroundColor: index === values.length - 1 ? color : color + "88", width: "100%", borderTopLeftRadius: 6, borderTopRightRadius: 6 }} /></View><Text style={s.barLabel}>{labels[index]}</Text></View>)}</View>;
}

function TabIcon({ index, selected }: { index: number; selected: boolean }) {
  const color = selected ? colors.rust : colors.muted;
  return <View accessible={false} style={s.navIcon}>
    {index === 0 && <View style={s.iconBars}>{[9, 18, 13].map((height, i) => <View key={i} style={{ width: 4, height, backgroundColor: color, borderRadius: 1 }} />)}</View>}
    {index === 1 && <><View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.6, borderColor: color }} /><View style={{ width: 17, height: 9, borderTopLeftRadius: 9, borderTopRightRadius: 9, borderWidth: 1.6, borderColor: color, marginTop: 2 }} /></>}
    {index === 2 && <><View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 1.6, borderColor: color }} /><View style={{ width: 7, height: 4, borderBottomWidth: 2, borderColor: color, marginTop: 2 }} /></>}
    {index === 3 && <View style={{ borderWidth: 1.6, borderColor: color, borderRadius: 3, padding: 3, gap: 3 }}>{[1, 2, 3].map(line => <View key={line} style={{ width: 11, height: 1.6, backgroundColor: color }} />)}</View>}
    {index === 4 && <View style={s.iconBars}>{[1, 2, 3].map(dot => <View key={dot} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }} />)}</View>}
  </View>;
}

export function AdminWorkspace({ account, onSignOut, onAccountChange }: { account: Account; onSignOut: () => void; onAccountChange: (account: Account) => void }) {
  const [userEditor, setUserEditor] = useState<AdminUser | "create" | null>(null);
  const [userNotice, setUserNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [period, setPeriod] = useState<ReportingPeriod>(7);
  const [screen, setScreen] = useState<Screen>("Overview");
  const [parentScreen, setParentScreen] = useState<"Overview" | "More">("More");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("All");
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(0);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [sectors, setSectors] = useState<AdminSector[]>([]);
  const [cases, setCases] = useState<AdminApplication[]>(previewApplications);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [linkError, setLinkError] = useState("");
  const [draftNotice, setDraftNotice] = useState("");
  const [draft, setDraft] = useState({ tone: "Clear and professional", length: "Balanced", instructions: "", handoff: "", source: "", notes: "", questions: "" });
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const insets = useSafeAreaInsets();
  const nested = extras.includes(screen as ExtraScreen);
  const activeMeta = nested ? extraMeta[screen as ExtraScreen] : null;
  const openAlertsCount = previewMatters.filter(item => item.state !== "Resolved").length;
  const sessionExpiry = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Gaborone" }).format(new Date(account.expiresAt)) + " CAT";
  const adminInitials = (account.name || "Admin").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();

  const navigate = (next: Screen, from?: "Overview" | "More") => {
    if (extras.includes(next as ExtraScreen)) {
      setParentScreen(from ?? (screen === "Overview" ? "Overview" : "More"));
    }
    setUserNotice(""); setMenuOpen(false); setWorkspaceSearch(""); setSheet(null); setScreen(next);
    setQuery(""); setSearch(""); setStatus("All"); setRole("All"); setPage(0); setError(""); setLinkError("");
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const goBack = () => navigate(nested ? parentScreen : "Overview");

  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (sheet) { setSheet(null); return true; }
      if (menuOpen) { setMenuOpen(false); return true; }
      if (screen !== "Overview") { goBack(); return true; }
      return false;
    });
    return () => listener.remove();
  });

  useEffect(() => {
    if (screen !== "Innovations") return;
    let active = true;
    setLoading(true); setError("");
    void readAdminApplications(account).then(records => { if (active) setCases(records.length ? records : previewApplications); })
      .catch((reason: unknown) => { if (active) { setCases(previewApplications); setError(reason instanceof Error ? reason.message : "Unable to load applications."); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [screen, attempt, account]);

  useEffect(() => {
    if (screen !== "Users" && screen !== "Sectors") return;
    let active = true;
    setLoading(true); setError(""); setUsers([]); setSectors([]);
    const request = screen === "Users" ? readAdminRecords(account, "users", search, page) : readAdminRecords(account, "sectors");
    void request.then(records => {
      if (!active) return;
      if (screen === "Users") setUsers(records as AdminUser[]); else setSectors(records as AdminSector[]);
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to connect. Retry in a moment."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [screen, search, page, attempt, account]);

  useEffect(() => {
    if (screen !== "Users" || query.trim() === search) return;
    const timer = setTimeout(() => { setLoading(true); setUsers([]); setPage(0); setSearch(query.trim()); }, 350);
    return () => clearTimeout(timer);
  }, [screen, query, search]);

  async function openWeb(section: string) {
    setLinkError("");
    try { await Linking.openURL(portalUrl + "/admin/#" + section); }
    catch { setLinkError("We couldn't open your browser. Try again."); }
  }

  const visibleSectors = sectors.filter(sector => (status === "All" || status === sector.status) && sector.name.toLowerCase().includes(query.trim().toLowerCase()));
  const publishedSectors = sectors.filter(sector => sector.status === "published").length;
  const otherSectors = Math.max(0, sectors.length - publishedSectors);
  const matchingScreens = [...tabs, ...extras].filter(item => item.toLowerCase().includes(workspaceSearch.trim().toLowerCase()));

  return <View style={s.screen}>
    <FrostedScreenBackdrop image={require("./assets/innovation.webp")} imageHeight={320}>
    <View style={s.header}>
      <FrostedSurface variant="bar" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nested ? "Back to " + parentScreen : "Open administration menu"}
        onPress={() => nested ? goBack() : setMenuOpen(true)}
        style={({ pressed }) => [s.headerAction, nested && s.backButton, pressed && { opacity: 0.7 }]}
      >
        <MobileIcon name={nested ? "back" : "menu"} color={colors.navy} />
      </Pressable>
      {nested ? (
        <View style={s.headerCenter}>
          <Text numberOfLines={1} style={s.headerEyebrow}>{parentScreen.toUpperCase()} / SUB-SCREEN</Text>
          <Text numberOfLines={1} style={s.brandTitle}>{screen}</Text>
        </View>
      ) : (
        <View style={s.brand}>
          <Image source={require("./assets/ceda.png")} resizeMode="contain" style={s.logo} accessibilityLabel="CEDA Innovation" />
          <View>
            <Text style={s.brandTitle}>Innovation</Text>
            <Text style={s.brandSubtitle}>Admin portal</Text>
          </View>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open notifications"
        onPress={() => setSheet({ title: "Notifications", eyebrow: "ADMINISTRATOR ALERTS", kind: "notifications" })}
        style={({ pressed }) => [s.headerAction, pressed && { opacity: 0.7 }]}
      >
        <MobileIcon name="bell" color={colors.navy} />
        {openAlertsCount > 0 && <View style={s.bellDot} />}
      </Pressable>
    </View>

    <ScrollView ref={scroll} style={s.content} contentContainerStyle={s.contentInner} keyboardShouldPersistTaps="handled">
      {(screen === "Overview" || screen === "More") && <>
        <View style={s.workspaceSearch}>
          <FrostedSurface variant="bar" borderRadius={24} />
          <MobileIcon name="search" color="#8B929C" />
          <TextInput
            accessibilityLabel="Search admin screens"
            placeholder="Search screens, tools & controls"
            placeholderTextColor="#8B929C"
            value={workspaceSearch}
            onChangeText={setWorkspaceSearch}
            returnKeyType="search"
            style={s.workspaceSearchInput}
          />
          {!!workspaceSearch && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setWorkspaceSearch("")} style={s.clearSearch}><Text style={s.clearText}>×</Text></Pressable>}
        </View>
        {!!workspaceSearch.trim() && <GlassCard>
          <Text style={s.sectionEyebrow}>QUICK JUMP</Text>
          {matchingScreens.length ? matchingScreens.map((item, index) => {
            const meta = extras.includes(item as ExtraScreen) ? extraMeta[item as ExtraScreen] : null;
            return <IconRow
              key={item}
              title={item}
              detail={meta?.detail ?? "Primary workspace tab"}
              icon={meta?.icon ?? "application"}
              color={meta?.color ?? colors.blue}
              tint={meta?.tint ?? "#EAF1FC"}
              badge={meta ? "Sub-screen" : "Tab"}
              last={index === matchingScreens.length - 1}
              onPress={() => navigate(item)}
            />;
          }) : <Note>No screens match your search.</Note>}
        </GlassCard>}
      </>}

      {nested && activeMeta && (
        <View style={s.subscreenHero}>
          <FrostedSurface variant="card" borderRadius={22} />
          <View style={s.subscreenTop}>
            <View style={[s.subscreenIcon, { backgroundColor: activeMeta.tint }]}>
              <MobileIcon name={activeMeta.icon} color={activeMeta.color} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.subscreenEyebrow}>{activeMeta.category}</Text>
              <Text accessibilityRole="header" style={s.subscreenTitle}>{screen}</Text>
            </View>
            <View style={[s.rowBadge, { backgroundColor: activeMeta.tint }]}>
              <Text style={[s.rowBadgeText, { color: activeMeta.color }]}>{activeMeta.badge}</Text>
            </View>
          </View>
          <Text style={s.note}>{activeMeta.summary}</Text>
        </View>
      )}

      {!!linkError && <Text accessibilityRole="alert" style={s.error}>{linkError}</Text>}
      {screen === "Overview" && <AdminOverview period={period} onPeriodChange={setPeriod} onNavigate={next => navigate(next, "Overview")} />}
      {(["Portal analytics", "Website health", "Follow-ups", "Activity log"] as string[]).includes(screen) && <AdminInsights key={screen} screen={screen as InsightScreen} period={period} onPeriodChange={setPeriod} inspect={(title, facts) => setSheet({ title, eyebrow: screen.toUpperCase(), kind: "insight", facts })} />}
      {screen === "Users" && <AdminUsers
        users={users} query={query} onQueryChange={setQuery} role={role} onRoleChange={setRole} status={status} onStatusChange={setStatus}
        loading={loading || query.trim() !== search} error={!!error} page={page}
        onPageChange={next => { setLoading(true); setUsers([]); setPage(next); }}
        onOpenUser={user => { setUserNotice(""); setUserEditor(user); }} onCreate={() => { setUserNotice(""); setUserEditor("create"); }} notice={userNotice}
      />}
      {screen === "Innovations" && <>{loading && <ActivityIndicator />}{!!error && <Pressable onPress={() => setAttempt(value => value + 1)}><Text>{error} Tap to retry.</Text></Pressable>}<AdminInnovations items={cases} query={query} onQueryChange={setQuery} status={status} onStatusChange={setStatus} onOpen={item => setSheet({ title: "Innovation details", eyebrow: item.id, kind: "case", item })} /></>}

      {screen === "More" && <>
        <View style={s.profileCard}>
          <FrostedSurface variant="sheet" borderRadius={22} />
          <View style={s.profileTop}>
            <View style={s.profileAvatar}><Text style={s.profileInitials}>{adminInitials}</Text></View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.eyebrow}>ADMINISTRATOR WORKSPACE</Text>
              <Text accessibilityRole="header" style={s.profileName}>{account.name}</Text>
              <View style={s.tags}>
                <Badge value="admin" label="Administrator" />
                <Badge value="active" label={"Expires " + sessionExpiry} />
              </View>
            </View>
          </View>
          <Text style={s.note}>Select any tool below to open its dedicated sub-screen. Your session stays in memory on this device.</Text>
          <View style={s.profileActions}>
            <Pressable accessibilityRole="button" onPress={() => navigate("Account security", "More")} style={s.profileQuickButton}>
              <MobileIcon name="shield" color={colors.teal} />
              <Text style={s.profileQuickText}>Account security</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onSignOut} style={s.profileSignOutButton}>
              <Text style={s.profileSignOutText}>Sign out</Text>
            </Pressable>
          </View>
        </View>

        {moreSections.map(section => (
          <View key={section.title} style={s.sectionBlock}>
            <Text style={s.sectionHeaderLabel}>{section.title}</Text>
            <GlassCard>
              {section.items.map((item, index) => {
                const meta = extraMeta[item];
                return <IconRow
                  key={item}
                  title={item}
                  detail={meta.detail}
                  icon={meta.icon}
                  color={meta.color}
                  tint={meta.tint}
                  badge={meta.badge}
                  last={index === section.items.length - 1}
                  onPress={() => navigate(item, "More")}
                />;
              })}
            </GlassCard>
          </View>
        ))}
      </>}

      {screen === "Sectors" && <>
        <View style={s.toolbar}>
          <View style={s.pillSearch}>
            <FrostedSurface variant="bar" borderRadius={24} />
            <MobileIcon name="search" color="#8B929C" />
            <TextInput
              accessibilityLabel="Search sectors"
              placeholder="Search sector directory"
              placeholderTextColor="#8B929C"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              style={s.pillSearchInput}
            />
            {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear sector search" onPress={() => setQuery("")} style={s.clearSearch}><Text style={s.clearText}>×</Text></Pressable>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Manage sectors on web" onPress={() => void openWeb("sectors")} style={s.webPillButton}>
            <FrostedSurface variant="bar" borderRadius={23} />
            <MobileIcon name="globe" color={colors.blue} />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>
          {sectorStatuses.map(option => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: status === option.value }}
              onPress={() => setStatus(option.value)}
              style={[s.chip, status === option.value && { backgroundColor: option.value === "All" ? colors.navy : option.tint, borderColor: option.value === "All" ? colors.navy : option.tint }]}
            >
              {option.value !== "All" && <View style={[s.badgeDot, { backgroundColor: option.color }]} />}
              <Text style={[s.chipText, status === option.value && { color: option.value === "All" ? "white" : option.color, fontWeight: "700" }]}>{option.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {!loading && !error && <>
          <MetricTiles entries={[
            { label: "Total sectors", value: String(sectors.length), caption: "Protected directory", icon: "sector", color: colors.teal },
            { label: "Published", value: String(publishedSectors), caption: "Open to innovators", icon: "check", color: "#236D61" },
            { label: "Draft / archived", value: String(otherSectors), caption: "Non-public statuses", icon: "audit", color: "#94702D" },
            { label: "Applications", value: "—", caption: "Awaiting submission API", icon: "application", color: colors.blue },
          ]} />
          <GlassCard>
            <View style={s.cardHeaderRow}>
              <Heading>Sector directory</Heading>
              {(status !== "All" || !!query.trim()) && <Pressable accessibilityRole="button" onPress={() => { setQuery(""); setStatus("All"); }}><Text style={s.inlineLink}>Clear filters</Text></Pressable>}
            </View>
            {visibleSectors.length ? visibleSectors.map((sector, index) => {
              const appearance = sectorStatuses.find(item => item.value === sector.status) ?? sectorStatuses[0];
              return <IconRow
                key={sector.id}
                title={sector.name}
                detail="Applications — · Approved — · In review — · Rejected —"
                icon="sector"
                color={appearance.color}
                tint={appearance.tint}
                last={index === visibleSectors.length - 1}
                onPress={() => setSheet({ title: sector.name, eyebrow: "SECTOR BREAKDOWN", kind: "sector", sector })}
              >
                <Badge value={sector.status} />
              </IconRow>;
            }) : <View style={s.emptyBox}><Text style={s.rowTitle}>No sectors match these filters</Text><Note>Try another status filter or clear your search query.</Note></View>}
          </GlassCard>
        </>}
        <Button title="Manage sectors on web" onPress={() => void openWeb("sectors")} secondary />
      </>}

      {screen === "Optimus Prime" && <>
        <PreviewLabel />
        <MetricTiles entries={[
          { label: "Successful responses", value: "98.6%", caption: "7-day sample completion", icon: "ai", color: "#695198" },
          { label: "Average response", value: "1.8s", caption: "Sample reply latency", icon: "clock", color: colors.teal },
          { label: "Human handoff", value: "Active", caption: "Escalation triggers ready", icon: "support", color: colors.blue },
          { label: "Session drafts", value: Object.values(draft).some(v => v.trim() && v !== "Clear and professional" && v !== "Balanced") ? "Edited" : "Default", caption: "In-memory configuration", icon: "application", color: colors.rust },
        ]} />
        <InsightCard title="Response time · sample week">
          <Note>Sample latency in seconds · successful responses do not measure answer accuracy.</Note>
          <Bars values={[2100, 1800, 2000, 1600, 1800, 1500, 1800]} labels={["M", "T", "W", "Th", "F", "Sa", "Su"]} color={colors.teal} />
        </InsightCard>
        <GlassCard>
          <Heading>Assistant workspace</Heading>
          <Note>Prepare response instructions and approved knowledge notes in this session before integration.</Note>
          <IconRow
            title="Response guidance"
            detail="Tone, answer length, instructions and escalation triggers"
            icon="ai"
            color="#695198"
            tint="#F0ECFB"
            badge={draft.tone}
            onPress={() => setSheet({ title: "Response guidance draft", eyebrow: "OPTIMUS PRIME", kind: "guidance" })}
          />
          <IconRow
            title="Knowledge & training preparation"
            detail="Approved sources, reviewed notes and example questions"
            icon="application"
            color={colors.blue}
            tint="#EAF1FC"
            badge="Sources"
            onPress={() => setSheet({ title: "Knowledge draft", eyebrow: "OPTIMUS PRIME", kind: "knowledge" })}
          />
          <IconRow
            title="Review draft"
            detail="Inspect your in-memory changes before integration"
            icon="check"
            color="#236D61"
            tint="#E4F4F0"
            badge="Inspect"
            last
            onPress={() => setSheet({ title: "Review AI draft", eyebrow: "OPTIMUS PRIME", kind: "review" })}
          />
        </GlassCard>
        <Note>Drafts stay in memory until sign-out or app close. Publishing, model training and knowledge ingestion are not connected.</Note>
      </>}

      {screen === "Support" && <>
        <MetricTiles entries={[
          { label: "Support inbox", value: "Standby", caption: "Awaits protected API", icon: "support", color: colors.blue },
          { label: "Handoff mode", value: "Human", caption: "Sensitive enquiries escalate", icon: "people", color: colors.teal },
          { label: "Role boundary", value: "Strict", caption: "No assessment powers", icon: "shield", color: "#236D61" },
          { label: "Support follow-ups", value: "1 open", caption: "Tracked in Follow-ups", icon: "alert", color: colors.rust },
        ]} />
        <GlassCard>
          <View style={s.statusBanner}>
            <View style={[s.subscreenIcon, { backgroundColor: "#EAF1FC" }]}><MobileIcon name="support" color={colors.blue} /></View>
            <View style={{ flex: 1, gap: 4 }}>
              <Heading>Support inbox unavailable</Heading>
              <Badge value="Submitted" label="Awaiting live support API" />
            </View>
          </View>
          <Note>Escalated conversations, unread messages and response timers will appear when the protected support API is connected. No live conversations are loaded.</Note>
        </GlassCard>
        <GlassCard>
          <Heading>Human handoff & governance</Heading>
          <IconRow title="Mandatory escalation" detail="Optimus Prime must escalate unresolved, ambiguous or sensitive questions to authorized support staff." icon="ai" color="#695198" tint="#F0ECFB" />
          <IconRow title="Consented context only" detail="Only approved field context and applicant-consented messages pass into support handoffs." icon="check" color="#236D61" tint="#E4F4F0" />
          <IconRow title="Strict role separation" detail="Support access does not grant assessment scoring, voting or decision release powers." icon="shield" color={colors.rust} tint="#FBEDE8" last />
        </GlassCard>
        <GlassCard>
          <Heading>Escalated support matters</Heading>
          <Note>Review reported support issues and email verification escalations in Follow-ups.</Note>
          <Button title="Open Follow-ups queue" onPress={() => navigate("Follow-ups")} secondary />
        </GlassCard>
      </>}

      {screen === "Feedback & insights" && <>
        <MetricTiles entries={[
          { label: "Satisfaction", value: "—", caption: "Awaiting feedback API", icon: "feedback", color: "#94702D" },
          { label: "Responses", value: "—", caption: "No live survey records", icon: "people", color: colors.blue },
          { label: "Service pillars", value: "3", caption: "Tracked dimensions", icon: "check", color: colors.teal },
          { label: "Portal health", value: "2.1s", caption: "Sample load benchmark", icon: "pulse", color: "#236D61" },
        ]} />
        <GlassCard>
          <View style={s.statusBanner}>
            <View style={[s.subscreenIcon, { backgroundColor: "#FCF4E4" }]}><MobileIcon name="feedback" color="#94702D" /></View>
            <View style={{ flex: 1, gap: 4 }}>
              <Heading>Insights await real feedback</Heading>
              <Badge value="In review" label="Collection API not connected" />
            </View>
          </View>
          <Note>Satisfaction, common questions and service trends require a connected feedback collection and reporting API.</Note>
        </GlassCard>
        <GlassCard>
          <Heading>Tracked service dimensions</Heading>
          <IconRow title="Application guidance clarity" detail="Measures how clearly innovators understand eligibility and evidence requirements." icon="application" color={colors.blue} tint="#EAF1FC" badge="— / 5" />
          <IconRow title="Assistant & support helpfulness" detail="Tracks resolution quality across Optimus Prime guidance and human handoffs." icon="ai" color="#695198" tint="#F0ECFB" badge="— / 5" />
          <IconRow title="Portal speed & reliability" detail="Correlates user experience with page load and interaction stability." icon="pulse" color={colors.teal} tint="#E4F4F0" badge="Sample" last onPress={() => navigate("Website health", "More")} />
        </GlassCard>
      </>}

      {screen === "Audit logs" && <>
        <MetricTiles entries={[
          { label: "Server auditing", value: "Active", caption: "Recorded on mutation", icon: "audit", color: colors.rust },
          { label: "Audit reason", value: "5+ chars", caption: "Required on every change", icon: "check", color: "#236D61" },
          { label: "MFA enforcement", value: "AAL2", caption: "TOTP verified sessions", icon: "shield", color: colors.blue },
          { label: "Audit explorer", value: "Standby", caption: "Awaits paginated API", icon: "clock", color: "#94702D" },
        ]} />
        <GlassCard>
          <View style={s.statusBanner}>
            <View style={[s.subscreenIcon, { backgroundColor: "#FBEDE8" }]}><MobileIcon name="audit" color={colors.rust} /></View>
            <View style={{ flex: 1, gap: 4 }}>
              <Heading>Audit explorer not connected</Heading>
              <Badge value="admin" label="Protected server records" />
            </View>
          </View>
          <Note>Privileged actions are recorded by the server. This screen needs a protected paginated audit API before it can display actor, action, time and reason.</Note>
        </GlassCard>
        <GlassCard>
          <Heading>Server-recorded privileged actions</Heading>
          <IconRow title="Account creation & initial password" detail="Audits administrator actor, target role, sector scope and creation reason." icon="people" color={colors.blue} tint="#EAF1FC" badge="Audited" onPress={() => navigate("Users")} />
          <IconRow title="Role & Lead Assessor assignments" detail="Records previous role, new role, lead status and mandatory justification." icon="shield" color="#695198" tint="#F0ECFB" badge="Audited" onPress={() => navigate("Users")} />
          <IconRow title="Sample operational activity" detail="Inspect illustrative chronological events in the Activity log preview." icon="clock" color={colors.teal} tint="#E4F4F0" badge="Preview" last onPress={() => navigate("Activity log", "More")} />
        </GlassCard>
      </>}

      {screen === "Account security" && <>
        <MetricTiles entries={[
          { label: "Active role", value: "Admin", caption: "Verified profile role", icon: "shield", color: "#236D61" },
          { label: "Session expires", value: sessionExpiry, caption: "Automatic sign-out", icon: "clock", color: colors.blue },
          { label: "Token storage", value: "Memory", caption: "Never persisted to disk", icon: "check", color: colors.teal },
          { label: "Privileged MFA", value: "TOTP", caption: "6-digit authenticator", icon: "audit", color: colors.rust },
        ]} />
        <GlassCard>
          <Heading>Secure your account</Heading>
          <Fact label="Administrator" value={account.name} />
          <Fact label="Role" value="Administrator" />
          <Fact label="Session expires" value={sessionExpiry} />
          <Fact label="Device storage policy" value="In-memory session only · cleared on sign-out" last />
        </GlassCard>
        <GlassCard>
          <Heading>Authenticator enrollment & verification</Heading>
          <Note>Use the web workspace to enroll or verify your authenticator. It opens a separate browser session and requires sign-in. Tokens are never passed in the link.</Note>
          <Button title="Open authenticator settings on web" onPress={() => void openWeb("security")} />
          <Button title="Sign out of this app" onPress={onSignOut} secondary />
        </GlassCard>
      </>}

      {(screen === "Users" || screen === "Sectors") && loading && <View accessibilityLiveRegion="polite" style={s.loading}><ActivityIndicator color={colors.rust} /><Text style={s.note}>Loading protected records…</Text></View>}
      {(screen === "Users" || screen === "Sectors") && !!error && <GlassCard><Text accessibilityRole="alert" style={s.error}>{error}</Text><Button title="Retry loading" onPress={() => setAttempt(value => value + 1)} /><Button title="Sign out" onPress={onSignOut} secondary /></GlassCard>}
    </ScrollView>

    {!nested && (
      <View accessibilityRole="tablist" style={[s.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <FrostedSurface variant="bar" />
        {tabs.map((tab, index) => {
          const selected = screen === tab;
          return <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => navigate(tab)} style={[s.tab, selected && s.tabSelected]}>
            <TabIcon index={index} selected={selected} />
            <Text style={[s.tabLabel, selected && { color: colors.rust, fontWeight: "700" }]}>{tab}</Text>
          </Pressable>;
        })}
      </View>
    )}

    {userEditor !== null && <AdminUserEditor account={account} user={userEditor === "create" ? null : userEditor} onClose={() => setUserEditor(null)} onVerified={onAccountChange} onSaved={message => { setUserEditor(null); setUserNotice(message); setAttempt(value => value + 1); }} />}

    <Modal visible={menuOpen} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
      <FrostedModalBackdrop>
        <View style={s.drawerBackdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close administration menu" onPress={() => setMenuOpen(false)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={[s.drawer, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 18) }]}>
            <FrostedSurface variant="sheet" />
            <View style={s.drawerHeading}>
              <View style={s.brand}>
                <Image source={require("./assets/ceda.png")} resizeMode="contain" style={s.logo} accessibilityLabel="CEDA Innovation" />
                <View style={{ flex: 1 }}>
                  <Text accessibilityRole="header" style={s.heading}>Administration</Text>
                  <Text style={s.brandSubtitle}>Quick navigation</Text>
                </View>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close administration menu" onPress={() => setMenuOpen(false)} style={s.closeCircle}>
                <MobileIcon name="close" color="#52606E" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={s.drawerContent}>
              <Text style={s.drawerSectionLabel}>MAIN WORKSPACE</Text>
              {tabs.map(item => (
                <Pressable accessibilityRole="button" accessibilityState={{ selected: screen === item }} key={item} style={[s.drawerLink, screen === item && s.drawerLinkActive]} onPress={() => navigate(item)}>
                  <Text style={[s.rowTitle, screen === item && { color: colors.rust }]}>{item}</Text>
                  <Text style={s.chevron} accessible={false}>›</Text>
                </Pressable>
              ))}
              <Text style={[s.drawerSectionLabel, { marginTop: 10 }]}>MORE SUB-SCREENS</Text>
              {extras.map(item => {
                const meta = extraMeta[item];
                return <Pressable accessibilityRole="button" accessibilityState={{ selected: screen === item }} key={item} style={[s.drawerLink, screen === item && s.drawerLinkActive]} onPress={() => navigate(item, "More")}>
                  <View style={[s.drawerIcon, { backgroundColor: meta.tint }]}><MobileIcon name={meta.icon} color={meta.color} /></View>
                  <View style={{ flex: 1 }}><Text style={[s.rowTitle, screen === item && { color: colors.rust }]}>{item}</Text><Text numberOfLines={1} style={s.drawerSub}>{meta.detail}</Text></View>
                </Pressable>;
              })}
            </ScrollView>
            <View style={s.drawerAccount}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{account.name}</Text>
                <Text style={s.drawerSub}>Administrator · Expires {sessionExpiry}</Text>
              </View>
              <Button title="Sign out" onPress={onSignOut} secondary />
            </View>
          </View>
        </View>
      </FrostedModalBackdrop>
    </Modal>

    <Modal visible={!!sheet} transparent statusBarTranslucent animationType="slide" onRequestClose={() => { setSheet(null); setDraftNotice(""); }}>
      <FrostedModalBackdrop>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close sheet" onPress={() => { setSheet(null); setDraftNotice(""); }} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={[s.modalSheet, { paddingBottom: Math.max(insets.bottom, 22) }]}>
            <FrostedSurface variant="sheet" />
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetEyebrow}>{sheet?.eyebrow ?? "ADMINISTRATION"}</Text>
                <Text accessibilityRole="header" style={s.modalTitle}>{sheet?.title}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close modal" onPress={() => { setSheet(null); setDraftNotice(""); }} style={s.closeCircle}>
                <MobileIcon name="close" color="#52606E" />
              </Pressable>
            </View>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
              {sheet?.kind === "notifications" && <>
                <PreviewLabel />
                <View style={s.modalCard}>
                  <Heading>Attention required</Heading>
                  <Note>Live notifications are not connected. These sample alerts show matters that need administrator attention.</Note>
                  {previewMatters.filter(item => item.state !== "Resolved").map((item, index, list) => (
                    <IconRow
                      key={item.id}
                      title={item.title}
                      detail={item.kind + " · " + item.priority + " priority · " + item.state}
                      icon="alert"
                      color={item.priority === "High" ? colors.rust : colors.blue}
                      tint={item.priority === "High" ? "#FBEDE8" : "#EAF1FC"}
                      badge={item.priority}
                      last={index === list.length - 1}
                      onPress={() => navigate("Follow-ups")}
                    />
                  ))}
                </View>
              </>}

              {sheet?.kind === "insight" && <>
                <PreviewLabel />
                <View style={s.modalCard}>
                  {sheet.facts?.map(([label, value], index, list) => <Fact key={label} label={label} value={value} last={index === list.length - 1} />)}
                </View>
              </>}

              {sheet?.kind === "sector" && sheet.sector && <>
                <View style={s.modalCard}>
                  <View style={s.cardHeaderRow}>
                    <Heading>{sheet.sector.name}</Heading>
                    <Badge value={sheet.sector.status} />
                  </View>
                  <Note>A dash means unavailable, not zero. Individual applications will appear after the protected submissions API is connected.</Note>
                </View>
                <MetricTiles entries={[
                  { label: "Applications", value: "—", caption: "Total submissions", icon: "application", color: colors.blue },
                  { label: "Approved", value: "—", caption: "Released outcomes", icon: "check", color: "#236D61" },
                  { label: "In review", value: "—", caption: "Active assessments", icon: "clock", color: "#94702D" },
                  { label: "Rejected", value: "—", caption: "Declined outcomes", icon: "alert", color: colors.rust },
                ]} />
                <Button title="Open sector management on web" onPress={() => void openWeb("sectors")} secondary />
              </>}

              {sheet?.kind === "case" && sheet.item && <>
                <PreviewLabel />
                <View style={s.modalCard}>
                  <View style={s.cardHeaderRow}>
                    <Badge value={sheet.item.status} />
                    <Text style={s.factLabel}>{sheet.item.id}</Text>
                  </View>
                  <Heading>{sheet.item.title}</Heading>
                  <Note>{sheet.item.summary}</Note>
                  <Fact label="Reference" value={sheet.item.id} />
                  <Fact label="Applicant" value={sheet.item.owner} />
                  <Fact label="Sector" value={sheet.item.sector} />
                  <Fact label="Assessor" value={sheet.item.assessor} last />
                </View>
                <View style={s.modalCard}>
                  <Heading>Timeline preview</Heading>
                  <Fact label="Sample event" value="Application submitted" />
                  <Fact label="Sample current state" value={sheet.item.status} last />
                  <Note>Attachments, evaluations and messages need a protected application API. This sample does not contain applicant files.</Note>
                </View>
              </>}

              {(sheet?.kind === "guidance" || sheet?.kind === "knowledge") && (
                <View style={s.modalCard}>
                  <Note>Local draft only. No live settings change and no source URL is fetched.</Note>
                  {(sheet.kind === "guidance" ? [["tone", "Tone"], ["length", "Answer length"], ["instructions", "Response instructions"], ["handoff", "Human support triggers"]] : [["source", "Approved source URL"], ["notes", "Reviewed knowledge notes"], ["questions", "Example questions"]]).map(([key, label]) => (
                    <Field key={key} label={label} value={draft[key as keyof typeof draft]} onChange={value => { setDraft(previous => ({ ...previous, [key]: value })); setDraftNotice(""); }} multiline={!["tone", "length", "source"].includes(key)} />
                  ))}
                  <Button title="Keep draft in this session" onPress={() => setDraftNotice("Draft kept in memory. The live assistant has not changed.")} />
                  {!!draftNotice && <Text accessibilityLiveRegion="polite" style={s.noticeText}>{draftNotice}</Text>}
                </View>
              )}

              {sheet?.kind === "review" && (
                <View style={s.modalCard}>
                  <Note>Draft only · clears when you sign out or close the app.</Note>
                  {Object.entries(draft).map(([key, value], index, list) => (
                    <Fact key={key} label={key.charAt(0).toUpperCase() + key.slice(1)} value={value || "Not provided"} last={index === list.length - 1} />
                  ))}
                </View>
              )}
              {!!linkError && <Text accessibilityRole="alert" style={s.error}>{linkError}</Text>}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </FrostedModalBackdrop>
    </Modal>
    </FrostedScreenBackdrop>
  </View>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { flex: 1 },
  contentInner: { padding: 18, gap: 16, paddingBottom: 32, maxWidth: 760, width: "100%", alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.88)", overflow: "hidden" },
  headerAction: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.82)", borderWidth: 1, borderColor: "#E5DDD3", justifyContent: "center", alignItems: "center" },
  backButton: { backgroundColor: "#EAF1FC", borderColor: "#D9E5F7" },
  bellDot: { position: "absolute", top: 9, right: 10, width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.rust, borderWidth: 1.2, borderColor: "white" },
  headerCenter: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerEyebrow: { fontSize: fontSizes.caption, fontWeight: "700", letterSpacing: 1.1, color: colors.subtle },
  brand: { flex: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  brandTitle: { fontSize: fontSizes.heading, fontWeight: "700", color: colors.navy },
  brandSubtitle: { fontSize: fontSizes.caption, color: colors.subtle, marginTop: 1 },
  logo: { width: 40, height: 36 },
  workspaceSearch: { flexDirection: "row", alignItems: "center", gap: 9, paddingLeft: 13, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", overflow: "hidden" },
  workspaceSearchInput: { flex: 1, paddingVertical: 11, minHeight: 46, fontSize: fontSizes.body, color: colors.navy, paddingRight: 12 },
  clearSearch: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  clearText: { color: colors.subtle, fontSize: 22 },
  sectionEyebrow: { fontSize: fontSizes.caption, fontWeight: "700", letterSpacing: 1.1, color: colors.subtle },
  subscreenHero: { borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", padding: 18, gap: 10, overflow: "hidden" },
  subscreenTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  subscreenIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  subscreenEyebrow: { fontSize: fontSizes.caption, fontWeight: "700", letterSpacing: 1.1, color: colors.subtle },
  subscreenTitle: { fontSize: fontSizes.title, fontWeight: "700", letterSpacing: -0.6, color: colors.navy },
  profileCard: { borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.92)", padding: 18, gap: 14, overflow: "hidden" },
  profileTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  profileAvatar: { width: 54, height: 54, borderRadius: 18, backgroundColor: "#FBEDE8", borderWidth: 1, borderColor: "#F3D5CB", alignItems: "center", justifyContent: "center" },
  profileInitials: { fontSize: fontSizes.heading, fontWeight: "700", color: colors.rust },
  profileName: { fontSize: fontSizes.title, fontWeight: "700", color: colors.navy, letterSpacing: -0.4 },
  profileActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 4 },
  profileQuickButton: { flex: 1, minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 14, borderRadius: buttonCornerRadius, backgroundColor: "#E4F4F0" },
  profileQuickText: { color: "#236D61", fontSize: fontSizes.subbody, fontWeight: "700" },
  profileSignOutButton: { minHeight: 46, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, borderRadius: buttonCornerRadius, backgroundColor: "rgba(243,239,234,0.95)" },
  profileSignOutText: { color: colors.navy, fontSize: fontSizes.subbody, fontWeight: "600" },
  sectionBlock: { gap: 8 },
  sectionHeaderLabel: { fontSize: fontSizes.caption, fontWeight: "700", letterSpacing: 1.1, color: colors.subtle, paddingHorizontal: 4 },
  eyebrow: { fontSize: fontSizes.caption, fontWeight: "700", letterSpacing: 1.2, color: colors.subtle },
  card: { borderRadius: 20, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", gap: 12, overflow: "hidden" },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  heading: { color: colors.navy, fontSize: fontSizes.heading, fontWeight: "700", letterSpacing: -0.3 },
  note: { fontSize: fontSizes.subbody, lineHeight: 19, color: colors.subtle },
  inlineLink: { color: "#417AC5", fontSize: fontSizes.subbody, fontWeight: "600" },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  stat: { flexBasis: "46%", flexGrow: 1, padding: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", borderRadius: 18, gap: 5, overflow: "hidden" },
  statIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  statValue: { color: colors.navy, fontWeight: "700", fontSize: fontSizes.title, letterSpacing: -0.6 },
  statLabel: { color: "#445364", fontSize: fontSizes.subbody, fontWeight: "600" },
  statCaption: { color: colors.subtle, fontSize: fontSizes.caption },
  row: { flexDirection: "row", alignItems: "center", minHeight: 62, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: "rgba(218,208,198,0.45)" },
  rowIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", alignSelf: "flex-start", marginTop: 2 },
  rowBody: { flex: 1, gap: 4 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rowTitle: { color: colors.navy, fontWeight: "600", fontSize: fontSizes.body, flexShrink: 1 },
  rowBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  rowBadgeText: { fontSize: fontSizes.caption, fontWeight: "700" },
  chevron: { color: "#A1A8B1", fontSize: 22 },
  tags: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 2 },
  badge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: fontSizes.caption, fontWeight: "700" },
  button: { backgroundColor: colors.rust, paddingHorizontal: 16, paddingVertical: 13, minHeight: 48, borderRadius: buttonCornerRadius, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "white", fontSize: fontSizes.body, fontWeight: "600", textAlign: "center" },
  secondary: { backgroundColor: "rgba(243,239,234,0.92)" },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 10 },
  pillSearch: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9, paddingLeft: 13, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", overflow: "hidden" },
  pillSearchInput: { flex: 1, minWidth: 0, minHeight: 46, color: colors.navy, fontSize: fontSizes.body, paddingRight: 8 },
  webPillButton: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  input: { backgroundColor: "rgba(255,255,255,0.88)", borderWidth: 1, borderColor: "#CAB9A9", paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, minHeight: 48, color: colors.navy, fontSize: fontSizes.body },
  field: { gap: 7 },
  fieldLabel: { fontSize: fontSizes.subbody, fontWeight: "700", color: colors.navy },
  multiline: { minHeight: 110, textAlignVertical: "top" },
  filters: { gap: 7, paddingVertical: 2 },
  chip: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", paddingHorizontal: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", backgroundColor: "rgba(255,250,244,0.88)", borderRadius: 20 },
  chipText: { color: colors.muted, fontSize: fontSizes.subbody, fontWeight: "500" },
  chart: { flexDirection: "row", gap: 10, paddingTop: 6 },
  barColumn: { flex: 1, gap: 6, alignItems: "center" },
  barValue: { fontSize: fontSizes.caption, fontWeight: "600", color: colors.muted },
  barTrack: { height: 110, width: "100%", justifyContent: "flex-end", backgroundColor: "#EEF2F6", borderRadius: 6, overflow: "hidden" },
  barLabel: { fontSize: fontSizes.caption, color: colors.subtle },
  fact: { gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(218,208,198,0.45)" },
  factLabel: { fontSize: fontSizes.caption, fontWeight: "600", color: colors.subtle },
  factValue: { fontSize: fontSizes.body, lineHeight: 22, color: colors.navy, fontWeight: "500" },
  statusBanner: { flexDirection: "row", alignItems: "center", gap: 12 },
  emptyBox: { paddingVertical: 20, alignItems: "center", gap: 6 },
  tabBar: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.9)", paddingTop: 8, paddingHorizontal: 6, overflow: "hidden" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 5, minHeight: 56, paddingVertical: 6 },
  tabSelected: { backgroundColor: "rgba(251,237,232,0.88)", borderRadius: 14 },
  tabLabel: { fontSize: fontSizes.caption, color: colors.muted, textAlign: "center" },
  navIcon: { width: 24, height: 24, justifyContent: "center", alignItems: "center" },
  iconBars: { flexDirection: "row", gap: 3, alignItems: "flex-end" },
  drawerBackdrop: { flex: 1 },
  drawer: { width: "86%", maxWidth: 360, height: "100%", borderRightWidth: 1, borderColor: "rgba(255,255,255,0.94)", overflow: "hidden" },
  drawerHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(218,208,198,0.45)" },
  drawerContent: { padding: 14, gap: 4 },
  drawerSectionLabel: { fontSize: fontSizes.caption, fontWeight: "700", letterSpacing: 1.1, color: colors.subtle, paddingHorizontal: 10, paddingVertical: 6 },
  drawerLink: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 50, borderRadius: 14 },
  drawerLinkActive: { backgroundColor: "rgba(251,237,232,0.88)" },
  drawerIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  drawerSub: { fontSize: fontSizes.subbody, color: colors.subtle },
  drawerAccount: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingTop: 14, borderTopColor: "rgba(218,208,198,0.45)", borderTopWidth: 1 },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.92)", paddingHorizontal: 18, paddingTop: 10, maxHeight: "90%", gap: 14, overflow: "hidden" },
  modalHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(101,86,77,0.28)", alignSelf: "center" },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 2 },
  sheetEyebrow: { fontSize: fontSizes.caption, fontWeight: "700", letterSpacing: 1.1, color: colors.subtle, marginBottom: 2 },
  modalTitle: { fontSize: fontSizes.heading, fontWeight: "700", color: colors.navy },
  closeCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.82)", borderWidth: 1, borderColor: "#E5DDD3", alignItems: "center", justifyContent: "center" },
  modalContent: { gap: 14, paddingBottom: 8, maxWidth: 720, width: "100%", alignSelf: "center" },
  modalCard: { backgroundColor: "rgba(255,255,255,0.82)", borderRadius: 20, borderWidth: 1, borderColor: "#E5DDD3", padding: 16, gap: 12 },
  noticeText: { fontSize: fontSizes.subbody, color: "#236D61", fontWeight: "600" },
  error: { color: "#9A3026", fontSize: fontSizes.subbody, lineHeight: 20 },
  loading: { gap: 12, padding: 24, alignItems: "center" },
});
