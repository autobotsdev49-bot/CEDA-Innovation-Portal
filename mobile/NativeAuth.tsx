import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { BlurTargetView, BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import {
  AccessibilityInfo, AppState, BackHandler, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type LayoutChangeEvent, type TextInputProps,
} from "react-native";
import { authConfigured, checkEmailVerification, registerInnovator, signInInnovator, signOutInnovator, type Account } from "./auth";
import { palette } from "./theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { VerifyEmail } from "./VerifyEmail";
import { VerificationSuccess } from "./VerificationSuccess";

export type AuthMode = "signin" | "signup";
const verificationWindow = 15 * 60_000;

function Field({ label, password, ...input }: TextInputProps & { label: string; password?: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!input.value) setVisible(false);
  }, [input.value]);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputShell}>
        <TextInput
          {...input}
          accessibilityLabel={label}
          placeholderTextColor={palette.muted}
          secureTextEntry={password && !visible}
          disableFullscreenUI
          style={styles.input}
        />
        {password && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={(visible ? "Hide " : "Show ") + label.toLowerCase()}
            onPress={() => setVisible(!visible)}
            style={styles.reveal}
          >
            <Text style={styles.link}>{visible ? "Hide" : "Show"}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function passwordBytes(value: string) {
  let size = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    size += codePoint <= 127 ? 1 : codePoint <= 2047 ? 2 : codePoint <= 65535 ? 3 : 4;
  }
  return size;
}

