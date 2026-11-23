import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { portalUrl, type Account } from "./auth";
import { FrostedSurface } from "./FrostedGlass";
import { PushNotificationSettingsCard } from "./PushNotificationSettingsCard";
import type { FcmNotificationState } from "./useFcmNotifications";
import {
  isStrongAccountPassword,
  isTokenAal2,
  prepareTotpEnrollment,
  updateAccountPassword,
  verifyTotpFactorCode,
  type TotpEnrollmentPreparation,
} from "./securityApi";
import { buttonCornerRadius, fontSizes } from "./theme";

const c = {
  navy: "#192C40",
  rust: "#9A3D2B",
  teal: "#278477",
  subtle: "#7C8590",
  line: "#E5DDD3",
  card: "rgba(255,255,255,0.88)",
};

/**
 * Shared native Account & Security cards (TOTP authenticator enrollment/verification + 12-72 byte password updates).
 */
export function AccountSecurityCards({
  account,
  friendlyName,
  webPath,
  onAccountChange,
  fcm,
}: {
  account: Account;
  friendlyName: string;
  webPath?: string;
  onAccountChange: (next: Account) => void;
  fcm?: FcmNotificationState;
}) {
  const isVerified = isTokenAal2(account.token);
  const [prep, setPrep] = useState<TotpEnrollmentPreparation | null>(null);
  const [code, setCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaMessage, setMfaMessage] = useState("");
  const [mfaError, setMfaError] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMessage, setPwMessage] = useState("");
  const [pwError, setPwError] = useState("");

  async function beginAuthenticator() {
    setMfaBusy(true);
    setMfaError("");
    setMfaMessage("");
    try {
      const next = await prepareTotpEnrollment(account, friendlyName);
      setPrep(next);
      setMfaMessage(
        next.alreadyVerified
          ? "Enter the 6-digit code from your enrolled authenticator app."
          : "Add the setup key below to your authenticator app, then enter the 6-digit code to finish setup."
      );
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : "Could not prepare authenticator setup.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function completeVerification() {
    if (!prep?.factorId || code.length !== 6) return;
    setMfaBusy(true);
    setMfaError("");
    try {
      const updated = await verifyTotpFactorCode(account, prep.factorId, code);
      setCode("");
      setPrep(null);
      onAccountChange(updated);
      setMfaMessage("Session verified with your authenticator (AAL2).");
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setMfaBusy(false);
    }
  }

  async function changePassword() {
    setPwError("");
    setPwMessage("");
    if (newPassword !== confirmPassword) {
      setPwError("The passwords do not match.");
      return;
    }
    if (!isStrongAccountPassword(newPassword)) {
      setPwError("Use 12-72 UTF-8 bytes with uppercase, lowercase, a number and a symbol.");
      return;
    }
    setPwBusy(true);
    try {
      await updateAccountPassword(account, newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setPwMessage("Password updated.");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <>
      <View style={s.card}>
        <FrostedSurface variant="card" borderRadius={22} />
        <Text accessibilityRole="header" style={s.heading}>Authenticator enrollment & verification</Text>
        <Text style={s.note}>
          {isVerified
            ? "This session is verified with your authenticator (AAL2)."
            : "Set up or verify your TOTP authenticator directly here before completing sensitive actions."}
        </Text>
        {!!mfaError && <Text accessibilityRole="alert" style={s.error}>{mfaError}</Text>}
        {!!mfaMessage && <Text accessibilityLiveRegion="polite" style={s.success}>{mfaMessage}</Text>}
        {prep && !prep.alreadyVerified && (
          <View style={s.secretBox}>
            <Text style={s.factLabel}>AUTHENTICATOR SETUP KEY (TOTP)</Text>
            <Text selectable style={s.secretCode}>{prep.formattedSecret || prep.secret || "Setup key unavailable"}</Text>
            <Text style={s.note}>Enter this key in Google Authenticator, Microsoft Authenticator or 1Password.</Text>
          </View>
        )}
        {prep && (
          <>
            <Text style={s.label}>Six-digit verification code</Text>
            <TextInput
              accessibilityLabel="Six-digit verification code"
              value={code}
              onChangeText={val => setCode(val.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              editable={!mfaBusy}
              placeholder="000000"
              style={s.input}
            />
            <Pressable
              accessibilityRole="button"
              disabled={mfaBusy || code.length !== 6}
              onPress={() => void completeVerification()}
              style={[s.button, (mfaBusy || code.length !== 6) && { opacity: 0.6 }]}
            >
              <Text style={s.buttonText}>{mfaBusy ? "Verifying..." : "Verify session code"}</Text>
            </Pressable>
          </>
        )}
        {!prep && (
          <Pressable accessibilityRole="button" disabled={mfaBusy} onPress={() => void beginAuthenticator()} style={s.button}>
            <Text style={s.buttonText}>
              {mfaBusy ? "Preparing..." : isVerified ? "Re-verify authenticator" : "Set up or verify authenticator"}
            </Text>
          </Pressable>
        )}
        {webPath ? (
          <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(portalUrl + webPath)} style={[s.button, s.secondary]}>
            <Text style={[s.buttonText, { color: c.navy }]}>Open web security screen</Text>
          </Pressable>
        ) : null}
      </View>

      <PushNotificationSettingsCard account={account} fcm={fcm} />

      <View style={s.card}>
        <FrostedSurface variant="card" borderRadius={22} />
        <Text accessibilityRole="header" style={s.heading}>Update password</Text>
        <Text style={s.note}>Use 12 to 72 UTF-8 bytes with uppercase, lowercase, a number and a symbol.</Text>
        {!!pwError && <Text accessibilityRole="alert" style={s.error}>{pwError}</Text>}
        {!!pwMessage && <Text accessibilityLiveRegion="polite" style={s.success}>{pwMessage}</Text>}
        <Text style={s.label}>New password</Text>
        <TextInput
          accessibilityLabel="New password"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!pwBusy}
          maxLength={72}
          style={s.input}
        />
        <Text style={s.label}>Confirm new password</Text>
        <TextInput
          accessibilityLabel="Confirm new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          editable={!pwBusy}
          maxLength={72}
          style={s.input}
        />
        <Pressable
          accessibilityRole="button"
          disabled={pwBusy || !newPassword || !confirmPassword}
          onPress={() => void changePassword()}
          style={[s.button, (pwBusy || !newPassword || !confirmPassword) && { opacity: 0.6 }]}
        >
          <Text style={s.buttonText}>{pwBusy ? "Updating..." : "Update password"}</Text>
        </Pressable>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 16,
    gap: 11,
    overflow: "hidden",
    shadowColor: "#241C19",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 2,
  },
  heading: { color: c.navy, fontSize: fontSizes.heading, fontWeight: "700" },
  note: { color: c.subtle, fontSize: fontSizes.subbody, lineHeight: 20 },
  label: { color: c.navy, fontSize: fontSizes.subbody, fontWeight: "700" },
  input: { backgroundColor: "rgba(255,255,255,0.88)", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, fontSize: fontSizes.body, color: c.navy },
  factLabel: { color: c.subtle, fontSize: fontSizes.caption, fontWeight: "700" },
  button: { minHeight: 42, borderRadius: buttonCornerRadius, backgroundColor: c.rust, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, paddingVertical: 10 },
  secondary: { backgroundColor: "rgba(243,239,234,0.94)" },
  buttonText: { color: "white", fontSize: fontSizes.body, fontWeight: "600" },
  error: { color: c.rust, fontSize: fontSizes.subbody, fontWeight: "600" },
  success: { color: c.teal, fontSize: fontSizes.subbody, fontWeight: "700" },
  secretBox: { padding: 12, borderRadius: 16, backgroundColor: "rgba(247,242,235,0.85)", gap: 6 },
  secretCode: { color: c.navy, fontSize: fontSizes.heading, fontWeight: "800", letterSpacing: 1.5 },
});
