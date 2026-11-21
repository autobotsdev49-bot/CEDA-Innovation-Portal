import React, { useMemo, useState } from "react";
import { Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { FrostedSurface } from "./FrostedGlass";
import { withdrawApplication } from "./innovatorApi";
import {
  APPLICATION_SORT_OPTIONS,
  APPLICATION_STATUS_FILTERS,
  applicationRequiredAction,
  canWithdrawApplication,
  filterAndSortApplications,
  type ApplicationSortKey,
  type InnovatorApplication,
} from "./innovatorDomain";
import {
  ActionButton,
  adminStyleColors,
  FlushSheetModal,
  FormField,
  FrostedInput,
  FrostedSearchPill,
  GlassCard,
  InnovatorIcon,
  statusAppearance,
  StatusPill,
  useInnovatorA11y,
} from "./InnovatorUI";
import { buttonCornerRadius } from "./theme";

const PAGE_SIZE = 6;

export function InnovatorApplications({
  token,
  applications,
  statusFilter,
  onStatusFilterChange,
  refreshing,
  onRefresh,
  onContinueDraft,
  onViewDetail,
  onStartNew,
  onApplicationUpdated,
}: {
  token: string;
  applications: InnovatorApplication[];
  statusFilter: string;
  onStatusFilterChange: (next: string) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onContinueDraft: (app: InnovatorApplication) => void;
  onViewDetail: (appId: string, tab?: string) => void;
  onStartNew: () => void;
  onApplicationUpdated: (updated: InnovatorApplication) => void;
}) {
  const { fs } = useInnovatorA11y();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<ApplicationSortKey>("updated_desc");
  const [page, setPage] = useState(1);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);

  const [withdrawTarget, setWithdrawTarget] = useState<InnovatorApplication | null>(null);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const filtered = useMemo(
    () => filterAndSortApplications(applications, { query, status: statusFilter, sort: sortKey }),
    [applications, query, statusFilter, sortKey]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const hasFilters = Boolean(query.trim()) || statusFilter !== "All" || sortKey !== "updated_desc";
  const currentSortLabel = APPLICATION_SORT_OPTIONS.find((s) => s.key === sortKey)?.label || "Recently updated";

  async function handleConfirmWithdraw() {
    if (!withdrawTarget) return;
    const trimmed = withdrawReason.trim();
    if (trimmed.length < 5) {
      setWithdrawError("Provide a brief reason (5-500 characters).");
      return;
    }
    setWithdrawBusy(true);
    setWithdrawError(null);
    try {
      const updated = await withdrawApplication(token, withdrawTarget.id, trimmed);
      onApplicationUpdated(updated);
      setWithdrawTarget(null);
      setWithdrawReason("");
    } catch (err) {
      setWithdrawError(err instanceof Error ? err.message : "Could not withdraw application.");
    } finally {
      setWithdrawBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminStyleColors.rust} />
        }
      >
        <FrostedSearchPill
          value={query}
          onChangeText={(txt) => {
            setQuery(txt);
            setPage(1);
          }}
          placeholder="Search reference, title or sector"
          rightButton={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sort applications. ${currentSortLabel}`}
              onPress={() => {
                Keyboard.dismiss();
                setSortSheetOpen(true);
              }}
              style={[styles.funnelButton, sortKey !== "updated_desc" && styles.funnelSelected]}
            >
              <FrostedSurface variant="bar" borderRadius={buttonCornerRadius} />
              <View accessible={false} style={styles.funnel}>
                <View
                  style={[
                    styles.funnelTop,
                    { borderTopColor: sortKey === "updated_desc" ? "#66717E" : adminStyleColors.blue },
                  ]}
                />
                <View
                  style={[
                    styles.funnelStem,
                    { backgroundColor: sortKey === "updated_desc" ? "#66717E" : adminStyleColors.blue },
                  ]}
                />
              </View>
              {sortKey !== "updated_desc" ? <View style={styles.filterDot} /> : null}
            </Pressable>
          }
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
          {APPLICATION_STATUS_FILTERS.map((st) => {
            const selected = statusFilter === st;
            const app = statusAppearance(st);
            return (
              <Pressable
                key={st}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  onStatusFilterChange(st);
                  setPage(1);
                }}
                style={[
                  styles.pill,
                  selected && {
                    backgroundColor: st === "All" ? adminStyleColors.navy : app.tint,
                    borderColor: st === "All" ? adminStyleColors.navy : app.tint,
                  },
                ]}
              >
                {st !== "All" ? <View style={[styles.dot, { backgroundColor: app.color }]} /> : null}
                <Text
                  style={{
                    fontSize: fs("subbody"),
                    fontWeight: selected ? "700" : "500",
                    color: selected ? (st === "All" ? "white" : app.color) : "#66717E",
                  }}
                >
                  {st}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.countRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: fs("subbody"), color: "#66717E" }}>
              <Text style={{ color: adminStyleColors.navy, fontWeight: "700" }}>{filtered.length}</Text>{" "}
              {filtered.length === 1 ? "application" : "applications"} · {currentSortLabel}
            </Text>
            {hasFilters ? (
              <Pressable
                onPress={() => {
                  setQuery("");
                  onStatusFilterChange("All");
                  setSortKey("updated_desc");
                  setPage(1);
                }}
              >
                <Text style={{ fontSize: fs("caption"), fontWeight: "600", color: adminStyleColors.blueSoft }}>
                  Clear filters
                </Text>
              </Pressable>
            ) : null}
          </View>
          <ActionButton label="New draft" compact onPress={onStartNew} />
        </View>

        <GlassCard style={{ paddingVertical: 0, paddingHorizontal: 16 }}>
          {visibleItems.length ? (
            visibleItems.map((app, idx) => {
              const tone = statusAppearance(app.status);
              const actionText = applicationRequiredAction(app);
              const allowWithdraw = canWithdrawApplication(app);

              return (
                <Pressable
                  key={app.id}
                  onPress={() =>
                    app.status === "Draft"
                      ? onContinueDraft(app)
                      : onViewDetail(app.id, app.status === "Changes requested" ? "changes" : "summary")
                  }
                  style={({ pressed }) => [
                    styles.item,
                    idx === visibleItems.length - 1 && { borderBottomWidth: 0 },
                    pressed && { backgroundColor: "rgba(247,242,235,0.65)" },
                  ]}
                >
                  <View style={[styles.itemIcon, { backgroundColor: tone.tint }]}>
                    <InnovatorIcon name="applications" color={tone.color} />
                  </View>

                  <View style={styles.itemBody}>
                    <View style={styles.referenceRow}>
                      <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle, fontWeight: "600" }}>
                        {app.reference} · {app.applicantType}
                      </Text>
                      <Text style={{ fontSize: fs("caption"), color: adminStyleColors.subtle }}>
                        {app.updatedAt}
                      </Text>
                    </View>

                    <Text style={{ fontSize: fs("body"), fontWeight: "600", color: adminStyleColors.navy, lineHeight: 22 }}>
                      {app.title || "Untitled draft innovation"}
                    </Text>

                    <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle }}>
                      Next: {actionText}
                      {app.submittedDate ? ` · Submitted ${app.submittedDate}` : ` · Created ${app.createdAt}`}
                    </Text>

                    <View style={styles.tags}>
                      <View style={styles.sectorTag}>
                        <Text style={{ fontSize: fs("caption"), fontWeight: "600", color: "#66717E" }}>
                          {app.sector}
                        </Text>
                      </View>
                      <StatusPill status={app.status} />
                      {app.status === "Draft" ? (
                        <Pressable
                          onPress={() => onViewDetail(app.id, "summary")}
                          style={styles.inlineChipAction}
                        >
                          <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.blue }}>
                            Summary
                          </Text>
                        </Pressable>
                      ) : null}
                      {allowWithdraw ? (
                        <Pressable
                          onPress={() => {
                            setWithdrawTarget(app);
                            setWithdrawReason("");
                            setWithdrawError(null);
                          }}
                          style={styles.inlineChipAction}
                        >
                          <Text style={{ fontSize: fs("caption"), fontWeight: "700", color: adminStyleColors.rust }}>
                            Withdraw
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>

                  <Text style={styles.chevron} accessible={false}>
                    {"\u203a"}
                  </Text>
                </Pressable>
              );
            })
          ) : (
            <View style={styles.emptyBox}>
              <Text style={{ fontSize: fs("body"), fontWeight: "600", color: adminStyleColors.navy }}>
                No matching applications
              </Text>
              <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, textAlign: "center" }}>
                Try another status filter, clear your search, or start a new innovation draft.
              </Text>
              <ActionButton label="Submit new innovation" compact onPress={onStartNew} />
            </View>
          )}
        </GlassCard>

        {filtered.length > PAGE_SIZE ? (
          <View style={styles.pagination}>
            <Pressable
              disabled={safePage <= 1}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
              style={[styles.pageBtn, safePage <= 1 && { opacity: 0.35 }]}
            >
              <Text style={{ fontSize: fs("subbody"), fontWeight: "600", color: "#66717E" }}>
                Previous
              </Text>
            </Pressable>
            <Text style={{ fontSize: fs("caption"), color: "#929AA4" }}>
              Page {safePage} of {totalPages}
            </Text>
            <Pressable
              disabled={safePage >= totalPages}
              onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={[styles.pageBtn, safePage >= totalPages && { opacity: 0.35 }]}
            >
              <Text style={{ fontSize: fs("subbody"), fontWeight: "600", color: "#66717E" }}>
                Next
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <FlushSheetModal
        visible={sortSheetOpen}
        eyebrow="APPLICATIONS DIRECTORY"
        title="Sort applications"
        onClose={() => setSortSheetOpen(false)}
      >
        <View>
          {APPLICATION_SORT_OPTIONS.map((opt, idx) => {
            const active = sortKey === opt.key;
            return (
              <Pressable
                key={opt.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                onPress={() => {
                  setSortKey(opt.key);
                  setPage(1);
                  setSortSheetOpen(false);
                }}
                style={[styles.sortOption, idx === 0 && { borderTopWidth: 0 }]}
              >
                <Text style={{ fontSize: fs("body"), fontWeight: "600", color: adminStyleColors.navy, flex: 1 }}>
                  {opt.label}
                </Text>
                <View style={[styles.radio, active && { borderColor: adminStyleColors.blue }]}>
                  {active ? <View style={styles.radioCenter} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </FlushSheetModal>

      <FlushSheetModal
        visible={Boolean(withdrawTarget)}
        eyebrow="WITHDRAW APPLICATION"
        title={withdrawTarget ? `Withdraw ${withdrawTarget.reference}?` : "Withdraw application"}
        onClose={() => setWithdrawTarget(null)}
      >
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: fs("subbody"), color: adminStyleColors.subtle, lineHeight: 20 }}>
            Withdrawing stops intake review for {withdrawTarget?.title || withdrawTarget?.reference}. This event stays recorded cleanly in your application history.
          </Text>
          <FormField label="Reason for withdrawing (5-500 characters)">
            <FrostedInput
              multiline
              maxLength={500}
              value={withdrawReason}
              onChangeText={setWithdrawReason}
              placeholder="Explain briefly why you are withdrawing..."
            />
          </FormField>
          {withdrawError ? (
            <Text style={{ fontSize: fs("subbody"), color: "#9A3026", fontWeight: "600" }}>
              {withdrawError}
            </Text>
          ) : null}
          <ActionButton
            label="Confirm withdrawal"
            variant="danger"
            loading={withdrawBusy}
            onPress={() => void handleConfirmWithdraw()}
          />
        </View>
      </FlushSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 18,
    gap: 14,
    paddingBottom: 112,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  funnelButton: {
    width: 46,
    height: 46,
    borderRadius: buttonCornerRadius,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  funnelSelected: { borderColor: "#D9E5F7" },
  funnel: { alignItems: "center" },
  funnelTop: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  funnelStem: { width: 3, height: 7, marginTop: -1, borderBottomRightRadius: 1 },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: adminStyleColors.blue,
    position: "absolute",
    right: 8,
    top: 8,
  },
  pills: { gap: 7, paddingVertical: 2 },
  pill: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "rgba(255,250,244,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: adminStyleColors.line,
  },
  itemIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 2,
  },
  itemBody: { flex: 1, gap: 5 },
  referenceRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  sectorTag: {
    backgroundColor: "#F3EFEA",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },
  inlineChipAction: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: "rgba(255,255,255,0.75)",
  },
  chevron: { fontSize: 22, color: "#A1A8B1" },
  emptyBox: { paddingVertical: 28, alignItems: "center", gap: 10 },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pageBtn: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center" },
  sortOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    minHeight: 58,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: adminStyleColors.line,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "#D8DDE3",
    alignItems: "center",
    justifyContent: "center",
  },
  radioCenter: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: adminStyleColors.blue,
  },
});
