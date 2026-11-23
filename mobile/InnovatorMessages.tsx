import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { pickEvidenceDocument, type PickedDocumentAsset } from "./filePicker";
import { FrostedSurface } from "./FrostedGlass";
import { buttonCornerRadius } from "./theme";
import {
  deletePrivateEvidenceObject,
  isClosedSupportRequest,
  isOptimusSupportRequest,
  markThreadRead,
  sendPortalMessage,
  uploadPrivateEvidenceFile,
  type OptimusInteraction,
  type SupportRequestItem,
} from "./innovatorApi";
import {
  formatBytes,
  groupMessageThreads,
  sanitizeFileName,
  validateEvidenceFile,
  type InnovatorMessage,
  type InnovatorThread,
} from "./innovatorDomain";
import {
  ActionButton,
  adminStyleColors,
  FormField,
  FrostedInput,
  GlassCard,
  InnovatorIcon,
  ProgressBar,
  SectionHeader,
  SubscreenHero,
  useInnovatorA11y,
} from "./InnovatorUI";

export function InnovatorMessages({
  token,
  userId,
  messages,
  supportRequests = [],
  optimusHistory = [],
  refreshing,
  onRefresh,
  onMessagesUpdated,
  onEscalateHumanSupport,
}: {
  token: string;
  userId: string;
  messages: InnovatorMessage[];
  supportRequests?: SupportRequestItem[];
  optimusHistory?: OptimusInteraction[];
  refreshing: boolean;
  onRefresh: () => void;
  onMessagesUpdated: (msgs: InnovatorMessage[]) => void;
  onEscalateHumanSupport: () => void;
}) {
  const { fs } = useInnovatorA11y();
  const baseThreads = useMemo(() => groupMessageThreads(messages), [messages]);
  const closedOptimusThreads = useMemo(
    () =>
      supportRequests
        .filter((req) => isOptimusSupportRequest(req) && isClosedSupportRequest(req))
        .map((req) => ({
          key: `optimus-support:${req.id}`,
          applicationId: null,
          applicationRef: req.id,
          threadType: "optimus-support",
          title: `Optimus Prime · ${req.id}`,
          unread: false,
          unreadCount: 0,
          supportRequest: req,
          messages: (req.thread || []).map((m, idx) => ({
            id: `${req.id}-${idx}`,
            applicationId: null,
            applicationRef: req.id,
            threadType: "support",
            subject: `Optimus Prime · ${req.id}`,
            senderName:
              m.role === "innovator"
                ? m.sender || "You"
                : String(m.sender || "").trim().split(/\s+/)[0] || "CEDA Support",
            senderRole: m.role || "support",
            body: m.body,
            attachmentName: null as string | null,
            attachmentPath: null as string | null,
            isRead: true,
            createdAt: m.at || req.reportedAt || "",
          })),
        })),
    [supportRequests]
  );
  const threads = useMemo(
    () => [...baseThreads, ...closedOptimusThreads],
    [baseThreads, closedOptimusThreads]
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [composingNew, setComposingNew] = useState(false);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachment, setAttachment] = useState<PickedDocumentAsset | null>(null);
  const [sending, setSending] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeThread: (InnovatorThread & { supportRequest?: SupportRequestItem }) | null = useMemo(
    () => (selectedKey ? threads.find((t) => t.key === selectedKey) || null : null),
    [threads, selectedKey]
  );
  const activeClosedSupport: SupportRequestItem | null = activeThread?.supportRequest ?? null;

  async function openThread(t: InnovatorThread & { supportRequest?: SupportRequestItem }) {
    setComposingNew(false);
    setSelectedKey(t.key);
    setSubject(t.messages[0]?.subject || t.title);
    setErrorMsg(null);
    if (t.unread && !t.supportRequest) {
      try {
        await markThreadRead(token, t.applicationId, t.threadType);
        const updated = messages.map((m) =>
          (m.applicationId || m.threadType || "general") === t.key ? { ...m, isRead: true } : m
        );
        onMessagesUpdated(updated);
      } catch {
        // Non-blocking read sync
      }
    }
  }

  function startNewThread() {
    setSelectedKey(null);
    setComposingNew(true);
    setSubject("");
    setBody("");
    setAttachment(null);
    setErrorMsg(null);
  }

  async function handlePickAttachment() {
    setErrorMsg(null);
    const picked = await pickEvidenceDocument();
    if (!picked) return;
    const validationErr = validateEvidenceFile(picked, [], "supplementary", "supplemental");
    if (validationErr) {
      setErrorMsg(validationErr);
      return;
    }
    setAttachment(picked);
  }

  async function handleSend() {
    const cleanSubject = (subject.trim() || activeThread?.title || "CEDA portal enquiry").slice(0, 200);
    const cleanBody = body.trim();
    if (!cleanBody) {
      setErrorMsg("Enter a message before sending.");
      return;
    }
    setSending(true);
    setErrorMsg(null);
    let storagePath: string | null = null;
    try {
      if (attachment) {
        storagePath = `${userId}/messages/${Date.now()}-${sanitizeFileName(attachment.name)}`;
        setUploadPct(5);
        await uploadPrivateEvidenceFile(token, storagePath, attachment, (pct) => setUploadPct(pct));
      }
      const rawType = activeThread?.threadType;
      const threadType: "application" | "support" | "clarification" =
        rawType === "application" || rawType === "clarification" || rawType === "support"
          ? rawType
          : "support";

      const nextMessages = await sendPortalMessage(token, {
        applicationId: activeThread?.applicationId || null,
        threadType,
        subject: cleanSubject,
        body: cleanBody,
        attachmentName: attachment?.name || null,
        attachmentPath: storagePath,
      });
      onMessagesUpdated(nextMessages);
      setBody("");
      setAttachment(null);
      if (composingNew) {
        setComposingNew(false);
        setSelectedKey("support");
      }
    } catch (err) {
      if (storagePath) await deletePrivateEvidenceObject(token, storagePath);
      setErrorMsg(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setUploadPct(null);
      setSending(false);
    }
  }

  if (activeThread || composingNew) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <GlassCard>
          <View style={styles.threadHeader}>
            <Pressable
              onPress={() => {
                setSelectedKey(null);
                setComposingNew(false);
                setErrorMsg(null);
              }}
              style={styles.backPill}
            >
              <InnovatorIcon name="back" color={adminStyleColors.navy} />
              <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.navy }}>
                Inbox
              </Text>
            </Pressable>
            <Pressable onPress={onEscalateHumanSupport} style={styles.headerLinkPill}>
              <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.blueSoft }}>
                Open Support Desk
              </Text>
            </Pressable>
          </View>

          <View style={{ gap: 3 }}>
            <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.subtle, letterSpacing: 1 }}>
              {activeThread?.applicationRef || "SUPPORT ENQUIRY"}
            </Text>
            <Text style={{ fontSize: fs("heading"), fontWeight: "700", color: adminStyleColors.navy }}>
              {activeThread ? activeThread.title : "New message to CEDA Staff"}
            </Text>
          </View>
        </GlassCard>

        {activeThread ? (
          <View style={{ gap: 10 }}>
            {activeThread.messages.map((m) => {
              const mine = m.senderRole === "innovator";
              return (
                <View key={m.id} style={[styles.chatRow, mine && styles.chatRowMine]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleStaff]}>
                    <View style={styles.msgHead}>
                      <Text
                        style={{
                          fontSize: fs("caption"),
                          fontWeight: "700",
                          color: mine ? "rgba(255,255,255,0.85)" : adminStyleColors.teal,
                        }}
                      >
                        {m.senderName} ({m.senderRole})
                      </Text>
                      <Text
                        style={{
                          fontSize: fs("caption"),
                          color: mine ? "rgba(255,255,255,0.72)" : adminStyleColors.subtle,
                        }}
                      >
                        {m.createdAt}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: fs("body"),
                        color: mine ? adminStyleColors.white : adminStyleColors.navy,
                        lineHeight: 22,
                        marginTop: 4,
                      }}
                    >
                      {m.body}
                    </Text>
                    {m.attachmentName ? (
                      <View style={[styles.attachBadge, mine && styles.attachBadgeMine]}>
                        <Text
                          style={{
                            fontSize: fs("caption"),
                            color: mine ? adminStyleColors.white : adminStyleColors.teal,
                            fontWeight: "600",
                          }}
                        >
                          Attachment: {m.attachmentName}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {activeClosedSupport ? (
          <View style={{ gap: 10 }}>
            <GlassCard>
              <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.teal }}>
                Closed by CEDA Support{activeClosedSupport.owner && activeClosedSupport.owner !== "CEDA Support Desk" ? ` · ${String(activeClosedSupport.owner).trim().split(/\s+/)[0]}` : ""}
              </Text>
              <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle, marginTop: 2 }}>
                {activeClosedSupport.reportedAt || "Archived transcript"}
              </Text>
            </GlassCard>
            {[...optimusHistory]
              .reverse()
              .filter((item) => item.escalated && activeClosedSupport.detail?.includes(item.question))
              .map((item) => (
                <React.Fragment key={item.id}>
                  <View style={[styles.chatRow, styles.chatRowMine]}>
                    <View style={[styles.bubble, styles.bubbleMine]}>
                      <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: "rgba(255,255,255,0.85)" }}>
                        You → Optimus Prime
                      </Text>
                      <Text style={{ fontSize: fs("body"), color: adminStyleColors.white, lineHeight: 22, marginTop: 4 }}>
                        {item.question}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.chatRow}>
                    <View style={[styles.bubble, styles.bubbleStaff]}>
                      <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.purple }}>
                        Optimus Prime
                      </Text>
                      <Text style={{ fontSize: fs("body"), color: adminStyleColors.navy, lineHeight: 22, marginTop: 4 }}>
                        {item.answer}
                      </Text>
                    </View>
                  </View>
                </React.Fragment>
              ))}
          </View>
        ) : null}

        {!activeClosedSupport ? (
          composingNew ? (
            <GlassCard>
              <SectionHeader eyebrow="NEW CONVERSATION" title="Compose message" />
              <FormField label="Subject">
                <FrostedInput
                  value={subject}
                  onChangeText={setSubject}
                  placeholder="Question regarding submission or portal"
                  maxLength={200}
                />
              </FormField>
              <FormField label="Message">
                <FrostedInput
                  multiline
                  value={body}
                  onChangeText={setBody}
                  placeholder="Write clearly to CEDA staff or Support Officers..."
                  maxLength={4000}
                />
              </FormField>

              {attachment ? (
                <View style={styles.attachmentRow}>
                  <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.navy, flex: 1 }}>
                    {attachment.name} ({formatBytes(attachment.size)})
                  </Text>
                  <Pressable onPress={() => setAttachment(null)} style={styles.removeChip}>
                    <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.rust }}>
                      Remove
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {uploadPct !== null ? <ProgressBar percent={uploadPct} /> : null}
              {errorMsg ? (
                <Text style={{ fontSize: fs("subbody"), color: "#9A3026", fontWeight: "600" }}>
                  {errorMsg}
                </Text>
              ) : null}
              <View style={styles.actionRow}>
                {!attachment ? (
                  <ActionButton
                    label="Attach private file"
                    variant="secondary"
                    compact
                    onPress={() => void handlePickAttachment()}
                  />
                ) : null}
                <ActionButton label="Send message" compact loading={sending} onPress={() => void handleSend()} />
              </View>
            </GlassCard>
          ) : (
            <View style={{ gap: 10 }}>
              {attachment ? (
                <View style={styles.attachmentRow}>
                  <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.navy, flex: 1 }}>
                    {attachment.name} ({formatBytes(attachment.size)})
                  </Text>
                  <Pressable onPress={() => setAttachment(null)} style={styles.removeChip}>
                    <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.rust }}>
                      Remove
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {uploadPct !== null ? <ProgressBar percent={uploadPct} /> : null}
              {errorMsg ? (
                <Text style={{ fontSize: fs("subbody"), color: "#9A3026", fontWeight: "600" }}>
                  {errorMsg}
                </Text>
              ) : null}
              <View style={styles.messageComposer}>
                <FrostedSurface variant="bar" borderRadius={28} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Attach private file"
                  onPress={() => void handlePickAttachment()}
                  style={({ pressed }) => [styles.attachCircle, pressed && { opacity: 0.72 }]}
                >
                  <InnovatorIcon name="documents" color={adminStyleColors.navy} size={17} />
                </Pressable>
                <FrostedInput
                  accessibilityLabel="Message"
                  multiline
                  value={body}
                  onChangeText={setBody}
                  placeholder="Write a reply..."
                  maxLength={4000}
                  style={styles.messageInput}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                  disabled={sending}
                  onPress={() => void handleSend()}
                  style={({ pressed }) => [
                    styles.sendCircle,
                    (!body.trim() || sending) && styles.sendCircleMuted,
                    pressed && !sending ? { opacity: 0.78 } : null,
                  ]}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color={adminStyleColors.white} />
                  ) : (
                    <Text style={styles.sendArrow} accessible={false}>
                      {"↑"}
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          )
        ) : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminStyleColors.rust} />
      }
    >
      <SubscreenHero
        icon="messages"
        color={adminStyleColors.blue}
        tint="#EAF1FC"
        eyebrow="COMMUNICATION INBOX"
        title="Messages"
        badge={`${threads.length} threads`}
        summary="Application updates, clarification threads, and direct CEDA Support conversations."
      />

      <View style={styles.topActions}>
        <ActionButton label="New message" compact onPress={startNewThread} />
        <ActionButton
          label="Human support"
          variant="secondary"
          compact
          onPress={onEscalateHumanSupport}
        />
      </View>

      <GlassCard style={{ paddingVertical: 0 }}>
        {threads.length ? (
          threads.map((t, idx) => {
            const last = t.messages[t.messages.length - 1];
            const isApp = Boolean(t.applicationRef);
            return (
              <Pressable
                key={t.key}
                onPress={() => void openThread(t)}
                style={({ pressed }) => [
                  styles.threadRow,
                  idx === threads.length - 1 && { borderBottomWidth: 0 },
                  pressed && { backgroundColor: "rgba(247,242,235,0.65)" },
                ]}
              >
                <View style={[styles.threadIcon, { backgroundColor: isApp ? "#EAF1FC" : "#E4F4F0" }]}>
                  <InnovatorIcon
                    name={isApp ? "applications" : "support"}
                    color={isApp ? adminStyleColors.blue : adminStyleColors.teal}
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.msgHead}>
                    <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.subtle }}>
                      {t.applicationRef || t.threadType.toUpperCase()}
                    </Text>
                    <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle }}>
                      {last?.createdAt || ""}
                    </Text>
                  </View>
                  <Text style={{ fontSize: fs("body"), fontWeight: "600", color: adminStyleColors.navy }}>
                    {t.title}
                  </Text>
                  <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle }} numberOfLines={2}>
                    {last?.senderName || "CEDA"}: {last?.body || ""}
                  </Text>
                  {t.unread ? (
                    <View style={styles.unreadTag}>
                      <View style={styles.unreadDot} />
                      <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.blue }}>
                        {t.unreadCount} unread reply
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.chevron} accessible={false}>
                  {"\u203a"}
                </Text>
              </Pressable>
            );
          })
        ) : (
          <View style={{ paddingVertical: 28, alignItems: "center", gap: 10 }}>
            <Text style={{ fontSize: fs("body"), fontWeight: "600", color: adminStyleColors.navy }}>
              No conversations yet
            </Text>
            <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, textAlign: "center" }}>
              Submit an innovation application or message CEDA Support below.
            </Text>
            <ActionButton label="Start new message" compact onPress={startNewThread} />
          </View>
        )}
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 18,
    gap: 14,
    paddingBottom: 144,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  topActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  threadHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  backPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: buttonCornerRadius,
    backgroundColor: "#EAF1FC",
  },
  headerLinkPill: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: buttonCornerRadius,
    backgroundColor: "rgba(65,122,197,0.10)",
    justifyContent: "center",
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
  msgHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  attachBadge: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: buttonCornerRadius,
    backgroundColor: "#E4F4F0",
  },
  attachBadgeMine: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,250,244,0.92)",
    shadowColor: "#261B16",
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 1,
  },
  removeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: buttonCornerRadius,
    backgroundColor: "#FBEDE8",
  },
  messageComposer: {
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 4,
    paddingLeft: 8,
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
  attachCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(25,44,64,0.06)",
    alignItems: "center",
    justifyContent: "center",
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
  sendCircleMuted: { opacity: 0.55 },
  sendArrow: { color: adminStyleColors.white, fontSize: 18, fontWeight: "700", lineHeight: 20 },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(36,28,25,0.08)",
  },
  threadIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    marginTop: 2,
  },
  unreadTag: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#EAF1FC",
    borderRadius: buttonCornerRadius,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 2,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: adminStyleColors.blue,
  },
  chevron: { fontSize: 22, color: "#A1A8B1" },
});
