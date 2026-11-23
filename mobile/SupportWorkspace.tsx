import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountSecurityCards } from "./AccountSecurityCards";
import { MobileIcon, type MobileIconName } from "./AdminOverview";
import { type Account } from "./auth";
import { FrostedModalBackdrop, FrostedScreenBackdrop, FrostedSurface } from "./FrostedGlass";
import { signOutOtherDevices } from "./innovatorApi";
import {
  ActionButton,
  adminStyleColors as colors,
  ChoiceChips,
  FactRow,
  FrostedSearchPill,
  GlassCard,
  IconRow,
  InnovatorA11yProvider,
  InnovatorIcon,
  ProgressBar,
  SectionHeader,
  StatusPill,
} from "./InnovatorUI";
import { isTokenAal2 } from "./securityApi";
import { HOSTING_SUPPORT_SLA } from "./portalCatalog";
import { TourTarget, useTour } from "./TourGuide";
import { useAccessibility } from "./useAccessibility";
import { fetchSupportTickets, updateSupportOfficerAvailability } from "./supportApi";
import { SupportConversationModal } from "./SupportConversationModal";
import {
  AVAILABILITY_STATES,
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
  getTicketSource,
  isDefaultOptimusTitle,
  LIVE_CHAT_HOURS,
  supportOverviewColors,
  ticketDisplayTitle,
  ticketLastPreview,
  type AvailabilityState,
  type SupportTicket,
} from "./supportOverview.js";
import { fontSizes } from "./theme";

type SupportScreen = "overview" | "queue" | "performance" | "playbook" | "account";

const tabs: readonly { key: SupportScreen; label: string; short: string; icon: "home" | "support" | "pulse" | "documents" | "settings" }[] = [
  { key: "overview", label: "Overview", short: "Overview", icon: "home" },
  { key: "queue", label: "Support queue", short: "Queue", icon: "support" },
  { key: "performance", label: "Performance", short: "Perf", icon: "pulse" },
  { key: "playbook", label: "Playbook", short: "Playbook", icon: "documents" },
  { key: "account", label: "Account & security", short: "Account", icon: "settings" },
];

/**
 * Native CEDA Support Officer workspace with live visual analytics, triage queue, conversation replies, and security controls.
 */
