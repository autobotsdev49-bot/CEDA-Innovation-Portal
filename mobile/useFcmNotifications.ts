import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import type { Account } from "./auth";
import {
  fetchMyNotificationDevices,
  parsePushNotificationRoute,
  registerNotificationDevice,
  type NotificationDeviceSummary,
  type NotificationPermissionState,
  type PushNotificationRoute,
} from "./notificationsApi";

export type FcmRegistrationStatus =
  | "idle"
  | "registering"
  | "ready"
  | "denied"
  | "unsupported"
  | "error";

export interface FcmNotificationState {
  status: FcmRegistrationStatus;
  permissionStatus: NotificationPermissionState;
  tokenSuffix: string | null;
  errorMessage: string | null;
  pushEnabled: boolean;
  devices: NotificationDeviceSummary[];
  refreshDeviceRegistration: (promptIfNeeded?: boolean) => Promise<void>;
  syncDeviceList: () => Promise<void>;
}

const ANDROID_CHANNEL_ID = "ceda-portal-updates";

let handlerConfigured = false;

async function resolveDeviceLabel(): Promise<string> {
  try {
    const Device = await import("expo-device");
    const label = [Device.manufacturer, Device.modelName || Device.deviceName]
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .join(" ")
      .trim();
    if (label) return label.slice(0, 120);
  } catch {
    // Fallback below
  }
  return Platform.OS === "ios" ? "iOS Mobile" : Platform.OS === "android" ? "Android Mobile" : "Mobile App";
}

function mapPermissionStatus(status: string | undefined): NotificationPermissionState {
  if (status === "granted" || status === "denied" || status === "provisional") {
    return status;
  }
  return "undetermined";
}

