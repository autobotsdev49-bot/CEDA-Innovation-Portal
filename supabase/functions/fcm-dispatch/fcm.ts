export interface FcmServiceAccountConfig {
  configured: boolean;
  projectId: string;
  clientEmail: string;
  privateKeyPem: string;
}

export interface LeasedQueueDevice {
  deviceId: string;
  userId: string;
  fcmToken: string;
  platform: "android" | "ios" | "web" | string;
  appRole: "innovator" | "admin" | "assessor" | "support" | string;
}

export interface LeasedQueueItem {
  id: string;
  idempotencyKey?: string;
  recipientUserId?: string | null;
  eventKey?: string | null;
  category?: string | null;
  title: string;
  message: string;
  channel?: string | null;
  audience?: string | null;
  attempts: number;
  applicationRef?: string | null;
  targetHash?: string | null;
  dataPayload?: Record<string, unknown> | null;
  devices?: LeasedQueueDevice[];
}

export interface FcmErrorClassification {
  outcome: "unregistered" | "invalid" | "transient" | "auth";
  code: string;
  message: string;
  shouldDeactivateToken: boolean;
  tripCircuit: boolean;
}

const DEFAULT_FCM_PROJECT_ID = "bw-gov-schools-2026";
const DISALLOWED_DATA_KEYS = new Set([
  "email",
  "phone",
  "password",
  "token",
  "fcmtoken",
  "omang",
  "notes",
  "scores",
  "internalnotes",
  "ssn",
]);

export function parseServiceAccountConfig(env: Record<string, string | undefined>): FcmServiceAccountConfig {
  let projectId = (env.FCM_PROJECT_ID || "").trim();
  let clientEmail = (env.FCM_CLIENT_EMAIL || "").trim();
  let privateKeyRaw = (env.FCM_PRIVATE_KEY || "").trim();

  const jsonFallback = (env.FCM_SERVICE_ACCOUNT_JSON || (privateKeyRaw.startsWith("{") ? privateKeyRaw : "")).trim();
  if (jsonFallback.startsWith("{")) {
    try {
      const parsed = JSON.parse(jsonFallback) as {
        project_id?: string;
        client_email?: string;
        private_key?: string;
      };
      if (!projectId && parsed.project_id) projectId = String(parsed.project_id).trim();
      if (!clientEmail && parsed.client_email) clientEmail = String(parsed.client_email).trim();
      if (parsed.private_key) privateKeyRaw = String(parsed.private_key).trim();
    } catch {
      // Ignore invalid JSON fallback and validate fields normally.
    }
  }

  const privateKeyPem = privateKeyRaw.replace(/\\n/g, "\n").trim();
  const effectiveProjectId = projectId || DEFAULT_FCM_PROJECT_ID;
  const hasPem =
    privateKeyPem.includes("BEGIN PRIVATE KEY") &&
    privateKeyPem.includes("END PRIVATE KEY");

  return {
    configured: Boolean(effectiveProjectId && clientEmail.includes("@") && hasPem),
    projectId: effectiveProjectId,
    clientEmail,
    privateKeyPem,
  };
}

export function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function createGoogleServiceAccountJwt(
  clientEmail: string,
  privateKeyPem: string,
  scope = "https://www.googleapis.com/auth/firebase.messaging",
  nowSec = Math.floor(Date.now() / 1000),
  cryptoImpl: Crypto = crypto
): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: nowSec,
      exp: nowSec + 3600,
    })
  );
  const signingInput = `${header}.${claim}`;
  const key = await cryptoImpl.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await cryptoImpl.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;
}

