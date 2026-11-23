import { useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Account } from "./auth";
import { FrostedSurface } from "./FrostedGlass";
import {
  ActionButton, ChoiceChips, FactRow, FlushSheetModal, FormField, FrostedInput, GlassCard,
  IconRow, SectionHeader, StatusPill, SubscreenHero, adminStyleColors as colors, statusAppearance,
} from "./InnovatorUI";
import { createSignedEvidenceUrl } from "./innovatorApi";
import { buttonCornerRadius, fontSizes } from "./theme";
import { buildReviewSteps, scoreLabels } from "./assessmentForm.js";
import {
  computeWeightedAssessment, criterionLabel, defaultAssessmentDeadline, defaultAssessmentRubric,
  eligiblePanelCandidates, normalizeRubricCriteria, panelCandidateSubtitle,
} from "./assessmentOverview.js";
import {
  assessmentDate, ballotLabels, deadlineInput, deadlineIso, getAssessorCase, roundLabel, runAssessorAction,
  type Action, type AssessorStaff, type CaseDetail, type Choice, type Score,
} from "./assessorApi";

export type CaseTab = "Application" | "Assessment" | "Discussion" | "Panel" | "Decision";

type Props = {
  account: Account;
  detail: CaseDetail;
  staff: AssessorStaff[];
  initialTab: CaseTab;
  onTabChange: (tab: CaseTab) => void;
  releaseVerified: boolean;
  onVerifyRelease: () => void;
  onChange: (detail: CaseDetail) => void;
  onBusy: (busy: boolean) => void;
};

const confirmedActions: Partial<Record<Action["name"], { title: string; message: string }>> = {
  submit: { title: "Submit your assessment?", message: "Your weighted criterion ratings and rationales will be recorded for this round and the assessment will be locked." },
  start: { title: "Start this review round?", message: "The panel will be able to begin their assessments." },
  "open-vote": { title: "Open panel voting?", message: "Eligible panel members can cast their recommendations." },
  "close-vote": { title: "Close panel voting?", message: "The portal will calculate the recommendation from the ballots received." },
  "request-information": { title: "Send the information request?", message: "The innovator will see the request and its deadline." },
  reassess: { title: "Start reassessment?", message: "The current round will be archived so you can configure a new panel and deadline." },
  release: { title: "Release the outcome?", message: "The recorded outcome and applicant feedback will be visible to the innovator." },
  award: { title: "Confer innovation award?", message: "This application will advance to Awarded status and notify the innovator." },
};

