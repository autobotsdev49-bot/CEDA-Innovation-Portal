import assert from "node:assert/strict";
import test from "node:test";

process.env.EXPO_PUBLIC_SUPABASE_URL = "https://demo.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

const {
  callAssessorRpc,
  checkEmailVerification,
  registerInnovator,
  resendVerificationEmail,
  signInInnovator,
  readAdminRecords,
  verifyAdminAuthenticator,
  inviteAdminUser,
  updateAdminUserAccess,
  createAdminUser,
  validAdminPassword,
  readAdminContent,
  saveAdminContent,
  saveAdminNotification,
  readAdminConfigurations,
  saveAdminConfiguration,
  invalidateAdminCache,
} = await import("../mobile/auth.ts");
const {
  isStrongAccountPassword,
  isTokenAal2,
  prepareTotpEnrollment,
  updateAccountPassword,
  verifyTotpFactorCode,
} = await import("../mobile/securityApi.ts");
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
  assert.equal(validAdminPassword("StrongPass1!"), true);
  assert.equal(validAdminPassword("Strong1!" + "x".repeat(65)), false);
  assert.equal(validAdminPassword("longbutnocomplexity"), false);
  await assert.rejects(createAdminUser(account, { ...input, password: "short" }), /12-72/);
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
  role = "assessor";
  const assessor = await signInInnovator(email, password);
  assert.equal(assessor.status, "signed-in");
  if (assessor.status === "signed-in") assert.equal(assessor.account.role, "assessor");
  role = "support";
  const support = await signInInnovator(email, password);
  assert.equal(support.status, "signed-in");
  if (support.status === "signed-in") assert.equal(support.account.role, "support");
  role = "unknown";
  assert.equal((await signInInnovator(email, password)).status, "error");
});

test("mobile assessment requests require an active assessor session and carry the current round", async (t) => {
  const account = { token, name: "Assessor", role: "assessor" as const, expiresAt: Date.now() + 60_000 };
  const command = { p_case_id: "case-id", p_round_id: "round-id", p_action: "vote", p_data: { choice: "approve" } };
  const send = t.mock.method(globalThis, "fetch", async (address: string, options: RequestInit) => {
    assert.equal(new URL(address).pathname, "/rest/v1/rpc/assessor_action");
    assert.equal(options.method, "POST");
    assert.equal((options.headers as Record<string, string>).Authorization, `Bearer ${token}`);
    assert.deepEqual(JSON.parse(String(options.body)), command);
    return Response.json({ message: "The assessment round changed. Refresh and try again." }, { status: 400 });
  });
  await assert.rejects(callAssessorRpc({ ...account, role: "innovator" }, "assessor_action", command), /session has expired/);
  await assert.rejects(callAssessorRpc({ ...account, expiresAt: Date.now() - 1000 }, "assessor_action", command), /session has expired/);
  assert.equal(send.mock.callCount(), 0);
  await assert.rejects(callAssessorRpc(account, "assessor_action", command), /assessment round changed/);
  assert.equal(send.mock.callCount(), 1);
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

test("mobile admin creation accepts 6-digit temporary admin_code and rejects malformed codes before network calls", async (t) => {
  const account = { token, name: "Admin", role: "admin" as const, expiresAt: Date.now() + 60_000 };
  const base = { address: "staff@example.invalid", display_name: "Synthetic Staff", new_role: "assessor" as const, lead: false, sectors: [], reason: "Test onboarding", password: "Synthetic-password-73!" };
  const send = t.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    assert.equal(JSON.parse(String(options.body)).admin_code, "230701");
    return Response.json({ status: "created", id: "created-with-code" });
  });
  await assert.rejects(createAdminUser(account, { ...base, admin_code: "123" }), /6-digit/);
  assert.equal(send.mock.callCount(), 0);
  await createAdminUser(account, { ...base, admin_code: " 230701 " });
  assert.equal(send.mock.callCount(), 1);
});

