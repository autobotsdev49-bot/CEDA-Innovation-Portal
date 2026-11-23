import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { saveAdminConfiguration, type Account, type AdminConfigurations } from "./auth";
import {
  normalizeApplicationFormConfig,
  type ApplicationFormConfig,
  type CustomFieldType,
} from "./portalCatalog";
import { fontSizes } from "./theme";

const c = {
  navy: "#1F2633",
  rust: "#9A3D2B",
  teal: "#0F766E",
  subtle: "#5D524B",
  line: "#E5DAD0",
  card: "#FFFFFF",
  soft: "#F7F2EB",
};

const FIELD_TYPES: CustomFieldType[] = ["text", "textarea", "select", "url", "checkbox"];

/** Admin editor card for the live Application Form steps, required accompanying copies & custom fields. */
export function AdminFormBuilderCard({
  account,
  configs,
  onConfigsUpdated,
}: {
  account: Account;
  configs: AdminConfigurations;
  onConfigsUpdated?: (next: AdminConfigurations) => void;
}) {
  const savedPayload = configs.application_form_config?.payload;
  const savedVersion = configs.application_form_config?.version ?? 0;
  const [formCfg, setFormCfg] = useState<ApplicationFormConfig>(() =>
    normalizeApplicationFormConfig(savedPayload)
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (savedPayload) {
      setFormCfg(normalizeApplicationFormConfig(savedPayload));
    }
  }, [savedVersion, savedPayload]);

  function updateDoc(index: number, patch: Partial<ApplicationFormConfig["requiredDocuments"][number]>) {
    setFormCfg((prev) => {
      const nextDocs = [...prev.requiredDocuments];
      nextDocs[index] = { ...nextDocs[index], ...patch };
      return { ...prev, requiredDocuments: nextDocs };
    });
  }

  function updateCustomField(index: number, patch: Partial<ApplicationFormConfig["customFields"][number]>) {
    setFormCfg((prev) => {
      const next = [...prev.customFields];
      next[index] = { ...next[index], ...patch };
      return { ...prev, customFields: next };
    });
  }

  async function saveBuilder() {
    if (reason.trim().length < 5) {
      setError("Enter an audit reason of at least 5 characters before saving.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = normalizeApplicationFormConfig(formCfg) as unknown as Record<string, unknown>;
      const next = await saveAdminConfiguration(account, "application_form_config", payload, reason);
      onConfigsUpdated?.(next);
      const nextVer = next.application_form_config?.version ?? savedVersion + 1;
      setNotice(`Application form configuration v${nextVer} saved and audited.`);
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save form configuration.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.card}>
      <Text accessibilityRole="header" style={s.heading}>
        Application form &amp; accompanying copies builder {savedVersion > 0 ? `(v${savedVersion})` : ""}
      </Text>
      <Text style={s.note}>
        Manage submission form title, file size limits, 12-step guidance, mandatory accompanying copies and custom questions.
      </Text>

      <Text style={s.label}>Form title</Text>
      <TextInput
        value={formCfg.formTitle}
        onChangeText={(v) => setFormCfg((p) => ({ ...p, formTitle: v }))}
        style={s.input}
      />

      <Text style={s.label}>Form version &amp; max evidence file size (MB)</Text>
      <View style={s.row}>
        <TextInput
          value={formCfg.formVersion}
          onChangeText={(v) => setFormCfg((p) => ({ ...p, formVersion: v }))}
          style={[s.input, s.half]}
          placeholder="2026.1"
        />
        <TextInput
          value={String(formCfg.maxEvidenceFileMb)}
          onChangeText={(v) => setFormCfg((p) => ({ ...p, maxEvidenceFileMb: Math.max(1, Number(v) || 15) }))}
          keyboardType="numeric"
          style={[s.input, s.half]}
          placeholder="15"
        />
      </View>

      <Text style={s.label}>Introductory applicant guidance</Text>
      <TextInput
        value={formCfg.introGuidance}
        onChangeText={(v) => setFormCfg((p) => ({ ...p, introGuidance: v }))}
        style={[s.input, s.multi]}
        multiline
      />

      <Text style={s.sectionTitle}>Step guidance (Steps 1 to 12)</Text>
      {formCfg.steps.map((step, idx) => (
        <View key={step.key} style={s.subCard}>
          <View style={s.subHead}>
            <Text style={s.subLabel}>Step {step.stepNumber}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setFormCfg((prev) => {
                  const steps = [...prev.steps];
                  steps[idx] = { ...steps[idx], enabled: !steps[idx].enabled };
                  return { ...prev, steps };
                })
              }
              style={[s.chip, step.enabled && s.chipActive]}
            >
              <Text style={[s.chipText, step.enabled && s.chipTextActive]}>
                {step.enabled ? "Enabled" : "Hidden"}
              </Text>
            </Pressable>
          </View>
          <TextInput
            value={step.title}
            onChangeText={(v) =>
              setFormCfg((prev) => {
                const steps = [...prev.steps];
                steps[idx] = { ...steps[idx], title: v };
                return { ...prev, steps };
              })
            }
            style={s.input}
          />
          <TextInput
            value={step.description}
            onChangeText={(v) =>
              setFormCfg((prev) => {
                const steps = [...prev.steps];
                steps[idx] = { ...steps[idx], description: v };
                return { ...prev, steps };
              })
            }
            style={s.input}
            placeholder="Step description"
          />
        </View>
      ))}

      <View style={s.subHead}>
        <Text style={s.sectionTitle}>Accompanying copies checklist ({formCfg.requiredDocuments.length})</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            setFormCfg((prev) => ({
              ...prev,
              requiredDocuments: [
                ...prev.requiredDocuments,
                {
                  id: `doc_${Date.now().toString(36)}`,
                  label: "New accompanying copy",
                  category: "Supporting copies",
                  required: false,
                  appliesTo: "All applicants",
                  maxSizeMb: 10,
                  acceptedFormats: "PDF, DOCX",
                  guidance: "Attach readable copy.",
                },
              ],
            }))
          }
          style={s.secondaryBtn}
        >
          <Text style={s.secondaryBtnText}>+ Add copy</Text>
        </Pressable>
      </View>

      {formCfg.requiredDocuments.map((doc, idx) => (
        <View key={doc.id} style={s.subCard}>
          <TextInput
            value={doc.label}
            onChangeText={(v) => updateDoc(idx, { label: v })}
            style={s.input}
            placeholder="Document label"
          />
          <View style={s.row}>
            <TextInput
              value={doc.appliesTo}
              onChangeText={(v) => updateDoc(idx, { appliesTo: v })}
              style={[s.input, s.half]}
              placeholder="Applies to"
            />
            <TextInput
              value={doc.acceptedFormats}
              onChangeText={(v) => updateDoc(idx, { acceptedFormats: v })}
              style={[s.input, s.half]}
              placeholder="PDF, DOCX"
            />
          </View>
          <TextInput
            value={doc.guidance}
            onChangeText={(v) => updateDoc(idx, { guidance: v })}
            style={s.input}
            placeholder="Guidance for applicants"
          />
          <View style={s.subHead}>
            <Pressable
              accessibilityRole="button"
              onPress={() => updateDoc(idx, { required: !doc.required })}
              style={[s.chip, doc.required && s.chipActive]}
            >
              <Text style={[s.chipText, doc.required && s.chipTextActive]}>
                {doc.required ? "Mandatory" : "Conditional"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setFormCfg((prev) => ({
                  ...prev,
                  requiredDocuments: prev.requiredDocuments.filter((_, i) => i !== idx),
                }))
              }
              style={s.removeBtn}
            >
              <Text style={s.removeBtnText}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <View style={s.subHead}>
        <Text style={s.sectionTitle}>Custom submission fields ({formCfg.customFields.length})</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            setFormCfg((prev) => ({
              ...prev,
              customFields: [
                ...prev.customFields,
                {
                  id: `cf_${Date.now().toString(36)}`,
                  key: `custom_${Date.now().toString(36)}`,
                  label: "Additional question",
                  stepNumber: 2,
                  fieldType: "text",
                  required: false,
                  enabled: true,
                  placeholder: "",
                  helpText: "",
                  options: [],
                },
              ],
            }))
          }
          style={s.secondaryBtn}
        >
          <Text style={s.secondaryBtnText}>+ Add field</Text>
        </Pressable>
      </View>

      {formCfg.customFields.map((field, idx) => (
        <View key={field.id} style={s.subCard}>
          <TextInput
            value={field.label}
            onChangeText={(v) => updateCustomField(idx, { label: v })}
            style={s.input}
            placeholder="Question label"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
            {FIELD_TYPES.map((ft) => (
              <Pressable
                key={ft}
                accessibilityRole="button"
                onPress={() => updateCustomField(idx, { fieldType: ft })}
                style={[s.chip, field.fieldType === ft && s.chipActive]}
              >
                <Text style={[s.chipText, field.fieldType === ft && s.chipTextActive]}>{ft}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={s.note}>Placed in Step {field.stepNumber} (tap below to cycle 1 to 10)</Text>
          <View style={s.subHead}>
            <Pressable
              accessibilityRole="button"
              onPress={() => updateCustomField(idx, { stepNumber: (field.stepNumber % 10) + 1 })}
              style={s.chip}
            >
              <Text style={s.chipText}>Step {field.stepNumber}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => updateCustomField(idx, { required: !field.required })}
              style={[s.chip, field.required && s.chipActive]}
            >
              <Text style={[s.chipText, field.required && s.chipTextActive]}>
                {field.required ? "Mandatory" : "Optional"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setFormCfg((prev) => ({
                  ...prev,
                  customFields: prev.customFields.filter((_, i) => i !== idx),
                }))
              }
              style={s.removeBtn}
            >
              <Text style={s.removeBtnText}>Remove</Text>
            </Pressable>
          </View>
          {field.fieldType === "select" && (
            <TextInput
              value={field.options.join(", ")}
              onChangeText={(v) => updateCustomField(idx, { options: v.split(",").map((x) => x.trim()).filter(Boolean) })}
              style={s.input}
              placeholder="Dropdown options, comma separated"
            />
          )}
          <TextInput
            value={field.helpText}
            onChangeText={(v) => updateCustomField(idx, { helpText: v })}
            style={s.input}
            placeholder="Applicant hint text"
          />
        </View>
      ))}

      <Text style={s.label}>Audit reason</Text>
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder="Explain why the form structure or accompanying copies checklist changed"
        style={s.input}
      />

      {!!error && <Text style={s.error}>{error}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={s.success}>{notice}</Text>}

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void saveBuilder()}
        style={[s.button, busy && s.disabled]}
      >
        <Text style={s.buttonText}>{busy ? "Saving form..." : "Save form configuration"}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.92)", padding: 16, gap: 10 },
  heading: { color: c.navy, fontSize: fontSizes.heading, fontWeight: "700" },
  sectionTitle: { color: c.navy, fontSize: fontSizes.body, fontWeight: "700", marginTop: 6 },
  note: { color: c.subtle, fontSize: fontSizes.subbody, lineHeight: 20 },
  label: { color: c.navy, fontSize: fontSizes.subbody, fontWeight: "700" },
  input: { backgroundColor: "#fff", borderWidth: 1, borderColor: c.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: fontSizes.body, color: c.navy },
  multi: { minHeight: 70, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  half: { flex: 1 },
  subCard: { backgroundColor: c.soft, borderRadius: 14, padding: 12, gap: 8, borderWidth: 1, borderColor: c.line },
  subHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" },
  subLabel: { color: c.rust, fontSize: fontSizes.subbody, fontWeight: "700" },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: c.line },
  chipActive: { backgroundColor: c.navy, borderColor: c.navy },
  chipText: { color: c.subtle, fontSize: fontSizes.caption, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  button: { backgroundColor: c.rust, borderRadius: 14, paddingVertical: 13, alignItems: "center", marginTop: 4 },
  buttonText: { color: "#fff", fontSize: fontSizes.body, fontWeight: "700" },
  secondaryBtn: { backgroundColor: "#fff1c9", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  secondaryBtnText: { color: c.rust, fontSize: fontSizes.caption, fontWeight: "700" },
  removeBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#FEE2E2" },
  removeBtnText: { color: "#991B1B", fontSize: fontSizes.caption, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  error: { color: "#B91C1C", fontSize: fontSizes.subbody, fontWeight: "700" },
  success: { color: c.teal, fontSize: fontSizes.subbody, fontWeight: "700" },
});
