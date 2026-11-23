import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { pickEvidenceDocument } from "./filePicker";
import { FrostedSurface } from "./FrostedGlass";
import {
  addApplicationDocument,
  createDraftApplication,
  deletePrivateEvidenceObject,
  generateIdempotencyKey,
  removeApplicationDocument,
  saveDraftApplication,
  submitApplication,
  uploadPrivateEvidenceFile,
  type InnovatorProfile,
  type PortalDocumentItem,
  type SectorOption,
} from "./innovatorApi";
import { normalizeApplicationFormConfig, type ApplicationFormConfig } from "./portalCatalog";
import {
  buildReceiptSummaryText,
  evaluateApplicationReadiness,
  evaluateStepReadiness,
  sanitizeFileName,
  validateEvidenceFile,
  validateVideoLink,
  WIZARD_STEPS,
  type InnovatorApplication,
  type InnovatorDocument,
  type WizardFormData,
} from "./innovatorDomain";
import {
  ActionButton,
  adminStyleColors,
  ChoiceChips,
  FactRow,
  FlushSheetModal,
  GlassCard,
  IconRow,
  InnovatorIcon,
  PrivateDocPreviewModal,
  ProgressBar,
  SectionHeader,
  StatusPill,
  SubscreenHero,
  useInnovatorA11y,
} from "./InnovatorUI";
import { WizardStepBody } from "./InnovatorWizardSteps";
import { buttonCornerRadius } from "./theme";

export type WizardScreenMode = "start" | "wizard" | "success";

