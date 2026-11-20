import assert from "node:assert/strict";
import test from "node:test";

process.env.EXPO_PUBLIC_SUPABASE_URL = "https://demo.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

const { checkEmailVerification, registerInnovator, resendVerificationEmail, signInInnovator } = await import("../mobile/auth.ts");
const email = "test@example.invalid";
const password = "sample-password";
const token = "synthetic-token";
const identity = { id: "synthetic-id", email_confirmed_at: "2026-11-20T00:00:00Z", is_anonymous: false };

test("mobile signup requires email confirmation and discards an unexpected session", async (t) => {
  const send = t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    if (url.endsWith("/logout?scope=local")) {
      assert.equal((options.headers as Record<string, string>).Authorization, "Bearer " + token);
      return new Response(null, { status: 204 });
    }
    const request = new URL(url);
    assert.equal(request.pathname, "/auth/v1/signup");
    assert.match(request.searchParams.get("redirect_to") ?? "", /\/verify-email\/$/);
    assert.deepEqual(JSON.parse(String(options.body)).data, { full_name: "Test Innovator" });
    return send.mock.callCount() === 0
      ? Response.json({ id: "pending-user" })
      : Response.json({ access_token: token });
  });

  assert.deepEqual(await registerInnovator("Test Innovator", email, password), { status: "pending" });
  assert.equal((await registerInnovator("Test Innovator", email, password)).status, "error");
  assert.equal(send.mock.callCount(), 3);
});

test("mobile sign-in requires token expiry, verified identity and an active role", async (t) => {
  let expiresIn: number | undefined;
  let profileStatus = "active";
  let role = "innovator";
  let user = { ...identity, email_confirmed_at: "" };
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    const request = new URL(url);
    paths.push(request.pathname);
    if (request.pathname === "/auth/v1/token") {
      return Response.json({ access_token: token, expires_in: expiresIn, refresh_token: "unused" });
    }
    assert.equal((options.headers as Record<string, string>).Authorization, "Bearer " + token);
    if (request.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
    if (request.pathname === "/auth/v1/user") return Response.json(user);
    assert.equal(request.pathname, "/rest/v1/profiles");
    assert.equal(request.searchParams.get("id"), "eq.synthetic-id");
    return Response.json([{ full_name: "Test Innovator", account_role: role, account_status: profileStatus }]);
  });

  assert.equal((await signInInnovator(email, password)).status, "error");
  assert.deepEqual(paths.splice(0), ["/auth/v1/token", "/auth/v1/logout"]);
  expiresIn = 120;
  assert.equal((await signInInnovator(email, password)).status, "error");
  assert.deepEqual(paths.splice(0), ["/auth/v1/token", "/auth/v1/user", "/auth/v1/logout"]);
  user = identity;
  profileStatus = "suspended";
  assert.equal((await signInInnovator(email, password)).status, "error");
  assert.equal(paths.at(-1), "/auth/v1/logout");
  profileStatus = "active";
  const result = await signInInnovator(email, password);
  assert.equal(result.status, "signed-in");
  if (result.status === "signed-in") {
    assert.equal(result.account.token, token);
    assert.ok(result.account.expiresAt > Date.now());
    assert.equal(Object.hasOwn(result.account, "refresh_token"), false);
  }
  role = "admin";
  const admin = await signInInnovator(email, password);
  assert.equal(admin.status, "signed-in");
  if (admin.status === "signed-in") assert.equal(admin.account.role, "admin");
  role = "unknown";
  assert.equal((await signInInnovator(email, password)).status, "error");
});

test("mobile rate limits use the provider retry deadline", async (t) => {
  const now = Date.now();
  t.mock.method(globalThis, "fetch", async () => Response.json(
    { code: "over_request_rate_limit" }, { status: 429, headers: { "Retry-After": "45" } },
  ));
  const result = await signInInnovator(email, password);
  assert.equal(result.status, "error");
  if (result.status === "error") {
    assert.ok(result.retryAt && result.retryAt >= now + 45000 && result.retryAt < now + 47000);
  }
});

test("mobile verification checks Supabase before opening the signed-in home", async (t) => {
  let confirmed = false;
  const send = t.mock.method(globalThis, "fetch", async (url: string) => {
    const { pathname } = new URL(url);
    if (pathname === "/auth/v1/token") {
      return confirmed
        ? Response.json({ access_token: token, expires_in: 600 })
        : Response.json({ error_code: "email_not_confirmed" }, { status: 400 });
    }
    if (pathname === "/auth/v1/user") return Response.json(identity);
    assert.equal(pathname, "/rest/v1/profiles");
    return Response.json([{ full_name: "Test Innovator", account_role: "innovator", account_status: "active" }]);
  });

  const unverified = await checkEmailVerification(email, password);
  assert.equal(unverified.status, "error");
  if (unverified.status === "error") assert.match(unverified.message, /still unverified/);
  assert.equal(send.mock.callCount(), 1);

  confirmed = true;
  assert.equal((await checkEmailVerification(email, password)).status, "signed-in");
  assert.equal(send.mock.callCount(), 4);
});

test("mobile resends only the signup confirmation and handles the provider cooldown", async (t) => {
  let allowed = true;
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    const request = new URL(url);
    assert.equal(request.pathname, "/auth/v1/resend");
    assert.match(request.searchParams.get("redirect_to") ?? "", /\/verify-email\/$/);
    assert.deepEqual(JSON.parse(String(options.body)), { email, type: "signup" });
    return allowed
      ? Response.json({})
      : Response.json({ code: "over_email_send_rate_limit" }, { status: 429, headers: { "Retry-After": "120" } });
  });

  assert.deepEqual(await resendVerificationEmail(email), { status: "sent" });
  allowed = false;
  const started = Date.now();
  const result = await resendVerificationEmail(email);
  assert.equal(result.status, "error");
  if (result.status === "error") assert.ok(result.retryAt && result.retryAt >= started + 120_000);
});

