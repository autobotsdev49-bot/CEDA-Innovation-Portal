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

export type AdminUser = { id: string; full_name: string; email: string; account_role: string; account_status: string; lead_assessor: boolean; sector_ids?: string[] };
export type AdminSector = { id: string; name: string; status: string };

/** The database rechecks active Admin and live-session authorization on every call. */
export async function readAdminRecords(account: Account, kind: "users", search: string, page: number): Promise<AdminUser[]>;
export async function readAdminRecords(account: Account, kind: "sectors"): Promise<AdminSector[]>;
export async function readAdminRecords(account: Account, kind: "users" | "sectors", search = "", page = 0): Promise<AdminUser[] | AdminSector[]> {
  if (account.role !== "admin" || account.expiresAt <= Date.now()) throw new Error("Your administrator session has expired. Sign in again.");
  const { response, data } = await request("/rest/v1/rpc/" + (kind === "users" ? "admin_directory" : "admin_sectors"),
    kind === "users" ? { search_text: search.trim(), page_number: page } : {}, account.token);
  if (!response.ok || !Array.isArray(data)) {
    throw new Error(response.status === 401 || response.status === 403
      ? "Administrator access could not be verified. Sign in again or contact CEDA support."
      : "We couldn't load these records. Check your connection and retry.");
  }
  return data;
}

export type AdminAccess = { new_role: "innovator" | "admin" | "assessor" | "support"; lead: boolean; sectors: string[]; reason: string };
export type AdminInvitation = AdminAccess & { address: string; display_name: string };
export type AdminCreation = AdminInvitation & { password: string };

export function validAdminPassword(password: string) {
  let bytes = 0;
  for (const character of password) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point <= 127 ? 1 : point <= 2047 ? 2 : point <= 65535 ? 3 : 4;
  }
  return password.length >= 12 && bytes <= 72 &&
    /[a-z]/.test(password) && /[A-Z]/.test(password) &&
    /[0-9]/.test(password) && /[^a-zA-Z0-9\s]/.test(password);
}

function requireAdminSession(account: Account) {
  if (account.role !== "admin" || account.expiresAt <= Date.now()) throw new Error("Your administrator session has expired. Sign in again.");
}

async function adminAction(account: Account, path: string, body?: object) {
  requireAdminSession(account);
  const { response, data } = await request(path, body, account.token);
  if (!response.ok) {
    if (response.status === 429) throw new Error("Too many requests. Wait a moment before trying again.");
    if (path === "/functions/v1/admincreate" && response.status >= 500) throw new Error("Account creation could not be confirmed. Review the directory before retrying.");
    if (path === "/functions/v1/admininvite" && response.status >= 500) throw new Error("Invitation delivery could not be confirmed. Check the provider or web portal before retrying.");
    if (response.status === 401) throw new Error("Your session could not be verified. Sign in again.");
    if (response.status === 403 || data?.code === "42501") throw new Error("This action requires active administrator access and authenticator verification. Self-changes and changes to the last administrator may be blocked.");
    if (path.includes("/factors/")) throw new Error("The authenticator code could not be verified. Enter a fresh six-digit code.");
    if (path === "/functions/v1/admincreate") throw new Error("Account creation was rejected. Check the name, email, password policy and any existing account or pending invitation.");
    throw new Error("The change was not accepted. Check the account, role, sectors and reason before trying again.");
  }
  return data;
}

