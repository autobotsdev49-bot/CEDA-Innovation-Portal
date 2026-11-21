import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FrostedModalBackdrop, FrostedSurface } from "./FrostedGlass";
import {
  askOptimusPrime,
  createSupportRequest,
  escalateOptimusToSupport,
  getActiveOptimusSupportRequest,
  isClosedSupportRequest,
  isOptimusSupportRequest,
  rateOptimusInteraction,
  replySupportRequest,
  sendPasswordResetEmail,
  signOutOtherDevices,
  updateInnovatorProfile,
  type FaqArticle,
  type InnovatorPreferences,
  type InnovatorProfile,
  type OptimusInteraction,
  type SupportRequestItem,
} from "./innovatorApi";
import {
  BOTSWANA_DISTRICTS,
  EVIDENCE_SECTION_CATEGORIES,
  formatBytes,
  OPTIMUS_SUGGESTED_PROMPTS,
  VERIFICATION_DOCUMENT_CATEGORIES,
  type InnovatorApplication,
  type InnovatorDocument,
} from "./innovatorDomain";
import {
  ActionButton,
  adminStyleColors,
  ChoiceChips,
  FactRow,
  FlushSheetModal,
  FormField,
  FrostedInput,
  FrostedSearchPill,
  GlassCard,
  IconRow,
  InnovatorIcon,
  PrivateDocPreviewModal,
  SectionHeader,
  statusAppearance,
  StatusPill,
  SubscreenHero,
  SwitchRow,
  useInnovatorA11y,
  type InnovatorIconName,
} from "./InnovatorUI";
import { buttonCornerRadius } from "./theme";

export type MoreSubScreenKey = "documents" | "optimus" | "support" | "settings";

export const MORE_SUBSCREEN_META: Record<
  MoreSubScreenKey,
  {
    icon: InnovatorIconName;
    color: string;
    tint: string;
    badge: string;
    category: string;
    title: string;
    detail: string;
    summary: string;
  }
> = {
  documents: {
    icon: "documents",
    color: adminStyleColors.teal,
    tint: "#E4F4F0",
    badge: "Private vault",
    category: "INNOVATION WORKSPACE",
    title: "Verification documents",
    detail: "Identity, residence & company records",
    summary: "Find the identity, residence and company verification records attached to your applications here. New applications collect these records in Step 11.",
  },
  optimus: {
    icon: "optimus",
    color: adminStyleColors.purple,
    tint: "#F0ECFB",
    badge: "Controlled AI",
    category: "GUIDANCE & HELP",
    title: "Optimus Prime",
    detail: "Eligibility, sections & status help",
    summary: "Approved guidance grounded in CEDA rules with direct human Support Officer handoff when case-specific help is needed.",
  },
  support: {
    icon: "support",
    color: adminStyleColors.blue,
    tint: "#EAF1FC",
    badge: "Help desk",
    category: "GUIDANCE & HELP",
    title: "Help and support",
    detail: "FAQs, bug reports & ticket replies",
    summary: "Search published help articles, log support tickets or technical issues, and follow replies directly from CEDA Support.",
  },
  settings: {
    icon: "settings",
    color: adminStyleColors.amber,
    tint: "#FCF4E4",
    badge: "Preferences",
    category: "ACCOUNT & ACCESSIBILITY",
    title: "Account and settings",
    detail: "Profile, company, alerts & readability",
    summary: "Manage personal defaults, company details, password resets, notifications, accessibility scaling, and active sessions.",
  },
};

export function InnovatorMoreHub({
  profile,
  documentsCount,
  openTicketsCount,
  searchSlot,
  onOpenSubScreen,
  onStartNew,
  onSignOut,
}: {
  profile: InnovatorProfile;
  documentsCount: number;
  openTicketsCount: number;
  searchSlot?: React.ReactNode;
  onOpenSubScreen: (key: MoreSubScreenKey) => void;
  onStartNew: () => void;
  onSignOut: () => void;
}) {
  const { fs } = useInnovatorA11y();
  const initials = (profile.fullName || "Innovator")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      {searchSlot}

      <View style={styles.profileCard}>
        <FrostedSurface variant="sheet" borderRadius={22} />
        <View style={styles.profileTop}>
          <View style={styles.profileAvatar}>
            <Text style={{ fontSize: fs("heading"), fontWeight: "700", color: adminStyleColors.rust }}>
              {initials}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.eyebrow, { fontSize: fs("caption") }]}>INNOVATOR WORKSPACE</Text>
            <Text accessibilityRole="header" style={{ fontSize: fs("title"), fontWeight: "700", color: adminStyleColors.navy }}>
              {profile.fullName || "Innovator"}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
              <StatusPill status="Submitted" label="Innovator" />
              <StatusPill status="Published" label={profile.district || "Botswana"} />
            </View>
          </View>
        </View>
        <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, lineHeight: 19 }}>
          {profile.email} · Private drafts & evidence stay protected to your account.
        </Text>
        <View style={styles.profileActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenSubScreen("settings")}
            style={styles.profileQuickButton}
          >
            <InnovatorIcon name="shield" color={adminStyleColors.teal} />
            <Text style={{ color: adminStyleColors.teal, fontSize: fs("subbody"), fontWeight: "700" }}>
              Account & privacy
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onSignOut}
            style={styles.profileSignOutButton}
          >
            <Text style={{ color: adminStyleColors.navy, fontSize: fs("subbody"), fontWeight: "600" }}>
              Sign out
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionHeaderLabel, { fontSize: fs("caption") }]}>
          INNOVATION WORKSPACE
        </Text>
        <GlassCard style={{ paddingVertical: 0 }}>
          <IconRow
            title="Verification documents"
            detail={MORE_SUBSCREEN_META.documents.detail}
            icon={MORE_SUBSCREEN_META.documents.icon}
            color={MORE_SUBSCREEN_META.documents.color}
            tint={MORE_SUBSCREEN_META.documents.tint}
            badge={`${documentsCount} files`}
            onPress={() => onOpenSubScreen("documents")}
          />
          <IconRow
            title="Start new innovation"
            detail="Open 12-step guided application wizard"
            icon="submit"
            color={adminStyleColors.rust}
            tint="#FBEDE8"
            badge="Wizard"
            last
            onPress={onStartNew}
          />
        </GlassCard>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionHeaderLabel, { fontSize: fs("caption") }]}>
          GUIDANCE & SUPPORT
        </Text>
        <GlassCard style={{ paddingVertical: 0 }}>
          <IconRow
            title="Optimus Prime"
            detail={MORE_SUBSCREEN_META.optimus.detail}
            icon={MORE_SUBSCREEN_META.optimus.icon}
            color={MORE_SUBSCREEN_META.optimus.color}
            tint={MORE_SUBSCREEN_META.optimus.tint}
            badge="Controlled AI"
            onPress={() => onOpenSubScreen("optimus")}
          />
          <IconRow
            title="Help and support"
            detail={MORE_SUBSCREEN_META.support.detail}
            icon={MORE_SUBSCREEN_META.support.icon}
            color={MORE_SUBSCREEN_META.support.color}
            tint={MORE_SUBSCREEN_META.support.tint}
            badge={openTicketsCount ? `${openTicketsCount} open` : "FAQs"}
            last
            onPress={() => onOpenSubScreen("support")}
          />
        </GlassCard>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionHeaderLabel, { fontSize: fs("caption") }]}>
          ACCOUNT & ACCESSIBILITY
        </Text>
        <GlassCard style={{ paddingVertical: 0 }}>
          <IconRow
            title="Account and settings"
            detail="Profile, company info, notifications, text size & sessions"
            icon={MORE_SUBSCREEN_META.settings.icon}
            color={MORE_SUBSCREEN_META.settings.color}
            tint={MORE_SUBSCREEN_META.settings.tint}
            badge={profile.preferences?.textSize === "standard" || !profile.preferences?.textSize ? "Standard" : String(profile.preferences.textSize)}
            last
            onPress={() => onOpenSubScreen("settings")}
          />
        </GlassCard>
      </View>
    </ScrollView>
  );
}

