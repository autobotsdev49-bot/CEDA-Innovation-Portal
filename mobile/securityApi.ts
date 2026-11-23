import type { Account } from "./auth";

const REQUEST_TIMEOUT_MS = 15_000;

function supabaseConfig() {
  const origin = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  if (!origin || !key) {
    throw new Error("Configure your Supabase URL and publishable key before continuing.");
  }
  return { origin, key };
}

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const ch of value) {
    const point = ch.codePointAt(0) ?? 0;
    bytes += point <= 127 ? 1 : point <= 2047 ? 2 : point <= 65535 ? 3 : 4;
  }
  return bytes;
}

/**
 * Checks whether a password meets the portal's staff/admin 12-72 UTF-8 byte policy.
 */
export function isStrongAccountPassword(password: string): boolean {
  return (
    password.length >= 12 &&
    utf8ByteLength(password) <= 72 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^a-zA-Z0-9\s]/.test(password)
  );
}

function decodeBase64Utf8(paddedBase64: string): string {
  if (typeof atob === "function") {
    return atob(paddedBase64);
  }
  const host = globalThis as { Buffer?: { from: (data: string, encoding: string) => { toString: (encoding: string) => string } } };
  if (host.Buffer) {
    return host.Buffer.from(paddedBase64, "base64").toString("utf8");
  }
  return "";
}

/**
 * Decodes JWT claims (display/UX state only; never used as an authorization check).
 */
export function isTokenAal2(token: string): boolean {
  try {
    const segment = token.split(".")[1];
    if (!segment) return false;
    const base64 = segment.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = decodeBase64Utf8(padded);
    if (!decoded) return false;
    const parsed = JSON.parse(decoded) as { aal?: string };
    return parsed?.aal === "aal2";
  } catch {
    return false;
  }
}

async function authFetch(
  path: string,
  token: string,
  options: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: object } = {}
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  const { origin, key } = supabaseConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const method = options.method ?? (options.body ? "POST" : "GET");
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    const text = await response.text();
    let data: Record<string, unknown> | null = null;
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      data = null;
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The authentication service timed out. Check your connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Updates the signed-in user's password via Supabase Auth (`PUT /auth/v1/user`).
 */
export async function updateAccountPassword(account: Account, newPassword: string): Promise<void> {
  if (!account.token || account.expiresAt <= Date.now()) {
    throw new Error("Your session has expired. Sign in again.");
  }
  if (!isStrongAccountPassword(newPassword)) {
    throw new Error("Use 12-72 UTF-8 bytes with uppercase, lowercase, a number and a symbol.");
  }
  const { ok, status, data } = await authFetch("/auth/v1/user", account.token, {
    method: "PUT",
    body: { password: newPassword },
  });
  if (!ok) {
    if (status === 401) throw new Error("Your session could not be verified. Sign in again.");
    if (status === 429) throw new Error("Too many requests. Wait a moment before trying again.");
    const message = typeof data?.message === "string" ? data.message : typeof data?.msg === "string" ? data.msg : "";
    throw new Error(message || "Could not update your password. Check the password policy and try again.");
  }
}

export type TotpEnrollmentPreparation = {
  factorId: string;
  alreadyVerified: boolean;
  qrCode?: string;
  secret?: string;
  formattedSecret?: string;
};

/**
 * Prepares TOTP authenticator verification or creates a new factor if none is verified yet.
 */
export async function prepareTotpEnrollment(
  account: Account,
  friendlyName = "CEDA Authenticator"
): Promise<TotpEnrollmentPreparation> {
  if (!account.token || account.expiresAt <= Date.now()) {
    throw new Error("Your session has expired. Sign in again.");
  }
  const userResult = await authFetch("/auth/v1/user", account.token, { method: "GET" });
  if (!userResult.ok) {
    if (userResult.status === 401) throw new Error("Your session could not be verified. Sign in again.");
    throw new Error("Could not check your authenticator status. Try again.");
  }
  const factors = Array.isArray(userResult.data?.factors)
    ? (userResult.data.factors as Array<{ id?: string; factor_type?: string; status?: string }>)
    : [];
  const verified = factors.find(
    factor => factor.factor_type === "totp" && factor.status === "verified" && typeof factor.id === "string"
  );
  if (verified?.id) {
    return { factorId: verified.id, alreadyVerified: true };
  }
  for (const pending of factors.filter(
    factor => factor.factor_type === "totp" && factor.status === "unverified" && typeof factor.id === "string"
  )) {
    await authFetch(`/auth/v1/factors/${encodeURIComponent(String(pending.id))}`, account.token, {
      method: "DELETE",
    }).catch(() => undefined);
  }
  const enrollResult = await authFetch("/auth/v1/factors", account.token, {
    method: "POST",
    body: { factor_type: "totp", friendly_name: friendlyName },
  });
  const totp = (enrollResult.data?.totp ?? null) as { qr_code?: string; secret?: string } | null;
  const factorId = typeof enrollResult.data?.id === "string" ? enrollResult.data.id : "";
  const qrCode = typeof totp?.qr_code === "string" ? totp.qr_code : "";
  if (!enrollResult.ok || !factorId || !qrCode) {
    throw new Error("Authenticator setup could not be prepared. Please try again.");
  }
  const rawSecret = typeof totp?.secret === "string" ? totp.secret : "";
  const formattedSecret = rawSecret ? (rawSecret.match(/.{1,4}/g) ?? [rawSecret]).join(" ") : undefined;
  return {
    factorId,
    alreadyVerified: false,
    qrCode,
    secret: rawSecret || undefined,
    formattedSecret,
  };
}

/**
 * Verifies a 6-digit TOTP code against a specific enrolled or existing factor ID and returns an AAL2 Account.
 */
export async function verifyTotpFactorCode(
  account: Account,
  factorId: string,
  code: string
): Promise<Account> {
  if (!account.token || account.expiresAt <= Date.now()) {
    throw new Error("Your session has expired. Sign in again.");
  }
  if (!/^\d{6}$/.test(code)) {
    throw new Error("Enter the six-digit code from your authenticator.");
  }
  const basePath = `/auth/v1/factors/${encodeURIComponent(factorId)}`;
  const challengeResult = await authFetch(`${basePath}/challenge`, account.token, {
    method: "POST",
    body: {},
  });
  const challengeId = typeof challengeResult.data?.id === "string" ? challengeResult.data.id : "";
  if (!challengeResult.ok || !challengeId) {
    if (challengeResult.status === 401) throw new Error("Your session could not be verified. Sign in again.");
    throw new Error("Authenticator verification could not start. Try again.");
  }
  const startedAt = Date.now();
  const verifyResult = await authFetch(`${basePath}/verify`, account.token, {
    method: "POST",
    body: { challenge_id: challengeId, code },
  });
  const accessToken = typeof verifyResult.data?.access_token === "string" ? verifyResult.data.access_token : "";
  const expiresIn = typeof verifyResult.data?.expires_in === "number" ? verifyResult.data.expires_in : 0;
  if (!verifyResult.ok || !accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    if (verifyResult.status === 429) throw new Error("Too many requests. Wait a moment before trying again.");
    throw new Error("The authenticator code could not be verified. Enter a fresh six-digit code.");
  }
  return {
    ...account,
    token: accessToken,
    expiresAt: Math.min(account.expiresAt, startedAt + expiresIn * 1000),
  };
}
