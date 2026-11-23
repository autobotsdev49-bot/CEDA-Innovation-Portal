/**
 * Shared domain helpers for zero-charge alert subscriptions, notification preferences,
 * incremental notification polling, and non-blocking Email + Push dispatch triggers.
 */

export const FREE_ALERT_FEE_AMOUNT = 0;
export const FREE_ALERT_FEE_LABEL = "No charge (Free, P0.00)";

export const ALERT_EVENT_CATEGORIES = [
  { key: "status", prefKey: "notifyStatus", label: "Submission, review, approval & award status updates" },
  { key: "clarifications", prefKey: "notifyClarifications", label: "Assessment clarification requests & deadlines" },
  { key: "messages", prefKey: "notifyMessages", label: "Messages from CEDA Consultants, Assessors & Support" },
];

/**
 * Normalize notification preference flags onto Smart Defaults (enabled at zero cost).
 */
export function normalizeAlertPreferences(rawPrefs) {
  const p = rawPrefs && typeof rawPrefs === "object" ? rawPrefs : {};
  return {
    emailNotifications: p.emailNotifications !== false,
    pushNotifications: p.pushNotifications !== false,
    inAppNotifications: p.inAppNotifications !== false,
    notifyStatus: p.notifyStatus !== false && p.statusAlerts !== false,
    notifyClarifications: p.notifyClarifications !== false && p.clarificationAlerts !== false,
    notifyMessages: p.notifyMessages !== false,
    feeAmount: FREE_ALERT_FEE_AMOUNT,
    feeLabel: FREE_ALERT_FEE_LABEL,
  };
}

/**
 * Resolve effective subscription status for a specific application + account preferences.
 */
export function summarizeApplicationAlertSubscription(sub, rawPrefs) {
  const prefs = normalizeAlertPreferences(rawPrefs);
  const isSubscribed = sub ? sub.isSubscribed !== false : true;
  const emailActive = isSubscribed && prefs.emailNotifications && (sub?.channels?.email !== false);
  const pushActive = isSubscribed && prefs.pushNotifications && (sub?.channels?.push !== false);
  const inAppActive = isSubscribed && prefs.inAppNotifications && (sub?.channels?.inApp !== false);

  const activeChannels = [
    inAppActive ? "Portal" : null,
    emailActive ? "Email" : null,
    pushActive ? "Push" : null,
  ].filter(Boolean);

  return {
    isSubscribed,
    emailActive,
    pushActive,
    inAppActive,
    activeChannelsLabel: activeChannels.length ? activeChannels.join(" + ") : "Paused (Unsubscribed)",
    feeAmount: FREE_ALERT_FEE_AMOUNT,
    feeLabel: sub?.feeLabel || FREE_ALERT_FEE_LABEL,
    badgeText: isSubscribed ? "Free alerts on (P0.00)" : "Alerts paused",
  };
}

/**
 * Fire-and-forget dispatch trigger for Email and Push outbox Edge Functions.
 */
export async function dispatchQueuedNotifications(signupConfig, token, options = {}, fetchFn = fetch) {
  if (!signupConfig?.url || !signupConfig?.key || !token) {
    return { email: null, push: null };
  }
  const payload = JSON.stringify({
    mode: options.mode || "drain",
    queueId: options.queueId || undefined,
    limit: options.limit ?? 15,
  });
  const callEdge = async (fnName) => {
    try {
      const res = await fetchFn(new URL(`/functions/v1/${fnName}`, signupConfig.url), {
        method: "POST",
        headers: {
          apikey: signupConfig.key,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: payload,
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(10000),
      });
      return await res.json().catch(() => ({ ok: res.ok }));
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Dispatch unreachable" };
    }
  };

  if (options.emailOnly) {
    return { email: await callEdge("email-dispatch"), push: null };
  }
  if (options.pushOnly) {
    return { email: null, push: await callEdge("fcm-dispatch") };
  }
  const [email, push] = await Promise.all([callEdge("email-dispatch"), callEdge("fcm-dispatch")]);
  return { email, push };
}

export function kickNotificationDispatch(signupConfig, token, options = {}, fetchFn = fetch) {
  if (!signupConfig?.url || !signupConfig?.key || !token) return;
  void dispatchQueuedNotifications(signupConfig, token, options, fetchFn).catch(() => {});
}

/**
 * Merge newly polled notifications cleanly without duplicates.
 */
export function mergeIncrementalNotifications(existing = [], incoming = [], maxItems = 40) {
  const byId = new Map();
  for (const item of [...incoming, ...existing]) {
    if (item && item.id && !byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()].slice(0, maxItems);
}
