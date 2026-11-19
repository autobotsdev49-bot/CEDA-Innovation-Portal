export type GuidanceRevision = {
  articleId: string;
  version: number;
  topic: string;
  sectorId: string | null;
  status: "draft" | "approved" | "published" | "retired";
  audience: "public" | "staff";
  approvedBy: string | null;
  answer: string;
};

export function resolveGuidance(
  revisions: readonly GuidanceRevision[],
  query: { topic: string; sectorId?: string },
) {
  // Snapshot input comes from the governed knowledge catalogue, never applicant submissions.
  const current = new Map<string, GuidanceRevision>();
  for (const revision of revisions) {
    if (revision.status !== "published" && revision.status !== "retired") continue;
    const previous = current.get(revision.articleId);
    if (!previous || previous.version < revision.version) current.set(revision.articleId, revision);
  }
  const matches = [...current.values()].filter((revision) =>
    revision.status === "published" && revision.audience === "public" &&
    revision.approvedBy?.trim() && revision.answer.trim() &&
    revision.topic === query.topic &&
    (revision.sectorId === null || revision.sectorId === query.sectorId),
  );
  const sectorMatches = query.sectorId ? matches.filter((revision) => revision.sectorId === query.sectorId) : [];
  const preferred = sectorMatches.length ? sectorMatches : matches;
  if (preferred.length !== 1) {
    return { kind: "human-handoff-offered" } as const;
  }
  const article = preferred[0];
  return { kind: "approved-answer", articleId: article.articleId, version: article.version, answer: article.answer } as const;
}