export function InnovatorWizard({
  token,
  profile,
  sectors,
  applications,
  documents,
  initialDraftAppId,
  mode,
  onModeChange,
  onDirtyChange,
  onApplicationUpdated,
  onDocumentsUpdated,
  onViewApplication,
  onReturnOverview,
  onOpenLiveChat,
  saveTriggerRef,
  applicationFormConfig,
  portalDocuments,
}: {
  token: string;
  profile: InnovatorProfile;
  sectors: SectorOption[];
  applications: InnovatorApplication[];
  documents: InnovatorDocument[];
  initialDraftAppId: string | null;
  mode: WizardScreenMode;
  onModeChange: (next: WizardScreenMode) => void;
  onDirtyChange: (dirty: boolean) => void;
  onApplicationUpdated: (app: InnovatorApplication) => void;
  onDocumentsUpdated: (docs: InnovatorDocument[]) => void;
  onViewApplication: (appId: string) => void;
  onReturnOverview: () => void;
  onOpenLiveChat?: (ctx: { applicationRef: string | null; wizardStep: number; stepTitle: string }) => void;
  saveTriggerRef: React.MutableRefObject<(() => Promise<boolean>) | null>;
  applicationFormConfig?: ApplicationFormConfig | Record<string, unknown> | null;
  portalDocuments?: PortalDocumentItem[];
}) {
  const formConfig = normalizeApplicationFormConfig(applicationFormConfig);
  const insets = useSafeAreaInsets();
  const { fs, reducedMotion } = useInnovatorA11y();

  const [startType, setStartType] = useState<"Individual" | "Registered company">("Individual");
  const [startSectorId, setStartSectorId] = useState<string>(sectors[0]?.id || "");
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const [activeAppId, setActiveAppId] = useState<string | null>(initialDraftAppId);
  const [step, setStep] = useState<number>(1);
  const [formData, setFormData] = useState<WizardFormData>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedText, setLastSavedText] = useState<string>("Autosave ready");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [districtExpanded, setDistrictExpanded] = useState(false);

  const [stepPickerOpen, setStepPickerOpen] = useState(false);
  const [previewAppOpen, setPreviewAppOpen] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [evidenceSection, setEvidenceSection] = useState("supplementary");
  const [evidenceCategory, setEvidenceCategory] = useState("Innovation proposal or pitch deck");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [replacingDocId, setReplacingDocId] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [inlineBusyKey, setInlineBusyKey] = useState<string | null>(null);
  const [evidenceFeedback, setEvidenceFeedback] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoSection, setVideoSection] = useState("feasibility");
  const [previewDoc, setPreviewDoc] = useState<InnovatorDocument | null>(null);

  const [submittedApp, setSubmittedApp] = useState<InnovatorApplication | null>(null);
  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey());
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedIdRef = useRef<string | null>(null);
  const successScale = useRef(new Animated.Value(reducedMotion ? 1 : 0.72)).current;

  const activeApp = useMemo(
    () => applications.find((a) => a.id === activeAppId) || null,
    [applications, activeAppId]
  );

  const drafts = useMemo(
    () => applications.filter((a) => a.status === "Draft"),
    [applications]
  );

  useEffect(() => {
    if (!startSectorId && sectors[0]?.id) setStartSectorId(sectors[0].id);
  }, [sectors, startSectorId]);

  useEffect(() => {
    if (initialDraftAppId && initialDraftAppId !== activeAppId) {
      hydratedIdRef.current = null;
      setActiveAppId(initialDraftAppId);
    } else if (mode === "wizard" && !activeAppId && initialDraftAppId) {
      hydratedIdRef.current = null;
      setActiveAppId(initialDraftAppId);
    }
  }, [initialDraftAppId, mode]);

  useEffect(() => {
    if (!activeApp || mode !== "wizard") return;
    if (hydratedIdRef.current === activeApp.id) return;
    hydratedIdRef.current = activeApp.id;
    const f = { ...(activeApp.formData || {}) };
    if (!f.applicantType) f.applicantType = activeApp.applicantType || "Individual";
    if (profile.fullName) f.fullName = profile.fullName;
    if (profile.email) f.email = profile.email;
    if (!f.phone) f.phone = profile.phone || "";
    if (!f.district) f.district = profile.district || "Gaborone";
    if (!f.expertise) f.expertise = profile.expertise || "";
    if (!f.companyName && profile.companyName) f.companyName = profile.companyName;
    if (!f.companyRegNumber && profile.companyRegNumber) f.companyRegNumber = profile.companyRegNumber;
    if (!f.companySector && profile.companySector) f.companySector = profile.companySector;
    if (!f.representativeRole && profile.companyRole) f.representativeRole = profile.companyRole;
    if (!f.primarySector && activeApp.sector) f.primarySector = activeApp.sector;
    if (!f.stage) f.stage = "Prototype";
    setFormData(f);
    setStep(Math.min(12, Math.max(1, activeApp.currentStep || 1)));
    setDirty(false);
    onDirtyChange(false);
    setSaveError(null);
    setLastSavedText(activeApp.updatedAt ? `Saved ${activeApp.updatedAt}` : "Autosave ready");
    idempotencyKeyRef.current = generateIdempotencyKey();
  }, [activeApp, mode, profile]);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty]);

  useEffect(() => {
    if (mode !== "success") return;
    if (reducedMotion) {
      successScale.setValue(1);
      return;
    }
    successScale.setValue(0.65);
    Animated.spring(successScale, {
      toValue: 1,
      friction: 6,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [mode, reducedMotion]);

  const draftDocs = useMemo(
    () =>
      activeApp
        ? documents.filter((d) => d.applicationId === activeApp.id && d.uploadStatus !== "Removed")
        : [],
    [documents, activeApp]
  );

  const readiness = useMemo(
    () => evaluateApplicationReadiness(activeApp ? { id: activeApp.id, formData } : null, documents, formConfig),
    [activeApp, formData, documents, formConfig]
  );

  async function persistDraft(stepOverride?: number): Promise<boolean> {
    if (!activeApp || activeApp.status !== "Draft") return true;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await saveDraftApplication(
        token,
        activeApp.id,
        stepOverride ?? step,
        formData,
        activeApp.version
      );
      onApplicationUpdated(updated);
      setDirty(false);
      setLastSavedText(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save draft.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    saveTriggerRef.current = () => persistDraft(step);
    return () => {
      saveTriggerRef.current = null;
    };
  });

  useEffect(() => {
    if (!dirty || mode !== "wizard" || !activeApp || activeApp.status !== "Draft") return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void persistDraft(step);
    }, 1200);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [formData, dirty, step, mode, activeApp?.id, activeApp?.version]);

  function setField<K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function toggleArrayValue(key: "innovationType" | "beneficiaries", value: string) {
    setFormData((prev) => {
      const current = Array.isArray(prev[key]) ? prev[key] : [];
      const next = current.includes(value) ? current.filter((x) => x !== value) : [...current, value];
      return { ...prev, [key]: next };
    });
    setDirty(true);
  }

  async function handleCreateDraft() {
    if (!startSectorId) {
      setStartError("Select an innovation sector to continue.");
      return;
    }
    setStartBusy(true);
    setStartError(null);
    try {
      const created = await createDraftApplication(token, startType, startSectorId);
      onApplicationUpdated(created);
      hydratedIdRef.current = null;
      setActiveAppId(created.id);
      onModeChange("wizard");
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Unable to start draft.");
    } finally {
      setStartBusy(false);
    }
  }

  function openExistingDraft(draft: InnovatorApplication) {
    hydratedIdRef.current = null;
    setActiveAppId(draft.id);
    onModeChange("wizard");
  }

  async function goToStep(nextStep: number) {
    if (dirty && !(await persistDraft(nextStep))) return;
    setStep(nextStep);
  }

  async function uploadFileAssetToDraft(opts: {
    sectionKey: string;
    category: string;
    title?: string;
    description?: string;
    replaceExistingId?: string | null;
    busyKey?: string | null;
    onSuccess?: () => void;
  }) {
    if (!activeApp) return;
    setEvidenceFeedback(null);
    const picked = await pickEvidenceDocument();
    if (!picked) return;

    const validationErr = validateEvidenceFile(picked, draftDocs, opts.sectionKey, "file");
    if (validationErr) {
      setEvidenceFeedback(validationErr);
      return;
    }

    const storagePath = `${profile.id}/${activeApp.id}/${Date.now()}-${sanitizeFileName(picked.name)}`;
    if (opts.busyKey) setInlineBusyKey(opts.busyKey);
    setUploadPercent(5);
    try {
      await uploadPrivateEvidenceFile(token, storagePath, picked, (pct) => setUploadPercent(pct));
      const nextDocs = await addApplicationDocument(token, {
        appId: activeApp.id,
        sectionKey: opts.sectionKey,
        docKind: "file",
        title: opts.title?.trim() || picked.name,
        category: opts.category || "Supporting document",
        description: opts.description?.trim() || "",
        fileName: picked.name,
        mimeType: picked.type,
        fileSize: picked.size,
        storagePath,
          replaceDocId: opts.replaceExistingId ?? undefined,
      });
        if (opts.replaceExistingId) {
          const old = draftDocs.find((d) => d.id === opts.replaceExistingId);
          if (old?.storagePath) await deletePrivateEvidenceObject(token, old.storagePath);
          setReplacingDocId(null);
        }
      onDocumentsUpdated(nextDocs);
      opts.onSuccess?.();
      setEvidenceFeedback(`Uploaded "${picked.name}" privately.`);
    } catch (err) {
      await deletePrivateEvidenceObject(token, storagePath);
      setEvidenceFeedback(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadPercent(null);
      if (opts.busyKey) setInlineBusyKey(null);
    }
  }

  async function handlePickAndUploadFile() {
    await uploadFileAssetToDraft({
      sectionKey: evidenceSection,
      category: evidenceCategory,
      title: evidenceTitle,
      description: evidenceNotes,
      replaceExistingId: replacingDocId,
      busyKey: "step11",
      onSuccess: () => {
        setEvidenceTitle("");
        setEvidenceNotes("");
      },
    });
  }

  async function handleUploadVerificationSlot(category: string, label: string) {
    await uploadFileAssetToDraft({
      sectionKey: "applicant",
      category,
      title: label,
      description: "Applicant verification document",
      busyKey: `verify:${category}`,
    });
  }

  async function handleAttachInlineField(fieldName: string, sectionKey: string) {
    await uploadFileAssetToDraft({
      sectionKey,
      category: `Answer: ${fieldName}`,
      description: `Supporting ${fieldName}`,
      busyKey: `field:${fieldName}`,
    });
  }

  async function handleAddVideoLink() {
    if (!activeApp) return;
    const err = validateVideoLink(videoUrl);
    if (err) {
      setEvidenceFeedback(err);
      return;
    }
    try {
      const nextDocs = await addApplicationDocument(token, {
        appId: activeApp.id,
        sectionKey: videoSection,
        docKind: "video_link",
        title: videoTitle.trim() || "Prototype demonstration video",
        category: "Demonstration link",
        description: "",
        fileName: videoTitle.trim() || "Prototype video",
        mimeType: "text/uri-list",
        fileSize: 0,
        storagePath: null,
        videoUrl: videoUrl.trim(),
      });
      onDocumentsUpdated(nextDocs);
      setVideoTitle("");
      setVideoUrl("");
      setEvidenceFeedback("HTTPS demonstration video attached.");
    } catch (e) {
      setEvidenceFeedback(e instanceof Error ? e.message : "Could not attach video link.");
    }
  }

  async function handleRemoveDoc(doc: InnovatorDocument) {
    try {
      const nextDocs = await removeApplicationDocument(token, doc.id);
      if (doc.storagePath) await deletePrivateEvidenceObject(token, doc.storagePath);
      onDocumentsUpdated(nextDocs);
      setEvidenceFeedback("Evidence item removed from draft.");
    } catch (err) {
      setEvidenceFeedback(err instanceof Error ? err.message : "Could not remove document.");
    }
  }

  async function handleFinalSubmit() {
    if (!activeApp) return;
    setSubmitBusy(true);
    setSubmitError(null);
    try {
      const submitted = await submitApplication(token, {
        appId: activeApp.id,
        formData,
        expectedVersion: activeApp.version,
        idempotencyKey: idempotencyKeyRef.current,
      });
      onApplicationUpdated(submitted);
      setDirty(false);
      onDirtyChange(false);
      setSubmitModalOpen(false);
      setSubmittedApp(submitted);
      setActiveAppId(null);
      hydratedIdRef.current = null;
      onModeChange("success");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitBusy(false);
    }
  }

  if (mode === "success" && submittedApp) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <GlassCard style={{ alignItems: "center" }}>
          <Animated.View style={[styles.successCircle, { transform: [{ scale: successScale }] }]}>
            <InnovatorIcon name="check" color={adminStyleColors.white} />
          </Animated.View>
          <Text style={[styles.eyebrow, { fontSize: fs("caption"), marginTop: 8 }]}>
            APPLICATION SUBMITTED
          </Text>
          <Text style={{ fontSize: fs("title"), fontWeight: "700", color: adminStyleColors.navy, textAlign: "center" }}>
            {submittedApp.title}
          </Text>
          <StatusPill status="Submitted" label={`Ref ${submittedApp.reference} · ${submittedApp.receiptCode || "Recorded"}`} />
          <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, textAlign: "center" }}>
            Submitted {submittedApp.submittedDate || submittedApp.updatedAt}
          </Text>
        </GlassCard>

        <GlassCard>
          <SectionHeader eyebrow="NEXT STEPS" title="What happens next" />
          <FactRow
            label="1. Screening"
            value="CEDA checks sector alignment and confirms your private supporting evidence."
          />
          <FactRow
            label="2. Snapshot lock"
            value="Your submitted snapshot stays safely locked unless CEDA requests clarification."
          />
          <FactRow
            label="3. Alerts"
            value="Status updates, messages, and clarification deadlines appear under the header bell."
            last
          />
          <View style={styles.actionRow}>
            <ActionButton label="View application workspace" compact onPress={() => onViewApplication(submittedApp.id)} />
            <ActionButton
              label="Download / share receipt"
              compact
              variant="secondary"
              onPress={() =>
                void Share.share({
                  title: `${submittedApp.reference} Receipt`,
                  message: buildReceiptSummaryText(submittedApp, documents),
                })
              }
            />
            <ActionButton label="Return to overview" compact variant="secondary" onPress={onReturnOverview} />
          </View>
        </GlassCard>
      </ScrollView>
    );
  }

  if (mode === "start" || !activeApp) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <SubscreenHero
          icon="submit"
          color={adminStyleColors.rust}
          tint="#FBEDE8"
          eyebrow="INNOVATION SUBMISSION"
          title="Submit innovation"
          badge="12 steps"
          summary="Choose applicant type and CEDA sector. Your Step 1 contact & company defaults pre-fill automatically."
        />

        {drafts.length ? (
          <GlassCard style={{ paddingVertical: 8 }}>
            <SectionHeader eyebrow="RESUME WORK" title={`Private drafts (${drafts.length})`} />
            {drafts.map((d, idx) => (
              <IconRow
                key={d.id}
                title={d.title || "Untitled draft innovation"}
                detail={`${d.reference} · Step ${d.currentStep || 1}/12 · ${d.sector}`}
                icon="clock"
                color={adminStyleColors.amber}
                tint="#FCF4E4"
                badge="Resume"
                last={idx === drafts.length - 1}
                onPress={() => openExistingDraft(d)}
              />
            ))}
          </GlassCard>
        ) : null}

        <GlassCard>
          <SectionHeader eyebrow="STEP 0 · SETUP" title="Start a new application" />

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.navy }}>
              Applicant type
            </Text>
            <ChoiceChips
              options={["Individual", "Registered company"]}
              selected={startType}
              onSelect={(v) => setStartType(v as "Individual" | "Registered company")}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.navy }}>
              Innovation sector
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
              {sectors.map((sec) => {
                const active = sec.id === startSectorId;
                return (
                  <Pressable
                    key={sec.id}
                    onPress={() => setStartSectorId(sec.id)}
                    style={[styles.sectorChip, active ? styles.sectorChipActive : null]}
                  >
                    <Text
                      style={{
                        fontSize: fs("subbody"),
                        fontWeight: active ? "700" : "500",
                        color: active ? adminStyleColors.white : "#66717E",
                      }}
                    >
                      {sec.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {startError ? (
            <Text style={{ fontSize: fs("subbody"), fontWeight: "600", color: "#9A3026" }}>
              {startError}
            </Text>
          ) : null}

          <View style={styles.actionRow}>
            <ActionButton
              label="Start application"
              compact
              loading={startBusy}
              onPress={() => void handleCreateDraft()}
            />
          </View>
        </GlassCard>

        <GlassCard style={{ paddingVertical: 8 }}>
          <SectionHeader eyebrow="GUIDE & PRIVACY" title="Before you begin" />
          <IconRow
            title="12 guided application steps"
            detail="Applicant info, problem, solution, beneficiaries, impact, stage, plan, team & declarations."
            icon="applications"
            color={adminStyleColors.blue}
            tint="#EAF1FC"
          />
          <IconRow
            title="Private automatic saving"
            detail="Drafts save every edit automatically and never become visible to staff until final submit."
            icon="clock"
            color={adminStyleColors.amber}
            tint="#FCF4E4"
          />
          <IconRow
            title="Evidence & video rules"
            detail="PDF, DOCX, PPTX, XLSX, JPG, PNG (10 MB max; 12 applicant, 8 supplementary, 4 other) plus HTTPS demo links."
            icon="documents"
            color={adminStyleColors.teal}
            tint="#E4F4F0"
          />
          <IconRow
            title="Eligibility & privacy"
            detail="Open to Botswana citizen founders and authorized CIPA companies. Assessor notes stay isolated."
            icon="shield"
            color={adminStyleColors.purple}
            tint="#F0ECFB"
            last
          />
        </GlassCard>
      </ScrollView>
    );
  }

  // 12-STEP ADAPTIVE WIZARD VIEW
  const baseStepMeta = WIZARD_STEPS[step - 1] || WIZARD_STEPS[0];
  const cfgStep = formConfig.steps.find((st) => st.stepNumber === step);
  const stepMeta = {
    ...baseStepMeta,
    title: cfgStep?.title || baseStepMeta.title,
    hint: cfgStep?.description || baseStepMeta.hint,
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.wizardScrollContent} keyboardShouldPersistTaps="handled">
        <GlassCard>
          <View style={styles.wizardHeadRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.subtle, letterSpacing: 1 }}>
                {activeApp.reference} · STEP {step} OF 12
              </Text>
              <Text style={{ fontSize: fs("heading"), fontWeight: "700", color: adminStyleColors.navy, marginTop: 2 }}>
                {stepMeta.title}
              </Text>
            </View>
            <StatusPill status="Draft" />
          </View>

          <ProgressBar percent={Math.round((step / 12) * 100)} color="#35D75A" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 12 }} accessibilityRole="tablist">
            {WIZARD_STEPS.map(item => {
              const current = step === item.number;
              const complete = readiness.completedSections.includes(item.number) && !current;
              return <Pressable key={item.number} onPress={() => void goToStep(item.number)} accessibilityRole="tab" accessibilityState={{ selected: current }} accessibilityLabel={`Step ${item.number}: ${item.title}, ${current ? "current" : complete ? "completed" : "not completed"}`} style={{ alignItems: "center", width: 66, gap: 6, paddingVertical: 4 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: complete ? "#35D75A" : current ? "#BDF2CA" : "#E5E7EB", borderWidth: current ? 2 : 0, borderStyle: "dotted", borderColor: "#218E42", alignItems: "center", justifyContent: "center" }}>
                  {complete ? <InnovatorIcon name="check" color="#123D1E" /> : <Text style={{ color: current ? "#135C2A" : "#505760", fontWeight: "700" }}>{item.number}</Text>}
                </View>
                <Text numberOfLines={2} style={{ textAlign: "center", color: current ? "#185D30" : adminStyleColors.navy, fontSize: fs("caption") }}>{item.short}</Text>
              </Pressable>;
            })}
          </ScrollView>

          <View style={styles.wizardMetaRow}>
            <View style={styles.saveBadge}>
              <View
                style={[
                  styles.saveDot,
                  { backgroundColor: saving || dirty ? adminStyleColors.amber : adminStyleColors.tealBright },
                ]}
              />
              <Text style={{ fontSize: fs("caption"), color: adminStyleColors.navy, fontWeight: "600" }}>
                {saving ? "Autosaving..." : dirty ? "Unsaved edits..." : lastSavedText}
              </Text>
            </View>
            <Pressable onPress={() => setStepPickerOpen(true)} style={styles.headerLinkPill}>
              <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.blueSoft }}>
                All 12 steps
              </Text>
            </Pressable>
          </View>
          {onOpenLiveChat ? (
            <ActionButton
              label="Live chat with CEDA Consultant"
              variant="secondary"
              compact
              onPress={() =>
                onOpenLiveChat({
                  applicationRef: activeApp.reference,
                  wizardStep: step,
                  stepTitle: stepMeta.title,
                })
              }
            />
          ) : null}
          {saveError ? (
            <Text style={{ fontSize: fs("caption"), color: "#9A3026", fontWeight: "600" }}>
              {saveError}
            </Text>
          ) : null}
        </GlassCard>

        <GlassCard>
          <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, lineHeight: 20 }}>
            {stepMeta.hint}
          </Text>
          <WizardStepBody
            step={step}
            formData={formData}
            setField={setField}
            toggleArrayValue={toggleArrayValue}
            sectors={sectors}
            draftDocs={draftDocs}
            readiness={readiness}
            evidenceSection={evidenceSection}
            setEvidenceSection={setEvidenceSection}
            evidenceCategory={evidenceCategory}
            setEvidenceCategory={setEvidenceCategory}
            evidenceTitle={evidenceTitle}
            setEvidenceTitle={setEvidenceTitle}
            evidenceNotes={evidenceNotes}
            setEvidenceNotes={setEvidenceNotes}
            replacingDocId={replacingDocId}
            onCancelReplace={() => setReplacingDocId(null)}
            onPickAndUploadFile={() => void handlePickAndUploadFile()}
            onUploadVerificationSlot={(category, label) => void handleUploadVerificationSlot(category, label)}
            onAttachInlineField={(fieldName, sectionKey) => void handleAttachInlineField(fieldName, sectionKey)}
            inlineBusyKey={inlineBusyKey}
            uploadPercent={uploadPercent}
            evidenceFeedback={evidenceFeedback}
            videoTitle={videoTitle}
            setVideoTitle={setVideoTitle}
            videoUrl={videoUrl}
            setVideoUrl={setVideoUrl}
            videoSection={videoSection}
            setVideoSection={setVideoSection}
            onAddVideoLink={() => void handleAddVideoLink()}
            onPreviewDoc={setPreviewDoc}
            onStartReplaceDoc={(doc) => {
              setReplacingDocId(doc.id);
              setEvidenceSection(doc.sectionKey);
              setEvidenceTitle(doc.title);
              setEvidenceFeedback(`Choose a replacement file for "${doc.title}".`);
            }}
            onRemoveDoc={(doc) => void handleRemoveDoc(doc)}
            onJumpToStep={(n) => void goToStep(n)}
            onOpenPreviewModal={() => setPreviewAppOpen(true)}
            onOpenSubmitModal={() => {
              setSubmitError(null);
              setSubmitModalOpen(true);
            }}
            districtExpanded={districtExpanded}
            setDistrictExpanded={setDistrictExpanded}
            app={activeApp}
            formConfig={formConfig}
            portalDocuments={portalDocuments}
          />
        </GlassCard>
      </ScrollView>

      {/* Floating Frosted Step Controls Pill Dock */}
      <View style={[styles.wizardDock, { bottom: Math.max(insets.bottom, 12) }]}>
        <FrostedSurface variant="bar" borderRadius={28} />
        <View style={styles.footerButtons}>
          {step > 1 ? (
            <ActionButton
              label="Previous"
              variant="secondary"
              compact
              onPress={() => void goToStep(step - 1)}
              style={{ flex: 1 }}
            />
          ) : (
            <ActionButton
              label="Setup"
              variant="secondary"
              compact
              onPress={() => {
                setActiveAppId(null);
                hydratedIdRef.current = null;
                onModeChange("start");
              }}
              style={{ flex: 1 }}
            />
          )}
          <ActionButton
            label="Save"
            variant="secondary"
            compact
            loading={saving}
            onPress={() => void persistDraft(step)}
          />
          {step < 12 ? (
            <ActionButton
              label="Next step"
              compact
              onPress={() => void goToStep(step + 1)}
              style={{ flex: 1 }}
            />
          ) : (
            <ActionButton
              label="Submit"
              compact
              onPress={() => {
                setSubmitError(null);
                setSubmitModalOpen(true);
              }}
              style={{ flex: 1 }}
            />
          )}
        </View>
      </View>

      <FlushSheetModal
        visible={stepPickerOpen}
        eyebrow="12-STEP APPLICATION"
        title="Jump to section"
        onClose={() => setStepPickerOpen(false)}
      >
        <View>
          {WIZARD_STEPS.map((st, idx) => {
            const done = evaluateStepReadiness(st.number, formData, draftDocs);
            const active = st.number === step;
            return (
              <Pressable
                key={st.number}
                onPress={() => {
                  setStepPickerOpen(false);
                  void goToStep(st.number);
                }}
                style={[
                  styles.stepRow,
                  idx === 0 && { borderTopWidth: 0 },
                  active && styles.stepRowActive,
                ]}
              >
                <Text
                  style={{
                    fontSize: fs("body"),
                    fontWeight: active ? "700" : "600",
                    color: active ? adminStyleColors.rust : adminStyleColors.navy,
                    flex: 1,
                  }}
                >
                  {st.number}. {st.title}
                </Text>
                {done ? <InnovatorIcon name="check" color={adminStyleColors.teal} /> : null}
              </Pressable>
            );
          })}
        </View>
      </FlushSheetModal>

      <FlushSheetModal
        visible={previewAppOpen}
        eyebrow="FINAL PREVIEW"
        title={formData.title || activeApp.reference}
        onClose={() => setPreviewAppOpen(false)}
      >
        <View>
          <FactRow label="Applicant type" value={String(formData.applicantType || activeApp.applicantType)} />
          <FactRow label="Full name" value={String(formData.fullName || "")} />
          <FactRow label="Sector" value={String(formData.primarySector || activeApp.sector)} />
          <FactRow label="Stage" value={String(formData.stage || "Prototype")} />
          <FactRow label="Title" value={String(formData.title || "")} />
          <FactRow label="Summary" value={String(formData.summary || "")} />
          <FactRow label="Problem" value={String(formData.problem || "")} />
          <FactRow label="Solution" value={String(formData.solution || "")} />
          <FactRow label="Implementation" value={String(formData.implementationApproach || "")} />
          <FactRow label="Support requested" value={String(formData.supportRequestedSummary || "")} />
          <FactRow label="Evidence attached" value={`${draftDocs.length} item(s)`} last />
        </View>
      </FlushSheetModal>

      <FlushSheetModal
        visible={submitModalOpen}
        eyebrow="CONFIRM SUBMISSION"
        title={`Submit ${activeApp.reference}?`}
        onClose={() => setSubmitModalOpen(false)}
      >
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, lineHeight: 20 }}>
            Submitting creates an official locked snapshot and receipt code. After submission, edits unlock only if CEDA requests clarification.
          </Text>
          {readiness.blockers.length ? (
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.rust }}>
                Complete these required checks first:
              </Text>
              {readiness.blockers.map((b) => (
                <Text key={b.step} style={{ fontSize: fs("subbody"), color: adminStyleColors.navy }}>
                  • Step {b.step}: {b.label}
                </Text>
              ))}
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <Text style={{ fontSize: fs("body"), fontWeight: "700", color: adminStyleColors.teal }}>
                Ready: {readiness.completedSections.length}/12 steps ready ({readiness.evidenceCount} evidence items)
              </Text>
              {submitError ? (
                <Text style={{ fontSize: fs("subbody"), fontWeight: "600", color: "#9A3026" }}>
                  {submitError}
                </Text>
              ) : null}
              <View style={styles.actionRow}>
                <ActionButton
                  label="Confirm & submit application"
                  compact
                  loading={submitBusy}
                  onPress={() => void handleFinalSubmit()}
                />
              </View>
            </View>
          )}
        </View>
      </FlushSheetModal>

      <PrivateDocPreviewModal
        doc={previewDoc}
        token={token}
        onClose={() => setPreviewDoc(null)}
      />
    </View>
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
  wizardScrollContent: {
    padding: 18,
    gap: 14,
    paddingBottom: 112,
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
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: buttonCornerRadius,
    backgroundColor: "rgba(65,122,197,0.10)",
    justifyContent: "center",
  },
  eyebrow: {
    color: adminStyleColors.subtle,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  sectorChip: {
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 7,
    justifyContent: "center",
    borderRadius: buttonCornerRadius,
    backgroundColor: "rgba(255,250,244,0.92)",
    shadowColor: "#261B16",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 1,
  },
  sectorChipActive: {
    backgroundColor: adminStyleColors.navy,
    shadowOpacity: 0.1,
  },
  wizardHeadRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  wizardMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  saveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  saveDot: { width: 7, height: 7, borderRadius: 3.5 },
  wizardDock: {
    position: "absolute",
    left: 16,
    right: 16,
    padding: 8,
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#241C19",
    shadowOpacity: 0.11,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 8,
  },
  footerButtons: { flexDirection: "row", gap: 8, alignItems: "center" },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 50,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(36,28,25,0.08)",
  },
  stepRowActive: {
    backgroundColor: "rgba(251,237,232,0.85)",
    borderRadius: 14,
  },
  successCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: adminStyleColors.tealBright,
    alignItems: "center",
    justifyContent: "center",
  },
});
