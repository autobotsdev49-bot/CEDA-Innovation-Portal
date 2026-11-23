import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { pickEvidenceDocument } from "./filePicker";
import { FrostedSurface } from "./FrostedGlass";
import { buttonCornerRadius } from "./theme";
import {
  addApplicationDocument,
  sendPortalMessage,
  submitClarification,
  uploadPrivateEvidenceFile,
  withdrawApplication,
} from "./innovatorApi";
import {
  FREE_ALERT_PLAN_LABEL,
  toggleSubmissionAlerts,
  type AlertSubscriptionItem,
} from "./notificationsApi";
import {
  buildOutcomeSummaryText,
  buildReceiptSummaryText,
  canWithdrawApplication,
  formatBytes,
  normalizeRequestedChanges,
  sanitizeFileName,
  validateEvidenceFile,
  type InnovatorApplication,
  type InnovatorDocument,
  type InnovatorMessage,
  type WizardFormData,
} from "./innovatorDomain";
import {
  ActionButton,
  adminStyleColors,
  FactRow,
  FlushSheetModal,
  FormField,
  FrostedInput,
  GlassCard,
  IconRow,
  InnovatorIcon,
  PrivateDocPreviewModal,
  ProgressBar,
  SectionHeader,
  statusAppearance,
  StatusPill,
  SubscreenHero,
  useInnovatorA11y,
} from "./InnovatorUI";

const DETAIL_TABS = [
  { key: "summary", label: "Summary" },
  { key: "submitted", label: "Submitted info" },
  { key: "evidence", label: "Evidence" },
  { key: "progress", label: "Progress" },
  { key: "messages", label: "Messages" },
  { key: "changes", label: "Changes" },
] as const;

