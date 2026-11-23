import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import type { Account } from "./auth";
import { AccountSecurityCards } from "./AccountSecurityCards";
import { FrostedModalBackdrop, FrostedScreenBackdrop, FrostedSurface } from "./FrostedGlass";
import { useFcmNotifications } from "./useFcmNotifications";
import {
  ActionButton,
  FactRow,
  FrostedSearchPill,
  GlassCard,
  IconRow,
  InnovatorIcon,
  MetricTile,
  SectionHeader,
  StatusPill,
  adminStyleColors as colors,
} from "./InnovatorUI";
import {
  COMMITTEE_STATUS_FILTERS,
  buildCommitteeSummary,
  buildLifecycleSteps,
  committeeStageLabel,
  filterCommitteeApplications,
  filterCommitteeTimeline,
  formatAwardSummaryText,
} from "./committeeOverview.js";
import {
  getCommitteeCase,
  getCommitteeWorkspace,
  type CommitteeApplication,
  type CommitteeCaseDetail,
  type CommitteeTimelineEntry,
  type CommitteeWorkspaceData,
} from "./committeeApi";
import { buttonCornerRadius, fontSizes } from "./theme";
import { MobileIcon } from "./AdminOverview";
import { TourTarget, useTour } from "./TourGuide";
import { useAccessibility } from "./useAccessibility";

type TabKey = "overview" | "timeline" | "applications" | "awards" | "account";

const tabs: Array<{ key: TabKey; label: string; icon: "home" | "pulse" | "applications" | "check" | "shield" }> = [
  { key: "overview", label: "Overview", icon: "home" },
  { key: "timeline", label: "Timeline", icon: "pulse" },
  { key: "applications", label: "Cases", icon: "applications" },
  { key: "awards", label: "Awards", icon: "check" },
  { key: "account", label: "Account", icon: "shield" },
];

