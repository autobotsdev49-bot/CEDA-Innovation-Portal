import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator, BackHandler, Image, Keyboard, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { verifyAssessorAuthenticator, type Account } from "./auth";
import { AccountSecurityCards } from "./AccountSecurityCards";
import { isTokenAal2 } from "./securityApi";
import { FrostedModalBackdrop, FrostedScreenBackdrop, FrostedSurface } from "./FrostedGlass";
import {
  ActionButton, FactRow, FlushSheetModal, FormField, FrostedInput, FrostedSearchPill, GlassCard, IconRow,
  InnovatorIcon, MetricTile, SectionHeader, SubscreenHero, adminStyleColors as colors,
  statusAppearance, type InnovatorIconName,
} from "./InnovatorUI";
import { Breakdown, InsightCard, MobileIcon, Ring } from "./AdminOverview";
import {
  assessmentBucket, buildAssessorOverview, buildLeadOverview, buildLibrarySummary, buildMyAssessmentsSummary,
  defaultAssessmentRubric, formatAssessorRole, humanCaseStatus, libraryCategory, normalizeRubricCriteria, overviewColors,
} from "./assessmentOverview.js";
import { AssessorCaseView, type CaseTab } from "./AssessorCaseView";
import { signOutOtherDevices } from "./innovatorApi";
import {
  assessmentDate, getAssessorCase, getAssessorWorkspace, roundLabel,
  type AssessorCase, type AssessorData, type CaseDetail,
} from "./assessorApi";
import { buttonCornerRadius, fontSizes } from "./theme";
import { TourTarget, useTour } from "./TourGuide";
import { useAccessibility } from "./useAccessibility";

const tabs = ["overview", "assessments", "library", "messages", "more"] as const;
const leadSections = ["progress", "reports"] as const;
const otherSections = ["guidance", "notifications", "account"] as const;
type Tab = (typeof tabs)[number];
type Screen = Tab | (typeof leadSections)[number] | (typeof otherSections)[number];

type ScreenMeta = {
  title: string;
  short?: string;
  detail: string;
  summary?: string;
  badge: string;
  category: string;
  icon: InnovatorIconName;
  color: string;
  tint: string;
};

const screens: Record<Screen, ScreenMeta> = {
  overview: { title: "Overview", detail: "Workload, decisions and deadlines", badge: "Live", category: "MAIN WORKSPACE", icon: "home", color: colors.blue, tint: "#EAF1FC" },
  assessments: { title: "My assessments", short: "Assessments", detail: "Assigned applications and reviews", badge: "Reviews", category: "MAIN WORKSPACE", icon: "applications", color: colors.rust, tint: "#FBEDE8" },
  library: { title: "Application library", short: "Library", detail: "Submissions across all industries", badge: "Directory", category: "MAIN WORKSPACE", icon: "documents", color: colors.teal, tint: "#E4F4F0" },
  messages: { title: "Messages & discussion", short: "Discussion", detail: "Panel conversations by case", badge: "Panel", category: "MAIN WORKSPACE", icon: "messages", color: colors.purple, tint: "#F0ECFB" },
  more: { title: "More", detail: "Tools, reports & account", badge: "Hub", category: "MAIN WORKSPACE", icon: "more", color: colors.muted, tint: "#F1F3F6" },
  progress: { title: "Review progress", detail: "Declarations, reviews & deadlines", summary: "Monitor panel declarations, submitted reviews and upcoming deadlines across active rounds.", badge: "Panels", category: "LEAD ASSESSOR TOOLS", icon: "pulse", color: colors.tealBright, tint: "#E4F4F0" },
  reports: { title: "Reports", detail: "Workload and outcomes across industries", summary: "Review total cases, submitted reviews and released outcomes broken down by industry.", badge: "Metrics", category: "LEAD ASSESSOR TOOLS", icon: "sector", color: colors.blueSoft, tint: "#EAF1FC" },
  guidance: { title: "Guidance", detail: "Weighted scoring rubric and review rules", summary: "Reference active CEDA weighted evaluation criteria, conflict declarations and voting rules.", badge: "Rubric", category: "ASSESSMENT TOOLS", icon: "documents", color: colors.blue, tint: "#EAF1FC" },
  notifications: { title: "Notifications", detail: "Declarations, reviews and voting alerts", summary: "Pending conflict declarations, open reviews and panel votes that need your attention.", badge: "Alerts", category: "ACCOUNT & SECURITY", icon: "bell", color: colors.rust, tint: "#FBEDE8" },
  account: { title: "Account & security", detail: "Profile, MFA & active session", summary: "View your specialty role, verify TOTP authentication, update your password and manage active devices.", badge: "MFA", category: "ACCOUNT & SECURITY", icon: "shield", color: colors.teal, tint: "#E4F4F0" },
};

function caseTab(screen: Screen): CaseTab {
  if (screen === "assessments" || screen === "notifications") return "Assessment";
  if (screen === "messages") return "Discussion";
  if (screen === "progress") return "Panel";
  return "Application";
}

function initialsOf(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "AS";
}

function assessorStatusTone(label: string): { color: string; tint: string } {
  switch (label) {
    case "New":
    case "Assign panel":
    case "Open voting":
      return { color: colors.blue, tint: "#EAF1FC" };
    case "Under review":
    case "In progress":
    case "Start review":
    case "Voting open":
    case "Ready for vote":
    case "Close voting":
    case "Awaiting info":
    case "To review":
      return { color: colors.amber, tint: "#FCF4E4" };
    case "Declaration due":
    case "Action needed":
    case "Decide & release":
    case "On hold":
    case "Info due":
      return { color: "#903925", tint: "#FBEDE8" };
    case "Released":
    case "Vote open":
      return { color: colors.teal, tint: "#E4F4F0" };
    case "Awarded":
    case "Award conferred":
      return { color: "#7C5317", tint: "#FFF3D8" };
    case "Not assigned":
      return { color: colors.muted, tint: "#F1F3F6" };
    default:
      return statusAppearance(label);
  }
}

function TonePill({ label }: { label: string }) {
  const tone = assessorStatusTone(label);
  return (
    <View style={[styles.toneBadge, { backgroundColor: tone.tint }]}>
      <View style={[styles.toneDot, { backgroundColor: tone.color }]} />
      <Text style={[styles.toneText, { color: tone.color }]}>{label}</Text>
    </View>
  );
}

function caseDirectoryRows(
  items: AssessorCase[],
  onOpen: (item: AssessorCase) => void,
  context: "assessments" | "library" = "library",
  emptyTitle = "No applications yet",
  emptyCopy = "There are no applications in this view.",
  onResetFilters?: () => void
) {
  if (!items.length) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
        <Text style={styles.emptyCopy}>{emptyCopy}</Text>
        {onResetFilters && (
          <Pressable accessibilityRole="button" onPress={onResetFilters} style={styles.linkTouch}>
            <Text style={styles.inlineLink}>Clear filters</Text>
          </Pressable>
        )}
      </View>
    );
  }
  return items.map((item, index) => {
    const canOpen = item.assigned || item.canManage || item.hasHistory;
    const statusText = canOpen ? humanCaseStatus(item, context) : "Not assigned";
    const tone = assessorStatusTone(statusText);
    const metaRight = item.deadline ? `${assessmentDate(item.deadline)} CAT` : roundLabel(item);
    return (
      <Pressable
        key={item.id}
        accessibilityRole={canOpen ? "button" : "text"}
        accessibilityLabel={`${item.title}, ${item.reference}, ${statusText}`}
        disabled={!canOpen}
        onPress={canOpen ? () => onOpen(item) : undefined}
        style={({ pressed }) => [
          styles.directoryItem,
          index === items.length - 1 && { borderBottomWidth: 0 },
          pressed && canOpen && { backgroundColor: "rgba(247,242,235,0.65)" },
        ]}
      >
        <View accessible={false} style={[styles.directoryIcon, { backgroundColor: tone.tint }]}>
          <MobileIcon name="application" color={tone.color} />
        </View>
        <View style={styles.directoryBody}>
          <View style={styles.referenceRow}>
            <Text style={styles.referenceText}>{item.reference}</Text>
            <Text style={styles.referenceText}>{metaRight}</Text>
          </View>
          <Text style={styles.directoryTitle} numberOfLines={2}>{item.title}</Text>
          <View style={styles.directoryTags}>
            <View style={styles.sectorTag}><Text style={styles.sectorTagText}>{item.sector || "Industry pending"}</Text></View>
            <TonePill label={statusText} />
            {context === "assessments" && item.assigned && !item.submitted && (item.reviewedCount ?? 0) > 0 && (
              <View style={styles.sectorTag}><Text style={styles.sectorTagText}>{item.reviewedCount}/12 steps</Text></View>
            )}
            {item.canManage && item.roundId && (
              <View style={styles.sectorTag}><Text style={styles.sectorTagText}>{item.reviewCount}/{item.memberCount} reviews</Text></View>
            )}
          </View>
        </View>
        {canOpen && <Text accessible={false} style={styles.chevron}>{"\u203a"}</Text>}
      </Pressable>
    );
  });
}

