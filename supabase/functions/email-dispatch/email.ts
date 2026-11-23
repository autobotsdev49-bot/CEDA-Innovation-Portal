export type EmailProviderKind = "emailjs" | "resend" | "none";

export interface EmailProviderConfig {
  configured: boolean;
  provider: EmailProviderKind;
  fromAddress: string;
  replyTo?: string;
  resendApiKey?: string;
  emailjsServiceId?: string;
  emailjsTemplateId?: string;
  emailjsPublicKey?: string;
  emailjsPrivateKey?: string;
  portalBaseUrl: string;
}

export interface EmailQueueRecipient {
  userId: string;
  email: string;
  fullName?: string | null;
  role?: string | null;
}

export interface LeasedEmailQueueItem {
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
  recipients?: EmailQueueRecipient[];
}

export interface EmailErrorClassification {
  outcome: "transient" | "auth" | "invalid";
  code: string;
  message: string;
  tripCircuit: boolean;
}

const DEFAULT_PORTAL_URL = "https://ceda-innovation-portal-nine.vercel.app";

export function parseEmailProviderConfig(env: Record<string, string | undefined>): EmailProviderConfig {
  const portalBaseUrl = (env.NEXT_PUBLIC_APP_URL || env.PORTAL_BASE_URL || DEFAULT_PORTAL_URL)
    .trim()
    .replace(/\/$/, "");
  const resendApiKey = (env.RESEND_API_KEY || "").trim();
  const fromAddress = (env.EMAIL_FROM || "CEDA Innovation Portal <alerts@ceda-innovation.org.bw>").trim();
  const replyTo = (env.EMAIL_REPLY_TO || "").trim() || undefined;

  const emailjsServiceId = (env.EMAILJS_SERVICE_ID || "").trim();
  const emailjsTemplateId = (env.EMAILJS_TEMPLATE_ID || "").trim();
  const emailjsPublicKey = (env.EMAILJS_PUBLIC_KEY || "").trim();
  const emailjsPrivateKey = (env.EMAILJS_PRIVATE_KEY || "").trim();

  if (resendApiKey) {
    return {
      configured: true,
      provider: "resend",
      fromAddress,
      replyTo,
      resendApiKey,
      portalBaseUrl,
    };
  }

  if (emailjsServiceId && emailjsTemplateId && emailjsPublicKey) {
    return {
      configured: true,
      provider: "emailjs",
      fromAddress,
      replyTo,
      emailjsServiceId,
      emailjsTemplateId,
      emailjsPublicKey,
      emailjsPrivateKey: emailjsPrivateKey || undefined,
      portalBaseUrl,
    };
  }

  return {
    configured: false,
    provider: "none",
    fromAddress,
    portalBaseUrl,
  };
}

export class EmailCircuitBreaker {
  private failures = 0;
  private openUntilMs = 0;
  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(threshold = 3, cooldownMs = 60_000) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
  }

  canExecute(nowMs = Date.now()): boolean {
    if (this.openUntilMs > nowMs) return false;
    if (this.openUntilMs !== 0 && this.openUntilMs <= nowMs) {
      this.failures = 0;
      this.openUntilMs = 0;
    }
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openUntilMs = 0;
  }

  recordFailure(nowMs = Date.now()): void {
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.openUntilMs = nowMs + this.cooldownMs;
    }
  }

  remainingCooldownMs(nowMs = Date.now()): number {
    return Math.max(0, this.openUntilMs - nowMs);
  }
}

export function computeEmailRetryDelaySeconds(attemptNumber: number, jitterRatio = 0): number {
  const safeAttempt = Math.max(1, Math.min(6, Math.floor(attemptNumber || 1)));
  const base = Math.min(900, 30 * 2 ** (safeAttempt - 1));
  const boundedJitter = Math.max(-0.25, Math.min(0.25, jitterRatio));
  return Math.max(15, Math.round(base * (1 + boundedJitter)));
}

