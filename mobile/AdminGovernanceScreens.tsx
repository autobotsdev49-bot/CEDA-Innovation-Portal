import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AccountSecurityCards } from "./AccountSecurityCards";
import { AdminFormBuilderCard } from "./AdminFormBuilderCard";
import {
  defaultAssessmentRubric,
  distributeWeightsEqually,
  slugifyCriterionKey,
  validateRubricDraft,
} from "./assessmentOverview.js";
import {
  deleteAdminContent,
  getPortalDocumentDownloadUrl,
  removePortalStorageAsset,
  saveAdminAssessmentCriteria,
  saveAdminConfiguration,
  saveAdminContent,
  uploadPortalContentAsset,
  type Account,
  type AdminConfigurations,
  type AdminContentItem,
  type AssessmentCriterion,
  type AssessmentRubricConfig,
} from "./auth";
import { pickEvidenceDocument, type PickedDocumentAsset } from "./filePicker";
import {
  buildRegulatoryContactPayload,
  CONTENT_STAGES,
  CONTENT_TYPES,
  EDITABLE_CONTENT_TYPES,
} from "./portalCatalog";
import { fontSizes } from "./theme";

const c = {
  navy: "#192C40",
  rust: "#9A3D2B",
  teal: "#278477",
  blue: "#28599B",
  muted: "#66717E",
  subtle: "#7C8590",
  line: "#E5DDD3",
  card: "rgba(255,255,255,0.88)",
};

const POLICY_AREAS = [
  "Submission & evidence rules",
  "Assessment & review workflow",
  "Notification & delivery preferences",
  "Public portal configuration",
] as const;

