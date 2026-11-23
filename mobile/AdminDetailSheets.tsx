import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import {
  conferAdminAward,
  createAdminEvidenceSignedUrl,
  dispatchAdminNotifications,
  interveneAdminApplicationStatus,
  replyAdminApplicationMessage,
  retryAdminNotification,
  reviseAdminApplication,
  saveAdminNotification,
  saveAdminSector,
  sendAdminTestEmail,
  sendAdminTestPush,
  updateAdminMatter,
  type Account,
  type AdminApplication,
  type AdminMatter,
  type AdminNotificationsOverview,
  type AdminSector,
} from "./auth";
import { fontSizes } from "./theme";

const c = {
  navy: "#192C40",
  rust: "#9A3D2B",
  teal: "#278477",
  blue: "#28599B",
  muted: "#4A5564",
  subtle: "#4A5564",
  line: "#E5DDD3",
  card: "#FFFFFF",
  soft: "#F7F2EB",
};

const APPLICATION_STATUSES = ["Submitted", "In review", "Changes requested", "Approved", "Awarded", "Rejected"] as const;
const AWARD_CATEGORIES = [
  "Innovation Recognition & Support",
  "Seed Innovation Grant",
  "Commercialization & Incubation",
  "Export Readiness Award",
] as const;
const CLARIFICATION_SECTIONS = [
  { key: "applicant", label: "Applicant profile" },
  { key: "problem", label: "Problem & solution" },
  { key: "impact", label: "Impact & Botswana fit" },
  { key: "feasibility", label: "Feasibility & prototype" },
  { key: "supplementary", label: "Financial & support" },
  { key: "general", label: "General submission" },
] as const;

const MATTER_STATES = ["Open", "Investigating", "Waiting", "Resolved"] as const;
const SECTOR_STATUSES = ["draft", "published", "archived"] as const;
const NOTIFICATION_KINDS = ["Announcement", "Email template", "Push template"] as const;

function SheetCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      {title ? <Text accessibilityRole="header" style={s.heading}>{title}</Text> : null}
      {children}
    </View>
  );
}

function SheetFact({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.fact, last && { borderBottomWidth: 0 }]}>
      <Text style={s.factLabel}>{label}</Text>
      <Text style={s.factValue}>{value}</Text>
    </View>
  );
}