export function classifyEmailErrorResponse(status: number, bodyText: string): EmailErrorClassification {
  const cleanMsg = String(bodyText || "").replace(/\s+/g, " ").trim().slice(0, 220);
  if (status === 401 || status === 403) {
    return {
      outcome: "auth",
      code: `HTTP_${status}`,
      message: cleanMsg || "Email provider authentication failed.",
      tripCircuit: true,
    };
  }
  if (status === 429 || status >= 500) {
    return {
      outcome: "transient",
      code: `HTTP_${status}`,
      message: cleanMsg || "Email provider temporarily unavailable.",
      tripCircuit: true,
    };
  }
  return {
    outcome: "invalid",
    code: `HTTP_${status}`,
    message: cleanMsg || "Email payload rejected by provider.",
    tripCircuit: false,
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function targetRouteForRecipient(item: LeasedEmailQueueItem, recipient: EmailQueueRecipient, baseUrl: string): string {
  const role = String(recipient.role || "innovator").toLowerCase();
  const basePath =
    role === "committee"
      ? "/committee/"
      : role === "admin"
        ? "/admin/"
        : role === "assessor"
          ? "/assessor/"
          : role === "support"
            ? "/support/"
            : "/account/";
  const hash = String(item.targetHash || "#applications").startsWith("#")
    ? String(item.targetHash || "#applications")
    : `#${item.targetHash}`;
  return `${baseUrl}${basePath}${hash}`;
}

/** Render clean escaped HTML + plain-text email alert with explicit free-of-charge & unsubscribe note. */
export function renderAlertEmailContent(
  item: LeasedEmailQueueItem,
  recipient: EmailQueueRecipient,
  portalBaseUrl = DEFAULT_PORTAL_URL
): {
  subject: string;
  html: string;
  text: string;
  portalLink: string;
  settingsLink: string;
} {
  const cleanRef = item.applicationRef ? `[${item.applicationRef}] ` : "";
  const subject = `${cleanRef}${item.title || "CEDA Innovation Portal update"}`.slice(0, 180);
  const recipientName = String(recipient.fullName || "Applicant").trim();
  const portalLink = targetRouteForRecipient(item, recipient, portalBaseUrl);
  const settingsLink = `${portalBaseUrl}/account/#settings`;

  const text = [
    `Hello ${recipientName},`,
    "",
    item.title,
    item.message,
    item.applicationRef ? `Submission reference: ${item.applicationRef}` : "",
    "",
    `Open portal: ${portalLink}`,
    "",
    `Free Alert Notice: You receive this submission alert at no charge (P0.00).`,
    `Manage alert subscriptions or unsubscribe anytime at: ${settingsLink}`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f7f2eb;font-family:Inter,Arial,sans-serif;color:#241c19;">
  <div style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e4d9d0;border-radius:16px;padding:24px;">
    <p style="margin:0 0 8px;color:#9a3d2b;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
      CEDA Innovation Portal${item.category ? ` &bull; ${escapeHtml(item.category)}` : ""}
    </p>
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;">${escapeHtml(item.title)}</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.55;">Hello ${escapeHtml(recipientName)},</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">${escapeHtml(item.message)}</p>
    ${item.applicationRef ? `<p style="margin:0 0 16px;font-size:13px;color:#65564d;"><strong>Submission reference:</strong> ${escapeHtml(item.applicationRef)}</p>` : ""}
    <p style="margin:20px 0;">
      <a href="${escapeHtml(portalLink)}" style="display:inline-block;padding:11px 20px;background:#9a3d2b;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:700;font-size:14px;">Open Portal Update</a>
    </p>
    <hr style="border:0;border-top:1px solid #e4d9d0;margin:20px 0;" />
    <p style="margin:0;font-size:12px;color:#65564d;line-height:1.5;">
      <strong>Free Alert Service (No Charge — P0.00):</strong> You subscribed to receive updates for this submission at no cost.
      To pause or unsubscribe from optional alerts, update your preferences at
      <a href="${escapeHtml(settingsLink)}" style="color:#9a3d2b;">Settings &rarr; Notifications</a>.
    </p>
  </div>
</body>
</html>`;

  return { subject, html, text, portalLink, settingsLink };
}

export async function sendEmailMessage(
  cfg: EmailProviderConfig,
  recipient: EmailQueueRecipient,
  item: LeasedEmailQueueItem,
  fetchFn: typeof fetch = fetch
): Promise<
  | { status: "sent"; providerMessageId: string | null }
  | { status: "failed"; transient: boolean; errorCode: string; errorMessage: string }
> {
  const rendered = renderAlertEmailContent(item, recipient, cfg.portalBaseUrl);

  if (cfg.provider === "resend") {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: cfg.fromAddress,
        to: [recipient.email],
        ...(cfg.replyTo ? { reply_to: cfg.replyTo } : {}),
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const okJson = (await res.json().catch(() => ({}))) as { id?: string };
      return { status: "sent", providerMessageId: okJson?.id || null };
    }
    const errBody = await res.text().catch(() => "");
    const classified = classifyEmailErrorResponse(res.status, errBody);
    return {
      status: "failed",
      transient: classified.outcome === "transient" || classified.outcome === "auth",
      errorCode: classified.code,
      errorMessage: classified.message,
    };
  }

  if (cfg.provider === "emailjs") {
    const res = await fetchFn("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: cfg.emailjsServiceId,
        template_id: cfg.emailjsTemplateId,
        user_id: cfg.emailjsPublicKey,
        ...(cfg.emailjsPrivateKey ? { accessToken: cfg.emailjsPrivateKey } : {}),
        template_params: {
          to_email: recipient.email,
          to_name: recipient.fullName || "Applicant",
          subject: rendered.subject,
          title: item.title,
          message: item.message,
          application_ref: item.applicationRef || "",
          portal_link: rendered.portalLink,
          unsubscribe_link: rendered.settingsLink,
        },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      return { status: "sent", providerMessageId: `emailjs-${Date.now().toString(36)}` };
    }
    const errBody = await res.text().catch(() => "");
    const classified = classifyEmailErrorResponse(res.status, errBody);
    return {
      status: "failed",
      transient: classified.outcome === "transient" || classified.outcome === "auth",
      errorCode: classified.code,
      errorMessage: classified.message,
    };
  }

  return {
    status: "failed",
    transient: false,
    errorCode: "NO_PROVIDER",
    errorMessage: "No email provider configured.",
  };
}