test("mobile admin governance RPCs use RAM cache with explicit invalidation on saves", async (t) => {
  invalidateAdminCache();
  const account = { token, name: "Admin", role: "admin" as const, expiresAt: Date.now() + 60_000 };
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    const path = new URL(url).pathname;
    calls.push(path);
    assert.equal((options.headers as Record<string, string>).Authorization, `Bearer ${token}`);
    if (path === "/rest/v1/rpc/admin_content_list") {
      return Response.json([{ id: "c-1", title: "How to apply", summary: "Guide", body: "Full guide text.", kind: "Public pages", audience: "Public website", stage: "Published", updated: "2026-11-22" }]);
    }
    if (path === "/rest/v1/rpc/admin_save_content") {
      const body = JSON.parse(String(options.body));
      assert.equal(body.content_stage, "Published");
      return Response.json([{ id: "c-2", title: body.content_title, summary: "New", body: body.content_body, kind: body.content_kind, audience: "Public website", stage: "Published", updated: "2026-11-22" }]);
    }
    if (path === "/rest/v1/rpc/admin_save_notification") {
      return Response.json({ templates: [{ id: "tpl-1", title: "Notice", kind: "Announcement", channel: "In-app + Email", audience: "Innovator", status: "Enabled", message: "Updated template body text" }], inbox: [] });
    }
    if (path === "/rest/v1/rpc/admin_get_configurations") {
      return Response.json({ optimus_guidance: { payload: { tone: "Warm and supportive" }, version: 2 } });
    }
    if (path === "/rest/v1/rpc/admin_optimus_overview") {
      return Response.json({ totalInteractions: 12, escalatedCount: 1, helpfulCount: 10, unhelpfulCount: 2, topics: [] });
    }
    assert.equal(path, "/rest/v1/rpc/admin_save_configuration");
    return Response.json({ portal_policies: { payload: { area: "Submission & evidence rules", proposal: "Test change" }, version: 3 } });
  });

  const first = await readAdminContent(account);
  const second = await readAdminContent(account);
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.deepEqual(calls, ["/rest/v1/rpc/admin_content_list"]);

  const updated = await saveAdminContent(account, {
    content_kind: "FAQs",
    content_title: "FAQ update",
    content_body: "Detailed approved FAQ body for innovators.",
    reason: "Reviewed with CEDA team",
    content_stage: "Published",
  });
  assert.equal(updated[0].id, "c-2");
  const notif = await saveAdminNotification(account, {
    entry_kind: "Announcement",
    entry_title: "Cycle open",
    entry_message: "Submissions are now open across all published sectors.",
  });
  assert.equal(notif.templates.length, 1);
  const cfg = await readAdminConfigurations(account);
  assert.equal(cfg.configs.optimus_guidance.payload.tone, "Warm and supportive");
  assert.equal(cfg.optimusOverview?.totalInteractions, 12);
  const savedCfg = await saveAdminConfiguration(account, "portal_policies", { area: "Submission & evidence rules", proposal: "Test change" }, "Updated policy rule");
  assert.equal(savedCfg.portal_policies.version, 3);
  invalidateAdminCache();
});

test("mobile shared securityApi handles password rules, TOTP cleanup/enrollment, verification, and AAL2 decoding", async (t) => {
  const aal1Jwt = `hdr.${Buffer.from(JSON.stringify({ aal: "aal1" })).toString("base64url")}.sig`;
  const aal2Jwt = `hdr.${Buffer.from(JSON.stringify({ aal: "aal2" })).toString("base64url")}.sig`;
  assert.equal(isTokenAal2(aal1Jwt), false);
  assert.equal(isTokenAal2(aal2Jwt), true);
  assert.equal(isStrongAccountPassword("StrongPass1!"), true);
  assert.equal(isStrongAccountPassword("weak"), false);

  const account = { token: aal1Jwt, name: "Assessor", role: "assessor" as const, expiresAt: Date.now() + 120_000 };
  const requests: Array<{ method: string; path: string }> = [];
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    const path = new URL(url).pathname;
    const method = options.method || "GET";
    requests.push({ method, path });
    if (path === "/auth/v1/user" && method === "GET") {
      return Response.json({ factors: [{ id: "stale-unverified", factor_type: "totp", status: "unverified" }] });
    }
    if (path === "/auth/v1/factors/stale-unverified" && method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    if (path === "/auth/v1/factors" && method === "POST") {
      return Response.json({ id: "totp-new", totp: { qr_code: "<svg/>", secret: "ABCDEFGH12345678" } });
    }
    if (path === "/auth/v1/factors/totp-new/challenge") {
      return Response.json({ id: "chal-1" });
    }
    if (path === "/auth/v1/factors/totp-new/verify") {
      return Response.json({ access_token: aal2Jwt, expires_in: 3600 });
    }
    assert.equal(path, "/auth/v1/user");
    assert.equal(method, "PUT");
    return Response.json({ id: "user-1" });
  });

  const prep = await prepareTotpEnrollment(account, "CEDA Assessor Mobile");
  assert.equal(prep.alreadyVerified, false);
  assert.equal(prep.factorId, "totp-new");
  assert.equal(prep.formattedSecret, "ABCD EFGH 1234 5678");

  const upgraded = await verifyTotpFactorCode(account, prep.factorId, "654321");
  assert.equal(isTokenAal2(upgraded.token), true);
  assert.equal(upgraded.expiresAt, account.expiresAt);

  await updateAccountPassword(upgraded, "StrongPass1!");
  assert.deepEqual(requests, [
    { method: "GET", path: "/auth/v1/user" },
    { method: "DELETE", path: "/auth/v1/factors/stale-unverified" },
    { method: "POST", path: "/auth/v1/factors" },
    { method: "POST", path: "/auth/v1/factors/totp-new/challenge" },
    { method: "POST", path: "/auth/v1/factors/totp-new/verify" },
    { method: "PUT", path: "/auth/v1/user" },
  ]);
});

