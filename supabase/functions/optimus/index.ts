import {
  buildOptimusSystemInstruction,
  buildOptimusTurnInput,
  classifyDeterministicRules,
  extractTextFromInteractionPayload,
  mergeOptimusDecision,
  OPTIMUS_RESPONSE_SCHEMA,
  parseJsonDecision,
  type OptimusDbContext,
  type OptimusStructuredDecision,
} from "./knowledge.ts";

const ALLOWED_EXACT_ORIGINS = new Set([
  "https://ceda-innovation-portal.vercel.app",
  "https://ceda.co.bw",
  "https://www.ceda.co.bw",
]);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  if (ALLOWED_EXACT_ORIGINS.has(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return true;
  const extra = Deno.env.get("PORTAL_ALLOWED_ORIGINS") || "";
  if (extra) {
    const extras = extra.split(",").map((s) => s.trim()).filter(Boolean);
    if (extras.includes(origin)) return true;
  }
  return false;
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin && isAllowedOrigin(origin) ? origin : "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

// Lightweight per-isolate circuit breaker for upstream Gemini API calls
let geminiConsecutiveFailures = 0;
let geminiCircuitOpenUntil = 0;

const TRANSIENT_FAILOVER_STATUSES = new Set([429, 500, 502, 503, 504]);

async function callSingleGeminiModel(
  apiKey: string,
  model: string,
  systemInstruction: string,
  turnInput: string,
  timeoutMs: number
): Promise<{
  ok: boolean;
  retryable: boolean;
  status: number;
  decision: Partial<OptimusStructuredDecision> | null;
  interactionId: string | null;
}> {
  const endpoint = "https://generativelanguage.googleapis.com/v1/interactions";
  const buildBody = (withSchema: boolean) => ({
    model,
    system_instruction: systemInstruction,
    input: turnInput,
    store: false,
    ...(withSchema
      ? {
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: OPTIMUS_RESPONSE_SCHEMA,
          },
        }
      : {}),
  });

  let response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
      "Api-Revision": "2026-05-20",
    },
    body: JSON.stringify(buildBody(true)),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (response.status === 400) {
    // Retry without response_format in case the configured model/revision expects prompt-guided JSON
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
        "Api-Revision": "2026-05-20",
      },
      body: JSON.stringify(buildBody(false)),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  if (!response.ok) {
    return {
      ok: false,
      retryable: TRANSIENT_FAILOVER_STATUSES.has(response.status),
      status: response.status,
      decision: null,
      interactionId: null,
    };
  }

  const payload = await response.json();
  const rawText = extractTextFromInteractionPayload(payload);
  const parsed = parseJsonDecision(rawText);
  const interactionId =
    payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).id === "string"
      ? String((payload as Record<string, unknown>).id)
      : null;

  return {
    ok: Boolean(parsed),
    retryable: !parsed,
    status: response.status,
    decision: parsed,
    interactionId,
  };
}

async function callGeminiInteractions(
  apiKey: string,
  primaryModel: string,
  systemInstruction: string,
  turnInput: string
): Promise<{
  decision: Partial<OptimusStructuredDecision> | null;
  interactionId: string | null;
  provider: string;
}> {
  const now = Date.now();
  if (now < geminiCircuitOpenUntil) {
    return { decision: null, interactionId: null, provider: "circuit-breaker-fallback" };
  }

  const startedAt = Date.now();
  const fallbackChain = Array.from(
    new Set([primaryModel, "gemini-4-hydrogen", "gemini-3.5-flash"].filter(Boolean))
  );
  let lastProvider = "fallback-http-503";

  for (const candidateModel of fallbackChain) {
    if (Date.now() - startedAt > 10_500) break;
    try {
      const attempt = await callSingleGeminiModel(
        apiKey,
        candidateModel,
        systemInstruction,
        turnInput,
        7500
      );
      if (attempt.ok && attempt.decision) {
        geminiConsecutiveFailures = 0;
        geminiCircuitOpenUntil = 0;
        return {
          decision: attempt.decision,
          interactionId: attempt.interactionId,
          provider: `gemini:${candidateModel}`,
        };
      }
      lastProvider = attempt.status === 200 ? "fallback-unparsed" : `fallback-http-${attempt.status}`;
      if (!attempt.retryable) break;
    } catch {
      lastProvider = "fallback-timeout";
    }
  }

  geminiConsecutiveFailures += 1;
  if (geminiConsecutiveFailures >= 3) {
    geminiCircuitOpenUntil = Date.now() + 60_000;
  }
  return { decision: null, interactionId: null, provider: lastProvider };
}

