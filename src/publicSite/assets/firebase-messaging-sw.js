/* Service Worker for CEDA Innovation Portal Web Push (FCM HTTP v1 webpush) */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function routeForAudience(data) {
  const audience = String(data?.audience || "innovator").toLowerCase();
  const basePath =
    audience === "admin" || audience === "administrator"
      ? "/admin/"
      : audience === "assessor"
        ? "/assessor/"
        : audience === "support" || audience === "support officer"
          ? "/support/"
          : audience === "committee"
            ? "/committee/"
            : "/account/";
  const rawHash = String(data?.targetHash || "#applications");
  const hash = rawHash.startsWith("#") ? rawHash : `#${rawHash}`;
  return `${basePath}${hash}`;
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { notification: { title: "CEDA Innovation Portal", body: event.data ? event.data.text() : "" } };
  }

  const notif = payload.notification || {};
  const data = payload.data || {};
  const title = notif.title || data.title || "CEDA Innovation Portal";
  const body = notif.body || data.body || "You have a new portal update.";
  const tag = data.queueId || data.applicationRef || "ceda-portal-update";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/assets/ceda.png",
      badge: "/assets/ceda.png",
      tag,
      data: {
        ...data,
        url: routeForAudience(data),
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/account/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client && targetUrl) {
            void client.navigate(targetUrl).catch(() => {});
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
