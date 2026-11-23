import { buttonCornerRadius, fontSizes } from "./theme";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FrostedModalBackdrop, FrostedSurface } from "./FrostedGlass";
import { MobileIcon } from "./AdminOverview";
import { createAdminUser, validAdminPassword, portalUrl, readAdminRecords, updateAdminUserAccess, verifyAdminAuthenticator, type Account, type AdminAccess, type AdminSector, type AdminUser } from "./auth";

const roleOptions = [{ value: "innovator", label: "Innovator" }, { value: "assessor", label: "Assessor" }, { value: "support", label: "Support Officer" }, { value: "committee", label: "Committee Observer" }, { value: "admin", label: "Administrator" }] as const;

export function AdminUserEditor({ account, user, onClose, onVerified, onSaved }: {
  account: Account; user: AdminUser | null; onClose: () => void; onVerified: (account: Account) => void; onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<AdminAccess["new_role"]>(roleOptions.find(item => item.value === user?.account_role)?.value ?? "innovator");
  const [lead, setLead] = useState(user?.lead_assessor ?? false);
  const [selected, setSelected] = useState<string[]>(user?.sector_ids ?? []);
  const [sectors, setSectors] = useState<AdminSector[]>([]);
  const [sectorError, setSectorError] = useState("");
  const [sectorLoading, setSectorLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const insets = useSafeAreaInsets();
  const scopeKnown = !user || Array.isArray(user.sector_ids);
  const [mutationUncertain, setMutationUncertain] = useState(false);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setSectorLoading(true); setSectorError("");
    void readAdminRecords(account, "sectors").then(rows => { if (active) setSectors(rows); })
      .catch(() => { if (active) setSectorError("Sector choices could not load. Retry before saving."); })
      .finally(() => { if (active) setSectorLoading(false); });
    return () => { active = false; };
  }, [account, attempt]);

  useEffect(() => {
    const listener = AppState.addEventListener("change", state => {
      if (state !== "active") { setPassword(""); setConfirmation(""); setShowPassword(false); }
    });
    return () => listener.remove();
  }, []);

  function close() { if (!inFlight.current) onClose(); }
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage("");
    try { await action(); }
    catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : "The request could not be completed. Try again."); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function verify() {
    await run(async () => {
      const next = await verifyAdminAuthenticator(account, code.trim());
      if (!mounted.current) return;
      setCode(""); setVerified(true); onVerified(next); setMessage("Authenticator verified. You can now submit this change.");
    });
  }
  async function save() {
    const temporaryCode = code.trim();
    const authReady = user ? verified : /^\d{6}$/.test(temporaryCode);
    if (!authReady || sectorLoading || sectorError || !scopeKnown || mutationUncertain) return;
    if (reason.trim().length < 5) { setMessage("Enter an audit reason of at least five characters."); return; }
    if (!user && (!name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) { setMessage("Enter a full name and valid email address."); return; }
    if (!user && !validAdminPassword(password)) { setMessage("Use 12-72 UTF-8 bytes with uppercase, lowercase, a number and a symbol for the password."); return; }
    if (!user && password !== confirmation) { setMessage("The passwords do not match."); return; }
    const creationPassword = password;
    setPassword(""); setConfirmation(""); setShowPassword(false);
    if (!user) setCode("");
    await run(async () => {
      const access: AdminAccess = { new_role: role, lead: role === "assessor" && lead, sectors: ["assessor", "committee"].includes(role) ? selected : [], reason: reason.trim() };
      try {
        if (user) await updateAdminUserAccess(account, user.id, access);
        else await createAdminUser(account, { ...access, display_name: name, address: email, password: creationPassword, admin_code: temporaryCode });
      } catch (error) {
        if (mounted.current && error instanceof Error && /could not be confirmed|before retrying/.test(error.message)) setMutationUncertain(true);
        throw error;
      }
      if (mounted.current) onSaved(user ? "User access updated and audited." : "User created. They can sign in with their email address and the password you set.");
    });
  }
  async function openSecurity() {
    try { await Linking.openURL(portalUrl + "/admin/#security"); }
    catch { if (mounted.current) setMessage("The browser could not open. Try again."); }
  }
  function input(label: string, value: string, onChange: (value: string) => void, options?: { email?: boolean; multiline?: boolean; readOnly?: boolean; max?: number }) {
    return <View style={s.field}><Text style={s.label}>{label}{options?.readOnly ? " · read-only" : ""}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={!busy && !options?.readOnly} keyboardType={options?.email ? "email-address" : "default"} autoCapitalize={options?.email ? "none" : "sentences"} autoCorrect={!options?.email} multiline={options?.multiline} maxLength={options?.max ?? 120} style={[s.input, options?.multiline && s.multiline, options?.readOnly && s.readOnly]} /></View>;
  }
  const authReady = user ? verified : /^\d{6}$/.test(code.trim());
  const blocked = busy || !authReady || sectorLoading || !!sectorError || !scopeKnown || mutationUncertain;
  return <Modal visible transparent statusBarTranslucent animationType="slide" onRequestClose={close}>
    <FrostedModalBackdrop>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close user editor" disabled={busy} onPress={close} style={StyleSheet.absoluteFill} />
        <View accessibilityViewIsModal style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 22) }]}>
          <FrostedSurface variant="sheet" />
          <View style={s.handle} />
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>USER MANAGEMENT</Text>
              <Text accessibilityRole="header" style={s.title}>{user ? "Edit user" : "Create user"}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close user editor" accessibilityState={{ disabled: busy }} disabled={busy} onPress={close} style={s.closeCircle}><MobileIcon name="close" color="#52606E" /></Pressable>
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            <View style={s.formCard}>
              <Text style={s.cardHeading}>Account details</Text>
              <Text style={s.note}>{user ? "Update this account's role and sector access. Every change requires an audit reason." : "Create an account with an initial password. The new user can sign in with their email address and the password you set."}</Text>
              {input("Full name", name, setName, { readOnly: !!user })}
              {input("Email address", email, setEmail, { readOnly: !!user, email: true, max: 254 })}
              {!user && <>
                <View style={s.field}><Text style={s.label}>Password</Text><View style={s.passwordRow}><TextInput accessibilityLabel="New user password" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="off" editable={!busy} maxLength={72} style={[s.input, { flex: 1 }]} /><Pressable accessibilityRole="button" accessibilityLabel={showPassword ? "Hide password" : "Show password"} disabled={busy} onPress={() => setShowPassword(previous => !previous)} style={s.close}><Text style={s.link}>{showPassword ? "Hide" : "Show"}</Text></Pressable></View><Text style={s.note}>12-72 UTF-8 bytes, including uppercase, lowercase, a number and a symbol.</Text></View>
                <View style={s.field}><Text style={s.label}>Confirm password</Text><TextInput accessibilityLabel="Confirm new user password" value={confirmation} onChangeText={setConfirmation} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="off" editable={!busy} maxLength={72} style={s.input} /></View>
              </>}
              {user && <Text style={s.note}>Status: {user.account_status}. Name, email and status changes are not supported by the current account service.</Text>}
            </View>

            <View style={s.formCard}>
              <Text style={s.cardHeading}>Role & sector scope</Text>
              <View style={s.field}><Text style={s.label}>Account role</Text><View style={s.roles}>{roleOptions.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: role === option.value, disabled: busy }} disabled={busy} onPress={() => { setRole(option.value); if (option.value !== "assessor") setLead(false); }} style={[s.role, role === option.value && s.roleSelected]}><Text style={[s.roleText, role === option.value && { color: "white" }]}>{option.label}</Text></Pressable>)}</View></View>
              {role === "assessor" && <View style={s.toggle}><View style={{ flex: 1, gap: 4 }}><Text style={s.label}>Lead Assessor</Text><Text style={s.note}>Grant lead assessment powers.</Text></View><Switch accessibilityLabel="Lead Assessor powers" value={lead} onValueChange={setLead} disabled={busy} trackColor={{ true: "#278477", false: "#DDE2E7" }} /></View>}
              <View style={s.field}><Text style={s.label}>Sectors · optional</Text><Text style={s.note}>{role === "committee" ? "Scope committee visibility to specific sectors or leave all unticked for full oversight." : role === "assessor" ? "Keep existing selections or choose the account's sector scope." : "Sector scoping applies only to Assessors and Committee Observers."}</Text>
                {sectorLoading ? <ActivityIndicator color="#9A3D2B" /> : sectorError ? <><Text accessibilityRole="alert" style={s.error}>{sectorError}</Text><Pressable accessibilityRole="button" style={s.secondary} disabled={busy} onPress={() => setAttempt(value => value + 1)}><Text style={s.link}>Retry sectors</Text></Pressable></> : sectors.length ? sectors.map((sector, index) => {
                  const checked = selected.includes(sector.id); const disabled = busy || (sector.status === "archived" && !checked);
                  return <Pressable key={sector.id} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} disabled={disabled} onPress={() => setSelected(previous => checked ? previous.filter(id => id !== sector.id) : [...previous, sector.id])} style={[s.sector, index === sectors.length - 1 && { borderBottomWidth: 0 }, disabled && { opacity: 0.5 }]}><Text style={s.sectorName}>{sector.name}{sector.status === "archived" ? " · archived" : ""}</Text><View style={[s.checkbox, checked && { backgroundColor: "#278477", borderColor: "#278477" }]}>{checked && <Text style={{ color: "white", fontSize: fontSizes.caption }}>{"\u2713"}</Text>}</View></Pressable>;
                }) : <Text style={s.note}>No sectors available. The account can have no sector scope.</Text>}
                {!scopeKnown && <Text accessibilityRole="alert" style={s.error}>Existing sector access is unavailable. Close and reload the directory before editing.</Text>}
                {selected.some(id => !sectors.some(sector => sector.id === id && sector.status !== "archived")) && !sectorLoading && !sectorError && <Text style={s.note}>An existing selection is archived or unavailable. The server may reject it; remove archived selections before saving.</Text>}
              </View>
            </View>

            <View style={s.formCard}>
              <Text style={s.cardHeading}>Audit & verification</Text>
              {input("Reason for this change", reason, setReason, { multiline: true, max: 500 })}
              <View style={s.verification}>
                <Text style={s.label}>{user ? "Authenticator verification" : "Temporary administrator code"}</Text>
                <Text style={s.note}>{user
                  ? (verified ? "Verified for this session. The server checks authorization again when you submit." : "Enter a current code from your enrolled authenticator before submitting.")
                  : "Temporary hackathon verification. Enter the 6-digit administrator code before creating the account."}</Text>
                {user ? (!verified && <><TextInput accessibilityLabel="Six-digit authenticator code" value={code} onChangeText={value => setCode(value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} editable={!busy} style={s.input} /><Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || code.length !== 6 }} disabled={busy || code.length !== 6} onPress={() => void verify()} style={[s.secondary, (busy || code.length !== 6) && { opacity: 0.5 }]}><Text style={s.link}>Verify code</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={() => void openSecurity()} style={s.close}><Text style={s.link}>Set up authenticator on web</Text></Pressable></>)
                  : <TextInput accessibilityLabel="Temporary administrator code" value={code} onChangeText={value => setCode(value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry maxLength={6} editable={!busy} placeholder="6-digit code" style={s.input} />}
              </View>
              {!!message && <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>}
              {mutationUncertain && <Text style={s.note}>Submission is paused to prevent duplicates. Close this form and review the directory or provider status before another attempt.</Text>}
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: blocked, busy }} disabled={blocked} onPress={() => void save()} style={[s.primary, blocked && { opacity: 0.45 }]}>{busy ? <ActivityIndicator color="white" /> : <Text style={s.primaryText}>{user ? "Save changes" : "Create user"}</Text>}</Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </FrostedModalBackdrop>
  </Modal>;
}
const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 32, borderTopRightRadius: 32, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.96)", paddingHorizontal: 18, paddingTop: 10, maxHeight: "92%", gap: 12, overflow: "hidden" },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(101,86,77,0.28)", alignSelf: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 2 },
  eyebrow: { fontSize: fontSizes.caption, fontWeight: "700", letterSpacing: 1.1, color: "#4A5564", marginBottom: 2 },
  title: { color: "#192C40", fontSize: fontSizes.heading, fontWeight: "700" },
  closeCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#F5F1EC", borderWidth: 1, borderColor: "#E5DDD3", alignItems: "center", justifyContent: "center" },
  close: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  link: { color: "#417AC5", fontSize: fontSizes.subbody, fontWeight: "600" },
  content: { gap: 14, paddingBottom: 8, maxWidth: 720, alignSelf: "center", width: "100%" },
  formCard: { backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1, borderColor: "#E5DDD3", padding: 16, gap: 14 },
  cardHeading: { color: "#192C40", fontSize: fontSizes.heading, fontWeight: "700" },
  passwordRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  note: { color: "#4A5564", fontSize: fontSizes.subbody, lineHeight: 19 }, field: { gap: 8 }, label: { color: "#192C40", fontSize: fontSizes.subbody, fontWeight: "700" }, input: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#CAB9A9", borderRadius: 14, minHeight: 48, padding: 13, color: "#192C40", fontSize: fontSizes.body }, multiline: { minHeight: 96, textAlignVertical: "top" }, readOnly: { backgroundColor: "#F3EFEA", color: "#4A5564" }, roles: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, role: { minHeight: 42, justifyContent: "center", backgroundColor: "#F3EFEA", paddingHorizontal: 14, borderRadius: 21 }, roleSelected: { backgroundColor: "#192C40" }, roleText: { fontSize: fontSizes.subbody, fontWeight: "600", color: "#4A5564" }, toggle: { flexDirection: "row", alignItems: "center", gap: 15 }, sector: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, borderBottomWidth: 1, borderBottomColor: "rgba(218,208,198,0.45)" }, sectorName: { flex: 1, fontSize: fontSizes.body, color: "#192C40" }, checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1, borderColor: "#CFD6DE", alignItems: "center", justifyContent: "center" }, verification: { padding: 14, backgroundColor: "#F9F6F1", borderRadius: 16, borderWidth: 1, borderColor: "#E5DDD3", gap: 10 }, secondary: { minHeight: 44, justifyContent: "center", alignItems: "center", backgroundColor: "#EAF1FC", borderRadius: buttonCornerRadius, padding: 12 }, primary: { minHeight: 50, justifyContent: "center", alignItems: "center", backgroundColor: "#9A3D2B", borderRadius: buttonCornerRadius, padding: 14 }, primaryText: { color: "white", fontWeight: "700", fontSize: fontSizes.body }, error: { color: "#9A3026", fontSize: fontSizes.subbody, lineHeight: 19 }, message: { color: "#192C40", fontSize: fontSizes.subbody, lineHeight: 20 },
});