async function callSupabaseRpc<T>(
  supabaseUrl: string,
  anonKey: string,
  authHeader: string,
  fnName: string,
  args: Record<string, unknown>
): Promise<{ data: T | null; error: string | null; status: number }> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: authHeader,
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10000),
  });

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    const message =
      parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).message === "string"
        ? String((parsed as Record<string, unknown>).message)
        : `Database RPC ${fnName} failed (${res.status}).`;
    return { data: null, error: message, status: res.status };
  }

  return { data: parsed as T, error: null, status: res.status };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return new Response("Forbidden origin", { status: 403 });
  }
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405, corsHeaders);
  }

  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "Authentication required." }, 401, corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || req.headers.get("apikey") || "";
  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: "Supabase environment is not configured." }, 500, corsHeaders);
  }

  let body: { question?: unknown; contextSection?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload." }, 400, corsHeaders);
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const contextSection =
    typeof body.contextSection === "string" && body.contextSection.trim()
      ? body.contextSection.trim()
      : "general";

  if (question.length < 3) {
    return jsonResponse({ error: "Please enter a slightly longer question (at least 3 characters)." }, 400, corsHeaders);
  }
  if (question.length > 1000) {
    return jsonResponse({ error: "Please keep your Optimus Prime question under 1,000 characters." }, 400, corsHeaders);
  }

  // 1. Fetch caller's grounded, non-confidential portal & application context via RLS/RPC
  const ctxRes = await callSupabaseRpc<OptimusDbContext>(
    supabaseUrl,
    anonKey,
    authHeader,
    "innovator_optimus_context",
    {}
  );
  if (ctxRes.error || !ctxRes.data) {
    return jsonResponse(
      { error: ctxRes.error || "Unable to load innovator assistant context." },
      ctxRes.status >= 400 ? ctxRes.status : 403,
      corsHeaders
    );
  }

  const dbContext = ctxRes.data;
  const rules = classifyDeterministicRules(question, contextSection, dbContext);

  let aiDecision: Partial<OptimusStructuredDecision> | null = null;
  let aiProvider = "controlled-fallback";
  let interactionId: string | null = null;

  // 2. Hard safety boundary short-circuits immediately before calling any external model
  if (rules.hardSafety) {
    aiProvider = "safety-boundary";
  } else {
    const geminiApiKey = (Deno.env.get("GEMINI_API_KEY") || "").trim();
    const geminiModel = (Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash").trim();
    if (geminiApiKey) {
      const systemInstruction = buildOptimusSystemInstruction(dbContext);
      const turnInput = buildOptimusTurnInput(question, contextSection, dbContext);
      const geminiResult = await callGeminiInteractions(
        geminiApiKey,
        geminiModel,
        systemInstruction,
        turnInput
      );
      aiDecision = geminiResult.decision;
      aiProvider = geminiResult.provider;
      interactionId = geminiResult.interactionId;
    } else {
      aiProvider = "controlled-fallback-no-key";
    }
  }

  // 3. Merge Gemini intelligence with strict CEDA controlled bounds & auto-escalation rules
  const finalDecision = mergeOptimusDecision(aiDecision, question, contextSection, dbContext);
  const autoEscalate = finalDecision.escalationMode === "auto";

  // 4. Persist interaction + auto-create/append live CEDA Support ticket if auto-escalated
  const recordRes = await callSupabaseRpc<Record<string, unknown>>(
    supabaseUrl,
    anonKey,
    authHeader,
    "innovator_record_optimus_turn",
    {
      p_question: question,
      p_answer: finalDecision.answer,
      p_topic: finalDecision.topic,
      p_source_article: finalDecision.sourceArticle,
      p_auto_escalate: autoEscalate,
      p_escalation_reason: finalDecision.escalationReason || null,
      p_escalation_category: finalDecision.escalationCategory || "support",
      p_escalation_priority: finalDecision.escalationPriority || "Normal",
      p_related_app_ref: finalDecision.relatedAppRef || null,
      p_ai_provider: aiProvider,
      p_interaction_id: interactionId,
    }
  );

  if (recordRes.error || !recordRes.data) {
    return jsonResponse(
      { error: recordRes.error || "Unable to save Optimus Prime conversation turn." },
      recordRes.status >= 400 ? recordRes.status : 500,
      corsHeaders
    );
  }

  return jsonResponse(
    {
      ...recordRes.data,
      followUpChips: finalDecision.followUpChips,
      escalationMode: finalDecision.escalationMode,
      aiProvider,
    },
    200,
    corsHeaders
  );
});