const chatDateFormat = new Intl.DateTimeFormat("en-BW", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Gaborone" });
const chatTimeFormat = new Intl.DateTimeFormat("en-BW", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Gaborone" });
const chatDate = (value: string) => chatDateFormat.format(new Date(value));
const chatTime = (value: string) => chatTimeFormat.format(new Date(value));
const chatInitials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
const scoreColor = (rating: number | null) => rating === 5 ? "#2D8B57" : rating === 4 ? "#6B9F58" : rating === 3 ? "#D4A72C" : rating === 2 ? "#D66C35" : "#9B3B32";
const scoreTint = (rating: number | null) => rating && rating >= 4 ? "#E9F4EA" : rating === 3 ? "#FFF7D9" : "#FBEAE6";

export function AssessorCaseView({ account, detail, staff, initialTab, onTabChange, releaseVerified, onVerifyRelease, onChange, onBusy }: Props) {
  const item = detail.case;
  const [tab, setTab] = useState<CaseTab>(initialTab);
  const [assignOpen, setAssignOpen] = useState(false);
  const [scores, setScores] = useState<Score[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [deadline, setDeadline] = useState("");
  const [quorum, setQuorum] = useState("");
  const [feedback, setFeedback] = useState("");
  const [reason, setReason] = useState("");
  const [recusalReason, setRecusalReason] = useState("");
  const [comment, setComment] = useState("");
  const [stepOverride, setStep] = useState<number | null>(null);
  const [thread, setThread] = useState<{ anchor: string; label: string } | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [overall, setOverall] = useState(detail.overallComment ?? "");
  const [evidence, setEvidence] = useState<CaseDetail["documents"][number] | null>(null);
  const [informationDeadline, setInformationDeadline] = useState("");
  const [votingDeadline, setVotingDeadline] = useState("");
  const [awardTitle, setAwardTitle] = useState(`CEDA Innovation Award: ${item.title}`);
  const [awardCategory, setAwardCategory] = useState("Innovation Recognition & Support");
  const [awardAmount, setAwardAmount] = useState("");
  const [awardSummary, setAwardSummary] = useState("Approved by the CEDA Assessment Panel and conferred an official innovation award.");
  const [vote, setVote] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<Action | null>(null);

  const roundRubric = normalizeRubricCriteria(detail.rubric);
  const rubricVersion = detail.rubricVersion ?? 1;
  const passThreshold = detail.passThreshold ?? 60;

  useEffect(() => {
    const activeRubric = normalizeRubricCriteria(detail.rubric);
    setScores(activeRubric.map(c => detail.scores.find(entry => entry.criterion === c.key) ?? { criterion: c.key, rating: null, rationale: "" }));
    setMembers(detail.panel.filter(member => member.conflict !== "recused").map(member => member.id));
    setDeadline(item.deadline ? deadlineInput(item.deadline) : defaultAssessmentDeadline().mobileInput);
    setQuorum(detail.decision?.quorum ? String(detail.decision.quorum) : "1");
    setFeedback(detail.decision?.feedback ?? "");
    setAwardTitle(typeof item.awardData?.awardTitle === "string" ? item.awardData.awardTitle : `CEDA Innovation Award: ${item.title}`);
    setAwardCategory(typeof item.awardData?.awardCategory === "string" ? item.awardData.awardCategory : "Innovation Recognition & Support");
    setAwardAmount(typeof item.awardData?.awardAmount === "string" ? item.awardData.awardAmount : "");
    setAwardSummary(typeof item.awardData?.awardSummary === "string" ? item.awardData.awardSummary : "Approved by the CEDA Assessment Panel and conferred an official innovation award.");
    setVote(detail.ballot ?? detail.draftChoice ?? null);
    setOverall(detail.overallComment ?? "");
  }, [detail, item.deadline]);

  const liveWeighted = computeWeightedAssessment(scores, roundRubric, passThreshold);

  const roundActive = item.roundState === "review" || item.roundState === "voting";
  const caseOpen = ["Submitted", "In review", "Changes requested"].includes(item.status);
  const hold = item.hold || !!detail.decision?.hold;
  const canRead = item.status !== "Withdrawn" && (item.assigned ? item.conflict === "cleared" : item.canManage);
  const canDeclare = caseOpen && !hold && item.assigned && (item.roundState === "setup" || item.roundState === "review");
  const canReview = caseOpen && item.conflict === "cleared" && item.roundState === "review" && !item.submitted && !hold && (!item.deadline || new Date(item.deadline) > new Date());
  const canDiscuss = caseOpen && canRead && roundActive && !hold;
  const canVote = caseOpen && item.assigned && item.submitted && item.conflict === "cleared" && item.roundState === "voting" && !detail.ballot && !hold && (!item.deadline || new Date(item.deadline) > new Date());
  const canManage = caseOpen && item.canManage && item.conflict !== "recused";
  const canAssignPanel = canManage && item.status !== "Changes requested" && (!item.roundState || item.roundState === "setup") && !hold;
  const showPanel = item.canManage || (item.submitted && canRead);
  const navigationTabs: CaseTab[] = [
    ...((item.assigned || item.canManage || item.hasHistory) ? (["Application"] as CaseTab[]) : []),
    ...(showPanel ? (["Panel"] as CaseTab[]) : []),
    ...((item.assigned || item.hasHistory) ? (["Assessment"] as CaseTab[]) : []),
    ...(canRead && item.roundId ? (["Discussion"] as CaseTab[]) : []),
    ...(item.roundId && (item.canManage || item.conflict === "cleared") ? (["Decision"] as CaseTab[]) : []),
  ];
  const activeTab = navigationTabs.includes(tab) ? tab : (navigationTabs[0] ?? "Application");
  const deadlineValue = deadlineIso(deadline.trim());
  const infoDeadlineValue = deadlineIso(informationDeadline.trim());
  const votingDeadlineValue = deadlineIso(votingDeadline.trim());
  const availableStaff = eligiblePanelCandidates(staff, detail.panel, item.sectorId);
  const terminalRecommendation = detail.decision?.recommendation === "approve" || detail.decision?.recommendation === "decline";

  function changeScore(criterion: Score["criterion"], next: Partial<Pick<Score, "rating" | "rationale">>) {
    setScores(previous => previous.map(score => score.criterion === criterion ? { ...score, ...next } : score));
  }

  async function apply(action: Action) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await runAssessorAction(account, item, action);
      onChange(updated);
      if (action.name === "comment") setComment("");
      if (action.name === "review-step") setStep(Math.min(action.data.step, steps.length - 1));
      if (action.name === "annotate") { setAnnotation(""); setReply(null); }
      if (action.name === "declare") setRecusalReason("");
      if (action.name === "hold" || action.name === "resume" || action.name === "reassess") setReason("");
      if (action.name === "request-information") setInformationDeadline("");
      if (action.name === "open-vote") setVotingDeadline("");
      setNotice(action.name === "submit" ? "Assessment submitted." : action.name === "save" ? "Assessment draft saved." : "Changes saved.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The assessment could not be updated.");
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusy(false);
    }
  }

  function perform(action: Action) {
    if (confirmedActions[action.name]) setConfirmation(action);
    else void apply(action);
  }

  async function assignAssessors(startReview: boolean) {
    if (inFlight.current || !deadlineValue) return;
    inFlight.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");
    try {
      let updated = await runAssessorAction(account, item, {
        name: "configure",
        data: { members, deadline: deadlineValue, quorum: Number(quorum) },
      });
      if (startReview && updated.case.roundId && updated.case.roundState === "setup") {
        updated = await runAssessorAction(account, updated.case, { name: "start" });
      }
      onChange(updated);
      setAssignOpen(false);
      setNotice(startReview ? "Assessors assigned and review started." : "Panel draft saved.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not assign assessors.");
    } finally {
      inFlight.current = false;
      setBusy(false);
      onBusy(false);
    }
  }

  function renderAssignFields() {
    const invalid = busy || hold || !members.length || !deadlineValue || new Date(deadlineValue) <= new Date() || !/^\d+$/.test(quorum) || Number(quorum) < 1 || Number(quorum) > members.length;
    return (
      <>
        {availableStaff.map((member, index) => {
          const checked = members.includes(member.id);
          return (
            <Pressable key={member.id} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={member.name} disabled={busy} onPress={() => setMembers(current => current.includes(member.id) ? current.filter(id => id !== member.id) : [...current, member.id])}>
              <IconRow title={member.name} detail={panelCandidateSubtitle(member, item.sectorId, checked)} icon={checked ? "check" : "people"} last={index === availableStaff.length - 1} />
            </Pressable>
          );
        })}
        {!availableStaff.length && <Text style={styles.copy}>No eligible active assessors are available for this application.</Text>}
        <FormField label="Assessment deadline" hint="YYYY-MM-DD HH:MM, Botswana time">
          <FrostedInput accessibilityLabel="Review deadline in Botswana time" placeholder="YYYY-MM-DD HH:MM" value={deadline} onChangeText={setDeadline} maxLength={16} />
        </FormField>
        <FormField label="Voting quorum" hint="Minimum number of valid ballots">
          <FrostedInput accessibilityLabel="Voting quorum" keyboardType="number-pad" value={quorum} onChangeText={setQuorum} maxLength={3} />
        </FormField>
        <View style={styles.actionRow}>
          <ActionButton label="Assign assessors & start review" compact disabled={invalid} onPress={() => void assignAssessors(true)} />
          <ActionButton label="Save panel draft" compact variant="secondary" disabled={invalid} onPress={() => void assignAssessors(false)} />
        </View>
      </>
    );
  }

  async function openEvidence(document: CaseDetail["documents"][number]) {
    setError("");
    try {
      if (document.storagePath) {
        const url = await createSignedEvidenceUrl(account.token, document.storagePath);
        await Linking.openURL(url);
      } else if (document.videoUrl && /^https:\/\//i.test(document.videoUrl)) {
        await Linking.openURL(document.videoUrl);
      } else {
        throw new Error("This evidence item is unavailable.");
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "This evidence item could not be opened.");
    }
  }

  const steps = buildReviewSteps({ title: item.title, summary: detail.application?.summary, ...detail.application?.formData }, detail.documents);
  const reviewed = new Set(detail.reviewedSteps ?? []);
  const firstUnread = steps.findIndex((_, index) => !reviewed.has(index + 1));
  const step = stepOverride ?? Math.max(0, firstUnread);
  const section = steps[step];
  const canAnnotate = canDiscuss;
  const showTab = (next: CaseTab) => { setTab(next); onTabChange(next); setError(""); setNotice(""); };
  function openThread(anchor: string, label: string) {
    setEvidence(null);
    setReply(null);
    setAnnotation("");
    setThread({ anchor, label });
  }
  function commentsFor(anchor: string, label: string) {
    const authors = [...new Set((detail.annotations ?? []).filter(entry => entry.anchor === anchor).map(entry => entry.name))];
    return <View style={styles.textRow}>
      {authors.map(name => (
        <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Read ${name}'s comments on ${label}`} onPress={() => openThread(anchor, label)} style={styles.commentAvatar}>
          <Text style={styles.commentAvatarText}>{name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</Text>
        </Pressable>
      ))}
      {canAnnotate && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Comment on ${label}`} onPress={() => openThread(anchor, label)} style={styles.commentAvatarAdd}>
          <Text style={styles.commentAvatarText}>+</Text>
        </Pressable>
      )}
    </View>;
  }
  function attachment(id: string) {
    const document = detail.documents.find(entry => entry.id === id);
    if (!document) return null;
    return <View key={id} style={styles.attachment}>
      <View style={styles.attachmentDetails}>
        <Text style={styles.label}>{document.title}</Text>
        <Pressable accessibilityRole="button" onPress={() => setEvidence(document)} style={styles.documentPill}><Text style={styles.documentPillText}>View document</Text></Pressable>
      </View>
      {commentsFor(`document:${id}`, document.title)}
    </View>;
  }
  useEffect(() => {
    if (activeTab !== "Discussion" || !item.roundId || !canRead) return;
    void runAssessorAction(account, item, { name: "read-discussion" }).catch(() => undefined);
    let active = true;
    let signature = JSON.stringify(detail.discussion);
    let currentAppState = AppState.currentState;
    const refresh = async () => {
      if (inFlight.current || currentAppState !== "active") return;
      try {
        const latest = await getAssessorCase(account, item.id);
        const nextSignature = JSON.stringify(latest.discussion);
        if (active && nextSignature !== signature) {
          signature = nextSignature;
          onChange(latest);
          void runAssessorAction(account, latest.case, { name: "read-discussion" }).catch(() => undefined);
        }
      } catch { /* The next automatic check retries silently. */ }
    };
    const appSub = AppState.addEventListener("change", (nextState) => {
      const prev = currentAppState;
      currentAppState = nextState;
      if (prev !== "active" && nextState === "active") void refresh();
    });
    const timer = setInterval(() => void refresh(), 4000);
    return () => { active = false; clearInterval(timer); appSub.remove(); };
  }, [account, activeTab, canRead, detail.discussion, item.id, item.roundId, onChange]);
  const confirm = confirmation && confirmedActions[confirmation.name];
  const caseStatusLabel = roundLabel(item);
  const caseTone = statusAppearance(
    item.status === "Approved" || item.roundState === "released"
      ? "Approved"
      : item.status === "Rejected"
        ? "Rejected"
        : item.status === "Changes requested"
          ? "Changes requested"
          : item.roundState === "review" || item.roundState === "voting" || item.status === "In review"
            ? "In review"
            : "Submitted"
  );

  return (
    <>
      <SubscreenHero
        icon="applications"
        color={caseTone.color}
        tint={caseTone.tint}
        eyebrow={`${item.reference} · ${item.sector || "Industry pending"}`}
        title={item.title}
        badge={caseStatusLabel}
        summary={[
          item.deadline ? `Deadline ${assessmentDate(item.deadline)} CAT` : "Awaiting schedule",
          item.roundId ? `${item.reviewCount}/${item.memberCount} reviews submitted` : "No panel assigned yet",
        ].join(" · ")}
      />
      {hold && (
        <GlassCard style={styles.noticeCard}>
          <Text style={styles.warning}>This assessment round is currently on hold.</Text>
        </GlassCard>
      )}
      {canAssignPanel && (
        <View style={styles.actionRow}>
          {canAssignPanel && <ActionButton label="Assign assessors" compact disabled={busy} onPress={() => setAssignOpen(true)} />}
        </View>
      )}
      {navigationTabs.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" contentContainerStyle={styles.tabs}>
        {navigationTabs.map(value => {
          const label = value === "Assessment" ? "My review" : value;
          const active = value === activeTab;
          return (
            <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => showTab(value)} style={[styles.tab, active && styles.activeTab]}>
              <Text style={[styles.tabLabel, active && styles.activeTabLabel]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>}
      {error ? <Text accessibilityRole="alert" style={styles.warning}>{error}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}

      {activeTab === "Application" && (
        <GlassCard style={styles.group}>
          {canRead && detail.application ? (
            <>
              <SectionHeader title={section.title} subtitle={`Step ${step + 1} of ${steps.length} · ${reviewed.size} reviewed`} />
              <View style={styles.stepTrack} accessibilityRole="tablist">
                {steps.map((entry, index) => <Pressable key={entry.title} accessibilityRole="tab" accessibilityLabel={`Step ${index + 1}, ${entry.title}${reviewed.has(index + 1) ? ", reviewed" : ""}`} accessibilityState={{ selected: step === index }} onPress={() => setStep(index)} style={styles.stepPressable}>
                  <View style={styles.stepItem}>
                    <View style={styles.stepRail}>
                      <View style={[styles.stepCircle, reviewed.has(index + 1) && styles.stepComplete, step === index && styles.stepCurrent]}>
                        <Text style={[styles.stepNumber, (reviewed.has(index + 1) || step === index) && styles.stepNumberActive]}>{reviewed.has(index + 1) ? "✓" : index + 1}</Text>
                      </View>
                      {index < steps.length - 1 && <View style={[styles.stepLine, reviewed.has(index + 1) && styles.stepLineComplete]} />}
                    </View>
                    <Text style={[styles.stepLabel, step === index && styles.stepLabelCurrent]}>{entry.title}</Text>
                  </View>
                </Pressable>)}
              </View>
              {section.answers.map((answer, index) => (
                <View key={answer.key} style={[styles.criterion, index === section.answers.length - 1 && !section.documentIds.length && styles.criterionLast]}>
                  <View style={styles.attachment}><Text style={[styles.label, { flex: 1 }]}>{answer.label}</Text>{commentsFor(`field:${answer.key}`, answer.label)}</View>
                  {!!answer.value && <Text style={styles.copy}>{answer.value}</Text>}
                  {answer.documentIds.map(attachment)}
                </View>
              ))}
              {section.documentIds.map(attachment)}
              {!section.answers.length && !section.documentIds.length && <Text style={styles.copy}>No answers or attachments were submitted in this step.</Text>}
              <View style={styles.stepFooter}>
                {(step > 0 || (step < steps.length - 1 && (!canReview || reviewed.has(step + 1)))) && (
                  <View style={styles.stepNavLinks}>
                    {step > 0 && (
                      <Pressable accessibilityRole="link" onPress={() => setStep(step - 1)} style={styles.navPill}>
                        <Text style={styles.navPillText}>Previous step</Text>
                      </Pressable>
                    )}
                    {step < steps.length - 1 && (!canReview || reviewed.has(step + 1)) && (
                      <Pressable accessibilityRole="link" onPress={() => setStep(step + 1)} style={styles.navPill}>
                        <Text style={styles.navPillText}>Next step</Text>
                      </Pressable>
                    )}
                  </View>
                )}
                <View style={styles.actionRow}>
                  {canReview && !reviewed.has(step + 1) && <ActionButton label={step === steps.length - 1 ? "Mark reviewed" : "Next step"} compact disabled={busy} onPress={() => perform({ name: "review-step", data: { step: step + 1 } })} />}
                  {step === steps.length - 1 && item.assigned && (
                    <Pressable accessibilityRole="link" onPress={() => showTab("Assessment")} style={styles.navPillPrimary}>
                      <Text style={styles.navPillPrimaryText}>Go to my review</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.copy}>{item.conflict === "pending" ? "Complete your conflict declaration before opening the application." : "Application details are unavailable for this assignment."}</Text>
              {item.conflict === "pending" && (
                <View style={styles.actionRow}>
                  <Pressable accessibilityRole="link" onPress={() => showTab("Assessment")} style={styles.navPillPrimary}>
                    <Text style={styles.navPillPrimaryText}>Open conflict declaration</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}
        </GlassCard>
      )}

      {activeTab === "Assessment" && (
        <>
          <GlassCard style={styles.group}>
            <SectionHeader title="Conflict declaration" />
            {!item.assigned && <Text style={styles.copy}>You are not a member of this assessment panel.</Text>}
            {item.assigned && item.conflict === "pending" && (
              <>
                <Text style={styles.copy}>Confirm whether you have a conflict of interest before opening the application evidence.</Text>
                <View style={styles.actionRow}>
                  <ActionButton label="Confirm no conflict" compact disabled={busy || !canDeclare} onPress={() => perform({ name: "declare", data: { conflict: "cleared", reason: "" } })} />
                </View>
              </>
            )}
            {item.conflict === "cleared" && <Text style={styles.copy}>Conflict check cleared.</Text>}
            {item.conflict === "recused" && <Text style={styles.copy}>You have recused yourself from this round.</Text>}
            {canDeclare && item.conflict !== "recused" && (
              <>
                <FormField label="Conflict details">
                  <FrostedInput accessibilityLabel="Conflict details" multiline editable={!busy} value={recusalReason} onChangeText={setRecusalReason} maxLength={1000} />
                </FormField>
                <View style={styles.actionRow}>
                  <ActionButton label="Declare conflict and recuse" compact variant="secondary" disabled={busy || recusalReason.trim().length < 5} onPress={() => perform({ name: "declare", data: { conflict: "recused", reason: recusalReason.trim() } })} />
                </View>
              </>
            )}
          </GlassCard>
          {item.conflict === "cleared" && (
            <GlassCard style={styles.group}>
              <SectionHeader
                title="Your assessment"
                subtitle={item.submitted ? "Submitted" : `Rubric v${rubricVersion} · Score 1 to 5 across ${roundRubric.length} weighted criteria (100% total).`}
              />
              <View style={styles.weightedBanner}>
                <View style={styles.weightedBannerHead}>
                  <Text style={styles.label}>
                    {liveWeighted.weightedTotal !== null
                      ? `${liveWeighted.weightedTotal}% weighted (${liveWeighted.weightedScore}/5)`
                      : `${liveWeighted.earnedPercentage}% earned so far`}
                  </Text>
                  <View
                    style={[
                      styles.weightBadge,
                      liveWeighted.meetsThreshold === true
                        ? styles.weightBadgePass
                        : liveWeighted.meetsThreshold === false
                          ? styles.weightBadgeBelow
                          : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.weightBadgeText,
                        liveWeighted.meetsThreshold === true
                          ? styles.weightBadgePassText
                          : liveWeighted.meetsThreshold === false
                            ? styles.weightBadgeBelowText
                            : null,
                      ]}
                    >
                      {liveWeighted.meetsThreshold === true
                        ? `Meets ${passThreshold}% benchmark`
                        : liveWeighted.meetsThreshold === false
                          ? `Below ${passThreshold}% benchmark`
                          : `${liveWeighted.scoredCount}/${liveWeighted.totalCriteria} scored`}
                    </Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  Rubric v{rubricVersion} · Weight scored: {liveWeighted.scoredWeight}% / {liveWeighted.totalWeight}% · Pass threshold {passThreshold}%
                </Text>
              </View>
              {scores.map((score, index) => {
                const criterionMeta = roundRubric.find(c => c.key === score.criterion);
                const labelText = criterionLabel(score.criterion, roundRubric);
                const weightPct = criterionMeta?.weight ?? 0;
                const contrib = score.rating && weightPct > 0 ? ((score.rating / 5) * weightPct).toFixed(1) : null;
                return (
                <View key={score.criterion} style={[styles.criterion, index === scores.length - 1 && !canReview && !detail.ballot && !detail.overallComment && styles.criterionLast]}>
                  <View style={styles.criterionHead}>
                    <Text style={[styles.label, { flex: 1 }]}>{labelText}</Text>
                    {weightPct > 0 && (
                      <View style={styles.weightBadge}>
                        <Text style={styles.weightBadgeText}>{weightPct}% weight{contrib ? ` · +${contrib}%` : ""}</Text>
                      </View>
                    )}
                  </View>
                  {!!criterionMeta?.description && <Text style={styles.meta}>{criterionMeta.description}</Text>}
                  {canReview ? (
                    <>
                      <ChoiceChips options={scoreLabels.slice(1).map((label, idx) => `${idx + 1} · ${label}`)} selected={score.rating ? `${score.rating} · ${scoreLabels[score.rating]}` : ""} onSelect={rating => { if (!busy) changeScore(score.criterion, { rating: Number(rating[0]) }); }} />
                      <FrostedInput accessibilityLabel={`${labelText} rationale`} editable={!busy} multiline placeholder="Explain your rating" value={score.rationale} onChangeText={rationale => changeScore(score.criterion, { rationale })} maxLength={4000} />
                    </>
                  ) : <View style={styles.scoreReadOnly}>
                    <View accessibilityLabel={`${score.rating ?? 0} out of 5`} style={[styles.scoreCircle, { borderColor: scoreColor(score.rating), backgroundColor: scoreTint(score.rating) }]}>
                      <Text style={[styles.scoreValue, { color: scoreColor(score.rating) }]}>{score.rating ?? 0}</Text><Text style={styles.scoreOutOf}>/5</Text>
                    </View>
                    <View style={styles.scoreComment}><Text style={[styles.label, { color: scoreColor(score.rating) }]}>{score.rating ? scoreLabels[score.rating] : "No rating"}</Text><Text style={styles.copy}>{score.rationale || "No comments were recorded."}</Text></View>
                  </View>}
                </View>
              );})}
              {!canReview && detail.ballot && <FactRow label="Final recommendation" value={ballotLabels[detail.ballot]} last={!detail.overallComment} />}
              {!canReview && !!detail.overallComment && <FactRow label="Overall comments" value={detail.overallComment} last />}
              {canReview && (
                <>
                  <FormField label="Overall comments"><FrostedInput accessibilityLabel="Overall comments" multiline editable={!busy} value={overall} onChangeText={setOverall} maxLength={4000} /></FormField>
                  <SectionHeader title="Final recommendation" subtitle={`${reviewed.size} of ${steps.length} steps reviewed`} />
                  <ChoiceChips options={Object.values(ballotLabels)} selected={vote ? ballotLabels[vote] : ""} onSelect={label => setVote((Object.keys(ballotLabels) as Choice[]).find(key => ballotLabels[key] === label) ?? null)} />
                  <View style={styles.actionRow}>
                    <ActionButton label="Save assessment draft" compact variant="secondary" disabled={busy} onPress={() => perform({ name: "save", data: { scores: scores.filter(score => score.rating !== null || score.rationale.trim()), choice: vote ?? "", overallComment: overall } })} />
                    <ActionButton label="Submit assessment" compact disabled={busy || !vote || reviewed.size !== steps.length || !scores.length || scores.some(score => !score.rating || !score.rationale.trim())} onPress={() => { if (vote) perform({ name: "submit", data: { scores, choice: vote, overallComment: overall } }); }} />
                  </View>
                </>
              )}
            </GlassCard>
          )}
          {!!detail.history?.length && (
            <GlassCard style={styles.group}>
              <SectionHeader title="Previous rounds" />
              {detail.history.map((round, index) => {
                const histRubric = round.rubric?.length ? normalizeRubricCriteria(round.rubric) : roundRubric;
                return (
                <View key={round.id} style={[styles.criterion, index === detail.history!.length - 1 && styles.criterionLast]}>
                  <Text style={styles.label}>
                    {assessmentDate(round.date)} CAT{round.rubricVersion ? ` · Rubric v${round.rubricVersion}` : ""}{round.weightedTotal != null ? ` · ${round.weightedTotal}%` : ""}
                  </Text>
                  <Text style={styles.copy}>{round.recommendation ? ballotLabels[round.recommendation] : "No recommendation recorded"}</Text>
                  {round.scores.map(score => <Text key={score.criterion} style={styles.copy}>{criterionLabel(score.criterion, histRubric)} · {score.rating ?? "Unrated"}{score.rationale ? ` · ${score.rationale}` : ""}</Text>)}
                </View>
              );})}
            </GlassCard>
          )}
        </>
      )}

      {activeTab === "Discussion" && (
        <View style={styles.chatPanel}>
          <SectionHeader
            title="Panel discussion"
            subtitle={detail.discussion.length ? `${detail.discussion.length} message${detail.discussion.length === 1 ? "" : "s"}` : undefined}
          />
          {detail.discussion.length ? detail.discussion.map((entry, index) => {
            const day = chatDate(entry.at);
            const showDate = index === 0 || chatDate(detail.discussion[index - 1].at) !== day;
            return <View key={`${entry.at}-${index}`} style={styles.chatEntry}>
              {showDate && (
                <View style={styles.chatDate}>
                  <FrostedSurface variant="bar" borderRadius={999} />
                  <Text style={styles.chatDateText}>{day}</Text>
                </View>
              )}
              <View style={[styles.chatMessageRow, entry.mine && styles.chatMessageOwn]}>
                <View style={[styles.chatAvatar, entry.mine && styles.chatAvatarOwn]}><Text style={[styles.chatAvatarText, entry.mine && styles.chatAvatarTextOwn]}>{chatInitials(entry.name)}</Text></View>
                <View style={styles.chatContent}>
                  <View style={[styles.chatMetaRow, entry.mine && styles.chatMetaOwn]}>
                    {entry.mine ? <><Text style={styles.chatTime}>{chatTime(entry.at)}</Text><Text style={styles.chatNameOwn}>You</Text></>
                      : <><Text style={styles.chatName}>{entry.name}</Text><Text style={styles.chatTime}>{chatTime(entry.at)}</Text></>}
                  </View>
                  <View style={[styles.chatBubble, entry.mine && styles.chatBubbleOwn]}>
                    {!entry.mine && <FrostedSurface variant="card" borderRadius={18} />}
                    <Text style={[styles.chatBubbleText, entry.mine && styles.chatBubbleTextOwn]}>{entry.body}</Text>
                  </View>
                </View>
              </View>
            </View>
          }) : (
            <GlassCard style={styles.emptyCard}>
              <Text style={styles.copy}>There are no messages in this round.</Text>
            </GlassCard>
          )}
          {canDiscuss && (
            <View style={styles.messageComposer}>
              <FrostedSurface variant="bar" borderRadius={28} />
              <FrostedInput accessibilityLabel="Panel message" placeholder="Write a message..." multiline editable={!busy} value={comment} onChangeText={setComment} maxLength={4000} style={styles.messageInput} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                disabled={busy || !comment.trim()}
                onPress={() => perform({ name: "comment", data: { body: comment.trim() } })}
                style={({ pressed }) => [
                  styles.sendCircle,
                  (busy || !comment.trim()) && styles.sendCircleDisabled,
                  pressed && !busy && comment.trim() ? { opacity: 0.78 } : null,
                ]}
              >
                <Text style={styles.sendArrow} accessible={false}>{"↑"}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {activeTab === "Panel" && showPanel && (
        <>
          <GlassCard style={styles.group}>
            <SectionHeader title="Review progress" subtitle={`${item.reviewCount} of ${item.memberCount} submitted`} />
            {detail.panel.length ? detail.panel.map((member, index) => (
              <View key={member.id} style={[styles.panelEntry, index === detail.panel.length - 1 && styles.criterionLast]}>
                <IconRow
                  title={member.name}
                  detail={member.conflict === "recused" ? "Recused" : member.submitted ? `Review submitted${member.weightedTotal != null ? ` · Weighted ${member.weightedTotal}% (${member.weightedScore}/5)` : ""}` : member.conflict === "cleared" ? "Review pending" : "Conflict declaration pending"}
                  icon="people"
                  last
                />
                {member.scores?.map(score => <Text key={score.criterion} style={styles.copy}>{criterionLabel(score.criterion, roundRubric)} · {score.rating}/5{score.rationale ? ` · ${score.rationale}` : ""}</Text>)}
              </View>
            )) : <Text style={styles.copy}>No assessors are assigned.</Text>}
          </GlassCard>
          {canAssignPanel && (
            <GlassCard style={styles.group}>
              <SectionHeader title="Select assessors" subtitle="Tick assessors to include on this panel, or untick to remove before review starts." />
              {renderAssignFields()}
            </GlassCard>
          )}
          {item.canManage && item.roundState === "review" && (
            <GlassCard style={styles.noticeCard}>
              <Text style={styles.copy}>Review is in progress. Once reviews are submitted, open the Decision tab to vote and record the outcome.</Text>
            </GlassCard>
          )}
        </>
      )}

      {activeTab === "Decision" && (
        <>
          <GlassCard style={styles.group}>
            <SectionHeader title="Decision" />
            {["Approved", "Awarded", "Rejected"].includes(item.status) && <View style={styles.status}><StatusPill status={item.status} /></View>}
            <FactRow label="Reviews submitted" value={`${item.reviewCount} of ${item.memberCount}`} />
            <FactRow label="Round stage" value={roundLabel(item)} />
            <FactRow label="Application outcome" value={["Approved", "Awarded", "Rejected"].includes(item.status) ? item.status : "Pending"} last={!detail.decision && item.roundState !== "review" && item.status !== "Awarded"} />
            {item.status === "Awarded" && item.awardData && (
              <>
                <FactRow label="Award title" value={String(item.awardData.awardTitle || `CEDA Innovation Award: ${item.title}`)} />
                <FactRow label="Award category" value={String(item.awardData.awardCategory || "Innovation Recognition & Support")} />
                {item.awardData.awardAmount ? <FactRow label="Support package" value={String(item.awardData.awardAmount)} /> : null}
                <FactRow label="Conferred" value={String(item.awardData.conferredAt || item.awardedAt || "Recorded")} last={!detail.decision} />
              </>
            )}
            {item.roundState === "review" && (
              <Text style={styles.copy}>
                {item.memberCount > 0 && item.reviewCount >= item.memberCount
                  ? `All ${item.memberCount} of ${item.memberCount} assessors have finished reviewing. Ready to move to voting.`
                  : `${item.reviewCount} of ${item.memberCount} assessors have submitted their reviews so far.`}
              </Text>
            )}
            {detail.decision ? (
              <>
                <FactRow label="Required ballots" value={String(detail.decision.quorum)} />
                {detail.decision.validBallots !== undefined && <FactRow label="Valid ballots" value={String(detail.decision.validBallots)} />}
                {detail.decision.eligibleReviewers !== undefined && <FactRow label="Cleared panel members" value={String(detail.decision.eligibleReviewers)} />}
                {!!detail.scoreStats?.count && <>
                  <FactRow label="Reviews included" value={String(detail.scoreStats.count)} />
                  {detail.scoreStats.weightedTotalMean != null && (
                    <FactRow
                      label="Weighted mean / median"
                      value={`${detail.scoreStats.weightedTotalMean}% · Median ${detail.scoreStats.weightedTotalMedian ?? "N/A"}%`}
                    />
                  )}
                  {detail.scoreStats.passThreshold != null && (
                    <FactRow
                      label="Pass benchmark"
                      value={`${detail.scoreStats.passThreshold}%${detail.scoreStats.meetsThreshold === true ? " · Met" : detail.scoreStats.meetsThreshold === false ? " · Below benchmark" : ""}`}
                    />
                  )}
                  <FactRow label="Mean score (1 to 5)" value={String(detail.scoreStats.mean ?? "N/A")} />
                  <FactRow label="Median score (1 to 5)" value={String(detail.scoreStats.median ?? "N/A")} />
                </>}
                <FactRow label="Recommendation" value={detail.decision.recommendation ? ballotLabels[detail.decision.recommendation] : "Pending"} last={!detail.decision.totals || item.roundState === "voting"} />
                {detail.decision.totals && item.roundState !== "voting" && Object.entries(detail.decision.totals).map(([choice, count], idx, arr) => <FactRow key={choice} label={ballotLabels[choice as Choice]} value={String(count)} last={idx === arr.length - 1} />)}
              </>
            ) : <Text style={styles.copy}>Decision information will appear when the round is ready.</Text>}
            {detail.ballot && <Text style={styles.notice}>Your vote was recorded as {ballotLabels[detail.ballot].toLowerCase()}.</Text>}
            {canVote && (
              <>
                <ChoiceChips options={Object.values(ballotLabels)} selected={vote ? ballotLabels[vote] : ""} onSelect={value => setVote((Object.keys(ballotLabels) as Choice[]).find(key => ballotLabels[key] === value) ?? null)} />
                <View style={styles.actionRow}>
                  <ActionButton label="Cast vote" compact disabled={busy || !vote} onPress={() => { if (vote) perform({ name: "vote", data: { choice: vote } }); }} />
                </View>
              </>
            )}
            {canManage && item.roundState === "review" && (
              <>
                <FormField label="Voting deadline (optional)" hint="YYYY-MM-DD HH:MM, Botswana time. Defaults to 24 hours after voting opens.">
                  <FrostedInput accessibilityLabel="Voting deadline in Botswana time" placeholder="YYYY-MM-DD HH:MM" value={votingDeadline} onChangeText={setVotingDeadline} maxLength={16} editable={!busy && !hold} />
                </FormField>
                <View style={styles.actionRow}>
                  <ActionButton label="Open voting" compact disabled={busy || hold || item.reviewCount < (detail.decision?.quorum ?? 1) || (!!votingDeadline && (!votingDeadlineValue || new Date(votingDeadlineValue) <= new Date()))} onPress={() => perform({ name: "open-vote", data: votingDeadlineValue ? { deadline: votingDeadlineValue } : {} })} />
                </View>
              </>
            )}
            {canManage && item.roundState === "voting" && (
              <View style={styles.actionRow}>
                <ActionButton label="Close voting" compact disabled={busy || hold} onPress={() => perform({ name: "close-vote" })} />
              </View>
            )}
          </GlassCard>
          {canManage && ((item.roundState === "closed" && detail.decision?.recommendation) || item.roundState === "awaiting-information") && (
            <GlassCard style={styles.group}>
              <SectionHeader title="Applicant communication" />
              <FormField label="Applicant-facing feedback">
                <FrostedInput accessibilityLabel="Applicant-facing feedback" multiline editable={!busy && item.roundState === "closed"} value={feedback} onChangeText={setFeedback} maxLength={4000} />
              </FormField>
              {item.roundState === "closed" && terminalRecommendation && (
                <View style={styles.actionRow}>
                  <ActionButton label="Save decision feedback" compact variant="secondary" disabled={busy || hold || feedback.trim().length < 5} onPress={() => perform({ name: "decision", data: { feedback: feedback.trim() } })} />
                </View>
              )}
              {item.roundState === "closed" && detail.decision?.recommendation === "request-information" && (
                <>
                  <FormField label="Response deadline" hint="YYYY-MM-DD HH:MM, Botswana time"><FrostedInput accessibilityLabel="Response deadline in Botswana time" placeholder="YYYY-MM-DD HH:MM" value={informationDeadline} onChangeText={setInformationDeadline} maxLength={16} /></FormField>
                  <View style={styles.actionRow}>
                    <ActionButton label="Request information" compact disabled={busy || feedback.trim().length < 5 || !infoDeadlineValue || new Date(infoDeadlineValue) <= new Date() || hold} onPress={() => { if (infoDeadlineValue) perform({ name: "request-information", data: { feedback: feedback.trim(), deadline: infoDeadlineValue } }); }} />
                  </View>
                </>
              )}
            </GlassCard>
          )}
          {caseOpen && item.canManage && item.roundState && !["released", "awarded", "archived"].includes(item.roundState) && (
            <GlassCard style={styles.group}>
              <SectionHeader title="Round controls" />
              <FormField label="Reason"><FrostedInput accessibilityLabel="Reason for round control" multiline editable={!busy} value={reason} onChangeText={setReason} maxLength={1000} /></FormField>
              <View style={styles.actionRow}>
                <ActionButton label={hold ? "Resume round" : "Place round on hold"} compact variant="secondary" disabled={busy || reason.trim().length < 5 || (!hold && !canManage)} onPress={() => perform({ name: hold ? "resume" : "hold", data: { reason: reason.trim() } })} />
                {canManage && item.status !== "Changes requested" && ["review", "closed", "awaiting-information"].includes(item.roundState) && <ActionButton label="Start reassessment" compact variant="secondary" disabled={busy || reason.trim().length < 5 || hold} onPress={() => perform({ name: "reassess", data: { reason: reason.trim() } })} />}
              </View>
            </GlassCard>
          )}
          {item.canRelease && item.roundState === "closed" && terminalRecommendation && (
            <GlassCard style={styles.group}>
              <SectionHeader title="Outcome release" />
              <View style={styles.actionRow}>
                {releaseVerified ? <ActionButton label="Release outcome" compact disabled={busy || hold || feedback.trim() !== detail.decision?.feedback?.trim() || (detail.decision?.feedback?.trim().length ?? 0) < 5} onPress={() => perform({ name: "release" })} />
                  : <ActionButton label="Verify authenticator to release" compact variant="secondary" disabled={busy || hold} onPress={onVerifyRelease} />}
              </View>
            </GlassCard>
          )}
          {item.canRelease && item.status === "Approved" && item.roundState === "released" && !hold && (
            <GlassCard style={styles.group}>
              <SectionHeader title="Award stage conferral" subtitle="Advance this Approved application into the final Award stage. Prefilled defaults can be tailored." />
              <FormField label="Award title">
                <FrostedInput accessibilityLabel="Award title" editable={!busy} value={awardTitle} onChangeText={setAwardTitle} maxLength={160} />
              </FormField>
              <FormField label="Award category">
                <ChoiceChips
                  options={["Innovation Recognition & Support", "Seed Innovation Grant", "Commercialization & Incubation", "Export Readiness Award"]}
                  selected={awardCategory}
                  onSelect={setAwardCategory}
                />
              </FormField>
              <FormField label="Support / grant package (optional)">
                <FrostedInput accessibilityLabel="Support or grant package" editable={!busy} value={awardAmount} onChangeText={setAwardAmount} placeholder="e.g. P250,000 + Incubation" maxLength={120} />
              </FormField>
              <FormField label="Award summary">
                <FrostedInput accessibilityLabel="Award summary" multiline editable={!busy} value={awardSummary} onChangeText={setAwardSummary} maxLength={2000} />
              </FormField>
              <View style={styles.actionRow}>
                {releaseVerified
                  ? <ActionButton label="Confer award" compact disabled={busy || awardTitle.trim().length < 3} onPress={() => perform({ name: "award", data: { awardTitle: awardTitle.trim(), awardCategory, awardAmount: awardAmount.trim(), awardSummary: awardSummary.trim() } })} />
                  : <ActionButton label="Verify authenticator to confer award" compact variant="secondary" disabled={busy} onPress={onVerifyRelease} />}
              </View>
            </GlassCard>
          )}
        </>
      )}

      {evidence && <FlushSheetModal visible eyebrow="Supporting evidence" title={evidence.title} onClose={() => setEvidence(null)}>
        <View style={styles.group}>
          <View style={styles.actionRow}>
            <Pressable accessibilityRole="button" onPress={() => void openEvidence(evidence)} style={styles.documentPill}><Text style={styles.documentPillText}>Open preview</Text></Pressable>
          </View>
          {commentsFor(`document:${evidence.id}`, evidence.title)}
        </View>
      </FlushSheetModal>}
      {thread && <FlushSheetModal visible eyebrow="Review comments" title={thread.label} onClose={() => setThread(null)}>
        <View style={styles.group}>
          {(detail.annotations ?? []).filter(entry => entry.anchor === thread.anchor).map(entry => (
            <View key={entry.id} style={styles.threadEntry}>
              {entry.parentId && <Text style={styles.meta}>Reply to {detail.annotations?.find(parent => parent.id === entry.parentId)?.name ?? "comment"}</Text>}
              <View style={styles.threadHeader}>
                <Text style={styles.label}>{entry.name}</Text>
                {canAnnotate && (
                  <Pressable accessibilityRole="button" onPress={() => setReply(entry.id)} style={styles.navPill}>
                    <Text style={styles.navPillText}>Reply</Text>
                  </Pressable>
                )}
              </View>
              <Text style={styles.copy}>{entry.body}</Text>
            </View>
          ))}
          {canAnnotate && <>
            <FrostedInput accessibilityLabel={reply ? "Reply" : "Comment"} placeholder={reply ? "Write a reply" : "Write a comment"} multiline value={annotation} onChangeText={setAnnotation} maxLength={4000} />
            {!!error && <Text accessibilityRole="alert" style={styles.warning}>{error}</Text>}
            <View style={styles.actionRow}>
              <ActionButton label={reply ? "Send reply" : "Add comment"} compact disabled={busy || !annotation.trim()} onPress={() => perform({ name: "annotate", data: { anchor: thread.anchor, parentId: reply, body: annotation.trim() } })} />
              {!!reply && <ActionButton label="Cancel reply" compact variant="secondary" onPress={() => setReply(null)} />}
            </View>
          </>}
        </View>
      </FlushSheetModal>}

      {assignOpen && canAssignPanel && (
        <FlushSheetModal visible eyebrow={item.reference} title="Assign assessors" onClose={() => { if (!busy) setAssignOpen(false); }}>
          <View style={styles.group}>
            <Text style={styles.copy}>Tick any active assessors for {item.sector || "this industry"} (strongest judgement match shown first) and confirm when reviews are due.</Text>
            {!!error && <Text accessibilityRole="alert" style={styles.warning}>{error}</Text>}
            {renderAssignFields()}
          </View>
        </FlushSheetModal>
      )}
      {confirmation && confirm && (
        <FlushSheetModal visible title={confirm.title} eyebrow={item.reference} onClose={() => setConfirmation(null)}>
          <View style={styles.group}>
            <Text style={styles.copy}>{confirm.message}</Text>
            <View style={styles.actionRow}>
              <ActionButton label="Confirm" compact onPress={() => { const action = confirmation; setConfirmation(null); void apply(action); }} />
              <ActionButton label="Cancel" compact variant="secondary" onPress={() => setConfirmation(null)} />
            </View>
          </View>
        </FlushSheetModal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: 12 },
  noticeCard: { gap: 8, paddingVertical: 14 },
  emptyCard: { paddingVertical: 20, alignItems: "center" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  textRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  stepFooter: { gap: 10, paddingTop: 4 },
  stepNavLinks: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  navPill: {
    minHeight: 34,
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: buttonCornerRadius,
    backgroundColor: "rgba(25,44,64,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  navPillText: { color: colors.navy, fontSize: fontSizes.subbody, fontWeight: "600" },
  navPillPrimary: {
    minHeight: 36,
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: buttonCornerRadius,
    backgroundColor: "rgba(154,61,43,0.11)",
    justifyContent: "center",
    alignItems: "center",
  },
  navPillPrimaryText: { color: colors.rustDark, fontSize: fontSizes.subbody, fontWeight: "700" },
  commentAvatar: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 7,
    borderRadius: 14,
    backgroundColor: "#FBECE7",
    alignItems: "center",
    justifyContent: "center",
  },
  commentAvatarAdd: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(25,44,64,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  commentAvatarText: { color: colors.rustDark, fontSize: fontSizes.caption, fontWeight: "700" },
  attachment: { flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "space-between", paddingVertical: 5 },
  attachmentDetails: { flex: 1, gap: 8, alignItems: "flex-start" },
  documentPill: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: buttonCornerRadius,
    backgroundColor: "rgba(154,61,43,0.10)",
  },
  documentPillText: { color: colors.rustDark, fontSize: fontSizes.subbody, fontWeight: "700" },
  stepTrack: { paddingVertical: 8, paddingHorizontal: 2 },
  stepPressable: { width: "100%" },
  stepItem: { minHeight: 52, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepRail: { width: 36, alignItems: "center", alignSelf: "stretch" },
  stepCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#E8E3DC" },
  stepLine: { flex: 1, width: 2, minHeight: 18, backgroundColor: "#DED7CE" },
  stepLineComplete: { backgroundColor: colors.tealBright },
  stepComplete: { backgroundColor: colors.tealBright },
  stepCurrent: { backgroundColor: "#DFF2EE", borderWidth: 2, borderStyle: "dotted", borderColor: colors.teal },
  stepNumber: { color: colors.muted, fontSize: fontSizes.caption, fontWeight: "700" },
  stepNumberActive: { color: colors.teal },
  stepLabel: { flex: 1, paddingTop: 6, color: colors.navy, fontSize: fontSizes.subbody, lineHeight: 18 },
  stepLabelCurrent: { color: colors.teal, fontWeight: "700" },
  scoreReadOnly: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 4 },
  scoreCircle: { width: 68, height: 68, borderRadius: 34, borderWidth: 6, flexDirection: "row", alignItems: "baseline", justifyContent: "center", paddingTop: 14 },
  scoreValue: { fontSize: 24, fontWeight: "800" },
  scoreOutOf: { color: colors.muted, fontSize: fontSizes.caption, fontWeight: "700" },
  scoreComment: { flex: 1, gap: 4 },
  chatPanel: { gap: 14, minHeight: 380, paddingVertical: 4 },
  chatEntry: { gap: 12 },
  chatDate: {
    overflow: "hidden",
    alignSelf: "center",
    paddingHorizontal: 13,
    paddingVertical: 5,
    borderRadius: buttonCornerRadius,
    backgroundColor: "rgba(255,250,244,0.92)",
    shadowColor: "#261B16",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  chatDateText: { color: colors.subtle, fontSize: fontSizes.caption, fontWeight: "700" },
  chatMessageRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, maxWidth: "90%" },
  chatMessageOwn: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  chatAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(35,109,97,0.12)" },
  chatAvatarOwn: { backgroundColor: "rgba(154,61,43,0.13)" },
  chatAvatarText: { color: colors.teal, fontSize: fontSizes.caption, fontWeight: "800" },
  chatAvatarTextOwn: { color: colors.rustDark },
  chatContent: { flexShrink: 1, gap: 4 },
  chatMetaRow: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 2 },
  chatMetaOwn: { justifyContent: "flex-end" },
  chatName: { color: colors.teal, fontSize: fontSizes.subbody, fontWeight: "700" },
  chatNameOwn: { color: colors.rustDark, fontSize: fontSizes.subbody, fontWeight: "700" },
  chatTime: { color: colors.subtle, fontSize: fontSizes.caption },
  chatBubble: {
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 18,
    borderTopLeftRadius: 5,
    backgroundColor: "rgba(255,250,244,0.94)",
    shadowColor: "#261B16",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  chatBubbleOwn: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 5,
    backgroundColor: colors.rust,
    shadowColor: "#4A1E15",
    shadowOpacity: 0.14,
  },
  chatBubbleText: { color: colors.navy, fontSize: fontSizes.body, lineHeight: 21 },
  chatBubbleTextOwn: { color: colors.white },
  messageComposer: {
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginTop: 6,
    paddingLeft: 14,
    paddingRight: 7,
    paddingVertical: 7,
    borderRadius: 28,
    backgroundColor: "rgba(255,250,244,0.94)",
    shadowColor: "#261B16",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
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
    backgroundColor: colors.rust,
    alignItems: "center",
    justifyContent: "center",
  },
  sendCircleDisabled: { opacity: 0.42 },
  sendArrow: { color: colors.white, fontSize: 18, fontWeight: "700", lineHeight: 20 },
  threadEntry: {
    gap: 6,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(247,242,235,0.85)",
  },
  threadHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  panelEntry: {
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(36,28,25,0.08)",
  },
  title: { color: colors.navy, fontSize: fontSizes.title, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: fontSizes.caption },
  status: { alignSelf: "flex-start" },
  copy: { color: colors.muted, fontSize: fontSizes.body, lineHeight: 22 },
  label: { color: colors.navy, fontSize: fontSizes.body, fontWeight: "700" },
  warning: { color: colors.rustDark, fontSize: fontSizes.subbody, fontWeight: "600" },
  notice: { color: colors.teal, fontSize: fontSizes.subbody, fontWeight: "600" },
  criterion: {
    gap: 9,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(36,28,25,0.08)",
  },
  criterionHead: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  weightedBanner: { padding: 12, borderRadius: 14, backgroundColor: "rgba(247,242,235,0.92)", borderWidth: 1, borderColor: "rgba(36,28,25,0.08)", gap: 4 },
  weightedBannerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  weightBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: "#EFE8DF" },
  weightBadgePass: { backgroundColor: "#ECFDF3" },
  weightBadgeBelow: { backgroundColor: "#FEF2F2" },
  weightBadgeText: { fontSize: 11, fontWeight: "700", color: colors.navy },
  weightBadgePassText: { color: "#166534" },
  weightBadgeBelowText: { color: "#991B1B" },
  criterionLast: { borderBottomWidth: 0, paddingBottom: 2 },
  tabs: { alignItems: "center", gap: 8, paddingRight: 6, paddingVertical: 4 },
  tab: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 15,
    borderRadius: buttonCornerRadius,
    backgroundColor: "rgba(255,250,244,0.92)",
    shadowColor: "#261B16",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  activeTab: { backgroundColor: colors.navy, shadowOpacity: 0.10 },
  tabLabel: { color: colors.muted, fontSize: fontSizes.subbody, fontWeight: "500" },
  activeTabLabel: { color: colors.white, fontWeight: "700" },
});
