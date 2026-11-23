import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import type { Account } from "./auth";
import { FrostedSurface } from "./FrostedGlass";
import { fetchMyNotificationDevices, updatePushPreferences, type NotificationDeviceSummary } from "./notificationsApi";
import type { FcmNotificationState } from "./useFcmNotifications";
import { buttonCornerRadius, fontSizes } from "./theme";

const c = {
  navy: "#192C40",
  rust: "#9A3D2B",
  teal: "#278477",
  amber: "#94702D",
  subtle: "#7C8590",
  line: "#E5DDD3",
};

function badgeCopy(fcm?: FcmNotificationState): { label: string; bg: string; color: string } {
  if (!fcm) return { label: "Server synced", bg: "#EAF1FC", color: "#28599B" };
  if (fcm.status === "ready") {
    return {
      label: fcm.tokenSuffix ? `Active · …${fcm.tokenSuffix}` : "Active on device",
      bg: "#E4F4F0",
      color: "#236D61",
    };
  }
  if (fcm.status === "registering") {
    return { label: "Registering…", bg: "#FCF4E4", color: c.amber };
  }
  if (fcm.status === "denied") {
    return { label: "Permission blocked", bg: "#FBEDE8", color: c.rust };
  }
  if (fcm.status === "unsupported") {
    return { label: "Android APK required", bg: "#F1F3F6", color: "#52606C" };
  }
  if (fcm.status === "error") {
    return { label: "Needs attention", bg: "#FBEDE8", color: c.rust };
  }
  return { label: "Standby", bg: "#F1F3F6", color: "#52606C" };
}

export function PushNotificationSettingsCard({
  account,
  fcm,
  onPushEnabledChange,
  embedded = false,
}: {
  account: Account;
  fcm?: FcmNotificationState;
  onPushEnabledChange?: (enabled: boolean) => void;
  embedded?: boolean;
}) {
  const [pushEnabled, setPushEnabled] = useState(fcm?.pushEnabled ?? true);
  const [devices, setDevices] = useState<NotificationDeviceSummary[]>(fcm?.devices ?? []);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (fcm) {
      setPushEnabled(fcm.pushEnabled);
      setDevices(fcm.devices);
    }
  }, [fcm?.pushEnabled, fcm?.devices]);

  useEffect(() => {
    let active = true;
    if (!account.token) return;
    void fetchMyNotificationDevices(account.token)
      .then((res) => {
        if (!active) return;
        setPushEnabled(res.pushEnabled);
        setDevices(res.devices);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [account.token]);

  async function togglePush(next: boolean) {
    setBusy(true);
    setError("");
    setFeedback("");
    setPushEnabled(next);
    try {
      await updatePushPreferences(account.token, { pushEnabled: next });
      onPushEnabledChange?.(next);
      setFeedback(
        next
          ? "FCM push delivery enabled so urgent portal alerts reach your lock screen."
          : "FCM push paused on mobile. Important notices stay in your portal inbox."
      );
      await fcm?.syncDeviceList();
    } catch (err) {
      setPushEnabled(!next);
      setError(err instanceof Error ? err.message : "Could not update push notification preference.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshRegistration() {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await fcm?.refreshDeviceRegistration(true);
      const res = await fetchMyNotificationDevices(account.token);
      setPushEnabled(res.pushEnabled);
      setDevices(res.devices);
      if (fcm?.status === "ready") {
        setFeedback("Device token synced with Firebase Cloud Messaging.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh device push registration.");
    } finally {
      setBusy(false);
    }
  }

  const badge = badgeCopy(fcm);
  const activeDevices = devices.filter((d) => d.isActive);

  const inner = (
    <>
      <View style={s.topRow}>
        <Text style={s.heading}>Mobile push notifications (FCM)</Text>
        <View style={[s.badge, { backgroundColor: badge.bg }]}>
          <Text style={[s.badgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </View>
      <Text style={s.note}>
        Receive instant alerts for deadlines, clarification requests, assessment rounds, and replies even when the app is closed.
      </Text>

      <View style={s.switchRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.label}>Allow FCM push delivery</Text>
          <Text style={s.caption}>
            {activeDevices.length
              ? `${activeDevices.length} active device${activeDevices.length === 1 ? "" : "s"} registered for your account`
              : "No active mobile token registered yet"}
          </Text>
        </View>
        <Switch
          accessibilityLabel="Allow FCM push delivery"
          value={pushEnabled}
          disabled={busy}
          onValueChange={(next) => void togglePush(next)}
          trackColor={{ false: "#D8D0C5", true: c.teal }}
          thumbColor="white"
        />
      </View>

      {!!fcm?.errorMessage && <Text style={s.warn}>{fcm.errorMessage}</Text>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {!!feedback && <Text accessibilityLiveRegion="polite" style={s.success}>{feedback}</Text>}

      {activeDevices.length > 0 && (
        <View style={s.deviceList}>
          {activeDevices.slice(0, 3).map((dev) => (
            <View key={dev.id} style={s.deviceRow}>
              <Text style={s.deviceTitle}>{dev.deviceLabel || `${dev.platform.toUpperCase()} device`}</Text>
              <Text style={s.deviceMeta}>
                {dev.platform} · …{dev.tokenSuffix} · {dev.lastSeenAt}
              </Text>
            </View>
          ))}
        </View>
      )}

      {fcm && (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void refreshRegistration()}
          style={[s.button, busy && { opacity: 0.6 }]}
        >
          <Text style={s.buttonText}>{busy ? "Refreshing…" : "Enable / refresh push on this device"}</Text>
        </Pressable>
      )}
    </>
  );

  if (embedded) return <View style={s.embeddedWrap}>{inner}</View>;
  return (
    <View style={s.card}>
      <FrostedSurface variant="card" borderRadius={22} />
      {inner}
    </View>
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
  embeddedWrap: {
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" },
  heading: { color: c.navy, fontSize: fontSizes.heading, fontWeight: "700", flexShrink: 1 },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  badgeText: { fontSize: fontSizes.caption, fontWeight: "700" },
  note: { color: c.subtle, fontSize: fontSizes.subbody, lineHeight: 20 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  label: { color: c.navy, fontSize: fontSizes.subbody, fontWeight: "700" },
  caption: { color: c.subtle, fontSize: fontSizes.caption },
  deviceList: { gap: 6, backgroundColor: "rgba(247,242,235,0.85)", borderRadius: 14, padding: 10 },
  deviceRow: { gap: 1 },
  deviceTitle: { color: c.navy, fontSize: fontSizes.subbody, fontWeight: "600" },
  deviceMeta: { color: c.subtle, fontSize: fontSizes.caption },
  button: {
    minHeight: 42,
    borderRadius: buttonCornerRadius,
    backgroundColor: "rgba(243,239,234,0.96)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonText: { color: c.navy, fontSize: fontSizes.subbody, fontWeight: "700" },
  warn: { color: c.amber, fontSize: fontSizes.caption, fontWeight: "600", lineHeight: 18 },
  error: { color: c.rust, fontSize: fontSizes.subbody, fontWeight: "600" },
  success: { color: c.teal, fontSize: fontSizes.subbody, fontWeight: "700" },
});