export function sanitizeNotificationContent(title: string, message: string): { title: string; body: string } {
  const strip = (value: string) =>
    String(value || "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const cleanTitle = strip(title).slice(0, 120) || "CEDA Innovation Portal";
  const rawBody = strip(message);
  const cleanBody =
    rawBody.length > 240 ? `${rawBody.slice(0, 237)}...` : rawBody || "You have a new portal update.";
  return { title: cleanTitle, body: cleanBody };
}

export function sanitizeFcmData(item: LeasedQueueItem): Record<string, string> {
  const out: Record<string, string> = {};
  const payload = item.dataPayload && typeof item.dataPayload === "object" ? item.dataPayload : {};

  for (const [k, v] of Object.entries(payload)) {
    const cleanKey = String(k).trim();
    if (!cleanKey || cleanKey.length > 48) continue;
    if (DISALLOWED_DATA_KEYS.has(cleanKey.toLowerCase())) continue;
    if (v === null || v === undefined) continue;
    const strVal = typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";
    if (!strVal) continue;
    out[cleanKey] = strVal.slice(0, 250);
  }

  out.queueId = String(item.id).slice(0, 64);
  if (item.eventKey) out.eventKey = String(item.eventKey).slice(0, 64);
  if (item.applicationRef) out.applicationRef = String(item.applicationRef).slice(0, 64);
  if (item.targetHash) out.targetHash = String(item.targetHash).slice(0, 64);
  return out;
}

export function buildFcmHttpV1Payload(item: LeasedQueueItem, device: LeasedQueueDevice) {
  const notification = sanitizeNotificationContent(item.title, item.message);
  const data = sanitizeFcmData(item);
  if (!data.audience && device.appRole) {
    data.audience = String(device.appRole);
  }

  return {
    message: {
      token: device.fcmToken,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data,
      android: {
        priority: "HIGH",
        notification: {
          channel_id: "ceda-portal-updates",
          sound: "default",
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
      webpush: {
        headers: {
          Urgency: "high",
        },
      },
    },
  };
}

export function computeRetryDelaySeconds(attempts: number, jitterRatio = 0): number {
  const safeAttempts = Math.max(1, Math.floor(attempts || 1));
  const base = Math.min(3600, 30 * 2 ** (safeAttempts - 1));
  const clampedJitter = Math.max(-0.2, Math.min(0.2, jitterRatio));
  return Math.max(15, Math.round(base * (1 + clampedJitter)));
}

export function classifyFcmErrorResponse(status: number, bodyText: string): FcmErrorClassification {
  let code = `HTTP_${status}`;
  let message = bodyText ? bodyText.slice(0, 320) : `FCM returned HTTP ${status}`;

  try {
    const parsed = JSON.parse(bodyText) as {
      error?: {
        status?: string;
        message?: string;
        details?: Array<{ errorCode?: string; "@type"?: string }>;
      };
    };
    const err = parsed?.error;
    if (err) {
      const fcmDetail = Array.isArray(err.details)
        ? err.details.find((d) => typeof d?.errorCode === "string")?.errorCode
        : undefined;
      code = String(fcmDetail || err.status || code).toUpperCase();
      if (err.message) message = String(err.message).slice(0, 320);
    }
  } catch {
    // Keep raw summary
  }

  if (code === "UNREGISTERED" || (status === 404 && /not\s*found|unregistered/i.test(message))) {
    return {
      outcome: "unregistered",
      code: "UNREGISTERED",
      message,
      shouldDeactivateToken: true,
      tripCircuit: false,
    };
  }

  if (
    code === "SENDER_ID_MISMATCH" ||
    ((code === "INVALID_ARGUMENT" || status === 400) && /registration token|token/i.test(message))
  ) {
    return {
      outcome: "invalid",
      code,
      message,
      shouldDeactivateToken: true,
      tripCircuit: false,
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    code === "THIRD_PARTY_AUTH_ERROR" ||
    code === "UNAUTHENTICATED" ||
    code === "PERMISSION_DENIED"
  ) {
    return {
      outcome: "auth",
      code,
      message,
      shouldDeactivateToken: false,
      tripCircuit: true,
    };
  }

  if (status === 429 || status >= 500 || code === "QUOTA_EXCEEDED" || code === "UNAVAILABLE" || code === "INTERNAL") {
    return {
      outcome: "transient",
      code,
      message,
      shouldDeactivateToken: false,
      tripCircuit: true,
    };
  }

  return {
    outcome: "invalid",
    code,
    message,
    shouldDeactivateToken: false,
    tripCircuit: false,
  };
}

export class FcmCircuitBreaker {
  private failures = 0;
  private openUntilMs = 0;

  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 60_000
  ) {}

  canExecute(nowMs = Date.now()): boolean {
    if (this.openUntilMs === 0) return true;
    if (nowMs >= this.openUntilMs) {
      this.openUntilMs = 0;
      this.failures = Math.max(0, this.threshold - 1);
      return true;
    }
    return false;
  }

  remainingCooldownMs(nowMs = Date.now()): number {
    return this.openUntilMs > nowMs ? this.openUntilMs - nowMs : 0;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openUntilMs = 0;
  }

  recordFailure(nowMs = Date.now()): boolean {
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.openUntilMs = nowMs + this.cooldownMs;
      return true;
    }
    return false;
  }

  reset(): void {
    this.failures = 0;
    this.openUntilMs = 0;
  }
}
