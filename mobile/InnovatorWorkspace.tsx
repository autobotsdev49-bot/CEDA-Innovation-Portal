import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Account } from "./auth";
import { FrostedModalBackdrop, FrostedScreenBackdrop, FrostedSurface } from "./FrostedGlass";
import {
  fetchInnovatorBootstrap,
  getActiveOptimusSupportRequest,
  markNotificationsRead,
  type InnovatorWorkspaceData,
} from "./innovatorApi";
import type { InnovatorApplication } from "./innovatorDomain";
import { InnovatorApplicationDetail } from "./InnovatorApplicationDetail";
import { InnovatorApplications } from "./InnovatorApplications";
import { InnovatorMessages } from "./InnovatorMessages";
import {
  InnovatorDocumentsScreen,
  InnovatorMoreHub,
  InnovatorOptimusScreen,
  InnovatorSettingsScreen,
  InnovatorSupportScreen,
  MORE_SUBSCREEN_META,
  OptimusDmModal,
  type MoreSubScreenKey,
} from "./InnovatorMoreScreens";
import { InnovatorOverview } from "./InnovatorOverview";
import {
  ActionButton,
  adminStyleColors,
  FlushSheetModal,
  FrostedSearchPill,
  GlassCard,
  IconRow,
  InnovatorA11yProvider,
  InnovatorIcon,
  type InnovatorIconName,
} from "./InnovatorUI";
import { InnovatorWizard, type WizardScreenMode } from "./InnovatorWizard";
import { fontSizes } from "./theme";

const WORKSPACE_BG = require("./assets/innovation.webp");

type PrimaryTab = "home" | "applications" | "submit" | "messages" | "more";

type PendingNavAction =
  | { kind: "tab"; tab: PrimaryTab }
  | { kind: "sub"; sub: MoreSubScreenKey }
  | { kind: "detail"; appId: string; initialTab?: string }
  | { kind: "leaveWizard" };