export function InnovatorDocumentsScreen({
  token,
  documents,
}: {
  token: string;
  documents: InnovatorDocument[];
}) {
  const { fs } = useInnovatorA11y();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"Verification records" | "All files & links">("Verification records");
  const [section, setSection] = useState("all");
  const [previewDoc, setPreviewDoc] = useState<InnovatorDocument | null>(null);
  const meta = MORE_SUBSCREEN_META.documents;

  const visibleDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((d) => {
      if (d.uploadStatus === "Removed") return false;
      if (
        scope === "Verification records" &&
        (d.sectionKey !== "applicant" ||
          !(VERIFICATION_DOCUMENT_CATEGORIES as readonly string[]).includes(d.category))
      ) {
        return false;
      }
      if (section !== "all" && d.sectionKey !== section) return false;
      if (!q) return true;
      return [d.title, d.fileName, d.applicationRef, d.sectionKey].some((v) =>
        String(v || "").toLowerCase().includes(q)
      );
    });
  }, [documents, query, scope, section]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.subScrollContent} keyboardShouldPersistTaps="handled">
        <SubscreenHero
          icon={meta.icon}
          color={meta.color}
          tint={meta.tint}
          eyebrow={meta.category}
          title={meta.title}
          badge={`${visibleDocs.length} items`}
          summary={meta.summary}
        />

        <FrostedSearchPill
          value={query}
          onChangeText={setQuery}
          placeholder="Search file name, title or reference"
        />

        <ChoiceChips
          options={["Verification records", "All files & links"]}
          selected={scope}
          onSelect={(val) => setScope(val as "Verification records" | "All files & links")}
        />

        {scope === "All files & links" ? (
          <ChoiceChips
            options={["all", ...EVIDENCE_SECTION_CATEGORIES.map((c) => c.key)]}
            selected={section}
            onSelect={setSection}
          />
        ) : null}

        <GlassCard style={{ paddingVertical: 0 }}>
          {visibleDocs.length ? (
            visibleDocs.map((doc, idx) => (
              <IconRow
                key={doc.id}
                title={doc.title || doc.fileName}
                detail={`${doc.applicationRef} · ${doc.sectionKey} · ${
                  doc.docKind === "video_link" ? "HTTPS Video Link" : formatBytes(doc.fileSize)
                } · v${doc.version || 1}`}
                icon="documents"
                color={doc.docKind === "video_link" ? adminStyleColors.blue : adminStyleColors.teal}
                tint={doc.docKind === "video_link" ? "#EAF1FC" : "#E4F4F0"}
                badge={doc.docKind === "video_link" ? "Video" : "Private"}
                last={idx === visibleDocs.length - 1}
                onPress={() => setPreviewDoc(doc)}
              />
            ))
          ) : (
            <View style={{ paddingVertical: 24, alignItems: "center" }}>
              <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, textAlign: "center" }}>
                {scope === "Verification records"
                  ? "No verification records uploaded yet. Step 11 collects Omang/ID, residence, and company documents."
                  : "No documents matched your current filter."}
              </Text>
            </View>
          )}
        </GlassCard>
      </ScrollView>

      <PrivateDocPreviewModal
        doc={previewDoc}
        token={token}
        onClose={() => setPreviewDoc(null)}
      />
    </View>
  );
}

