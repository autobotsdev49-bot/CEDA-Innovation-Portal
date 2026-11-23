import type { Account } from "./auth";

export type NotificationPlatform = "android" | "ios" | "web";
export type NotificationPermissionState = "granted" | "denied" | "undetermined" | "provisional";
export type NotificationRole = Account["role"];

export interface NotificationDeviceSummary {
  id: string;
  platform: NotificationPlatform | string;
  appRole: NotificationRole | string;
  deviceLabel: string;
  permissionStatus: NotificationPermissionState | string;
  isActive: boolean;
  tokenSuffix: string;
  lastSeenAt: string;
}

export interface MyNotificationDevicesResponse {
  pushEnabled: boolean;
  devices: NotificationDeviceSummary[];
}

export interface FcmDispatchSummary {
  ok: boolean;
  configured?: boolean;
  dispatched?: number;
  sent?: number;
  requeued?: number;
  failed?: number;
  devicesDelivered?: number;
  devicesUnregistered?: number;
  circuitOpen?: boolean;
  retryAfterMs?: number;
  message?: string;
  error?: string;
}

export type PushRouteSection =
  | "overview"
  | "applications"
  | "messages"
  | "support"
  | "optimus"
  | "assessments"
  | "queue"
  | "followup"
  | "notifications";

export interface PushNotificationRoute {
  role: NotificationRole;
  section: PushRouteSection;
  eventKey?: string;
  applicationRef?: string;
  caseId?: string;
  roundId?: string;
  ticketRef?: string;
  matterRef?: string;
  targetHash?: string;
}

export interface NotificationsApiConfig {
  url: string;
  publishableKey: string;
  fetchFn?: typeof fetch;
}

function resolveApiConfig(override?: Partial<NotificationsApiConfig>): NotificationsApiConfig {
  const url = (override?.url ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const publishableKey = override?.publishableKey ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (
    !url ||
    !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) ||
    !publishableKey ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/i.test(publishableKey)
  ) {
    throw new Error("Portal notification service configuration is unavailable.");
  }
  return {
    url,
    publishableKey,
    fetchFn: override?.fetchFn ?? fetch,
  };
}