export function AdminContentScreen({
  account,
  items,
  loading,
  onUpdated,
  configs,
  onConfigsUpdated,
}: {
  account: Account;
  items: AdminContentItem[];
  loading: boolean;
  onUpdated: (items: AdminContentItem[]) => void;
  configs?: AdminConfigurations;
  onConfigsUpdated?: (next: AdminConfigurations) => void;
}) {
  const [subTab, setSubTab] = useState<"content" | "form">("content");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [stageFilter, setStageFilter] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminContentItem | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const [kind, setKind] = useState<string>(EDITABLE_CONTENT_TYPES[0]);
  const [stage, setStage] = useState<string>("Published");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reason, setReason] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [pickedFile, setPickedFile] = useState<PickedDocumentAsset | null>(null);
  const [clearAttachment, setClearAttachment] = useState(false);

  const [authorityCode, setAuthorityCode] = useState("");
  const [authorityPhone, setAuthorityPhone] = useState("");
  const [authorityEmail, setAuthorityEmail] = useState("");
  const [authorityWebsite, setAuthorityWebsite] = useState("");
  const [authorityAddress, setAuthorityAddress] = useState("");
  const [authorityScope, setAuthorityScope] = useState("");

  const [deletingTarget, setDeletingTarget] = useState<AdminContentItem | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const filtered = items.filter((item) => {
    const q = search.trim().toLowerCase();
    const matchesStage =
      stageFilter === "All" ||
      item.stage === stageFilter ||
      (stageFilter === "Published" && item.stage === "Published preview") ||
      (stageFilter === "Draft" && item.stage === "Tab draft");
    return (
      (typeFilter === "All" || item.kind === typeFilter) &&
      matchesStage &&
      (!q ||
        [item.title, item.summary, item.kind, item.authorityCode || "", item.attachmentName || ""].some(
          (v) => String(v || "").toLowerCase().includes(q)
        ))
    );
  });

  function openComposer(item?: AdminContentItem) {
    setEditing(item || null);
    setKind(item?.kind || (typeFilter !== "All" ? typeFilter : "Application form"));
    setStage(item?.stage && CONTENT_STAGES.includes(item.stage as (typeof CONTENT_STAGES)[number]) ? item.stage : "Published");
    setTitle(item?.title || "");
    setBody(item?.body || item?.summary || "");
    setExternalUrl(item?.externalUrl || "");
    setPickedFile(null);
    setClearAttachment(false);
    const cd = item?.contactDetails || {};
    setAuthorityCode(item?.authorityCode || cd.authorityCode || "");
    setAuthorityPhone(cd.phone || "");
    setAuthorityEmail(cd.email || "");
    setAuthorityWebsite(cd.website || item?.externalUrl || "");
    setAuthorityAddress(cd.address || "");
    setAuthorityScope(cd.scope || "");
    setReason("");
    setError("");
    setComposerOpen(true);
  }

  async function chooseDocument() {
    setError("");
    try {
      const picked = await pickEvidenceDocument();
      if (picked) {
        setPickedFile(picked);
        setClearAttachment(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not select document.");
    }
  }

  async function submitDraft() {
    if (title.trim().length < 2) return setError("Enter a title of at least 2 characters.");
    let finalBody = body.trim();
    let contactDetails: Record<string, string> | null = null;
    let finalAuthorityCode: string | null = null;
    let finalExternalUrl: string | null = externalUrl.trim() || null;

    if (kind === "Regulatory contacts") {
      const reg = buildRegulatoryContactPayload({
        authorityCode,
        fullName: title.trim(),
        phone: authorityPhone,
        email: authorityEmail,
        website: authorityWebsite || externalUrl,
        address: authorityAddress,
        scope: authorityScope,
      });
      contactDetails = reg.contactDetails;
      finalAuthorityCode = reg.contactDetails.authorityCode || null;
      if (!finalExternalUrl && reg.contactDetails.website) {
        finalExternalUrl = reg.contactDetails.website;
      }
      if (finalBody.length < 10 && reg.formattedBody.length >= 10) {
        finalBody = reg.formattedBody;
        setBody(finalBody);
      }
    }

    if (finalBody.length < 10) return setError("Enter content instructions of at least 10 characters.");
    if (reason.trim().length < 5) return setError("Enter an approval or source note of at least 5 characters.");
    if (finalExternalUrl && !/^https?:\/\//i.test(finalExternalUrl)) {
      return setError("External URL must start with http:// or https://.");
    }

    setBusy(true);
    setError("");
    try {
      let uploaded: Awaited<ReturnType<typeof uploadPortalContentAsset>> | null = null;
      if (pickedFile) {
        uploaded = await uploadPortalContentAsset(account, pickedFile);
      }
      const next = await saveAdminContent(account, {
        content_kind: kind,
        content_title: title.trim(),
        content_body: finalBody,
        reason: reason.trim(),
        content_id: editing?.id || null,
        content_stage: stage,
        attachment_name: uploaded ? uploaded.attachmentName : undefined,
        attachment_mime: uploaded ? uploaded.attachmentMime : undefined,
        attachment_size: uploaded ? uploaded.attachmentSize : undefined,
        attachment_path: uploaded ? uploaded.attachmentPath : undefined,
        external_url: finalExternalUrl,
        authority_code: finalAuthorityCode,
        contact_details: contactDetails,
        clear_attachment: clearAttachment,
      });
      if ((pickedFile || clearAttachment) && editing?.attachmentPath && (!uploaded || editing.attachmentPath !== uploaded.attachmentPath)) {
        await removePortalStorageAsset(account, editing.attachmentPath);
      }
      onUpdated(next);
      setNotice(`Saved "${title.trim()}" (${stage}) and recorded in audit log.`);
      setComposerOpen(false);
      setEditing(null);
      setPickedFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save content.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deletingTarget?.id) return;
    if (deleteReason.trim().length < 5) {
      return setError("Provide an audit deletion reason of at least 5 characters.");
    }
    setBusy(true);
    setError("");
    try {
      const next = await deleteAdminContent(account, deletingTarget.id, deleteReason.trim());
      if (deletingTarget.attachmentPath) {
        await removePortalStorageAsset(account, deletingTarget.attachmentPath);
      }
      onUpdated(next);
      setNotice(`Deleted "${deletingTarget.title}" and recorded audit entry.`);
      setDeletingTarget(null);
      setDeleteReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete content.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={s.card}>
        <Text accessibilityRole="header" style={s.heading}>Content, forms &amp; FAQs management</Text>
        <Text style={s.note}>
          Upload, modify or delete application forms, accompanying copies, FAQs and Botswana regulatory authority contacts.
        </Text>
        {configs && (
          <View style={s.pills}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: subTab === "content" }}
              onPress={() => setSubTab("content")}
              style={[s.pill, subTab === "content" && s.pillActive]}
            >
              <Text style={[s.pillText, subTab === "content" && s.pillTextActive]}>Content &amp; uploads</Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: subTab === "form" }}
              onPress={() => setSubTab("form")}
              style={[s.pill, subTab === "form" && s.pillActive]}
            >
              <Text style={[s.pillText, subTab === "form" && s.pillTextActive]}>Form &amp; checklist builder</Text>
            </Pressable>
          </View>
        )}
        {subTab === "content" && (
          <Pressable accessibilityRole="button" onPress={() => openComposer()} style={s.button}>
            <Text style={s.buttonText}>{composerOpen && !editing ? "Creating content / upload" : "+ Upload or create content"}</Text>
          </Pressable>
        )}
        {!!notice && <Text accessibilityLiveRegion="polite" style={s.success}>{notice}</Text>}
      </View>

      {subTab === "form" && configs ? (
        <AdminFormBuilderCard
          account={account}
          configs={configs}
          onConfigsUpdated={onConfigsUpdated}
        />
      ) : (
        <>
          {composerOpen && (
            <View style={s.card}>
              <Text accessibilityRole="header" style={s.heading}>{editing ? "Edit / replace portal content" : "Create or upload portal content"}</Text>
              {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
              <Text style={s.label}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
                {EDITABLE_CONTENT_TYPES.map((opt) => (
                  <Pressable key={opt} accessibilityRole="radio" accessibilityState={{ checked: kind === opt }} onPress={() => setKind(opt)} style={[s.pill, kind === opt && s.pillActive]}>
                    <Text style={[s.pillText, kind === opt && s.pillTextActive]}>{opt}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={s.label}>Publishing stage</Text>
              <View style={s.pills}>
                {CONTENT_STAGES.map((opt) => (
                  <Pressable key={opt} accessibilityRole="radio" accessibilityState={{ checked: stage === opt }} onPress={() => setStage(opt)} style={[s.pill, stage === opt && s.pillActive]}>
                    <Text style={[s.pillText, stage === opt && s.pillTextActive]}>{opt}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.label}>Title</Text>
              <TextInput accessibilityLabel="Content title" value={title} onChangeText={setTitle} maxLength={160} editable={!busy} style={s.input} />

              {kind === "Regulatory contacts" && (
                <View style={s.secretBox}>
                  <Text style={s.label}>Regulatory authority contact details</Text>
                  <TextInput value={authorityCode} onChangeText={setAuthorityCode} placeholder="Authority code (e.g. CIPA, BURS, BOBS)" maxLength={32} editable={!busy} style={s.input} />
                  <TextInput value={authorityPhone} onChangeText={setAuthorityPhone} placeholder="Phone / call centre" maxLength={120} editable={!busy} style={s.input} />
                  <TextInput value={authorityEmail} onChangeText={setAuthorityEmail} placeholder="Email address" maxLength={140} autoCapitalize="none" editable={!busy} style={s.input} />
                  <TextInput value={authorityWebsite} onChangeText={setAuthorityWebsite} placeholder="Official website (https://...)" maxLength={300} autoCapitalize="none" editable={!busy} style={s.input} />
                  <TextInput value={authorityAddress} onChangeText={setAuthorityAddress} placeholder="Physical / postal address" maxLength={240} editable={!busy} style={s.input} />
                  <TextInput value={authorityScope} onChangeText={setAuthorityScope} placeholder="Regulatory scope / mandate" maxLength={240} editable={!busy} style={s.input} />
                </View>
              )}

              <Text style={s.label}>File attachment (optional PDF, DOCX, XLSX, PPTX, PNG/JPG up to 10 MB)</Text>
              <View style={s.pills}>
                <Pressable accessibilityRole="button" onPress={() => void chooseDocument()} style={[s.pill, { backgroundColor: "#EFE8DE" }]}>
                  <Text style={s.pillText}>{pickedFile ? `Selected: ${pickedFile.name}` : "Choose document file"}</Text>
                </Pressable>
                {editing?.attachmentName && editing?.attachmentPath && !pickedFile && (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: clearAttachment }}
                    onPress={() => setClearAttachment((prev) => !prev)}
                    style={[s.pill, clearAttachment && s.pillActive]}
                  >
                    <Text style={[s.pillText, clearAttachment && s.pillTextActive]}>
                      {clearAttachment ? `Will remove: ${editing.attachmentName}` : `Keep current: ${editing.attachmentName} (tap to remove)`}
                    </Text>
                  </Pressable>
                )}
              </View>

              <Text style={s.label}>External URL (optional)</Text>
              <TextInput accessibilityLabel="External URL" value={externalUrl} onChangeText={setExternalUrl} placeholder="https://..." autoCapitalize="none" maxLength={500} editable={!busy} style={s.input} />

              <Text style={s.label}>Content / instructions</Text>
              <TextInput accessibilityLabel="Content body" value={body} onChangeText={setBody} multiline maxLength={5000} editable={!busy} style={[s.input, { minHeight: 110, textAlignVertical: "top" }]} />

              <Text style={s.label}>Source or approval note (5+ chars)</Text>
              <TextInput accessibilityLabel="Source or approval note" value={reason} onChangeText={setReason} multiline maxLength={500} editable={!busy} style={[s.input, { minHeight: 70, textAlignVertical: "top" }]} />

              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submitDraft()} style={[s.button, { flex: 1 }, busy && { opacity: 0.6 }]}>
                  <Text style={s.buttonText}>{busy ? "Saving..." : "Save content"}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => setComposerOpen(false)} style={[s.button, s.secondary]}>
                  <Text style={[s.buttonText, { color: c.navy }]}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}

          {deletingTarget && (
            <View style={s.card}>
              <Text accessibilityRole="header" style={s.heading}>Confirm permanent deletion</Text>
              <Text style={s.note}>{deletingTarget.kind}: {deletingTarget.title}</Text>
              {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
              <Text style={s.label}>Audit reason for deletion (5+ chars)</Text>
              <TextInput
                accessibilityLabel="Audit deletion reason"
                value={deleteReason}
                onChangeText={setDeleteReason}
                multiline
                maxLength={500}
                editable={!busy}
                style={[s.input, { minHeight: 75, textAlignVertical: "top" }]}
              />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void confirmDelete()} style={[s.button, s.dangerButton, { flex: 1 }, busy && { opacity: 0.6 }]}>
                  <Text style={s.buttonText}>{busy ? "Deleting..." : "Delete item"}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setDeletingTarget(null); setDeleteReason(""); }} style={[s.button, s.secondary]}>
                  <Text style={[s.buttonText, { color: c.navy }]}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}

          <View style={s.card}>
            <Text accessibilityRole="header" style={s.heading}>Portal content directory ({filtered.length} / {items.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
              {CONTENT_TYPES.map((opt) => (
                <Pressable key={opt} accessibilityRole="tab" accessibilityState={{ selected: typeFilter === opt }} onPress={() => setTypeFilter(opt)} style={[s.pill, typeFilter === opt && s.pillActive]}>
                  <Text style={[s.pillText, typeFilter === opt && s.pillTextActive]}>{opt}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={s.pills}>
              {(["All", ...CONTENT_STAGES] as const).map((opt) => (
                <Pressable key={opt} accessibilityRole="tab" accessibilityState={{ selected: stageFilter === opt }} onPress={() => setStageFilter(opt)} style={[s.pill, stageFilter === opt && { backgroundColor: c.navy }]}>
                  <Text style={[s.pillText, stageFilter === opt && s.pillTextActive]}>{opt}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput value={search} onChangeText={setSearch} placeholder="Search content, regulator, attachment or FAQ" style={s.input} />
            {loading && <Text style={s.note}>Loading live portal content...</Text>}
            {filtered.map((item, idx) => {
              const dlUrl = item.attachmentPath
                ? getPortalDocumentDownloadUrl(item.attachmentPath)
                : item.externalUrl && /^https?:\/\//i.test(item.externalUrl)
                  ? item.externalUrl
                  : "";
              return (
                <View key={item.id || `${item.title}-${idx}`} style={[s.listRow, idx === filtered.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.rowTitle}>{item.title}</Text>
                    <Text style={s.note}>{item.kind} · {item.stage} · {item.audience} · {item.updated}</Text>
                    {!!item.summary && <Text style={s.note}>{item.summary}</Text>}
                    {!!dlUrl && (
                      <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(dlUrl)}>
                        <Text style={s.link}>{item.attachmentName ? `Download: ${item.attachmentName}` : `Open link: ${item.externalUrl}`}</Text>
                      </Pressable>
                    )}
                    <View style={{ flexDirection: "row", gap: 14, marginTop: 4 }}>
                      <Pressable accessibilityRole="button" onPress={() => openComposer(item)}>
                        <Text style={s.link}>Edit / revise</Text>
                      </Pressable>
                      {!!item.id && (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => {
                            setError("");
                            setDeleteReason("");
                            setDeletingTarget(item);
                          }}
                        >
                          <Text style={[s.link, { color: "#B91C1C" }]}>Delete</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
            {!loading && !filtered.length && <Text style={s.note}>No content items match this filter.</Text>}
          </View>
        </>
      )}
    </>
  );
}

export function AdminPoliciesScreen({
  account,
  configs,
  onConfigsUpdated,
  onOpenCriteria,
}: {
  account: Account;
  configs: AdminConfigurations;
  onConfigsUpdated: (next: AdminConfigurations) => void;
  onOpenCriteria?: () => void;
}) {
  const existing = configs.portal_policies?.payload;
  const version = configs.portal_policies?.version ?? 0;
  const [area, setArea] = useState<string>(String(existing?.area || POLICY_AREAS[0]));
  const [proposal, setProposal] = useState<string>(String(existing?.proposal || ""));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submitPolicy() {
    if (proposal.trim().length < 4) return setError("Describe the policy update (4+ chars).");
    if (reason.trim().length < 5) return setError("Enter a reason and reversal plan (5+ chars).");
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await saveAdminConfiguration(account, "portal_policies", { area, proposal: proposal.trim() }, reason);
      onConfigsUpdated(updated);
      const nextVer = updated.portal_policies?.version || version + 1;
      setNotice(`Policy configuration v${nextVer} saved (${area}).`);
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save portal policy.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View style={s.card}>
        <Text accessibilityRole="header" style={s.heading}>Baseline portal policies</Text>
        <Text style={s.note}>Submission, evidence, assessment and notification rules active across the portal.</Text>
        <View style={s.fact}><Text style={s.factLabel}>Evidence policy</Text><Text style={s.factValue}>Up to 12 applicant, 8 supplementary, and 4 section files (10 MB max each) plus HTTPS video links.</Text></View>
        <View style={s.fact}><Text style={s.factLabel}>Assessment access</Text><Text style={s.factValue}>Active assessors review published applications across permitted workflows unless recused for conflict; Lead Assessors release outcomes across sectors.</Text></View>
        <View style={[s.fact, { borderBottomWidth: 0 }]}><Text style={s.factLabel}>Scoring model</Text><Text style={s.factValue}>Configurable weighted criteria scored 1 to 5 (100% total). In-flight rounds stay pinned to their starting rubric.</Text></View>
        {onOpenCriteria && (
          <Pressable accessibilityRole="button" onPress={onOpenCriteria} style={[s.button, s.secondary]}>
            <Text style={[s.buttonText, { color: c.navy }]}>Configure evaluation criteria &amp; weights</Text>
          </Pressable>
        )}
      </View>

      <View style={s.card}>
        <Text accessibilityRole="header" style={s.heading}>Saved configuration override</Text>
        <Text style={s.note}>
          {version > 0 && existing?.proposal
            ? `Active database policy v${version}: ${String(existing.area || "General")}: "${String(existing.proposal)}"`
            : "Using baseline CEDA policies. Submit an audited policy update below when rules change."}
        </Text>
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={s.success}>{notice}</Text>}
        <Text style={s.label}>Policy area</Text>
        <View style={s.pills}>
          {POLICY_AREAS.map((opt) => (
            <Pressable key={opt} accessibilityRole="radio" accessibilityState={{ checked: area === opt }} onPress={() => setArea(opt)} style={[s.pill, area === opt && s.pillActive]}>
              <Text style={[s.pillText, area === opt && s.pillTextActive]}>{opt}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.label}>Proposed setting update</Text>
        <TextInput accessibilityLabel="Proposed setting update" value={proposal} onChangeText={setProposal} maxLength={160} editable={!busy} style={s.input} />
        <Text style={s.label}>Reason and reversal plan (5+ chars)</Text>
        <TextInput accessibilityLabel="Reason and reversal plan" value={reason} onChangeText={setReason} multiline maxLength={500} editable={!busy} style={[s.input, { minHeight: 80, textAlignVertical: "top" }]} />
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submitPolicy()} style={[s.button, busy && { opacity: 0.6 }]}>
          <Text style={s.buttonText}>{busy ? "Saving..." : "Save portal policy"}</Text>
        </Pressable>
      </View>

      <AdminFormBuilderCard
        account={account}
        configs={configs}
        onConfigsUpdated={onConfigsUpdated}
      />
    </>
  );
}

type DraftCriterionRow = AssessmentCriterion & { persisted?: boolean; weightText: string };

const STARTER_CRITERIA = [
  { label: "Commercial viability", description: "Evidence of paying customers, revenue unit economics, and competitive positioning.", weight: 15 },
  { label: "Job creation and inclusion", description: "Projected citizen employment, youth/women participation, and regional uplift.", weight: 15 },
  { label: "IP and regulatory readiness", description: "Intellectual property ownership, licensing pathway, and compliance readiness.", weight: 10 },
];

export function AdminCriteriaScreen({
  account,
  config,
  loading,
  onUpdated,
}: {
  account: Account;
  config: AssessmentRubricConfig | null;
  loading?: boolean;
  onUpdated: (next: AssessmentRubricConfig) => void;
}) {
  const toDraftRows = (items: readonly Partial<AssessmentCriterion>[], persisted = true): DraftCriterionRow[] =>
    items.map((item, idx) => ({
      id: item.id,
      key: String(item.key || slugifyCriterionKey(String(item.label || ""), idx + 1)),
      label: String(item.label || ""),
      description: String(item.description || ""),
      weight: Number(item.weight || 0),
      weightText: String(item.weight ?? ""),
      sortOrder: Number(item.sortOrder || idx + 1),
      active: item.active !== false,
      version: item.version,
      updatedAt: item.updatedAt,
      persisted,
    }));

  const [rows, setRows] = useState<DraftCriterionRow[]>(() =>
    config?.criteria?.length ? toDraftRows(config.criteria, true) : toDraftRows(defaultAssessmentRubric, true),
  );
  const [thresholdText, setThresholdText] = useState(String(config?.passThreshold ?? 60));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!config?.criteria?.length) return;
    setRows(toDraftRows(config.criteria, true));
    setThresholdText(String(config.passThreshold ?? 60));
  }, [config]);

  const check = validateRubricDraft(rows, Number(thresholdText));
  const version = config?.version ?? 1;

  function updateRow(idx: number, patch: Partial<DraftCriterionRow>) {
    setRows(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const next = { ...item, ...patch };
      if (patch.label !== undefined && !item.persisted) {
        next.key = slugifyCriterionKey(patch.label, idx + 1);
      }
      if (patch.weightText !== undefined) {
        const parsed = Number(patch.weightText);
        next.weight = Number.isFinite(parsed) ? parsed : 0;
      }
      return next;
    }));
  }

  function moveRow(idx: number, delta: -1 | 1) {
    const target = idx + delta;
    if (target < 0 || target >= rows.length) return;
    setRows(prev => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  function equalize() {
    const balanced = distributeWeightsEqually(rows);
    setRows(balanced.map((item, idx) => ({
      ...rows[idx],
      weight: Number(item.weight),
      weightText: String(item.weight),
    })));
    setNotice("Active weights balanced to 100%. Enter an audit reason and save.");
    setError("");
  }

  function resetBaseline() {
    const baselineKeys = new Set<string>(defaultAssessmentRubric.map(item => item.key));
    const archivedExtras = rows
      .filter(item => item.persisted && !baselineKeys.has(item.key))
      .map(item => ({ ...item, active: false }));
    setRows([
      ...toDraftRows(defaultAssessmentRubric, true),
      ...archivedExtras,
    ]);
    setThresholdText("60");
    setNotice("Loaded baseline 6 criteria into draft. Save to publish a new rubric version.");
    setError("");
  }

  function addStarter(starter: typeof STARTER_CRITERIA[number]) {
    const key = slugifyCriterionKey(starter.label, rows.length + 1);
    const existingIdx = rows.findIndex(item => item.key === key);
    if (existingIdx >= 0) {
      updateRow(existingIdx, {
        active: true,
        description: rows[existingIdx].description || starter.description,
      });
    } else {
      setRows(prev => [
        ...prev,
        {
          key,
          label: starter.label,
          description: starter.description,
          weight: starter.weight,
          weightText: String(starter.weight),
          sortOrder: prev.length + 1,
          active: true,
          persisted: false,
        },
      ]);
    }
  }

  async function saveRubric() {
    if (!check.valid) return setError(check.errors[0] || "Check criterion weights total 100%.");
    if (reason.trim().length < 5) return setError("Enter an audit reason (5+ characters).");
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await saveAdminAssessmentCriteria(account, check.normalized, reason, check.passThreshold);
      onUpdated(saved);
      setReason("");
      setNotice(`Published evaluation rubric v${saved.version} (${check.activeCount} criteria, 100% total).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save evaluation rubric.");
    } finally {
      setBusy(false);
    }
  }

  const meterPercent = Math.min(100, Math.max(0, check.totalWeight));
  const meterColor = Math.round(check.totalWeight * 100) === 10000 ? c.teal : check.totalWeight > 100 ? c.rust : "#D97706";

  return (
    <>
      <View style={s.card}>
        <View style={s.criteriaTopRow}>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" style={s.heading}>Evaluation criteria &amp; weights</Text>
            <Text style={s.note}>Active rubric v{version} · In-flight and past rounds stay pinned to their starting snapshot.</Text>
          </View>
          <View style={[s.criteriaBadge, { backgroundColor: Math.round(check.totalWeight * 100) === 10000 ? "#E4F4F0" : "#FBEDE8" }]}>
            <Text style={[s.criteriaBadgeText, { color: meterColor }]}>{check.totalWeight.toFixed(0)}% / 100%</Text>
          </View>
        </View>

        <View style={s.meterTrack}>
          <View style={[s.meterFill, { width: `${meterPercent}%`, backgroundColor: meterColor }]} />
        </View>
        <Text style={s.note}>
          {Math.round(check.totalWeight * 100) === 10000
            ? `Balanced across ${check.activeCount} active criteria.`
            : check.totalWeight > 100
              ? `Reduce weights by ${(check.totalWeight - 100).toFixed(2)}% to total 100%.`
              : `${check.remainingWeight.toFixed(2)}% remaining to reach 100%.`}
        </Text>

        <View style={s.pills}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setRows(prev => [
              ...prev,
              {
                key: `criterion-${prev.length + 1}`,
                label: "",
                description: "",
                weight: Math.max(5, Math.min(25, check.remainingWeight > 0 ? check.remainingWeight : 10)),
                weightText: String(Math.max(5, Math.min(25, check.remainingWeight > 0 ? check.remainingWeight : 10))),
                sortOrder: prev.length + 1,
                active: true,
                persisted: false,
              },
            ])}
            style={s.pill}
          >
            <Text style={s.pillText}>+ Add criterion</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={equalize} style={s.pill}>
            <Text style={s.pillText}>Equalize 100%</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={resetBaseline} style={s.pill}>
            <Text style={s.pillText}>Restore baseline 6</Text>
          </Pressable>
        </View>

        <View style={s.pills}>
          {STARTER_CRITERIA.map((starter) => (
            <Pressable key={starter.label} accessibilityRole="button" onPress={() => addStarter(starter)} style={[s.pill, { backgroundColor: "#FCF4E4" }]}>
              <Text style={[s.pillText, { color: "#94702D" }]}>+ {starter.label}</Text>
            </Pressable>
          ))}
        </View>

        {loading && !config && <Text style={s.note}>Loading active evaluation criteria...</Text>}
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={s.success}>{notice}</Text>}

        {rows.map((item, idx) => (
          <View key={`${item.key}-${idx}`} style={[s.criterionBox, !item.active && { opacity: 0.65 }]}>
            <View style={s.criteriaTopRow}>
              <Text style={s.label}>{item.active ? `#${idx + 1}` : "Archived"} · {item.key}</Text>
              <View style={s.pills}>
                <Pressable accessibilityRole="button" disabled={idx === 0} onPress={() => moveRow(idx, -1)} style={s.miniBtn}>
                  <Text style={s.miniBtnText}>Up</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={idx === rows.length - 1} onPress={() => moveRow(idx, 1)} style={s.miniBtn}>
                  <Text style={s.miniBtnText}>Down</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    if (item.active && !item.persisted && rows.length > 1) {
                      setRows(prev => prev.filter((_, i) => i !== idx));
                    } else {
                      updateRow(idx, { active: !item.active });
                    }
                  }}
                  style={s.miniBtn}
                >
                  <Text style={s.miniBtnText}>{!item.active ? "Restore" : item.persisted ? "Archive" : "Remove"}</Text>
                </Pressable>
              </View>
            </View>
            <Text style={s.factLabel}>Criterion title</Text>
            <TextInput
              accessibilityLabel={`Criterion ${idx + 1} title`}
              value={item.label}
              onChangeText={(text) => updateRow(idx, { label: text })}
              maxLength={140}
              editable={!busy}
              style={s.input}
            />
            <Text style={s.factLabel}>Weight (%)</Text>
            <TextInput
              accessibilityLabel={`Criterion ${idx + 1} weight`}
              value={item.weightText}
              onChangeText={(text) => updateRow(idx, { weightText: text })}
              keyboardType="decimal-pad"
              maxLength={6}
              editable={!busy}
              style={s.input}
            />
            <Text style={s.factLabel}>Assessor guidance</Text>
            <TextInput
              accessibilityLabel={`Criterion ${idx + 1} guidance`}
              value={item.description}
              onChangeText={(text) => updateRow(idx, { description: text })}
              multiline
              maxLength={600}
              editable={!busy}
              style={[s.input, { minHeight: 62, textAlignVertical: "top" }]}
            />
          </View>
        ))}

        <Text style={s.label}>Pass benchmark threshold (20% to 100%)</Text>
        <TextInput
          accessibilityLabel="Pass benchmark threshold"
          value={thresholdText}
          onChangeText={setThresholdText}
          keyboardType="decimal-pad"
          maxLength={6}
          editable={!busy}
          style={s.input}
        />

        <Text style={s.label}>Audit reason for rubric update (5+ chars)</Text>
        <TextInput
          accessibilityLabel="Audit reason for rubric update"
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={500}
          placeholder="Explain why criteria, weights or benchmark changed"
          editable={!busy}
          style={[s.input, { minHeight: 74, textAlignVertical: "top" }]}
        />

        <Pressable
          accessibilityRole="button"
          disabled={busy || !check.valid}
          onPress={() => void saveRubric()}
          style={[s.button, (busy || !check.valid) && { opacity: 0.55 }]}
        >
          <Text style={s.buttonText}>{busy ? "Saving..." : "Save evaluation rubric"}</Text>
        </Pressable>
      </View>

      <View style={s.card}>
        <Text accessibilityRole="header" style={s.heading}>Rubric version history</Text>
        {(config?.history?.length ? config.history : []).map((entry, idx, arr) => (
          <View key={entry.version} style={[s.fact, idx === arr.length - 1 && { borderBottomWidth: 0 }]}>
            <Text style={s.rowTitle}>v{entry.version} · {entry.criteriaCount} criteria · {entry.passThreshold}% benchmark</Text>
            <Text style={s.note}>{entry.createdAt}: {entry.reason}</Text>
            <Text style={s.factValue}>{(entry.criteria || []).map(item => `${item.label} (${item.weight}%)`).join(" · ")}</Text>
          </View>
        ))}
        {!config?.history?.length && <Text style={s.note}>Baseline rubric v1 is active for new assessment rounds.</Text>}
      </View>
    </>
  );
}

export function AdminSecurityPanel({
  account,
  onAccountChange,
}: {
  account: Account;
  onAccountChange: (next: Account) => void;
}) {
  return (
    <AccountSecurityCards
      account={account}
      friendlyName="CEDA Admin Mobile"
      webPath="/admin/#security"
      onAccountChange={onAccountChange}
    />
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.92)", padding: 16, gap: 11 },
  heading: { color: c.navy, fontSize: fontSizes.heading, fontWeight: "700" },
  note: { color: c.subtle, fontSize: fontSizes.subbody, lineHeight: 20 },
  label: { color: c.navy, fontSize: fontSizes.subbody, fontWeight: "700" },
  input: { backgroundColor: "white", borderWidth: 1, borderColor: "#E0D7CC", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: fontSizes.body, color: c.navy },
  fact: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.line, gap: 3 },
  factLabel: { color: c.subtle, fontSize: fontSizes.caption, fontWeight: "700" },
  factValue: { color: c.navy, fontSize: fontSizes.body, fontWeight: "500" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, backgroundColor: "#EFE8DE" },
  pillActive: { backgroundColor: c.rust },
  pillText: { color: c.navy, fontSize: fontSizes.caption, fontWeight: "600" },
  pillTextActive: { color: "white", fontWeight: "700" },
  listRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line },
  rowTitle: { color: c.navy, fontSize: fontSizes.body, fontWeight: "600" },
  link: { color: c.blue, fontSize: fontSizes.subbody, fontWeight: "700" },
  button: { minHeight: 46, borderRadius: 12, backgroundColor: c.navy, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  dangerButton: { backgroundColor: "#B91C1C" },
  secondary: { backgroundColor: "#EAE4DC" },
  buttonText: { color: "white", fontSize: fontSizes.body, fontWeight: "700" },
  error: { color: c.rust, fontSize: fontSizes.subbody, fontWeight: "600" },
  success: { color: c.teal, fontSize: fontSizes.subbody, fontWeight: "700" },
  secretBox: { padding: 12, borderRadius: 14, backgroundColor: "#F9F6F1", borderWidth: 1, borderColor: c.line, gap: 6 },
  secretCode: { color: c.navy, fontSize: fontSizes.heading, fontWeight: "800", letterSpacing: 1.5 },
  criteriaTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  criteriaBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  criteriaBadgeText: { fontSize: fontSizes.caption, fontWeight: "700" },
  meterTrack: { height: 8, borderRadius: 999, backgroundColor: "#EAE4DC", overflow: "hidden" },
  meterFill: { height: "100%", borderRadius: 999 },
  criterionBox: { padding: 12, borderRadius: 14, backgroundColor: "#FAF7F2", borderWidth: 1, borderColor: c.line, gap: 7 },
  miniBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: "#EAE4DC" },
  miniBtnText: { color: c.navy, fontSize: fontSizes.caption, fontWeight: "600" },
});
