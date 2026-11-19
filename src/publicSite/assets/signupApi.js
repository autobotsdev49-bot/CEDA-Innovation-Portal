export async function requestSignup(config, { email, password, fullName }, returnUrl, send = fetch) {
  return requestVerificationEmail(config, "signup", { email, password, data: { full_name: fullName } }, returnUrl, send);
}

export async function resendSignup(config, email, returnUrl, send = fetch) {
  return requestVerificationEmail(config, "resend", { type: "signup", email }, returnUrl, send);
}

async function requestVerificationEmail(config, action, body, returnUrl, send) {
  const url = new URL(`/auth/v1/${action}`, config.url);
  url.searchParams.set("redirect_to", returnUrl);
  const response = await send(url, {
    method: "POST",
    headers: { apikey: config.key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (response.ok && result.access_token) return { status: "confirmation-disabled" };
  if (response.ok) return { status: "pending" };
  const code = result.error_code ?? result.code;
  if (response.status === 429) return limitedResponse(response, result, code);
  if (code === "email_address_not_authorized") return { status: "email-not-authorized" };
  if (code === "weak_password") return { status: "weak-password" };
  return { status: "unavailable" };
}

function limitedResponse(response, result, code) {
  const header = response.headers.get("Retry-After")?.trim();
  const headerSeconds = header && /^\d+$/.test(header)
    ? Number(header)
    : Math.ceil((Date.parse(header) - Date.now()) / 1000);
  const message = result.msg ?? result.message;
  const emailSeconds = typeof message === "string"
    ? Number(message.match(/after (\d+) seconds?\b/i)?.[1]) : NaN;
  const exactSeconds = [headerSeconds, emailSeconds].find(
    (seconds) => Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 86_400,
  );
  const scope = emailSeconds > 0 ? "email" : code === "over_email_send_rate_limit" ? "quota" : "shared";
  return {
    status: "limited",
    scope,
    retryAfterSeconds: exactSeconds ?? (scope === "shared" ? 300 : 60),
    estimated: !exactSeconds,
  };
}

export async function verifySignup(config, accessToken, send = fetch) {
  return Boolean(await verifiedInnovatorProfile(config, accessToken, send));
}

export async function verifiedInnovatorProfile(config, accessToken, send = fetch) {
  const headers = { apikey: config.key, Authorization: `Bearer ${accessToken}` };
  const response = await send(new URL("/auth/v1/user", config.url), { headers, cache: "no-store" });
  if (!response.ok) return false;
  const user = await response.json();
  if (!user.email_confirmed_at || user.is_anonymous !== false || !user.id) return false;

  const profileUrl = new URL("/rest/v1/profiles", config.url);
  profileUrl.searchParams.set("select", "full_name,account_role,account_status");
  profileUrl.searchParams.set("id", `eq.${user.id}`);
  const profileResponse = await send(profileUrl, { headers, cache: "no-store" });
  if (!profileResponse.ok) return false;
  const profiles = await profileResponse.json();
  return profiles.length === 1 && profiles[0].account_role === "innovator" && profiles[0].account_status === "active" ? { ...profiles[0], email: user.email } : null;
}
export function signupFieldsReady(fullName, validEmail, password, confirmation) {
  return fullName.trim().length > 0 && fullName.trim().length <= 120 &&
    validEmail && password.length >= 8 && new TextEncoder().encode(password).length <= 72 &&
    password === confirmation;
}

export async function logoutSignup(config, token, send = fetch) {
  const url = new URL("/auth/v1/logout?scope=local", config.url);
  const response = await send(url, {
    method: "POST",
    headers: { apikey: config.key, Authorization: `Bearer ${token}` },
  });
  return response.ok || response.status === 401 || response.status === 404;
}

export async function signInInnovator(config, email, password, send = fetch) {
  const response = await send(new URL("/auth/v1/token?grant_type=password", config.url), {
    method: "POST",
    headers: { apikey: config.key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = result.error_code ?? result.code;
    if (response.status === 429) return limitedResponse(response, result, code);
    if (code === "email_not_confirmed") return { status: "unverified" };
    if (code === "invalid_credentials" || code === "user_banned" || code === "user_not_found") {
      return { status: "invalid" };
    }
    return { status: "unavailable" };
  }

  const token = result.access_token;
  if (typeof token !== "string" || !token) return { status: "unavailable" };
  if (!await verifiedInnovatorProfile(config, token, send)) return { status: "no-access" };
  return { status: "signed-in", token };
}