function PillGroup<T extends string>({
  options,
  selected,
  onSelect,
  formatLabel,
}: {
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  formatLabel?: (value: T) => string;
}) {
  return (
    <View style={s.pills}>
      {options.map(option => {
        const active = option === selected;
        return (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onSelect(option)}
            style={[s.pill, active && s.pillActive]}
          >
            <Text style={[s.pillText, active && s.pillTextActive]}>{formatLabel ? formatLabel(option) : option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FormInput({
  label,
  value,
  onChangeText,
  multiline = false,
  placeholder,
  maxLength,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  maxLength?: number;
  editable?: boolean;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor="#8B929C"
        maxLength={maxLength}
        editable={editable}
        style={[s.input, multiline && { minHeight: 88, textAlignVertical: "top" }]}
      />
    </View>
  );
}

function ActionBtn({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.button, secondary && s.buttonSecondary, (disabled || pressed) && { opacity: 0.65 }]}
    >
      <Text style={[s.buttonText, secondary && { color: c.navy }]}>{title}</Text>
    </Pressable>
  );
}

function formatAnswerValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Confirmed" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  return String(value);
}

export function AdminCaseDetailModalContent({
  account,
  item,
  sectors,
  matters,
  onApplicationsUpdated,
  onOpenMatter,
}: {
  account: Account;
  item: AdminApplication;
  sectors: AdminSector[];
  matters: AdminMatter[];
  onApplicationsUpdated: (list: AdminApplication[]) => void;
  onOpenMatter: (matter: AdminMatter) => void;
}) {
  const [tab, setTab] = useState<"Overview" | "Evidence" | "Messages" | "History" | "Actions">("Overview");
  const [busy, setBusy] = useState(false);
  const [statusNote, setStatusNote] = useState("");
  const [errorNote, setErrorNote] = useState("");

  // Reply state
  const [replyThread, setReplyThread] = useState<"application" | "clarification">(
    item.status === "Changes requested" ? "clarification" : "application"
  );
  const [replyBody, setReplyBody] = useState("");

  // Revision state
  const [revTitle, setRevTitle] = useState(item.title);
  const [revApplicant, setRevApplicant] = useState(item.owner);
  const [revSector, setRevSector] = useState(item.sector);
  const [revSummary, setRevSummary] = useState(item.summary);
  const [revReason, setRevReason] = useState("");

  // Status intervention state
  const [newStatus, setNewStatus] = useState<string>(item.status);
  const [sectionKey, setSectionKey] = useState<string>("general");
  const [deadline, setDeadline] = useState("");
  const [outcomeFeedback, setOutcomeFeedback] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  // Award conferral state
  const existingAward = (item.awardData && typeof item.awardData === "object" ? item.awardData : {}) as Record<string, unknown>;
  const [awardTitle, setAwardTitle] = useState(
    String(existingAward.awardTitle || `CEDA Innovation Award: ${item.title}`)
  );
  const [awardCategory, setAwardCategory] = useState<string>(
    String(existingAward.awardCategory || "Innovation Recognition & Support")
  );
  const [awardAmount, setAwardAmount] = useState(String(existingAward.awardAmount || ""));
  const [awardSummary, setAwardSummary] = useState(
    String(
      existingAward.awardSummary ||
        "Selected after CEDA evaluation for official innovation award recognition and onboarding support."
    )
  );
  const [awardReason, setAwardReason] = useState("");
  const [awardConfirmed, setAwardConfirmed] = useState(false);

  useEffect(() => {
    const nextAward = (item.awardData && typeof item.awardData === "object" ? item.awardData : {}) as Record<string, unknown>;
    setRevTitle(item.title);
    setRevApplicant(item.owner);
    setRevSector(item.sector);
    setRevSummary(item.summary);
    setNewStatus(item.status);
    setConfirmed(false);
    setAwardTitle(String(nextAward.awardTitle || `CEDA Innovation Award: ${item.title}`));
    setAwardCategory(String(nextAward.awardCategory || "Innovation Recognition & Support"));
    setAwardAmount(String(nextAward.awardAmount || ""));
    setAwardSummary(
      String(
        nextAward.awardSummary ||
          "Selected after CEDA evaluation for official innovation award recognition and onboarding support."
      )
    );
    setAwardConfirmed(false);
  }, [item.id, item.version, item.status]);

  const relatedMatters = matters.filter(m => m.application === item.id);
  const documents = item.documents ?? [];
  const messages = item.messages ?? [];
  const history = item.history ?? [];
  const timeline = item.applicantTimeline ?? [];
  const formEntries = Object.entries(item.formData ?? {}).filter(
    ([, val]) => val !== undefined && val !== null && val !== "" && (!Array.isArray(val) || val.length > 0)
  );
  const sectorOptions = Array.from(
    new Set([item.sector, ...sectors.filter(sec => sec.status !== "archived").map(sec => sec.name)].filter(Boolean))
  );

  async function openEvidence(storagePath?: string | null, videoUrl?: string | null) {
    setErrorNote("");
    setStatusNote("");
    setBusy(true);
    try {
      if (videoUrl) {
        const parsed = new URL(videoUrl);
        if (parsed.protocol !== "https:") throw new Error("Only HTTPS video demonstration links can be opened.");
        await Linking.openURL(parsed.href);
        return;
      }
      if (storagePath) {
        const signed = await createAdminEvidenceSignedUrl(account, storagePath);
        await Linking.openURL(signed);
        return;
      }
      throw new Error("No storage path or HTTPS link is recorded for this evidence item.");
    } catch (error) {
      setErrorNote(error instanceof Error ? error.message : "Could not open attachment.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReply() {
    if (replyBody.trim().length < 2) {
      setErrorNote("Write a message of at least 2 characters before sending.");
      return;
    }
    setBusy(true);
    setErrorNote("");
    setStatusNote("");
    try {
      const updated = await replyAdminApplicationMessage(account, {
        app_ref: item.id,
        reply_body: replyBody.trim(),
        thread_kind: replyThread,
      });
      if (updated.length) onApplicationsUpdated(updated);
      setReplyBody("");
      setStatusNote("Reply sent to the innovator and logged in the audit trail.");
    } catch (error) {
      setErrorNote(error instanceof Error ? error.message : "Unable to send reply.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRevision() {
    if (revReason.trim().length < 5) {
      setErrorNote("Enter an audit reason of at least 5 characters before saving edits.");
      return;
    }
    if (revTitle.trim().length < 3 || revSummary.trim().length < 10) {
      setErrorNote("Enter a valid innovation title and summary.");
      return;
    }
    setBusy(true);
    setErrorNote("");
    setStatusNote("");
    try {
      const updated = await reviseAdminApplication(account, {
        app_ref: item.id,
        new_title: revTitle,
        new_applicant: revApplicant,
        new_sector: revSector,
        new_summary: revSummary,
        expected_version: item.version ?? 1,
        reason: revReason,
      });
      if (updated.length) onApplicationsUpdated(updated);
      setRevReason("");
      setStatusNote("Submission details updated (version incremented) and audited.");
    } catch (error) {
      setErrorNote(error instanceof Error ? error.message : "Could not save submission edits.");
    } finally {
      setBusy(false);
    }
  }

  async function submitStatusIntervention() {
    if (!confirmed) {
      setErrorNote("Confirm status intervention before saving.");
      return;
    }
    if (statusReason.trim().length < 5) {
      setErrorNote("Enter a reason of at least 5 characters for changing the application status.");
      return;
    }
    setBusy(true);
    setErrorNote("");
    setStatusNote("");
    try {
      const updated = await interveneAdminApplicationStatus(account, {
        app_ref: item.id,
        new_status: newStatus,
        expected_version: item.version ?? 1,
        confirmed,
        reason: statusReason,
        section_key: newStatus === "Changes requested" ? sectionKey : "general",
        deadline: newStatus === "Changes requested" && deadline.trim() ? deadline.trim() : null,
        outcome_feedback:
          newStatus === "Changes requested" || newStatus === "Approved" || newStatus === "Awarded" || newStatus === "Rejected"
            ? outcomeFeedback.trim() || statusReason.trim()
            : null,
      });
      if (updated.length) onApplicationsUpdated(updated);
      setStatusReason("");
      setOutcomeFeedback("");
      setConfirmed(false);
      setStatusNote(`Status updated to ${newStatus}. Applicant timeline & notifications synchronized.`);
    } catch (error) {
      setErrorNote(error instanceof Error ? error.message : "Status update failed. Refresh and verify version.");
    } finally {
      setBusy(false);
    }
  }

  async function submitAwardConferral() {
    if (!awardConfirmed) {
      setErrorNote("Confirm award conferral before saving.");
      return;
    }
    if (awardTitle.trim().length < 3 || awardReason.trim().length < 5) {
      setErrorNote("Enter an award title (3+ chars) and an audit reason (5+ chars).");
      return;
    }
    setBusy(true);
    setErrorNote("");
    setStatusNote("");
    try {
      const updated = await conferAdminAward(account, {
        app_ref: item.id,
        expected_version: item.version ?? 1,
        confirmed: awardConfirmed,
        award_title: awardTitle.trim(),
        award_category: awardCategory,
        award_amount: awardAmount.trim() || null,
        award_summary: awardSummary.trim() || null,
        reason: awardReason.trim(),
      });
      if (updated.length) onApplicationsUpdated(updated);
      setAwardReason("");
      setAwardConfirmed(false);
      setStatusNote("Official Award stage conferred. Timeline, alerts, and Committee showcase updated.");
    } catch (error) {
      setErrorNote(error instanceof Error ? error.message : "Award conferral failed. Refresh and verify version.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={s.tabsRow}>
        {(["Overview", "Evidence", "Messages", "History", "Actions"] as const).map(label => (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === label }}
            onPress={() => {
              setTab(label);
              setErrorNote("");
            }}
            style={[s.tabChip, tab === label && s.tabChipActive]}
          >
            <Text style={[s.tabChipText, tab === label && s.tabChipTextActive]}>
              {label === "Evidence" ? `Evidence (${documents.length})` : label === "Messages" ? `Messages (${messages.length})` : label}
            </Text>
          </Pressable>
        ))}
      </View>

      {!!errorNote && <Text accessibilityRole="alert" style={s.errorText}>{errorNote}</Text>}
      {!!statusNote && <Text accessibilityLiveRegion="polite" style={s.successText}>{statusNote}</Text>}

      {tab === "Overview" && (
        <>
          <SheetCard title={item.title}>
            <Text style={s.note}>{item.summary || "No summary provided."}</Text>
            <SheetFact label="Reference" value={item.id} />
            <SheetFact label="Status" value={item.status} />
            <SheetFact label="Applicant" value={item.owner} />
            <SheetFact label="Applicant type" value={item.applicantType || "Not specified"} />
            <SheetFact label="Receipt code" value={item.receiptCode || "Pending submission"} />
            <SheetFact label="Sector" value={item.sector} />
            <SheetFact label="Version" value={`v${item.version ?? 1}${item.reassessmentRequired ? " · Reassessment flagged" : ""}`} last={!item.withdrawnReason && !(item.status === "Awarded" && item.awardData)} />
            {item.withdrawnReason ? <SheetFact label="Withdrawal reason" value={item.withdrawnReason} last={!(item.status === "Awarded" && item.awardData)} /> : null}
            {item.status === "Awarded" && item.awardData ? (
              <SheetFact
                label="Conferred award"
                value={`${String(item.awardData.awardTitle || "CEDA Innovation Award")} (${String(item.awardData.awardCategory || "Recognition")}${item.awardData.awardAmount ? ` · ${String(item.awardData.awardAmount)}` : ""})`}
                last
              />
            ) : null}
          </SheetCard>

          {formEntries.length > 0 && (
            <SheetCard title="Full application answers">
              {formEntries.map(([key, value], idx) => (
                <SheetFact
                  key={key}
                  label={key.replace(/([A-Z])/g, " $1").replace(/^./, ch => ch.toUpperCase())}
                  value={formatAnswerValue(value)}
                  last={idx === formEntries.length - 1}
                />
              ))}
            </SheetCard>
          )}

          {relatedMatters.length > 0 && (
            <SheetCard title={`Related follow-up matters (${relatedMatters.length})`}>
              {relatedMatters.map(m => (
                <Pressable key={m.id} accessibilityRole="button" onPress={() => onOpenMatter(m)} style={s.listRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.rowTitle}>{m.id} · {m.title}</Text>
                    <Text style={s.note}>{m.kind} · {m.priority} · {m.state}</Text>
                  </View>
                  <Text style={s.linkText}>Open ›</Text>
                </Pressable>
              ))}
            </SheetCard>
          )}
        </>
      )}

      {tab === "Evidence" && (
        <SheetCard title="Submitted documents & links">
          {documents.length === 0 ? (
            <Text style={s.note}>No supporting files or video links are attached to this application.</Text>
          ) : (
            documents.map(doc => (
              <View key={doc.id} style={s.listRowStack}>
                <Text style={s.rowTitle}>{doc.title || doc.fileName || "Document"}</Text>
                <Text style={s.note}>
                  {doc.category} · {doc.sectionKey} · {doc.docKind === "video" ? "HTTPS video link" : doc.fileName || "Private file"}
                </Text>
                <ActionBtn
                  title={busy ? "Preparing..." : doc.docKind === "video" ? "Open video link" : "Open temporary link (120s)"}
                  secondary
                  disabled={busy}
                  onPress={() => void openEvidence(doc.storagePath, doc.videoUrl)}
                />
              </View>
            ))
          )}
        </SheetCard>
      )}

      {tab === "Messages" && (
        <>
          <SheetCard title="Applicant message thread">
            {messages.length === 0 ? (
              <Text style={s.note}>No messages have been exchanged on this application yet.</Text>
            ) : (
              messages.map(msg => (
                <View key={msg.id} style={s.messageBubble}>
                  <Text style={s.messageMeta}>
                    {msg.senderName} ({msg.senderRole}) · {msg.threadType || "application"} · {(msg.createdAt || "").slice(0, 16).replace("T", " ")}
                  </Text>
                  <Text style={s.messageBody}>{msg.body}</Text>
                </View>
              ))
            )}
          </SheetCard>
          <SheetCard title="Reply to innovator">
            <PillGroup
              options={["application", "clarification"] as const}
              selected={replyThread}
              onSelect={setReplyThread}
              formatLabel={v => (v === "clarification" ? "Clarification thread" : "Application thread")}
            />
            <FormInput
              label="Administrator reply"
              value={replyBody}
              onChangeText={setReplyBody}
              multiline
              maxLength={2000}
              placeholder="Write a clear message to the applicant..."
              editable={!busy}
            />
            <ActionBtn title={busy ? "Sending..." : "Send reply"} disabled={busy} onPress={() => void submitReply()} />
          </SheetCard>
        </>
      )}

      {tab === "History" && (
        <>
          <SheetCard title="Applicant timeline">
            {timeline.length === 0 ? (
              <Text style={s.note}>No applicant timeline entries recorded yet.</Text>
            ) : (
              timeline.map((entry, idx) => (
                <SheetFact
                  key={`${entry.at}-${idx}`}
                  label={`${entry.label} · ${(entry.at || "").slice(0, 16).replace("T", " ")}`}
                  value={entry.detail || "Recorded"}
                  last={idx === timeline.length - 1}
                />
              ))
            )}
          </SheetCard>
          <SheetCard title="Administrator revision & status history">
            {history.length === 0 ? (
              <Text style={s.note}>No administrator revisions recorded yet.</Text>
            ) : (
              history.map((entry, idx) => (
                <SheetFact
                  key={`${entry.at}-${idx}`}
                  label={`${entry.type || "Action"} · ${entry.actor}`}
                  value={`${entry.reason || "Recorded"} (${(entry.at || "").slice(0, 16).replace("T", " ")})`}
                  last={idx === history.length - 1}
                />
              ))
            )}
          </SheetCard>
        </>
      )}

      {tab === "Actions" && (
        <>
          <SheetCard title="Status intervention">
            <Text style={s.note}>
              Changing application status logs an audit entry, updates the applicant timeline, and sends a portal notification.
            </Text>
            <PillGroup options={APPLICATION_STATUSES} selected={newStatus as (typeof APPLICATION_STATUSES)[number]} onSelect={setNewStatus} />
            {newStatus === "Changes requested" && (
              <>
                <Text style={s.label}>Clarification section</Text>
                <PillGroup
                  options={CLARIFICATION_SECTIONS.map(sec => sec.key)}
                  selected={sectionKey}
                  onSelect={setSectionKey}
                  formatLabel={k => CLARIFICATION_SECTIONS.find(sec => sec.key === k)?.label || k}
                />
                <FormInput
                  label="Response deadline (YYYY-MM-DD, optional)"
                  value={deadline}
                  onChangeText={setDeadline}
                  placeholder="2026-12-05"
                  editable={!busy}
                />
              </>
            )}
            {(newStatus === "Changes requested" || newStatus === "Approved" || newStatus === "Awarded" || newStatus === "Rejected") && (
              <FormInput
                label="Message / feedback visible to innovator"
                value={outcomeFeedback}
                onChangeText={setOutcomeFeedback}
                multiline
                maxLength={1500}
                placeholder="Explain what is needed or decided for the applicant..."
                editable={!busy}
              />
            )}
            <FormInput
              label="Audit reason (5+ characters)"
              value={statusReason}
              onChangeText={setStatusReason}
              multiline
              maxLength={500}
              placeholder="Explain why this status change is required..."
              editable={!busy}
            />
            <View style={s.toggleRow}>
              <Text style={s.label}>Confirm official status change</Text>
              <Switch
                accessibilityLabel="Confirm official status change"
                value={confirmed}
                onValueChange={setConfirmed}
                disabled={busy}
                trackColor={{ true: c.teal, false: "#DDE2E7" }}
              />
            </View>
            <ActionBtn
              title={busy ? "Updating status..." : "Apply status update"}
              disabled={busy || !confirmed}
              onPress={() => void submitStatusIntervention()}
            />
          </SheetCard>

          {(item.status === "Approved" || item.status === "Awarded") && (
            <SheetCard title="Award stage conferral">
              <Text style={s.note}>
                Confer or update official CEDA Award details, publish to the Committee showcase, and notify subscribers at P0.00.
              </Text>
              <FormInput label="Award title" value={awardTitle} onChangeText={setAwardTitle} maxLength={160} editable={!busy} />
              <Text style={s.label}>Award category</Text>
              <PillGroup options={AWARD_CATEGORIES} selected={awardCategory as (typeof AWARD_CATEGORIES)[number]} onSelect={setAwardCategory} />
              <FormInput
                label="Support / grant package (optional)"
                value={awardAmount}
                onChangeText={setAwardAmount}
                placeholder="e.g. P250,000 + Incubation"
                maxLength={120}
                editable={!busy}
              />
              <FormInput
                label="Applicant-facing award summary"
                value={awardSummary}
                onChangeText={setAwardSummary}
                multiline
                maxLength={2000}
                editable={!busy}
              />
              <FormInput
                label="Audit reason (5+ characters)"
                value={awardReason}
                onChangeText={setAwardReason}
                multiline
                maxLength={500}
                placeholder="Document approval of award conferral..."
                editable={!busy}
              />
              <View style={s.toggleRow}>
                <Text style={s.label}>Confirm official Award stage conferral</Text>
                <Switch
                  accessibilityLabel="Confirm official Award stage conferral"
                  value={awardConfirmed}
                  onValueChange={setAwardConfirmed}
                  disabled={busy}
                  trackColor={{ true: c.teal, false: "#DDE2E7" }}
                />
              </View>
              <ActionBtn
                title={busy ? "Conferring award..." : "Confer award"}
                disabled={busy || !awardConfirmed}
                onPress={() => void submitAwardConferral()}
              />
            </SheetCard>
          )}

          <SheetCard title="Edit submission details">
            <FormInput label="Innovation title" value={revTitle} onChangeText={setRevTitle} maxLength={160} editable={!busy} />
            <FormInput label="Applicant name" value={revApplicant} onChangeText={setRevApplicant} maxLength={120} editable={!busy} />
            <Text style={s.label}>Sector</Text>
            <PillGroup options={sectorOptions} selected={revSector} onSelect={setRevSector} />
            <FormInput label="Summary" value={revSummary} onChangeText={setRevSummary} multiline maxLength={2000} editable={!busy} />
            <FormInput
              label="Audit reason for edit (5+ characters)"
              value={revReason}
              onChangeText={setRevReason}
              multiline
              maxLength={500}
              placeholder="Document what was corrected and why..."
              editable={!busy}
            />
            <ActionBtn
              title={busy ? "Saving edits..." : "Save submission edits"}
              secondary
              disabled={busy}
              onPress={() => void submitRevision()}
            />
          </SheetCard>
        </>
      )}
    </>
  );
}

export function AdminMatterDetailModalContent({
  account,
  matter,
  onMattersUpdated,
}: {
  account: Account;
  matter: AdminMatter;
  onMattersUpdated: (list: AdminMatter[]) => void;
}) {
  const [owner, setOwner] = useState(matter.owner || "Unassigned");
  const [state, setState] = useState<string>(matter.state || "Open");
  const [reply, setReply] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function saveUpdate() {
    if (reason.trim().length < 5) {
      setError("Enter an audit reason of at least 5 characters.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const list = await updateAdminMatter(account, {
        matter_ref: matter.id,
        new_owner: owner.trim() || "Support team",
        new_state: state,
        reason: reason.trim(),
        reply_message: reply.trim() || undefined,
      });
      if (list.length) onMattersUpdated(list);
      setReason("");
      setReply("");
      setNotice("Follow-up updated and logged in the administrator audit trail.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update matter.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SheetCard title={matter.title}>
        <Text style={s.note}>{matter.detail}</Text>
        {matter.steps ? <SheetFact label="Steps / context" value={matter.steps} /> : null}
        <SheetFact label="Reference" value={matter.id} />
        <SheetFact label="Type" value={matter.kind} />
        <SheetFact label="Reporter" value={matter.reporter} />
        <SheetFact label="Priority" value={matter.priority} />
        <SheetFact label="Current owner" value={matter.owner} />
        <SheetFact label="Status" value={matter.state} last={!matter.application} />
        {matter.application ? <SheetFact label="Linked application" value={matter.application} last /> : null}
      </SheetCard>

      {(matter.thread?.length ?? 0) > 0 && (
        <SheetCard title="Conversation thread">
          {matter.thread?.map((entry, idx) => (
            <View key={`${entry.at}-${idx}`} style={s.messageBubble}>
              <Text style={s.messageMeta}>{entry.sender} ({entry.role}) · {(entry.at || "").slice(0, 16).replace("T", " ")}</Text>
              <Text style={s.messageBody}>{entry.body}</Text>
            </View>
          ))}
        </SheetCard>
      )}

      {(matter.history?.length ?? 0) > 0 && (
        <SheetCard title="Matter history">
          {matter.history?.map((entry, idx) => (
            <SheetFact
              key={`${entry.at}-${idx}`}
              label={`${entry.actor} · ${(entry.at || "").slice(0, 16).replace("T", " ")}`}
              value={entry.action}
              last={idx === (matter.history?.length ?? 1) - 1}
            />
          ))}
        </SheetCard>
      )}

      <SheetCard title="Update status & reply">
        {!!error && <Text accessibilityRole="alert" style={s.errorText}>{error}</Text>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={s.successText}>{notice}</Text>}
        <FormInput label="Assigned owner" value={owner} onChangeText={setOwner} maxLength={80} editable={!busy} />
        <Text style={s.label}>Matter status</Text>
        <PillGroup options={MATTER_STATES} selected={state as (typeof MATTER_STATES)[number]} onSelect={setState} />
        <FormInput
          label="Reply to innovator (optional)"
          value={reply}
          onChangeText={setReply}
          multiline
          maxLength={2000}
          placeholder="Message added directly to the requester's support thread..."
          editable={!busy}
        />
        <FormInput
          label="Audit reason (5+ characters)"
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={500}
          placeholder="Record the action taken or decision rationale..."
          editable={!busy}
        />
        <ActionBtn title={busy ? "Saving..." : "Update follow-up"} disabled={busy} onPress={() => void saveUpdate()} />
      </SheetCard>
    </>
  );
}

export function AdminSectorEditorModalContent({
  account,
  sector,
  onSaved,
}: {
  account: Account;
  sector?: AdminSector | null;
  onSaved: (sectors: AdminSector[]) => void;
}) {
  const [name, setName] = useState(sector?.name || "");
  const [status, setStatus] = useState<string>(sector?.status || "published");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (name.trim().length < 2) {
      setError("Enter a sector name of at least 2 characters.");
      return;
    }
    if (reason.trim().length < 5) {
      setError("Enter an audit reason of at least 5 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updated = await saveAdminSector(account, {
        id: sector?.id ?? null,
        name,
        status,
        reason,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save sector.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetCard title={sector ? `Edit sector: ${sector.name}` : "Add new sector"}>
      <Text style={s.note}>Archiving keeps historical applications intact while hiding the sector from new drafts.</Text>
      {!!error && <Text accessibilityRole="alert" style={s.errorText}>{error}</Text>}
      <FormInput label="Sector name" value={name} onChangeText={setName} maxLength={100} editable={!busy} />
      <Text style={s.label}>Status</Text>
      <PillGroup options={SECTOR_STATUSES} selected={status as (typeof SECTOR_STATUSES)[number]} onSelect={setStatus} />
      <FormInput label="Audit reason (5+ characters)" value={reason} onChangeText={setReason} multiline maxLength={500} editable={!busy} />
      <ActionBtn title={busy ? "Saving sector..." : "Save sector"} disabled={busy} onPress={() => void submit()} />
    </SheetCard>
  );
}

export function AdminNotificationsModalContent({
  account,
  overview,
  matters,
  onUpdated,
  onNavigateFollowups,
  onNavigateSecurity,
}: {
  account: Account;
  overview: AdminNotificationsOverview;
  matters: AdminMatter[];
  onUpdated: (next: AdminNotificationsOverview) => void;
  onNavigateFollowups: () => void;
  onNavigateSecurity: () => void;
}) {
  const [tab, setTab] = useState<"Inbox" | "Templates" | "Compose">("Inbox");
  const [kind, setKind] = useState<(typeof NOTIFICATION_KINDS)[number]>("Announcement");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function saveNotification() {
    if (title.trim().length < 2 || message.trim().length < 10) {
      setError("Enter a title and message of at least 10 characters.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await saveAdminNotification(account, {
        entry_kind: kind,
        entry_title: title,
        entry_message: message,
        reason: "Saved via Mobile Admin Notification Center",
      });
      onUpdated(next);
      setTitle("");
      setMessage("");
      setNotice(`${kind} saved to PostgreSQL queue and audited.`);
      setTab(kind === "Announcement" ? "Inbox" : "Templates");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save notification.");
    } finally {
      setBusy(false);
    }
  }

  async function runDispatch() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await dispatchAdminNotifications(account);
      onUpdated(res.overview);
      const emailPart = res.emailDispatch?.configured
        ? `Email: ${res.emailDispatch.sent ?? 0} sent`
        : "Email: configure provider keys";
      const pushPart = res.dispatch?.configured
        ? `Push: ${res.dispatch.sent ?? 0} sent`
        : "Push: configure FCM keys";
      setNotice(`Queue dispatch complete (${emailPart}; ${pushPart}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dispatch notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function runTestEmail() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await sendAdminTestEmail(account);
      onUpdated(res.overview);
      setNotice(
        res.dispatch.configured
          ? `Test email dispatched (${res.dispatch.sent ?? 0} sent, ${res.dispatch.failed ?? 0} failed).`
          : "Test email queued in PostgreSQL (configure RESEND_API_KEY or EMAILJS_* secrets to send)."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send test email.");
    } finally {
      setBusy(false);
    }
  }

  async function runTestPush() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await sendAdminTestPush(account);
      onUpdated(res.overview);
      setNotice(
        res.dispatch.configured
          ? `Test push dispatched (${res.dispatch.sent ?? 0} sent, ${res.dispatch.failed ?? 0} failed).`
          : "Test push queued in PostgreSQL (configure FCM secrets to send)."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send test push.");
    } finally {
      setBusy(false);
    }
  }

  async function retryEntry(queueId: string) {
    setBusy(true);
    setError("");
    try {
      const next = await retryAdminNotification(account, queueId);
      onUpdated(next);
      setNotice("Notification re-queued and dispatched.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={s.tabsRow}>
        {(["Inbox", "Templates", "Compose"] as const).map(label => (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === label }}
            onPress={() => {
              setTab(label);
              setError("");
            }}
            style={[s.tabChip, tab === label && s.tabChipActive]}
          >
            <Text style={[s.tabChipText, tab === label && s.tabChipTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {!!error && <Text accessibilityRole="alert" style={s.errorText}>{error}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={s.successText}>{notice}</Text>}

      {tab === "Inbox" && (
        <>
          <SheetCard title="Delivery channels & free alert subscriptions">
            <SheetFact
              label="Email queue"
              value={`${overview.emailSummary?.sentEmail ?? 0} sent · ${overview.emailSummary?.queuedEmail ?? 0} queued · ${overview.emailSummary?.failedEmail ?? 0} failed`}
            />
            <SheetFact
              label="Push devices & queue"
              value={`${overview.fcmSummary?.activeDevices ?? 0} active devices · ${overview.fcmSummary?.sentPush ?? 0} sent · ${overview.fcmSummary?.queuedPush ?? 0} queued`}
            />
            <SheetFact
              label="Free submission subscriptions"
              value={`${overview.subscriptionStats?.activeSubscriptions ?? 0} active (${overview.subscriptionStats?.feeLabel || "No charge (Free, P0.00)"})`}
              last
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
              <ActionBtn title="Dispatch queued" disabled={busy} onPress={() => void runDispatch()} />
              <ActionBtn title="Test email" secondary disabled={busy} onPress={() => void runTestEmail()} />
              <ActionBtn title="Test push" secondary disabled={busy} onPress={() => void runTestPush()} />
            </View>
          </SheetCard>

          <SheetCard title="Inbox & queue alerts">
            {overview.inbox.length ? overview.inbox.map((entry, idx) => (
              <View
                key={entry.id || `${entry.title}-${idx}`}
                style={[s.listRow, idx === overview.inbox.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.rowTitle}>{entry.title}</Text>
                  <Text style={s.note}>
                    {entry.channel || entry.category} · Push: {entry.status}
                    {entry.emailStatus && entry.emailStatus !== "Pending" ? ` · Email: ${entry.emailStatus}` : ""} · {entry.when}
                  </Text>
                  {!!(entry.emailLastError || entry.lastError) && (
                    <Text style={s.errorText}>{entry.emailLastError || entry.lastError}</Text>
                  )}
                </View>
                {entry.id && (["Queued", "Failed", "Open"].includes(entry.status) || ["Queued", "Failed"].includes(entry.emailStatus || "")) ? (
                  <Pressable accessibilityRole="button" disabled={busy} onPress={() => void retryEntry(entry.id)}>
                    <Text style={s.linkText}>Retry ›</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      if (entry.action === "followup") onNavigateFollowups();
                      else if (entry.action === "security") onNavigateSecurity();
                      else setTab("Templates");
                    }}
                  >
                    <Text style={s.linkText}>Open ›</Text>
                  </Pressable>
                )}
              </View>
            )) : matters.filter(m => m.state !== "Resolved").map((item, idx, list) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={onNavigateFollowups}
                style={[s.listRow, idx === list.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.rowTitle}>{item.title}</Text>
                  <Text style={s.note}>{item.kind} · {item.priority} priority · {item.state}</Text>
                </View>
                <Text style={s.linkText}>Inspect ›</Text>
              </Pressable>
            ))}
            {overview.inbox.length === 0 && matters.filter(m => m.state !== "Resolved").length === 0 && (
              <Text style={s.note}>No unresolved queue alerts or administrator notices right now.</Text>
            )}
          </SheetCard>
        </>
      )}

      {tab === "Templates" && (
        <SheetCard title="Event notification templates">
          {overview.templates.length ? overview.templates.map((tpl, idx) => (
            <Pressable
              key={tpl.id || tpl.title}
              accessibilityRole="button"
              onPress={() => {
                setKind((NOTIFICATION_KINDS.includes(tpl.kind as (typeof NOTIFICATION_KINDS)[number]) ? tpl.kind : "Email template") as (typeof NOTIFICATION_KINDS)[number]);
                setTitle(tpl.title);
                setMessage(tpl.message);
                setTab("Compose");
              }}
              style={[s.listRow, idx === overview.templates.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.rowTitle}>{tpl.title}</Text>
                <Text style={s.note}>{tpl.channel} · {tpl.audience} · {tpl.status}</Text>
              </View>
              <Text style={s.linkText}>Edit ›</Text>
            </Pressable>
          )) : <Text style={s.note}>No custom templates saved yet. Use Compose to add one.</Text>}
        </SheetCard>
      )}

      {tab === "Compose" && (
        <SheetCard title="Prepare announcement or template">
          {!!error && <Text accessibilityRole="alert" style={s.errorText}>{error}</Text>}
          <PillGroup options={NOTIFICATION_KINDS} selected={kind} onSelect={setKind} />
          <FormInput label="Title / subject" value={title} onChangeText={setTitle} maxLength={160} editable={!busy} />
          <FormInput label="Message body" value={message} onChangeText={setMessage} multiline maxLength={2000} editable={!busy} />
          <ActionBtn title={busy ? "Saving..." : "Save to database queue"} disabled={busy} onPress={() => void saveNotification()} />
        </SheetCard>
      )}
    </>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 18, borderWidth: 1, borderColor: "rgba(255,255,255,0.92)", padding: 15, gap: 11 },
  heading: { color: c.navy, fontSize: fontSizes.heading, fontWeight: "700" },
  note: { color: c.subtle, fontSize: fontSizes.subbody, lineHeight: 20 },
  label: { color: c.navy, fontSize: fontSizes.subbody, fontWeight: "700" },
  field: { gap: 6 },
  input: { backgroundColor: "white", borderWidth: 1, borderColor: "#E0D7CC", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: fontSizes.body, color: c.navy },
  fact: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.line, gap: 3 },
  factLabel: { color: c.subtle, fontSize: fontSizes.caption, fontWeight: "700" },
  factValue: { color: c.navy, fontSize: fontSizes.body, fontWeight: "500" },
  tabsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tabChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: "#EFE8DE" },
  tabChipActive: { backgroundColor: c.navy },
  tabChipText: { color: c.navy, fontSize: fontSizes.caption, fontWeight: "700" },
  tabChipTextActive: { color: "white" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14, backgroundColor: "#EFE8DE" },
  pillActive: { backgroundColor: c.rust },
  pillText: { color: c.navy, fontSize: fontSizes.caption, fontWeight: "600" },
  pillTextActive: { color: "white", fontWeight: "700" },
  listRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line },
  listRowStack: { gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line },
  rowTitle: { color: c.navy, fontSize: fontSizes.body, fontWeight: "600" },
  linkText: { color: c.blue, fontSize: fontSizes.subbody, fontWeight: "700" },
  messageBubble: { padding: 11, borderRadius: 12, backgroundColor: "#F9F6F1", borderWidth: 1, borderColor: c.line, gap: 4 },
  messageMeta: { color: c.subtle, fontSize: fontSizes.caption, fontWeight: "700" },
  messageBody: { color: c.navy, fontSize: fontSizes.body, lineHeight: 20 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  button: { minHeight: 46, borderRadius: 12, backgroundColor: c.navy, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonSecondary: { backgroundColor: "#EAE4DC" },
  buttonText: { color: "white", fontSize: fontSizes.body, fontWeight: "700" },
  errorText: { color: c.rust, fontSize: fontSizes.subbody, fontWeight: "600" },
  successText: { color: c.teal, fontSize: fontSizes.subbody, fontWeight: "700" },
});