export function CommitteeWorkspace({
  account,
  onSignOut,
  onAccountChange,
}: {
  account: Account;
  onSignOut: () => void;
  onAccountChange: (account: Account) => void;
}) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>("overview");
  const [data, setData] = useState<CommitteeWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [stageFilter, setStageFilter] = useState("All");
  const [selectedDetail, setSelectedDetail] = useState<CommitteeCaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailVisible, setDetailVisible] = useState(false);

  const loadWorkspace = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const workspace = await getCommitteeWorkspace(account);
      setData(workspace);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load committee workspace.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [account]);

  useEffect(() => {
    void loadWorkspace(false);
  }, [loadWorkspace]);

  const fcm = useFcmNotifications(account, {
    onForegroundMessage: () => void loadWorkspace(true),
  });

  const summary = useMemo(() => buildCommitteeSummary(data), [data]);
  const filteredApps = useMemo(
    () => filterCommitteeApplications(data?.applications || [], { query, status: statusFilter }),
    [data, query, statusFilter]
  );
  const filteredTimeline = useMemo(
    () => filterCommitteeTimeline(data?.timelineEvents || [], { query, stage: stageFilter }),
    [data, query, stageFilter]
  );

  async function openCase(appId: string, fallback?: CommitteeApplication) {
    setDetailVisible(true);
    setDetailError("");
    setDetailLoading(true);
    if (fallback) {
      setSelectedDetail({
        case: fallback,
        roundOverview: null,
        outcomeData: fallback.outcomeData || {},
        awardData: fallback.awardData || {},
        timeline: fallback.timeline || [],
        documents: [],
      });
    } else {
      setSelectedDetail(null);
    }
    try {
      const detail = await getCommitteeCase(account, appId);
      setSelectedDetail(detail);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Could not load application detail.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleShareAward(app: CommitteeApplication) {
    await Share.share({
      title: `${app.reference} CEDA Award Brief`,
      message: formatAwardSummaryText(app),
    });
  }

  const { darkMode, openModal: openA11yModal, scaleFont } = useAccessibility();
  const { setPortalContext } = useTour();

  useEffect(() => {
    setPortalContext("committee", (nextScreen) => {
      setTab(nextScreen as TabKey);
    });
  }, [setPortalContext]);
  const darkInk = darkMode ? "#f0e8e0" : colors.navy;
  const darkMuted = darkMode ? "#b8a898" : colors.muted;
  const scopeLabel = data?.profile?.sectorNames?.length
    ? data.profile.sectorNames.join(", ")
    : "All visible sectors";

  return (
    <View style={[styles.root, darkMode && { backgroundColor: "#131009" }]}>
      <FrostedScreenBackdrop>
      <View style={[styles.header, darkMode && { borderBottomColor: "rgba(240,220,200,0.08)" }, { paddingTop: insets.top + 8 }]}>
        <FrostedSurface variant="bar" borderRadius={0} />
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: darkMuted }]}>COMMITTEE OBSERVER · READ-ONLY</Text>
            <Text style={[styles.headerTitle, { color: darkInk, fontSize: scaleFont(fontSizes.heading) }]} numberOfLines={1}>
              {data?.profile?.name || account.name}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={[styles.readonlyPill, darkMode && { backgroundColor: "#2e1c18" }]}>
              <Text style={styles.readonlyPillText}>Observer</Text>
            </View>
            <TourTarget id="committee.accessibility">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Accessibility and TalkBack settings"
              onPress={openA11yModal}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: darkMode ? "rgba(37,32,24,0.88)" : "rgba(255,255,255,0.86)",
                borderWidth: 1,
                borderColor: darkMode ? "rgba(240,220,200,0.16)" : "#E5DDD3",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MobileIcon name="accessibility" color={darkInk} />
            </Pressable>
            </TourTarget>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 104 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadWorkspace(true)} tintColor={colors.rust} />}
      >
        {loading && !data ? (
          <GlassCard>
            <View style={styles.centerRow}>
              <ActivityIndicator color={colors.rust} />
              <Text style={styles.copy}>Loading committee portfolio...</Text>
            </View>
          </GlassCard>
        ) : error ? (
          <GlassCard>
            <SectionHeader title="Workspace unavailable" subtitle={error} />
            <ActionButton label="Retry" compact onPress={() => void loadWorkspace(false)} />
          </GlassCard>
        ) : null}

        {!loading && !error && tab === "overview" && (
          <>
            <GlassCard>
              <SectionHeader
                eyebrow="PIPELINE & AWARDS OVERVIEW"
                title="Lifecycle visibility"
                subtitle={`Scope: ${scopeLabel}. External committee observers monitor progression in strict read-only mode.`}
              />
              <View style={styles.metricsGrid}>
                <MetricTile label="Visible cases" value={String(summary.counts.total)} caption="Non-draft portfolio" icon="applications" color={colors.blue} />
                <MetricTile label="In review & feedback" value={String(summary.counts.inReview + summary.counts.changesRequested)} caption={`${summary.counts.changesRequested} clarification`} icon="clock" color={colors.amber} />
                <MetricTile label="Approved" value={String(summary.counts.approved)} caption={`${summary.approvalRatePct}% positive outcomes`} icon="check" color={colors.teal} />
                <MetricTile label="Awarded" value={String(summary.counts.awarded)} caption={`${summary.awardConversionPct}% awarded rate`} icon="check" color="#7C5317" />
              </View>
            </GlassCard>

            <GlassCard>
              <SectionHeader
                eyebrow="5-STAGE PROGRESSION"
                title="Submission → Review → Feedback → Approval → Award"
                right={<ActionButton label="Timeline" compact variant="secondary" onPress={() => setTab("timeline")} />}
              />
              <View style={styles.stageRow}>
                {[
                  ["Submission", summary.counts.submitted],
                  ["Review", summary.counts.inReview],
                  ["Feedback", summary.counts.changesRequested],
                  ["Approval", summary.counts.approved],
                  ["Award", summary.counts.awarded],
                ].map(([label, count], idx) => (
                  <View key={String(label)} style={[styles.stageBox, label === "Award" && styles.stageBoxAward]}>
                    <Text style={styles.stageIndex}>S{idx + 1}</Text>
                    <Text style={styles.stageCount}>{String(count)}</Text>
                    <Text style={styles.stageLabel}>{String(label)}</Text>
                  </View>
                ))}
              </View>
            </GlassCard>

            <GlassCard>
              <SectionHeader
                eyebrow="AWARDS SHOWCASE"
                title="Recent conferred awards"
                right={<ActionButton label="View all" compact variant="secondary" onPress={() => setTab("awards")} />}
              />
              {summary.awardedShowcase.length ? summary.awardedShowcase.slice(0, 4).map((app: CommitteeApplication, idx: number, arr: CommitteeApplication[]) => (
                <IconRow
                  key={app.id}
                  title={String(app.awardData?.awardTitle || app.title)}
                  detail={`${app.reference} · ${app.applicant} · ${app.awardedAt || app.updatedAt}`}
                  icon="check"
                  color="#7C5317"
                  tint="#FFF3D8"
                  badge="Awarded"
                  last={idx === arr.length - 1}
                  onPress={() => void openCase(app.id, app)}
                />
              )) : <Text style={styles.copy}>No applications have reached the Award stage yet.</Text>}
            </GlassCard>

            <GlassCard>
              <SectionHeader
                eyebrow="MILESTONES"
                title="Recent pipeline activity"
                right={<ActionButton label="Full feed" compact variant="secondary" onPress={() => setTab("timeline")} />}
              />
              {summary.recentMilestones.length ? summary.recentMilestones.slice(0, 5).map((evt: CommitteeTimelineEntry, idx: number, arr: CommitteeTimelineEntry[]) => (
                <IconRow
                  key={`${evt.applicationId}-${idx}`}
                  title={`${evt.reference} · ${evt.label}`}
                  detail={`${evt.title} · ${evt.at}`}
                  icon="pulse"
                  color={colors.blue}
                  tint="#EAF1FC"
                  badge={evt.status}
                  last={idx === arr.length - 1}
                  onPress={() => void openCase(evt.applicationId)}
                />
              )) : <Text style={styles.copy}>No timeline events recorded yet.</Text>}
            </GlassCard>
          </>
        )}

        {!loading && !error && tab === "timeline" && (
          <>
            <FrostedSearchPill value={query} onChangeText={setQuery} placeholder="Search milestones, references or titles" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {["All", "Submission", "Review", "Feedback", "Approval", "Award"].map(item => (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected: stageFilter === item }}
                  onPress={() => setStageFilter(item)}
                  style={[styles.filterPill, stageFilter === item && styles.filterPillActive]}
                >
                  <Text style={[styles.filterPillText, stageFilter === item && styles.filterPillTextActive]}>{item}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <GlassCard>
              <SectionHeader eyebrow="TIMELINE VIEW" title={`Recorded milestones (${filteredTimeline.length})`} subtitle="Tap any event to inspect full lifecycle progression." />
              {filteredTimeline.length ? filteredTimeline.map((evt: CommitteeTimelineEntry, idx: number, arr: CommitteeTimelineEntry[]) => (
                <IconRow
                  key={`${evt.applicationId}-${evt.at}-${idx}`}
                  title={`${evt.reference} · ${evt.label}`}
                  detail={`${evt.detail}\n${evt.title} (${evt.sector}) · ${evt.at}`}
                  icon="pulse"
                  color={evt.status === "Awarded" ? "#7C5317" : colors.blue}
                  tint={evt.status === "Awarded" ? "#FFF3D8" : "#EAF1FC"}
                  badge={evt.status}
                  last={idx === arr.length - 1}
                  onPress={() => void openCase(evt.applicationId)}
                />
              )) : <Text style={styles.copy}>No timeline milestones match your filters.</Text>}
            </GlassCard>
          </>
        )}

        {!loading && !error && tab === "applications" && (
          <>
            <FrostedSearchPill value={query} onChangeText={setQuery} placeholder="Search applications by ref, title or applicant" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              {COMMITTEE_STATUS_FILTERS.map(item => (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected: statusFilter === item }}
                  onPress={() => setStatusFilter(item)}
                  style={[styles.filterPill, statusFilter === item && styles.filterPillActive]}
                >
                  <Text style={[styles.filterPillText, statusFilter === item && styles.filterPillTextActive]}>{item}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <GlassCard>
              <SectionHeader eyebrow="PORTFOLIO" title={`Applications (${filteredApps.length})`} subtitle="Read-only observer view." />
              {filteredApps.length ? filteredApps.map((app: CommitteeApplication, idx: number, arr: CommitteeApplication[]) => (
                <IconRow
                  key={app.id}
                  title={`${app.reference} · ${app.title}`}
                  detail={`${app.applicant} · ${app.sector} · Stage: ${committeeStageLabel(app.status)}`}
                  icon="applications"
                  color={app.status === "Awarded" ? "#7C5317" : colors.teal}
                  tint={app.status === "Awarded" ? "#FFF3D8" : "#E4F4F0"}
                  badge={app.status}
                  last={idx === arr.length - 1}
                  onPress={() => void openCase(app.id, app)}
                />
              )) : <Text style={styles.copy}>No applications match these filters.</Text>}
            </GlassCard>
          </>
        )}

        {!loading && !error && tab === "awards" && (
          <>
            <GlassCard>
              <SectionHeader eyebrow="AWARD STAGE SHOWCASE" title={`Awarded innovations (${summary.awardedShowcase.length})`} />
              {summary.awardedShowcase.length ? summary.awardedShowcase.map((app: CommitteeApplication) => {
                const award = app.awardData || {};
                return (
                  <View key={app.id} style={styles.awardCard}>
                    <View style={styles.awardCardTop}>
                      <StatusPill status="Awarded" />
                      <Text style={styles.awardMeta}>{app.reference} · {String(award.conferredAt || app.awardedAt || app.updatedAt || "Recorded")}</Text>
                    </View>
                    <Text style={styles.awardTitle}>{String(award.awardTitle || app.title)}</Text>
                    <Text style={styles.copy}>{String(award.awardCategory || "Innovation Recognition & Support")}{award.awardAmount ? ` · ${String(award.awardAmount)}` : ""}</Text>
                    <Text style={styles.copy}>{String(award.awardSummary || app.summary)}</Text>
                    <View style={styles.actionRow}>
                      <ActionButton label="Inspect timeline" compact onPress={() => void openCase(app.id, app)} />
                      <ActionButton label="Share brief" compact variant="secondary" onPress={() => void handleShareAward(app)} />
                    </View>
                  </View>
                );
              }) : <Text style={styles.copy}>No awarded applications in your visible scope yet.</Text>}
            </GlassCard>

            <GlassCard>
              <SectionHeader eyebrow="NEXT FOR AWARD" title={`Approved & awaiting award (${summary.awaitingAward.length})`} />
              {summary.awaitingAward.length ? summary.awaitingAward.map((app: CommitteeApplication, idx: number, arr: CommitteeApplication[]) => (
                <IconRow
                  key={app.id}
                  title={`${app.reference} · ${app.title}`}
                  detail={`${app.applicant} · ${app.sector}`}
                  icon="check"
                  color={colors.teal}
                  tint="#E4F4F0"
                  badge="Approved"
                  last={idx === arr.length - 1}
                  onPress={() => void openCase(app.id, app)}
                />
              )) : <Text style={styles.copy}>No Approved applications currently awaiting award conferral.</Text>}
            </GlassCard>
          </>
        )}

        {tab === "account" && (
          <>
            <GlassCard>
              <SectionHeader eyebrow="EXTERNAL STAKEHOLDER" title="Committee observer profile" />
              <FactRow label="Full name" value={data?.profile?.name || account.name} />
              <FactRow label="Role" value="Committee Observer (Read-only)" />
              <FactRow label="Sector scope" value={scopeLabel} last />
            </GlassCard>
            <AccountSecurityCards
              account={account}
              friendlyName="CEDA Committee Mobile"
              webPath="/committee/#settings"
              onAccountChange={onAccountChange}
              fcm={fcm}
            />
            <GlassCard>
              <ActionButton label="Sign out" variant="secondary" onPress={onSignOut} />
            </GlassCard>
          </>
        )}
      </ScrollView>

      <View style={[styles.tabBar, darkMode && { borderTopColor: "rgba(240,220,200,0.08)" }, { paddingBottom: Math.max(10, insets.bottom) }]}>
        <FrostedSurface variant="bar" borderRadius={0} />
        {tabs.map(item => {
          const active = tab === item.key;
          const tabEl = (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(item.key)}
              style={styles.tabItem}
            >
              <InnovatorIcon name={item.icon} color={active ? colors.rust : darkMuted} />
              <Text style={[styles.tabText, { color: darkMuted }, active && styles.tabTextActive]}>{item.label}</Text>
            </Pressable>
          );
          if (item.key === "overview" || item.key === "timeline" || item.key === "awards") {
            return (
              <TourTarget key={item.key} id={`committee.${item.key}`} style={{ flex: 1 }}>
                {tabEl}
              </TourTarget>
            );
          }
          return tabEl;
        })}
      </View>
      </FrostedScreenBackdrop>

      <Modal visible={detailVisible} animationType="slide" transparent onRequestClose={() => setDetailVisible(false)}>
        <FrostedModalBackdrop>
          <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, darkMode && { backgroundColor: "#1a1510", borderColor: "rgba(240,220,200,0.12)", borderWidth: 1 }, { marginTop: insets.top + 16, marginBottom: insets.bottom + 12 }]}>
            <View style={[styles.modalHeader, darkMode && { borderBottomColor: "rgba(240,220,200,0.08)" }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.eyebrow, { color: darkMuted }]}>{selectedDetail?.case.reference || "APPLICATION"} · READ-ONLY</Text>
                <Text style={[styles.modalTitle, { color: darkInk }]} numberOfLines={2}>{selectedDetail?.case.title || "Application timeline"}</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => setDetailVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 20 }}>
              {detailLoading && !selectedDetail ? <ActivityIndicator color={colors.rust} /> : null}
              {detailError ? <Text style={styles.errorText}>{detailError}</Text> : null}
              {selectedDetail && (
                <>
                  <View style={styles.pillRow}>
                    <StatusPill status={selectedDetail.case.status} />
                    {selectedDetail.case.status === "Awarded" && (
                      <ActionButton label="Share award brief" compact variant="secondary" onPress={() => void handleShareAward(selectedDetail.case)} />
                    )}
                  </View>

                  <View style={styles.sectionBox}>
                    <Text style={styles.sectionTitle}>Lifecycle progression</Text>
                    {buildLifecycleSteps({ ...selectedDetail.case, timeline: selectedDetail.timeline }).map((step: { key: string; label: string; stepNumber: number; state: string; at: string | null; detail: string }) => (
                      <View key={step.key} style={styles.stepRow}>
                        <View style={[styles.stepBadge, step.state === "completed" && styles.stepBadgeDone, step.state === "current" && styles.stepBadgeCurrent]}>
                          <Text style={styles.stepBadgeText}>{step.stepNumber}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.stepTitle}>{step.label}</Text>
                          <Text style={styles.copy}>{step.at ? `${step.at} · ` : ""}{step.detail}</Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  {selectedDetail.case.status === "Awarded" && (
                    <View style={styles.awardCard}>
                      <Text style={styles.eyebrow}>INNOVATION AWARD RECOGNITION</Text>
                      <Text style={styles.awardTitle}>{String(selectedDetail.awardData?.awardTitle || selectedDetail.case.title)}</Text>
                      <Text style={styles.copy}>{String(selectedDetail.awardData?.awardCategory || "Innovation Recognition & Support")}</Text>
                      {selectedDetail.awardData?.awardAmount ? <Text style={styles.copy}>Package: {String(selectedDetail.awardData.awardAmount)}</Text> : null}
                      <Text style={styles.copy}>{String(selectedDetail.awardData?.awardSummary || "Official CEDA Innovation Award conferred.")}</Text>
                    </View>
                  )}

                  <View style={styles.sectionBox}>
                    <FactRow label="Applicant" value={selectedDetail.case.applicant} />
                    <FactRow label="Sector" value={selectedDetail.case.sector} />
                    <FactRow label="Submitted" value={selectedDetail.case.submittedDate || "N/A"} />
                    {selectedDetail.roundOverview ? (
                      <FactRow label="Assessment progress" value={`${selectedDetail.roundOverview.roundState} (${selectedDetail.roundOverview.reviewCount}/${selectedDetail.roundOverview.memberCount} reviews)`} last />
                    ) : <FactRow label="Stage" value={committeeStageLabel(selectedDetail.case.status)} last />}
                  </View>

                  <View style={styles.sectionBox}>
                    <Text style={styles.sectionTitle}>Summary</Text>
                    <Text style={styles.copy}>{selectedDetail.case.summary}</Text>
                  </View>

                  <View style={styles.sectionBox}>
                    <Text style={styles.sectionTitle}>Milestone timeline ({selectedDetail.timeline.length})</Text>
                    {selectedDetail.timeline.length ? selectedDetail.timeline.map((evt: { label: string; detail: string; at: string }, idx: number) => (
                      <FactRow key={`${evt.label}-${idx}`} label={`${evt.label}${evt.at ? ` (${evt.at})` : ""}`} value={evt.detail} last={idx === selectedDetail.timeline.length - 1} />
                    )) : <Text style={styles.copy}>No milestones recorded yet.</Text>}
                  </View>
                </>
              )}
            </ScrollView>
          </View>
          </View>
        </FrostedModalBackdrop>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FDFCFA" },
  header: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(36,28,25,0.1)", overflow: "hidden" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  eyebrow: { fontSize: fontSizes.caption, fontWeight: "700", color: colors.muted, letterSpacing: 0.7 },
  headerTitle: { fontSize: fontSizes.heading, fontWeight: "700", color: colors.navy },
  readonlyPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "#E8F1FB", borderWidth: 1, borderColor: "rgba(36,83,133,0.18)" },
  readonlyPillText: { fontSize: fontSizes.caption, fontWeight: "700", color: "#245385" },
  scrollContent: { padding: 16, gap: 14 },
  centerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  copy: { fontSize: fontSizes.subbody, color: colors.subtle, lineHeight: 20 },
  errorText: { fontSize: fontSizes.subbody, color: "#903925", fontWeight: "600" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stageRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stageBox: { flexBasis: "17%", flexGrow: 1, minWidth: 88, padding: 10, borderRadius: 12, backgroundColor: "#FAF7F2", borderWidth: 1, borderColor: "rgba(36,28,25,0.08)", gap: 2 },
  stageBoxAward: { backgroundColor: "#FFF6E4", borderColor: "rgba(180,122,24,0.3)" },
  stageIndex: { fontSize: 11, fontWeight: "700", color: colors.muted },
  stageCount: { fontSize: fontSizes.heading, fontWeight: "700", color: colors.navy },
  stageLabel: { fontSize: 12, color: colors.subtle, fontWeight: "600" },
  pillRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" },
  filterPill: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: buttonCornerRadius, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "rgba(36,28,25,0.12)" },
  filterPillActive: { backgroundColor: colors.rust, borderColor: colors.rust },
  filterPillText: { fontSize: fontSizes.caption, fontWeight: "600", color: colors.navy },
  filterPillTextActive: { color: "#FFFFFF" },
  awardCard: { padding: 14, borderRadius: 16, backgroundColor: "#FFF8EB", borderWidth: 1, borderColor: "rgba(180,122,24,0.3)", gap: 8 },
  awardCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 },
  awardMeta: { fontSize: fontSizes.caption, color: colors.muted, fontWeight: "600" },
  awardTitle: { fontSize: fontSizes.body, fontWeight: "700", color: colors.navy },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  tabBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(36,28,25,0.1)", overflow: "hidden" },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 10, gap: 4 },
  tabText: { fontSize: 11, fontWeight: "600", color: colors.muted },
  tabTextActive: { color: colors.rust, fontWeight: "700" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 10 },
  modalCard: { flex: 1, backgroundColor: "#FDFCFA", borderRadius: 22, padding: 16, borderWidth: 1, borderColor: "rgba(36,28,25,0.1)" },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(36,28,25,0.1)", marginBottom: 12 },
  modalTitle: { fontSize: fontSizes.heading, fontWeight: "700", color: colors.navy },
  closeBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#F1ECE6" },
  closeBtnText: { fontSize: fontSizes.caption, fontWeight: "700", color: colors.navy },
  sectionBox: { padding: 12, borderRadius: 14, backgroundColor: "#FAF7F2", borderWidth: 1, borderColor: "rgba(36,28,25,0.08)", gap: 8 },
  sectionTitle: { fontSize: fontSizes.body, fontWeight: "700", color: colors.navy },
  stepRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  stepBadge: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#E5DFD7" },
  stepBadgeDone: { backgroundColor: "#236D61" },
  stepBadgeCurrent: { backgroundColor: "#9A3D2B" },
  stepBadgeText: { fontSize: 11, fontWeight: "700", color: "#FFFFFF" },
  stepTitle: { fontSize: fontSizes.subbody, fontWeight: "700", color: colors.navy },
});
