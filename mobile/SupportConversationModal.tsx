import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Account } from "./auth";
import { connectSupportTicket, updateSupportTicket } from "./supportApi";
import {
  buildConversationTimeline,
  firstNameOnly,
  formatChatTime,
  getLatestActivityAt,
  getTicketSource,
  isDefaultOptimusTitle,
  SUPPORT_QUICK_REPLIES,
  SUPPORT_STATES,
  type SupportTicket,
} from "./supportOverview.js";
import {
  ActionButton,
  adminStyleColors as colors,
  FactRow,
  FlushSheetModal,
  FrostedInput,
  GlassCard,
  StatusPill,
} from "./InnovatorUI";
import { fontSizes } from "./theme";

function senderInitials(name: string): string {
  return (
    String(name || "U")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join("")
      .toUpperCase() || "U"
  );
}

/**
 * Interactive Support Officer chat room modal showing AI conversation + handoff marker first, Connect action, and Discussions-style composer.
 */
export function SupportConversationModal({
  account,
  ticket,
  onClose,
  onTicketsUpdated,
}: {
  account: Account;
  ticket: SupportTicket | null;
  onClose: () => void;
  onTicketsUpdated: (nextTickets: SupportTicket[]) => void;
}) {
  const [nextState, setNextState] = useState<string>(ticket?.state || "Investigating");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [templateReason, setTemplateReason] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!ticket) return;
    setNextState(ticket.state === "Open" ? "Investigating" : (ticket.state || "Investigating"));
    setStatusMenuOpen(false);
    setTemplateReason("");
    setReply("");
    setError("");
    setNotice("");
  }, [ticket?.id, ticket?.state]);

  if (!ticket) return null;

  const source = getTicketSource(ticket);
  const latestAt = getLatestActivityAt(ticket);
  const officerFullName = String(account.name || "").trim();
  const officerFirst = firstNameOnly(officerFullName, "Officer");
  const isAssignedToMe = Boolean(
    officerFullName && String(ticket.owner || "").trim().toLowerCase() === officerFullName.toLowerCase()
  );
  const timeline = buildConversationTimeline(ticket);

  async function handleConnect() {
    if (!ticket || busy || isAssignedToMe) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const updated = await connectSupportTicket(account, ticket.id);
      onTicketsUpdated(updated);
      setNotice(`Connected · ${ticket.reporter} now sees ${officerFirst}.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not connect to conversation.");
    } finally {
      setBusy(false);
    }
  }

  async function handleStageChange(stage: string) {
    if (!ticket || busy || stage === ticket.state) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const updated = await updateSupportTicket(account, {
        reference: ticket.id,
        state: stage,
        reason: `Status updated from ${ticket.state} to ${stage}.`,
        reply: null,
      });
      onTicketsUpdated(updated);
      setNotice(`Status set to ${stage}.`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not update ticket status.");
    } finally {
      setBusy(false);
    }
  }

  async function quickCloseTicket() {
    if (!ticket || busy) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const updated = await updateSupportTicket(account, {
        reference: ticket.id,
        state: "Resolved",
        reason: "Marked resolved by Support Officer.",
        reply: null,
      });
      onTicketsUpdated(updated);
      setReply("");
      setTemplateReason("");
      setNotice("Ticket marked resolved.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not close ticket.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReply() {
    if (!ticket) return;
    setError("");
    setNotice("");
    const cleanReply = reply.trim();
    if (!cleanReply && nextState === ticket.state) {
      setError("Type a message or pick a status before sending.");
      return;
    }
    if (cleanReply && cleanReply.length < 2) {
      setError("Enter a reply of at least 2 characters.");
      return;
    }
    const reasonNote =
      templateReason ||
      (cleanReply ? `Support officer replied (${nextState})` : `Updated status to ${nextState}`);
    setBusy(true);
    try {
      const updated = await updateSupportTicket(account, {
        reference: ticket.id,
        state: nextState,
        reason: reasonNote,
        reply: cleanReply || null,
      });
      onTicketsUpdated(updated);
      setReply("");
      setTemplateReason("");
      setStatusMenuOpen(false);
      setNotice("Message sent cleanly.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not send message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlushSheetModal
      visible={!!ticket}
      eyebrow={`${ticket.id} · ${source}`}
      title={ticket.reporter || "Innovator"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <View style={styles.stack}>
        <GlassCard style={styles.card}>
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              disabled={busy || isAssignedToMe}
              onPress={() => void handleConnect()}
              style={({ pressed }) => [
                styles.connectBtn,
                isAssignedToMe && styles.connectBtnActive,
                pressed && !isAssignedToMe && { opacity: 0.72 },
              ]}
            >
              <Text style={[styles.connectBtnText, isAssignedToMe && styles.connectBtnTextActive]}>
                {isAssignedToMe ? `Connected · ${officerFirst}` : "Connect"}
              </Text>
            </Pressable>

            {ticket.state !== "Resolved" && (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void quickCloseTicket()}
                style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.75 }]}
              >
                <Text style={styles.closeBtnText}>{busy ? "Closing..." : "Close ticket"}</Text>
              </Pressable>
            )}

            <StatusPill status={ticket.state} />
          </View>

          <View style={styles.stageRow}>
            {["Open", "Investigating", "Waiting"].map(stage => {
              const active = ticket.state === stage;
              return (
                <Pressable
                  key={stage}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  disabled={busy || active}
                  onPress={() => void handleStageChange(stage)}
                  style={({ pressed }) => [
                    styles.stageChip,
                    active && styles.stageChipActive,
                    pressed && !active && { opacity: 0.72 },
                  ]}
                >
                  <Text style={[styles.stageChipText, active && styles.stageChipTextActive]}>{stage}</Text>
                </Pressable>
              );
            })}
          </View>

          {!isDefaultOptimusTitle(ticket.title) && ticket.title ? (
            <Text style={styles.subjectLine}>{ticket.title}</Text>
          ) : null}

          <FactRow label="Application reference" value={ticket.application || "Not linked"} />
          <FactRow label="Time of latest activity" value={`${latestAt || ticket.reported} CAT`} last />
        </GlassCard>

        <View style={styles.chatPanel}>
          <View style={styles.chatList}>
            {timeline.map((entry, idx) => {
              if (entry.kind === "divider") {
                const isHandoff = entry.tone === "handoff";
                const isAi = entry.tone === "ai";
                const isSys = entry.tone === "system";
                return (
                  <View
                    key={`div-${idx}`}
                    style={[
                      styles.chatDividerPill,
                      isHandoff && styles.chatDividerHandoff,
                      isAi && styles.chatDividerAi,
                      isSys && styles.chatDividerSystem,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chatDividerText,
                        isHandoff && styles.chatDividerHandoffText,
                        isAi && styles.chatDividerAiText,
                        isSys && styles.chatDividerSystemText,
                      ]}
                    >
                      {entry.at ? `${entry.label} · ${entry.at} CAT` : entry.label}
                    </Text>
                  </View>
                );
              }

              const isAi = entry.role === "ai";
              const isOfficer = entry.role === "support" || entry.role === "admin";
              const senderLabel = isOfficer
                ? officerFullName && entry.sender.toLowerCase() === officerFullName.toLowerCase()
                  ? "You"
                  : entry.sender
                : entry.sender;

              return (
                <View key={`msg-${idx}`} style={[styles.chatMessageRow, isOfficer && styles.chatMessageOwn]}>
                  <View style={[styles.chatAvatar, isOfficer && styles.chatAvatarOwn, isAi && styles.chatAvatarAi]}>
                    <Text
                      style={[
                        styles.chatAvatarText,
                        isOfficer && styles.chatAvatarTextOwn,
                        isAi && styles.chatAvatarTextAi,
                      ]}
                    >
                      {isAi ? "OP" : senderInitials(entry.sender || ticket.reporter)}
                    </Text>
                  </View>
                  <View style={[styles.chatContent, isOfficer && { alignItems: "flex-end" }]}>
                    <View style={[styles.chatMetaRow, isOfficer && styles.chatMetaOwn]}>
                      {isOfficer ? (
                        <>
                          <Text style={styles.chatTime}>{formatChatTime(entry.at)}</Text>
                          <Text style={styles.chatNameOwn}>{senderLabel}</Text>
                        </>
                      ) : (
                        <>
                          <Text style={[styles.chatName, isAi && styles.chatNameAi]}>{senderLabel}</Text>
                          <Text style={styles.chatTime}>{formatChatTime(entry.at)}</Text>
                        </>
                      )}
                    </View>
                    <View style={[styles.chatBubble, isOfficer && styles.chatBubbleOwn, isAi && styles.chatBubbleAi]}>
                      <Text
                        style={[
                          styles.chatBubbleText,
                          isOfficer && styles.chatBubbleTextOwn,
                          isAi && styles.chatBubbleTextAi,
                        ]}
                      >
                        {entry.body}
                      </Text>
                    </View>
                    {entry.sourceArticle ? (
                      <Text style={styles.sourceCaption}>Source: {entry.sourceArticle}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChips}>
            {SUPPORT_QUICK_REPLIES.map(template => (
              <Pressable
                key={template.id}
                accessibilityRole="button"
                onPress={() => {
                  setNextState(template.state);
                  setTemplateReason(template.reason);
                  setReply(template.reply);
                  setError("");
                }}
                style={({ pressed }) => [styles.quickChip, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.quickChipText}>{template.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {statusMenuOpen && (
            <View style={styles.statusPopover}>
              {SUPPORT_STATES.map(stage => {
                const selected = stage === nextState;
                return (
                  <Pressable
                    key={stage}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setNextState(stage);
                      setStatusMenuOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.statusPopoverItem,
                      selected && styles.statusPopoverItemActive,
                      pressed && { opacity: 0.72 },
                    ]}
                  >
                    <Text style={[styles.statusPopoverText, selected && styles.statusPopoverTextActive]}>{stage}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={styles.messageComposer}>
            <FrostedInput
              accessibilityLabel="Reply message"
              placeholder="Type your message here..."
              multiline
              editable={!busy}
              value={reply}
              onChangeText={val => {
                setTemplateReason("");
                setReply(val);
              }}
              maxLength={2000}
              style={styles.messageInput}
            />
            <View style={styles.messageToolbar}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select reply status"
                accessibilityState={{ expanded: statusMenuOpen }}
                onPress={() => setStatusMenuOpen(v => !v)}
                style={({ pressed }) => [styles.statusTrigger, pressed && { opacity: 0.72 }]}
              >
                <Text style={styles.statusTriggerText}>Status: {nextState} ▾</Text>
              </Pressable>
              <ActionButton
                label="Send now"
                compact
                loading={busy}
                disabled={busy}
                style={styles.messageSend}
                onPress={() => void submitReply()}
              />
            </View>
          </View>

          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          {!!notice && (
            <Text accessibilityLiveRegion="polite" style={styles.success}>
              {notice}
            </Text>
          )}
        </View>
      </View>
    </FlushSheetModal>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  card: { gap: 10 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  connectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#EDF7F0",
    borderWidth: 1,
    borderColor: "#C3DEC9",
  },
  connectBtnActive: { backgroundColor: "#E5F3E9", borderColor: "#9AC8AA" },
  connectBtnText: { color: "#1F5C3A", fontSize: fontSizes.caption, fontWeight: "700" },
  connectBtnTextActive: { color: "#184E30" },
  closeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#246643",
  },
  closeBtnText: { color: "#FFFFFF", fontSize: fontSizes.caption, fontWeight: "700" },
  stageRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  stageChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2DDD7",
    backgroundColor: "#FFFDF9",
  },
  stageChipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  stageChipText: { color: colors.muted, fontSize: fontSizes.caption, fontWeight: "700" },
  stageChipTextActive: { color: "#FFFFFF" },
  subjectLine: { color: colors.navy, fontSize: fontSizes.subbody, fontWeight: "700" },
  chatPanel: {
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E4E7E5",
    backgroundColor: "#F7F6F3",
  },
  chatList: { gap: 12 },
  chatDividerPill: {
    alignSelf: "center",
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E6E6",
    backgroundColor: "#F8FBFB",
  },
  chatDividerAi: { backgroundColor: "#EEF6F4", borderColor: "#CBE2DC" },
  chatDividerHandoff: { backgroundColor: "#FFF3EB", borderColor: "#E4C4B5" },
  chatDividerSystem: { backgroundColor: "#EDF7F0", borderColor: "#C7DFCE" },
  chatDividerText: { color: "#6F797D", fontSize: fontSizes.caption, fontWeight: "700", textAlign: "center" },
  chatDividerAiText: { color: "#236D61" },
  chatDividerHandoffText: { color: "#813626" },
  chatDividerSystemText: { color: "#24603C" },
  chatMessageRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, maxWidth: "92%" },
  chatMessageOwn: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  chatAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E7ECEA",
    borderWidth: 1,
    borderColor: "#DCE3E0",
  },
  chatAvatarAi: { backgroundColor: "#E4F4F0", borderColor: "#CBE2DC" },
  chatAvatarOwn: { backgroundColor: "#E9F3EA", borderColor: "#D7E8D9" },
  chatAvatarText: { color: "#315C4E", fontSize: fontSizes.caption, fontWeight: "800" },
  chatAvatarTextAi: { color: "#236D61" },
  chatAvatarTextOwn: { color: "#2F7246" },
  chatContent: { flexShrink: 1, gap: 4 },
  chatMetaRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  chatMetaOwn: { justifyContent: "flex-end" },
  chatName: { color: "#367A4E", fontSize: fontSizes.subbody, fontWeight: "700" },
  chatNameAi: { color: "#236D61" },
  chatNameOwn: { color: "#367A4E", fontSize: fontSizes.subbody, fontWeight: "700" },
  chatTime: { color: "#7C8589", fontSize: fontSizes.caption },
  chatBubble: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 15,
    borderBottomRightRadius: 15,
    borderBottomLeftRadius: 15,
    borderWidth: 1,
    borderColor: "#E0E4E3",
    backgroundColor: "#FFFFFF",
  },
  chatBubbleAi: { backgroundColor: "#F2F9F7", borderColor: "#D4E8E2" },
  chatBubbleOwn: {
    borderTopLeftRadius: 15,
    borderTopRightRadius: 3,
    borderColor: "#71351F",
    backgroundColor: "#6F321C",
  },
  chatBubbleText: { color: "#3D4446", fontSize: fontSizes.body, lineHeight: 21 },
  chatBubbleTextAi: { color: "#1F3934" },
  chatBubbleTextOwn: { color: "#FFFFFF" },
  sourceCaption: { color: colors.muted, fontSize: fontSizes.caption },
  quickChips: { gap: 7, paddingVertical: 2 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DFD4CA",
  },
  quickChipText: { color: colors.navy, fontSize: fontSizes.caption, fontWeight: "700" },
  statusPopover: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    padding: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DFD4CA",
    backgroundColor: "#FFFFFF",
  },
  statusPopoverItem: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "#F9F6F2",
  },
  statusPopoverItemActive: { backgroundColor: "#F6ECE8" },
  statusPopoverText: { color: colors.navy, fontSize: fontSizes.caption, fontWeight: "600" },
  statusPopoverTextActive: { color: "#813626", fontWeight: "700" },
  messageComposer: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E0E4E3",
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
  },
  messageInput: {
    minHeight: 74,
    maxHeight: 150,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  messageToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "#EDF0EF",
  },
  statusTrigger: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#FAF7F3",
    borderWidth: 1,
    borderColor: "#DFD4CA",
  },
  statusTriggerText: { color: colors.navy, fontSize: fontSizes.caption, fontWeight: "700" },
  messageSend: { minHeight: 40 },
  error: { color: colors.rustDark, fontSize: fontSizes.subbody, fontWeight: "600" },
  success: { color: colors.teal, fontSize: fontSizes.subbody, fontWeight: "700" },
});
