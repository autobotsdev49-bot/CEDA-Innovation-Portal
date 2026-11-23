import {
  buildFcmHttpV1Payload,
  classifyFcmErrorResponse,
  computeRetryDelaySeconds,
  createGoogleServiceAccountJwt,
  FcmCircuitBreaker,
  type LeasedQueueItem,
  parseServiceAccountConfig,
} from "./fcm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CachedAccessToken {
  token: string;
  expiresAtMs: number;
}

interface VerifiedCaller {
  kind: "service" | "user";
  userId?: string;
  role?: string;
}

let cachedAccessToken: CachedAccessToken | null = null;
const fcmCircuit = new FcmCircuitBreaker(3, 60_000);

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
): Promise<VerifiedCaller | null> {
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

async function getGoogleFcmAccessToken(
  clientEmail: string,
  privateKeyPem: string
): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAtMs - 60_000 > now) {
    return cachedAccessToken.token;
  }

  const assertion = await createGoogleServiceAccountJwt(clientEmail, privateKeyPem);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Google OAuth token exchange failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("Google OAuth response did not include an access_token.");
  }

  const ttlMs = Math.max(300, Number(data.expires_in || 3600)) * 1000;
  cachedAccessToken = {
    token: data.access_token,
    expiresAtMs: now + ttlMs,
  };
  return data.access_token;
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

  let body: {
    mode?: "drain" | "retry" | "test-self";
    queueId?: string;
    limit?: number;
  } = {};
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

  const saConfig = parseServiceAccountConfig({
    FCM_PROJECT_ID: Deno.env.get("FCM_PROJECT_ID"),
    FCM_CLIENT_EMAIL: Deno.env.get("FCM_CLIENT_EMAIL"),
    FCM_PRIVATE_KEY: Deno.env.get("FCM_PRIVATE_KEY"),
    FCM_SERVICE_ACCOUNT_JSON: Deno.env.get("FCM_SERVICE_ACCOUNT_JSON"),
  });

  if (!saConfig.configured) {
    return jsonResponse({
      ok: true,
      configured: false,
      dispatched: 0,
      sent: 0,
      failed: 0,
      deferred: 0,
      message:
        "FCM service account secrets (FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY) are not configured yet; notifications remain queued safely.",
    });
  }

  if (!fcmCircuit.canExecute()) {
    return jsonResponse(
      {
        ok: false,
        configured: true,
        circuitOpen: true,
        retryAfterMs: fcmCircuit.remainingCooldownMs(),
        error: "FCM upstream circuit breaker is temporarily open; queued items will retry shortly.",
      },
      503
    );
  }

  let accessToken: string;
  try {
    accessToken = await getGoogleFcmAccessToken(saConfig.clientEmail, saConfig.privateKeyPem);
  } catch (err) {
    fcmCircuit.recordFailure();
    return jsonResponse(
      {
        ok: false,
        configured: true,
        error: err instanceof Error ? err.message : "Failed to mint FCM OAuth token",
      },
      502
    );
  }

  const requestedLimit = Number(body.limit || (isAdminOrService ? 25 : 10));
  const safeLimit = Math.max(1, Math.min(isAdminOrService ? 50 : 10, requestedLimit));
  const targetQueueId =
    isAdminOrService && typeof body.queueId === "string" && body.queueId.trim() ? body.queueId.trim() : null;

  const workerId = `edge-${crypto.randomUUID().slice(0, 8)}`;
  let items: LeasedQueueItem[] = [];
  try {
    const leased = await rpcService<LeasedQueueItem[] | null>(
      supabaseUrl,
      serviceRoleKey,
      "fcm_lease_queue_batch",
      {
        p_limit: safeLimit,
        p_worker_id: workerId,
        p_queue_id: targetQueueId,
      }
    );
    items = Array.isArray(leased) ? leased : [];
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        configured: true,
        error: err instanceof Error ? err.message : "Failed to lease FCM queue batch",
      },
      500
    );
  }

  let sentItems = 0;
  let failedItems = 0;
  let requeuedItems = 0;
  let devicesDelivered = 0;
  let devicesUnregistered = 0;

  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(saConfig.projectId)}/messages:send`;

  for (const item of items) {
    const devices = Array.isArray(item.devices) ? item.devices.filter((d) => d?.fcmToken) : [];

    if (devices.length === 0) {
      failedItems += 1;
      await rpcService(supabaseUrl, serviceRoleKey, "fcm_complete_queue_item", {
        p_queue_id: item.id,
        p_status: "Failed",
        p_provider_message_id: null,
        p_last_error: "No active FCM device token registered for recipient or notification preference disabled.",
        p_next_attempt_at: null,
        p_attempts_json: [
          {
            deviceId: null,
            userId: item.recipientUserId || null,
            status: "skipped",
            errorCode: "NO_ACTIVE_DEVICE",
            errorMessage: "No active registered FCM device matched recipient preferences.",
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

    for (let i = 0; i < devices.length; i += 10) {
      const chunk = devices.slice(i, i + 10);
      const settled = await Promise.all(
        chunk.map(async (device) => {
          const payload = buildFcmHttpV1Payload(item, device);
          try {
            const res = await fetch(endpoint, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(8000),
            });

            if (res.ok) {
              const okJson = (await res.json().catch(() => ({}))) as { name?: string };
              fcmCircuit.recordSuccess();
              return {
                deviceId: device.deviceId,
                userId: device.userId,
                status: "sent",
                providerMessageId: okJson?.name || null,
              };
            }

            const errBody = await res.text().catch(() => "");
            const classified = classifyFcmErrorResponse(res.status, errBody);
            if (classified.outcome === "auth") {
              cachedAccessToken = null;
            }
            if (classified.tripCircuit) {
              fcmCircuit.recordFailure();
            }
            return {
              deviceId: device.deviceId,
              userId: device.userId,
              status: classified.outcome === "unregistered" || classified.outcome === "invalid" ? "unregistered" : "failed",
              transient: classified.outcome === "transient" || classified.outcome === "auth",
              errorCode: classified.code,
              errorMessage: classified.message,
            };
          } catch (err) {
            fcmCircuit.recordFailure();
            return {
              deviceId: device.deviceId,
              userId: device.userId,
              status: "failed",
              transient: true,
              errorCode: "NETWORK_ERROR",
              errorMessage: err instanceof Error ? err.message : "Network error contacting FCM",
            };
          }
        })
      );

      for (const result of settled) {
        if (result.status === "sent") {
          itemSentCount += 1;
          devicesDelivered += 1;
          if (!firstMessageId && result.providerMessageId) {
            firstMessageId = result.providerMessageId;
          }
        } else {
          if (result.status === "unregistered") devicesUnregistered += 1;
          if (result.transient) hasTransientFailure = true;
          if (!firstError && result.errorMessage) {
            firstError = `${result.errorCode || "FCM_ERROR"}: ${result.errorMessage}`;
          }
        }
        attemptsJson.push({
          deviceId: result.deviceId,
          userId: result.userId,
          status: result.status,
          providerMessageId: result.providerMessageId || null,
          errorCode: result.errorCode || null,
          errorMessage: result.errorMessage || null,
        });
      }
    }

    let nextStatus: "Sent" | "Queued" | "Failed" = "Failed";
    let nextAttemptAt: string | null = null;
    if (itemSentCount > 0) {
      nextStatus = "Sent";
      sentItems += 1;
    } else if (hasTransientFailure && Number(item.attempts || 1) < 5) {
      nextStatus = "Queued";
      requeuedItems += 1;
      const delaySec = computeRetryDelaySeconds(item.attempts || 1, Math.random() * 0.3 - 0.15);
      nextAttemptAt = new Date(Date.now() + delaySec * 1000).toISOString();
    } else {
      nextStatus = "Failed";
      failedItems += 1;
    }

    await rpcService(supabaseUrl, serviceRoleKey, "fcm_complete_queue_item", {
      p_queue_id: item.id,
      p_status: nextStatus,
      p_provider_message_id: firstMessageId,
      p_last_error: nextStatus === "Sent" ? null : firstError || "FCM delivery failed",
      p_next_attempt_at: nextAttemptAt,
      p_attempts_json: attemptsJson,
    });
  }

  return jsonResponse({
    ok: true,
    configured: true,
    dispatched: items.length,
    sent: sentItems,
    requeued: requeuedItems,
    failed: failedItems,
    devicesDelivered,
    devicesUnregistered,
  });
});