export async function verifyAdminAuthenticator(account: Account, code: string): Promise<Account> {
  requireAdminSession(account);
  if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit code from your authenticator.");
  const identity = await adminAction(account, "/auth/v1/user");
  const factor = Array.isArray(identity?.factors) && identity.factors.find((item: { id?: string; factor_type?: string; status?: string }) => item.factor_type === "totp" && item.status === "verified" && typeof item.id === "string");
  if (!factor) throw new Error("Set up your authenticator in the web Account security screen first, then return here to verify a code.");
  const path = "/auth/v1/factors/" + encodeURIComponent(factor.id);
  const challenge = await adminAction(account, path + "/challenge", {});
  if (typeof challenge?.id !== "string" || !challenge.id) throw new Error("Authenticator verification could not start. Try again.");
  const startedAt = Date.now();
  const verified = await adminAction(account, path + "/verify", { challenge_id: challenge.id, code });
  if (typeof verified?.access_token !== "string" || !verified.access_token || typeof verified.expires_in !== "number" || !Number.isFinite(verified.expires_in) || verified.expires_in <= 0) throw new Error("Your verified session could not be established. Sign in again.");
  return { ...account, token: verified.access_token, expiresAt: Math.min(account.expiresAt, startedAt + verified.expires_in * 1000) };
}

function validateAccess(input: AdminAccess) {
  if (!["innovator", "admin", "assessor", "support"].includes(input.new_role) || (input.lead && input.new_role !== "assessor") || !Array.isArray(input.sectors) || input.sectors.some(id => typeof id !== "string" || !id) || input.reason.trim().length < 5 || input.reason.trim().length > 500) throw new Error("Choose a valid role and enter a reason of 5 to 500 characters.");
}

export async function inviteAdminUser(account: Account, input: AdminInvitation) {
  requireAdminSession(account); validateAccess(input);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.address.trim()) || input.address.length > 254 || !input.display_name.trim() || input.display_name.trim().length > 120 || /[<>\p{Cc}\p{Bidi_Control}]/u.test(input.display_name)) throw new Error("Enter a valid full name and email address.");
  try {
    const result = await adminAction(account, "/functions/v1/admininvite", { ...input, address: input.address.trim().toLowerCase(), display_name: input.display_name.trim(), reason: input.reason.trim() });
    if (result?.status !== "sent") throw new Error("Invitation delivery could not be confirmed. Check the provider before retrying.");
  } catch (error) {
    if (error instanceof Error && error.message !== "Failed to fetch" && error.name !== "AbortError" && !(error instanceof TypeError)) throw error;
    throw new Error("Invitation delivery could not be confirmed. Check the provider or web portal before retrying.");
  }
}

export async function createAdminUser(account: Account, input: AdminCreation) {
  requireAdminSession(account); validateAccess(input);
  if (!validAdminPassword(input.password)) throw new Error("Use 12-72 UTF-8 bytes with uppercase, lowercase, a number and a symbol for the password.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.address.trim()) || input.address.length > 254 || !input.display_name.trim() || input.display_name.trim().length > 120 || /[<>\p{Cc}\p{Bidi_Control}]/u.test(input.display_name)) throw new Error("Enter a valid full name and email address.");
  try {
    const result = await adminAction(account, "/functions/v1/admincreate", { ...input, address: input.address.trim().toLowerCase(), display_name: input.display_name.trim(), reason: input.reason.trim() });
    if (result?.status !== "created" || typeof result.id !== "string" || !result.id) throw new Error("Account creation could not be confirmed. Review the directory before retrying.");
  } catch (error) {
    if (error instanceof Error && error.name !== "AbortError" && !(error instanceof TypeError)) throw error;
    throw new Error("Account creation could not be confirmed. Review the directory before retrying.");
  }
}

export async function updateAdminUserAccess(account: Account, targetId: string, input: AdminAccess) {
  requireAdminSession(account); validateAccess(input);
  if (!targetId) throw new Error("Select an account to edit.");
  try { await adminAction(account, "/rest/v1/rpc/admin_assign_role", { target_id: targetId, ...input, reason: input.reason.trim() }); }
  catch (error) {
    if (error instanceof Error && error.name !== "AbortError" && !(error instanceof TypeError)) throw error;
    throw new Error("The save could not be confirmed. Reload the directory before retrying.");
  }
}

export async function checkEmailVerification(email: string, password: string) {
  const result = await signInInnovator(email, password);
  if (result.status === "error" && result.unconfirmed) {
    return failure("Your email is still unverified. Open the link in your inbox, then come back and tap I have verified my email.");
  }
  return result;
}
