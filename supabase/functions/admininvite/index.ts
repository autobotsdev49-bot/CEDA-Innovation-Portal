const origin = Deno.env.get("SUPABASE_URL");
const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
const serverKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const portal = "https://ceda-innovation-portal-nine.vercel.app";
const allowedOrigins = new Set([portal, "http://localhost:3000", "http://127.0.0.1:3000"]);

Deno.serve(async req => {
  const browserOrigin = req.headers.get("Origin");
  if (browserOrigin && !allowedOrigins.has(browserOrigin)) return new Response(null, { status: 403 });
  const cors = {
    ...(browserOrigin ? { "Access-Control-Allow-Origin": browserOrigin } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  const reply = (status, data) => Response.json(data, { status, headers: cors });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { message: "POST required" });
  if (!origin || !publicKey || !serverKey) return reply(503, { message: "Invitation service is not configured." });
  if (Number(req.headers.get("Content-Length")) > 5000) return reply(400, { message: "Request too large" });
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return reply(401, { message: "Sign in required" });
  try {
    const headers = { apikey: publicKey, Authorization: authorization, "Content-Type": "application/json" };
    const identity = await fetch(origin + "/auth/v1/user", { headers, signal: AbortSignal.timeout(15000) });
    if (!identity.ok) return reply(401, { message: "Sign in required" });
    const input = await req.text();
    if (input.length > 5000) return reply(400, { message: "Request too large" });
    const body = JSON.parse(input);
    // The database validates the live session, Admin role, MFA, input and sector scope.
    const prepared = await fetch(origin + "/rest/v1/rpc/admin_prepare_invitation", {
      method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    if (!prepared.ok) {
      const error = await prepared.json().catch(() => ({}));
      return reply(error.code === "42501" ? 403 : 400, {
        message: error.code === "42501" ? error.message : "Invitation could not be prepared. Check the directory for an existing account or invitation.",
      });
    }
    const invitation = await prepared.json();
    // Supabase's Admin API uses only the server-side key, after the caller has passed authorization.
    const sent = await fetch(origin + "/auth/v1/invite?redirect_to=" + encodeURIComponent(portal + "/activate/"), {
      method: "POST",
      headers: { apikey: serverKey, Authorization: "Bearer " + serverKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.address.trim().toLowerCase(), data: { full_name: body.display_name.trim() } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!sent.ok) return reply(502, { message: "The invitation was reserved, but email delivery could not be confirmed. Check the provider before retrying.", invitation });
    return reply(200, { invitation, status: "sent" });
  } catch {
    return reply(503, { message: "Invitation service unavailable. Check the user directory and invitation status before retrying." });
  }
});
