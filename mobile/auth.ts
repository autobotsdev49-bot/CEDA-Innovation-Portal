const endpoint = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const portalUrl = "https://ceda-innovation-portal-nine.vercel.app";
const confirmationUrl = portalUrl + "/verify-email/";
const origin = endpoint?.replace(/\/$/, "");
export const authConfigured = Boolean(origin && /^https:\/\/[a-z0-9]+\.supabase\.co$/i.test(origin) && key && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key));

export type Account = { token: string; name: string; role: "innovator" | "admin"; expiresAt: number };
type AuthError = { status: "error"; message: string; retryAt?: number; unconfirmed?: boolean };
type AuthResult = { status: "signed-in"; account: Account } | { status: "pending" } | AuthError;

function failure(message: string): AuthError {
  return { status: "error", message };
}

async function request(path: string, body?: object, token?: string) {
  if (!authConfigured || !key) throw new Error("Native authentication is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        apikey: key,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

function authError(response: Response, data: { error_code?: string; code?: string; msg?: string; message?: string } | null): AuthError {
  const code = data?.error_code ?? data?.code;
  if (response.status === 429) {
    const now = Date.now();
    const header = response.headers.get("Retry-After")?.trim() ?? "";
    const headerSeconds = /^\d+$/.test(header) ? Number(header) : Math.ceil((Date.parse(header) - now) / 1000);
    const detail = data?.msg ?? data?.message;
    const emailSeconds = typeof detail === "string" ? Number(detail.match(/after (\d+) seconds?\b/i)?.[1]) : NaN;
    const seconds = [headerSeconds, emailSeconds].find(value => Number.isSafeInteger(value) && value > 0 && value <= 86400);
    return {
      status: "error",
      message: code === "over_email_send_rate_limit" && !Number.isFinite(emailSeconds)
        ? "The portal's verification email service has reached its sending limit."
        : "The last request was rate limited.",
      retryAt: now + (seconds ?? 60) * 1000,
    };
  }
  if (code === "email_not_confirmed") {
    return { ...failure("Confirm your email using the link in your inbox, then sign in."), unconfirmed: true };
  }
  if (code === "weak_password") return failure("Choose a stronger password and try again.");
  if (code === "email_address_not_authorized") return failure("The portal could not send a verification email to this address.");
  if (code === "invalid_credentials" || code === "user_not_found" || code === "user_banned") return failure("The email or password is incorrect.");
  return failure("We couldn't complete that request. Please try again.");
}

export async function registerInnovator(name: string, email: string, password: string): Promise<AuthResult> {
  const { response, data } = await request("/auth/v1/signup?redirect_to=" + encodeURIComponent(confirmationUrl), {
    email, password, data: { full_name: name },
  });
  if (!response.ok) return authError(response, data);
  if (typeof data?.access_token === "string" && data.access_token) {
    void signOutInnovator(data.access_token).catch(() => {});
    return failure("Email confirmation is unavailable. Please contact CEDA support.");
  }
  return { status: "pending" };
}

export async function resendVerificationEmail(email: string): Promise<{ status: "sent" } | AuthError> {
  const { response, data } = await request("/auth/v1/resend?redirect_to=" + encodeURIComponent(confirmationUrl), {
    email, type: "signup",
  });
  return response.ok ? { status: "sent" } : authError(response, data);
}

export async function signInInnovator(email: string, password: string): Promise<{ status: "signed-in"; account: Account } | AuthError> {
  const startedAt = Date.now();
  const { response, data } = await request("/auth/v1/token?grant_type=password", { email, password });
  if (!response.ok) return authError(response, data);
  const token = data?.access_token;
  if (typeof token !== "string" || !token) return failure("We couldn't open a verified Innovator account.");

  const seconds = data?.expires_in;
  const rejectSession = (message: string) => {
    void signOutInnovator(token).catch(() => {});
    return failure(message);
  };
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
    return rejectSession("We couldn't establish a valid sign-in session. Please try again.");
  }
  const expiresAt = startedAt + Math.min(seconds, 3600) * 1000;

  try {
    const identity = await request("/auth/v1/user", undefined, token);
    const user = identity.data;
    if (!identity.response.ok || !user?.email_confirmed_at || user.is_anonymous !== false || typeof user.id !== "string" || !user.id) {
      return rejectSession("We couldn't open a verified Innovator account.");
    }
    const profile = await request("/rest/v1/profiles?select=full_name,account_role,account_status&id=eq." + encodeURIComponent(user.id), undefined, token);
    const row = Array.isArray(profile.data) && profile.data.length === 1 ? profile.data[0] : null;
    if (!profile.response.ok || !["innovator", "admin"].includes(row?.account_role) || row.account_status !== "active" || typeof row.full_name !== "string") {
      return rejectSession("We couldn't open an active account. Contact CEDA support if you need help.");
    }
    if (expiresAt <= Date.now()) return rejectSession("Your session expired. Sign in again to continue.");
    return { status: "signed-in", account: { token, name: row.full_name, role: row.account_role, expiresAt } };
  } catch (error) {
    void signOutInnovator(token).catch(() => {});
    throw error;
  }
}

export async function signOutInnovator(token: string) {
  await request("/auth/v1/logout?scope=local", {}, token);
}

export async function checkEmailVerification(email: string, password: string) {
  const result = await signInInnovator(email, password);
  if (result.status === "error" && result.unconfirmed) {
    return failure("Your email is still unverified. Open the link in your inbox, then come back and tap I have verified my email.");
  }
  return result;
}
