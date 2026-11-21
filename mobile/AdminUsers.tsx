import { buttonCornerRadius, fontSizes } from "./theme";
import { useState } from "react";
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FrostedModalBackdrop, FrostedSurface } from "./FrostedGlass";
import { MobileIcon } from "./AdminOverview";
import type { AdminUser } from "./auth";

const roles = [
  { value: "All", label: "All", singular: "accounts", color: "#66717E", tint: "#F1F3F6" },
  { value: "innovator", label: "Innovators", singular: "innovators", color: "#28599B", tint: "#EAF1FC" },
  { value: "assessor", label: "Assessors", singular: "assessors", color: "#695198", tint: "#F0ECFB" },
  { value: "support", label: "Support", singular: "support officers", color: "#236D61", tint: "#E4F4F0" },
  { value: "admin", label: "Admins", singular: "administrators", color: "#903925", tint: "#FBEDE8" },
];
const statuses = [
  { value: "All", label: "All statuses", detail: "Show every account status", color: "#7C8590" },
  { value: "active", label: "Active", detail: "Accounts with active access", color: "#278477" },
  { value: "suspended", label: "Suspended", detail: "Accounts with suspended access", color: "#B1873E" },
  { value: "closed", label: "Closed", detail: "Closed accounts", color: "#9A3D2B" },
];
type Props = {
  users: AdminUser[]; query: string; onQueryChange: (query: string) => void;
  role: string; onRoleChange: (role: string) => void; status: string; onStatusChange: (status: string) => void;
  loading: boolean; error: boolean; page: number; onPageChange: (page: number) => void;
  onOpenUser: (user: AdminUser) => void; onCreate: () => void; notice?: string;
};

