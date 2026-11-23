import {
  computeEmailRetryDelaySeconds,
  EmailCircuitBreaker,
  parseEmailProviderConfig,
  sendEmailMessage,
  type LeasedEmailQueueItem,
} from "./email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const emailCircuit = new EmailCircuitBreaker(3, 60_000);

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

async function verifyCaller(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
  serviceRoleKey: string
): Promise<{ kind: "service" | "user"; userId?: string; role?: string } | null> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  if (token === serviceRoleKey) {
    return { kind: "service" };
  }

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey || serviceRoleKey,
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!userRes.ok) return null;
  const user = (await userRes.json()) as {
    id?: string;
    is_anonymous?: boolean;
    email_confirmed_at?: string | null;
  };
  if (!user?.id || user.is_anonymous || !user.email_confirmed_at) {
    return null;
  }

  const profRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,account_role,account_status`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      signal: AbortSignal.timeout(5000),
    }
  );
  if (!profRes.ok) return null;
  const rows = (await profRes.json()) as Array<{
    id: string;
    account_role: string;
    account_status: string;
  }>;
  const prof = rows?.[0];
  if (!prof || prof.account_status !== "active") {
    return null;
  }
  if (!["innovator", "admin", "assessor", "support", "committee"].includes(prof.account_role)) {
    return null;
  }

  return {
    kind: "user",
    userId: prof.id,
    role: prof.account_role,
  };
}

async function rpcService<T>(
  supabaseUrl: string,
  serviceRoleKey: string,
  fnName: string,
  payload: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`RPC ${fnName} failed (${res.status}): ${text.slice(0, 240)}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: "Supabase service environment is not configured." }, 500);
  }

  const caller = await verifyCaller(req, supabaseUrl, anonKey, serviceRoleKey);
  if (!caller) {
    return jsonResponse({ ok: false, error: "Unauthorized caller" }, 401);
  }

  let body: { mode?: "drain" | "retry" | "test-self"; queueId?: string; limit?: number } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const mode = body.mode || "drain";
  const isAdminOrService = caller.kind === "service" || caller.role === "admin";
  if ((mode === "retry" || mode === "test-self") && !isAdminOrService) {
    return jsonResponse({ ok: false, error: "Administrator access required" }, 403);
  }

  const emailConfig = parseEmailProviderConfig({
    NEXT_PUBLIC_APP_URL: Deno.env.get("NEXT_PUBLIC_APP_URL"),
    PORTAL_BASE_URL: Deno.env.get("PORTAL_BASE_URL"),
    RESEND_API_KEY: Deno.env.get("RESEND_API_KEY"),
    EMAIL_FROM: Deno.env.get("EMAIL_FROM"),
    EMAIL_REPLY_TO: Deno.env.get("EMAIL_REPLY_TO"),
    EMAILJS_SERVICE_ID: Deno.env.get("EMAILJS_SERVICE_ID"),
    EMAILJS_TEMPLATE_ID: Deno.env.get("EMAILJS_TEMPLATE_ID"),
    EMAILJS_PUBLIC_KEY: Deno.env.get("EMAILJS_PUBLIC_KEY"),
    EMAILJS_PRIVATE_KEY: Deno.env.get("EMAILJS_PRIVATE_KEY"),
  });

  if (!emailConfig.configured) {
    return jsonResponse({
      ok: true,
      configured: false,
      provider: "none",
      dispatched: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      message:
        "Email provider keys (RESEND_API_KEY or EMAILJS_*) are not configured yet; queued email alerts stay recorded in PostgreSQL.",
    });
  }

  if (!emailCircuit.canExecute()) {
    return jsonResponse(
      {
        ok: false,
        configured: true,
        circuitOpen: true,
        retryAfterMs: emailCircuit.remainingCooldownMs(),
        error: "Email provider circuit breaker is open; queued alerts will retry automatically.",
      },
      503
    );
  }

  const requestedLimit = Number(body.limit || (isAdminOrService ? 25 : 10));
  const safeLimit = Math.max(1, Math.min(isAdminOrService ? 50 : 10, requestedLimit));
  const targetQueueId =
    isAdminOrService && typeof body.queueId === "string" && body.queueId.trim() ? body.queueId.trim() : null;

  const workerId = `edge-email-${crypto.randomUUID().slice(0, 8)}`;
  let items: LeasedEmailQueueItem[] = [];
  try {
    const leased = await rpcService<LeasedEmailQueueItem[] | null>(
      supabaseUrl,
      serviceRoleKey,
      "email_lease_queue_batch",
      { p_limit: safeLimit, p_worker_id: workerId, p_queue_id: targetQueueId }
    );
    items = Array.isArray(leased) ? leased : [];
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        configured: true,
        error: err instanceof Error ? err.message : "Failed to lease email batch",
      },
      500
    );
  }

  let sentItems = 0;
  let skippedItems = 0;
  let failedItems = 0;
  let requeuedItems = 0;
  let emailsDelivered = 0;

  for (const item of items) {
    const recipients = Array.isArray(item.recipients) ? item.recipients.filter((r) => r?.email) : [];
    if (recipients.length === 0) {
      skippedItems += 1;
      await rpcService(supabaseUrl, serviceRoleKey, "email_complete_queue_item", {
        p_queue_id: item.id,
        p_email_status: "Skipped",
        p_provider: emailConfig.provider,
        p_provider_message_id: null,
        p_last_error: "Recipient unsubscribed or email alerts disabled.",
        p_next_attempt_at: null,
        p_attempts_json: [
          {
            userId: item.recipientUserId || null,
            status: "skipped",
            errorCode: "UNSUBSCRIBED_OR_OPTED_OUT",
            errorMessage: "No subscribed email recipient matched active alert preferences.",
          },
        ],
      });
      continue;
    }

    const attemptsJson: Array<Record<string, unknown>> = [];
    let itemSentCount = 0;
    let firstMessageId: string | null = null;
    let firstError: string | null = null;
    let hasTransientFailure = false;

    for (const recipient of recipients) {
      try {
        const res = await sendEmailMessage(emailConfig, recipient, item);
        if (res.status === "sent") {
          emailCircuit.recordSuccess();
          itemSentCount += 1;
          emailsDelivered += 1;
          if (!firstMessageId && res.providerMessageId) firstMessageId = res.providerMessageId;
          attemptsJson.push({
            userId: recipient.userId,
            status: "sent",
            providerMessageId: res.providerMessageId,
          });
        } else {
          if (res.transient) {
            hasTransientFailure = true;
            emailCircuit.recordFailure();
          }
          if (!firstError) firstError = `${res.errorCode}: ${res.errorMessage}`;
          attemptsJson.push({
            userId: recipient.userId,
            status: "failed",
            errorCode: res.errorCode,
            errorMessage: res.errorMessage,
          });
        }
      } catch (err) {
        hasTransientFailure = true;
        emailCircuit.recordFailure();
        const msg = err instanceof Error ? err.message : "Network error sending email";
        if (!firstError) firstError = `NETWORK_ERROR: ${msg}`;
        attemptsJson.push({
          userId: recipient.userId,
          status: "failed",
          errorCode: "NETWORK_ERROR",
          errorMessage: msg,
        });
      }
    }

    let nextEmailStatus: "Sent" | "Queued" | "Failed" = "Failed";
    let nextAttemptAt: string | null = null;
    if (itemSentCount > 0) {
      nextEmailStatus = "Sent";
      sentItems += 1;
    } else if (hasTransientFailure && Number(item.attempts || 1) < 5) {
      nextEmailStatus = "Queued";
      requeuedItems += 1;
      const delaySec = computeEmailRetryDelaySeconds(item.attempts || 1, Math.random() * 0.3 - 0.15);
      nextAttemptAt = new Date(Date.now() + delaySec * 1000).toISOString();
    } else {
      nextEmailStatus = "Failed";
      failedItems += 1;
    }

    await rpcService(supabaseUrl, serviceRoleKey, "email_complete_queue_item", {
      p_queue_id: item.id,
      p_email_status: nextEmailStatus,
      p_provider: emailConfig.provider,
      p_provider_message_id: firstMessageId,
      p_last_error: nextEmailStatus === "Sent" ? null : firstError || "Email delivery failed",
      p_next_attempt_at: nextAttemptAt,
      p_attempts_json: attemptsJson,
    });
  }

  return jsonResponse({
    ok: true,
    configured: true,
    provider: emailConfig.provider,
    dispatched: items.length,
    sent: sentItems,
    requeued: requeuedItems,
    skipped: skippedItems,
    failed: failedItems,
    emailsDelivered,
  });
});