export function NativeAuth({ mode, retryAt, onRateLimited, onBack, onSwitch }: {
  mode: AuthMode;
  retryAt: number;
  onRateLimited: (deadline: number) => void;
  onBack: () => void;
  onSwitch: (mode: AuthMode) => void;
}) {
  const signup = mode === "signup";
  const target = useRef<ComponentRef<typeof BlurTargetView>>(null);
  const formScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollOffset = useRef(0);
  const viewportHeight = useRef(0);
  const inFlight = useRef(false);
  const verification = useRef<{ password: string; expiresAt: number } | null>(null);
  const { height } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const [backdropReady, setBackdropReady] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(Platform.OS === "ios");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [showVerificationSuccess, setShowVerificationSuccess] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [clock, setClock] = useState(Date.now);
  const secondsLeft = Math.max(0, Math.ceil((retryAt - clock) / 1000));
  const showBlur = backdropReady && !reduceTransparency && (Platform.OS === "ios" || (Platform.OS === "android" && Platform.Version >= 31));
  const photoHeight = Math.max(340, height * (signup ? 0.7 : 0.83));
  const panelTop = Math.max(150, height * (signup ? 0.29 : 0.4));
  const title = account ? (account.role === "admin" ? "Administrator home" : "Home") : signup ? "Create your account" : "Welcome back";
  const description = account ? "Welcome, " + account.name + ". You're signed in to the CEDA Innovation Portal."
    : signup ? "Start your journey as a Botswana innovator." : "Sign in to submit an innovation or follow your application.";

  const revealFocusedField = useCallback(() => {
    const field = TextInput.State.currentlyFocusedInput();
    const scroll = formScroll.current;
    const content = scroll?.getInnerViewRef();
    if (!field || !scroll || !content) return;

    field.measureLayout(content, (_x, top, _width, height) => {
      if (field !== TextInput.State.currentlyFocusedInput() || viewportHeight.current <= 0 || height <= 0) return;
      const clearance = 16;
      const visibleTop = scrollOffset.current;
      const visibleBottom = visibleTop + viewportHeight.current;
      if (top < visibleTop + clearance) {
        scroll.scrollTo({ y: Math.max(0, top - clearance), animated: true });
      } else if (top + height > visibleBottom - clearance) {
        scroll.scrollTo({ y: top + height + clearance - viewportHeight.current, animated: true });
      }
    });
  }, []);

  function updateFormViewport({ nativeEvent }: LayoutChangeEvent) {
    viewportHeight.current = nativeEvent.layout.height;
    revealFocusedField();
  }

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", revealFocusedField);
    const changeFrame = Platform.OS === "ios"
      ? Keyboard.addListener("keyboardDidChangeFrame", revealFocusedField)
      : undefined;
    return () => {
      show.remove();
      changeFrame?.remove();
    };
  }, [revealFocusedField]);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let active = true;
    const listener = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduceTransparency);
    void AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
      if (active) setReduceTransparency(value);
    }).catch(() => {});
    return () => { active = false; listener.remove(); };
  }, []);

  useEffect(() => {
    if (retryAt <= Date.now()) return;
    setClock(Date.now());
    const timer = setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (now >= retryAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  useEffect(() => {
    if (!pendingEmail || !verification.current) return;
    const timer = setTimeout(() => { verification.current = null; }, Math.max(0, verification.current.expiresAt - Date.now()));
    return () => {
      clearTimeout(timer);
      verification.current = null;
    };
  }, [pendingEmail]);

  useEffect(() => {
    function expireSession() {
      setAccount(null);
      if (signup) {
        onSwitch("signin");
        return;
      }
      setError("Your session expired. Sign in again to continue.");
    }
    const timer = account && setTimeout(expireSession, Math.max(0, account.expiresAt - Date.now()));
    const listener = AppState.addEventListener("change", state => {
      if (state === "background") {
        setPassword("");
        setConfirmation("");
      }
      if (state === "active") {
        const now = Date.now();
        setClock(now);
        if (account && now >= account.expiresAt) expireSession();
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      listener.remove();
    };
  }, [account, signup, onSwitch]);

  function leave() {
    if (inFlight.current) return;
    if (account) {
      setAccount(null);
      void signOutInnovator(account.token).catch(() => {});
    }
    onBack();
  }

  const openHome = useCallback(() => setShowVerificationSuccess(false), []);

  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (showVerificationSuccess) openHome();
      else leave();
      return true;
    });
    return () => listener.remove();
  });

  async function submit() {
    if (inFlight.current || retryAt > Date.now()) return;
    setError("");
    const address = email.trim();
    const fullName = name.trim();
    if (!authConfigured) return setError("Sign-in and sign-up are unavailable in this build.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return setError("Enter a valid email address.");
    if (!password) return setError("Enter your password.");
    if (signup) {
      if (!fullName || /[<>\p{Cc}\p{Bidi_Control}]/u.test(name)) return setError("Enter a valid full name.");
      if (password.length < 8 || passwordBytes(password) > 72) return setError("Use at least 8 characters and no more than 72 bytes.");
      if (password !== confirmation) return setError("The passwords do not match.");
    }

    inFlight.current = true;
    setBusy(true);
    setPassword("");
    setConfirmation("");
    try {
      const result = signup ? await registerInnovator(fullName, address, password) : await signInInnovator(address, password);
      if (result.status === "error") {
        setError(result.message);
        if (result.retryAt) {
          setClock(Date.now());
          onRateLimited(result.retryAt);
        }
      }
      if (result.status === "pending") {
        verification.current = { password, expiresAt: Date.now() + verificationWindow };
        setPendingEmail(address);
      }
      if (result.status === "signed-in") setAccount(result.account);

    } catch {
      setError("We couldn't reach the portal. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function completeVerification(): ReturnType<typeof checkEmailVerification> {
    const pending = verification.current;
    if (!pending || pending.expiresAt <= Date.now()) {
      verification.current = null;
      return { status: "error", message: "This verification session expired. Confirm your email using your inbox, then choose Sign in instead." };
    }
    inFlight.current = true;
    try {
      const result = await checkEmailVerification(pendingEmail, pending.password);
      if (result.status === "signed-in") {
        verification.current = null;
        setPendingEmail("");
        setAccount(result.account);
        setShowVerificationSuccess(true);
        AccessibilityInfo.announceForAccessibility("Email verified. Your account has been successfully created.");
      }
      return result;
    } finally {
      inFlight.current = false;
    }
  }

  if (showVerificationSuccess && account) {
    return <VerificationSuccess onContinue={openHome} />;
  }

  if (pendingEmail) {
    return <VerifyEmail email={pendingEmail} checkVerification={completeVerification} onSignIn={() => onSwitch("signin")} />;
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <ScrollView
        ref={formScroll}
        style={styles.screen}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        onLayout={updateFormViewport}
        onScroll={({ nativeEvent }) => { scrollOffset.current = nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      >
          <BlurTargetView
            ref={target}
            onLayout={() => setBackdropReady(true)}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Image
              style={{ width: "100%", height: photoHeight }}
              source={signup ? require("./assets/signup.jpg") : require("./assets/signin.jpg")}
              resizeMode="cover"
              accessible={false}
            />
            <LinearGradient
              colors={["rgba(255,255,255,0.46)", "rgba(255,255,255,0)", "rgba(247,242,235,0.32)", palette.paper]}
              locations={[0, 0.35, 0.65, 1]}
              style={{ position: "absolute", top: 0, width: "100%", height: photoHeight }}
              pointerEvents="none"
            />
          </BlurTargetView>

          <View style={styles.header}>
            <Image source={require("./assets/ceda.png")} resizeMode="contain" style={styles.logo} accessibilityLabel="CEDA" />
          </View>

          <View style={[styles.panel, reduceTransparency && styles.solidPanel, { marginTop: panelTop - 62, paddingBottom: 16 + bottom }]}>
            {showBlur && (
              <BlurView
                blurTarget={target}
                blurMethod="dimezisBlurViewSdk31Plus"
                intensity={46}
                tint="default"
                style={[StyleSheet.absoluteFill, styles.panelCorners]}
                pointerEvents="none"
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            )}
            {!reduceTransparency && (
              <LinearGradient
                colors={["rgba(255,250,244,0.58)", "rgba(255,250,244,0.85)", "#fffaf4"]}
                locations={[0, 0.38, 1]}
                pointerEvents="none"
                accessible={false}
                style={StyleSheet.absoluteFill}
              />
            )}
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
            {account ? (
              <Pressable
                accessibilityRole="button"
                style={styles.primary}
                onPress={leave}
              >
                <Text style={styles.primaryLabel}>Sign out</Text>
              </Pressable>
            ) : (
              <>
                {signup && <Field label="Full name" value={name} onChangeText={setName} onFocus={revealFocusedField} autoComplete="name" maxLength={120} editable={!busy} />}
                <Field label="Email address" value={email} onChangeText={setEmail} onFocus={revealFocusedField} keyboardType="email-address" autoComplete="email" autoCapitalize="none" autoCorrect={false} maxLength={254} editable={!busy} />
                <Field label="Password" value={password} onChangeText={setPassword} onFocus={revealFocusedField} autoComplete={signup ? "new-password" : "current-password"} autoCapitalize="none" autoCorrect={false} password editable={!busy} onSubmitEditing={signup ? undefined : () => void submit()} />
                {signup && <Field label="Confirm password" value={confirmation} onChangeText={setConfirmation} onFocus={revealFocusedField} autoComplete="new-password" autoCapitalize="none" autoCorrect={false} password editable={!busy} onSubmitEditing={() => void submit()} />}
                {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy || secondsLeft > 0, busy }}
                  disabled={busy || secondsLeft > 0}
                  onPress={() => void submit()}
                  style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed, (busy || secondsLeft > 0) && styles.busy]}
                >
                  <Text style={styles.primaryLabel}>{busy ? (signup ? "Creating account…" : "Signing in…") : secondsLeft > 0 ? "Try again in " + secondsLeft + "s" : signup ? "Create account" : "Sign in"}</Text>
                </Pressable>

                <View style={styles.switchRow}>
                  <Text style={styles.description}>{signup ? "Already have an account?" : "New to CEDA Innovation?"}</Text>
                  <Pressable accessibilityRole="button" disabled={busy} onPress={() => onSwitch(signup ? "signin" : "signup")} style={styles.switchButton}>
                    <Text style={styles.link}>{signup ? "Sign in" : "Create an account"}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.paper },
  scroll: { flexGrow: 1 },
  header: { minHeight: 62, paddingHorizontal: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logo: { width: 72, height: 45 },
  panel: { flexGrow: 1, width: "100%", maxWidth: 580, alignSelf: "center", paddingHorizontal: 22, paddingTop: 24, gap: 12, borderTopLeftRadius: 36, borderTopRightRadius: 36, borderTopWidth: 1, borderColor: "rgba(255,255,255,0.85)", overflow: "hidden" },
  panelCorners: { borderTopLeftRadius: 36, borderTopRightRadius: 36 },
  solidPanel: { backgroundColor: "#fffaf4" },
  title: { fontSize: 32, fontWeight: "800", letterSpacing: -0.8, color: palette.ink },
  description: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  field: { gap: 4 },
  label: { color: palette.ink, fontWeight: "700", fontSize: 14 },
  inputShell: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#cab9a9", borderRadius: 17, backgroundColor: "rgba(255,255,255,0.62)" },
  input: { flex: 1, minHeight: 49, paddingHorizontal: 13, paddingVertical: 10, color: palette.ink, fontSize: 16 },
  reveal: { minHeight: 48, minWidth: 50, paddingHorizontal: 12, justifyContent: "center", alignItems: "center" },
  primary: { minHeight: 52, padding: 12, alignItems: "center", justifyContent: "center", borderRadius: 28, backgroundColor: palette.accent },
  primaryPressed: { backgroundColor: palette.accentPressed },
  primaryLabel: { fontSize: 17, fontWeight: "700", color: palette.white, textAlign: "center" },
  link: { color: palette.accent, fontWeight: "700", fontSize: 15 },
  switchRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: 7 },
  switchButton: { minHeight: 48, justifyContent: "center" },
  error: { color: palette.accent, fontSize: 15 },
  busy: { opacity: 0.8 },
});
