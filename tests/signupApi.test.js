import assert from "node:assert/strict";
import test from "node:test";
import { logoutSignup, requestSignup, resendSignup, signInInnovator, signupFieldsReady, verifiedAccountProfile, verifySignup } from "../src/publicSite/assets/signupApi.js";

test("shared web login reads protected roles and public verification remains Innovator scoped", async () => {
  const config = { url: "https://example.supabase.co", key: "sb_publishable_test" };
  let role = "admin";
  const send = async (url) => url.pathname === "/auth/v1/user"
    ? Response.json({ id: "user-id", email_confirmed_at: "2026-11-20", is_anonymous: false })
    : Response.json([{ account_role: role, account_status: "active", full_name: "Test" }]);
  assert.equal((await verifiedAccountProfile(config, "token", send)).account_role, "admin");
  assert.equal(await verifySignup(config, "token", send), false);
  for (const staffRole of ["assessor", "support"]) {
    role = staffRole;
    assert.equal((await verifiedAccountProfile(config, "token", send)).account_role, staffRole);
    assert.equal(await verifySignup(config, "token", send), false);
  }
  role = "unknown";
  assert.equal(await verifiedAccountProfile(config, "token", send), null);
});

test("resend uses the signup confirmation flow and the same callback", async () => {
  const email = "innovator@example.invalid";
  const result = await resendSignup(
    { url: "https://example.supabase.co", key: "sb_publishable_test" },
    email, "https://portal.example/verify-email/",
    async (url, options) => {
      assert.equal(url.pathname, "/auth/v1/resend");
      assert.equal(url.searchParams.get("redirect_to"), "https://portal.example/verify-email/");
      assert.deepEqual(JSON.parse(options.body), { email, type: "signup" });
      return Response.json({});
    },
  );
  assert.equal(result.status, "pending");
});

test("create account is ready only for complete, valid fields and matching passwords", () => {
  const ready = "example-password";
  assert.equal(signupFieldsReady("  ", true, ready, ready), false);
  assert.equal(signupFieldsReady("Example", false, ready, ready), false);
  assert.equal(signupFieldsReady("Example", true, "", ""), false);
  assert.equal(signupFieldsReady("Example", true, ready, "different"), false);
  const tooLong = "é".repeat(37);
  assert.equal(signupFieldsReady("Example", true, tooLong, tooLong), false);
  assert.equal(signupFieldsReady("Example", true, ready, ready), true);
});

const config = { url: "https://example.supabase.co", key: "sb_publishable_test" };
const callback = "https://portal.example/verify-email/";

test("signup requests verification and sends the applicant name without a role", async () => {
  const result = await requestSignup(config, {
    email: "innovator@example.invalid", password: "synthetic-password", fullName: "Test Innovator",
  }, callback, async (url, options) => {
    assert.equal(url.pathname, "/auth/v1/signup");
    assert.equal(url.searchParams.get("redirect_to"), callback);
    assert.equal(options.method, "POST");
    assert.equal(options.headers.apikey, config.key);
    assert.deepEqual(JSON.parse(options.body).data, { full_name: "Test Innovator" });
    return Response.json({ user: { id: "test-id" } });
  });
  assert.equal(result.status, "pending");
});

test("signup distinguishes rate limiting and unexpected automatic confirmation", async () => {
  const signup = { email: "innovator@example.invalid", password: "synthetic-password", fullName: "Test Innovator" };
  const respond = (data, options) => async () => Response.json(data, options);
  assert.deepEqual(await requestSignup(config, signup, callback, respond({}, { status: 429, headers: { "Retry-After": "75" } })),
    { status: "limited", scope: "shared", retryAfterSeconds: 75, estimated: false });
  assert.deepEqual(await requestSignup(config, signup, callback, respond({ msg: "You can only request this after 24 seconds." }, { status: 429 })),
    { status: "limited", scope: "email", retryAfterSeconds: 24, estimated: false });
  assert.deepEqual(await requestSignup(config, signup, callback, respond({ error_code: "over_email_send_rate_limit" }, { status: 429 })),
    { status: "limited", scope: "quota", retryAfterSeconds: 60, estimated: true });
  assert.deepEqual(await requestSignup(config, signup, callback, respond({}, { status: 429 })),
    { status: "limited", scope: "shared", retryAfterSeconds: 300, estimated: true });
  assert.equal((await requestSignup(config, signup, callback, respond({ access_token: "test" }))).status, "confirmation-disabled");
});

test("verification requires a confirmed Auth user and their active innovator profile", async () => {
  const user = { id: "test-id", email_confirmed_at: "2026-11-19T18:00:00Z", is_anonymous: false };
  const send = (profile, authUser = user) => async (url, options) => {
    assert.equal(options.headers.Authorization, "Bearer synthetic-token");
    if (url.pathname === "/auth/v1/user") return Response.json(authUser);
    assert.equal(url.pathname, "/rest/v1/profiles");
    assert.equal(url.searchParams.get("id"), "eq.test-id");
    return Response.json(profile);
  };
  const active = [{ account_role: "innovator", account_status: "active" }];
  assert.equal(await verifySignup(config, "synthetic-token", send(active)), true);
  assert.equal(await verifySignup(config, "synthetic-token", send([])), false);
  assert.equal(await verifySignup(config, "synthetic-token", send(active, { ...user, email_confirmed_at: null })), false);
});