export function InnovatorApplicationDetail({
  token,
  userId,
  application,
  initialTab = "summary",
  documents,
  messages,
  onApplicationUpdated,
  onDocumentsUpdated,
  onMessagesUpdated,
  onContinueDraft,
  onOpenSupport,
  alertSubscription,
  onSubscriptionsUpdated,
}: {
  token: string;
  userId: string;
  application: InnovatorApplication;
  initialTab?: string;
  documents: InnovatorDocument[];
  messages: InnovatorMessage[];
  onApplicationUpdated: (updated: InnovatorApplication) => void;
  onDocumentsUpdated: (docs: InnovatorDocument[]) => void;
  onMessagesUpdated: (msgs: InnovatorMessage[]) => void;
  onContinueDraft: (app: InnovatorApplication) => void;
  onOpenSupport: () => void;
  alertSubscription?: AlertSubscriptionItem | null;
  onSubscriptionsUpdated?: (subs: AlertSubscriptionItem[]) => void;
}) {
  const { fs } = useInnovatorA11y();
  const [activeTab, setActiveTab] = useState<string>(initialTab || "summary");
  const [previewDoc, setPreviewDoc] = useState<InnovatorDocument | null>(null);
  const [subBusy, setSubBusy] = useState(false);
  const [subNotice, setSubNotice] = useState<string | null>(null);
  const isAlertsSubscribed = alertSubscription ? alertSubscription.isSubscribed !== false : true;

  const normalizedChanges = useMemo(
    () => normalizeRequestedChanges(application.requestedChanges),
    [application.requestedChanges]
  );
  const openClarifications = normalizedChanges.filter((c) => c.status !== "Resolved");
  const clarificationSectionKey = openClarifications[0]?.sectionKey || openClarifications[0]?.section || "problem";
  const clarificationFieldMap: Record<string, keyof WizardFormData> = {
    applicant: "summary",
    problem: "problem",
    impact: "botswanaBenefit",
    feasibility: "implementationApproach",
    supplementary: "supportRequestedSummary",
  };
  const clarificationTargetField = clarificationFieldMap[clarificationSectionKey] || "problem";

  const [clarificationNote, setClarificationNote] = useState("");
  const [clarificationFieldEdit, setClarificationFieldEdit] = useState(
    String(application.formData?.[clarificationTargetField] || "")
  );
  const [clarificationBusy, setClarificationBusy] = useState(false);
  const [clarificationFeedback, setClarificationFeedback] = useState<string | null>(null);

  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyFeedback, setReplyFeedback] = useState<string | null>(null);

  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawErr, setWithdrawErr] = useState<string | null>(null);

  const appDocs = useMemo(
    () => documents.filter((d) => d.applicationId === application.id && d.uploadStatus !== "Removed"),
    [documents, application.id]
  );

  const appMessages = useMemo(
    () => messages.filter((m) => m.applicationId === application.id),
    [messages, application.id]
  );

  const hasOriginalSnapshot =
    application.status !== "Draft" &&
    Boolean(application.originalSnapshot && Object.keys(application.originalSnapshot).length > 0);
  const snapshot = hasOriginalSnapshot ? application.originalSnapshot! : application.formData || {};
  const outcomeObj =
    application.outcomeData && Object.keys(application.outcomeData).length > 0
      ? application.outcomeData
      : application.outcome && Object.keys(application.outcome).length > 0
        ? application.outcome
        : null;
  const awardObj =
    (application as InnovatorApplication & { awardData?: Record<string, unknown> | null }).awardData &&
    Object.keys((application as InnovatorApplication & { awardData?: Record<string, unknown> | null }).awardData || {}).length > 0
      ? ((application as InnovatorApplication & { awardData?: Record<string, unknown> | null }).awardData as Record<string, unknown>)
      : null;
  const hasOutcome =
    Boolean(outcomeObj) || ["Completed", "Approved", "Awarded", "Rejected"].includes(application.status);
  const timelineItems = application.timeline || application.applicantTimeline || [];
  const tone = statusAppearance(application.status);

  async function handleShareReceipt() {
    await Share.share({
      title: `${application.reference} Submission Receipt`,
      message: buildReceiptSummaryText(application, documents),
    });
  }

  async function handleShareOutcomeLetter() {
    await Share.share({
      title: `${application.reference} Outcome Notice`,
      message: buildOutcomeSummaryText(application),
    });
  }

  async function handleSupplementalUpload() {
    setUploadNotice(null);
    const picked = await pickEvidenceDocument();
    if (!picked) return;
    const validationErr = validateEvidenceFile(picked, appDocs, "clarification", "supplemental");
    if (validationErr) {
      setUploadNotice(validationErr);
      return;
    }
    const storagePath = `${userId}/${application.id}/${Date.now()}-${sanitizeFileName(picked.name)}`;
    setUploadPct(5);
    try {
      await uploadPrivateEvidenceFile(token, storagePath, picked, (pct) => setUploadPct(pct));
      const updatedDocs = await addApplicationDocument(token, {
        appId: application.id,
        sectionKey: "clarification",
        docKind: "supplemental",
        title: picked.name,
        category: "Clarification response",
        description: "Supplemental evidence uploaded by applicant.",
        fileName: picked.name,
        mimeType: picked.type,
        fileSize: picked.size,
        storagePath,
      });
      onDocumentsUpdated(updatedDocs);
      setUploadNotice(`Uploaded "${picked.name}" privately.`);
    } catch (err) {
      setUploadNotice(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadPct(null);
    }
  }

  async function handleSubmitClarification() {
    const trimmed = clarificationNote.trim();
    if (trimmed.length < 10) {
      setClarificationFeedback("Enter a response note explaining what changed (minimum 10 characters).");
      return;
    }
    const editedValue = clarificationFieldEdit.trim();
    if (editedValue.length < 10) {
      setClarificationFeedback("Update the requested text (minimum 10 characters).");
      return;
    }
    setClarificationBusy(true);
    setClarificationFeedback(null);
    try {
      const updated = await submitClarification(token, {
        appId: application.id,
        sectionKey: clarificationSectionKey,
        updatedFields: { [clarificationTargetField]: editedValue },
        responseNote: trimmed,
        expectedVersion: application.version,
      });
      onApplicationUpdated(updated);
      setClarificationNote("");
      setClarificationFeedback("Revised version submitted for CEDA review.");
    } catch (err) {
      setClarificationFeedback(err instanceof Error ? err.message : "Could not submit clarification.");
    } finally {
      setClarificationBusy(false);
    }
  }

  async function handleSendAppMessage() {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    setReplyBusy(true);
    setReplyFeedback(null);
    try {
      const nextMessages = await sendPortalMessage(token, {
        applicationId: application.id,
        threadType: "application",
        subject: `${application.reference}: Applicant enquiry`,
        body: trimmed,
      });
      onMessagesUpdated(nextMessages);
      setReplyText("");
      setReplyFeedback("Message sent to CEDA team.");
    } catch (err) {
      setReplyFeedback(err instanceof Error ? err.message : "Message failed.");
    } finally {
      setReplyBusy(false);
    }
  }

  async function handleWithdraw() {
    if (withdrawReason.trim().length < 5) {
      setWithdrawErr("Provide a brief reason (5-500 characters).");
      return;
    }
    setWithdrawBusy(true);
    setWithdrawErr(null);
    try {
      const updated = await withdrawApplication(token, application.id, withdrawReason.trim());
      onApplicationUpdated(updated);
      setWithdrawOpen(false);
      setWithdrawReason("");
    } catch (err) {
      setWithdrawErr(err instanceof Error ? err.message : "Could not withdraw.");
    } finally {
      setWithdrawBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <SubscreenHero
          icon="applications"
          color={tone.color}
          tint={tone.tint}
          eyebrow={`${application.reference} · ${application.sector}`}
          title={application.title || "Untitled innovation"}
          badge={application.status}
          summary={`${application.applicantType} · Submitted ${application.submittedDate || "Draft"} · Receipt ${application.receiptCode || "Pending"}`}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {DETAIL_TABS.map((t) => {
            const active = activeTab === t.key;
            const alertDot = t.key === "changes" && openClarifications.length > 0;
            return (
              <Pressable
                key={t.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setActiveTab(t.key)}
                style={[styles.tabPill, active ? styles.tabPillActive : null]}
              >
                {alertDot ? <View style={styles.tabAlertDot} /> : null}
                <Text
                  style={{
                    fontSize: fs("subbody"),
                    fontWeight: active ? "700" : "500",
                    color: active ? adminStyleColors.white : "#66717E",
                  }}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {activeTab === "summary" ? (
          <View style={{ gap: 14 }}>
            <GlassCard>
              <SectionHeader eyebrow="APPLICANT OVERVIEW" title="Application record" right={<StatusPill status={application.status} />} />
              <View>
                <FactRow label="Applicant" value={`${application.applicant} (${application.applicantType})`} />
                <FactRow label="Sector" value={application.sector} />
                <FactRow label="Created date" value={application.createdAt} />
                <FactRow label="Submitted date" value={application.submittedDate || "Draft (not submitted)"} />
                <FactRow label="Receipt code" value={application.receiptCode || "Issued on final submit"} />
                <FactRow
                  label="Free alert subscription"
                  value={isAlertsSubscribed ? `Subscribed: ${alertSubscription?.feeLabel || FREE_ALERT_PLAN_LABEL}` : "Alerts paused (unsubscribe active)"}
                />
                <FactRow label="Record version" value={`v${application.version}`} last />
              </View>
              {!!subNotice && (
                <Text style={{ fontSize: fs("caption"), color: adminStyleColors.teal, fontWeight: "600", marginTop: 4 }}>
                  {subNotice}
                </Text>
              )}
              {application.withdrawnReason ? (
                <View style={styles.amberBanner}>
                  <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.navy }}>
                    Withdrawal reason
                  </Text>
                  <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, marginTop: 4 }}>
                    {application.withdrawnReason}
                  </Text>
                </View>
              ) : null}

              <View style={styles.actionRow}>
                {application.status === "Draft" ? (
                  <ActionButton label="Continue editing draft" compact onPress={() => onContinueDraft(application)} />
                ) : null}
                <ActionButton
                  label={subBusy ? "Updating alerts..." : isAlertsSubscribed ? "Alerts: Free (Unsubscribe)" : "Subscribe free alerts (P0.00)"}
                  compact
                  variant="secondary"
                  loading={subBusy}
                  onPress={async () => {
                    setSubBusy(true);
                    setSubNotice(null);
                    try {
                      const nextSubs = await toggleSubmissionAlerts(token, {
                        applicationId: application.id,
                        isSubscribed: !isAlertsSubscribed,
                      });
                      onSubscriptionsUpdated?.(nextSubs);
                      setSubNotice(
                        !isAlertsSubscribed
                          ? `Subscribed to free alerts (${FREE_ALERT_PLAN_LABEL}).`
                          : "Paused email and push alerts for this submission. Portal timeline stays active."
                      );
                    } catch (err) {
                      setSubNotice(err instanceof Error ? err.message : "Could not update alert subscription.");
                    } finally {
                      setSubBusy(false);
                    }
                  }}
                />
                {application.receiptCode ? (
                  <ActionButton label="Download / share submission receipt" compact variant="secondary" onPress={() => void handleShareReceipt()} />
                ) : null}
                {canWithdrawApplication(application) ? (
                  <ActionButton
                    label="Withdraw application"
                    compact
                    variant="secondary"
                    onPress={() => {
                      setWithdrawErr(null);
                      setWithdrawOpen(true);
                    }}
                  />
                ) : null}
              </View>
            </GlassCard>

            {hasOutcome ? (
              <GlassCard>
                <SectionHeader
                  eyebrow="OFFICIAL OUTCOME"
                  title={outcomeObj?.status || outcomeObj?.decision || application.status}
                  subtitle={`Released ${outcomeObj?.outcomeDate || outcomeObj?.releasedAt || application.updatedAt}`}
                  right={<StatusPill status={outcomeObj?.status || application.status} />}
                />
                <View style={styles.outcomeBox}>
                  {application.status === "Awarded" && awardObj ? (
                    <View style={{ marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "rgba(180,122,24,0.28)" }}>
                      <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: "#7C5317" }}>
                        OFFICIAL INNOVATION AWARD CONFERRED
                      </Text>
                      <Text style={{ fontSize: fs("body"), fontWeight: "700", color: adminStyleColors.navy, marginTop: 3 }}>
                        {String(awardObj.awardTitle || `CEDA Innovation Award: ${application.title}`)}
                      </Text>
                      <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, marginTop: 2 }}>
                        {String(awardObj.awardCategory || "Innovation Recognition & Support")}
                        {awardObj.awardAmount ? ` · ${String(awardObj.awardAmount)}` : ""}
                        {awardObj.conferredAt ? ` · ${String(awardObj.conferredAt)}` : ""}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.teal }}>
                    {application.status === "Awarded" ? "Award citation & feedback" : "Approved applicant feedback"}
                  </Text>
                  <Text style={{ fontSize: fs("body"), color: adminStyleColors.navy, lineHeight: 22, marginTop: 4 }}>
                    {(application.status === "Awarded" && typeof awardObj?.awardSummary === "string" ? awardObj.awardSummary : null) ||
                      outcomeObj?.applicantFeedback ||
                      outcomeObj?.feedback ||
                      outcomeObj?.summary ||
                      "Approved CEDA outcome guidance is recorded on your workspace."}
                  </Text>
                </View>
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.navy }}>
                    Recommended next steps
                  </Text>
                  {Array.isArray(outcomeObj?.recommendedNextSteps) ? (
                    outcomeObj.recommendedNextSteps.map((stepTxt, i) => (
                      <Text key={i} style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, lineHeight: 20 }}>
                        {i + 1}. {stepTxt}
                      </Text>
                    ))
                  ) : (
                    <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, lineHeight: 20 }}>
                      {outcomeObj?.nextSteps ||
                        outcomeObj?.recommendedNextSteps ||
                        "Connect with CEDA Support if clarification or onboarding support is needed."}
                    </Text>
                  )}
                </View>
                <View style={styles.actionRow}>
                  <ActionButton label="Download outcome letter" compact onPress={() => void handleShareOutcomeLetter()} />
                  <ActionButton
                    label={outcomeObj?.appealAllowed || outcomeObj?.appealPermitted ? "Request appeal or clarification" : "Contact support"}
                    compact
                    variant="secondary"
                    onPress={onOpenSupport}
                  />
                </View>
              </GlassCard>
            ) : null}
          </View>
        ) : null}

        {activeTab === "submitted" ? (
          <GlassCard>
            <SectionHeader
              eyebrow="IMMUTABLE RECORD"
              title="Submitted application snapshot"
              subtitle="Original submitted text remains preserved unless CEDA requests clarification."
              right={
                application.status === "Changes requested" ? (
                  <Pressable onPress={() => setActiveTab("changes")} style={styles.headerLinkPill}>
                    <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.rustDark }}>
                      Edit and resubmit
                    </Text>
                  </Pressable>
                ) : undefined
              }
            />
            <View>
              <FactRow label="Full name" value={String(snapshot.fullName || application.applicant)} />
              <FactRow label="Phone & district" value={`${snapshot.phone || "N/A"} • ${snapshot.district || "N/A"}`} />
              <FactRow label="Innovation stage" value={String(snapshot.stage || "N/A")} />
              <FactRow label="Title" value={String(snapshot.title || application.title)} />
              <FactRow label="Summary" value={String(snapshot.summary || application.summary)} />
              <FactRow label="Problem" value={String(snapshot.problem || "N/A")} />
              <FactRow label="Proposed solution" value={String(snapshot.solution || "N/A")} />
              <FactRow label="Botswana benefit" value={String(snapshot.botswanaBenefit || "N/A")} />
              <FactRow label="Implementation plan" value={String(snapshot.implementationApproach || "N/A")} />
              <FactRow label="Team capacity" value={String(snapshot.teamExperience || "N/A")} />
              <FactRow label="Support requested" value={String(snapshot.supportRequestedSummary || "N/A")} last />
            </View>
          </GlassCard>
        ) : null}

        {activeTab === "evidence" ? (
          <GlassCard>
            <SectionHeader
              eyebrow="PRIVATE EVIDENCE"
              title={`Supporting files & links (${appDocs.length})`}
              subtitle="Encrypted storage opens cleanly via 120-second authorized links."
            />
            {application.status === "Changes requested" ? (
              <View style={{ gap: 8 }}>
                <View style={styles.actionRow}>
                  <ActionButton label="Upload supplemental evidence" compact onPress={() => void handleSupplementalUpload()} />
                </View>
                {uploadPct !== null ? <ProgressBar percent={uploadPct} /> : null}
                {uploadNotice ? (
                  <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.teal, fontWeight: "600" }}>
                    {uploadNotice}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {appDocs.length ? (
              appDocs.map((doc, idx) => (
                <IconRow
                  key={doc.id}
                  title={doc.title || doc.fileName}
                  detail={`${doc.sectionKey} · ${doc.docKind === "video_link" ? "HTTPS Link" : formatBytes(doc.fileSize)} · v${doc.version || 1}`}
                  icon="documents"
                  color={doc.docKind === "video_link" ? adminStyleColors.blue : adminStyleColors.teal}
                  tint={doc.docKind === "video_link" ? "#EAF1FC" : "#E4F4F0"}
                  badge={doc.docKind === "video_link" ? "Video" : "File"}
                  last={idx === appDocs.length - 1}
                  onPress={() => setPreviewDoc(doc)}
                />
              ))
            ) : (
              <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle }}>
                No supporting evidence attached yet.
              </Text>
            )}
          </GlassCard>
        ) : null}

        {activeTab === "progress" ? (
          <GlassCard>
            <SectionHeader
              eyebrow="APPLICANT TIMELINE"
              title="Progress milestones"
              subtitle="Submission → Review → Feedback → Approval → Award"
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {[
                { label: "Submission", rank: 1 },
                { label: "Review", rank: 2 },
                { label: "Feedback", rank: 3 },
                { label: application.status === "Rejected" ? "Outcome" : "Approval", rank: 4 },
                { label: "Award", rank: 5 },
              ].map((st) => {
                const curRank =
                  application.status === "Awarded" ? 5
                    : application.status === "Approved" || application.status === "Rejected" ? 4
                      : application.status === "Changes requested" ? 3
                        : application.status === "In review" ? 2
                          : application.status === "Submitted" ? 1
                            : 0;
                const active = curRank > st.rank || (st.rank === 5 && application.status === "Awarded");
                const current = curRank === st.rank && !active;
                return (
                  <View
                    key={st.label}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: active ? "#E5F3E9" : current ? "#FFF1D6" : "#F1F3F6",
                    }}
                  >
                    <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: active ? "#236D61" : current ? "#7C5317" : adminStyleColors.muted }}>
                      {st.rank}. {st.label}
                    </Text>
                  </View>
                );
              })}
            </View>
            <View style={{ marginTop: 4 }}>
              {timelineItems.length ? (
                timelineItems.map((evt, idx) => {
                  const isLast = idx === timelineItems.length - 1;
                  return (
                    <View key={`${evt.label}-${idx}`} style={styles.timelineRow}>
                      <View style={styles.timelineTrackCol}>
                        <View style={styles.timelineNode}>
                          <InnovatorIcon name="check" color={adminStyleColors.white} />
                        </View>
                        {!isLast ? <View style={styles.timelineLine} /> : null}
                      </View>
                      <View style={{ flex: 1, paddingBottom: isLast ? 0 : 16 }}>
                        <Text style={{ fontSize: fs("body"), fontWeight: "700", color: adminStyleColors.navy }}>
                          {evt.label}
                        </Text>
                        {evt.detail ? (
                          <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, marginTop: 2, lineHeight: 19 }}>
                            {evt.detail}
                          </Text>
                        ) : null}
                        {evt.at ? (
                          <Text style={{ fontSize: fs("caption"), color: adminStyleColors.blueSoft, marginTop: 3, fontWeight: "600" }}>
                            {evt.at}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle }}>
                  Milestones appear automatically as your submission advances.
                </Text>
              )}
            </View>
          </GlassCard>
        ) : null}

        {activeTab === "messages" ? (
          <GlassCard>
            <SectionHeader
              eyebrow="APPLICATION THREAD"
              title="CEDA Communication"
              subtitle="Direct thread linked cleanly to this application."
              right={<ActionButton label="Support" variant="secondary" compact onPress={onOpenSupport} />}
            />
            <View style={{ gap: 10 }}>
              {appMessages.length ? (
                appMessages.map((m) => {
                  const mine = m.senderRole === "innovator";
                  return (
                    <View key={m.id} style={[styles.chatRow, mine && styles.chatRowMine]}>
                      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleStaff]}>
                        <Text
                          style={{
                            fontSize: fs("caption"),
                            fontWeight: "700",
                            color: mine ? "rgba(255,255,255,0.82)" : adminStyleColors.teal,
                          }}
                        >
                          {m.senderName} · {m.createdAt}
                        </Text>
                        <Text
                          style={{
                            fontSize: fs("body"),
                            color: mine ? adminStyleColors.white : adminStyleColors.navy,
                            marginTop: 4,
                            lineHeight: 21,
                          }}
                        >
                          {m.body}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle }}>
                  No thread messages yet for {application.reference}.
                </Text>
              )}

              {replyFeedback ? (
                <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.teal, fontWeight: "600" }}>
                  {replyFeedback}
                </Text>
              ) : null}
              <View style={styles.messageComposer}>
                <FrostedSurface variant="bar" borderRadius={28} />
                <FrostedInput
                  accessibilityLabel="Reply to CEDA team"
                  multiline
                  maxLength={4000}
                  value={replyText}
                  onChangeText={setReplyText}
                  placeholder="Write an enquiry about this application..."
                  style={styles.messageInput}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                  disabled={replyBusy || !replyText.trim()}
                  onPress={() => void handleSendAppMessage()}
                  style={({ pressed }) => [
                    styles.sendCircle,
                    (!replyText.trim() || replyBusy) && styles.sendCircleDisabled,
                    pressed && !replyBusy && replyText.trim() ? { opacity: 0.78 } : null,
                  ]}
                >
                  {replyBusy ? (
                    <ActivityIndicator size="small" color={adminStyleColors.white} />
                  ) : (
                    <Text style={styles.sendArrow} accessible={false}>
                      {"↑"}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </GlassCard>
        ) : null}

        {activeTab === "changes" ? (
          <GlassCard>
            <SectionHeader
              eyebrow="CLARIFICATION WORKFLOW"
              title="Requested changes"
              subtitle="Original submitted snapshots remain preserved cleanly alongside revisions."
            />
            <View style={{ gap: 12 }}>
              {normalizedChanges.length ? (
                normalizedChanges.map((item, idx) => (
                  <View key={`${item.id || idx}`} style={styles.amberBanner}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <Text style={{ fontSize: fs("body"), fontWeight: "700", color: adminStyleColors.navy, flex: 1 }}>
                        {item.sectionLabel || item.section || item.label || "Requested update"}
                      </Text>
                      <StatusPill status={item.status || "Open"} />
                    </View>
                    <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.navy, marginTop: 6, lineHeight: 19 }}>
                      {item.feedback || item.message || item.reason || "Provide additional detail as requested."}
                    </Text>
                    {item.deadline ? (
                      <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.rust, marginTop: 4 }}>
                        Deadline: {item.deadline}
                      </Text>
                    ) : null}
                  </View>
                ))
              ) : (
                <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle }}>
                  No clarifications requested on this application.
                </Text>
              )}

              {application.status === "Changes requested" ? (
                <View style={{ gap: 12 }}>
                  <FormField label={`Revised ${String(clarificationTargetField).replace(/([A-Z])/g, " $1").toLowerCase()} text`}>
                    <FrostedInput
                      multiline
                      value={clarificationFieldEdit}
                      onChangeText={setClarificationFieldEdit}
                      placeholder="Update requested section text clearly..."
                    />
                  </FormField>
                  <FormField label="Response note explaining what changed (min 10 chars)">
                    <FrostedInput
                      multiline
                      value={clarificationNote}
                      onChangeText={setClarificationNote}
                      placeholder="Summarize what you clarified for reviewers..."
                    />
                  </FormField>
                  <View style={styles.actionRow}>
                    <ActionButton
                      label="Attach supplemental file"
                      compact
                      variant="secondary"
                      onPress={() => void handleSupplementalUpload()}
                    />
                    <ActionButton
                      label="Submit revised version"
                      compact
                      loading={clarificationBusy}
                      onPress={() => void handleSubmitClarification()}
                    />
                  </View>
                  {uploadPct !== null ? <ProgressBar percent={uploadPct} /> : null}
                  {clarificationFeedback ? (
                    <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.teal, fontWeight: "600" }}>
                      {clarificationFeedback}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </GlassCard>
        ) : null}
      </ScrollView>

      <PrivateDocPreviewModal
        doc={previewDoc}
        token={token}
        onClose={() => setPreviewDoc(null)}
      />

      <FlushSheetModal
        visible={withdrawOpen}
        eyebrow="WITHDRAW APPLICATION"
        title={`Withdraw ${application.reference}?`}
        onClose={() => setWithdrawOpen(false)}
      >
        <View style={{ gap: 12 }}>
          <FormField label="Reason for withdrawing (5-500 characters)">
            <FrostedInput
              multiline
              maxLength={500}
              value={withdrawReason}
              onChangeText={setWithdrawReason}
              placeholder="Explain why you are withdrawing..."
            />
          </FormField>
          {withdrawErr ? (
            <Text style={{ fontSize: fs("subbody"), color: "#9A3026", fontWeight: "600" }}>
              {withdrawErr}
            </Text>
          ) : null}
          <View style={styles.actionRow}>
            <ActionButton
              label="Confirm withdrawal"
              compact
              variant="danger"
              loading={withdrawBusy}
              onPress={() => void handleWithdraw()}
            />
          </View>
        </View>
      </FlushSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 18,
    gap: 14,
    paddingBottom: 44,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  headerLinkPill: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: buttonCornerRadius,
    backgroundColor: "rgba(154,61,43,0.10)",
    justifyContent: "center",
  },
  tabRow: { gap: 8, paddingVertical: 4 },
  tabPill: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: buttonCornerRadius,
    backgroundColor: "rgba(255,250,244,0.92)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    shadowColor: "#261B16",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 1,
  },
  tabPillActive: {
    backgroundColor: adminStyleColors.navy,
    shadowOpacity: 0.1,
  },
  tabAlertDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: adminStyleColors.rust,
  },
  amberBanner: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#FCF4E4",
  },
  outcomeBox: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#E4F4F0",
  },
  timelineRow: { flexDirection: "row", gap: 12 },
  timelineTrackCol: { alignItems: "center", width: 26 },
  timelineNode: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: adminStyleColors.tealBright,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: adminStyleColors.line,
    marginVertical: 3,
  },
  chatRow: { alignItems: "flex-start" },
  chatRowMine: { alignItems: "flex-end" },
  bubble: {
    maxWidth: "88%",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 18,
  },
  bubbleMine: {
    borderTopRightRadius: 5,
    backgroundColor: adminStyleColors.rust,
    shadowColor: "#4A1E15",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  bubbleStaff: {
    borderTopLeftRadius: 5,
    backgroundColor: "rgba(255,250,244,0.96)",
    shadowColor: "#261B16",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 2,
  },
  messageComposer: {
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 4,
    paddingLeft: 14,
    paddingRight: 7,
    paddingVertical: 7,
    borderRadius: 28,
    backgroundColor: "rgba(255,250,244,0.94)",
    shadowColor: "#261B16",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 4,
  },
  messageInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 120,
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  sendCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: adminStyleColors.rust,
    alignItems: "center",
    justifyContent: "center",
  },
  sendCircleDisabled: { opacity: 0.42 },
  sendArrow: { color: adminStyleColors.white, fontSize: 18, fontWeight: "700", lineHeight: 20 },
});
