import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SectorOption } from "./innovatorApi";
import {
  applicantVerificationSlots,
  BENEFICIARY_GROUPS,
  BOTSWANA_DISTRICTS,
  charGuidance,
  documentChecklist,
  EVIDENCE_RULES,
  EVIDENCE_SECTION_CATEGORIES,
  formatBytes,
  INLINE_EVIDENCE_FIELDS,
  INNOVATION_STAGES,
  INNOVATION_TYPES,
  STAGE_MATRIX,
  WIZARD_STEPS,
  type ApplicationReadiness,
  type InnovatorApplication,
  type InnovatorDocument,
  type InnovationStage,
  type WizardFormData,
} from "./innovatorDomain";
import {
  ActionButton,
  adminStyleColors,
  ChoiceChips,
  FormField,
  FrostedInput,
  IconRow,
  InnovatorIcon,
  ProgressBar,
  SwitchRow,
  useInnovatorA11y,
} from "./InnovatorUI";

export interface WizardStepRenderProps {
  step: number;
  formData: WizardFormData;
  setField: <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => void;
  toggleArrayValue: (key: "innovationType" | "beneficiaries", value: string) => void;
  sectors: SectorOption[];
  draftDocs: InnovatorDocument[];
  readiness: ApplicationReadiness;
  evidenceSection: string;
  setEvidenceSection: (next: string) => void;
  evidenceCategory: string;
  setEvidenceCategory: (next: string) => void;
  evidenceTitle: string;
  setEvidenceTitle: (next: string) => void;
  evidenceNotes: string;
  setEvidenceNotes: (next: string) => void;
  replacingDocId: string | null;
  onCancelReplace: () => void;
  onPickAndUploadFile: () => void;
  onUploadVerificationSlot?: (category: string, label: string) => void;
  onAttachInlineField?: (fieldName: string, sectionKey: string) => void;
  inlineBusyKey?: string | null;
  uploadPercent: number | null;
  evidenceFeedback: string | null;
  videoTitle: string;
  setVideoTitle: (next: string) => void;
  videoUrl: string;
  setVideoUrl: (next: string) => void;
  videoSection: string;
  setVideoSection: (next: string) => void;
  onAddVideoLink: () => void;
  onPreviewDoc: (doc: InnovatorDocument) => void;
  onStartReplaceDoc: (doc: InnovatorDocument) => void;
  onRemoveDoc: (doc: InnovatorDocument) => void;
  onJumpToStep: (stepNumber: number) => void;
  onOpenPreviewModal: () => void;
  onOpenSubmitModal: () => void;
  districtExpanded: boolean;
  setDistrictExpanded: (v: boolean) => void;
  app: InnovatorApplication;
}

