import { useEffect, useRef, useState } from "react";
import { AppState, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { resendVerificationEmail, type checkEmailVerification } from "./auth";
import { palette } from "./theme";

const resendCooldown = 60_000;

type VerificationProps = {
  email: string;
  checkVerification: () => ReturnType<typeof checkEmailVerification>;
  onSignIn: () => void;
};

export function VerifyEmail({ email, checkVerification, onSignIn }: VerificationProps) {
  const [resendAt, setResendAt] = useState(() => Date.now() + resendCooldown);
  const [retryCheckAt, setRetryCheckAt] = useState(0);
  const [clock, setClock] = useState(Date.now);
  const [busy, setBusy] = useState<"check" | "resend" | null>(null);
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const resendSeconds = Math.max(0, Math.ceil((resendAt - clock) / 1000));
  const retrySeconds = Math.max(0, Math.ceil((retryCheckAt - clock) / 1000));

  useEffect(() => {
    const deadline = Math.max(resendAt, retryCheckAt);
    const refresh = () => setClock(Date.now());
    const timer = setInterval(() => {
      refresh();
      if (Date.now() >= deadline) clearInterval(timer);
    }, 1000);
    const listener = AppState.addEventListener("change", state => {
      if (state === "active") refresh();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, [resendAt, retryCheckAt]);

  async function verify() {
    if (inFlight.current || retryCheckAt > Date.now()) return;
    inFlight.current = true;
    setBusy("check");
    setNotice("");
    try {
      const result = await checkVerification();
      if (result.status === "error") {
        setNotice(result.message);
        if (result.retryAt) setRetryCheckAt(result.retryAt);
      }
    } catch {
      setNotice("We couldn't check your email. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  async function resend() {
    if (inFlight.current || resendAt > Date.now()) return;
    inFlight.current = true;
    setBusy("resend");
    setNotice("");
    try {
      const result = await resendVerificationEmail(email);
      if (result.status === "sent") {
        setResendAt(Date.now() + resendCooldown);
        setNotice("Check your inbox and spam folder for the latest verification email.");
      } else {
        setNotice(result.message);
        if (result.retryAt) setResendAt(result.retryAt);
      }
    } catch {
      setNotice("We couldn't resend the email. Check your connection and try again.");
    } finally {
      setClock(Date.now());
      inFlight.current = false;
      setBusy(null);
    }
  }

  const checkDisabled = busy !== null || retrySeconds > 0;
  const resendDisabled = busy !== null || resendSeconds > 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Image source={require("./assets/ceda.png")} style={styles.logo} resizeMode="contain" accessible={false} />
        <Text accessibilityRole="header" style={styles.title}>Verify your email</Text>
        <Text style={styles.description}>
          Open the verification link sent to <Text style={styles.email}>{email}</Text>. Then come back here and tap I have verified my email.
        </Text>
        {notice ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: checkDisabled, busy: busy === "check" }}
          disabled={checkDisabled}
          onPress={() => void verify()}
          style={[styles.primary, checkDisabled && styles.disabled]}
        >
          <Text style={styles.primaryLabel}>{busy === "check" ? "Checking your email" : "I have verified my email"}</Text>
        </Pressable>
        {retrySeconds > 0 && <Text style={styles.detail}>Check again in {retrySeconds}s.</Text>}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: resendDisabled, busy: busy === "resend" }}
          disabled={resendDisabled}
          onPress={() => void resend()}
          style={styles.secondary}
        >
          <Text style={[styles.link, resendDisabled && styles.detail]}>
            {busy === "resend" ? "Sending verification email" : resendSeconds > 0 ? "Resend verification email in " + resendSeconds + "s" : "Resend verification email"}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={busy !== null} onPress={onSignIn} style={styles.secondary}>
          <Text style={styles.link}>Sign in instead</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.paper },
  content: { flexGrow: 1, justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 460, alignSelf: "center", gap: 14, padding: 22, borderRadius: 28, backgroundColor: palette.white },
  logo: { width: 86, height: 56 },
  title: { fontSize: 30, fontWeight: "800", color: palette.ink },
  description: { fontSize: 16, lineHeight: 24, color: palette.muted },
  email: { color: palette.ink, fontWeight: "700" },
  notice: { fontSize: 15, lineHeight: 22, color: palette.ink, backgroundColor: palette.amberTint, borderRadius: 14, padding: 12 },
  primary: { minHeight: 52, justifyContent: "center", alignItems: "center", padding: 12, borderRadius: 28, backgroundColor: palette.accent },
  primaryLabel: { color: palette.white, fontSize: 16, fontWeight: "700", textAlign: "center" },
  disabled: { opacity: 0.65 },
  secondary: { minHeight: 48, justifyContent: "center", alignItems: "center" },
  link: { color: palette.accent, fontSize: 15, fontWeight: "700", textAlign: "center" },
  detail: { color: palette.muted, textAlign: "center" },
});