export function AssessorWorkspace({ account, onSignOut, onAccountChange }: { account: Account; onSignOut: () => void; onAccountChange: (account: Account) => void }) {
  const { darkMode, openModal: openA11yModal, scaleFont } = useAccessibility();
  const { setPortalContext, startTour } = useTour();
  const darkInk = darkMode ? "#f0e8e0" : colors.navy;
  const darkMuted = darkMode ? "#b8a898" : colors.muted;
  const darkSubtle = darkMode ? "#b8a898" : colors.subtle;
  const insets = useSafeAreaInsets();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [screen, setScreen] = useState<Screen>("overview");
  const [parent, setParent] = useState<Tab>("more");
  const [caseId, setCaseId] = useState<string | null>(null);
  const currentCaseTab = useRef<CaseTab>("Application");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [data, setData] = useState<AssessorData | null>(null);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseBusy, setCaseBusy] = useState(false);
  const [error, setError] = useState("");
  const [caseError, setCaseError] = useState("");
  const [caseRetry, setCaseRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [industryFilter, setIndustryFilter] = useState("All");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verifiedToken, setVerifiedToken] = useState<string | null>(null);
  const verifying = useRef(false);
  const [endingSessions, setEndingSessions] = useState(false);
  const [sessionNotice, setSessionNotice] = useState("");
  const [sessionError, setSessionError] = useState("");
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const current = await getAssessorWorkspace(account);
      if (request === sequence.current) setData(current);
    } catch (failure) {
      if (request === sequence.current) setError(failure instanceof Error ? failure.message : "The assessor workspace could not be loaded.");
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    void load();
    return () => { sequence.current += 1; };
  }, [load]);

  useEffect(() => {
    if (!caseId) return;
    let active = true;
    setCaseLoading(true);
    setCaseError("");
    setDetail(null);
    void getAssessorCase(account, caseId).then(current => {
      if (active) setDetail(current);
    }).catch(failure => {
      if (active) setCaseError(failure instanceof Error ? failure.message : "This application could not be opened.");
    }).finally(() => {
      if (active) setCaseLoading(false);
    });
    return () => { active = false; };
  }, [account, caseId, caseRetry]);

  const lead = data?.profile.lead === true;
  const nested = Boolean(caseId) || !tabs.includes(screen as Tab);
  const roleName = lead ? "Lead Assessor" : "Assessor";
  const roleSubtitle = formatAssessorRole(data?.profile ?? { lead });
  const displayName = data?.profile.name || account.name;
  const firstName = displayName.trim().split(/\s+/)[0] || roleName;
  const todayLabel = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Gaborone",
  }).format(new Date());
  const sessionExpiry = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Gaborone",
  }).format(new Date(account.expiresAt));
  const cases = data?.cases ?? [];
  const totalUnread = cases.reduce((sum, item) => sum + (item.unreadCount || 0), 0);
  const mine = cases.filter(item => item.assigned);
  const managed = cases.filter(item => item.canManage);
  const pending = mine.filter(item => (item.roundState === "setup" || item.roundState === "review") && item.conflict === "pending" && !item.hold);
  const due = mine.filter(item => item.roundState === "review" && item.conflict === "cleared" && !item.submitted && !item.hold).sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
  const votes = mine.filter(item => item.roundState === "voting" && item.conflict === "cleared" && item.submitted && !item.hasVoted && !item.hold);
  const alerts = [...pending, ...due, ...votes];

  function clearFilters() {
    setQuery("");
    setFilter("All");
    setStatusFilter("All");
    setIndustryFilter("All");
  }

  function navigate(next: Screen) {
    if (caseBusy || (!lead && leadSections.includes(next as (typeof leadSections)[number]))) return;
    setDrawerOpen(false);
    setFilterSheetOpen(false);
    setCaseId(null);
    setDetail(null);
    setScreen(next);
    if (next === "messages") void load();
    setWorkspaceSearch("");
    clearFilters();
    if (!tabs.includes(next as Tab)) setParent(tabs.includes(screen as Tab) ? screen as Tab : "more");
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  function goBack() {
    if (caseBusy) return;
    if (caseId) {
      setCaseId(null);
      setDetail(null);
      if (screen === "messages" || currentCaseTab.current === "Discussion") void load();
      scroll.current?.scrollTo({ y: 0, animated: false });
    } else if (nested) {
      navigate(parent);
    } else if (screen !== "overview") {
      navigate("overview");
    }
  }

  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (drawerOpen) setDrawerOpen(false);
      else if (nested || screen !== "overview") goBack();
      else return false;
      return true;
    });
    return () => listener.remove();
  });

  function open(item: AssessorCase, tab: CaseTab = caseTab(screen)) {
    setCaseError("");
    setCaseLoading(true);
    setDetail(null);
    currentCaseTab.current = tab;
    setCaseId(item.id);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  function onCaseChange(current: CaseDetail) {
    setDetail(current);
    setData(previous => previous && { ...previous, cases: previous.cases.map(item => item.id === current.case.id ? {
      ...item, ...current.case, reviewedCount: current.reviewedSteps?.length ?? item.reviewedCount,
    } : item) });
    void load();
  }

  function openVerification() {
    setVerificationCode("");
    setVerificationError("");
    setVerificationOpen(true);
  }

  async function verifyRelease() {
    if (verifying.current) return;
    verifying.current = true;
    setVerificationBusy(true);
    setVerificationError("");
    try {
      const verified = await verifyAssessorAuthenticator(account, verificationCode);
      setVerifiedToken(verified.token);
      setVerificationCode("");
      setVerificationOpen(false);
      onAccountChange(verified);
    } catch (failure) {
      setVerificationError(failure instanceof Error ? failure.message : "The code could not be verified.");
    } finally {
      verifying.current = false;
      setVerificationBusy(false);
    }
  }

  async function endOtherSessions() {
    setEndingSessions(true);
    setSessionNotice("");
    setSessionError("");
    try {
      await signOutOtherDevices(account.token);
      setSessionNotice("You signed out of your other devices.");
    } catch (failure) {
      setSessionError(failure instanceof Error ? failure.message : "Other sessions could not be ended.");
    } finally {
      setEndingSessions(false);
    }
  }

  const assessmentsSummary = buildMyAssessmentsSummary(cases, lead);
  const librarySummary = buildLibrarySummary(cases);
  const available = screen === "assessments" ? assessmentsSummary.items as AssessorCase[]
    : screen === "messages" ? cases.filter(item => item.roundId && ((!item.assigned && item.canManage) || item.conflict === "cleared"))
      .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""))
    : screen === "progress" ? managed : cases;
  const listContext: "assessments" | "library" = screen === "assessments" ? "assessments" : "library";
  const industries = [...new Set(available.map(item => item.sector).filter(Boolean))].sort();
  const statuses = [...new Set(available.map(item => humanCaseStatus(item, listContext)))].sort();
  const lowerQuery = query.trim().toLowerCase();
  const filtered = available.filter(item => {
    if (screen === "assessments") {
      if (filter === "To review" && assessmentBucket(item, lead) !== "to-review") return false;
      if (filter === "In progress" && assessmentBucket(item, lead) !== "in-progress") return false;
      if (filter === "Submitted" && assessmentBucket(item, lead) !== "submitted") return false;
      if (filter === "Previous rounds" && assessmentBucket(item, lead) !== "previous") return false;
      if (filter === "Assigned to me" && !item.assigned) return false;
    } else if (screen === "library") {
      if (filter === "New" && libraryCategory(item) !== "new") return false;
      if (filter === "Under review" && libraryCategory(item) !== "review") return false;
      if (filter === "Approved" && libraryCategory(item) !== "approved") return false;
      if (filter === "Awarded" && libraryCategory(item) !== "awarded") return false;
      if (filter === "Rejected" && libraryCategory(item) !== "rejected") return false;
      if (filter === "Assigned to me" && !item.assigned) return false;
    }
    if (statusFilter !== "All" && humanCaseStatus(item, listContext) !== statusFilter) return false;
    if (industryFilter !== "All" && item.sector !== industryFilter) return false;
    return !lowerQuery || `${item.title} ${item.reference} ${item.sector}`.toLowerCase().includes(lowerQuery);
  });
  const showCaseList = screen === "assessments" || screen === "library" || screen === "messages"
    || (lead && screen === "progress");

  const searchableScreens: Screen[] = [
    ...tabs.filter(entry => entry !== "more"),
    ...(lead ? leadSections : []),
    ...otherSections,
  ];
  const lowerWorkspaceSearch = workspaceSearch.trim().toLowerCase();
  const quickJumpMatches = lowerWorkspaceSearch
    ? searchableScreens.filter(entry => {
      const meta = screens[entry];
      return `${meta.title} ${meta.detail} ${meta.category}`.toLowerCase().includes(lowerWorkspaceSearch);
    })
    : [];

  function navigationGroup(title: string, entries: readonly Screen[]) {
    return (
      <View style={styles.sectionBlock}>
        <Text style={styles.sectionHeaderLabel}>{title}</Text>
        <GlassCard style={styles.groupCompact}>
          {entries.map((entry, index) => {
            const meta = screens[entry];
            return (
              <IconRow
                key={entry}
                title={meta.title}
                detail={meta.detail}
                icon={meta.icon}
                color={meta.color}
                tint={meta.tint}
                badge={entry === "notifications" && alerts.length ? `${alerts.length} open` : meta.badge}
                last={index === entries.length - 1}
                onPress={() => navigate(entry)}
              />
            );
          })}
        </GlassCard>
      </View>
    );
  }

  useEffect(() => {
    setPortalContext("assessor", (nextScreen) => {
      setCaseId(null);
      setScreen(nextScreen as Screen);
    });
  }, [setPortalContext]);

  return (
    <View style={[styles.root, darkMode && { backgroundColor: "#131009" }]}>
      <FrostedScreenBackdrop image={require("./assets/innovation.webp")}>
        <View style={[styles.header, darkMode && { borderBottomColor: "rgba(240,220,200,0.08)" }]}>
          <FrostedSurface variant="bar" />
          <TourTarget id="assessor.menu">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={nested ? "Go back" : "Open assessor navigation"}
            onPress={nested ? goBack : () => setDrawerOpen(true)}
            style={({ pressed }) => [styles.headerAction, darkMode && { backgroundColor: "rgba(37,32,24,0.88)", borderColor: "rgba(240,220,200,0.16)" }, nested && styles.backAction, pressed && { opacity: 0.7 }]}
            disabled={caseBusy}
          >
            <InnovatorIcon name={nested ? "back" : "menu"} color={darkInk} />
          </Pressable>
          </TourTarget>
          {nested ? (
            <View style={styles.headerCenter}>
              <Text style={[styles.headerEyebrow, { color: darkSubtle }]} numberOfLines={1}>
                {caseId ? (detail?.case.reference ?? "CASE REVIEW") : `${screens[parent].title.toUpperCase()} / SUB-SCREEN`}
              </Text>
              <Text style={[styles.brandTitle, { color: darkInk, fontSize: scaleFont(fontSizes.heading) }]} numberOfLines={1}>
                {caseId ? "Application review" : screens[screen].title}
              </Text>
            </View>
          ) : (
            <View style={styles.brand}>
              <Image source={require("./assets/ceda.png")} accessibilityLabel="CEDA Innovation" resizeMode="contain" style={styles.logo} />
              <View style={styles.brandTextWrap}>
                <Text style={[styles.brandTitle, { color: darkInk, fontSize: scaleFont(fontSizes.heading) }]}>Innovation</Text>
                <Text style={[styles.brandSubtitle, { color: darkSubtle }]} numberOfLines={1}>{roleSubtitle}</Text>
              </View>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={alerts.length ? `Notifications, ${alerts.length} assessment alerts` : "Notifications"}
            onPress={() => navigate("notifications")}
            disabled={caseBusy}
            style={({ pressed }) => [styles.headerAction, pressed && { opacity: 0.7 }]}
          >
            <InnovatorIcon name="bell" color={colors.navy} />
            {alerts.length > 0 && <View style={styles.bellDot} />}
          </Pressable>
        </View>

        <ScrollView
          ref={scroll}
          style={styles.body}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            { paddingBottom: nested ? Math.max(insets.bottom, 24) : 24 },
          ]}
          refreshControl={caseId ? undefined : <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.rust} colors={[colors.rust]} />}
        >
          {caseId ? (
            caseLoading ? <ActivityIndicator accessibilityLabel="Loading application" size="large" color={colors.rust} />
            : detail ? <AssessorCaseView key={caseId} account={account} detail={detail} staff={data?.staff ?? []} initialTab={currentCaseTab.current} onTabChange={tab => { currentCaseTab.current = tab; }} releaseVerified={verifiedToken === account.token || isTokenAal2(account.token)} onVerifyRelease={openVerification} onBusy={setCaseBusy} onChange={onCaseChange} />
            : <GlassCard style={styles.group}><Text accessibilityRole="alert" style={styles.warning}>{caseError || "The application is unavailable."}</Text><ActionButton label="Retry" onPress={() => setCaseRetry(current => current + 1)} /></GlassCard>
          ) : (
            <>
              {(screen === "overview" || screen === "more") && (
                <>
                  <FrostedSearchPill
                    value={workspaceSearch}
                    onChangeText={setWorkspaceSearch}
                    placeholder="Search screens, tools & controls"
                  />
                  {!!lowerWorkspaceSearch && (
                    <GlassCard style={styles.groupCompact}>
                      <Text style={styles.sectionHeaderLabel}>QUICK JUMP</Text>
                      {quickJumpMatches.length ? quickJumpMatches.map((entry, index) => {
                        const meta = screens[entry];
                        return (
                          <IconRow
                            key={entry}
                            title={meta.title}
                            detail={meta.detail}
                            icon={meta.icon}
                            color={meta.color}
                            tint={meta.tint}
                            badge={tabs.includes(entry as Tab) ? "Tab" : "Sub-screen"}
                            last={index === quickJumpMatches.length - 1}
                            onPress={() => navigate(entry)}
                          />
                        );
                      }) : <Text style={styles.copy}>No screens match your search.</Text>}
                    </GlassCard>
                  )}
                </>
              )}

              {nested && screens[screen].summary && (
                <SubscreenHero
                  icon={screens[screen].icon}
                  color={screens[screen].color}
                  tint={screens[screen].tint}
                  eyebrow={screens[screen].category}
                  title={screens[screen].title}
                  badge={screens[screen].badge}
                  summary={screens[screen].summary}
                />
              )}

              {error && <GlassCard style={styles.group}><Text accessibilityRole="alert" style={styles.warning}>{error}</Text><ActionButton label="Retry connection" onPress={() => void load()} /></GlassCard>}
              {!data && loading && (
                <GlassCard style={{ alignItems: "center", gap: 12, paddingVertical: 24 }}>
                  <ActivityIndicator accessibilityLabel="Loading assessor workspace" size="large" color={colors.rust} />
                  <Text style={styles.loadingTitle}>Loading your {roleName} workspace…</Text>
                </GlassCard>
              )}

              {screen === "overview" && data && (() => {
                const caseById = new Map(cases.map(item => [item.id, item]));
                if (lead) {
                  const summary = buildLeadOverview(cases, data.staff ?? []);
                  const pipelineSegments = summary.pipeline.some(entry => entry.count > 0)
                    ? summary.pipeline.map(entry => ({ value: entry.count, color: entry.color }))
                    : [{ value: 1, color: "#EEF0F3" }];
                  return (
                    <>
                      <View style={styles.overviewHeading}>
                        <Text accessibilityRole="header" style={styles.overviewTitle}>Welcome, {firstName}</Text>
                        <Text style={styles.overviewDate}>{todayLabel}</Text>
                      </View>
                      <View style={styles.roleBadgePill}>
                        <FrostedSurface variant="bar" borderRadius={999} />
                        <View style={styles.roleBadgeDot} />
                        <Text style={styles.roleBadgeText}>{roleSubtitle}</Text>
                        <Text style={styles.roleBadgeCaption}>
                          {summary.activeApplications} active · {summary.staffCount} assessors
                        </Text>
                      </View>

                      <View style={styles.kpiGrid}>
                        <MetricTile
                          label="New applications"
                          value={String(summary.newApplications.count)}
                          caption={summary.newApplications.stagedCount ? `${summary.newApplications.stagedCount} staged` : "Open library"}
                          icon="applications"
                          color={overviewColors.blue}
                          onPress={() => navigate("library")}
                        />
                        <MetricTile
                          label="Action needed"
                          value={String(summary.decisions.count)}
                          caption={summary.decisions.count ? `${summary.decisions.closedCount} final · ${summary.decisions.votingCount} vote` : "Decisions clear"}
                          icon="alert"
                          color={overviewColors.rust}
                          onPress={() => navigate("library")}
                        />
                        <MetricTile
                          label="Submitted reviews"
                          value={`${summary.reviews.reviewedAppsCount}/${summary.reviews.totalAppsCount}`}
                          caption={`${summary.reviews.coveragePct}% · ${summary.reviews.totalSubmittedReviews} reviews`}
                          icon="pulse"
                          color={overviewColors.teal}
                          onPress={() => navigate("progress")}
                        />
                        <MetricTile
                          label="Outcomes decided"
                          value={String(summary.outcomes.decidedCount)}
                          caption={summary.outcomes.awarded ? `${summary.outcomes.approved} appr · ${summary.outcomes.awarded} awd · ${summary.outcomes.rejected} rej` : `${summary.outcomes.approved} appr · ${summary.outcomes.rejected} rej`}
                          icon="check"
                          color={overviewColors.green}
                          onPress={() => navigate("library")}
                        />
                      </View>

                      <InsightCard title="Application pipeline" action="Library" onPress={() => navigate("library")}>
                        <View style={styles.visualRow}>
                          <Ring segments={pipelineSegments} center={String(summary.totalApplications)} label="Applications" />
                          <Breakdown entries={summary.pipeline.map(entry => ({ label: entry.label, value: entry.count, color: entry.color }))} maxValue={Math.max(1, summary.totalApplications)} />
                        </View>
                      </InsightCard>

                      <InsightCard title="Submitted reviews & funnel" action="Progress" onPress={() => navigate("progress")}>
                        <View style={styles.visualRow}>
                          <Ring
                            segments={[
                              { value: summary.reviews.reviewedAppsCount, color: overviewColors.teal },
                              { value: Math.max(summary.reviews.reviewedAppsCount ? 0 : 1, summary.reviews.totalAppsCount - summary.reviews.reviewedAppsCount), color: "#EEF0F3" },
                            ]}
                            center={`${summary.reviews.reviewedAppsCount}/${summary.reviews.totalAppsCount}`}
                            label="Apps reviewed"
                          />
                          <View style={styles.coverageFacts}>
                            <FactRow label="App review coverage" value={`${summary.reviews.coveragePct}%`} />
                            <FactRow label="Fully reviewed panels" value={String(summary.reviews.fullyReviewedAppsCount)} />
                            <FactRow label="Assessor reviews" value={`${summary.reviews.totalSubmittedReviews}/${summary.reviews.totalAssignedSlots}`} last />
                          </View>
                        </View>
                        <Text style={styles.subheading}>Workflow stage breakdown</Text>
                        <Breakdown entries={summary.funnel.map(entry => ({ label: entry.label, value: entry.count, color: entry.color }))} maxValue={Math.max(1, summary.activeApplications)} />
                      </InsightCard>

                      <InsightCard title="Sector workload & deadlines" action="Reports" onPress={() => navigate("reports")}>
                        {summary.sectors.length ? (
                          <Breakdown
                            entries={summary.sectors.map(entry => ({
                              label: `${entry.sector} (${entry.reviewed}/${entry.total} rev · ${entry.staffCount} staff)`,
                              value: entry.total,
                              color: overviewColors.blue,
                            }))}
                            maxValue={Math.max(1, ...summary.sectors.map(entry => entry.total))}
                          />
                        ) : (
                          <Text style={styles.copy}>No sector applications are currently active.</Text>
                        )}
                        <View style={styles.healthRow}>
                          {[
                            { label: "Overdue", count: summary.deadlines.overdue, color: overviewColors.rust },
                            { label: "Due <=48h", count: summary.deadlines.dueSoon, color: overviewColors.amber },
                            { label: "On track", count: summary.deadlines.onTrack, color: overviewColors.green },
                            { label: "On hold", count: summary.deadlines.onHold, color: overviewColors.purple },
                          ].map(item => (
                            <View key={item.label} style={styles.healthPill}>
                              <View style={[styles.healthDot, { backgroundColor: item.color }]} />
                              <Text style={styles.caption}>{item.label}</Text>
                              <Text style={styles.healthCount}>{item.count}</Text>
                            </View>
                          ))}
                        </View>
                      </InsightCard>

                      <InsightCard title="Decisions & lead action queue" action="Library" onPress={() => navigate("library")}>
                        {summary.actionQueue.length ? summary.actionQueue.slice(0, 6).map((entry, index) => {
                          const targetCase = caseById.get(entry.item.id);
                          const tone = assessorStatusTone(entry.badge);
                          return (
                            <IconRow
                              key={`${entry.kind}-${entry.item.id}`}
                              title={entry.item.title}
                              detail={`${entry.item.reference} · ${entry.detail}`}
                              icon={entry.targetTab === "Decision" ? "check" : "people"}
                              color={tone.color}
                              tint={tone.tint}
                              last={index === Math.min(summary.actionQueue.length, 6) - 1}
                              onPress={() => { if (targetCase) open(targetCase, entry.targetTab); }}
                            >
                              <TonePill label={entry.badge} />
                            </IconRow>
                          );
                        }) : <Text style={styles.copy}>All panel assignments and decisions are up to date.</Text>}
                      </InsightCard>

                      {alerts.length > 0 && (
                        <GlassCard style={styles.group}>
                          <SectionHeader title="My personal review tasks" />
                          {caseDirectoryRows(alerts.slice(0, 5), item => open(item, item.roundState === "voting" ? "Decision" : "Assessment"), "assessments", "No personal review tasks", "All assigned reviews are up to date.")}
                        </GlassCard>
                      )}
                    </>
                  );
                }

                const standard = buildAssessorOverview(cases);
                const standardSegments = standard.breakdown.some(entry => entry.count > 0)
                  ? standard.breakdown.map(entry => ({ value: entry.count, color: entry.color }))
                  : [{ value: 1, color: "#EEF0F3" }];
                return (
                  <>
                    <View style={styles.overviewHeading}>
                      <Text accessibilityRole="header" style={styles.overviewTitle}>Welcome, {firstName}</Text>
                      <Text style={styles.overviewDate}>{todayLabel}</Text>
                    </View>
                    <View style={styles.roleBadgePill}>
                      <FrostedSurface variant="bar" borderRadius={999} />
                      <View style={styles.roleBadgeDot} />
                      <Text style={styles.roleBadgeText}>{roleSubtitle}</Text>
                      <Text style={styles.roleBadgeCaption}>{standard.assignedCount} assigned · Live workspace</Text>
                    </View>

                    <View style={styles.kpiGrid}>
                      <MetricTile
                        label="Assigned to me"
                        value={String(standard.assignedCount)}
                        caption="Active assignments"
                        icon="applications"
                        color={overviewColors.blue}
                        onPress={() => navigate("assessments")}
                      />
                      <MetricTile
                        label="Declaration due"
                        value={String(standard.declarationDueCount)}
                        caption="Confirm conflict"
                        icon="shield"
                        color={overviewColors.purple}
                        onPress={() => navigate("assessments")}
                      />
                      <MetricTile
                        label="Open to review"
                        value={String(standard.toReviewCount)}
                        caption={`${standard.inProgressCount} started`}
                        icon="clock"
                        color={overviewColors.amber}
                        onPress={() => navigate("assessments")}
                      />
                      <MetricTile
                        label="Submitted"
                        value={`${standard.submittedCount}/${standard.assignedCount}`}
                        caption={`${standard.completionPct}% completed`}
                        icon="check"
                        color={overviewColors.green}
                        onPress={() => navigate("assessments")}
                      />
                    </View>

                    <InsightCard title="My review progress" action="Assessments" onPress={() => navigate("assessments")}>
                      <View style={styles.visualRow}>
                        <Ring segments={standardSegments} center={`${standard.completionPct}%`} label="Submitted" />
                        <Breakdown entries={standard.breakdown.map(entry => ({ label: entry.label, value: entry.count, color: entry.color }))} maxValue={Math.max(1, standard.assignedCount)} />
                      </View>
                    </InsightCard>
                    <GlassCard style={styles.group}>
                      <SectionHeader title="Needs your attention" />
                      {caseDirectoryRows(alerts.slice(0, 5), item => open(item, item.roundState === "voting" ? "Decision" : "Assessment"), "assessments", "No pending actions", "There are no pending declarations, reviews or votes.")}
                    </GlassCard>
                  </>
                );
              })()}

              {showCaseList && data && (() => {
                const hasActiveFilters = Boolean(lowerQuery || filter !== "All" || statusFilter !== "All" || industryFilter !== "All");
                const showFilterFunnel = (screen === "assessments" || screen === "library") && (industries.length > 0 || statuses.length > 0);
                const filterBadgeActive = statusFilter !== "All" || industryFilter !== "All";
                const pillOptions: { label: string; color: string; tint: string }[] = screen === "assessments"
                  ? [
                    { label: "All", color: colors.navy, tint: "#F1F3F6" },
                    { label: "To review", color: colors.amber, tint: "#FCF4E4" },
                    { label: "In progress", color: colors.blue, tint: "#EAF1FC" },
                    { label: "Submitted", color: colors.teal, tint: "#E4F4F0" },
                    ...(assessmentsSummary.previous.length ? [{ label: "Previous rounds", color: colors.muted, tint: "#F1F3F6" }] : []),
                    ...(lead && assessmentsSummary.assignedCount > 0 ? [{ label: "Assigned to me", color: colors.purple, tint: "#F0ECFB" }] : []),
                  ]
                  : screen === "library"
                    ? [
                      { label: "All", color: colors.navy, tint: "#F1F3F6" },
                      { label: "New", color: colors.blue, tint: "#EAF1FC" },
                      { label: "Under review", color: colors.amber, tint: "#FCF4E4" },
                      { label: "Approved", color: colors.teal, tint: "#E4F4F0" },
                      ...(librarySummary.awarded > 0 ? [{ label: "Awarded", color: "#7C5317", tint: "#FFF3D8" }] : []),
                      { label: "Rejected", color: "#903925", tint: "#FBEDE8" },
                      ...(!lead ? [{ label: "Assigned to me", color: colors.purple, tint: "#F0ECFB" }] : []),
                    ]
                    : [];

                return (
                  <>
                    {!nested && (
                      <View style={styles.overviewHeading}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text accessibilityRole="header" style={styles.overviewTitle}>{screens[screen].title}</Text>
                          <Text style={styles.caption}>{screens[screen].detail}</Text>
                        </View>
                        {screen === "library" && (
                          <View style={styles.sectorTag}><Text style={styles.sectorTagText}>{librarySummary.all} total</Text></View>
                        )}
                      </View>
                    )}

                    {screen === "assessments" && (
                      <>
                        <InsightCard title="Assessment progress">
                          <View style={styles.visualRow}>
                            <Ring
                              segments={assessmentsSummary.breakdown.some(entry => entry.count > 0)
                                ? assessmentsSummary.breakdown.map(entry => ({ value: entry.count, color: entry.color }))
                                : [{ value: 1, color: "#EEF0F3" }]}
                              center={`${assessmentsSummary.completionPct}%`}
                              label="Submitted"
                            />
                            <Breakdown
                              entries={assessmentsSummary.breakdown.map(entry => ({ label: entry.label, value: entry.count, color: entry.color }))}
                              maxValue={Math.max(1, assessmentsSummary.activeTotal)}
                            />
                          </View>
                        </InsightCard>
                        <View style={styles.assessmentStatusRow}>
                          {[
                            { label: "To review", count: assessmentsSummary.toReview.length, color: overviewColors.amber },
                            { label: "In progress", count: assessmentsSummary.inProgress.length, color: overviewColors.blue },
                            { label: "Submitted", count: assessmentsSummary.submitted.length, color: overviewColors.green },
                          ].map(status => (
                            <Pressable
                              key={status.label}
                              accessibilityRole="button"
                              accessibilityState={{ selected: filter === status.label }}
                              onPress={() => setFilter(current => current === status.label ? "All" : status.label)}
                              style={[styles.assessmentStatusCard, filter === status.label && styles.assessmentStatusSelected]}
                            >
                              <FrostedSurface variant="card" borderRadius={16} />
                              <Text style={[styles.metricValue, { color: status.color }]}>{status.count}</Text>
                              <Text style={styles.caption}>{status.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </>
                    )}

                    <FrostedSearchPill
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Search title, reference or industry"
                      rightButton={showFilterFunnel ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Filter applications by industry or status. ${industryFilter === "All" ? "All industries" : industryFilter}`}
                          accessibilityState={{ expanded: filterSheetOpen }}
                          onPress={() => { Keyboard.dismiss(); setFilterSheetOpen(true); }}
                          style={[styles.funnelButton, filterBadgeActive && styles.funnelSelected]}
                        >
                          <FrostedSurface variant="bar" borderRadius={buttonCornerRadius} />
                          <View accessible={false} style={styles.funnel}>
                            <View style={[styles.funnelTop, { borderTopColor: filterBadgeActive ? colors.blue : colors.muted }]} />
                            <View style={[styles.funnelStem, { backgroundColor: filterBadgeActive ? colors.blue : colors.muted }]} />
                          </View>
                          {filterBadgeActive && <View style={styles.filterDot} />}
                        </Pressable>
                      ) : undefined}
                    />

                    {pillOptions.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
                        {pillOptions.map(option => {
                          const selected = filter === option.label;
                          return (
                            <Pressable
                              key={option.label}
                              accessibilityRole="button"
                              accessibilityState={{ selected }}
                              onPress={() => setFilter(option.label)}
                              style={[
                                styles.pill,
                                selected && {
                                  backgroundColor: option.label === "All" ? colors.navy : option.tint,
                                  borderColor: option.label === "All" ? colors.navy : option.tint,
                                },
                              ]}
                            >
                              {option.label !== "All" && <View style={[styles.toneDot, { backgroundColor: option.color }]} />}
                              <Text
                                style={[
                                  styles.pillText,
                                  selected && { color: option.label === "All" ? colors.white : option.color, fontWeight: "700" },
                                ]}
                              >
                                {option.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    )}

                    <View style={styles.countRow}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text accessibilityLiveRegion="polite" style={styles.countSummary}>
                          <Text style={styles.countNumber}>{filtered.length}</Text>
                          {` ${filtered.length === 1 ? "application" : "applications"}`}
                          {industryFilter !== "All" ? ` · ${industryFilter}` : ""}
                          {statusFilter !== "All" ? ` · ${statusFilter}` : ""}
                        </Text>
                        <View style={styles.liveRow}>
                          <View style={[styles.toneDot, { backgroundColor: colors.teal }]} />
                          <Text style={styles.liveText}>Live workspace</Text>
                        </View>
                      </View>
                      {hasActiveFilters && (
                        <Pressable accessibilityRole="button" onPress={clearFilters} style={styles.linkTouch}>
                          <Text style={styles.inlineLink}>Clear filters</Text>
                        </Pressable>
                      )}
                    </View>

                    <GlassCard style={styles.directoryCard}>
                      {screen === "progress" ? (
                        filtered.length ? filtered.map((item, index) => (
                          <IconRow
                            key={item.id}
                            title={item.title}
                            detail={`${item.reference} · ${item.sector || "Industry pending"} · ${item.reviewCount} of ${item.memberCount} reviews`}
                            icon="pulse"
                            color={colors.teal}
                            tint="#E4F4F0"
                            last={index === filtered.length - 1}
                            onPress={() => open(item, "Panel")}
                          >
                            <TonePill label={humanCaseStatus(item, "library")} />
                          </IconRow>
                        )) : <View style={styles.emptyBox}><Text style={styles.emptyTitle}>No matching cases</Text><Text style={styles.emptyCopy}>Try adjusting your search query.</Text></View>
                      ) : screen === "messages" ? (
                        filtered.length ? filtered.map((item, index) => (
                          <IconRow
                            key={item.id}
                            title={item.title}
                            detail={item.lastMessage || "No messages yet. Open to start panel discussion"}
                            icon="messages"
                            color={colors.purple}
                            tint="#F0ECFB"
                            badge={item.unreadCount ? `${item.unreadCount} new` : undefined}
                            last={index === filtered.length - 1}
                            onPress={() => open(item, "Discussion")}
                          >
                            <View style={styles.sectorTag}><Text style={styles.sectorTagText}>{item.reference}</Text></View>
                            {item.lastMessageAt && <Text style={styles.caption}>{assessmentDate(item.lastMessageAt)} CAT</Text>}
                          </IconRow>
                        )) : <View style={styles.emptyBox}><Text style={styles.emptyTitle}>No case conversations</Text><Text style={styles.emptyCopy}>Open a case under review to start or follow its panel thread.</Text></View>
                      ) : caseDirectoryRows(
                        filtered,
                        item => open(item, screen === "assessments" ? (item.assigned ? "Assessment" : "Application") : caseTab(screen)),
                        listContext,
                        hasActiveFilters ? "No matching applications" : "No applications yet",
                        hasActiveFilters ? "Try another stage, industry or search term." : "Submitted innovations will appear here.",
                        hasActiveFilters ? clearFilters : undefined
                      )}
                    </GlassCard>
                  </>
                );
              })()}

              {screen === "more" && (
                <>
                  <View style={styles.profileCard}>
                    <FrostedSurface variant="sheet" borderRadius={22} />
                    <View style={styles.profileTop}>
                      <View style={styles.profileAvatar}>
                        <Text style={styles.profileInitials}>{initialsOf(displayName)}</Text>
                      </View>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={styles.sectionHeaderLabel}>
                          {lead ? "LEAD ASSESSOR WORKSPACE" : "ASSESSOR WORKSPACE"}
                        </Text>
                        <Text accessibilityRole="header" style={styles.profileName}>{displayName}</Text>
                        <View style={styles.directoryTags}>
                          <TonePill label={roleName} />
                          <View style={styles.sectorTag}>
                            <Text style={styles.sectorTagText}>
                              {data?.profile.sectors?.length ? data.profile.sectors.join(", ") : "All industries"}
                            </Text>
                          </View>
                          <TonePill label={`Expires ${sessionExpiry}`} />
                        </View>
                      </View>
                    </View>
                    <Text style={styles.copyMuted}>
                      {lead ? "Oversee all applications, assign review panels and manage decisions. Session stays in memory on this device." : "Review assigned innovations privately. Session stays in memory on this device."}
                    </Text>
                    <View style={styles.profileActions}>
                      <Pressable accessibilityRole="button" onPress={() => navigate("account")} style={({ pressed }) => [styles.profileQuickButton, pressed && { opacity: 0.72 }]}>
                        <InnovatorIcon name="shield" color={colors.teal} />
                        <Text style={styles.profileQuickText}>Account &amp; security</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" onPress={onSignOut} style={({ pressed }) => [styles.profileSignOutButton, pressed && { opacity: 0.72 }]}>
                        <Text style={styles.profileSignOutText}>Sign out</Text>
                      </Pressable>
                    </View>
                  </View>

                  {lead && navigationGroup("LEAD ASSESSOR TOOLS", leadSections)}
                  {navigationGroup("ASSESSMENT TOOLS", ["guidance", "notifications"])}
                  {navigationGroup("ACCOUNT & SECURITY", ["account"])}
                </>
              )}

              {screen === "reports" && lead && (() => {
                const bySector = new Map<string, { cases: number; reviews: number; released: number }>();
                for (const item of managed) {
                  const key = item.sector || "Industry pending";
                  const row = bySector.get(key) || { cases: 0, reviews: 0, released: 0 };
                  row.cases += 1;
                  row.reviews += item.reviewCount || 0;
                  row.released += Number(item.roundState === "released");
                  bySector.set(key, row);
                }
                return (
                  <>
                    <GlassCard style={styles.group}>
                      <SectionHeader title="Assessment workload" subtitle="Portfolio totals across all industries" />
                      <FactRow label="Cases in scope" value={String(managed.length)} />
                      <FactRow label="Pending panel setup" value={String(managed.filter(item => !item.roundState || item.roundState === "setup").length)} />
                      <FactRow label="In review" value={String(managed.filter(item => item.roundState === "review").length)} />
                      <FactRow label="Voting open" value={String(managed.filter(item => item.roundState === "voting").length)} />
                      <FactRow label="Awaiting information" value={String(managed.filter(item => item.roundState === "awaiting-information").length)} />
                      <FactRow label="Outcomes released" value={String(managed.filter(item => item.roundState === "released").length)} last />
                    </GlassCard>
                    <GlassCard style={styles.group}>
                      <SectionHeader title="By industry" subtitle="Submitted reviews and outcomes per sector" />
                      {bySector.size ? [...bySector.entries()].map(([sector, row], index) => (
                        <IconRow
                          key={sector}
                          title={sector}
                          detail={`${row.reviews} submitted review${row.reviews === 1 ? "" : "s"} · ${row.released} released`}
                          icon="sector"
                          color={colors.blueSoft}
                          tint="#EAF1FC"
                          badge={`${row.cases} case${row.cases === 1 ? "" : "s"}`}
                          last={index === bySector.size - 1}
                        />
                      )) : <Text style={styles.copyMuted}>No applications are currently available.</Text>}
                    </GlassCard>
                  </>
                );
              })()}

              {screen === "guidance" && (() => {
                const activeRubric = normalizeRubricCriteria(data?.rubric?.criteria);
                const rubricVer = data?.rubric?.version ?? 1;
                const passThreshold = data?.rubric?.passThreshold ?? 60;
                return (
                  <>
                    <GlassCard style={styles.group}>
                      <SectionHeader
                        title={`Assessment rubric v${rubricVer} (${activeRubric.length} criteria)`}
                        subtitle={`Score each criterion 1 to 5. Weights total 100% · Pass benchmark ${passThreshold}%.`}
                      />
                      {activeRubric.map((item, index) => (
                        <IconRow
                          key={item.key}
                          title={item.label}
                          detail={item.description || `Criterion ${index + 1}`}
                          icon="check"
                          color={colors.teal}
                          tint="#E4F4F0"
                          badge={`${item.weight}% weight`}
                          last={index === activeRubric.length - 1}
                        />
                      ))}
                    </GlassCard>
                    <GlassCard style={styles.group}>
                      <SectionHeader title="Review rules" />
                      <Text style={styles.copy}>Declare conflicts before viewing evidence. Save a draft as you work and submit when all {activeRubric.length} active criterion ratings and rationales are complete.</Text>
                      <Text style={styles.copy}>Once voting opens, eligible panel members with submitted reviews can vote. Keep case evidence and internal discussions private.</Text>
                    </GlassCard>
                  </>
                );
              })()}

              {screen === "notifications" && data && (
                <GlassCard style={styles.group}>
                  <SectionHeader title="Assessment alerts" subtitle={`${alerts.length} item${alerts.length === 1 ? "" : "s"} requiring attention`} />
                  {alerts.length ? alerts.map((item, index) => (
                    <IconRow
                      key={item.id}
                      title={item.title}
                      detail={item.conflict === "pending" ? `${item.reference} · Conflict declaration required` : `${item.reference} · ${item.roundState === "voting" ? "Voting ends" : "Assessment due"} ${assessmentDate(item.deadline)} CAT`}
                      icon={item.conflict === "pending" ? "shield" : "clock"}
                      color={item.conflict === "pending" ? colors.purple : colors.rust}
                      tint={item.conflict === "pending" ? "#F0ECFB" : "#FBEDE8"}
                      badge={item.conflict === "pending" ? "Declaration" : item.roundState === "voting" ? "Vote due" : "Review due"}
                      last={index === alerts.length - 1}
                      onPress={() => open(item, item.roundState === "voting" ? "Decision" : "Assessment")}
                    />
                  )) : (
                    <View style={styles.emptyBox}>
                      <Text style={styles.emptyTitle}>All caught up</Text>
                      <Text style={styles.emptyCopy}>You have no pending declarations, reviews or votes.</Text>
                    </View>
                  )}
                </GlassCard>
              )}

              {screen === "account" && (
                <>
                  <GlassCard style={styles.group}>
                    <SectionHeader title="Profile & session" />
                    <FactRow label="Name" value={displayName} />
                    <FactRow label="Role" value={roleSubtitle} />
                    <FactRow label="Session expires" value={`${assessmentDate(new Date(account.expiresAt).toISOString())} CAT`} />
                    <FactRow label="Authenticator verification" value={verifiedToken === account.token || isTokenAal2(account.token) ? "Verified" : "Pending"} last />
                    {sessionError ? <Text accessibilityRole="alert" style={styles.warning}>{sessionError}</Text> : null}
                    {sessionNotice ? <Text accessibilityLiveRegion="polite" style={styles.copy}>{sessionNotice}</Text> : null}
                    <View style={styles.inlineButtonRow}>
                      <ActionButton label="Sign out other devices" variant="secondary" compact loading={endingSessions} onPress={() => void endOtherSessions()} />
                      <ActionButton label="Sign out" variant="secondary" compact onPress={onSignOut} />
                    </View>
                  </GlassCard>
                  <AccountSecurityCards
                    account={account}
                    friendlyName="CEDA Assessor Mobile"
                    onAccountChange={next => {
                      setVerifiedToken(next.token);
                      onAccountChange(next);
                    }}
                  />
                </>
              )}
            </>
          )}
        </ScrollView>

        {!nested && (
          <View accessibilityRole="tablist" style={[styles.tabBar, darkMode && { borderTopColor: "rgba(240,220,200,0.08)" }, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <FrostedSurface variant="bar" />
            {tabs.map(entry => {
              const active = entry === screen;
              const tabEl = (
                <Pressable
                  key={entry}
                  accessibilityRole="tab"
                  accessibilityLabel={screens[entry].title}
                  accessibilityState={{ selected: active }}
                  onPress={() => navigate(entry)}
                  style={({ pressed }) => [styles.tab, active && [styles.selected, darkMode && { backgroundColor: "rgba(224,112,96,0.16)" }], pressed && !active && { opacity: 0.72 }]}
                >
                  <View>
                    <InnovatorIcon name={screens[entry].icon} color={active ? colors.rust : darkMuted} />
                    {entry === "messages" && totalUnread > 0 && <View style={styles.tabUnreadDot} />}
                  </View>
                  <Text numberOfLines={1} style={[styles.tabLabel, { color: darkMuted }, active && styles.selectedText]}>
                    {screens[entry].short ?? screens[entry].title}
                  </Text>
                </Pressable>
              );
              if (entry === "overview" || entry === "assessments" || entry === "library" || entry === "messages") {
                return (
                  <TourTarget key={entry} id={`assessor.${entry}`} style={{ flex: 1 }}>
                    {tabEl}
                  </TourTarget>
                );
              }
              return tabEl;
            })}
          </View>
        )}

        <Modal visible={drawerOpen} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
          <FrostedModalBackdrop>
            <View style={styles.drawerBackdrop}>
              <Pressable accessibilityRole="button" accessibilityLabel="Close assessor menu" onPress={() => setDrawerOpen(false)} style={StyleSheet.absoluteFill} />
              <View accessibilityViewIsModal style={[styles.drawer, darkMode && { borderColor: "rgba(240,220,200,0.12)" }, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 18) }]}>
                <FrostedSurface variant="sheet" />
                <View style={[styles.drawerHeading, darkMode && { borderBottomColor: "rgba(240,220,200,0.08)" }]}>
                  <View style={styles.drawerBrand}>
                    <Image source={require("./assets/ceda.png")} resizeMode="contain" style={styles.logo} accessibilityLabel="CEDA Innovation" />
                    <View style={{ flex: 1 }}>
                      <Text accessibilityRole="header" style={[styles.drawerHeadingTitle, { color: darkInk }]}>{roleName} Portal</Text>
                      <Text style={[styles.brandSubtitle, { color: darkSubtle }]} numberOfLines={1}>{roleSubtitle}</Text>
                    </View>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={() => setDrawerOpen(false)} style={({ pressed }) => [styles.closeCircle, darkMode && { backgroundColor: "#252018", borderColor: "rgba(240,220,200,0.16)" }, pressed && { opacity: 0.7 }]}>
                    <InnovatorIcon name="close" color={darkInk} />
                  </Pressable>
                </View>

                <View style={[styles.drawerStatsRow, darkMode && { borderBottomColor: "rgba(240,220,200,0.08)" }]}>
                  {[
                    [String(cases.length), "Total"],
                    [String(mine.filter(item => !item.submitted).length), "To review"],
                    [String(alerts.length), "Alerts"],
                  ].map(([value, label]) => (
                    <View key={label} style={styles.drawerStatItem}>
                      <Text style={[styles.drawerStatValue, { color: darkInk }]}>{value}</Text>
                      <Text style={[styles.drawerStatLabel, { color: darkSubtle }]}>{label}</Text>
                    </View>
                  ))}
                </View>

                <ScrollView contentContainerStyle={styles.drawerContent}>
                  <Text style={[styles.drawerSectionLabel, { color: darkSubtle }]}>ACCESSIBILITY &amp; TALKBACK</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Take guided portal tour"
                    onPress={() => {
                      setDrawerOpen(false);
                      setTimeout(() => startTour("assessor"), 200);
                    }}
                    style={styles.drawerLink}
                  >
                    <View style={[styles.drawerIcon, { backgroundColor: darkMode ? "#17332d" : "#E4F4F0" }]}>
                      <MobileIcon name="compass" color={colors.teal} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.drawerItemTitle, { color: darkInk }]}>Take Portal Tour</Text>
                      <Text numberOfLines={1} style={[styles.drawerSub, { color: darkSubtle }]}>Guided walkthrough of key tools</Text>
                    </View>
                    <Text style={[styles.chevron, { color: darkSubtle }]} accessible={false}>{"\u203a"}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open Accessibility and TalkBack settings"
                    onPress={() => {
                      setDrawerOpen(false);
                      openA11yModal();
                    }}
                    style={styles.drawerLink}
                  >
                    <View style={[styles.drawerIcon, { backgroundColor: darkMode ? "#2e1c18" : "#FBEDE8" }]}>
                      <MobileIcon name="accessibility" color={colors.rust} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.drawerItemTitle, { color: darkInk }]}>Accessibility &amp; TalkBack</Text>
                      <Text numberOfLines={1} style={[styles.drawerSub, { color: darkSubtle }]}>Dark mode, text size &amp; speech feedback</Text>
                    </View>
                    <Text style={[styles.chevron, { color: darkSubtle }]} accessible={false}>{"\u203a"}</Text>
                  </Pressable>

                  {[
                    { heading: "MAIN WORKSPACE", items: tabs.filter(entry => entry !== "more") as Screen[] },
                    ...(lead ? [{ heading: "LEAD ASSESSOR TOOLS", items: [...leadSections] as Screen[] }] : []),
                    { heading: "ACCOUNT & TOOLS", items: [...otherSections] as Screen[] },
                  ].map((group) => (
                    <View key={group.heading} style={{ marginTop: 10 }}>
                      <Text style={[styles.drawerSectionLabel, { color: darkSubtle }]}>{group.heading}</Text>
                      {group.items.map(entry => {
                        const meta = screens[entry];
                        const active = screen === entry && !caseId;
                        return (
                          <Pressable
                            key={entry}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            onPress={() => navigate(entry)}
                            style={[styles.drawerLink, active && [styles.drawerLinkActive, darkMode && { backgroundColor: "rgba(224,112,96,0.16)" }]]}
                          >
                            <View style={[styles.drawerIcon, { backgroundColor: meta.tint }]}>
                              <InnovatorIcon name={meta.icon} color={meta.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.drawerItemTitle, { color: darkInk }, active && { color: colors.rust }]}>{meta.title}</Text>
                              <Text numberOfLines={1} style={[styles.drawerSub, { color: darkSubtle }]}>{meta.detail}</Text>
                            </View>
                            <Text style={[styles.chevron, { color: darkSubtle }]} accessible={false}>{"\u203a"}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </ScrollView>

                <View style={[styles.drawerAccount, darkMode && { borderTopColor: "rgba(240,220,200,0.08)" }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.drawerItemTitle, { color: darkInk }]}>{displayName}</Text>
                    <Text numberOfLines={1} style={[styles.drawerSub, { color: darkSubtle }]}>{roleSubtitle}</Text>
                  </View>
                  <ActionButton label="Sign out" variant="secondary" compact onPress={onSignOut} />
                </View>
              </View>
            </View>
          </FrostedModalBackdrop>
        </Modal>

        <FlushSheetModal
          visible={filterSheetOpen}
          title="Filter applications"
          eyebrow={screens[screen].title.toUpperCase()}
          onClose={() => setFilterSheetOpen(false)}
        >
          <View style={styles.group}>
            {[
              ...(industries.length > 0 ? [{ heading: "INDUSTRY", icon: "sector" as const, options: ["All", ...industries], selectedValue: industryFilter, onChoose: setIndustryFilter, allLabel: "All industries" }] : []),
              ...(statuses.length > 1 ? [{ heading: "STATUS", icon: "check" as const, options: ["All", ...statuses], selectedValue: statusFilter, onChoose: setStatusFilter, allLabel: "All statuses" }] : []),
            ].map((section, groupIndex) => (
              <View key={section.heading} style={groupIndex > 0 ? { marginTop: 8 } : undefined}>
                <Text style={styles.sectionHeaderLabel}>{section.heading}</Text>
                {section.options.map((option, index) => {
                  const selected = section.selectedValue === option;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      onPress={() => { section.onChoose(option); setFilterSheetOpen(false); }}
                      style={[styles.sheetOption, index === 0 && { borderTopWidth: 0 }]}
                    >
                      <View style={[styles.sheetOptionIcon, selected && { backgroundColor: "#EAF1FC" }]}>
                        <MobileIcon name={section.icon} color={selected ? colors.blue : colors.muted} />
                      </View>
                      <Text style={styles.sheetOptionText}>{option === "All" ? section.allLabel : option}</Text>
                      <View style={[styles.radio, selected && { borderColor: colors.blue }]}>
                        {selected && <View style={styles.radioDot} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            {(industryFilter !== "All" || statusFilter !== "All") && (
              <ActionButton
                label="Reset industry & status filters"
                variant="secondary"
                onPress={() => { setIndustryFilter("All"); setStatusFilter("All"); setFilterSheetOpen(false); }}
              />
            )}
          </View>
        </FlushSheetModal>

        <FlushSheetModal visible={verificationOpen} title="Verify authenticator" eyebrow="Account security" onClose={() => { if (!verificationBusy) setVerificationOpen(false); }}>
          <View style={styles.group}>
            <FormField label="Authenticator code" hint="Enter the six-digit code from your authenticator app.">
              <FrostedInput accessibilityLabel="Authenticator code" keyboardType="number-pad" textContentType="oneTimeCode" value={verificationCode} onChangeText={value => setVerificationCode(value.replace(/\D/g, ""))} maxLength={6} editable={!verificationBusy} />
            </FormField>
            {verificationError ? <Text accessibilityRole="alert" style={styles.warning}>{verificationError}</Text> : null}
            <ActionButton label="Verify code" loading={verificationBusy} disabled={verificationCode.length !== 6} onPress={() => void verifyRelease()} />
            <ActionButton
              label="Set up authenticator in Account & security"
              variant="secondary"
              onPress={() => {
                setVerificationOpen(false);
                navigate("account");
              }}
            />
          </View>
        </FlushSheetModal>
      </FrostedScreenBackdrop>
    </View>
  );
}

const hairline = "rgba(36, 28, 25, 0.07)";
const cardShadow = {
  shadowColor: "#241C19",
  shadowOpacity: 0.05,
  shadowOffset: { width: 0, height: 6 },
  shadowRadius: 14,
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  body: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 14, gap: 16, width: "100%", maxWidth: 760, alignSelf: "center" },
  group: { gap: 10 },
  groupCompact: { gap: 2, paddingVertical: 4 },
  inlineButtonRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 4 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.88)", overflow: "hidden" },
  headerAction: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.82)", borderWidth: 1, borderColor: "#E5DDD3", justifyContent: "center", alignItems: "center" },
  backAction: { backgroundColor: "#EAF1FC", borderColor: "#D9E5F7" },
  headerCenter: { flex: 1, alignItems: "center", justifyContent: "center", minWidth: 0 },
  headerEyebrow: { fontSize: fontSizes.caption, fontWeight: "700", letterSpacing: 1.1, color: colors.subtle },
  brand: { flex: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  brandTextWrap: { maxWidth: "78%" },
  logo: { width: 40, height: 36 },
  brandTitle: { fontSize: fontSizes.heading, fontWeight: "700", color: colors.navy },
  brandSubtitle: { fontSize: fontSizes.caption, color: colors.subtle, marginTop: 1 },
  bellDot: { position: "absolute", top: 9, right: 10, width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.rust, borderWidth: 1.2, borderColor: "white" },
  loadingTitle: { fontSize: fontSizes.body, fontWeight: "700", color: colors.navy },
  overviewHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  overviewTitle: { color: colors.navy, fontSize: fontSizes.title, fontWeight: "700", letterSpacing: -0.6 },
  overviewDate: { fontSize: fontSizes.subbody, lineHeight: 19, color: colors.subtle },
  roleBadgePill: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, overflow: "hidden", shadowColor: "#241C19", shadowOpacity: 0.04, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 1 },
  roleBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#BF9958" },
  roleBadgeText: { fontSize: fontSizes.caption, color: "#92713D", fontWeight: "700" },
  roleBadgeCaption: { fontSize: fontSizes.caption, color: colors.subtle },
  eyebrow: { color: colors.rustDark, fontSize: fontSizes.caption, fontWeight: "700" },
  copy: { color: colors.muted, fontSize: fontSizes.body, lineHeight: 22 },
  copyMuted: { fontSize: fontSizes.subbody, lineHeight: 19, color: colors.subtle },
  caption: { color: colors.subtle, fontSize: fontSizes.caption },
  warning: { color: colors.rustDark, fontSize: fontSizes.body },
  metricValue: { color: colors.navy, fontWeight: "700", fontSize: fontSizes.title },
  assessmentStatusRow: { flexDirection: "row", gap: 10 },
  assessmentStatusCard: { flex: 1, minHeight: 82, justifyContent: "center", padding: 14, borderRadius: 20, overflow: "hidden", ...cardShadow },
  assessmentStatusSelected: { backgroundColor: "#FBEDE8" },
  funnelButton: { width: 44, height: 44, borderRadius: buttonCornerRadius, justifyContent: "center", alignItems: "center", overflow: "hidden", shadowColor: "#241C19", shadowOpacity: 0.04, shadowOffset: { width: 0, height: 3 }, shadowRadius: 8, elevation: 1 },
  funnelSelected: { backgroundColor: "#EAF1FC" },
  funnel: { alignItems: "center" },
  funnelTop: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 9, borderLeftColor: "transparent", borderRightColor: "transparent" },
  funnelStem: { width: 3, height: 6, marginTop: -1, borderBottomRightRadius: 1 },
  filterDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.blue, position: "absolute", right: 8, top: 8 },
  pills: { gap: 8, paddingVertical: 2 },
  pill: { minHeight: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "rgba(255,250,244,0.92)", flexDirection: "row", alignItems: "center", gap: 6 },
  pillText: { color: colors.muted, fontSize: fontSizes.subbody, fontWeight: "500" },
  countRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  countSummary: { color: colors.muted, fontSize: fontSizes.subbody, lineHeight: 19 },
  countNumber: { color: colors.navy, fontWeight: "700" },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  liveText: { color: colors.teal, fontSize: fontSizes.caption, fontWeight: "600" },
  linkTouch: { minHeight: 40, justifyContent: "center", paddingHorizontal: 4 },
  inlineLink: { color: colors.blueSoft, fontSize: fontSizes.subbody, fontWeight: "600" },
  directoryCard: { paddingVertical: 4, paddingHorizontal: 16, gap: 0 },
  directoryItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: hairline },
  directoryIcon: { width: 40, height: 40, borderRadius: 14, justifyContent: "center", alignItems: "center", alignSelf: "flex-start", marginTop: 2 },
  directoryBody: { flex: 1, gap: 5 },
  referenceRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  referenceText: { color: colors.subtle, fontSize: fontSizes.caption },
  directoryTitle: { color: colors.navy, fontSize: fontSizes.body, fontWeight: "600", lineHeight: 22 },
  directoryTags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 2 },
  sectorTag: { backgroundColor: "#F3EFEA", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  sectorTagText: { color: colors.muted, fontSize: fontSizes.caption, fontWeight: "600" },
  toneBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  toneDot: { width: 6, height: 6, borderRadius: 3 },
  toneText: { fontSize: fontSizes.caption, fontWeight: "700" },
  emptyBox: { paddingVertical: 26, alignItems: "center", gap: 6 },
  emptyTitle: { color: colors.navy, fontWeight: "600", fontSize: fontSizes.body },
  emptyCopy: { color: colors.subtle, fontSize: fontSizes.subbody, lineHeight: 19, textAlign: "center" },
  profileCard: { borderRadius: 24, padding: 18, gap: 14, overflow: "hidden", ...cardShadow },
  profileTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  profileAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#FBEDE8", alignItems: "center", justifyContent: "center" },
  profileInitials: { fontSize: fontSizes.heading, fontWeight: "700", color: colors.rust },
  profileName: { fontSize: fontSizes.title, fontWeight: "700", color: colors.navy, letterSpacing: -0.4 },
  profileActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 2 },
  profileQuickButton: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: buttonCornerRadius, backgroundColor: "#E4F4F0" },
  profileQuickText: { color: colors.teal, fontSize: fontSizes.subbody, fontWeight: "700" },
  profileSignOutButton: { minHeight: 38, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, paddingVertical: 8, borderRadius: buttonCornerRadius, backgroundColor: "rgba(243,239,234,0.95)" },
  profileSignOutText: { color: colors.navy, fontSize: fontSizes.subbody, fontWeight: "600" },
  sectionBlock: { gap: 8 },
  sectionHeaderLabel: { fontSize: fontSizes.caption, fontWeight: "700", letterSpacing: 1.1, color: colors.subtle, paddingHorizontal: 4 },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.9)",
    paddingTop: 8,
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  tab: { flex: 1, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 6 },
  tabLabel: { fontSize: fontSizes.caption, color: colors.muted, textAlign: "center" },
  selected: { backgroundColor: "rgba(251,237,232,0.88)", borderRadius: 14 },
  selectedText: { color: colors.rust, fontWeight: "700" },
  tabUnreadDot: { position: "absolute", top: -1, right: -3, width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.rust },
  drawerBackdrop: { flex: 1 },
  drawer: { width: "86%", maxWidth: 360, height: "100%", borderRightWidth: 1, borderColor: "rgba(255,255,255,0.94)", overflow: "hidden" },
  drawerHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "rgba(218,208,198,0.45)" },
  drawerStatsRow: { flexDirection: "row", paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(218,208,198,0.45)", gap: 12 },
  drawerStatItem: { flex: 1, alignItems: "center", gap: 2 },
  drawerStatValue: { fontSize: fontSizes.heading, fontWeight: "700", color: colors.navy },
  drawerStatLabel: { fontSize: fontSizes.caption, color: colors.subtle },
  drawerBrand: { flex: 1, flexDirection: "row", gap: 10, alignItems: "center" },
  drawerHeadingTitle: { color: colors.navy, fontSize: fontSizes.heading, fontWeight: "700", letterSpacing: -0.3 },
  closeCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#F5F1EC", borderWidth: 1, borderColor: "#E5DDD3", alignItems: "center", justifyContent: "center" },
  drawerContent: { padding: 14, gap: 4 },
  drawerSectionLabel: { fontSize: fontSizes.caption, fontWeight: "700", letterSpacing: 1.1, color: colors.subtle, paddingHorizontal: 10, paddingVertical: 6 },
  drawerLink: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 50, borderRadius: 14 },
  drawerLinkActive: { backgroundColor: "rgba(251,237,232,0.88)" },
  drawerIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  drawerItemTitle: { color: colors.navy, fontWeight: "600", fontSize: fontSizes.body },
  drawerSub: { fontSize: fontSizes.subbody, color: colors.subtle },
  chevron: { color: "#A1A8B1", fontSize: 22 },
  drawerAccount: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingTop: 14, borderTopColor: "rgba(218,208,198,0.45)", borderTopWidth: 1 },
  sheetOption: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 52, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline },
  sheetOptionIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#F3EFEA", alignItems: "center", justifyContent: "center" },
  sheetOptionText: { color: colors.navy, fontSize: fontSizes.body, fontWeight: "600", flex: 1 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: "#D8DDE3", alignItems: "center", justifyContent: "center" },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blue },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  visualRow: { flexDirection: "row", alignItems: "center", gap: 18 },
  coverageFacts: { flex: 1, gap: 4 },
  subheading: { color: colors.muted, fontSize: fontSizes.caption, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  healthRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: hairline },
  healthPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#F8F3EC" },
  healthDot: { width: 8, height: 8, borderRadius: 4 },
  healthCount: { color: colors.navy, fontSize: fontSizes.subbody, fontWeight: "700" },
});
