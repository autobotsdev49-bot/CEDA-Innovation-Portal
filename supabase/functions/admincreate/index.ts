// Passwords are sent only to Supabase Auth, never to database RPCs or logs.
const origin = Deno.env.get("SUPABASE_URL");
const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
const serverKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const allowedOrigins = new Set(["https://ceda-innovation-portal-nine.vercel.app", "http://localhost:3000", "http://127.0.0.1:3000"]);
Deno.serve(async req => {
  const browserOrigin = req.headers.get("Origin");
  if (browserOrigin && !allowedOrigins.has(browserOrigin)) return new Response(null, { status: 403 });
  const cors = { ...(browserOrigin ? { "Access-Control-Allow-Origin": browserOrigin } : {}), "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store", Vary: "Origin" };
  const reply = (status, message) => Response.json({ message }, { status, headers: cors });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, "POST required");
  if (!origin || !publicKey || !serverKey) return reply(503, "Account creation is not configured.");
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return reply(401, "Sign in required");
  try {
    if (Number(req.headers.get("Content-Length")) > 6000) return reply(400, "Request too large");
    const raw = await req.text();
    if (raw.length > 6000) return reply(400, "Request too large");
    const input = JSON.parse(raw);
    if (!input || typeof input.password !== "string" || input.password.length < 12 || input.password.length > 128 || !/[a-z]/.test(input.password) || !/[A-Z]/.test(input.password) || !/[0-9]/.test(input.password) || !/[^a-zA-Z0-9\s]/.test(input.password)) return reply(400, "Use 12–128 characters with uppercase, lowercase, a number and a symbol.");
    const headers = { apikey: publicKey, Authorization: authorization, "Content-Type": "application/json" };
    const identity = await fetch(origin + "/auth/v1/user", { headers, signal: AbortSignal.timeout(15000) });
    if (!identity.ok) return reply(401, "Sign in required");
    const reservation = { address: input.address, display_name: input.display_name, new_role: input.new_role, lead: input.lead, sectors: input.sectors, reason: input.reason };
    // Existing RPC enforces current active Admin, live session, MFA and role/scope rules.
    const prepared = await fetch(origin + "/rest/v1/rpc/admin_prepare_invitation", { method: "POST", headers, body: JSON.stringify(reservation), signal: AbortSignal.timeout(15000) });
    if (!prepared.ok) {
      const error = await prepared.json().catch(() => ({}));
      return reply(error.code === "42501" ? 403 : 409, error.code === "42501" ? "Administrator access and authenticator verification are required." : "Account or reservation already exists, or the account details are invalid. Check the directory before retrying.");
    }
    // Confirmed staff provisioning consumes only the protected reservation. Client metadata cannot grant roles.
    const created = await fetch(origin + "/auth/v1/admin/users", {
      method: "POST", headers: { apikey: serverKey, Authorization: "Bearer " + serverKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: input.address.trim().toLowerCase(), password: input.password, email_confirm: true, user_metadata: { full_name: input.display_name.trim() } }),
      signal: AbortSignal.timeout(15000),
    });
    if (!created.ok) return reply(502, "Account creation could not be confirmed. Check the directory before retrying; the reservation has been retained.");
    const user = await created.json();
    if (!user.id) return reply(502, "Check the directory to confirm the account before retrying.");
    // Reservation consumption/profile provisioning occur transactionally inside Auth's insert triggers.
    return Response.json({ status: "created", id: user.id }, { status: 201, headers: cors });
  } catch {
    return reply(503, "Account creation could not be confirmed. Check the directory before retrying.");
  }
});