export function AdminUsers({ users, query, onQueryChange, role, onRoleChange, status, onStatusChange, loading, error, page, onPageChange, onOpenUser, onCreate, notice }: Props) {
  const [filterOpen, setFilterOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const filtered = users.filter(user => (role === "All" || user.account_role === role) && (status === "All" || user.account_status === status));
  const noun = roles.find(item => item.value === role)?.singular ?? "accounts";
  const context = (status === "All" ? "" : status + " ") + (filtered.length === 1 ? noun.replace(/s$/, "") : noun);
  return <>
    <View style={s.toolbar}>
      <View style={s.search}><FrostedSurface variant="bar" borderRadius={24} /><MobileIcon name="search" color="#8B929C" /><TextInput accessibilityLabel="Search accounts by name or email" placeholder="Search name or email" placeholderTextColor="#8B929C" value={query} onChangeText={onQueryChange} maxLength={100} autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={s.input} />{!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear account search" onPress={() => onQueryChange("")} style={s.clear}><Text style={s.clearText}>{"\u00d7"}</Text></Pressable>}</View>
      <Pressable accessibilityRole="button" accessibilityLabel={"Filter by status. " + (status === "All" ? "All statuses" : status) + " selected"} accessibilityState={{ expanded: filterOpen }} onPress={() => { Keyboard.dismiss(); setFilterOpen(true); }} style={[s.funnelButton, status !== "All" && s.funnelSelected]}><FrostedSurface variant="bar" borderRadius={buttonCornerRadius} /><View accessible={false} style={s.funnel}><View style={[s.funnelTop, { borderTopColor: status === "All" ? "#66717E" : "#28599B" }]} /><View style={[s.funnelStem, { backgroundColor: status === "All" ? "#66717E" : "#28599B" }]} /></View>{status !== "All" && <View style={s.filterDot} />}</Pressable>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.roles}>{roles.map(item => <Pressable key={item.value} accessibilityRole="button" accessibilityLabel={item.value === "All" ? "All account roles" : item.singular} accessibilityState={{ selected: role === item.value }} onPress={() => onRoleChange(item.value)} style={[s.role, role === item.value && { backgroundColor: item.value === "All" ? "#192C40" : item.tint }]}>{item.value !== "All" && <View style={[s.roleDot, { backgroundColor: item.color }]} />}<Text style={[s.roleLabel, role === item.value && { color: item.value === "All" ? "white" : item.color, fontWeight: "700" }]}>{item.label}</Text></Pressable>)}</ScrollView>
    <View style={s.countRow}><View style={s.countCopy} accessibilityLiveRegion="polite"><Text style={s.count}>{loading ? "Searching..." : error ? "Unable to load accounts" : <><Text style={s.countNumber}>{filtered.length}</Text>{" " + context}</>}</Text>{!loading && !error && <Text style={s.pageScope}>on this page</Text>}</View><Pressable accessibilityRole="button" accessibilityLabel="Create a new user" onPress={onCreate} style={s.create}><Text style={s.createText}>Create user</Text></Pressable></View>
    {!!notice && <Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
    {!loading && !error && <>
      <View style={s.directory}><FrostedSurface variant="card" borderRadius={20} />{filtered.length ? filtered.map((user, index) => {
        const appearance = roles.find(item => item.value === user.account_role) ?? roles[0];
        const statusColor = statuses.find(item => item.value === user.account_status)?.color ?? "#7C8590";
        return <Pressable key={user.id} accessibilityRole="button" accessibilityLabel={"Edit " + (user.full_name || "account") + ", " + user.account_role + ", " + user.account_status} onPress={() => onOpenUser(user)} style={({ pressed }) => [s.user, index === filtered.length - 1 && { borderBottomWidth: 0 }, pressed && { backgroundColor: "rgba(247,242,235,0.65)" }]}>
          <View accessible={false} style={[s.avatar, { backgroundColor: appearance.tint }]}><Text style={[s.initials, { color: appearance.color }]}>{(user.full_name || "Account").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()}</Text></View>
          <View style={s.userBody}><Text style={s.name}>{user.full_name || "Account"}</Text><Text style={s.email}>{user.email}</Text><View style={s.tags}><View style={[s.roleTag, { backgroundColor: appearance.tint }]}><Text style={[s.roleTagText, { color: appearance.color }]}>{({ admin: "Administrator", innovator: "Innovator", assessor: "Assessor", support: "Support Officer" } as Record<string, string>)[user.account_role] ?? "Unknown role"}</Text></View>{user.lead_assessor && <View style={[s.roleTag, { backgroundColor: "#FFF3D8" }]}><Text style={[s.roleTagText, { color: "#795B17" }]}>Lead</Text></View>}<View style={s.status}><View style={[s.roleDot, { backgroundColor: statusColor }]} /><Text style={[s.statusText, { color: statusColor }]}>{user.account_status.charAt(0).toUpperCase() + user.account_status.slice(1)}</Text></View></View></View><Text accessible={false} style={s.chevron}>{"\u203a"}</Text>
        </Pressable>;
      }) : <View style={s.empty}><Text style={s.emptyTitle}>No matching accounts</Text><Text style={s.emptyCopy}>Try another role, status or search.</Text>{(role !== "All" || status !== "All" || !!query) && <Pressable accessibilityRole="button" style={s.manage} onPress={() => { onQueryChange(""); onRoleChange("All"); onStatusChange("All"); }}><Text style={s.manageText}>Clear filters</Text></Pressable>}</View>}</View>
      <View style={s.pagination}><Pressable accessibilityRole="button" accessibilityState={{ disabled: page === 0 }} disabled={page === 0} onPress={() => onPageChange(page - 1)} style={[s.pageButton, page === 0 && { opacity: 0.35 }]}><Text style={s.pageButtonText}>Previous</Text></Pressable><Text style={s.pageScope}>Page {page + 1}</Text><Pressable accessibilityRole="button" accessibilityState={{ disabled: users.length < 25 }} disabled={users.length < 25} onPress={() => onPageChange(page + 1)} style={[s.pageButton, users.length < 25 && { opacity: 0.35 }]}><Text style={s.pageButtonText}>Next</Text></Pressable></View>
    </>}
    <Modal visible={filterOpen} transparent statusBarTranslucent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
      <FrostedModalBackdrop>
        <View style={s.overlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close status filters" onPress={() => setFilterOpen(false)} style={StyleSheet.absoluteFill} />
          <View accessibilityViewIsModal style={[s.filterSheet, { paddingBottom: Math.max(insets.bottom, 22) }]}>
            <FrostedSurface variant="sheet" />
            <View style={s.handle} />
            <View style={s.sheetHeader}><View><Text style={s.sheetEyebrow}>USERS DIRECTORY</Text><Text accessibilityRole="header" style={s.sheetTitle}>Account status</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close status filters" onPress={() => setFilterOpen(false)} style={s.closeCircle}><MobileIcon name="close" color="#52606E" /></Pressable></View>
            <View style={s.modalCard}>
              {statuses.map((item, index) => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: status === item.value }} onPress={() => { onStatusChange(item.value); setFilterOpen(false); }} style={[s.statusOption, index === 0 && { borderTopWidth: 0 }]}><View style={[s.roleDot, { backgroundColor: item.color }]} /><View style={{ flex: 1, gap: 4 }}><Text style={s.optionTitle}>{item.label}</Text><Text style={s.emptyCopy}>{item.detail}</Text></View><View style={[s.radio, status === item.value && { borderColor: "#28599B" }]}>{status === item.value && <View style={s.radioCenter} />}</View></Pressable>)}
            </View>
          </View>
        </View>
      </FrostedModalBackdrop>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  create: { minHeight: 44, justifyContent: "center", alignItems: "center", paddingHorizontal: 15, borderRadius: buttonCornerRadius, backgroundColor: "#9A3D2B" }, createText: { color: "white", fontSize: fontSizes.subbody, fontWeight: "600" }, notice: { color: "#236D61", fontSize: fontSizes.subbody, lineHeight: 19 },
  toolbar: { flexDirection: "row", gap: 10, alignItems: "center" }, search: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9, paddingLeft: 13, borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", overflow: "hidden" }, input: { flex: 1, minWidth: 0, color: "#192C40", minHeight: 46, paddingVertical: 11, fontSize: fontSizes.body, paddingRight: 8 }, clear: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, clearText: { color: "#7C8590", fontSize: 22 },
  funnelButton: { width: 46, height: 46, borderRadius: buttonCornerRadius, borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", justifyContent: "center", alignItems: "center", overflow: "hidden" }, funnelSelected: { borderColor: "#D9E5F7" }, funnel: { alignItems: "center" }, funnelTop: { width: 0, height: 0, borderLeftWidth: 9, borderRightWidth: 9, borderTopWidth: 10, borderLeftColor: "transparent", borderRightColor: "transparent" }, funnelStem: { width: 3, height: 7, marginTop: -1, borderBottomRightRadius: 1 }, filterDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#28599B", position: "absolute", right: 8, top: 8 },
  roles: { gap: 7, paddingVertical: 2 }, role: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "rgba(255,250,244,0.88)", borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", flexDirection: "row", alignItems: "center", gap: 6 }, roleLabel: { color: "#66717E", fontSize: fontSizes.subbody, fontWeight: "500" }, roleDot: { width: 6, height: 6, borderRadius: 3 }, countRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }, countCopy: { flex: 1, gap: 2 }, count: { color: "#66717E", fontSize: fontSizes.subbody }, countNumber: { color: "#192C40", fontWeight: "700" }, pageScope: { color: "#929AA4", fontSize: fontSizes.caption }, manage: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 }, manageText: { color: "#417AC5", fontSize: fontSizes.subbody, fontWeight: "600" },
  directory: { borderRadius: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.9)", paddingHorizontal: 16, overflow: "hidden" }, user: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "rgba(218,208,198,0.45)" }, avatar: { width: 42, height: 42, borderRadius: 14, justifyContent: "center", alignItems: "center", alignSelf: "flex-start", marginTop: 2 }, initials: { fontSize: fontSizes.subbody, fontWeight: "700" }, userBody: { flex: 1, gap: 4 }, name: { fontSize: fontSizes.body, fontWeight: "600", color: "#192C40" }, email: { fontSize: fontSizes.subbody, lineHeight: 19, color: "#7C8590" }, tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 3 }, roleTag: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 }, roleTagText: { fontSize: fontSizes.caption, fontWeight: "600" }, status: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4 }, statusText: { fontSize: fontSizes.caption, fontWeight: "600" }, chevron: { fontSize: 22, color: "#A1A8B1" },
  empty: { paddingVertical: 30, alignItems: "center", gap: 8 }, emptyTitle: { color: "#192C40", fontWeight: "600", fontSize: fontSizes.body }, emptyCopy: { color: "#7C8590", fontSize: fontSizes.subbody, lineHeight: 19 }, pagination: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }, pageButton: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center" }, pageButtonText: { color: "#66717E", fontSize: fontSizes.subbody, fontWeight: "600" },
  overlay: { flex: 1, justifyContent: "flex-end" }, filterSheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.92)", paddingHorizontal: 20, paddingTop: 10, gap: 14, overflow: "hidden" }, handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(101,86,77,0.28)", alignSelf: "center" }, sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, sheetEyebrow: { fontSize: fontSizes.caption, fontWeight: "700", letterSpacing: 1.1, color: "#7C8590", marginBottom: 2 }, sheetTitle: { fontSize: fontSizes.heading, fontWeight: "700", color: "#192C40" }, closeCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.82)", borderWidth: 1, borderColor: "#E5DDD3", alignItems: "center", justifyContent: "center" }, modalCard: { backgroundColor: "rgba(255,255,255,0.82)", borderRadius: 20, borderWidth: 1, borderColor: "#E5DDD3", paddingHorizontal: 16, overflow: "hidden" }, statusOption: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 68, paddingVertical: 13, borderTopWidth: 1, borderTopColor: "rgba(218,208,198,0.45)" }, optionTitle: { color: "#192C40", fontSize: fontSizes.body, fontWeight: "600" }, radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: "#D8DDE3", alignItems: "center", justifyContent: "center" }, radioCenter: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#28599B" },
});