export function SupportWorkspace({
  account,
  onSignOut,
  onAccountChange,
}: {
  account: Account;
  onSignOut: () => void;
  onAccountChange: (account: Account) => void;
}) {
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<SupportScreen>("overview");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityState>("Available");
  const [openedIds, setOpenedIds] = useState<Set<string>>(() => new Set());
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [endingSessions, setEndingSessions] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");
  const [sessionError, setSessionError] = useState("");
  const { darkMode, openModal: openA11yModal, scaleFont } = useAccessibility();
  const { setPortalContext, startTour } = useTour();
  const darkInk = darkMode ? "#f0e8e0" : colors.navy;
  const darkMuted = darkMode ? "#b8a898" : colors.muted;
  const requestSeq = useRef(0);

  const loadTickets = useCallback(
    async (forceRefresh = false, silent = false) => {
      const id = ++requestSeq.current;
      if (!silent) {
        if (forceRefresh) setRefreshing(true);
        else setLoading(true);
        setError("");
      }
      try {
        const list = await fetchSupportTickets(account, forceRefresh);
        if (id === requestSeq.current) setTickets(list);
      } catch (failure) {
        if (id === requestSeq.current && !silent) {
          setError(failure instanceof Error ? failure.message : "Could not load support queue.");
        }
      } finally {
        if (id === requestSeq.current && !silent) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [account]
  );

  useEffect(() => {
    void loadTickets(false);
    let currentAppState = AppState.currentState;
    const appSub = AppState.addEventListener("change", (nextState) => {
      const prev = currentAppState;
      currentAppState = nextState;
      if (prev !== "active" && nextState === "active") void loadTickets(true, true);
    });
    const poll = setInterval(() => {
      if (currentAppState === "active") void loadTickets(true, true);
    }, 20_000);
    return () => { clearInterval(poll); appSub.remove(); };
  }, [loadTickets]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (selectedTicketId) {
        setSelectedTicketId(null);
        return true;
      }
      if (drawerOpen) {
        setDrawerOpen(false);
        return true;
      }
      if (screen !== "overview") {
        setScreen("overview");
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [drawerOpen, screen, selectedTicketId]);

  const summary = useMemo(() => buildSupportOverview(tickets, { openedIds }), [openedIds, tickets]);
  const performance = useMemo(() => buildOfficerPerformance(tickets, account.name), [account.name, tickets]);
  const myActiveChats = useMemo(() => getAgentActiveChats(tickets, account.name), [account.name, tickets]);
  const liveChatAvailability = useMemo(
    () =>
      evaluateLiveChatAvailability({
        tickets,
        officerAvailability: availability,
        agents: [
          {
            id: account.name || "officer",
            name: account.name || "Support Officer",
            availability,
            activeChats: myActiveChats.length,
            maxConcurrent: LIVE_CHAT_HOURS.defaultMaxConcurrentChats,
          },
        ],
      }),
    [account.name, availability, myActiveChats.length, tickets]
  );
  const chatAnalyticsReport = useMemo(
    () =>
      buildLiveChatAnalyticsReport(tickets, {
        officerAvailability: availability,
        agents: [
          {
            id: account.name || "officer",
            name: account.name || "Support Officer",
            availability,
            activeChats: myActiveChats.length,
            maxConcurrent: LIVE_CHAT_HOURS.defaultMaxConcurrentChats,
          },
        ],
      }),
    [account.name, availability, myActiveChats.length, tickets]
  );
  const selectedTicket = useMemo(
    () => tickets.find(item => item.id === selectedTicketId) ?? null,
    [selectedTicketId, tickets]
  );

  function handleSelectAvailability(nextState: AvailabilityState) {
    setAvailability(nextState);
    void updateSupportOfficerAvailability(
      account,
      nextState,
      LIVE_CHAT_HOURS.defaultMaxConcurrentChats
    );
  }

  async function handleExportChatAnalyticsCsv() {
    const csv = buildLiveChatAnalyticsCsv(chatAnalyticsReport);
    try {
      await Share.share({
        title: `CEDA Live Chat Analytics Report (${chatAnalyticsReport.availability.dateKey})`,
        message: csv,
      });
    } catch {
      // Share cancelled or unavailable
    }
  }

  const filteredTickets = useMemo(
    () =>
      filterSupportTickets(tickets, {
        filterKey: stateFilter,
        query,
        openedIds,
      }),
    [openedIds, query, stateFilter, tickets]
  );

  function openTicket(ticketId: string) {
    setOpenedIds(prev => {
      if (prev.has(ticketId)) return prev;
      const next = new Set(prev);
      next.add(ticketId);
      return next;
    });
    setSelectedTicketId(ticketId);
  }

  function openQueueSlice(nextState: string) {
    setStateFilter(nextState);
    setScreen("queue");
    setDrawerOpen(false);
  }

  async function handleSignOutOtherDevices() {
    setEndingSessions(true);
    setSessionError("");
    setSessionMessage("");
    try {
      await signOutOtherDevices(account.token);
      setSessionMessage("Signed out other devices cleanly.");
    } catch (failure) {
      setSessionError(failure instanceof Error ? failure.message : "Could not sign out other sessions.");
    } finally {
      setEndingSessions(false);
    }
  }

  const firstName = (account.name || "Officer").trim().split(/\s+/)[0];
  const sessionExpiry =
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Gaborone" }).format(
      new Date(account.expiresAt)
    ) + " CAT";

  const availabilityTone: Record<AvailabilityState, { dot: string; bg: string; text: string }> = {
    Available: { dot: supportOverviewColors.green, bg: "#E4F4F0", text: colors.teal },
    Busy: { dot: supportOverviewColors.amber, bg: "#FBF0DD", text: "#8A5306" },
    Offline: { dot: supportOverviewColors.slate, bg: "#EEF0F3", text: colors.muted },
  };

  const openTotal = Math.max(1, summary.openRequests);
  const kpiCards: {
    label: string;
    value: string;
    caption: string;
    badge?: string;
    progressPct: number;
    icon: MobileIconName;
    color: string;
    onPress: () => void;
  }[] = [
    {
      label: "Open requests",
      value: String(summary.openRequests),
      caption: `${summary.open} open · ${summary.investigating} investigating · ${summary.waiting} waiting`,
      progressPct: summary.total ? Math.round((summary.openRequests / summary.total) * 100) : 0,
      icon: "support",
      color: supportOverviewColors.blue,
      onPress: () => openQueueSlice("All"),
    },
    {
      label: "New requests",
      value: String(summary.newRequests),
      caption: "Requests not opened by an officer",
      badge: summary.newRequests ? "Unopened" : undefined,
      progressPct: summary.openRequests ? Math.round((summary.newRequests / openTotal) * 100) : 0,
      icon: "bell",
      color: supportOverviewColors.teal,
      onPress: () => openQueueSlice("New"),
    },
    {
      label: "Urgent requests",
      value: String(summary.urgentRequests),
      caption: "High-priority or overdue cases",
      badge: summary.overdueRequests ? `${summary.overdueRequests} overdue` : undefined,
      progressPct: summary.openRequests ? Math.round((summary.urgentRequests / openTotal) * 100) : 0,
      icon: "ai",
      color: supportOverviewColors.rust,
      onPress: () => openQueueSlice("Urgent"),
    },
    {
      label: "Resolved today",
      value: String(summary.resolvedToday),
      caption: "Requests completed during today",
      progressPct: summary.resolutionRatePct,
      icon: "check",
      color: supportOverviewColors.green,
      onPress: () => openQueueSlice("Resolved"),
    },
  ];

  useEffect(() => {
    setPortalContext("support", (nextScreen) => {
      setScreen(nextScreen as SupportScreen);
    });
  }, [setPortalContext]);

  return (
    <InnovatorA11yProvider darkMode={darkMode}>
      <View style={[styles.root, darkMode && { backgroundColor: "#131009" }]}>
        <FrostedScreenBackdrop image={require("./assets/innovation.webp")} imageHeight={320}>
          <View style={[styles.header, darkMode && { borderBottomColor: "rgba(240,220,200,0.08)" }]}>
            <FrostedSurface variant="bar" />
            <TourTarget id="support.menu">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open support menu"
              onPress={() => setDrawerOpen(true)}
              style={({ pressed }) => [styles.headerAction, darkMode && { backgroundColor: "rgba(37,32,24,0.88)", borderColor: "rgba(240,220,200,0.16)" }, pressed && { opacity: 0.7 }]}
            >
              <MobileIcon name="menu" color={darkInk} />
            </Pressable>
            </TourTarget>
            <View style={styles.brand}>
              <Image
                source={require("./assets/ceda.png")}
                resizeMode="contain"
                style={styles.logo}
                accessibilityLabel="CEDA Support Officer"
              />
              <View style={styles.headerBody}>
                <Text numberOfLines={1} style={[styles.headerTitle, { color: darkInk, fontSize: scaleFont(fontSizes.heading) }]}>
                  Innovation
                </Text>
                <Text numberOfLines={1} style={[styles.headerSubtitle, { color: darkMuted }]}>
                  Support desk · {availability}
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open requests, ${summary.openRequests} unresolved`}
              onPress={() => openQueueSlice("All")}
              style={({ pressed }) => [styles.headerAction, darkMode && { backgroundColor: "rgba(37,32,24,0.88)", borderColor: "rgba(240,220,200,0.16)" }, pressed && { opacity: 0.7 }]}
            >
              <MobileIcon name="bell" color={darkInk} />
              {summary.openRequests > 0 && <View style={styles.bellDot} />}
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={[styles.content, { paddingBottom: 112 + insets.bottom }]}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadTickets(true)} tintColor={colors.rust} />}
          >
            {!!error && (
              <GlassCard style={styles.card}>
                <Text accessibilityRole="alert" style={styles.errorText}>
                  {error}
                </Text>
                <ActionButton label="Retry connection" onPress={() => void loadTickets(true)} />
              </GlassCard>
            )}

            {loading && tickets.length === 0 && !error && (
              <ActivityIndicator size="large" color={colors.rust} style={{ marginVertical: 28 }} />
            )}

            {screen === "overview" && (
              <>
                <GlassCard style={styles.card}>
                  <Text style={styles.eyebrow}>SUPPORT OFFICER OVERVIEW</Text>
                  <Text accessibilityRole="header" style={styles.heroTitle}>
                    Good day, {firstName}
                  </Text>
                  <View style={styles.availabilityWrap}>
                    <View style={styles.availabilityHead}>
                      <Text style={styles.subheading}>Current availability</Text>
                      <View style={[styles.availabilityBadge, { backgroundColor: availabilityTone[availability].bg }]}>
                        <View style={[styles.dot, { backgroundColor: availabilityTone[availability].dot }]} />
                        <Text style={[styles.availabilityBadgeText, { color: availabilityTone[availability].text }]}>
                          {availability}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.availabilityRow}>
                      {AVAILABILITY_STATES.map(state => {
                        const selected = availability === state;
                        const tone = availabilityTone[state];
                        return (
                          <Pressable
                            key={state}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            onPress={() => handleSelectAvailability(state)}
                            style={({ pressed }) => [
                              styles.availabilityPill,
                              selected && { backgroundColor: tone.bg, borderColor: tone.dot },
                              pressed && { opacity: 0.72 },
                            ]}
                          >
                            <View style={[styles.dot, { backgroundColor: tone.dot }]} />
                            <Text style={[styles.availabilityLabel, selected && { color: tone.text, fontWeight: "700" }]}>
                              {state}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Text style={styles.caption}>
                      {liveChatAvailability.badgeLabel}, {myActiveChats.length}/{liveChatAvailability.maxConcurrentPerAgent} active chats ({liveChatAvailability.shortScheduleLabel})
                    </Text>
                  </View>
                  <ActionButton
                    label={refreshing ? "Refreshing..." : "Refresh"}
                    variant="secondary"
                    disabled={refreshing}
                    onPress={() => void loadTickets(true)}
                  />
                </GlassCard>

                <View style={styles.kpiGrid}>
                  {kpiCards.map(card => (
                    <Pressable
                      key={card.label}
                      accessibilityRole="button"
                      accessibilityLabel={`${card.label}: ${card.value}. ${card.caption}`}
                      onPress={card.onPress}
                      style={({ pressed }) => [styles.kpiCard, pressed && { opacity: 0.72 }]}
                    >
                      <FrostedSurface variant="card" borderRadius={18} />
                      <View style={styles.kpiTop}>
                        <View style={[styles.kpiIcon, { backgroundColor: `${card.color}18` }]}>
                          <MobileIcon name={card.icon} color={card.color} />
                        </View>
                        {card.badge ? (
                          <View style={[styles.kpiBadge, { backgroundColor: `${card.color}18` }]}>
                            <Text style={[styles.kpiBadgeText, { color: card.color }]}>{card.badge}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.kpiValue}>{card.value}</Text>
                      <Text style={styles.kpiLabel}>{card.label}</Text>
                      <ProgressBar percent={card.progressPct} height={6} color={card.color} />
                      <Text style={styles.caption}>{card.caption}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {screen === "queue" && (
              <>
                <GlassCard style={styles.card}>
                  <SectionHeader
                    eyebrow="SUPPORT QUEUE & MULTI-USER LIVE CHAT"
                    title="Support requests"
                    subtitle="Urgent, unanswered, Optimus Prime, submission live chats, and replied requests appear first."
                  />
                  <FrostedSearchPill
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search ticket ref, innovator or subject"
                  />
                  <ChoiceChips
                    options={["All", "New", "Urgent", "Resolved"]}
                    selected={stateFilter}
                    onSelect={setStateFilter}
                  />
                  <View style={styles.availabilityWrap}>
                    <Text style={styles.subheading}>
                      Your concurrent live chats ({myActiveChats.length} / {LIVE_CHAT_HOURS.defaultMaxConcurrentChats})
                    </Text>
                    {myActiveChats.length > 0 ? (
                      <View style={styles.queueBadges}>
                        {myActiveChats.map(chat => (
                          <Pressable
                            key={chat.id}
                            accessibilityRole="button"
                            onPress={() => openTicket(chat.id)}
                            style={({ pressed }) => [styles.openConvBtn, pressed && { opacity: 0.72 }]}
                          >
                            <Text style={styles.openConvBtnText}>
                              {chat.id} · {chat.reporter || "Innovator"} ({chat.state})
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.caption}>
                        Tap &quot;Connect&quot; inside any conversation to attend to multiple live chats concurrently.
                      </Text>
                    )}
                  </View>
                </GlassCard>

                <GlassCard style={styles.card}>
                  <SectionHeader
                    title="Requests"
                    subtitle={`${filteredTickets.length} request${filteredTickets.length === 1 ? "" : "s"}`}
                    right={
                      <Pressable accessibilityRole="button" onPress={() => void loadTickets(true)}>
                        <Text style={styles.link}>Refresh</Text>
                      </Pressable>
                    }
                  />
                  {filteredTickets.length ? (
                    filteredTickets.map((ticket, idx) => {
                      const source = getTicketSource(ticket);
                      const channel = getEscalationChannel(ticket);
                      const waiting = formatWaitingTime(ticket);
                      const high = String(ticket.priority).toLowerCase() === "high";
                      const preview = ticketLastPreview(ticket).replace(/\s*\n+Original question:\s*[\s\S]*$/i, "").trim();
                      const displayTitle = ticketDisplayTitle(ticket);
                      const showReporterSub = !isDefaultOptimusTitle(ticket.title);
                      const connectedFirst = firstNameOnly(ticket.owner, "");
                      const isConnected = Boolean(connectedFirst && connectedFirst.toLowerCase() !== "unassigned");
                      return (
                        <Pressable
                          key={ticket.id}
                          accessibilityRole="button"
                          onPress={() => openTicket(ticket.id)}
                          style={({ pressed }) => [
                            styles.ticketRow,
                            idx === filteredTickets.length - 1 && { borderBottomWidth: 0 },
                            pressed && { opacity: 0.72 },
                          ]}
                        >
                          <View style={styles.ticketTop}>
                            <Text style={styles.ticketRef}>
                              {ticket.id}{showReporterSub ? ` · ${ticket.reporter}` : ""}
                            </Text>
                            <StatusPill status={ticket.state} />
                          </View>
                          <Text style={styles.ticketTitle}>{displayTitle}</Text>
                          {preview ? (
                            <Text numberOfLines={2} style={styles.copy}>
                              {preview}
                            </Text>
                          ) : null}
                          <View style={styles.queueBadges}>
                            <View style={[styles.queueTag, source === "Optimus Prime" ? styles.queueTagTeal : styles.queueTagNeutral]}>
                              <Text style={[styles.queueTagText, source === "Optimus Prime" && styles.queueTagTealText]}>
                                {channel !== source ? `${source} · ${channel}` : source}
                              </Text>
                            </View>
                            {ticket.wizardStep ? (
                              <View style={[styles.queueTag, styles.queueTagNeutral]}>
                                <Text style={styles.queueTagText}>Step {ticket.wizardStep}</Text>
                              </View>
                            ) : null}
                            <View style={[styles.queueTag, high ? styles.queueTagRust : styles.queueTagNeutral]}>
                              <Text style={[styles.queueTagText, high && styles.queueTagRustText]}>
                                {ticket.priority} priority
                              </Text>
                            </View>
                            <View style={[styles.queueTag, styles.queueTagNeutral]}>
                              <Text style={styles.queueTagText}>{waiting}</Text>
                            </View>
                            {isConnected ? (
                              <View style={[styles.queueTag, styles.queueTagTeal]}>
                                <Text style={[styles.queueTagText, styles.queueTagTealText]}>
                                  Connected · {connectedFirst}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={styles.queueRowFooter}>
                            <Text style={styles.caption}>
                              {ticket.application ? `App ${ticket.application}` : ticket.kind}
                            </Text>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Open conversation for ${ticket.id}`}
                              onPress={() => openTicket(ticket.id)}
                              style={({ pressed }) => [styles.openConvBtn, pressed && { opacity: 0.72 }]}
                            >
                              <Text style={styles.openConvBtnText}>Open conversation</Text>
                            </Pressable>
                          </View>
                        </Pressable>
                      );
                    })
                  ) : (
                    <Text style={styles.copy}>No support requests match your active filters.</Text>
                  )}
                </GlassCard>
              </>
            )}

            {screen === "performance" && (
              <>
                <GlassCard style={styles.card}>
                  <SectionHeader
                    eyebrow="PERSONAL METRICS & ONLINE CHAT ANALYTICS"
                    title="Performance summary"
                    subtitle={`Personal metrics for ${account.name}. Team-wide performance belongs in the Admin portal.`}
                    right={
                      <Pressable accessibilityRole="button" onPress={() => void loadTickets(true)}>
                        <Text style={styles.link}>Refresh</Text>
                      </Pressable>
                    }
                  />
                  <ActionButton
                    label="Export chat analytics (CSV)"
                    variant="secondary"
                    onPress={() => void handleExportChatAnalyticsCsv()}
                  />
                </GlassCard>

                <View style={styles.kpiGrid}>
                  {[
                    {
                      label: "Requests handled today",
                      value: String(performance.handledToday),
                      caption: "Personal tickets updated or replied to today",
                    },
                    {
                      label: "Requests resolved today",
                      value: String(performance.resolvedToday),
                      caption: "Assigned requests you completed today",
                    },
                    {
                      label: "Average first response time",
                      value: performance.avgFirstResponseLabel,
                      caption: performance.firstResponseCount
                        ? `Across ${performance.firstResponseCount} first reply record${performance.firstResponseCount === 1 ? "" : "s"}`
                        : "Recorded once you send your first replies",
                    },
                    {
                      label: "Average resolution time",
                      value: performance.avgResolutionLabel,
                      caption: performance.resolutionCount
                        ? `Across ${performance.resolutionCount} resolved request${performance.resolutionCount === 1 ? "" : "s"}`
                        : "Shown once requests you handle resolve",
                    },
                    {
                      label: "Reopened requests",
                      value: String(performance.reopenedRequests),
                      caption: "Handled requests reopened after resolution",
                    },
                    {
                      label: "Satisfaction rating",
                      value: performance.satisfactionLabel,
                      caption: performance.satisfactionCount
                        ? `From ${performance.satisfactionCount} innovator rating${performance.satisfactionCount === 1 ? "" : "s"}`
                        : "Shown once feedback is available",
                    },
                  ].map(metric => (
                    <View key={metric.label} style={styles.perfCard}>
                      <FrostedSurface variant="card" borderRadius={18} />
                      <Text style={styles.kpiLabel}>{metric.label}</Text>
                      <Text style={styles.kpiValue}>{metric.value}</Text>
                      <Text style={styles.caption}>{metric.caption}</Text>
                    </View>
                  ))}
                </View>

                <GlassCard style={styles.card}>
                  <SectionHeader
                    eyebrow="REQUIREMENT 4(IV) · ONLINE CHAT ANALYTICS REPORT"
                    title="Live chat & escalation analytics"
                    subtitle={`${chatAnalyticsReport.availability.scheduleLabel} · ${chatAnalyticsReport.availability.badgeLabel}`}
                  />
                  <FactRow
                    label="Total live chats & escalations"
                    value={`${chatAnalyticsReport.totalChats} (${chatAnalyticsReport.totalMessagesExchanged} messages)`}
                  />
                  <FactRow
                    label="Working hours (09:00 to 16:00 Mon to Fri)"
                    value={`${chatAnalyticsReport.workingHoursCount} (${chatAnalyticsReport.workingHoursPct}%)`}
                  />
                  <FactRow
                    label="After-hours / non-working queued"
                    value={`${chatAnalyticsReport.afterHoursOrNonWorkingCount} (${chatAnalyticsReport.afterHoursOrNonWorkingPct}%)`}
                  />
                  <FactRow
                    label="SLA compliance rate"
                    value={`${chatAnalyticsReport.slaCompliancePct}% (Avg 1st reply: ${chatAnalyticsReport.avgFirstResponseLabel})`}
                  />
                  {chatAnalyticsReport.channelBreakdown.map((ch, idx) => (
                    <FactRow
                      key={ch.key}
                      label={ch.label}
                      value={`${ch.count} (${ch.pct}%)`}
                      last={idx === chatAnalyticsReport.channelBreakdown.length - 1}
                    />
                  ))}
                </GlassCard>
              </>
            )}

            {screen === "playbook" && (
              <>
                <GlassCard style={styles.card}>
                  <SectionHeader eyebrow="STANDARDS" title="Support Officer playbook" subtitle="Consistent guidance across Web and Mobile" />
                  <IconRow
                    title="Optimus Prime AI escalations"
                    detail="Review consented applicant context first, transition Open → Investigating promptly, and answer in plain language."
                    icon="optimus"
                    tint="#E4F4F0"
                    color={colors.teal}
                  />
                  <IconRow
                    title="Strict assessment separation"
                    detail="Support Officers never score applications, modify assessment panels, or release review outcomes."
                    icon="settings"
                    tint="#FBEDE8"
                    color={colors.rustDark}
                  />
                  <IconRow
                    title="Evidence & document limits"
                    detail="12 applicant files, 8 supplementary files, 4 files in other sections (max 10 MB PDF/DOCX/PPTX/XLSX/JPG/PNG) plus HTTPS video links."
                    icon="documents"
                    tint="#EAF1FC"
                    color={colors.blue}
                    last
                  />
                </GlassCard>

                <GlassCard style={styles.card}>
                  <SectionHeader eyebrow="WORKFLOW" title="Four-stage ticket lifecycle" />
                  <FactRow label="1. Open (25%)" value="Incoming innovator query or Optimus Prime escalation waiting for first review." />
                  <FactRow label="2. Investigating (60%)" value="Assigned to a Support Officer actively checking portal records or technical logs." />
                  <FactRow label="3. Waiting (80%)" value="Clarification sent to innovator; waiting for applicant response or verification." />
                  <FactRow label="4. Resolved (100%)" value="Outcome confirmed with clear next steps and internal 5+ char audit note." last />
                </GlassCard>

                <GlassCard style={styles.card}>
                  <SectionHeader
                    eyebrow="HOSTING SUPPORT & SLAS"
                    title="Hosting support & SLAs"
                    subtitle={`${HOSTING_SUPPORT_SLA.availabilityTarget}. ${HOSTING_SUPPORT_SLA.supportHours}.`}
                  />
                  {HOSTING_SUPPORT_SLA.tiers.map((tier) => (
                    <FactRow
                      key={tier.severity}
                      label={`${tier.severity} · Resolve ${tier.resolutionTurnaround}`}
                      value={`Ack ${tier.acknowledgement} · Contain ${tier.containment} · ${tier.escalationOwner}. ${tier.scope}`}
                    />
                  ))}
                  <FactRow
                    label="Recovery & rollback"
                    value={`RPO ${HOSTING_SUPPORT_SLA.backupRecovery.rpo} · RTO ${HOSTING_SUPPORT_SLA.backupRecovery.rto} · Rollback ${HOSTING_SUPPORT_SLA.backupRecovery.rollbackTurnaround}`}
                  />
                  <FactRow
                    label="Fault channels"
                    value={`${HOSTING_SUPPORT_SLA.channels.portalQueue} · ${HOSTING_SUPPORT_SLA.channels.email}`}
                    last
                  />
                </GlassCard>
              </>
            )}

            {screen === "account" && (
              <>
                <GlassCard style={styles.card}>
                  <SectionHeader title="Account & security" />
                  <FactRow label="Full name" value={account.name} />
                  <FactRow label="Role" value="Support Officer" />
                  <FactRow label="Session expires" value={sessionExpiry} />
                  <FactRow label="Authenticator verification" value={isTokenAal2(account.token) ? "Verified (AAL2)" : "Pending"} last />
                  {sessionError ? <Text accessibilityRole="alert" style={styles.errorText}>{sessionError}</Text> : null}
                  {sessionMessage ? <Text accessibilityLiveRegion="polite" style={styles.successText}>{sessionMessage}</Text> : null}
                  <ActionButton
                    label="Sign out other devices"
                    variant="secondary"
                    loading={endingSessions}
                    onPress={() => void handleSignOutOtherDevices()}
                  />
                  <ActionButton label="Sign out" variant="secondary" onPress={onSignOut} />
                </GlassCard>
                <AccountSecurityCards
                  account={account}
                  friendlyName="CEDA Support Mobile"
                  webPath="/support/#settings"
                  onAccountChange={onAccountChange}
                />
              </>
            )}
          </ScrollView>

          <View accessibilityRole="tablist" style={[styles.tabBar, darkMode && { borderTopColor: "rgba(240,220,200,0.08)" }, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <FrostedSurface variant="bar" />
            {tabs.map(tab => {
              const active = screen === tab.key;
              const tabEl = (
                <Pressable
                  key={tab.key}
                  accessibilityRole="tab"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected: active }}
                  onPress={() => setScreen(tab.key)}
                  style={({ pressed }) => [
                    styles.tab,
                    active && [styles.selectedTab, darkMode && { backgroundColor: "rgba(224,112,96,0.16)" }],
                    pressed && !active && { opacity: 0.72 },
                  ]}
                >
                  <InnovatorIcon name={tab.icon} color={active ? colors.rust : darkMuted} />
                  <Text numberOfLines={1} style={[styles.tabLabel, { color: darkMuted }, active && styles.selectedTabLabel]}>
                    {tab.short}
                  </Text>
                </Pressable>
              );
              if (tab.key === "overview" || tab.key === "queue" || tab.key === "performance") {
                return (
                  <TourTarget key={tab.key} id={`support.${tab.key}`} style={{ flex: 1 }}>
                    {tabEl}
                  </TourTarget>
                );
              }
              return tabEl;
            })}
          </View>

          <Modal visible={drawerOpen} transparent statusBarTranslucent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
            <FrostedModalBackdrop>
              <View style={styles.drawerBackdrop}>
                <Pressable accessibilityRole="button" accessibilityLabel="Close support menu" onPress={() => setDrawerOpen(false)} style={StyleSheet.absoluteFill} />
                <View accessibilityViewIsModal style={[styles.drawer, darkMode && { borderColor: "rgba(240,220,200,0.12)" }, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 18) }]}>
                  <FrostedSurface variant="sheet" />
                  <View style={[styles.drawerHeading, darkMode && { borderBottomColor: "rgba(240,220,200,0.08)" }]}>
                    <View style={styles.drawerBrand}>
                      <Image
                        source={require("./assets/ceda.png")}
                        resizeMode="contain"
                        style={styles.logo}
                        accessibilityLabel="CEDA Innovation"
                      />
                      <View style={{ flex: 1 }}>
                        <Text accessibilityRole="header" style={[styles.drawerHeadingTitle, { color: darkInk }]}>
                          Support Desk
                        </Text>
                        <Text style={[styles.headerSubtitle, { color: darkMuted }]}>Quick navigation</Text>
                      </View>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={() => setDrawerOpen(false)} style={({ pressed }) => [styles.closeCircle, darkMode && { backgroundColor: "#252018", borderColor: "rgba(240,220,200,0.16)" }, pressed && { opacity: 0.7 }]}>
                      <InnovatorIcon name="close" color={darkInk} />
                    </Pressable>
                  </View>
                  <ScrollView contentContainerStyle={styles.drawerList}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Take guided portal tour"
                      onPress={() => {
                        setDrawerOpen(false);
                        setTimeout(() => startTour("support"), 200);
                      }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 10, paddingVertical: 12, borderRadius: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: darkMode ? "rgba(240,220,200,0.12)" : "rgba(36,28,25,0.08)", marginBottom: 6 }}
                    >
                      <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: darkMode ? "#17332d" : "#E4F4F0", alignItems: "center", justifyContent: "center" }}>
                        <MobileIcon name="compass" color={colors.teal} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.drawerItemTitle, { color: darkInk }]}>Take Portal Tour</Text>
                        <Text numberOfLines={1} style={[styles.headerSubtitle, { color: darkMuted }]}>Guided walkthrough of key tools</Text>
                      </View>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Open Accessibility and TalkBack settings"
                      onPress={() => {
                        setDrawerOpen(false);
                        openA11yModal();
                      }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 10, paddingVertical: 12, borderRadius: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: darkMode ? "rgba(240,220,200,0.12)" : "rgba(36,28,25,0.08)", marginBottom: 6 }}
                    >
                      <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: darkMode ? "#2e1c18" : "#FBEDE8", alignItems: "center", justifyContent: "center" }}>
                        <MobileIcon name="accessibility" color={colors.rust} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.drawerItemTitle, { color: darkInk }]}>Accessibility &amp; TalkBack</Text>
                        <Text numberOfLines={1} style={[styles.headerSubtitle, { color: darkMuted }]}>Dark mode, text size &amp; speech feedback</Text>
                      </View>
                    </Pressable>
                    {tabs.map(tab => (
                      <IconRow
                        key={tab.key}
                        title={tab.label}
                        detail={
                          tab.key === "overview"
                            ? "Availability, 4 KPIs & urgent action"
                            : tab.key === "queue"
                              ? `${summary.openRequests} open request${summary.openRequests === 1 ? "" : "s"}`
                              : tab.key === "performance"
                                ? "Personal turnaround & workload"
                                : tab.key === "playbook"
                                  ? "Escalation rules & workflow guide"
                                  : "MFA, password & sessions"
                        }
                        icon={tab.icon}
                        tint={screen === tab.key ? "#FBEDE8" : "#F3EFE9"}
                        color={screen === tab.key ? colors.rustDark : colors.navy}
                        badge={tab.key === "queue" && summary.openRequests > 0 ? `${summary.openRequests} open` : undefined}
                        onPress={() => {
                          setScreen(tab.key);
                          setDrawerOpen(false);
                        }}
                      />
                    ))}
                    <ActionButton label="Sign out" variant="secondary" onPress={onSignOut} />
                  </ScrollView>
                  <View style={[styles.drawerAccount, darkMode && { borderTopColor: "rgba(240,220,200,0.08)" }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.drawerItemTitle, { color: darkInk }]}>{account.name}</Text>
                      <Text numberOfLines={1} style={[styles.headerSubtitle, { color: darkMuted }]}>Support Officer · {availability}</Text>
                    </View>
                    <ActionButton label="Sign out" variant="secondary" compact onPress={onSignOut} />
                  </View>
                </View>
              </View>
            </FrostedModalBackdrop>
          </Modal>

          <SupportConversationModal
            account={account}
            ticket={selectedTicket}
            onClose={() => setSelectedTicketId(null)}
            onTicketsUpdated={updated => setTickets(updated)}
          />
        </FrostedScreenBackdrop>
      </View>
    </InnovatorA11yProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.88)", overflow: "hidden" },
  headerAction: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.82)", borderWidth: 1, borderColor: "#E5DDD3", justifyContent: "center", alignItems: "center" },
  brand: { flex: 1, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  logo: { width: 40, height: 36 },
  headerBody: { flex: 1, minWidth: 0, gap: 2 },
  headerTitle: { color: colors.navy, fontSize: fontSizes.heading, fontWeight: "700" },
  headerSubtitle: { color: colors.muted, fontSize: fontSizes.caption },
  bellDot: { position: "absolute", top: 9, right: 10, width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.rust, borderWidth: 1.2, borderColor: "white" },
  body: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, gap: 14, width: "100%", maxWidth: 760, alignSelf: "center" },
  card: { gap: 10 },
  eyebrow: { color: colors.rustDark, fontSize: fontSizes.caption, fontWeight: "700" },
  heroTitle: { color: colors.navy, fontSize: fontSizes.hero, fontWeight: "700" },
  copy: { color: colors.muted, fontSize: fontSizes.body, lineHeight: 20 },
  caption: { color: colors.muted, fontSize: fontSizes.caption },
  link: { color: colors.rustDark, fontSize: fontSizes.subbody, fontWeight: "700" },
  errorText: { color: colors.rustDark, fontSize: fontSizes.subbody, fontWeight: "600" },
  successText: { color: colors.teal, fontSize: fontSizes.subbody, fontWeight: "700" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpiCard: { flexBasis: "46%", flexGrow: 1, borderRadius: 18, borderWidth: 1, borderColor: colors.borderWhite, padding: 14, gap: 6, overflow: "hidden" },
  kpiTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  kpiIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  kpiBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  kpiBadgeText: { fontSize: fontSizes.caption, fontWeight: "700" },
  kpiValue: { color: colors.navy, fontSize: fontSizes.title, fontWeight: "700", letterSpacing: -0.6 },
  kpiLabel: { color: colors.navy, fontSize: fontSizes.subbody, fontWeight: "700" },
  visualRow: { flexDirection: "row", alignItems: "center", gap: 18 },
  availabilityWrap: { gap: 8, paddingTop: 4 },
  availabilityHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  availabilityBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  availabilityBadgeText: { fontSize: fontSizes.caption, fontWeight: "700" },
  availabilityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  availabilityPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: "#F8F3EC" },
  availabilityLabel: { color: colors.navy, fontSize: fontSizes.subbody },
  subheading: { color: colors.muted, fontSize: fontSizes.caption, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  ticketRow: { gap: 6, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  ticketTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  ticketRef: { color: colors.rustDark, fontSize: fontSizes.caption, fontWeight: "700", flex: 1 },
  ticketTitle: { color: colors.navy, fontSize: fontSizes.body, fontWeight: "700" },
  queueBadges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  queueTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  queueTagText: { fontSize: 11, fontWeight: "700", color: colors.navy },
  queueTagNeutral: { backgroundColor: "#F2ECE5" },
  queueTagTeal: { backgroundColor: "#E4F4F0" },
  queueTagTealText: { color: colors.teal },
  queueTagRust: { backgroundColor: "#FBEDE8" },
  queueTagRustText: { color: colors.rustDark },
  queueTagAmber: { backgroundColor: "#FBF0DD" },
  queueTagAmberText: { color: "#8A5306" },
  queueRowFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 2 },
  openConvBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: "#FFF5ED", borderWidth: 1, borderColor: "#D9C3B6" },
  openConvBtnText: { color: colors.rustDark, fontSize: fontSizes.caption, fontWeight: "700" },
  perfCard: { flexBasis: "46%", flexGrow: 1, borderRadius: 18, borderWidth: 1, borderColor: colors.borderWhite, padding: 14, gap: 6, overflow: "hidden" },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.9)",
    paddingTop: 8,
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  tab: {
    flex: 1,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 6,
  },
  tabLabel: { fontSize: fontSizes.caption, color: colors.muted, textAlign: "center" },
  selectedTab: { backgroundColor: "rgba(251,237,232,0.88)", borderRadius: 14 },
  selectedTabLabel: { color: colors.rust, fontWeight: "700" },
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
    borderBottomColor: "rgba(218,208,198,0.45)",
  },
  drawerBrand: { flex: 1, flexDirection: "row", gap: 10, alignItems: "center" },
  drawerHeadingTitle: { color: colors.navy, fontSize: fontSizes.heading, fontWeight: "700", letterSpacing: -0.3 },
  closeCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F5F1EC",
    borderWidth: 1,
    borderColor: "#E5DDD3",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerList: { padding: 14, gap: 4 },
  drawerItemTitle: { color: colors.navy, fontWeight: "600", fontSize: fontSizes.body },
  drawerAccount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 14,
    borderTopColor: "rgba(218,208,198,0.45)",
    borderTopWidth: 1,
  },
});
