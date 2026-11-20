import assert from "node:assert/strict";
import test from "node:test";

process.env.EXPO_PUBLIC_SUPABASE_URL = "https://demo.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

const { checkEmailVerification, registerInnovator, resendVerificationEmail, signInInnovator, readAdminRecords, verifyAdminAuthenticator, inviteAdminUser, updateAdminUserAccess, createAdminUser, validAdminPassword } = await import("../mobile/auth.ts");
const email = "test@example.invalid";
const password = "sample-password";
const token = "synthetic-token";
const identity = { id: "synthetic-id", email_confirmed_at: "2026-11-20T00:00:00Z", is_anonymous: false };

test("native admin creation requires a password and sends it only to the protected creation endpoint", async (t) => {
  const account = { token, name: "Admin", role: "admin" as const, expiresAt: Date.now() + 60_000 };
  const input = { address: "staff@example.invalid", display_name: "Synthetic Staff", new_role: "support" as const, lead: false, sectors: [], reason: "Test onboarding", password: "Synthetic-password-73" };
  const send = t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(new URL(url).pathname, "/functions/v1/admincreate");
    assert.deepEqual(JSON.parse(String(options.body)), input);
    assert.equal((options.headers as Record<string, string>).Authorization, "Bearer " + token);
    return Response.json({ status: "created", id: "created-test" });
  });
  assert.equal(validAdminPassword("界".repeat(24)), true);
  assert.equal(validAdminPassword("界".repeat(25)), false);
  await assert.rejects(createAdminUser(account, { ...input, password: "short" }), /at least 8/);
  assert.equal(send.mock.callCount(), 0);
  await createAdminUser(account, input);
  assert.equal(send.mock.callCount(), 1);
});

test("mobile MFA verifies an existing TOTP factor and does not extend the account lifetime", async (t) => {
  const paths: string[] = [];
  const account = { token, name: "Admin", role: "admin" as const, expiresAt: Date.now() + 60_000 };
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    const path = new URL(url).pathname; paths.push(path);
    assert.equal((options.headers as Record<string, string>).Authorization, "Bearer " + token);
    if (path === "/auth/v1/user") return Response.json({ factors: [{ id: "pending", factor_type: "totp", status: "unverified" }, { id: "factor-test", factor_type: "totp", status: "verified" }] });
    if (path.endsWith("/challenge")) return Response.json({ id: "challenge-test" });
    assert.deepEqual(JSON.parse(String(options.body)), { challenge_id: "challenge-test", code: "123456" });
    return Response.json({ access_token: "synthetic-aal2-token", expires_in: 3600 });
  });
  const verified = await verifyAdminAuthenticator(account, "123456");
  assert.equal(verified.token, "synthetic-aal2-token");
  assert.equal(verified.expiresAt, account.expiresAt);
  assert.deepEqual(paths, ["/auth/v1/user", "/auth/v1/factors/factor-test/challenge", "/auth/v1/factors/factor-test/verify"]);
});

test("mobile user mutations use the invitation function and audited role RPC with the current token", async (t) => {
  const account = { token: "synthetic-aal2-token", name: "Admin", role: "admin" as const, expiresAt: Date.now() + 60_000 };
  const access = { new_role: "assessor" as const, lead: true, sectors: ["sector-test"], reason: "  Approved staff assignment  " };
  const paths: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    const path = new URL(url).pathname; paths.push(path);
    assert.equal((options.headers as Record<string, string>).Authorization, "Bearer synthetic-aal2-token");
    const body = JSON.parse(String(options.body));
    assert.equal(body.reason, "Approved staff assignment");
    assert.equal(body.new_role, "assessor"); assert.equal(body.lead, true);
    assert.deepEqual(body.sectors, ["sector-test"]);
    if (path === "/functions/v1/admininvite") {
      assert.equal(body.address, "staff@example.invalid"); assert.equal(body.display_name, "New Staff");
      assert.equal(body.password, undefined);
      return Response.json({ status: "sent" });
    }
    assert.equal(body.target_id, "target-test");
    return new Response(null, { status: 204 });
  });
  await inviteAdminUser(account, { ...access, address: " STAFF@example.invalid ", display_name: " New Staff " });
  await updateAdminUserAccess(account, "target-test", access);
  assert.deepEqual(paths, ["/functions/v1/admininvite", "/rest/v1/rpc/admin_assign_role"]);
});

