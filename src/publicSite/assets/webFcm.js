/**
 * Zero-dependency Web FCM Push Registration for CEDA Innovation Portal.
 * Registers /firebase-messaging-sw.js, subscribes via PushManager using the
 * Firebase Web VAPID key, exchanges the subscription for an FCM registration token
 * via Firebase Installations + FCM Registrations REST APIs, and saves it to
 * Supabase `notification_devices` (platform = 'web').
 */

const WEB_FCM_TOKEN_STORAGE_KEY = "ceda.web.fcmToken";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64Url(buffer) {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function resolveBrowserLabel() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Web Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android Web"
        : /iPhone|iPad/.test(ua)
          ? "iOS Web"
          : "Desktop";
  return `${browser} (${os})`.slice(0, 120);
}

async function exchangeWebPushForFcmToken(firebaseWeb, subscription, fetchFn = fetch) {
  const subJson = subscription.toJSON ? subscription.toJSON() : {};
  const endpoint = subscription.endpoint || subJson.endpoint;
  const p256dh = subJson.keys?.p256dh || arrayBufferToBase64Url(subscription.getKey?.("p256dh"));
  const auth = subJson.keys?.auth || arrayBufferToBase64Url(subscription.getKey?.("auth"));
  if (!endpoint || !p256dh || !auth) {
    throw new Error("PushSubscription keys are unavailable.");
  }

  const installRes = await fetchFn(
    `https://firebaseinstallations.googleapis.com/v1/projects/${encodeURIComponent(firebaseWeb.projectId)}/installations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": firebaseWeb.apiKey,
      },
      body: JSON.stringify({
        fid: undefined,
        appId: firebaseWeb.appId || `1:000000000000:web:cedaportal`,
        authVersion: "FIS_v2",
        sdkVersion: "w:0.10.0",
      }),
    }
  );
  if (!installRes.ok) {
    throw new Error(`Firebase Installations failed (${installRes.status})`);
  }
  const installData = await installRes.json();
  const fisToken = installData?.authToken?.token;
  if (!fisToken) {
    throw new Error("Missing Firebase installation auth token.");
  }

  const regRes = await fetchFn(
    `https://fcmregistrations.googleapis.com/v1/projects/${encodeURIComponent(firebaseWeb.projectId)}/registrations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": firebaseWeb.apiKey,
        "x-goog-firebase-installations-auth": fisToken,
      },
      body: JSON.stringify({
        web: {
          endpoint,
          p256dh,
          auth,
          applicationPubKey: firebaseWeb.vapidKey,
        },
      }),
    }
  );
  if (!regRes.ok) {
    throw new Error(`FCM web registration failed (${regRes.status})`);
  }
  const regData = await regRes.json();
  if (!regData?.token) {
    throw new Error("FCM registration response did not include a token.");
  }
  return regData.token;
}

export async function registerWebFcmIfSupported(signupConfig, accessToken, options = {}, fetchFn = fetch) {
  if (!signupConfig?.url || !signupConfig?.key || !accessToken) {
    return { ok: false, reason: "missing-auth" };
  }
  const firebaseWeb = signupConfig.firebaseWeb;
  if (!firebaseWeb?.projectId || !firebaseWeb?.apiKey || !firebaseWeb?.vapidKey) {
    return { ok: false, reason: "unconfigured" };
  }
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return { ok: false, reason: "unsupported" };
  }

  try {
    let permission = Notification.permission;
    if (permission === "default" && options.promptIfNeeded !== false) {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
      return { ok: false, reason: permission === "denied" ? "denied" : "prompt-deferred" };
    }

    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(firebaseWeb.vapidKey),
      });
    }

    const fcmToken = await exchangeWebPushForFcmToken(firebaseWeb, subscription, fetchFn);
    const rpcRes = await fetchFn(new URL("/rest/v1/rpc/register_notification_device", signupConfig.url), {
      method: "POST",
      headers: {
        apikey: signupConfig.key,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_fcm_token: fcmToken,
        p_platform: "web",
        p_device_label: resolveBrowserLabel(),
        p_permission_status: "granted",
      }),
      cache: "no-store",
      credentials: "omit",
    });

    if (!rpcRes.ok) {
      return { ok: false, reason: "rpc-error", status: rpcRes.status };
    }

    try {
      sessionStorage.setItem(WEB_FCM_TOKEN_STORAGE_KEY, fcmToken);
    } catch {
      // Ignore storage failures in private browsing
    }

    return { ok: true, tokenSuffix: fcmToken.slice(-8) };
  } catch (err) {
    return { ok: false, reason: "error", message: err instanceof Error ? err.message : "Web FCM setup failed" };
  }
}

export async function unregisterWebFcmDevice(signupConfig, accessToken, fetchFn = fetch) {
  let storedToken = "";
  try {
    storedToken = sessionStorage.getItem(WEB_FCM_TOKEN_STORAGE_KEY) || "";
    sessionStorage.removeItem(WEB_FCM_TOKEN_STORAGE_KEY);
  } catch {
    storedToken = "";
  }
  if (!storedToken || !signupConfig?.url || !signupConfig?.key || !accessToken) return;

  await fetchFn(new URL("/rest/v1/rpc/unregister_notification_device", signupConfig.url), {
    method: "POST",
    headers: {
      apikey: signupConfig.key,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_fcm_token: storedToken }),
    cache: "no-store",
    credentials: "omit",
  }).catch(() => {});
}