export function OptimusAssistantContent({
  token,
  fullName,
  history,
  supportRequests = [],
  initialQuestion,
  onHistoryUpdated,
  onRequestsUpdated,
  onClose,
}: {
  token: string;
  fullName?: string;
  history: OptimusInteraction[];
  supportRequests?: SupportRequestItem[];
  initialQuestion?: { prompt: string; topic: string } | null;
  onHistoryUpdated: (items: OptimusInteraction[]) => void;
  onRequestsUpdated: (requests: SupportRequestItem[]) => void;
  onClose?: () => void;
}) {
  const { fs } = useInnovatorA11y();
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const [question, setQuestion] = useState("");
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [errorNote, setErrorNote] = useState<string | null>(null);
  const [clearedIds, setClearedIds] = useState<string[]>([]);

  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateSummary, setEscalateSummary] = useState("");
  const [escalateBusy, setEscalateBusy] = useState(false);

  const activeSupport = useMemo(
    () => getActiveOptimusSupportRequest(supportRequests),
    [supportRequests]
  );
  const closedTickets = useMemo(
    () => supportRequests.filter((r) => isOptimusSupportRequest(r) && isClosedSupportRequest(r)),
    [supportRequests]
  );
  const visibleHistory = useMemo(
    () =>
      history.filter(
        (item) =>
          !clearedIds.includes(item.id) &&
          !closedTickets.some((ticket) => ticket.detail?.includes(item.question))
      ),
    [history, clearedIds, closedTickets]
  );
  const chronologicalHistory = useMemo(() => [...visibleHistory].reverse(), [visibleHistory]);
  const firstName = String(fullName || "").trim().split(/\s+/)[0];
  const officerAssigned = Boolean(activeSupport?.owner && activeSupport.owner !== "CEDA Support Desk");

  async function askQuestion(text: string, sec = "general") {
    const trimmed = text.trim();
    if (trimmed.length < 3 || asking) {
      if (trimmed.length > 0 && trimmed.length < 3) {
        setErrorNote(activeSupport ? "Type at least 3 characters." : "Ask a question (at least 3 characters).");
      }
      return;
    }
    setQuestion("");
    setPendingPrompt(trimmed);
    setAsking(true);
    setErrorNote(null);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 40);
    try {
      if (activeSupport) {
        const nextReqs = await replySupportRequest(token, activeSupport.id, trimmed);
        onRequestsUpdated(nextReqs);
      } else {
        const res = await askOptimusPrime(token, trimmed, sec);
        onHistoryUpdated(res.history || []);
      }
    } catch (err) {
      setQuestion(trimmed);
      setErrorNote(err instanceof Error ? err.message : "Could not send message.");
    } finally {
      setPendingPrompt(null);
      setAsking(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }

  useEffect(() => {
    if (initialQuestion?.prompt) {
      void askQuestion(initialQuestion.prompt, initialQuestion.topic || "general");
    }
  }, [initialQuestion?.prompt]);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 60);
    return () => clearTimeout(timer);
  }, [chronologicalHistory.length, activeSupport?.thread?.length]);

  async function handleRate(id: string, rating: "helpful" | "not_helpful") {
    try {
      const next = await rateOptimusInteraction(token, id, rating);
      onHistoryUpdated(next);
    } catch (err) {
      setErrorNote(err instanceof Error ? err.message : "Rating failed.");
    }
  }

  async function handleEscalate(interactionId: string | null, summaryText: string) {
    const clean = summaryText.trim();
    if (clean.length < 5) {
      setErrorNote("Add a short note (5+ characters) for CEDA Support.");
      return;
    }
    setEscalateBusy(true);
    setErrorNote(null);
    try {
      const reqs = await escalateOptimusToSupport(token, interactionId, clean);
      onRequestsUpdated(reqs);
      setEscalateOpen(false);
      setEscalateSummary("");
    } catch (err) {
      setErrorNote(err instanceof Error ? err.message : "Escalation failed.");
    } finally {
      setEscalateBusy(false);
    }
  }

  return (
    <View style={styles.dmContainer}>
      {/* Messenger Top Bar */}
      <View style={styles.dmHeader}>
        <View style={styles.dmIdentity}>
          <View style={styles.dmAvatarLg}>
            <InnovatorIcon name="optimus" color={adminStyleColors.rust} size={20} />
            <View style={styles.dmOnlineDot} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fs("heading"), fontWeight: "700", color: adminStyleColors.white }} numberOfLines={1}>
              {activeSupport && officerAssigned ? activeSupport.owner : "Optimus Prime"}
            </Text>
            <Text style={{ fontSize: fs("caption"), color: "rgba(255,255,255,0.86)" }} numberOfLines={1}>
              {activeSupport
                ? officerAssigned
                  ? `CEDA Support · Ref ${activeSupport.id}`
                  : `In Support queue · Ref ${activeSupport.id}`
                : "Here to help · CEDA Portal Assistant"}
            </Text>
          </View>
        </View>
        <View style={styles.dmHeaderActions}>
          {visibleHistory.length ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setClearedIds(history.map((h) => h.id));
                setErrorNote(null);
              }}
              style={styles.dmClearPill}
            >
              <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.white }}>
                Clear
              </Text>
            </Pressable>
          ) : null}
          {onClose ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close Optimus chat"
              onPress={onClose}
              style={styles.dmCloseBtn}
            >
              <InnovatorIcon name="close" color={adminStyleColors.white} size={17} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Scrollable DM Conversation Feed */}
      <ScrollView
        ref={scrollRef}
        style={styles.dmFeed}
        contentContainerStyle={styles.dmFeedContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        <View style={styles.dmSystemNote}>
          <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle, textAlign: "center", lineHeight: 16 }}>
            General portal guidance only — never scores applications or modifies submissions.
          </Text>
        </View>

        {/* Left Greeting DM Bubble when conversation starts */}
        {!chronologicalHistory.length && !pendingPrompt && !activeSupport ? (
          <View style={styles.dmRowLeft}>
            <View style={styles.dmAvatarSm}>
              <Text style={styles.dmAvatarText}>OP</Text>
            </View>
            <View style={{ flex: 1, gap: 8, maxWidth: "85%" }}>
              <View style={styles.dmBubbleLeft}>
                <Text style={{ fontSize: fs("body"), color: adminStyleColors.navy, lineHeight: 21 }}>
                  Hi{firstName ? ` ${firstName}` : ""}! Ask me about your applications, eligibility, sections, or documents.
                </Text>
                <View style={styles.dmTopicWrap}>
                  {OPTIMUS_SUGGESTED_PROMPTS.map((p) => (
                    <Pressable
                      key={p.topic}
                      onPress={() => void askQuestion(p.prompt, p.topic)}
                      style={styles.dmQuickChip}
                    >
                      <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.rust }}>
                        {p.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {/* Chronological Q&A DM Bubbles */}
        {chronologicalHistory.map((item, idx) => {
          const isLatest = idx === chronologicalHistory.length - 1;
          return (
            <React.Fragment key={item.id}>
              <View style={styles.dmRowRight}>
                <View style={styles.dmBubbleRight}>
                  <Text style={{ fontSize: fs("body"), color: adminStyleColors.white, lineHeight: 21 }}>
                    {item.question}
                  </Text>
                </View>
                <Text style={[styles.dmTimeRight, { fontSize: fs("caption") }]}>
                  {item.createdAt}
                </Text>
              </View>

              <View style={styles.dmRowLeft}>
                <View style={styles.dmAvatarSm}>
                  <Text style={styles.dmAvatarText}>OP</Text>
                </View>
                <View style={{ flex: 1, maxWidth: "84%", gap: 5 }}>
                  <View style={styles.dmBubbleLeft}>
                    <Text style={{ fontSize: fs("body"), color: adminStyleColors.navy, lineHeight: 21 }}>
                      {item.answer}
                    </Text>
                    {item.sourceArticle ? (
                      <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle, marginTop: 6 }}>
                        Source: {item.sourceArticle}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.dmReactions}>
                    <Pressable
                      onPress={() => void handleRate(item.id, "helpful")}
                      style={[
                        styles.dmReactPill,
                        item.rating === "helpful" && styles.dmReactPillActive,
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: fs("caption"),
                          fontWeight: "600",
                          color: item.rating === "helpful" ? adminStyleColors.teal : adminStyleColors.subtle,
                        }}
                      >
                        Helpful{item.rating === "helpful" ? " ✓" : ""}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void handleRate(item.id, "not_helpful")}
                      style={[
                        styles.dmReactPill,
                        item.rating === "not_helpful" && styles.dmReactPillWarn,
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: fs("caption"),
                          fontWeight: "600",
                          color: item.rating === "not_helpful" ? adminStyleColors.rust : adminStyleColors.subtle,
                        }}
                      >
                        Not helpful
                      </Text>
                    </Pressable>
                    {isLatest && !activeSupport && !item.escalated ? (
                      <Pressable
                        onPress={() => {
                          setEscalateSummary(`I need more help with: ${item.question}`);
                          setEscalateOpen(true);
                        }}
                        style={styles.dmReactHuman}
                      >
                        <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.rust }}>
                          Talk to human
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            </React.Fragment>
          );
        })}

        {/* Active CEDA Support Live Thread inside the same DM stream */}
        {activeSupport ? (
          <View style={{ gap: 10, marginTop: 4 }}>
            <View
              style={[
                styles.dmQueueBanner,
                officerAssigned && styles.dmQueueConnected,
              ]}
            >
              <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.navy }}>
                {officerAssigned
                  ? `Connected to ${activeSupport.owner} (${activeSupport.id})`
                  : `You are in the CEDA Support queue (${activeSupport.id})`}
              </Text>
              <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle, marginTop: 2 }}>
                {officerAssigned
                  ? "Replies from CEDA Support appear directly below."
                  : "A Support Officer will reply directly in this chat."}
              </Text>
            </View>
            {(activeSupport.thread || []).map((msg, idx) => {
              const mine = msg.role === "innovator";
              if (mine) {
                return (
                  <View key={`${activeSupport.id}-msg-${idx}`} style={styles.dmRowRight}>
                    <View style={styles.dmBubbleRight}>
                      <Text style={{ fontSize: fs("body"), color: adminStyleColors.white, lineHeight: 21 }}>
                        {msg.body}
                      </Text>
                    </View>
                    {msg.at ? (
                      <Text style={[styles.dmTimeRight, { fontSize: fs("caption") }]}>{msg.at}</Text>
                    ) : null}
                  </View>
                );
              }
              return (
                <View key={`${activeSupport.id}-msg-${idx}`} style={styles.dmRowLeft}>
                  <View style={[styles.dmAvatarSm, { backgroundColor: adminStyleColors.blue }]}>
                    <Text style={styles.dmAvatarText}>CS</Text>
                  </View>
                  <View style={{ flex: 1, maxWidth: "84%" }}>
                    <View style={styles.dmBubbleLeft}>
                      <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.blue, marginBottom: 2 }}>
                        {msg.sender || "CEDA Support"}
                      </Text>
                      <Text style={{ fontSize: fs("body"), color: adminStyleColors.navy, lineHeight: 21 }}>
                        {msg.body}
                      </Text>
                      {msg.at ? (
                        <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle, marginTop: 4 }}>
                          {msg.at}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Optimistic Pending DM Turn while sending */}
        {pendingPrompt ? (
          <>
            <View style={styles.dmRowRight}>
              <View style={[styles.dmBubbleRight, { opacity: 0.92 }]}>
                <Text style={{ fontSize: fs("body"), color: adminStyleColors.white, lineHeight: 21 }}>
                  {pendingPrompt}
                </Text>
              </View>
            </View>
            {!activeSupport ? (
              <View style={styles.dmRowLeft}>
                <View style={styles.dmAvatarSm}>
                  <Text style={styles.dmAvatarText}>OP</Text>
                </View>
                <View style={styles.dmBubbleLeft}>
                  <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, fontStyle: "italic" }}>
                    Optimus Prime is typing…
                  </Text>
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      {/* Inline Human Support Escalation Sheet */}
      {escalateOpen && !activeSupport ? (
        <View style={styles.dmEscalateBar}>
          <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.navy }}>
            Connect to a CEDA Support Officer
          </Text>
          <FrostedInput
            multiline
            value={escalateSummary}
            onChangeText={setEscalateSummary}
            placeholder="What do you need help with?"
            maxLength={1000}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <ActionButton
              label="Cancel"
              variant="secondary"
              compact
              onPress={() => setEscalateOpen(false)}
            />
            <ActionButton
              label="Join support queue"
              loading={escalateBusy}
              compact
              onPress={() => void handleEscalate(visibleHistory[0]?.id || null, escalateSummary)}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : null}

      {errorNote ? (
        <View style={styles.dmErrorStrip}>
          <Text style={{ fontSize: fs("caption"), color: adminStyleColors.rust, fontWeight: "600" }}>
            {errorNote}
          </Text>
        </View>
      ) : null}

      {/* Sticky Bottom DM Message Composer */}
      <View style={styles.dmComposerBar}>
        {!activeSupport ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Request human CEDA Support"
            onPress={() => {
              if (!escalateSummary && visibleHistory[0]) {
                setEscalateSummary(`I need more help with: ${visibleHistory[0].question}`);
              }
              setEscalateOpen((v) => !v);
            }}
            style={styles.dmSupportCircle}
          >
            <InnovatorIcon name="support" color={adminStyleColors.rust} size={18} />
          </Pressable>
        ) : null}
        <View style={styles.dmInputPill}>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder={activeSupport ? "Message CEDA Support…" : "Message Optimus Prime…"}
            placeholderTextColor={adminStyleColors.subtle}
            multiline
            maxLength={1000}
            style={[styles.dmTextInput, { fontSize: fs("body") }]}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          disabled={asking || question.trim().length < 1}
          onPress={() => void askQuestion(question, "general")}
          style={[
            styles.dmSendCircle,
            (!question.trim().length || asking) && { opacity: 0.45 },
          ]}
        >
          {asking ? (
            <ActivityIndicator size="small" color={adminStyleColors.white} />
          ) : (
            <Text style={{ color: adminStyleColors.white, fontSize: 18, fontWeight: "800", lineHeight: 20 }}>
              ↑
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export function OptimusDmModal({
  visible,
  onClose,
  token,
  fullName,
  history,
  supportRequests = [],
  initialQuestion,
  onHistoryUpdated,
  onRequestsUpdated,
}: {
  visible: boolean;
  onClose: () => void;
  token: string;
  fullName?: string;
  history: OptimusInteraction[];
  supportRequests?: SupportRequestItem[];
  initialQuestion?: { prompt: string; topic: string } | null;
  onHistoryUpdated: (items: OptimusInteraction[]) => void;
  onRequestsUpdated: (requests: SupportRequestItem[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const { reducedMotion } = useInnovatorA11y();
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "slide"}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <FrostedModalBackdrop>
        <View style={styles.dmModalOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Optimus chat"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.dmModalKeyboardWrap}
          >
            <View
              accessibilityViewIsModal
              style={[
                styles.dmModalSheet,
                { paddingBottom: Math.max(insets.bottom, 10) },
              ]}
            >
              <FrostedSurface variant="sheet" borderRadius={28} />
              <OptimusAssistantContent
                token={token}
                fullName={fullName}
                history={history}
                supportRequests={supportRequests}
                initialQuestion={initialQuestion}
                onHistoryUpdated={onHistoryUpdated}
                onRequestsUpdated={onRequestsUpdated}
                onClose={onClose}
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </FrostedModalBackdrop>
    </Modal>
  );
}

export function InnovatorOptimusScreen({
  token,
  fullName,
  history,
  supportRequests = [],
  initialQuestion,
  onHistoryUpdated,
  onEscalated,
}: {
  token: string;
  fullName?: string;
  history: OptimusInteraction[];
  supportRequests?: SupportRequestItem[];
  initialQuestion?: { prompt: string; topic: string } | null;
  onHistoryUpdated: (items: OptimusInteraction[]) => void;
  onEscalated: (requests: SupportRequestItem[]) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, paddingBottom: Math.max(insets.bottom, 4) }}
    >
      <View style={styles.dmScreenShell}>
        <OptimusAssistantContent
          token={token}
          fullName={fullName}
          history={history}
          supportRequests={supportRequests}
          initialQuestion={initialQuestion}
          onHistoryUpdated={onHistoryUpdated}
          onRequestsUpdated={onEscalated}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

export function InnovatorSupportScreen({
  token,
  faqs,
  applications,
  supportRequests,
  onRequestsUpdated,
}: {
  token: string;
  faqs: FaqArticle[];
  applications: InnovatorApplication[];
  supportRequests: SupportRequestItem[];
  onRequestsUpdated: (items: SupportRequestItem[]) => void;
}) {
  const { fs } = useInnovatorA11y();
  const [segment, setSegment] = useState<"faqs" | "tickets" | "new">("faqs");
  const [faqQuery, setFaqQuery] = useState("");
  const [kind, setKind] = useState<"Support" | "Bug" | "Feedback">("Support");
  const [appRef, setAppRef] = useState("");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [steps, setSteps] = useState("");
  const [creating, setCreating] = useState(false);
  const [createFeedback, setCreateFeedback] = useState<string | null>(null);

  const [activeTicket, setActiveTicket] = useState<SupportRequestItem | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const meta = MORE_SUBSCREEN_META.support;

  const filteredFaqs = useMemo(() => {
    const q = faqQuery.trim().toLowerCase();
    return faqs.filter(
      (f) => !q || [f.title, f.summary, f.body].some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [faqs, faqQuery]);

  async function handleCreateTicket() {
    if (title.trim().length < 3 || detail.trim().length < 10) {
      setCreateFeedback("Provide a subject (3+ chars) and details (10+ chars).");
      return;
    }
    setCreating(true);
    setCreateFeedback(null);
    try {
      const next = await createSupportRequest(token, {
        kind,
        title: title.trim(),
        detail: detail.trim(),
        applicationRef: appRef || null,
        steps: steps.trim() || "Not supplied",
      });
      onRequestsUpdated(next);
      setTitle("");
      setDetail("");
      setSteps("");
      setCreateFeedback("Support request created cleanly.");
      setSegment("tickets");
    } catch (err) {
      setCreateFeedback(err instanceof Error ? err.message : "Could not submit ticket.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSendReply() {
    if (!activeTicket || replyText.trim().length < 2) return;
    setReplyBusy(true);
    try {
      const next = await replySupportRequest(token, activeTicket.id, replyText.trim());
      onRequestsUpdated(next);
      setActiveTicket(next.find((t) => t.id === activeTicket.id) || null);
      setReplyText("");
    } finally {
      setReplyBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.subScrollContent} keyboardShouldPersistTaps="handled">
        <SubscreenHero
          icon={meta.icon}
          color={meta.color}
          tint={meta.tint}
          eyebrow={meta.category}
          title={meta.title}
          badge={`${supportRequests.length} tickets`}
          summary={meta.summary}
        />

        {/* Admin PeriodControl style segmented bar */}
        <View style={styles.segmentRail}>
          <FrostedSurface variant="bar" borderRadius={18} />
          {[
            { key: "faqs", label: "Help articles" },
            { key: "tickets", label: `My requests (${supportRequests.length})` },
            { key: "new", label: "New request" },
          ].map((item) => {
            const active = segment === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setSegment(item.key as "faqs" | "tickets" | "new")}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
              >
                <Text
                  style={{
                    fontSize: fs("caption"),
                    fontWeight: active ? "700" : "500",
                    color: active ? adminStyleColors.navy : adminStyleColors.subtle,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {segment === "faqs" ? (
          <>
            <FrostedSearchPill
              value={faqQuery}
              onChangeText={setFaqQuery}
              placeholder="Search help articles & FAQs..."
            />
            <GlassCard style={{ paddingVertical: 8 }}>
              {filteredFaqs.length ? (
                filteredFaqs.map((f, idx) => (
                  <View
                    key={f.id || idx}
                    style={[styles.faqRow, idx === filteredFaqs.length - 1 && { borderBottomWidth: 0 }]}
                  >
                    <Text style={{ fontSize: fs("body"), fontWeight: "700", color: adminStyleColors.navy }}>
                      {f.title}
                    </Text>
                    <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, marginTop: 4, lineHeight: 20 }}>
                      {f.body || f.summary}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, paddingVertical: 14 }}>
                  No articles matched your search.
                </Text>
              )}
            </GlassCard>
          </>
        ) : null}

        {segment === "tickets" ? (
          <GlassCard style={{ paddingVertical: 0 }}>
            {supportRequests.length ? (
              supportRequests.map((req, idx) => {
                const app = statusAppearance(req.state);
                return (
                  <IconRow
                    key={req.id}
                    title={`${req.id} — ${req.title}`}
                    detail={`${req.owner} · ${req.reportedAt}`}
                    icon={req.kind === "Bug" ? "alert" : "support"}
                    color={app.color}
                    tint={app.tint}
                    badge={req.state}
                    last={idx === supportRequests.length - 1}
                    onPress={() => setActiveTicket(req)}
                  />
                );
              })
            ) : (
              <View style={{ paddingVertical: 24, alignItems: "center", gap: 10 }}>
                <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle }}>
                  No support requests created yet.
                </Text>
                <ActionButton label="Create support request" compact onPress={() => setSegment("new")} />
              </View>
            )}
          </GlassCard>
        ) : null}

        {segment === "new" ? (
          <GlassCard>
            <SectionHeader eyebrow="NEW REQUEST" title="Create support request or report issue" />
            <FormField label="Category">
              <ChoiceChips
                options={["Support", "Bug", "Feedback"]}
                selected={kind}
                onSelect={(v) => setKind(v as "Support" | "Bug" | "Feedback")}
              />
            </FormField>
            {applications.length ? (
              <FormField label="Related application (optional)">
                <ChoiceChips
                  options={["None", ...applications.slice(0, 6).map((a) => a.reference)]}
                  selected={appRef || "None"}
                  onSelect={(v) => setAppRef(v === "None" ? "" : v)}
                />
              </FormField>
            ) : null}
            <FormField label="Subject">
              <FrostedInput
                value={title}
                onChangeText={setTitle}
                placeholder="Short summary of what happened"
                maxLength={200}
              />
            </FormField>
            <FormField label="Details (10+ characters)">
              <FrostedInput
                multiline
                value={detail}
                onChangeText={setDetail}
                placeholder="Describe clearly what help you need or what error occurred..."
                maxLength={2000}
              />
            </FormField>
            {kind === "Bug" ? (
              <FormField label="Steps to reproduce (optional)">
                <FrostedInput
                  value={steps}
                  onChangeText={setSteps}
                  placeholder="Screen or action that triggered the issue"
                />
              </FormField>
            ) : null}
            {createFeedback ? (
              <Text style={{ fontSize: fs("subbody"), fontWeight: "600", color: adminStyleColors.teal }}>
                {createFeedback}
              </Text>
            ) : null}
            <ActionButton
              label="Submit support request"
              loading={creating}
              onPress={() => void handleCreateTicket()}
            />
          </GlassCard>
        ) : null}
      </ScrollView>

      <FlushSheetModal
        visible={Boolean(activeTicket)}
        eyebrow={activeTicket ? `${activeTicket.id} · ${activeTicket.state}` : "TICKET"}
        title={activeTicket?.title || "Support ticket"}
        onClose={() => setActiveTicket(null)}
      >
        {activeTicket ? (
          <View style={{ gap: 12 }}>
            <FactRow label="Assigned officer" value={activeTicket.owner} />
            <FactRow label="Priority" value={activeTicket.priority} last={!activeTicket.applicationRef} />
            {activeTicket.applicationRef ? <FactRow label="Application" value={activeTicket.applicationRef} last /> : null}
            <View style={{ gap: 8 }}>
              {(activeTicket.thread || []).map((msg, idx) => (
                <View key={idx} style={styles.threadBox}>
                  <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.blue }}>
                    {msg.sender} · {msg.at || ""}
                  </Text>
                  <Text style={{ fontSize: fs("body"), color: adminStyleColors.navy, marginTop: 4 }}>{msg.body}</Text>
                </View>
              ))}
            </View>
            <FormField label="Reply to Support Officer">
              <FrostedInput
                multiline
                value={replyText}
                onChangeText={setReplyText}
                placeholder="Write a follow-up note..."
              />
            </FormField>
            <ActionButton label="Send reply" loading={replyBusy} onPress={() => void handleSendReply()} />
          </View>
        ) : null}
      </FlushSheetModal>
    </View>
  );
}

const SETTINGS_TABS = [
  { key: "personal", label: "Personal" },
  { key: "company", label: "Company" },
  { key: "security", label: "Security" },
  { key: "notifications", label: "Notifications" },
  { key: "accessibility", label: "Accessibility" },
  { key: "privacy", label: "Privacy" },
  { key: "sessions", label: "Sessions" },
] as const;

export function InnovatorSettingsScreen({
  token,
  profile,
  onProfileUpdated,
  onSignOut,
}: {
  token: string;
  profile: InnovatorProfile;
  onProfileUpdated: (next: InnovatorProfile) => void;
  onSignOut: () => void;
}) {
  const { fs } = useInnovatorA11y();
  const [tab, setTab] = useState<string>("personal");

  const [fullName, setFullName] = useState(profile.fullName || "");
  const [phone, setPhone] = useState(profile.phone || "");
  const [district, setDistrict] = useState(profile.district || "Gaborone");
  const [expertise, setExpertise] = useState(profile.expertise || "");

  const [companyName, setCompanyName] = useState(profile.companyName || "");
  const [companyRegNumber, setCompanyRegNumber] = useState(profile.companyRegNumber || "");
  const [companySector, setCompanySector] = useState(profile.companySector || "");
  const [companyRole, setCompanyRole] = useState(profile.companyRole || "");

  const prefs = profile.preferences || {};
  const [notifyStatus, setNotifyStatus] = useState(prefs.notifyStatus !== false);
  const [notifyClarifications, setNotifyClarifications] = useState(prefs.notifyClarifications !== false);
  const [notifyMessages, setNotifyMessages] = useState(prefs.notifyMessages !== false);

  const [textSize, setTextSize] = useState<"standard" | "large" | "xlarge">(
    (prefs.textSize as "standard" | "large" | "xlarge") || "standard"
  );
  const [highContrast, setHighContrast] = useState(Boolean(prefs.highContrast));
  const [reducedMotion, setReducedMotion] = useState(Boolean(prefs.reducedMotion));

  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const meta = MORE_SUBSCREEN_META.settings;

  async function saveSettings(overridePrefs?: Partial<InnovatorPreferences>) {
    setSaving(true);
    setStatusMessage(null);
    try {
      const nextPrefs: InnovatorPreferences = {
        ...prefs,
        notifyStatus,
        notifyClarifications,
        notifyMessages,
        textSize,
        highContrast,
        reducedMotion,
        ...overridePrefs,
      };
      const updated = await updateInnovatorProfile(token, {
        fullName: fullName.trim() || profile.fullName || "Innovator",
        phone: phone.trim(),
        district: district.trim(),
        expertise: expertise.trim(),
        companyName: companyName.trim(),
        companyRegNumber: companyRegNumber.trim(),
        companySector: companySector.trim(),
        companyRole: companyRole.trim(),
        preferences: nextPrefs,
      });
      onProfileUpdated(updated);
      setStatusMessage("Account and settings saved.");
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.subScrollContent} keyboardShouldPersistTaps="handled">
      <SubscreenHero
        icon={meta.icon}
        color={meta.color}
        tint={meta.tint}
        eyebrow={meta.category}
        title={meta.title}
        badge={meta.badge}
        summary={meta.summary}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
        {SETTINGS_TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => {
                setTab(t.key);
                setStatusMessage(null);
              }}
              style={[styles.tabPill, active ? styles.tabPillActive : null]}
            >
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

      {tab === "personal" ? (
        <GlassCard>
          <FormField label="Full name">
            <FrostedInput value={fullName} onChangeText={setFullName} maxLength={120} />
          </FormField>
          <FormField label="Email address">
            <FrostedInput value={profile.email} editable={false} style={{ opacity: 0.72 }} />
          </FormField>
          <FormField label="Phone number">
            <FrostedInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={40} />
          </FormField>
          <FormField label="Home district">
            <ChoiceChips options={BOTSWANA_DISTRICTS} selected={district} onSelect={setDistrict} />
          </FormField>
          <FormField label="Primary expertise / role">
            <FrostedInput value={expertise} onChangeText={setExpertise} maxLength={160} />
          </FormField>
          {statusMessage ? (
            <Text style={{ fontSize: fs("subbody"), fontWeight: "600", color: adminStyleColors.teal }}>
              {statusMessage}
            </Text>
          ) : null}
          <ActionButton label="Save personal details" loading={saving} onPress={() => void saveSettings()} />
        </GlassCard>
      ) : null}

      {tab === "company" ? (
        <GlassCard>
          <FormField label="Registered company name">
            <FrostedInput value={companyName} onChangeText={setCompanyName} maxLength={160} />
          </FormField>
          <FormField label="CIPA registration number">
            <FrostedInput value={companyRegNumber} onChangeText={setCompanyRegNumber} maxLength={80} />
          </FormField>
          <FormField label="Company sector">
            <FrostedInput value={companySector} onChangeText={setCompanySector} maxLength={100} />
          </FormField>
          <FormField label="Your role / authority">
            <FrostedInput value={companyRole} onChangeText={setCompanyRole} maxLength={100} />
          </FormField>
          {statusMessage ? (
            <Text style={{ fontSize: fs("subbody"), fontWeight: "600", color: adminStyleColors.teal }}>
              {statusMessage}
            </Text>
          ) : null}
          <ActionButton label="Save company defaults" loading={saving} onPress={() => void saveSettings()} />
        </GlassCard>
      ) : null}

      {tab === "security" ? (
        <GlassCard>
          <SectionHeader
            eyebrow="PASSWORD & ACCESS"
            title="Account password reset"
            subtitle="Password updates verify ownership via a reset link sent to your registered email address."
          />
          <FactRow label="Signed in email" value={profile.email} last />
          {statusMessage ? (
            <Text style={{ fontSize: fs("subbody"), fontWeight: "600", color: adminStyleColors.teal }}>
              {statusMessage}
            </Text>
          ) : null}
          <ActionButton
            label="Send password reset email"
            loading={saving}
            onPress={async () => {
              setSaving(true);
              try {
                await sendPasswordResetEmail(profile.email);
                setStatusMessage(`Password reset link sent to ${profile.email}.`);
              } catch (err) {
                setStatusMessage(err instanceof Error ? err.message : "Could not send email.");
              } finally {
                setSaving(false);
              }
            }}
          />
        </GlassCard>
      ) : null}

      {tab === "notifications" ? (
        <GlassCard>
          <SwitchRow
            label="Application status updates"
            detail="Notify immediately when assessment stages move forward."
            value={notifyStatus}
            onValueChange={setNotifyStatus}
          />
          <SwitchRow
            label="Clarifications & deadlines"
            detail="Highlight requested changes and response deadlines."
            value={notifyClarifications}
            onValueChange={setNotifyClarifications}
          />
          <SwitchRow
            label="New messages"
            detail="Alert when CEDA staff or Support Officers reply."
            value={notifyMessages}
            onValueChange={setNotifyMessages}
            last
          />
          {statusMessage ? (
            <Text style={{ fontSize: fs("subbody"), fontWeight: "600", color: adminStyleColors.teal }}>
              {statusMessage}
            </Text>
          ) : null}
          <ActionButton label="Save notification settings" loading={saving} onPress={() => void saveSettings()} />
        </GlassCard>
      ) : null}

      {tab === "accessibility" ? (
        <GlassCard>
          <FormField label="Text size">
            <ChoiceChips
              options={["standard", "large", "xlarge"]}
              selected={textSize}
              onSelect={(v) => setTextSize(v as "standard" | "large" | "xlarge")}
            />
          </FormField>
          <SwitchRow
            label="Higher contrast borders"
            detail="Sharper borders around cards, inputs, and buttons."
            value={highContrast}
            onValueChange={setHighContrast}
          />
          <SwitchRow
            label="Reduced motion"
            detail="Disables modal slide animations and spring celebrations."
            value={reducedMotion}
            onValueChange={setReducedMotion}
            last
          />
          <View style={styles.guardrailBox}>
            <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.navy }}>
              Screen reader & keyboard navigation guidance
            </Text>
            <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle, marginTop: 4, lineHeight: 18 }}>
              • Swipe left/right with TalkBack or VoiceOver across form controls, tabs, and action pills.
            </Text>
            <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle, marginTop: 2, lineHeight: 18 }}>
              • Hardware Back and Escape return cleanly from sub-screens and modals without losing draft progress.
            </Text>
          </View>
          {statusMessage ? (
            <Text style={{ fontSize: fs("subbody"), fontWeight: "600", color: adminStyleColors.teal }}>
              {statusMessage}
            </Text>
          ) : null}
          <ActionButton label="Apply & save accessibility" loading={saving} onPress={() => void saveSettings()} />
        </GlassCard>
      ) : null}

      {tab === "privacy" ? (
        <GlassCard>
          <SectionHeader eyebrow="PRIVACY PROTECTIONS" title="How your data stays protected" />
          <FactRow
            label="Private drafts"
            value="Unsubmitted drafts stay strictly visible only to your signed-in account."
          />
          <FactRow
            label="Protected storage"
            value="Uploaded evidence stays in an encrypted bucket and opens with 120-second signed links."
          />
          <FactRow
            label="Assessment isolation"
            value="Internal reviewer identities, scores, and administrative notes never cross to applicant views."
            last
          />
        </GlassCard>
      ) : null}

      {tab === "sessions" ? (
        <GlassCard>
          <SectionHeader
            eyebrow="ACTIVE SESSIONS"
            title="Authenticated mobile session"
            subtitle={`Signed in as ${profile.email}. End other sessions if you signed in on a shared workstation.`}
          />
          {statusMessage ? (
            <Text style={{ fontSize: fs("subbody"), fontWeight: "600", color: adminStyleColors.teal }}>
              {statusMessage}
            </Text>
          ) : null}
          <ActionButton
            label="Log out other devices"
            variant="secondary"
            loading={saving}
            onPress={async () => {
              setSaving(true);
              try {
                await signOutOtherDevices(token);
                setStatusMessage("Signed out other active sessions.");
              } catch (err) {
                setStatusMessage(err instanceof Error ? err.message : "Action failed.");
              } finally {
                setSaving(false);
              }
            }}
          />
          <ActionButton label="Log out current session" onPress={onSignOut} />
        </GlassCard>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 18,
    gap: 16,
    paddingBottom: 112,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  subScrollContent: {
    padding: 18,
    gap: 16,
    paddingBottom: 44,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  eyebrow: {
    color: adminStyleColors.subtle,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  profileCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.92)",
    padding: 18,
    gap: 12,
    overflow: "hidden",
  },
  profileTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  profileAvatar: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#FBEDE8",
    borderWidth: 1,
    borderColor: "#F3D5CB",
    alignItems: "center",
    justifyContent: "center",
  },
  profileActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingTop: 4 },
  profileQuickButton: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: buttonCornerRadius,
    backgroundColor: "#E4F4F0",
  },
  profileSignOutButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: buttonCornerRadius,
    backgroundColor: "rgba(243,239,234,0.95)",
  },
  sectionBlock: { gap: 8 },
  sectionHeaderLabel: {
    fontWeight: "700",
    letterSpacing: 1.1,
    color: adminStyleColors.subtle,
    paddingHorizontal: 4,
  },
  guardrailBox: {
    padding: 13,
    borderRadius: 16,
    backgroundColor: "#FCF4E4",
    borderWidth: 1,
    borderColor: "rgba(148,112,45,0.22)",
  },
  promptChip: {
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "rgba(255,250,244,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
  },
  sourceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  sourcePill: {
    backgroundColor: "#EAF1FC",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },
  segmentRail: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.88)",
    overflow: "hidden",
  },
  segmentItem: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    paddingHorizontal: 6,
  },
  segmentItemActive: {
    backgroundColor: "#fffaf4",
    shadowColor: "#241C19",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  faqRow: {
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: adminStyleColors.line,
  },
  threadBox: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(247,242,235,0.7)",
    borderWidth: 1,
    borderColor: adminStyleColors.line,
  },
  tabRow: { gap: 7, paddingVertical: 2 },
  tabPill: {
    minHeight: 40,
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "rgba(255,250,244,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
  },
  tabPillActive: {
    backgroundColor: adminStyleColors.navy,
    borderColor: adminStyleColors.navy,
  },
  escalateInlineBox: {
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,250,244,0.88)",
    borderWidth: 1,
    borderColor: adminStyleColors.line,
  },
  dmModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  dmModalKeyboardWrap: {
    width: "100%",
    height: "88%",
  },
  dmModalSheet: {
    flex: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.92)",
    overflow: "hidden",
  },
  dmScreenShell: {
    flex: 1,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
    overflow: "hidden",
  },
  dmContainer: {
    flex: 1,
  },
  dmHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: adminStyleColors.rust,
  },
  dmIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    minWidth: 0,
  },
  dmAvatarLg: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: adminStyleColors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  dmOnlineDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: "#42D17A",
    borderWidth: 2,
    borderColor: adminStyleColors.rust,
  },
  dmHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dmClearPill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  dmCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  dmFeed: {
    flex: 1,
  },
  dmFeedContent: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 14,
  },
  dmSystemNote: {
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: "rgba(255,250,244,0.85)",
    borderWidth: 1,
    borderColor: adminStyleColors.line,
  },
  dmRowLeft: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  dmRowRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  dmAvatarSm: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: adminStyleColors.purple,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  dmAvatarText: {
    color: adminStyleColors.white,
    fontSize: 10,
    fontWeight: "800",
  },
  dmBubbleLeft: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "#E5DDD3",
  },
  dmBubbleRight: {
    maxWidth: "82%",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 18,
    borderBottomRightRadius: 5,
    backgroundColor: adminStyleColors.rust,
  },
  dmTimeRight: {
    color: adminStyleColors.subtle,
    paddingRight: 4,
  },
  dmTopicWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 10,
  },
  dmQuickChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "#FBEDE8",
    borderWidth: 1,
    borderColor: "rgba(154,61,43,0.22)",
  },
  dmReactions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginLeft: 2,
  },
  dmReactPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,250,244,0.88)",
    borderWidth: 1,
    borderColor: adminStyleColors.line,
  },
  dmReactPillActive: {
    backgroundColor: "#E4F4F0",
    borderColor: "rgba(35,109,97,0.3)",
  },
  dmReactPillWarn: {
    backgroundColor: "#FBEDE8",
    borderColor: "rgba(154,61,43,0.3)",
  },
  dmReactHuman: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#FBEDE8",
    borderWidth: 1,
    borderColor: "rgba(154,61,43,0.24)",
  },
  dmQueueBanner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#FFF8E8",
    borderWidth: 1,
    borderColor: "#E6C77B",
  },
  dmQueueConnected: {
    backgroundColor: "#E4F4F0",
    borderColor: "rgba(35,109,97,0.28)",
  },
  dmEscalateBar: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: adminStyleColors.line,
    backgroundColor: "rgba(255,250,244,0.96)",
  },
  dmErrorStrip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "#FBEDE8",
  },
  dmComposerBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: adminStyleColors.line,
    backgroundColor: "rgba(255,250,244,0.95)",
  },
  dmSupportCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FBEDE8",
    borderWidth: 1,
    borderColor: "rgba(154,61,43,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  dmInputPill: {
    flex: 1,
    minHeight: 42,
    maxHeight: 112,
    borderRadius: 21,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    backgroundColor: adminStyleColors.white,
    borderWidth: 1,
    borderColor: "#DFD2C9",
    justifyContent: "center",
  },
  dmTextInput: {
    color: adminStyleColors.navy,
    padding: 0,
    margin: 0,
  },
  dmSendCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: adminStyleColors.rust,
    alignItems: "center",
    justifyContent: "center",
  },
});
