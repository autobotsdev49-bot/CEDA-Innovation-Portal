import { createHash } from "node:crypto";

export const evidenceGuidanceExperiment = Object.freeze({
  id: "public-evidence-guidance-v1",
  variants: Object.freeze({
    A: "Attach evidence relevant to the application section.",
    B: "Attach evidence that supports the claim in this section. For example, include a prototype photo or a relevant test result.",
  }),
});

export function assignEvidenceGuidance(input: { experimentEnabled: boolean; anonymousAssignmentKey?: string }) {
  const { experimentEnabled, anonymousAssignmentKey } = input;
  if (!experimentEnabled || !anonymousAssignmentKey || !/^[a-f0-9]{32}$/i.test(anonymousAssignmentKey)) {
    return { variant: "A", enrolled: false, copy: evidenceGuidanceExperiment.variants.A } as const;
  }

  const digest = createHash("sha256")
    .update(evidenceGuidanceExperiment.id)
    .update(":")
    .update(anonymousAssignmentKey.toLowerCase())
    .digest();
  const variant = digest.readUInt32BE(0) < 0x80000000 ? "A" : "B";
  return { variant, enrolled: true, copy: evidenceGuidanceExperiment.variants[variant] } as const;
}
export type EvidenceGuidanceEvent = {
  assignmentKey: string;
  variant: "A" | "B";
  kind: "exposure" | "correct-response" | "requested-help";
};

export function summarizeEvidenceGuidance(events: readonly EvidenceGuidanceEvent[]) {
  const totals = {
    A: { exposed: 0, correct: 0, requestedHelp: 0 },
    B: { exposed: 0, correct: 0, requestedHelp: 0 },
  };
  const exposures = new Set<string>();
  const correct = new Set<string>();
  const help = new Set<string>();
  for (const event of events) {
    const assignment = assignEvidenceGuidance({ experimentEnabled: true, anonymousAssignmentKey: event.assignmentKey });
    if (!assignment.enrolled || assignment.variant !== event.variant) continue;
    const key = event.assignmentKey.toLowerCase();

    // Events must arrive in durable sequence. Discard outcomes before exposure.
    if (event.kind === "exposure" && !exposures.has(key)) {
      exposures.add(key);
      totals[event.variant].exposed++;
    }
    if (!exposures.has(key)) continue;
    if (event.kind === "correct-response" && !correct.has(key)) {
      correct.add(key);
      totals[event.variant].correct++;
    }
    if (event.kind === "requested-help" && !help.has(key)) {
      help.add(key);
      totals[event.variant].requestedHelp++;
    }
  }
  return totals;
}