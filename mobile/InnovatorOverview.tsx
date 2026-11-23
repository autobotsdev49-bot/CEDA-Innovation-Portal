import React from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { InnovatorWorkspaceData } from "./innovatorApi";
import {
  applicationRequiredAction,
  collectRecentActivity,
  collectRequiredActions,
  evaluateApplicationReadiness,
  normalizeRequestedChanges,
  type InnovatorApplication,
} from "./innovatorDomain";
import {
  ActionButton,
  adminStyleColors,
  GlassCard,
  IconRow,
  MetricTile,
  ProgressBar,
  SectionHeader,
  StatusPill,
  useInnovatorA11y,
} from "./InnovatorUI";

export function InnovatorOverview({
  data,
  refreshing,
  onRefresh,
  searchSlot,
  onOpenApplications,
  onResumeDraft,
  onStartNewApplication,
  onOpenApplicationDetail,
  onOpenMessages,
  onOpenSettings,
}: {
  data: InnovatorWorkspaceData;
  refreshing: boolean;
  onRefresh: () => void;
  searchSlot?: React.ReactNode;
  onOpenApplications: (statusFilter?: string) => void;
  onResumeDraft: (app: InnovatorApplication) => void;
  onStartNewApplication: () => void;
  onOpenApplicationDetail: (appId: string, initialTab?: string) => void;
  onOpenMessages: () => void;
  onOpenSettings: () => void;
}) {
  const { fs } = useInnovatorA11y();
  const apps = data.applications || [];
  const drafts = apps.filter((a) => a.status === "Draft");
  const submitted = apps.filter((a) => a.status === "Submitted");
  const inReview = apps.filter((a) => a.status === "In review");
  const actionNeeded = apps.filter((a) => a.status === "Draft" || a.status === "Changes requested");
  const clarificationApps = apps.filter((a) => a.status === "Changes requested");

  const primaryDraft = drafts[0] || null;
  const focusApp = actionNeeded[0] || apps[0] || null;
  const readiness = focusApp ? evaluateApplicationReadiness(focusApp, data.documents) : null;
  const momentumPercent =
    focusApp?.status === "Draft" && readiness
      ? Math.max(10, readiness.percentComplete)
      : focusApp?.status === "Submitted"
        ? 50
        : focusApp?.status === "Changes requested"
          ? 65
          : focusApp?.status === "In review"
            ? 78
            : focusApp?.status === "Approved"
              ? 88
              : apps.length
                ? 100
                : 25;

  const profile = data.profile || ({} as InnovatorWorkspaceData["profile"]);
  const profileIncomplete =
    !String(profile.fullName || "").trim() ||
    !String(profile.phone || "").trim() ||
    !String(profile.district || "").trim() ||
    !String(profile.expertise || "").trim();

  const requiredActions = [
    ...(profileIncomplete
      ? [
          {
            priority: 0,
            applicationId: "",
            reference: "Profile",
            title: "Complete your profile",
            actionLabel: "Complete your profile",
            detail: "Add your contact and innovation details before submitting an application.",
            buttonText: "Update",
            targetMode: "settings" as const,
          },
        ]
      : []),
    ...collectRequiredActions(apps, data.documents),
  ].slice(0, 4);

  const recentActivity = collectRecentActivity(apps, 4);
  const recentMessages = [...(data.messages || [])].slice(-3).reverse();
  const deadlines: { ref: string; title: string; due: string; appId: string }[] = [];
  for (const app of apps) {
    for (const rc of normalizeRequestedChanges(app.requestedChanges)) {
      if (rc.status !== "Resolved" && rc.deadline) {
        deadlines.push({
          ref: app.reference,
          title: rc.sectionLabel || rc.section || rc.label || "Requested update",
          due: rc.deadline,
          appId: app.id,
        });
      }
    }
    for (const dl of app.deadlines || []) {
      if (typeof dl === "string") {
        deadlines.push({ ref: app.reference, title: "Key milestone", due: dl, appId: app.id });
      } else if (dl && (dl.deadline || dl.date)) {
        deadlines.push({
          ref: app.reference,
          title: dl.label || dl.title || "Milestone deadline",
          due: dl.deadline || dl.date || "",
          appId: app.id,
        });
      }
    }
  }

  const todayLabel = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Gaborone",
  }).format(new Date());

  const milestoneIndex = !focusApp
    ? 0
    : focusApp.status === "Draft"
      ? 0
      : focusApp.status === "Submitted"
        ? 1
        : ["In review", "Changes requested"].includes(focusApp.status)
          ? 2
          : 3;

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminStyleColors.rust} />
      }
    >
      {searchSlot}

      <View style={styles.overviewHeading}>
        <Text accessibilityRole="header" style={[styles.pageTitle, { fontSize: fs("title") }]}>
          Welcome, {data.profile?.fullName?.split(" ")[0] || "Innovator"}
        </Text>
        <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle }}>{todayLabel}</Text>
      </View>

      <View style={styles.metrics}>
        <MetricTile
          label="Drafts"
          value={String(drafts.length)}
          caption="Editable privately"
          icon="clock"
          color="#B1873E"
          onPress={() => onOpenApplications("Draft")}
        />
        <MetricTile
          label="Submitted"
          value={String(submitted.length)}
          caption="Locked receipt"
          icon="applications"
          color={adminStyleColors.blueSoft}
          onPress={() => onOpenApplications("Submitted")}
        />
        <MetricTile
          label="Under review"
          value={String(inReview.length)}
          caption="CEDA screening"
          icon="pulse"
          color={adminStyleColors.purple}
          onPress={() => onOpenApplications("In review")}
        />
        <MetricTile
          label="Action required"
          value={String(actionNeeded.length)}
          caption="Drafts & clarifications"
          icon="alert"
          color={adminStyleColors.rust}
          onPress={() =>
            onOpenApplications(clarificationApps.length ? "Changes requested" : "Draft")
          }
        />
      </View>

      <GlassCard>
        <SectionHeader
          eyebrow={focusApp ? `${focusApp.reference} • ${focusApp.sector}` : "START INNOVATING"}
          title={focusApp ? focusApp.title || "Untitled draft" : "No applications started yet"}
          right={focusApp ? <StatusPill status={focusApp.status} /> : undefined}
        />

        {focusApp ? (
          <View style={{ gap: 12 }}>
            <View style={styles.milestoneStrip}>
              {["Draft", "Submitted", "In review", "Outcome"].map((stageLabel, idx) => {
                const reached = idx <= milestoneIndex;
                return (
                  <View key={stageLabel} style={styles.milestoneStep}>
                    <View
                      style={[
                        styles.milestoneNode,
                        reached ? styles.milestoneNodeActive : null,
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: fs("caption"),
                          fontWeight: "700",
                          color: reached ? adminStyleColors.white : adminStyleColors.subtle,
                        }}
                      >
                        {idx + 1}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: fs("caption"),
                        fontWeight: reached ? "700" : "500",
                        color: reached ? adminStyleColors.navy : adminStyleColors.subtle,
                        marginTop: 4,
                      }}
                    >
                      {stageLabel}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.momentumBox}>
              <View style={styles.momentumHead}>
                <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.navy, flex: 1 }}>
                  {focusApp.status === "Draft" && readiness
                    ? `Step ${focusApp.currentStep || 1} of 12 (${readiness.percentComplete}% ready)`
                    : applicationRequiredAction(focusApp)}
                </Text>
                <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.rust }}>
                  {momentumPercent}%
                </Text>
              </View>
              <ProgressBar
                percent={momentumPercent}
                color={focusApp.status === "Changes requested" ? adminStyleColors.rust : adminStyleColors.tealBright}
              />
              <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle, marginTop: 6 }}>
                Updated {focusApp.updatedAt} • {focusApp.applicantType}
              </Text>
            </View>

            <View style={styles.actionRow}>
              <ActionButton
                label={
                  focusApp.status === "Draft"
                    ? `Continue draft (${focusApp.reference})`
                    : focusApp.status === "Changes requested"
                      ? "Respond to clarification"
                      : "View workspace"
                }
                compact
                onPress={() =>
                  focusApp.status === "Draft"
                    ? onResumeDraft(focusApp)
                    : onOpenApplicationDetail(
                        focusApp.id,
                        focusApp.status === "Changes requested" ? "changes" : "summary"
                      )
                }
              />
              <ActionButton
                label="Submit new"
                variant="secondary"
                compact
                onPress={onStartNewApplication}
              />
            </View>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, lineHeight: 20 }}>
              Start a private draft by choosing Individual or Registered company and a sector.
            </Text>
            <View style={styles.actionRow}>
              <ActionButton label="Start application" compact onPress={onStartNewApplication} />
            </View>
          </View>
        )}
      </GlassCard>

      <GlassCard>
        <SectionHeader eyebrow="NEXT STEPS" title="Required actions" />
        {requiredActions.length ? (
          requiredActions.map((act, idx) => (
            <IconRow
              key={`${act.reference}-${act.actionLabel}-${idx}`}
              title={`${act.actionLabel} (${act.reference})`}
              detail={act.detail}
              icon={act.priority === 1 ? "alert" : act.targetMode === "settings" ? "settings" : "clock"}
              color={act.priority === 1 ? adminStyleColors.rust : adminStyleColors.amber}
              tint={act.priority === 1 ? "#FBEDE8" : "#FCF4E4"}
              badge={act.buttonText}
              last={idx === requiredActions.length - 1}
              onPress={() => {
                if (act.targetMode === "settings") onOpenSettings();
                else if (act.targetMode === "wizard") {
                  const targetDraft = apps.find((a) => a.id === act.applicationId);
                  if (targetDraft) onResumeDraft(targetDraft);
                } else {
                  onOpenApplicationDetail(act.applicationId, act.targetMode);
                }
              }}
            />
          ))
        ) : (
          <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, lineHeight: 19 }}>
            No actions are required right now.
          </Text>
        )}
      </GlassCard>

      <GlassCard>
        <SectionHeader eyebrow="TIMELINE" title="Recent application activity" />
        {recentActivity.length ? (
          recentActivity.map((ev, idx) => (
            <IconRow
              key={`${ev.applicationId}-${ev.label}-${idx}`}
              title={`${ev.label} • ${ev.reference}`}
              detail={`${ev.detail}${ev.at ? ` (${ev.at})` : ""}`}
              icon="pulse"
              color={adminStyleColors.teal}
              tint="#E4F4F0"
              badge="View"
              last={idx === recentActivity.length - 1}
              onPress={() => onOpenApplicationDetail(ev.applicationId, "progress")}
            />
          ))
        ) : (
          <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, lineHeight: 19 }}>
            Application milestones will appear here once you create or submit a draft.
          </Text>
        )}
      </GlassCard>

      <GlassCard>
        <SectionHeader
          eyebrow="COMMUNICATION"
          title="Messages and deadlines"
          right={
            <Pressable onPress={onOpenMessages} style={styles.linkTouch}>
              <Text style={{ fontSize: fs("subbody"), fontWeight: "600", color: adminStyleColors.blueSoft }}>
                View all
              </Text>
            </Pressable>
          }
        />
        {deadlines.slice(0, 2).map((d, idx) => (
          <IconRow
            key={`${d.ref}-${idx}`}
            title={`Clarification deadline: ${d.due}`}
            detail={`${d.ref}: ${d.title}`}
            icon="clock"
            color={adminStyleColors.rust}
            tint="#FBEDE8"
            badge="Respond"
            last={recentMessages.length === 0 && idx === Math.min(deadlines.length, 2) - 1}
            onPress={() => onOpenApplicationDetail(d.appId, "changes")}
          />
        ))}
        {recentMessages.length ? (
          recentMessages.map((msg, idx) => {
            const initials = (msg.senderName || "CD")
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0])
              .join("")
              .toUpperCase();
            return (
              <Pressable
                key={msg.id}
                onPress={onOpenMessages}
                style={[styles.msgRow, idx === recentMessages.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={styles.initialsCircle}>
                  <Text style={{ color: adminStyleColors.blue, fontSize: fs("caption"), fontWeight: "700" }}>
                    {initials}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ fontSize: fs("body"), fontWeight: "600", color: adminStyleColors.navy }} numberOfLines={1}>
                      {msg.senderName} {msg.applicationRef ? `· ${msg.applicationRef}` : ""}
                    </Text>
                    {!msg.isRead ? <View style={styles.unreadDot} /> : null}
                  </View>
                  <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle }} numberOfLines={2}>
                    {msg.subject}: {msg.body}
                  </Text>
                  <Text style={{ fontSize: fs("caption"), color: "#9AA1AA" }}>{msg.createdAt}</Text>
                </View>
              </Pressable>
            );
          })
        ) : !deadlines.length ? (
          <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, lineHeight: 19 }}>
            No recent messages or pending deadlines.
          </Text>
        ) : null}
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 18,
    gap: 16,
    paddingBottom: 144,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  overviewHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  pageTitle: {
    color: adminStyleColors.navy,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  milestoneStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  milestoneStep: {
    flex: 1,
    alignItems: "center",
  },
  milestoneNode: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EEF2F6",
    alignItems: "center",
    justifyContent: "center",
  },
  milestoneNodeActive: {
    backgroundColor: adminStyleColors.tealBright,
  },
  momentumBox: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "rgba(247, 242, 235, 0.80)",
  },
  momentumHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  linkTouch: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(65,122,197,0.10)",
    justifyContent: "center",
  },
  msgRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(36,28,25,0.08)",
  },
  initialsCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EBF1F9",
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: adminStyleColors.blue,
  },
});