export function WizardStepBody(props: WizardStepRenderProps) {
  const { fs } = useInnovatorA11y();
  const [expandedReviewStep, setExpandedReviewStep] = useState<number | null>(null);
  const { step, formData, setField, toggleArrayValue, sectors } = props;
  const s = (k: keyof WizardFormData) => String(formData[k] ?? "");
  const isCompany = (formData.applicantType || "Individual") === "Registered company";

  const renderInlineAttach = (fieldName: string) => {
    const sectionKey = INLINE_EVIDENCE_FIELDS[fieldName];
    if (!sectionKey || !props.onAttachInlineField) return null;
    const attached = props.draftDocs.filter(
      (d) => d.category === `Answer: ${fieldName}` && d.docKind === "file" && d.uploadStatus === "Saved"
    );
    const busy = props.inlineBusyKey === `field:${fieldName}`;
    return (
      <View style={styles.inlineAttachBox}>
        <View style={styles.inlineAttachTop}>
          <ActionButton
            label={busy ? "Uploading..." : "Attach document"}
            variant="secondary"
            compact
            loading={busy}
            onPress={() => props.onAttachInlineField?.(fieldName, sectionKey)}
          />
          <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle, flex: 1 }}>
            Optional PDF, Office, or image up to 10 MB
          </Text>
        </View>
        {attached.map((doc) => (
          <View key={doc.id} style={styles.inlineFileRow}>
            <Text style={{ fontSize: fs("caption"), color: adminStyleColors.navy, flex: 1 }} numberOfLines={1}>
              {doc.fileName} ({formatBytes(doc.fileSize)})
            </Text>
            <Pressable onPress={() => props.onPreviewDoc(doc)}>
              <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.blueSoft }}>
                Preview
              </Text>
            </Pressable>
            <Pressable onPress={() => props.onRemoveDoc(doc)}>
              <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.rust }}>
                Remove
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    );
  };

  const documentChoice = (key: "problem" | "solution" | "implementation", section: string) => {
    const sourceKey = `${key}Source` as keyof WizardFormData;
    const documentKey = `${key}Document` as keyof WizardFormData;
    if (formData[sourceKey] !== "document") return null;
    const available = props.draftDocs.filter(d => d.sectionKey === section && d.docKind === "file" && d.uploadStatus === "Saved");
    return <View style={{ gap: 8 }}>
      <Text style={{ color: adminStyleColors.navy, fontSize: fs("subbody") }}>Linked proposal / plan document:</Text>
      {available.map(doc => <Pressable key={doc.id} onPress={() => setField(documentKey, doc.id)} style={[styles.selectorButton, formData[documentKey] === doc.id && { borderColor: adminStyleColors.rust }]} accessibilityRole="radio" accessibilityState={{ selected: formData[documentKey] === doc.id }}>
        <Text style={{ color: adminStyleColors.navy, flex: 1 }}>{doc.title}</Text><InnovatorIcon name="check" color={formData[documentKey] === doc.id ? adminStyleColors.rust : adminStyleColors.subtle} />
      </Pressable>)}
      <ActionButton label="Switch to written answer" variant="secondary" compact onPress={() => setField(sourceKey, "write")} />
    </View>;
  };

  if (step === 1) {
    return (
      <View style={styles.stepStack}>
        <FormField label="Applicant type">
          <ChoiceChips
            options={["Individual", "Registered company"]}
            selected={formData.applicantType || "Individual"}
            onSelect={(val) => setField("applicantType", val)}
          />
        </FormField>

        <FormField label="Full legal name">
          <FrostedInput
            value={s("fullName")}
            onChangeText={(v) => setField("fullName", v)}
            placeholder="Your full name"
            maxLength={120}
          />
        </FormField>

        <FormField label="Contact email">
          <FrostedInput
            value={s("email")}
            onChangeText={(v) => setField("email", v)}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="name@example.com"
          />
        </FormField>

        <FormField label="Phone number">
          <FrostedInput
            value={s("phone")}
            onChangeText={(v) => setField("phone", v)}
            keyboardType="phone-pad"
            placeholder="+267 7..."
            maxLength={40}
          />
        </FormField>

        <FormField label="Primary district">
          <Pressable
            onPress={() => props.setDistrictExpanded(!props.districtExpanded)}
            style={styles.selectorButton}
          >
            <Text style={{ fontSize: fs("body"), fontWeight: "600", color: adminStyleColors.navy }}>
              {formData.district || "Gaborone"}
            </Text>
            <Text style={{ fontSize: fs("subbody"), fontWeight: "600", color: adminStyleColors.blueSoft }}>
              {props.districtExpanded ? "Done" : "Change"}
            </Text>
          </Pressable>
          {props.districtExpanded ? (
            <View style={{ marginTop: 8 }}>
              <ChoiceChips
                options={BOTSWANA_DISTRICTS}
                selected={formData.district || "Gaborone"}
                onSelect={(d) => {
                  setField("district", d);
                  props.setDistrictExpanded(false);
                }}
              />
            </View>
          ) : null}
        </FormField>

        <FormField label="Area of expertise / background">
          <FrostedInput
            value={s("expertise")}
            onChangeText={(v) => setField("expertise", v)}
            placeholder="e.g. Agri-tech engineering, renewable hardware"
            maxLength={160}
          />
        </FormField>

        <FormField label="Do you have co-founders or collaborators?">
          <ChoiceChips
            options={["No", "Yes"]}
            selected={formData.hasCollaborators || "No"}
            onSelect={(v) => setField("hasCollaborators", v)}
          />
        </FormField>

        {formData.hasCollaborators === "Yes" ? (
          <FormField label="Collaborator names and roles">
            <FrostedInput
              multiline
              value={s("collaboratorsText")}
              onChangeText={(v) => setField("collaboratorsText", v)}
              placeholder="List key co-founders and technical collaborators..."
            />
          </FormField>
        ) : null}

        <View style={{ gap: 10 }}><Text style={{ color: adminStyleColors.navy, fontWeight: "700", fontSize: fs("body") }}>Alternative contact (optional)</Text><Text style={{ color: adminStyleColors.subtle, fontSize: fs("subbody") }}>Only if we cannot reach you about this application. Ask this person first.</Text>
          <FormField label="Contact name"><FrostedInput value={s("alternativeContactName")} onChangeText={v => setField("alternativeContactName", v)} /></FormField>
          <FormField label="Relationship"><FrostedInput value={s("alternativeContactRelationship")} onChangeText={v => setField("alternativeContactRelationship", v)} /></FormField>
          <FormField label="Phone number"><FrostedInput value={s("alternativeContactPhone")} onChangeText={v => setField("alternativeContactPhone", v)} keyboardType="phone-pad" /></FormField>
          <SwitchRow label="This person agreed to be contacted for this purpose" value={Boolean(formData.alternativeContactConsent)} onValueChange={v => setField("alternativeContactConsent", v)} last />
        </View>

        {isCompany ? (
          <View style={styles.companyBox}>
            <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.blue, letterSpacing: 1 }}>
              REGISTERED COMPANY DETAILS
            </Text>
            <FormField label="Registered company name">
              <FrostedInput
                value={s("companyName")}
                onChangeText={(v) => setField("companyName", v)}
                placeholder="Registered legal entity name"
              />
            </FormField>
            <FormField label="CIPA registration number">
              <FrostedInput
                value={s("companyRegNumber")}
                onChangeText={(v) => setField("companyRegNumber", v)}
                placeholder="BW..."
              />
            </FormField>
            <FormField label="Company sector">
              <FrostedInput
                value={s("companySector")}
                onChangeText={(v) => setField("companySector", v)}
                placeholder="Primary trading sector"
              />
            </FormField>
            <FormField label="Your role / authority">
              <FrostedInput
                value={s("representativeRole")}
                onChangeText={(v) => setField("representativeRole", v)}
                placeholder="Founder / Managing Director"
              />
            </FormField>
            <SwitchRow
              label="I hold formal authority to submit for this company"
              value={Boolean(formData.companyAuthority)}
              onValueChange={(v) => setField("companyAuthority", v)}
              last
            />
          </View>
        ) : null}
      </View>
    );
  }

  if (step === 2) {
    const g = charGuidance(formData.summary, 20, 120, 1500);
    return (
      <View style={styles.stepStack}>
        <FormField label="Innovation title">
          <FrostedInput
            value={s("title")}
            onChangeText={(v) => setField("title", v)}
            placeholder="Clear name for your innovation"
            maxLength={200}
          />
        </FormField>
        <FormField
          label="Plain-language summary"
          counterText={g.label}
          counterOk={g.state === "strong" || g.state === "ok"}
        >
          <FrostedInput
            multiline
            value={s("summary")}
            onChangeText={(v) => setField("summary", v)}
            placeholder="Explain in plain language what your innovation does and why it matters."
            maxLength={1500}
          />
        </FormField>
        <FormField label="Primary CEDA sector">
          <ChoiceChips
            options={sectors.map((sec) => sec.name)}
            selected={formData.primarySector || props.app.sector}
            onSelect={(v) => setField("primarySector", v)}
          />
        </FormField>
        <FormField label="Core technology or delivery method">
          <FrostedInput
            value={s("technologyMethod")}
            onChangeText={(v) => setField("technologyMethod", v)}
            placeholder="e.g. Solar IoT telemetry + offline USSD alert engine"
          />
        </FormField>
        <FormField label="Innovation categories">
          <ChoiceChips
            multi
            options={INNOVATION_TYPES}
            selected={Array.isArray(formData.innovationType) ? formData.innovationType : []}
            onSelect={(v) => toggleArrayValue("innovationType", v)}
          />
        </FormField>
      </View>
    );
  }

  if (step === 3) {
    const g = charGuidance(formData.problem, 20, 120, 5000);
    return (
      <View style={styles.stepStack}>
        {documentChoice("problem", "problem")}
        <FormField
          label="Problem being addressed"
          counterText={g.label}
          counterOk={g.state === "strong" || g.state === "ok"}
        >
          <FrostedInput
            multiline
            value={s("problem")}
            onChangeText={(v) => setField("problem", v)}
            placeholder="Who suffers from this challenge in Botswana, how often does it occur, and why do current options fall short?"
            maxLength={5000}
          />
          {renderInlineAttach("problem")}
        </FormField>
        <FormField label="Why this problem is urgent today">
          <FrostedInput
            multiline
            value={s("problemUrgency")}
            onChangeText={(v) => setField("problemUrgency", v)}
            placeholder="Describe economic cost, food/water impact, productivity loss, or compliance pressure."
            maxLength={2000}
          />
          {renderInlineAttach("problemUrgency")}
        </FormField>
      </View>
    );
  }

  if (step === 4) {
    const g = charGuidance(formData.solution, 20, 140, 5000);
    return (
      <View style={styles.stepStack}>
        {documentChoice("solution", "problem")}
        <FormField
          label="Proposed solution"
          counterText={g.label}
          counterOk={g.state === "strong" || g.state === "ok"}
        >
          <FrostedInput
            multiline
            value={s("solution")}
            onChangeText={(v) => setField("solution", v)}
            placeholder="Describe step by step how your solution works and what makes it distinct."
            maxLength={5000}
          />
          {renderInlineAttach("solution")}
        </FormField>
        <FormField label="Are there existing alternatives in Botswana?">
          <ChoiceChips
            options={["Yes", "No", "Unsure"]}
            selected={formData.hasAlternatives || "Unsure"}
            onSelect={(v) => setField("hasAlternatives", v)}
          />
        </FormField>
        <FormField label="How your approach outperforms alternatives">
          <FrostedInput
            multiline
            value={s("alternativesDetail")}
            onChangeText={(v) => setField("alternativesDetail", v)}
            placeholder="Compare cost, turnaround time, local compatibility, or reliability."
          />
          {renderInlineAttach("alternativesDetail")}
        </FormField>
        <FormField label="Have real target users tested this solution?">
          <ChoiceChips
            options={["No", "Yes"]}
            selected={formData.testedWithUsers || "No"}
            onSelect={(v) => setField("testedWithUsers", v)}
          />
        </FormField>
        {formData.testedWithUsers === "Yes" ? (
          <FormField label="User feedback & testing lessons">
            <FrostedInput
              multiline
              value={s("testingLessons")}
              onChangeText={(v) => setField("testingLessons", v)}
              placeholder="What changed based on real user trials?"
            />
          </FormField>
        ) : null}
      </View>
    );
  }

  if (step === 5) {
    return (
      <View style={styles.stepStack}>
        <FormField label="Target user & beneficiary groups">
          <ChoiceChips
            multi
            options={BENEFICIARY_GROUPS}
            selected={Array.isArray(formData.beneficiaries) ? formData.beneficiaries : []}
            onSelect={(v) => toggleArrayValue("beneficiaries", v)}
          />
        </FormField>
        <FormField label="Deployment footprint">
          <ChoiceChips
            options={[
              "Local community / single district",
              "Multi-district across Botswana",
              "National coverage",
              "Regional SADC export potential",
            ]}
            selected={formData.deploymentFootprint || "Local community / single district"}
            onSelect={(v) => setField("deploymentFootprint", v)}
          />
        </FormField>
        <FormField label="Citizen inclusion & empowerment focus">
          <FrostedInput
            multiline
            value={s("empowermentFocus")}
            onChangeText={(v) => setField("empowermentFocus", v)}
            placeholder="Explain how youth, women, rural producers, or MSMEs benefit cleanly."
          />
        </FormField>
      </View>
    );
  }

  if (step === 6) {
    return (
      <View style={styles.stepStack}>
        <FormField label="Strategic value to Botswana">
          <FrostedInput
            multiline
            value={s("botswanaBenefit")}
            onChangeText={(v) => setField("botswanaBenefit", v)}
            placeholder="Import substitution, export diversification, climate resilience, or public service efficiency."
          />
          {renderInlineAttach("botswanaBenefit")}
        </FormField>
        <FormField label="Environmental impact">
          <ChoiceChips
            options={["Positive", "Neutral", "Managed risk"]}
            selected={formData.environmentalImpact || "Positive"}
            onSelect={(v) => setField("environmentalImpact", v)}
          />
        </FormField>
        <FormField label="Sustainability or waste notes">
          <FrostedInput
            multiline
            value={s("environmentalNotes")}
            onChangeText={(v) => setField("environmentalNotes", v)}
            placeholder="Water, energy, emissions, or e-waste safeguards."
          />
        </FormField>
        <FormField label="Evidence of market demand">
          <FrostedInput
            multiline
            value={s("marketDemand")}
            onChangeText={(v) => setField("marketDemand", v)}
            placeholder="Letters of intent, waitlist size, off-take interest, or paying pilot contracts."
          />
          {renderInlineAttach("marketDemand")}
        </FormField>
        <FormField label="Direct job creation outlook">
          <ChoiceChips
            options={["Yes", "Unsure", "No"]}
            selected={formData.createsJobs || "Yes"}
            onSelect={(v) => setField("createsJobs", v)}
          />
        </FormField>
        <View style={styles.inlineThree}>
          <View style={{ flex: 1 }}>
            <FormField label="Year 1">
              <FrostedInput
                keyboardType="numeric"
                value={s("jobsYear1")}
                onChangeText={(v) => setField("jobsYear1", v)}
                placeholder="4"
              />
            </FormField>
          </View>
          <View style={{ flex: 1 }}>
            <FormField label="Year 3">
              <FrostedInput
                keyboardType="numeric"
                value={s("jobsYear3")}
                onChangeText={(v) => setField("jobsYear3", v)}
                placeholder="12"
              />
            </FormField>
          </View>
          <View style={{ flex: 1 }}>
            <FormField label="Year 5">
              <FrostedInput
                keyboardType="numeric"
                value={s("jobsYear5")}
                onChangeText={(v) => setField("jobsYear5", v)}
                placeholder="30"
              />
            </FormField>
          </View>
        </View>
        <FormField label="Job & commercial assumptions">
          <FrostedInput
            multiline
            value={s("jobsAssumptions")}
            onChangeText={(v) => setField("jobsAssumptions", v)}
            placeholder="What sales or production volume supports those jobs?"
          />
          {renderInlineAttach("jobsAssumptions")}
        </FormField>
      </View>
    );
  }

  if (step === 7) {
    const activeStage = (INNOVATION_STAGES.includes(formData.stage as InnovationStage)
      ? formData.stage
      : "Prototype") as InnovationStage;
    const cfg = STAGE_MATRIX[activeStage];

    return (
      <View style={styles.stepStack}>
        <FormField label="Select your current innovation stage">
          <ChoiceChips
            options={INNOVATION_STAGES}
            selected={activeStage}
            onSelect={(v) => setField("stage", v)}
          />
        </FormField>

        <View style={styles.amberBanner}>
          <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.amber, letterSpacing: 0.8 }}>
            {activeStage.toUpperCase()} STAGE GUIDANCE
          </Text>
          <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.navy, marginTop: 4, lineHeight: 20 }}>
            {cfg.summary}
          </Text>
          <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle, marginTop: 6, lineHeight: 18 }}>
            Suggested evidence: {cfg.evidenceHint}
          </Text>
          <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle, marginTop: 3, lineHeight: 18 }}>
            Next milestone focus: {cfg.milestoneHint}
          </Text>
        </View>

        <FormField label={cfg.metricsLabel}>
          <FrostedInput
            multiline
            value={s("stageEvidenceNotes")}
            onChangeText={(v) => setField("stageEvidenceNotes", v)}
            placeholder={cfg.metricsPlaceholder}
          />
          {renderInlineAttach("stageEvidenceNotes")}
        </FormField>

        <FormField label="Immediate next stage milestone">
          <FrostedInput
            multiline
            value={s("stageMilestoneNext")}
            onChangeText={(v) => setField("stageMilestoneNext", v)}
            placeholder={cfg.milestoneHint}
          />
          {renderInlineAttach("stageMilestoneNext")}
        </FormField>
      </View>
    );
  }

  if (step === 8) {
    return (
      <View style={styles.stepStack}>
        {documentChoice("implementation", "feasibility")}
        <FormField label="Implementation approach">
          <FrostedInput
            multiline
            value={s("implementationApproach")}
            onChangeText={(v) => setField("implementationApproach", v)}
            placeholder="Outline production, regulatory approvals, distribution, and quality assurance."
          />
          {renderInlineAttach("implementationApproach")}
        </FormField>
        <FormField label="Year 1 milestone">
          <FrostedInput
            value={s("milestone1Year")}
            onChangeText={(v) => setField("milestone1Year", v)}
            placeholder="e.g. Complete 10-farm live trial and BOBS verification"
          />
        </FormField>
        <FormField label="Year 3 milestone">
          <FrostedInput
            value={s("milestone3Year")}
            onChangeText={(v) => setField("milestone3Year", v)}
            placeholder="e.g. Reach 200 paying MSME sites across 6 districts"
          />
        </FormField>
        <FormField label="Year 5 milestone">
          <FrostedInput
            value={s("milestone5Year")}
            onChangeText={(v) => setField("milestone5Year", v)}
            placeholder="e.g. Expand regional SADC distribution and local assembly"
          />
        </FormField>
        <FormField label="Key delivery risks & mitigations">
          <FrostedInput
            multiline
            value={s("risksAndMitigations")}
            onChangeText={(v) => setField("risksAndMitigations", v)}
            placeholder="Supply chain, regulatory, adoption, or cashflow risks + mitigations."
          />
          {renderInlineAttach("risksAndMitigations")}
        </FormField>
      </View>
    );
  }

  if (step === 9) {
    return (
      <View style={styles.stepStack}>
        <FormField label="Team experience & execution capability">
          <FrostedInput
            multiline
            value={s("teamExperience")}
            onChangeText={(v) => setField("teamExperience", v)}
            placeholder="Summarize technical, commercial, and sector delivery skills across your team."
          />
        </FormField>
        <FormField label="Critical resource gaps & hires needed">
          <FrostedInput
            multiline
            value={s("resourcesNeeded")}
            onChangeText={(v) => setField("resourcesNeeded", v)}
            placeholder="Machinery, testing certifications, specialist hires, or workspace needs."
          />
        </FormField>
        <FormField label="Strategic partners or off-takers">
          <FrostedInput
            multiline
            value={s("partnerships")}
            onChangeText={(v) => setField("partnerships", v)}
            placeholder="Universities, suppliers, cooperatives, or industry distribution partners."
          />
        </FormField>
      </View>
    );
  }

  if (step === 10) {
    return (
      <View style={styles.stepStack}>
        <FormField label="Support required from CEDA">
          <FrostedInput
            multiline
            value={s("supportRequestedSummary")}
            onChangeText={(v) => setField("supportRequestedSummary", v)}
            placeholder="Specify funding amount/purpose, technical commercialization support, or market access mentorship."
          />
          {renderInlineAttach("supportRequestedSummary")}
        </FormField>
        <FormField label="Business plan status">
          <ChoiceChips
            options={["Yes", "In progress", "No"]}
            selected={formData.hasBusinessPlan || "In progress"}
            onSelect={(v) => setField("hasBusinessPlan", v)}
          />
        </FormField>
        <FormField label="Financial projections status">
          <ChoiceChips
            options={["Yes", "In progress", "No"]}
            selected={formData.hasFinancialProjections || "In progress"}
            onSelect={(v) => setField("hasFinancialProjections", v)}
          />
        </FormField>
        <FormField label="Key revenue & cost assumptions">
          <FrostedInput
            multiline
            value={s("financialAssumptions")}
            onChangeText={(v) => setField("financialAssumptions", v)}
            placeholder="Pricing model, unit cost, gross margin, and break-even timeline."
          />
          {renderInlineAttach("financialAssumptions")}
        </FormField>
      </View>
    );
  }

  if (step === 11) {
    const verificationSlots = applicantVerificationSlots(formData.applicantType);
    const checklistItems = documentChecklist(formData.applicantType, props.draftDocs);

    return (
      <View style={styles.stepStack}>
        <View style={styles.amberBanner}>
          <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.amber }}>
            PRIVATE EVIDENCE LIMITS
          </Text>
          <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.navy, marginTop: 4, lineHeight: 19 }}>
            PDF, DOCX, PPTX, XLSX, JPG, PNG · max 10 MB per file · up to 12 applicant verification files, 8 supplementary files, 4 in other sections.
          </Text>
        </View>

        <View style={styles.companyBox}>
          <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.blue, letterSpacing: 0.9 }}>
            APPLICANT VERIFICATION DOCUMENTS
          </Text>
          <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle, lineHeight: 18 }}>
            Attach each verification record below. Attachments made directly on earlier answers stay linked to those questions.
          </Text>
          {verificationSlots.map((slot) => {
            const matching = props.draftDocs.filter(
              (doc) => doc.category === slot.category && doc.docKind === "file" && doc.uploadStatus === "Saved"
            );
            const busy = props.inlineBusyKey === `verify:${slot.category}`;
            return (
              <View key={slot.category} style={styles.verifySlotRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.navy }}>
                    {slot.label}
                  </Text>
                  <Text style={{ fontSize: fs("caption"), color: matching.length ? adminStyleColors.teal : adminStyleColors.subtle }}>
                    {matching.length
                      ? `${matching.length} attached: ${matching.map((d) => d.fileName).join(", ")}`
                      : "No file attached yet"}
                  </Text>
                </View>
                {props.onUploadVerificationSlot ? (
                  <ActionButton
                    label={busy ? "..." : matching.length ? "Add file" : "Upload"}
                    variant="secondary"
                    compact
                    loading={busy}
                    onPress={() => props.onUploadVerificationSlot?.(slot.category, slot.label)}
                  />
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={styles.checklistPanel}>
          <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.subtle, letterSpacing: 0.9 }}>
            EVIDENCE READINESS CHECKLIST
          </Text>
          {checklistItems.map((item) => (
            <View key={item.label} style={styles.checklistItemRow}>
              <InnovatorIcon
                name="check"
                color={item.attached ? adminStyleColors.teal : adminStyleColors.subtle}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fs("subbody"), fontWeight: "600", color: adminStyleColors.navy }}>
                  {item.label}
                </Text>
                <Text style={{ fontSize: fs("caption"), color: item.attached ? adminStyleColors.teal : adminStyleColors.subtle }}>
                  {item.attached ? "Attached" : item.timing}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.divider} />

        <Text style={{ fontSize: fs("heading"), fontWeight: "700", color: adminStyleColors.navy }}>
          Additional supporting documents
        </Text>

        <FormField label="Document category">
          <ChoiceChips
            options={EVIDENCE_RULES.sectionCategories}
            selected={props.evidenceCategory}
            onSelect={props.setEvidenceCategory}
          />
        </FormField>

        <FormField label="Evidence section">
          <ChoiceChips
            options={EVIDENCE_SECTION_CATEGORIES.filter((c) => c.key !== "clarification").map((c) => c.key)}
            selected={props.evidenceSection}
            onSelect={props.setEvidenceSection}
          />
        </FormField>

        <FormField label="Document title">
          <FrostedInput
            value={props.evidenceTitle}
            onChangeText={props.setEvidenceTitle}
            placeholder="e.g. Pilot testing metrics deck"
            maxLength={160}
          />
        </FormField>

        <FormField label="Reviewer notes (optional)">
          <FrostedInput
            value={props.evidenceNotes}
            onChangeText={props.setEvidenceNotes}
            placeholder="Key figures or diagram pages to highlight"
            maxLength={300}
          />
        </FormField>

        {props.replacingDocId ? (
          <View style={styles.replaceNotice}>
            <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.navy, flex: 1 }}>
              Replacing existing document on next upload.
            </Text>
            <Pressable onPress={props.onCancelReplace}>
              <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.rust }}>
                Cancel
              </Text>
            </Pressable>
          </View>
        ) : null}

        <ActionButton
          label={props.replacingDocId ? "Pick replacement file & upload" : "Choose & upload file securely"}
          onPress={props.onPickAndUploadFile}
        />

        {props.uploadPercent !== null ? (
          <View style={{ gap: 6 }}>
            <ProgressBar percent={props.uploadPercent} color={adminStyleColors.tealBright} />
            <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle }}>
              Uploading privately ({props.uploadPercent}%)...
            </Text>
          </View>
        ) : null}

        {props.evidenceFeedback ? (
          <Text style={{ fontSize: fs("subbody"), fontWeight: "600", color: adminStyleColors.teal }}>
            {props.evidenceFeedback}
          </Text>
        ) : null}

        <View style={styles.divider} />

        <Text style={{ fontSize: fs("heading"), fontWeight: "700", color: adminStyleColors.navy }}>
          Add approved HTTPS video link
        </Text>
        <FormField label="Video title">
          <FrostedInput
            value={props.videoTitle}
            onChangeText={props.setVideoTitle}
            placeholder="e.g. 2-minute prototype walkthrough"
            maxLength={160}
          />
        </FormField>
        <FormField label="HTTPS video URL">
          <FrostedInput
            value={props.videoUrl}
            onChangeText={props.setVideoUrl}
            keyboardType="url"
            autoCapitalize="none"
            placeholder="https://..."
            maxLength={500}
          />
        </FormField>
        <FormField label="Video section">
          <ChoiceChips
            options={["supplementary", "feasibility", "problem", "impact"]}
            selected={props.videoSection}
            onSelect={props.setVideoSection}
          />
        </FormField>
        <ActionButton label="Attach HTTPS video link" variant="secondary" onPress={props.onAddVideoLink} />

        <View style={styles.divider} />

        <Text style={{ fontSize: fs("heading"), fontWeight: "700", color: adminStyleColors.navy }}>
          Attached draft evidence ({props.draftDocs.length})
        </Text>
        {props.draftDocs.length ? (
          props.draftDocs.map((doc, idx) => (
            <View
              key={doc.id}
              style={[styles.docItemRow, idx === props.draftDocs.length - 1 && { borderBottomWidth: 0 }]}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={{ fontSize: fs("body"), fontWeight: "600", color: adminStyleColors.navy }}>
                  {doc.title || doc.fileName}
                </Text>
                <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle }}>
                  {doc.sectionKey} · {doc.docKind === "video_link" ? doc.videoUrl : `${doc.fileName} (${formatBytes(doc.fileSize)})`}
                </Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  <ActionButton label="Preview" compact variant="secondary" onPress={() => props.onPreviewDoc(doc)} />
                  {doc.docKind !== "video_link" ? (
                    <ActionButton label="Replace" compact variant="secondary" onPress={() => props.onStartReplaceDoc(doc)} />
                  ) : null}
                  <ActionButton label="Remove" compact variant="secondary" onPress={() => props.onRemoveDoc(doc)} />
                </View>
              </View>
            </View>
          ))
        ) : (
          <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle }}>
            No files or video links attached yet.
          </Text>
        )}
      </View>
    );
  }

  // Step 12: Declaration and review
  const { readiness } = props;
  const stepPreviewFields: Record<number, { label: string; value: string }[]> = {
    1: [
      { label: "Applicant type", value: s("applicantType") },
      { label: "Full name", value: s("fullName") },
      { label: "District", value: s("district") },
      { label: "Company", value: s("companyName") },
    ],
    2: [
      { label: "Title", value: s("title") },
      { label: "Primary sector", value: s("primarySector") },
      { label: "Summary", value: s("summary") },
    ],
    3: [
      { label: "Problem", value: s("problem") },
      { label: "Urgency", value: s("problemUrgency") },
    ],
    4: [
      { label: "Solution", value: s("solution") },
      { label: "Alternatives comparison", value: s("alternativesDetail") },
    ],
    5: [{ label: "Deployment footprint", value: s("deploymentFootprint") }],
    6: [
      { label: "Botswana benefit", value: s("botswanaBenefit") },
      { label: "Market demand", value: s("marketDemand") },
    ],
    7: [
      { label: "Stage", value: s("stage") },
      { label: "Stage validation notes", value: s("stageEvidenceNotes") },
    ],
    8: [
      { label: "Implementation approach", value: s("implementationApproach") },
      { label: "Risks & mitigations", value: s("risksAndMitigations") },
    ],
    9: [{ label: "Team capability", value: s("teamExperience") }],
    10: [
      { label: "Support requested", value: s("supportRequestedSummary") },
      { label: "Financial assumptions", value: s("financialAssumptions") },
    ],
  };

  return (
    <View style={styles.stepStack}>
      <View style={readiness.blockers.length ? styles.amberBanner : styles.tealBanner}>
        <Text
          style={{
            fontSize: fs("caption"),
            fontWeight: "700",
            color: readiness.blockers.length ? adminStyleColors.amber : adminStyleColors.teal,
            letterSpacing: 0.8,
          }}
        >
          READINESS CHECK ({readiness.completedSections.length}/12 SECTIONS · {readiness.evidenceCount} EVIDENCE)
        </Text>
        {readiness.blockers.length ? (
          <View style={{ gap: 4, marginTop: 8 }}>
            <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.navy }}>
              Complete these required items before submitting:
            </Text>
            {readiness.blockers.map((b, i) => (
              <IconRow
                key={b.step}
                title={`Step ${b.step}: ${b.label}`}
                icon="alert"
                color={adminStyleColors.rust}
                tint="#FBEDE8"
                badge="Edit"
                last={i === readiness.blockers.length - 1}
                onPress={() => props.onJumpToStep(b.step)}
              />
            ))}
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
            <InnovatorIcon name="check" color={adminStyleColors.teal} />
            <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.teal }}>
              All required submission checks pass cleanly.
            </Text>
          </View>
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.navy }}>
          Section answers & attachments ({readiness.completedSections.length}/12 ready)
        </Text>
        {WIZARD_STEPS.slice(0, 11).map((meta) => {
          const isReady = readiness.completedSections.includes(meta.number);
          const expanded = expandedReviewStep === meta.number;
          const stepFields = (stepPreviewFields[meta.number] || []).filter((f) => f.value.trim().length > 0);
          const stepDocs = props.draftDocs.filter(
            (doc) =>
              doc.docKind === "file" &&
              doc.uploadStatus === "Saved" &&
              (meta.number === 11
                ? doc.sectionKey === "applicant" || doc.sectionKey === "supplementary"
                : doc.category.startsWith("Answer:") && doc.sectionKey === (meta.key === "overview" ? "applicant" : meta.key === "solution" ? "problem" : meta.key === "impact" || meta.key === "beneficiaries" ? "impact" : meta.key === "support" ? "supplementary" : meta.key))
          );

          return (
            <View key={meta.number} style={styles.reviewStepCard}>
              <View style={styles.reviewStepHead}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fs("subbody"), fontWeight: "700", color: adminStyleColors.navy }}>
                    Step {meta.number}: {meta.title}
                  </Text>
                  <Text style={{ fontSize: fs("caption"), color: isReady ? adminStyleColors.teal : adminStyleColors.amber }}>
                    {isReady ? "Completed" : "Needs attention"}
                  </Text>
                </View>
                <Pressable onPress={() => setExpandedReviewStep(expanded ? null : meta.number)}>
                  <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.blueSoft }}>
                    {expanded ? "Hide" : "Inspect"}
                  </Text>
                </Pressable>
                <Pressable onPress={() => props.onJumpToStep(meta.number)}>
                  <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.rust }}>
                    Edit
                  </Text>
                </Pressable>
              </View>
              {expanded ? (
                <View style={styles.reviewStepBody}>
                  {stepFields.map((entry) => (
                    <Text key={entry.label} style={{ fontSize: fs("caption"), color: adminStyleColors.navy, lineHeight: 18 }}>
                      <Text style={{ fontWeight: "700" }}>{entry.label}: </Text>
                      {entry.value}
                    </Text>
                  ))}
                  {stepDocs.map((doc) => (
                    <View key={doc.id} style={styles.inlineFileRow}>
                      <Text style={{ fontSize: fs("caption"), color: adminStyleColors.navy, flex: 1 }} numberOfLines={1}>
                        {doc.fileName}
                      </Text>
                      <Pressable onPress={() => props.onPreviewDoc(doc)}>
                        <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.blueSoft }}>
                          Preview
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                  {!stepFields.length && !stepDocs.length ? (
                    <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle }}>
                      No answers or attachments entered yet for this step.
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <FormField label="Did you or your team develop this innovation?">
        <ChoiceChips
          options={["Yes", "Licensed / Partnered"]}
          selected={formData.selfDeveloped || "Yes"}
          onSelect={(v) => setField("selfDeveloped", v)}
        />
      </FormField>
      <FormField label="Are there third-party IP contributors?">
        <ChoiceChips
          options={["No", "Yes"]}
          selected={formData.otherContributors || "No"}
          onSelect={(v) => setField("otherContributors", v)}
        />
      </FormField>
      <FormField label="Has any trade secret been published openly?">
        <ChoiceChips
          options={["No", "Yes"]}
          selected={formData.sharedPublicly || "No"}
          onSelect={(v) => setField("sharedPublicly", v)}
        />
      </FormField>
      <FormField label="Any existing funding or investor agreements?">
        <ChoiceChips
          options={["No", "Yes"]}
          selected={formData.existingAgreements || "No"}
          onSelect={(v) => setField("existingAgreements", v)}
        />
      </FormField>

      <View>
        <SwitchRow
          label="Permission to submit"
          detail="I hold the right and permission to submit this innovation and evidence to CEDA."
          value={Boolean(formData.permissionToSubmit)}
          onValueChange={(v) => setField("permissionToSubmit", v)}
        />
        <SwitchRow
          label="Accuracy declaration"
          detail="All information provided in this application is truthful and accurate."
          value={Boolean(formData.accuracyConfirmed)}
          onValueChange={(v) => setField("accuracyConfirmed", v)}
        />
        <SwitchRow
          label="Confidentiality consent"
          detail="I consent to CEDA processing this submission confidentially for screening and support."
          value={Boolean(formData.privacyConfirmed)}
          onValueChange={(v) => setField("privacyConfirmed", v)}
          last
        />
      </View>

      <View style={{ gap: 10 }}>
        <ActionButton
          label="Preview full application"
          variant="secondary"
          onPress={props.onOpenPreviewModal}
        />
        <ActionButton
          label={`Submit application (${WIZARD_STEPS[11].short})`}
          onPress={props.onOpenSubmitModal}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepStack: { gap: 14 },
  selectorButton: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: adminStyleColors.inputBorder,
  },
  companyBox: {
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(234,241,252,0.55)",
    borderWidth: 1,
    borderColor: "rgba(40,89,155,0.18)",
  },
  checklistPanel: {
    gap: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(247, 242, 235, 0.72)",
    borderWidth: 1,
    borderColor: adminStyleColors.line,
  },
  checklistItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  verifySlotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(40,89,155,0.12)",
  },
  inlineAttachBox: {
    marginTop: 8,
    gap: 6,
  },
  inlineAttachTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inlineFileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.86)",
    borderWidth: 1,
    borderColor: adminStyleColors.line,
  },
  reviewStepCard: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.82)",
    borderWidth: 1,
    borderColor: adminStyleColors.line,
    gap: 8,
  },
  reviewStepHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  reviewStepBody: {
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: adminStyleColors.line,
  },
  inlineThree: { flexDirection: "row", gap: 8 },
  amberBanner: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#FCF4E4",
    borderWidth: 1,
    borderColor: "rgba(148,112,45,0.22)",
  },
  tealBanner: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#E4F4F0",
    borderWidth: 1,
    borderColor: "rgba(35,109,97,0.22)",
  },
  replaceNotice: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#FBEDE8",
    gap: 8,
  },
  divider: { height: 1, backgroundColor: adminStyleColors.line, marginVertical: 4 },
  docItemRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: adminStyleColors.line,
  },
  missingChip: {
    minHeight: 38,
    paddingHorizontal: 13,
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "rgba(255,250,244,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
  },
});