export function InnovatorWorkspace({
  account,
  onSignOut,
  onAccountChange,
}: {
  account: Account;
  onSignOut: () => void;
  onAccountChange: (next: Account) => void;
}) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<InnovatorWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tab, setTab] = useState<PrimaryTab>("home");
  const [subScreen, setSubScreen] = useState<MoreSubScreenKey | null>(null);
  const [detailState, setDetailState] = useState<{ appId: string; initialTab?: string } | null>(null);
  const [appsStatusFilter, setAppsStatusFilter] = useState<string>("All");
  const [workspaceSearch, setWorkspaceSearch] = useState("");

  const [wizardMode, setWizardMode] = useState<WizardScreenMode>("start");
  const [wizardDraftAppId, setWizardDraftAppId] = useState<string | null>(null);
  const [wizardDirty, setWizardDirty] = useState(false);
  const wizardSaveRef = useRef<(() => Promise<boolean>) | null>(null);
  const [pendingNav, setPendingNav] = useState<PendingNavAction | null>(null);
  const [unsavedBusy, setUnsavedBusy] = useState(false);

  const [optimusPromptSeed, setOptimusPromptSeed] = useState<{ prompt: string; topic: string } | null>(null);
  const [optimusSheetOpen, setOptimusSheetOpen] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [markingNotifications, setMarkingNotifications] = useState(false);

  const loadWorkspace = useCallback(
    async (forceRefresh = false, asPullRefresh = false) => {
      if (asPullRefresh) setRefreshing(true);
      else if (!data) setLoading(true);
      setLoadError(null);
      try {
        const boot = await fetchInnovatorBootstrap(account.token, forceRefresh);
        setData(boot);
        if (boot.profile?.fullName && boot.profile.fullName !== account.name) {
          onAccountChange({ ...account, name: boot.profile.fullName });
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Could not load your Innovator workspace.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [account, data, onAccountChange]
  );

  useEffect(() => {
    void loadWorkspace(false);
  }, [account.token]);

  const isNestedScreen =
    Boolean(subScreen) || Boolean(detailState) || (tab === "submit" && wizardMode === "wizard");

  const executeNav = useCallback(
    (action: PendingNavAction) => {
      setDrawerOpen(false);
      setWorkspaceSearch("");
      if (action.kind === "leaveWizard") {
        setWizardMode("start");
        setWizardDraftAppId(null);
        setWizardDirty(false);
        setTab("applications");
        return;
      }
      if (action.kind === "tab") {
        setSubScreen(null);
        setDetailState(null);
        if (action.tab === "submit" && tab !== "submit") {
          setWizardMode("start");
          setWizardDraftAppId(null);
        }
        setTab(action.tab);
        return;
      }
      if (action.kind === "sub") {
        setDetailState(null);
        setTab("more");
        setSubScreen(action.sub);
        return;
      }
      if (action.kind === "detail") {
        setSubScreen(null);
        setDetailState({ appId: action.appId, initialTab: action.initialTab });
      }
    },
    [tab]
  );

  const guardedNavigate = useCallback(
    (action: PendingNavAction) => {
      const leavingActiveWizard = tab === "submit" && wizardMode === "wizard" && wizardDirty;
      if (leavingActiveWizard) {
        setDrawerOpen(false);
        setPendingNav(action);
        return;
      }
      executeNav(action);
    },
    [tab, wizardMode, wizardDirty, executeNav]
  );

  const handleBack = useCallback((): boolean => {
    if (pendingNav) {
      setPendingNav(null);
      return true;
    }
    if (notificationsOpen) {
      setNotificationsOpen(false);
      return true;
    }
    if (drawerOpen) {
      setDrawerOpen(false);
      return true;
    }
    if (detailState) {
      setDetailState(null);
      return true;
    }
    if (subScreen) {
      setSubScreen(null);
      return true;
    }
    if (tab === "submit" && wizardMode === "wizard") {
      guardedNavigate({ kind: "leaveWizard" });
      return true;
    }
    if (tab === "submit" && wizardMode === "success") {
      setWizardMode("start");
      setTab("home");
      return true;
    }
    if (tab !== "home") {
      setTab("home");
      return true;
    }
    return false;
  }, [pendingNav, notificationsOpen, drawerOpen, detailState, subScreen, tab, wizardMode, guardedNavigate]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", handleBack);
    return () => sub.remove();
  }, [handleBack]);

  function upsertApplication(updated: InnovatorApplication) {
    setData((prev) => {
      if (!prev) return prev;
      const idx = prev.applications.findIndex((a) => a.id === updated.id);
      const nextApps =
        idx >= 0
          ? prev.applications.map((a, i) => (i === idx ? updated : a))
          : [updated, ...prev.applications];
      return { ...prev, applications: nextApps };
    });
  }

  function resumeDraftInWizard(draft: InnovatorApplication) {
    setSubScreen(null);
    setDetailState(null);
    setWizardDraftAppId(draft.id);
    setWizardMode("wizard");
    setTab("submit");
  }

  function startNewApplication() {
    setSubScreen(null);
    setDetailState(null);
    setWizardDraftAppId(null);
    setWizardMode("start");
    setTab("submit");
  }

  const prefs = data?.profile?.preferences || {};
  const unreadNotifs = useMemo(
    () => (data?.notifications || []).filter((n) => !n.isRead).length,
    [data?.notifications]
  );
  const unreadMsgs = useMemo(
    () => (data?.messages || []).filter((m) => !m.isRead).length,
    [data?.messages]
  );

  const detailApp = useMemo(
    () => (detailState && data ? data.applications.find((a) => a.id === detailState.appId) || null : null),
    [detailState, data]
  );

  let nestedEyebrow = "MORE / SUB-SCREEN";
  let nestedTitle = "Sub-screen";
  if (detailApp) {
    nestedEyebrow = "APPLICATION WORKSPACE";
    nestedTitle = detailApp.reference;
  } else if (subScreen) {
    nestedEyebrow = "MORE / SUB-SCREEN";
    nestedTitle = MORE_SUBSCREEN_META[subScreen].title;
  } else if (tab === "submit" && wizardMode === "wizard") {
    nestedEyebrow = "INNOVATION APPLICATION";
    nestedTitle = "12-Step Submission";
  }

  const tabs: { key: PrimaryTab; label: string; icon: InnovatorIconName; badge?: number }[] = [
    { key: "home", label: "Overview", icon: "home" },
    { key: "applications", label: "Applications", icon: "applications" },
    { key: "submit", label: "Submit", icon: "submit" },
    { key: "messages", label: "Messages", icon: "messages", badge: unreadMsgs },
    { key: "more", label: "More", icon: "more" },
  ];

  const mainDrawerLinks: { label: string; detail: string; action: PendingNavAction; active: boolean }[] = [
    { label: "Overview", detail: "Progress, deadlines & momentum", action: { kind: "tab", tab: "home" }, active: tab === "home" && !subScreen && !detailState },
    { label: "My applications", detail: "Drafts, submitted & outcomes", action: { kind: "tab", tab: "applications" }, active: tab === "applications" && !detailState },
    { label: "Submit innovation", detail: "Start or resume 12-step draft", action: { kind: "tab", tab: "submit" }, active: tab === "submit" && !detailState },
    { label: "Messages", detail: "Updates & CEDA staff replies", action: { kind: "tab", tab: "messages" }, active: tab === "messages" && !detailState },
    { label: "More", detail: "Tools, guidance & preferences", action: { kind: "tab", tab: "more" }, active: tab === "more" && !subScreen && !detailState },
  ];

  const subDrawerKeys: MoreSubScreenKey[] = ["documents", "support", "settings"];
  const activeOptimusSupport = useMemo(
    () => (data ? getActiveOptimusSupportRequest(data.supportRequests) : null),
    [data]
  );

  async function handleMarkNotificationsRead(id?: string) {
    setMarkingNotifications(true);
    try {
      const next = await markNotificationsRead(account.token, id || null);
      setData((prev) => (prev ? { ...prev, notifications: next } : prev));
    } finally {
      setMarkingNotifications(false);
    }
  }

  const quickQuery = workspaceSearch.trim().toLowerCase();
  const matchingApps = quickQuery && data
    ? data.applications.filter((a) =>
        [a.reference, a.title, a.sector].some((v) => String(v || "").toLowerCase().includes(quickQuery))
      ).slice(0, 3)
    : [];
  const matchingTools = quickQuery
    ? (["documents", "optimus", "support", "settings"] as MoreSubScreenKey[]).filter((k) =>
        [MORE_SUBSCREEN_META[k].title, MORE_SUBSCREEN_META[k].detail]
          .join(" ")
          .toLowerCase()
          .includes(quickQuery)
      )
    : [];

  const quickJumpSearch = (
    <View style={{ gap: 12 }}>
      <FrostedSearchPill
        value={workspaceSearch}
        onChangeText={setWorkspaceSearch}
        placeholder="Search applications, tools & guidance"
      />
      {quickQuery ? (
        <GlassCard>
          <Text style={styles.quickEyebrow}>QUICK JUMP</Text>
          {matchingApps.map((app, i) => (
            <IconRow
              key={app.id}
              title={app.title || app.reference}
              detail={`${app.reference} · ${app.status}`}
              icon="applications"
              color={adminStyleColors.blue}
              tint="#EAF1FC"
              badge={app.status}
              last={i === matchingApps.length - 1 && matchingTools.length === 0}
              onPress={() => {
                setWorkspaceSearch("");
                if (app.status === "Draft") resumeDraftInWizard(app);
                else setDetailState({ appId: app.id });
              }}
            />
          ))}
          {matchingTools.map((k, i) => {
            const meta = MORE_SUBSCREEN_META[k];
            return (
              <IconRow
                key={k}
                title={meta.title}
                detail={meta.detail}
                icon={meta.icon}
                color={meta.color}
                tint={meta.tint}
                badge="Sub-screen"
                last={i === matchingTools.length - 1}
                onPress={() => {
                  setWorkspaceSearch("");
                  if (k === "optimus") {
                    setOptimusSheetOpen(true);
                  } else {
                    guardedNavigate({ kind: "sub", sub: k });
                  }
                }}
              />
            );
          })}
          {!matchingApps.length && !matchingTools.length ? (
            <Text style={{ fontSize: fontSizes.subbody, color: adminStyleColors.subtle }}>
              No applications or tools matched "{workspaceSearch.trim()}".
            </Text>
          ) : null}
        </GlassCard>
      ) : null}
    </View>
  );

  return (
    <InnovatorA11yProvider
      textSize={(prefs.textSize as "standard" | "large" | "xlarge") || "standard"}
      highContrast={Boolean(prefs.highContrast)}
      reducedMotion={Boolean(prefs.reducedMotion)}
    >
      <View style={styles.screen}>
        <FrostedScreenBackdrop image={WORKSPACE_BG} imageHeight={320}>
          {/* Top Frosted Header (Matches AdminWorkspace.tsx) */}
          <View style={styles.header}>
            <FrostedSurface variant="bar" />
            <Pressable
              onPress={() => (isNestedScreen ? handleBack() : setDrawerOpen(true))}
              accessibilityRole="button"
              accessibilityLabel={isNestedScreen ? "Go back" : "Open innovator navigation menu"}
              style={({ pressed }) => [
                styles.headerAction,
                isNestedScreen && styles.backButton,
                pressed && { opacity: 0.7 },
              ]}
            >
              <InnovatorIcon name={isNestedScreen ? "back" : "menu"} color={adminStyleColors.navy} />
            </Pressable>

            {isNestedScreen ? (
              <View style={styles.headerCenter}>
                <Text numberOfLines={1} style={styles.headerEyebrow}>
                  {nestedEyebrow}
                </Text>
                <Text numberOfLines={1} style={styles.brandTitle}>
                  {nestedTitle}
                </Text>
              </View>
            ) : (
              <View style={styles.brand}>
                <Image
                  source={require("./assets/ceda.png")}
                  resizeMode="contain"
                  style={styles.logo}
                  accessibilityLabel="CEDA Innovation"
                />
                <View>
                  <Text style={styles.brandTitle}>Innovation</Text>
                  <Text style={styles.brandSubtitle}>Innovator portal</Text>
                </View>
              </View>
            )}

            <Pressable
              onPress={() => setNotificationsOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Open notifications"
              style={({ pressed }) => [styles.headerAction, pressed && { opacity: 0.7 }]}
            >
              <InnovatorIcon name="bell" color={adminStyleColors.navy} />
              {unreadNotifs > 0 ? <View style={styles.bellDot} /> : null}
            </Pressable>
          </View>

          {/* Body Content */}
          <View style={styles.body}>
            {loading && !data ? (
              <View style={styles.centeredWrap}>
                <GlassCard style={{ alignItems: "center", gap: 12, paddingVertical: 24 }}>
                  <ActivityIndicator size="large" color={adminStyleColors.rust} />
                  <Text style={{ fontSize: fontSizes.body, fontWeight: "700", color: adminStyleColors.navy }}>
                    Loading your Innovator workspace…
                  </Text>
                </GlassCard>
              </View>
            ) : loadError && !data ? (
              <View style={styles.centeredWrap}>
                <GlassCard style={{ gap: 12 }}>
                  <Text style={{ fontSize: fontSizes.heading, fontWeight: "700", color: adminStyleColors.navy }}>
                    Could not reach your workspace
                  </Text>
                  <Text style={{ fontSize: fontSizes.subbody, color: adminStyleColors.subtle }}>{loadError}</Text>
                  <ActionButton label="Retry connection" onPress={() => void loadWorkspace(true)} />
                  <ActionButton label="Sign out" variant="secondary" onPress={onSignOut} />
                </GlassCard>
              </View>
            ) : data ? (
              detailApp ? (
                <InnovatorApplicationDetail
                  key={detailApp.id}
                  token={account.token}
                  userId={data.profile.id}
                  application={detailApp}
                  initialTab={detailState?.initialTab}
                  documents={data.documents}
                  messages={data.messages}
                  onApplicationUpdated={upsertApplication}
                  onDocumentsUpdated={(docs) => setData((p) => (p ? { ...p, documents: docs } : p))}
                  onMessagesUpdated={(msgs) => setData((p) => (p ? { ...p, messages: msgs } : p))}
                  onContinueDraft={resumeDraftInWizard}
                  onOpenSupport={() => {
                    setDetailState(null);
                    setTab("more");
                    setSubScreen("support");
                  }}
                />
              ) : subScreen === "documents" ? (
                <InnovatorDocumentsScreen token={account.token} documents={data.documents} />
              ) : subScreen === "optimus" ? (
                <InnovatorOptimusScreen
                  token={account.token}
                  fullName={data.profile?.fullName}
                  history={data.optimusHistory}
                  supportRequests={data.supportRequests}
                  initialQuestion={optimusPromptSeed}
                  onHistoryUpdated={(items) => setData((p) => (p ? { ...p, optimusHistory: items } : p))}
                  onEscalated={(reqs) => setData((p) => (p ? { ...p, supportRequests: reqs } : p))}
                />
              ) : subScreen === "support" ? (
                <InnovatorSupportScreen
                  token={account.token}
                  faqs={data.faqs}
                  applications={data.applications}
                  supportRequests={data.supportRequests}
                  onRequestsUpdated={(reqs) => setData((p) => (p ? { ...p, supportRequests: reqs } : p))}
                />
              ) : subScreen === "settings" ? (
                <InnovatorSettingsScreen
                  token={account.token}
                  profile={data.profile}
                  onProfileUpdated={(nextProfile) => {
                    setData((p) => (p ? { ...p, profile: nextProfile } : p));
                    if (nextProfile.fullName) onAccountChange({ ...account, name: nextProfile.fullName });
                  }}
                  onSignOut={onSignOut}
                />
              ) : tab === "home" ? (
                <InnovatorOverview
                  data={data}
                  refreshing={refreshing}
                  onRefresh={() => void loadWorkspace(true, true)}
                  searchSlot={quickJumpSearch}
                  onOpenApplications={(statusFilter) => {
                    setAppsStatusFilter(statusFilter || "All");
                    setTab("applications");
                  }}
                  onResumeDraft={resumeDraftInWizard}
                  onStartNewApplication={startNewApplication}
                  onOpenApplicationDetail={(appId, initialTab) => setDetailState({ appId, initialTab })}
                  onOpenMessages={() => setTab("messages")}
                  onOpenSettings={() => {
                    setTab("more");
                    setSubScreen("settings");
                  }}
                />
              ) : tab === "applications" ? (
                <InnovatorApplications
                  token={account.token}
                  applications={data.applications}
                  statusFilter={appsStatusFilter}
                  onStatusFilterChange={setAppsStatusFilter}
                  refreshing={refreshing}
                  onRefresh={() => void loadWorkspace(true, true)}
                  onContinueDraft={resumeDraftInWizard}
                  onViewDetail={(appId, initialTab) => setDetailState({ appId, initialTab })}
                  onStartNew={startNewApplication}
                  onApplicationUpdated={upsertApplication}
                />
              ) : tab === "submit" ? (
                <InnovatorWizard
                  token={account.token}
                  profile={data.profile}
                  sectors={data.sectors}
                  applications={data.applications}
                  documents={data.documents}
                  initialDraftAppId={wizardDraftAppId}
                  mode={wizardMode}
                  onModeChange={setWizardMode}
                  onDirtyChange={setWizardDirty}
                  onApplicationUpdated={upsertApplication}
                  onDocumentsUpdated={(docs) => setData((p) => (p ? { ...p, documents: docs } : p))}
                  onViewApplication={(appId) => {
                    setTab("applications");
                    setDetailState({ appId, initialTab: "summary" });
                  }}
                  onReturnOverview={() => {
                    setWizardMode("start");
                    setTab("home");
                  }}
                  saveTriggerRef={wizardSaveRef}
                />
              ) : tab === "messages" ? (
                <InnovatorMessages
                  token={account.token}
                  userId={data.profile.id}
                  messages={data.messages}
                  supportRequests={data.supportRequests}
                  optimusHistory={data.optimusHistory}
                  refreshing={refreshing}
                  onRefresh={() => void loadWorkspace(true, true)}
                  onMessagesUpdated={(msgs) => setData((p) => (p ? { ...p, messages: msgs } : p))}
                  onEscalateHumanSupport={() => {
                    setTab("more");
                    setSubScreen("support");
                  }}
                />
              ) : (
                <InnovatorMoreHub
                  profile={data.profile}
                  documentsCount={data.documents.filter((d) => d.uploadStatus !== "Removed").length}
                  openTicketsCount={data.supportRequests.filter((r) => r.state !== "Resolved").length}
                  searchSlot={quickJumpSearch}
                  onOpenSubScreen={(k) => {
                    if (k === "optimus") setOptimusPromptSeed(null);
                    setSubScreen(k);
                  }}
                  onStartNew={startNewApplication}
                  onSignOut={onSignOut}
                />
              )
            ) : null}
          </View>

          {!isNestedScreen && data ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                activeOptimusSupport
                  ? "Continue your CEDA human support chat"
                  : "Open Optimus Prime AI chat"
              }
              onPress={() => setOptimusSheetOpen(true)}
              style={[
                styles.optimusFloatingPill,
                { bottom: Math.max(insets.bottom, 10) + 74 },
              ]}
            >
              <FrostedSurface variant="sheet" borderRadius={26} />
              <View style={styles.optimusFloatingIcon}>
                <InnovatorIcon name="optimus" color={adminStyleColors.purple} />
              </View>
              <Text style={styles.optimusFloatingLabel}>
                {activeOptimusSupport ? "Continue support chat" : "Chat with Optimus"}
              </Text>
            </Pressable>
          ) : null}

          {/* Bottom Tab Bar (Exact AdminWorkspace pill highlight; hidden on sub-screens/detail/wizard) */}
          {!isNestedScreen ? (
            <View
              accessibilityRole="tablist"
              style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 10) }]}
            >
              <FrostedSurface variant="bar" />
              {tabs.map((item) => {
                const selected = tab === item.key && !subScreen && !detailState;
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    onPress={() => guardedNavigate({ kind: "tab", tab: item.key })}
                    style={[styles.tab, selected && styles.tabSelected]}
                  >
                    <View>
                      <InnovatorIcon
                        name={item.icon}
                        color={selected ? adminStyleColors.rust : adminStyleColors.muted}
                      />
                      {item.badge && item.badge > 0 ? <View style={styles.tabUnreadDot} /> : null}
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.tabLabel,
                        selected && { color: adminStyleColors.rust, fontWeight: "700" },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Slide-out LEFT Navigation Drawer (Matches AdminWorkspace.tsx) */}
          <Modal
            visible={drawerOpen}
            transparent
            statusBarTranslucent
            animationType="fade"
            onRequestClose={() => setDrawerOpen(false)}
          >
            <FrostedModalBackdrop>
              <View style={styles.drawerBackdrop}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close innovator menu"
                  onPress={() => setDrawerOpen(false)}
                  style={StyleSheet.absoluteFill}
                />
                <View
                  accessibilityViewIsModal
                  style={[
                    styles.drawer,
                    {
                      paddingTop: Math.max(insets.top, 16),
                      paddingBottom: Math.max(insets.bottom, 18),
                    },
                  ]}
                >
                  <FrostedSurface variant="sheet" />
                  <View style={styles.drawerHeading}>
                    <View style={styles.drawerBrand}>
                      <Image
                        source={require("./assets/ceda.png")}
                        resizeMode="contain"
                        style={styles.logo}
                        accessibilityLabel="CEDA Innovation"
                      />
                      <View style={{ flex: 1 }}>
                        <Text accessibilityRole="header" style={styles.drawerHeadingTitle}>
                          Innovator Portal
                        </Text>
                        <Text style={styles.brandSubtitle}>Quick navigation</Text>
                      </View>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Close innovator menu"
                      onPress={() => setDrawerOpen(false)}
                      style={styles.closeCircle}
                    >
                      <InnovatorIcon name="close" color="#52606E" />
                    </Pressable>
                  </View>

                  <ScrollView contentContainerStyle={styles.drawerContent}>
                    <Text style={styles.drawerSectionLabel}>MAIN WORKSPACE</Text>
                    {mainDrawerLinks.map((link) => (
                      <Pressable
                        key={link.label}
                        accessibilityRole="button"
                        accessibilityState={{ selected: link.active }}
                        onPress={() => guardedNavigate(link.action)}
                        style={[styles.drawerLink, link.active && styles.drawerLinkActive]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.drawerItemTitle,
                              link.active && { color: adminStyleColors.rust },
                            ]}
                          >
                            {link.label}
                          </Text>
                          <Text numberOfLines={1} style={styles.drawerSub}>
                            {link.detail}
                          </Text>
                        </View>
                        <Text style={styles.chevron} accessible={false}>
                          {"\u203a"}
                        </Text>
                      </Pressable>
                    ))}

                    <Text style={[styles.drawerSectionLabel, { marginTop: 10 }]}>
                      MORE SUB-SCREENS
                    </Text>
                    {subDrawerKeys.map((key) => {
                      const meta = MORE_SUBSCREEN_META[key];
                      const active = subScreen === key;
                      return (
                        <Pressable
                          key={key}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => guardedNavigate({ kind: "sub", sub: key })}
                          style={[styles.drawerLink, active && styles.drawerLinkActive]}
                        >
                          <View style={[styles.drawerIcon, { backgroundColor: meta.tint }]}>
                            <InnovatorIcon name={meta.icon} color={meta.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.drawerItemTitle,
                                active && { color: adminStyleColors.rust },
                              ]}
                            >
                              {meta.title}
                            </Text>
                            <Text numberOfLines={1} style={styles.drawerSub}>
                              {meta.detail}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  <View style={styles.drawerAccount}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.drawerItemTitle}>{data?.profile?.fullName || account.name}</Text>
                      <Text style={styles.drawerSub}>
                        Innovator · {data?.profile?.district || "Botswana"}
                      </Text>
                    </View>
                    <ActionButton label="Sign out" variant="secondary" compact onPress={onSignOut} />
                  </View>
                </View>
              </View>
            </FrostedModalBackdrop>
          </Modal>

          {/* Header Bell Notifications Modal */}
          <FlushSheetModal
            visible={notificationsOpen}
            eyebrow="INNOVATOR ALERTS"
            title="Notifications"
            onClose={() => setNotificationsOpen(false)}
          >
            <View style={{ gap: 10 }}>
              {unreadNotifs > 0 ? (
                <ActionButton
                  label="Mark all read"
                  variant="secondary"
                  compact
                  loading={markingNotifications}
                  onPress={() => void handleMarkNotificationsRead()}
                />
              ) : null}
              {data?.notifications?.length ? (
                data.notifications.map((n, idx) => (
                  <Pressable
                    key={n.id}
                    onPress={() => {
                      if (!n.isRead) void handleMarkNotificationsRead(n.id);
                      setNotificationsOpen(false);
                      if (n.targetHash === "#support") guardedNavigate({ kind: "sub", sub: "support" });
                      else if (n.applicationRef) {
                        const app = data.applications.find((a) => a.reference === n.applicationRef);
                        if (app) guardedNavigate({ kind: "detail", appId: app.id });
                      }
                    }}
                    style={[
                      styles.notifRow,
                      idx === 0 && { borderTopWidth: 0 },
                    ]}
                  >
                    <View
                      style={[
                        styles.notifBadgeDot,
                        { backgroundColor: n.isRead ? "#D8DDE3" : adminStyleColors.rust },
                      ]}
                    />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.notifTitle}>{n.title}</Text>
                      <Text style={styles.notifMsg}>{n.message}</Text>
                      <Text style={styles.notifDate}>{n.createdAt}</Text>
                    </View>
                  </Pressable>
                ))
              ) : (
                <Text style={{ fontSize: fontSizes.subbody, color: adminStyleColors.subtle, paddingVertical: 8 }}>
                  No alerts right now. Submission receipts, clarifications, and replies appear here automatically.
                </Text>
              )}
            </View>
          </FlushSheetModal>

          {/* Floating Optimus Prime DM Sheet */}
          {data ? (
            <OptimusDmModal
              visible={optimusSheetOpen}
              onClose={() => setOptimusSheetOpen(false)}
              token={account.token}
              fullName={data.profile?.fullName}
              history={data.optimusHistory}
              supportRequests={data.supportRequests}
              initialQuestion={optimusPromptSeed}
              onHistoryUpdated={(items) =>
                setData((p) => (p ? { ...p, optimusHistory: items } : p))
              }
              onRequestsUpdated={(reqs) =>
                setData((p) => (p ? { ...p, supportRequests: reqs } : p))
              }
            />
          ) : null}

          {/* Unsaved Draft Confirmation Modal */}
          <FlushSheetModal
            visible={Boolean(pendingNav)}
            eyebrow="UNSAVED DRAFT EDITS"
            title="Save draft before leaving?"
            onClose={() => setPendingNav(null)}
          >
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: fontSizes.subbody, color: adminStyleColors.subtle, lineHeight: 20 }}>
                Save your current wizard edits safely before switching views, or discard unsaved field changes.
              </Text>
              <ActionButton
                label="Save draft & continue"
                loading={unsavedBusy}
                onPress={async () => {
                  setUnsavedBusy(true);
                  const ok = wizardSaveRef.current ? await wizardSaveRef.current() : true;
                  setUnsavedBusy(false);
                  if (ok && pendingNav) {
                    const target = pendingNav;
                    setPendingNav(null);
                    setWizardDirty(false);
                    executeNav(target);
                  }
                }}
              />
              <ActionButton
                label="Discard unsaved edits"
                variant="secondary"
                onPress={() => {
                  if (pendingNav) {
                    const target = pendingNav;
                    setPendingNav(null);
                    setWizardDirty(false);
                    executeNav(target);
                  }
                }}
              />
              <ActionButton
                label="Stay on application"
                variant="secondary"
                onPress={() => setPendingNav(null)}
              />
            </View>
          </FlushSheetModal>
        </FrostedScreenBackdrop>
      </View>
    </InnovatorA11yProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: adminStyleColors.canvas },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.88)",
    overflow: "hidden",
  },
  headerAction: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "#E5DDD3",
    justifyContent: "center",
    alignItems: "center",
  },
  backButton: {
    backgroundColor: "#EAF1FC",
    borderColor: "#D9E5F7",
  },
  bellDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: adminStyleColors.rust,
    borderWidth: 1.2,
    borderColor: "white",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerEyebrow: {
    fontSize: fontSizes.caption,
    fontWeight: "700",
    letterSpacing: 1.1,
    color: adminStyleColors.subtle,
  },
  brand: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: 40, height: 36 },
  brandTitle: {
    fontSize: fontSizes.heading,
    fontWeight: "700",
    color: adminStyleColors.navy,
  },
  brandSubtitle: {
    fontSize: fontSizes.caption,
    color: adminStyleColors.subtle,
    marginTop: 1,
  },
  body: { flex: 1 },
  centeredWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  quickEyebrow: {
    fontSize: fontSizes.caption,
    fontWeight: "700",
    letterSpacing: 1.1,
    color: adminStyleColors.subtle,
  },
  tabBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.9)",
    paddingTop: 8,
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    minHeight: 56,
    paddingVertical: 6,
  },
  tabSelected: {
    backgroundColor: "rgba(251,237,232,0.88)",
    borderRadius: 14,
  },
  tabLabel: {
    fontSize: fontSizes.caption,
    color: adminStyleColors.muted,
    textAlign: "center",
  },
  tabUnreadDot: {
    position: "absolute",
    top: -1,
    right: -3,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: adminStyleColors.rust,
    borderWidth: 1,
    borderColor: "white",
  },
  drawerBackdrop: { flex: 1 },
  drawer: {
    width: "86%",
    maxWidth: 360,
    height: "100%",
    borderRightWidth: 1,
    borderColor: "rgba(255,255,255,0.94)",
    overflow: "hidden",
  },
  drawerHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: adminStyleColors.line,
  },
  drawerBrand: {
    flex: 1,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  drawerHeadingTitle: {
    color: adminStyleColors.navy,
    fontSize: fontSizes.heading,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  closeCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: "#E5DDD3",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerContent: { padding: 14, gap: 4 },
  drawerSectionLabel: {
    fontSize: fontSizes.caption,
    fontWeight: "700",
    letterSpacing: 1.1,
    color: adminStyleColors.subtle,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  drawerLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 50,
    borderRadius: 14,
  },
  drawerLinkActive: {
    backgroundColor: "rgba(251,237,232,0.88)",
  },
  drawerItemTitle: {
    color: adminStyleColors.navy,
    fontWeight: "600",
    fontSize: fontSizes.body,
  },
  drawerIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerSub: {
    fontSize: fontSizes.subbody,
    color: adminStyleColors.subtle,
  },
  chevron: { color: "#A1A8B1", fontSize: 22 },
  drawerAccount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 14,
    borderTopColor: adminStyleColors.line,
    borderTopWidth: 1,
  },
  notifRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: adminStyleColors.line,
  },
  notifBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  notifTitle: {
    fontSize: fontSizes.body,
    fontWeight: "600",
    color: adminStyleColors.navy,
  },
  notifMsg: {
    fontSize: fontSizes.subbody,
    color: adminStyleColors.subtle,
    lineHeight: 19,
  },
  notifDate: {
    fontSize: fontSizes.caption,
    color: adminStyleColors.blue,
    fontWeight: "600",
  },
  optimusFloatingPill: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.92)",
    shadowColor: "#241C19",
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 6,
    overflow: "hidden",
  },
  optimusFloatingIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F0ECFB",
    alignItems: "center",
    justifyContent: "center",
  },
  optimusFloatingLabel: {
    fontSize: fontSizes.subbody,
    fontWeight: "700",
    color: adminStyleColors.navy,
  },
});