export function useFcmNotifications(
  account: Account | null,
  options?: {
    onForegroundMessage?: () => void;
    onNotificationRoute?: (route: PushNotificationRoute) => void;
    onTokenChange?: (token: string | null) => void;
  }
): FcmNotificationState {
  const [status, setStatus] = useState<FcmRegistrationStatus>("idle");
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermissionState>("undetermined");
  const [tokenSuffix, setTokenSuffix] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState<boolean>(true);
  const [devices, setDevices] = useState<NotificationDeviceSummary[]>([]);

  const accountRef = useRef<Account | null>(account);
  accountRef.current = account;
  const callbacksRef = useRef(options);
  callbacksRef.current = options;
  const handledResponseIdsRef = useRef<Set<string>>(new Set());

  const syncDeviceList = useCallback(async () => {
    const current = accountRef.current;
    if (!current?.token) {
      setDevices([]);
      return;
    }
    try {
      const overview = await fetchMyNotificationDevices(current.token);
      if (accountRef.current?.token !== current.token) return;
      setPushEnabled(overview.pushEnabled);
      setDevices(overview.devices);
    } catch {
      // Non-fatal background refresh
    }
  }, []);

  const refreshDeviceRegistration = useCallback(async (promptIfNeeded = true) => {
    const current = accountRef.current;
    if (!current?.token) {
      setStatus("idle");
      setTokenSuffix(null);
      setErrorMessage(null);
      callbacksRef.current?.onTokenChange?.(null);
      return;
    }

    if (Platform.OS === "web") {
      setStatus("unsupported");
      setErrorMessage("Native FCM device tokens are active on Android / iOS builds.");
      await syncDeviceList();
      return;
    }

    setStatus("registering");
    setErrorMessage(null);

    try {
      const Notifications = await import("expo-notifications");
      const Device = await import("expo-device");

      if (!handlerConfigured) {
        handlerConfigured = true;
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          }),
        });
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
          name: "CEDA Portal Updates",
          importance: Notifications.AndroidImportance.HIGH,
          sound: "default",
          vibrationPattern: [0, 200, 150, 200],
          lightColor: "#9A3D2B",
          enableLights: true,
          enableVibrate: true,
        });
      }

      const existingPerm = await Notifications.getPermissionsAsync();
      let finalPerm = mapPermissionStatus(existingPerm.status);
      if (finalPerm !== "granted" && promptIfNeeded && existingPerm.canAskAgain) {
        const requested = await Notifications.requestPermissionsAsync();
        finalPerm = mapPermissionStatus(requested.status);
      }
      setPermissionStatus(finalPerm);

      if (finalPerm !== "granted" && finalPerm !== "provisional") {
        setStatus("denied");
        setErrorMessage("Enable notification permission in device settings to receive CEDA alerts.");
        await syncDeviceList();
        return;
      }

      if (!Device.isDevice && Platform.OS === "ios") {
        setStatus("unsupported");
        setErrorMessage("APNs/FCM push tokens require a physical device.");
        await syncDeviceList();
        return;
      }

      const pushToken = await Notifications.getDevicePushTokenAsync();
      const rawToken = typeof pushToken?.data === "string" ? pushToken.data.trim() : "";
      if (!rawToken) {
        setStatus("unsupported");
        setErrorMessage("Build and install the Android APK / dev client to obtain an FCM token.");
        await syncDeviceList();
        return;
      }

      if (accountRef.current?.token !== current.token) return;
      const label = await resolveDeviceLabel();
      const platform = Platform.OS === "ios" ? "ios" : "android";
      const registered = await registerNotificationDevice(current.token, {
        fcmToken: rawToken,
        platform,
        deviceLabel: label,
        permissionStatus: finalPerm,
      });

      if (accountRef.current?.token !== current.token) return;
      setTokenSuffix(registered.tokenSuffix || rawToken.slice(-8));
      setStatus("ready");
      setErrorMessage(null);
      callbacksRef.current?.onTokenChange?.(rawToken);
      await syncDeviceList();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not initialize device push notifications.";
      const isExpoGoHint = /expo go|development build|google-services|firebaseapp/i.test(msg);
      setStatus(isExpoGoHint ? "unsupported" : "error");
      setErrorMessage(
        isExpoGoHint
          ? "FCM native push requires an Android development build or EAS APK (not Expo Go)."
          : msg
      );
      await syncDeviceList();
    }
  }, [syncDeviceList]);

  useEffect(() => {
    if (!account?.token) {
      setStatus("idle");
      setTokenSuffix(null);
      setDevices([]);
      setErrorMessage(null);
      callbacksRef.current?.onTokenChange?.(null);
      return;
    }

    let cancelled = false;
    let cleanupFns: Array<() => void> = [];

    void refreshDeviceRegistration(true);

    if (Platform.OS !== "web") {
      void (async () => {
        try {
          const Notifications = await import("expo-notifications");
          if (cancelled) return;

          const dispatchTapResponse = (response: {
            notification?: { request?: { identifier?: string; content?: { data?: Record<string, unknown> } } };
          } | null) => {
            const req = response?.notification?.request;
            if (!req) return;
            const id = req.identifier || "";
            if (id && handledResponseIdsRef.current.has(id)) return;
            if (id) handledResponseIdsRef.current.add(id);
            const current = accountRef.current;
            if (!current) return;
            const route = parsePushNotificationRoute(
              (req.content?.data as Record<string, unknown> | undefined) ?? {},
              current.role
            );
            callbacksRef.current?.onNotificationRoute?.(route);
          };

          const lastResponse = Notifications.getLastNotificationResponse();
          if (lastResponse) {
            dispatchTapResponse(lastResponse);
          }

          const tokenSub = Notifications.addPushTokenListener((ev) => {
            const current = accountRef.current;
            const newToken = typeof ev?.data === "string" ? ev.data.trim() : "";
            if (!current?.token || !newToken) return;
            void resolveDeviceLabel().then((label) =>
              registerNotificationDevice(current.token, {
                fcmToken: newToken,
                platform: Platform.OS === "ios" ? "ios" : "android",
                deviceLabel: label,
                permissionStatus: "granted",
              })
                .then((reg) => {
                  setTokenSuffix(reg.tokenSuffix || newToken.slice(-8));
                  setStatus("ready");
                  callbacksRef.current?.onTokenChange?.(newToken);
                  void syncDeviceList();
                })
                .catch(() => {})
            );
          });

          const recvSub = Notifications.addNotificationReceivedListener(() => {
            callbacksRef.current?.onForegroundMessage?.();
          });

          const respSub = Notifications.addNotificationResponseReceivedListener((response) => {
            dispatchTapResponse(response);
          });

          cleanupFns = [
            () => tokenSub.remove(),
            () => recvSub.remove(),
            () => respSub.remove(),
          ];
        } catch {
          // Safe no-op in unsupported runtimes
        }
      })();
    }

    return () => {
      cancelled = true;
      for (const fn of cleanupFns) fn();
    };
  }, [account?.token, refreshDeviceRegistration, syncDeviceList]);

  return {
    status,
    permissionStatus,
    tokenSuffix,
    errorMessage,
    pushEnabled,
    devices,
    refreshDeviceRegistration,
    syncDeviceList,
  };
}
