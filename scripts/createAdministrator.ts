// Run only from a trusted terminal. Credentials are read from the process environment.
const origin = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const password = process.env.CEDA_ADMIN_PASSWORD;
const email = "admin@ceda.co.bw";
if (origin !== "https://inzupertrdvlenrozqep.supabase.co" || !secret || !password) {
  throw new Error("Set SUPABASE_URL for Ceda Innovation, SUPABASE_SECRET_KEY and CEDA_ADMIN_PASSWORD in this terminal.");
}
if (!secret.startsWith("sb_secret_") && secret.split(".").length !== 3) {
  throw new Error("A server secret or service role key is required.");
}
const headers = { apikey: secret, Authorization: "Bearer " + secret, "Content-Type": "application/json" };
async function request(path, method, body = undefined) {
  const response = await fetch(origin + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
    redirect: "error", signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Administrator setup request failed with HTTP " + response.status + ". Check the Supabase Auth logs.");
  return data;
}
// Pagination allows retries to find the existing account without resetting its password.
let existing;
for (let page = 1; ; page++) {
  const result = await request("/auth/v1/admin/users?page=" + page + "&per_page=100", "GET");
  existing = result.users?.find(user => user.email?.toLowerCase() === email);
  if (existing || !result.users?.length || result.users.length < 100) break;
}
const user = existing ?? await request("/auth/v1/admin/users", "POST", {
  email, password, email_confirm: true, user_metadata: { full_name: "CEDA Administrator" },
});
const id = user.id;
if (typeof id !== "string") throw new Error("Auth did not return an account identifier.");
const profiles = await request("/rest/v1/profiles?id=eq." + encodeURIComponent(id) + "&select=id,account_role,account_status", "GET");
if (!Array.isArray(profiles) || profiles.length !== 1 || profiles[0].account_status !== "active") {
  throw new Error("Expected one active profile. Review this account before assigning a role.");
}
await request("/rest/v1/profiles?id=eq." + encodeURIComponent(id), "PATCH", { account_role: "admin", full_name: "CEDA Administrator" });
const verified = await request("/rest/v1/profiles?id=eq." + encodeURIComponent(id) + "&select=account_role", "GET");
if (verified?.[0]?.account_role !== "admin") throw new Error("Administrator assignment could not be verified.");
console.log("Administrator role verified for " + email + ". Existing account passwords are preserved.");