async function callNotificationRpc<T>(
  fnName: string,
  params: Record<string, unknown>,
  token: string,
  override?: Partial<NotificationsApiConfig>
): Promise<T> {
  if (!token) throw new Error("Sign in before updating notification settings.");
  const cfg = resolveApiConfig(override);
  const res = await (cfg.fetchFn ?? fetch)(`${cfg.url}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      apikey: cfg.publishableKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
    cache: "no-store",
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const errObj = parsed && typeof parsed === "object" ? (parsed as { message?: string; msg?: string; error?: string }) : null;
    const msg = errObj?.message || errObj?.msg || errObj?.error || "We could not update push notification settings.";
    throw new Error(msg);
  }
  return parsed as T;
}

export async function registerNotificationDevice(
  token: string,
  input: {
    fcmToken: string;
    platform?: NotificationPlatform;
    deviceLabel?: string;
    permissionStatus?: NotificationPermissionState;
  },
  override?: Partial<NotificationsApiConfig>
): Promise<NotificationDeviceSummary> {
  return callNotificationRpc<NotificationDeviceSummary>(
    "register_notification_device",
    {
      p_fcm_token: input.fcmToken.trim(),
      p_platform: input.platform ?? "android",
      p_device_label: (input.deviceLabel ?? "").trim().slice(0, 120),
      p_permission_status: input.permissionStatus ?? "granted",
    },
    token,
    override
  );
}

export async function unregisterNotificationDevice(
  token: string,
  fcmToken?: string | null,
  override?: Partial<NotificationsApiConfig>
): Promise<number> {
  if (!token) return 0;
  try {
    const count = await callNotificationRpc<number>(
      "unregister_notification_device",
      { p_fcm_token: fcmToken?.trim() || null },
      token,
      override
    );
    return Number(count || 0);
  } catch {
    return 0;
  }
}

export async function fetchMyNotificationDevices(
  token: string,
  override?: Partial<NotificationsApiConfig>
): Promise<MyNotificationDevicesResponse> {
  const data = await callNotificationRpc<MyNotificationDevicesResponse>(
    "my_notification_devices",
    {},
    token,
    override
  );
  return {
    pushEnabled: data?.pushEnabled !== false,
    devices: Array.isArray(data?.devices) ? data.devices : [],
  };
}

export async function updatePushPreferences(
  token: string,
  input: {
    pushEnabled: boolean;
    notifyStatus?: boolean | null;
    notifyClarifications?: boolean | null;
    notifyMessages?: boolean | null;
  },
  override?: Partial<NotificationsApiConfig>
): Promise<Record<string, unknown>> {
  return callNotificationRpc<Record<string, unknown>>(
    "update_push_preferences",
    {
      p_push_enabled: Boolean(input.pushEnabled),
      p_notify_status: input.notifyStatus ?? null,
      p_notify_clarifications: input.notifyClarifications ?? null,
      p_notify_messages: input.notifyMessages ?? null,
    },
    token,
    override
  );
}

export const FREE_ALERT_PLAN_LABEL = "No charge (Free, P0.00)";

export interface AlertSubscriptionItem {
  applicationId: string;
  applicationRef: string;
  applicationTitle?: string;
  status?: string;
  isSubscribed: boolean;
  channels?: { email?: boolean; inApp?: boolean; push?: boolean };
  events?: { status?: boolean; clarifications?: boolean; messages?: boolean; award?: boolean };
  feeAmount?: number;
  feeLabel?: string;
  subscribedAt?: string | null;
  unsubscribedAt?: string | null;
}

export interface EmailDispatchSummary {
  ok: boolean;
  configured?: boolean;
  provider?: string;
  dispatched?: number;
  sent?: number;
  requeued?: number;
  skipped?: number;
  failed?: number;
  emailsDelivered?: number;
  circuitOpen?: boolean;
  retryAfterMs?: number;
  message?: string;
  error?: string;
}

export interface PollNotificationsResponse {
  serverTime?: string;
  preferences?: Record<string, unknown>;
  unreadCount?: number;
  notifications?: Array<{
    id: string;
    kind: string;
    title: string;
    message: string;
    applicationRef?: string | null;
    targetHash?: string | null;
    isRead: boolean;
    createdAt: string;
  }>;
  applicationStatuses?: Array<{
    id: string;
    reference: string;
    status: string;
    version: number;
    updatedAt: string;
  }>;
  alertSubscriptions?: AlertSubscriptionItem[];
}

export async function updateAlertPreferences(
  token: string,
  input: {
    emailEnabled: boolean;
    pushEnabled: boolean;
    notifyStatus: boolean;
    notifyClarifications: boolean;
    notifyMessages: boolean;
  },
  override?: Partial<NotificationsApiConfig>
): Promise<Record<string, unknown>> {
  return callNotificationRpc<Record<string, unknown>>(
    "innovator_update_alert_preferences",
    {
      p_email_enabled: Boolean(input.emailEnabled),
      p_push_enabled: Boolean(input.pushEnabled),
      p_notify_status: Boolean(input.notifyStatus),
      p_notify_clarifications: Boolean(input.notifyClarifications),
      p_notify_messages: Boolean(input.notifyMessages),
    },
    token,
    override
  );
}

export async function toggleSubmissionAlerts(
  token: string,
  input: {
    applicationId: string;
    isSubscribed: boolean;
    channels?: { email?: boolean; inApp?: boolean; push?: boolean } | null;
    events?: { status?: boolean; clarifications?: boolean; messages?: boolean; award?: boolean } | null;
  },
  override?: Partial<NotificationsApiConfig>
): Promise<AlertSubscriptionItem[]> {
  return callNotificationRpc<AlertSubscriptionItem[]>(
    "innovator_toggle_submission_alerts",
    {
      p_application_id: input.applicationId,
      p_is_subscribed: Boolean(input.isSubscribed),
      p_channels: input.channels ?? null,
      p_events: input.events ?? null,
    },
    token,
    override
  );
}

export async function pollInnovatorNotifications(
  token: string,
  since?: string | null,
  override?: Partial<NotificationsApiConfig>
): Promise<PollNotificationsResponse> {
  return callNotificationRpc<PollNotificationsResponse>(
    "innovator_poll_notifications",
    { p_since: since ?? null },
    token,
    override
  );
}

async function triggerEdgeNotificationDispatch<T extends { ok: boolean; error?: string }>(
  fnName: "fcm-dispatch" | "email-dispatch",
  token: string,
  options?: { mode?: "drain" | "retry" | "test-self"; queueId?: string; limit?: number },
  override?: Partial<NotificationsApiConfig>
): Promise<T> {
  if (!token) return { ok: false, error: "Session token unavailable" } as T;
  try {
    const cfg = resolveApiConfig(override);
    const res = await (cfg.fetchFn ?? fetch)(`${cfg.url}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        apikey: cfg.publishableKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: options?.mode ?? "drain",
        ...(options?.queueId ? { queueId: options.queueId } : {}),
        ...(typeof options?.limit === "number" ? { limit: options.limit } : {}),
      }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as T | null;
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error || `${fnName} returned HTTP ${res.status}`,
      } as T;
    }
    return data ?? ({ ok: true, dispatched: 0, sent: 0 } as unknown as T);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : `Could not reach ${fnName}`,
    } as T;
  }
}

