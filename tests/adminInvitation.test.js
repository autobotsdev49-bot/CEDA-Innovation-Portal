import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../supabase/functions/admininvite/index.ts", import.meta.url), "utf8");
function handler(send) {
  let serve;
  vm.runInNewContext(source, {
    Request, Response, AbortSignal, Set, JSON,
    fetch: send,
    Deno: {
      env: { get: name => ({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "public-test", SUPABASE_SERVICE_ROLE_KEY: "private-test" })[name] },
      serve: callback => { serve = callback; },
    },
  });
  return serve;
}
const payload = { address: "staff@example.invalid", display_name: "Synthetic Staff", new_role: "support", lead: false, sectors: [], reason: "Test onboarding" };
const request = () => new Request("https://example.supabase.co/functions/v1/admininvite", {
  method: "POST", headers: { Authorization: "Bearer synthetic-session", "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

test("invitation endpoint denies unauthenticated callers before privileged requests", async () => {
  let calls = 0;
  const serve = handler(async () => { calls++; return Response.json({}); });
  const result = await serve(new Request("https://example.invalid", { method: "POST" }));
  assert.equal(result.status, 401);
  assert.equal(calls, 0);
});
test("database role or MFA rejection prevents sending invitations", async () => {
  const paths = [];
  const serve = handler(async (url, options) => {
    paths.push(new URL(url).pathname);
    assert.equal(options.headers.Authorization, "Bearer synthetic-session");
    return paths.length === 1 ? Response.json({ id: "synthetic" })
      : Response.json({ code: "42501", message: "Multi-factor verification required" }, { status: 403 });
  });
  assert.equal((await serve(request())).status, 403);
  assert.deepEqual(paths, ["/auth/v1/user", "/rest/v1/rpc/admin_prepare_invitation"]);
});
test("authorized invitation uses the Admin API only after database authorization", async () => {
  const paths = [];
  const serve = handler(async (url, options) => {
    const endpoint = new URL(url);
    paths.push(endpoint.pathname);
    if (endpoint.pathname === "/auth/v1/user") return Response.json({ id: "synthetic" });
    if (endpoint.pathname === "/rest/v1/rpc/admin_prepare_invitation") {
      assert.deepEqual(JSON.parse(options.body), payload);
      assert.equal(options.headers.apikey, "public-test");
      return Response.json("invitation-test");
    }
    assert.equal(endpoint.pathname, "/auth/v1/invite");
    assert.match(endpoint.searchParams.get("redirect_to"), /\/activate\/$/);
    assert.equal(options.headers.apikey, "private-test");
    assert.equal(JSON.parse(options.body).email, payload.address);
    return Response.json({ id: "invited-test" });
  });
  assert.equal((await serve(request())).status, 200);
  assert.equal(paths.length, 3);
});