test("logout requests revocation for the current Supabase session", async () => {
  assert.equal(await logoutSignup(config, "synthetic-token", async (url, options) => {
    assert.equal(url.pathname, "/auth/v1/logout");
    assert.equal(url.searchParams.get("scope"), "local");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Bearer synthetic-token");
    return new Response(null, { status: 204 });
  }), true);
  assert.equal(await logoutSignup(config, "synthetic-token", async () => new Response(null, { status: 500 })), false);
});

test("project quota countdown survives reload and does not become a personal cooldown", async () => {
  const previousStorage = globalThis.sessionStorage;
  const now = 10_000;
  const stored = new Map([["ceda.emailCooldown.v2", JSON.stringify([
    ["old@example.invalid", { scope: "quota", estimated: true, deadline: now + 3_600_000 }],
  ])]]);
  globalThis.sessionStorage = {
    getItem: (key) => stored.get(key),
    setItem: (key, value) => stored.set(key, value),
  };
  try {
    const first = await import("../src/publicSite/assets/verificationCooldown.js?initial");
    assert.equal(first.cooldownFor("old@example.invalid", now), undefined);

    const quota = { status: "limited", scope: "quota", estimated: true, retryAfterSeconds: 60 };
    const deadline = first.recordCooldown("first@example.invalid", quota, now).deadline;
    assert.equal(first.recordCooldown("first@example.invalid", quota, now + 5_000).deadline, deadline);

    const reloaded = await import("../src/publicSite/assets/verificationCooldown.js?reload");
    assert.equal(reloaded.secondsRemaining(reloaded.cooldownFor("", now + 15_000), now + 15_000), 45);
    assert.equal(reloaded.cooldownFor("first@example.invalid", deadline), undefined);

    reloaded.recordCooldown("first@example.invalid", { status: "pending" }, deadline);
    assert.equal(reloaded.cooldownFor("first@example.invalid", deadline).stage, 1);
    assert.equal(reloaded.cooldownFor("second@example.invalid", deadline), undefined);
  } finally {
    if (previousStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = previousStorage;
  }
});


test("sign-in uses the password grant and requires an active confirmed Innovator", async () => {
  const email = "test@example.invalid";
  const token = "synthetic-token";
  const signIn = (status = "active", confirmed = true) => signInInnovator(config, email, "test-password", async (url, options) => {
    if (url.pathname === "/auth/v1/token") {
      assert.equal(url.searchParams.get("grant_type"), "password");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { email, password: "test-password" });
      return Response.json({ access_token: token, refresh_token: "unused" });
    }
    assert.equal(options.headers.Authorization, "Bearer " + token);
    if (url.pathname === "/auth/v1/user") {
      return Response.json({ id: "test-id", email, email_confirmed_at: confirmed ? "2026-11-19" : null, is_anonymous: false });
    }
    assert.equal(url.pathname, "/rest/v1/profiles");
    assert.equal(url.searchParams.get("id"), "eq.test-id");
    return Response.json([{ account_role: "innovator", account_status: status }]);
  });
  assert.deepEqual(await signIn(), { status: "signed-in", token, profile: { account_role: "innovator", account_status: "active", email } });
  assert.deepEqual(await signIn("suspended"), { status: "no-access" });
  assert.deepEqual(await signIn("active", false), { status: "no-access" });
});

test("sign-in distinguishes unconfirmed credentials and throttled requests", async () => {
  const attempt = (code, status, headers) => signInInnovator(
    config, "test@example.invalid", "test-password", async () => Response.json({ error_code: code }, { status, headers }),
  );
  assert.deepEqual(await attempt("invalid_credentials", 400), { status: "invalid" });
  assert.deepEqual(await attempt("email_not_confirmed", 400), { status: "unverified" });
  assert.deepEqual(await attempt("over_request_rate_limit", 429, { "Retry-After": "45" }), {
    status: "limited", scope: "shared", retryAfterSeconds: 45, estimated: false,
  });
});


test("signup accepts ordinary name punctuation and blocks display controls before sending", async () => {
  const fields = { email: "test@example.invalid", password: "test-password" };
  assert.equal(signupFieldsReady("Mma O’Neil-Lekgowe", true, fields.password, fields.password), true);
  for (const fullName of ["<name>", "Name\tSuffix", "Name\u202e", "a".repeat(121)]) {
    assert.equal(signupFieldsReady(fullName, true, fields.password, fields.password), false);
    const result = await requestSignup(config, { ...fields, fullName }, callback, () => {
      assert.fail("Rejected name reached Supabase");
    });
    assert.deepEqual(result, { status: "invalid-name" });
  }
});