export async function triggerFcmDispatch(
  token: string,
  options?: {
    mode?: "drain" | "retry" | "test-self";
    queueId?: string;
    limit?: number;
  },
  override?: Partial<NotificationsApiConfig>
): Promise<FcmDispatchSummary> {
  return triggerEdgeNotificationDispatch<FcmDispatchSummary>("fcm-dispatch", token, options, override);
}

export async function triggerEmailDispatch(
  token: string,
  options?: {
    mode?: "drain" | "retry" | "test-self";
    queueId?: string;
    limit?: number;
  },
  override?: Partial<NotificationsApiConfig>
): Promise<EmailDispatchSummary> {
  return triggerEdgeNotificationDispatch<EmailDispatchSummary>("email-dispatch", token, options, override);
}

export function kickFcmDispatch(
  token: string,
  options?: { mode?: "drain" | "retry" | "test-self"; queueId?: string; limit?: number; pushOnly?: boolean },
  override?: Partial<NotificationsApiConfig>
): void {
  if (!token) return;
  void triggerFcmDispatch(token, options, override).catch(() => {});
  if (!options?.pushOnly) {
    void triggerEmailDispatch(token, options, override).catch(() => {});
  }
}

function readStr(obj: Record<string, unknown>, key: string): string | undefined {
  const val = obj[key];
  return typeof val === "string" && val.trim() ? val.trim() : undefined;
}

export function parsePushNotificationRoute(
  rawData: Record<string, unknown> | null | undefined,
  role: NotificationRole
): PushNotificationRoute {
  const data = rawData && typeof rawData === "object" ? rawData : {};
  const eventKey = readStr(data, "eventKey");
  const targetHash = readStr(data, "targetHash");
  const applicationRef = readStr(data, "applicationRef");
  const caseId = readStr(data, "caseId");
  const roundId = readStr(data, "roundId");
  const ticketRef = readStr(data, "ticketRef");
  const matterRef = readStr(data, "matterRef");

  if (role === "innovator") {
    if (targetHash === "#optimus" || eventKey === "optimus") {
      return { role, section: "optimus", eventKey, applicationRef, targetHash };
    }
    if (
      targetHash === "#support" ||
      eventKey === "support_update" ||
      eventKey === "support_reply" ||
      Boolean(ticketRef)
    ) {
      return { role, section: "support", eventKey, applicationRef, ticketRef, targetHash };
    }
    if (targetHash === "#messages" || eventKey === "message_received") {
      return { role, section: "messages", eventKey, applicationRef, targetHash };
    }
    return {
      role,
      section: applicationRef ? "applications" : "overview",
      eventKey,
      applicationRef,
      targetHash,
    };
  }

  if (role === "assessor") {
    return {
      role,
      section: "assessments",
      eventKey,
      applicationRef,
      caseId,
      roundId,
      targetHash,
    };
  }

  if (role === "support") {
    return {
      role,
      section: "queue",
      eventKey,
      applicationRef,
      ticketRef,
      targetHash,
    };
  }

  if (role === "admin") {
    if (targetHash === "#followup" || eventKey === "admin_alert" || Boolean(matterRef)) {
      return { role, section: "followup", eventKey, applicationRef, matterRef, targetHash };
    }
    if (eventKey === "admin_test_push" || targetHash === "#notifications") {
      return { role, section: "notifications", eventKey, targetHash };
    }
    if (applicationRef) {
      return { role, section: "applications", eventKey, applicationRef, targetHash };
    }
    return { role, section: "overview", eventKey, targetHash };
  }

  return { role, section: "overview", eventKey, applicationRef, targetHash };
}
