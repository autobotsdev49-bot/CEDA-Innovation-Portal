import React from "react";
import { Text, View } from "react-native";
import type { WizardFormData } from "./innovatorDomain";
import type { ApplicationFormConfig } from "./portalCatalog";
import { adminStyleColors, ChoiceChips, FormField, FrostedInput, SwitchRow, useInnovatorA11y } from "./InnovatorUI";

/** Renders Admin-configured custom submission fields for the active wizard step. */
export function WizardCustomFieldsBlock({
  step,
  formConfig,
  formData,
  setField,
}: {
  step: number;
  formConfig?: ApplicationFormConfig | null;
  formData: WizardFormData;
  setField: <K extends keyof WizardFormData>(key: K, value: WizardFormData[K]) => void;
}) {
  const { fs } = useInnovatorA11y();
  if (!formConfig || step < 1 || step > 10) return null;
  const fields = formConfig.customFields.filter((f) => f.enabled && Number(f.stepNumber) === Number(step));
  if (!fields.length) return null;

  const responses =
    formData.customResponses && typeof formData.customResponses === "object"
      ? formData.customResponses
      : {};

  function setCustomValue(key: string, value: string | boolean) {
    setField("customResponses", { ...responses, [key]: value });
  }

  return (
    <View style={{ gap: 12, marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#E8DED2" }}>
      <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.rust, letterSpacing: 0.8 }}>
        ADDITIONAL PORTAL QUESTIONS
      </Text>
      {fields.map((field) => {
        const val = responses[field.key];
        const label = `${field.label}${field.required ? " *" : ""}`;

        if (field.fieldType === "checkbox") {
          return (
            <View key={field.id} style={{ gap: 4 }}>
              <SwitchRow
                label={label}
                detail={field.helpText || undefined}
                value={val === true || val === "true" || val === "Yes"}
                onValueChange={(next) => setCustomValue(field.key, next)}
              />
            </View>
          );
        }

        if (field.fieldType === "select") {
          return (
            <FormField key={field.id} label={label}>
              <ChoiceChips
                options={field.options}
                selected={String(val ?? "")}
                onSelect={(next) => setCustomValue(field.key, next)}
              />
              {!!field.helpText && (
                <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle }}>{field.helpText}</Text>
              )}
            </FormField>
          );
        }

        return (
          <FormField key={field.id} label={label}>
            <FrostedInput
              multiline={field.fieldType === "textarea"}
              keyboardType={field.fieldType === "url" ? "url" : "default"}
              autoCapitalize={field.fieldType === "url" ? "none" : "sentences"}
              value={String(val ?? "")}
              onChangeText={(next) => setCustomValue(field.key, next)}
              placeholder={field.placeholder || (field.fieldType === "url" ? "https://..." : "")}
              maxLength={field.fieldType === "textarea" ? 1500 : 300}
            />
            {!!field.helpText && (
              <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle }}>{field.helpText}</Text>
            )}
          </FormField>
        );
      })}
    </View>
  );
}