test("mobile privileged operations reject bad sessions, invalid grants, missing factors and server denial", async (t) => {
  const account = { token, name: "Admin", role: "admin" as const, expiresAt: Date.now() + 60_000 };
  const access = { new_role: "innovator" as const, lead: false, sectors: [], reason: "Account correction" };
  let denied = false;
  const send = t.mock.method(globalThis, "fetch", async () => denied ? Response.json({ code: "42501" }, { status: 403 }) : Response.json({ factors: [] }));
  await assert.rejects(updateAdminUserAccess({ ...account, role: "innovator" }, "test", access), /session has expired/);
  await assert.rejects(inviteAdminUser({ ...account, expiresAt: 0 }, { ...access, address: "staff@example.invalid", display_name: "Test" }), /session has expired/);
  await assert.rejects(updateAdminUserAccess(account, "test", { ...access, lead: true }), /valid role/);
  await assert.rejects(verifyAdminAuthenticator(account, "123"), /six-digit/);
  assert.equal(send.mock.callCount(), 0);
  await assert.rejects(verifyAdminAuthenticator(account, "123456"), /Set up your authenticator/);
  assert.equal(send.mock.callCount(), 1);
  denied = true;
  await assert.rejects(updateAdminUserAccess(account, "test", access), /authenticator verification/);
});

test("mobile invitations report uncertain delivery rather than claiming success", async (t) => {
  const account = { token, name: "Admin", role: "admin" as const, expiresAt: Date.now() + 60_000 };
  const input = { new_role: "support" as const, lead: false, sectors: [], reason: "Support staff onboarding", address: "staff@example.invalid", display_name: "New Staff" };
  let networkFailure = false;
  t.mock.method(globalThis, "fetch", async () => { if (networkFailure) throw new TypeError("Network request failed"); return Response.json({ status: "reserved" }, { status: 502 }); });
  await assert.rejects(inviteAdminUser(account, input), /delivery could not be confirmed/);
  networkFailure = true;
  await assert.rejects(inviteAdminUser(account, input), /delivery could not be confirmed/);
});

test("mobile admin reads reject expired or non-admin sessions before fetching", async (t) => {
  const send = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected request"); });
  const account = { token, name: "Test", role: "innovator" as const, expiresAt: Date.now() + 60_000 };
  await assert.rejects(readAdminRecords(account, "users", "", 0), /session has expired/);
  await assert.rejects(readAdminRecords({ ...account, role: "admin", expiresAt: Date.now() - 1000 }, "sectors"), /session has expired/);
  assert.equal(send.mock.callCount(), 0);
});

test("mobile admin directory and sectors use protected RPCs and handle server denial", async (t) => {
  let denied = false;
  const send = t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal((options.headers as Record<string, string>).Authorization, "Bearer " + token);
    assert.equal(options.method, "POST");
    const path = new URL(url).pathname;
    if (path.endsWith("admin_directory")) {
      assert.deepEqual(JSON.parse(String(options.body)), { search_text: "Test", page_number: 2 });
      return denied ? Response.json({ message: "Denied" }, { status: 403 }) : Response.json([{ id: "test-user" }]);
    }
    assert.equal(path, "/rest/v1/rpc/admin_sectors");
    assert.deepEqual(JSON.parse(String(options.body)), {});
    return Response.json([{ id: "test-sector", name: "Health", status: "published" }]);
  });
  const account = { token, name: "Test", role: "admin" as const, expiresAt: Date.now() + 60_000 };
  assert.deepEqual(await readAdminRecords(account, "users", " Test ", 2), [{ id: "test-user" }]);
  assert.equal((await readAdminRecords(account, "sectors"))[0].name, "Health");
  denied = true;
  await assert.rejects(readAdminRecords(account, "users", "Test", 2), /access could not be verified/);
  assert.equal(send.mock.callCount(), 3);
});

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

