import {
  buildPortalDocumentPublicUrl,
  makePortalDocumentStoragePath,
  PORTAL_DOCUMENTS_BUCKET,
  validatePortalDocumentFile,
} from "./portalCatalog.ts";
import { kickFcmDispatch, triggerEmailDispatch, triggerFcmDispatch } from "./notificationsApi.ts";

const endpoint = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const portalUrl = "https://ceda-innovation-portal-nine.vercel.app";
const confirmationUrl = portalUrl + "/verify-email/";
const origin = endpoint?.replace(/\/$/, "");
export const authConfigured = Boolean(origin && /^https:\/\/[a-z0-9]+\.supabase\.co$/i.test(origin) && key && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key));

export type Account = { token: string; name: string; role: "innovator" | "admin" | "assessor" | "support" | "committee"; expiresAt: number };
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
    if (!profile.response.ok || !["innovator", "admin", "assessor", "support", "committee"].includes(row?.account_role) || row.account_status !== "active" || typeof row.full_name !== "string") {
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

export async function callAssessorRpc<T>(account: Account, name: string, body: object = {}): Promise<T> {
  if (account.role !== "assessor" || account.expiresAt <= Date.now()) {
    throw new Error("Your assessor session has expired. Sign in again.");
  }
  const { response, data } = await request(`/rest/v1/rpc/${name}`, body, account.token);
  if (!response.ok) {
    throw new Error(typeof data?.message === "string" ? data.message : "The assessment workspace is unavailable. Please retry.");
  }
  return data as T;
}

export async function callSupportRpc<T>(account: Account, name: string, body: object = {}): Promise<T> {
  if (account.role !== "support" || account.expiresAt <= Date.now()) {
    throw new Error("Your support session has expired. Sign in again.");
  }
  const { response, data } = await request(`/rest/v1/rpc/${name}`, body, account.token);
  if (!response.ok) {
    throw new Error(typeof data?.message === "string" ? data.message : "The support workspace is unavailable. Please retry.");
  }
  return data as T;
}

export async function callCommitteeRpc<T>(account: Account, name: string, body: object = {}): Promise<T> {
  if (account.role !== "committee" || account.expiresAt <= Date.now()) {
    throw new Error("Your committee session has expired. Sign in again.");
  }
  const { response, data } = await request(`/rest/v1/rpc/${name}`, body, account.token);
  if (!response.ok) {
    throw new Error(typeof data?.message === "string" ? data.message : "The committee workspace is unavailable. Please retry.");
  }
  return data as T;
}

export type AdminUser = { id: string; full_name: string; email: string; account_role: string; account_status: string; lead_assessor: boolean; sector_ids?: string[] };
export type AdminSector = {
  id: string;
  name: string;
  status: string;
  applications_count?: number;
  approved_count?: number;
  awarded_count?: number;
  in_review_count?: number;
  rejected_count?: number;
};

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
export type AdminApplicationDocument = {
  id: string;
  sectionKey: string;
  docKind: "file" | "video_link" | "supplemental" | string;
  title: string;
  category: string;
  description?: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  storagePath?: string | null;
  videoUrl?: string | null;
  version?: number;
  uploadStatus?: string;
  createdAt?: string;
};
export type AdminApplicationMessage = {
  id: string;
  threadType: string;
  subject: string;
  senderName: string;
  senderRole: string;
  body: string;
  createdAt: string;
};
export type AdminApplication = {
  id: string;
  uuid?: string;
  title: string;
  owner: string;
  applicantType?: string;
  receiptCode?: string;
  sector: string;
  status: string;
  date: string;
  submittedAt?: string | null;
  updatedAt?: string;
  assessor: string;
  summary: string;
  version?: number;
  reassessmentRequired?: boolean;
  hasOwner?: boolean;
  formData?: Record<string, unknown>;
  requestedChanges?: Array<Record<string, unknown>> | Record<string, unknown> | null;
  outcomeData?: Record<string, unknown> | null;
  awardData?: Record<string, unknown> | null;
  awardedAt?: string | null;
  applicantTimeline?: Array<{ label: string; detail: string; at: string }>;
  history?: Array<{ type: string; actor: string; reason: string; at: string }>;
  withdrawnReason?: string | null;
  documents?: AdminApplicationDocument[];
  messages?: AdminApplicationMessage[];
};
export type AdminMatter = {
  id: string;
  title: string;
  kind: "Bug" | "Support" | "Delivery" | "Feedback" | string;
  reporter: string;
  priority: string;
  state: "Open" | "Investigating" | "Waiting" | "Resolved" | string;
  owner: string;
  hasOwner?: boolean;
  reported: string;
  updatedAt?: string;
  application?: string | null;
  detail: string;
  steps?: string;
  thread?: Array<{ sender: string; role: string; body: string; at: string }>;
  history?: Array<{ actor: string; action: string; at: string }>;
};
export type AdminAuditEntry = { id: number; created_at: string; actor: string; action: string; target: string; reason: string };
export type AdminOptimusOverview = {
  totalInteractions: number;
  escalatedCount: number;
  helpfulCount: number;
  unhelpfulCount: number;
  topics: Array<{ topic: string; count: number }>;
};
export type AdminConfigurations = Record<string, { payload: Record<string, unknown>; version: number; reason?: string; updated_at?: string }>;
export type AssessmentCriterion = {
  id?: string;
  key: string;
  label: string;
  description: string;
  weight: number;
  sortOrder: number;
  active: boolean;
  version?: number;
  updatedAt?: string;
};
export type AssessmentRubricVersion = {
  version: number;
  passThreshold: number;
  reason: string;
  createdAt: string;
  criteriaCount: number;
  criteria: AssessmentCriterion[];
};
export type AssessmentRubricConfig = {
  version: number;
  passThreshold: number;
  updatedAt?: string;
  reason?: string;
  criteria: AssessmentCriterion[];
  history: AssessmentRubricVersion[];
};
export type AdminNotificationsOverview = {
  templates: Array<{ id: string; eventKey?: string; title: string; kind: string; channel: string; audience: string; status: string; message: string; version?: number }>;
  inbox: Array<{
    id: string;
    title: string;
    category: string;
    channel?: string;
    audience?: string;
    status: string;
    attempts?: number;
    lastError?: string | null;
    emailStatus?: string | null;
    emailAttempts?: number;
    emailLastError?: string | null;
    emailSentAt?: string | null;
    applicationRef?: string | null;
    eventKey?: string | null;
    sentAt?: string | null;
    when: string;
    action: string;
  }>;
  fcmSummary?: {
    activeDevices: number;
    queuedPush: number;
    processingPush?: number;
    sentPush: number;
    failedPush: number;
    skippedPush?: number;
    devicesByRole?: Record<string, number>;
    recentAttempts?: Array<{ id: string; queueId: string; status: string; errorCode?: string | null; errorMessage?: string | null; providerMessageId?: string | null; at: string }>;
  };
  emailSummary?: {
    queuedEmail: number;
    sentEmail: number;
    failedEmail: number;
    skippedEmail?: number;
    recentAttempts?: Array<{ id: string; queueId: string; status: string; errorCode?: string | null; errorMessage?: string | null; providerMessageId?: string | null; at: string }>;
  };
  subscriptionStats?: {
    freePlan: boolean;
    feeLabel?: string;
    totalSubscriptions: number;
    activeSubscriptions: number;
    unsubscribedCount: number;
  };
};
export type AdminContentItem = {
  id: string | null;
  title: string;
  summary: string;
  body: string;
  kind:
    | "Public pages"
    | "FAQs"
    | "Announcements"
    | "Partners"
    | "Application form"
    | "Accompanying copies"
    | "Regulatory contacts"
    | string;
  audience: string;
  stage: "Draft" | "Awaiting review" | "Published" | "Archived" | string;
  updated: string;
  version?: number;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  attachmentPath?: string | null;
  externalUrl?: string | null;
  authorityCode?: string | null;
  contactDetails?: Record<string, string> | null;
};

const ADMIN_RAM_CACHE_TTL_MS = 30_000;
const adminRamCache = new Map<string, { value: unknown; expiresAt: number }>();

function getAdminCached<T>(key: string): T | undefined {
  const entry = adminRamCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    adminRamCache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function setAdminCached<T>(key: string, value: T, ttlMs = ADMIN_RAM_CACHE_TTL_MS): T {
  adminRamCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function invalidateAdminCache(...prefixes: string[]) {
  if (!prefixes.length) {
    adminRamCache.clear();
    return;
  }
  for (const key of adminRamCache.keys()) {
    if (prefixes.some(prefix => key.startsWith(prefix))) {
      adminRamCache.delete(key);
    }
  }
}

function mapAdminApplication(record: Record<string, unknown>): AdminApplication {
  return {
    id: String(record.id || ""),
    uuid: typeof record.uuid === "string" ? record.uuid : undefined,
    title: String(record.title || ""),
    owner: String(record.applicant || ""),
    applicantType: typeof record.applicantType === "string" ? record.applicantType : undefined,
    receiptCode: typeof record.receiptCode === "string" ? record.receiptCode : undefined,
    sector: String(record.sector || ""),
    status: String(record.status || ""),
    date: String(record.date || ""),
    submittedAt: typeof record.submittedAt === "string" ? record.submittedAt : null,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
    assessor: "CEDA review",
    summary: String(record.summary || ""),
    version: typeof record.version === "number" ? record.version : 1,
    reassessmentRequired: Boolean(record.reassessmentRequired),
    hasOwner: Boolean(record.hasOwner),
    formData: record.formData && typeof record.formData === "object" ? (record.formData as Record<string, unknown>) : undefined,
    requestedChanges: (record.requestedChanges as AdminApplication["requestedChanges"]) ?? null,
    outcomeData: record.outcomeData && typeof record.outcomeData === "object" ? (record.outcomeData as Record<string, unknown>) : null,
    awardData: record.awardData && typeof record.awardData === "object" ? (record.awardData as Record<string, unknown>) : null,
    awardedAt: typeof record.awardedAt === "string" ? record.awardedAt : null,
    applicantTimeline: Array.isArray(record.applicantTimeline) ? (record.applicantTimeline as AdminApplication["applicantTimeline"]) : [],
    history: Array.isArray(record.history) ? (record.history as AdminApplication["history"]) : [],
    withdrawnReason: typeof record.withdrawnReason === "string" ? record.withdrawnReason : null,
    documents: Array.isArray(record.documents) ? (record.documents as AdminApplicationDocument[]) : [],
    messages: Array.isArray(record.messages) ? (record.messages as AdminApplicationMessage[]) : [],
  };
}

export async function readAdminApplications(account: Account, options?: { forceRefresh?: boolean }): Promise<AdminApplication[]> {
  requireAdminSession(account);
  if (!options?.forceRefresh) {
    const cached = getAdminCached<AdminApplication[]>("applications");
    if (cached) return cached;
  }
  const { response, data } = await request("/rest/v1/rpc/admin_applications", {}, account.token);
  if (!response.ok || !Array.isArray(data)) throw new Error("Unable to load live applications. Check your connection and retry.");
  return setAdminCached("applications", data.map((record: Record<string, unknown>) => mapAdminApplication(record)));
}

export type AdminAccess = { new_role: "innovator" | "admin" | "assessor" | "support" | "committee"; lead: boolean; sectors: string[]; reason: string };
export type AdminInvitation = AdminAccess & { address: string; display_name: string };
export type AdminCreation = AdminInvitation & { password: string; admin_code?: string };

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
    if (path === "/functions/v1/admincreate") throw new Error("Account creation was rejected. Check the name, email, password policy, temporary admin code and any existing account or pending invitation.");
    throw new Error("The change was not accepted. Check the account, role, sectors and reason before trying again.");
  }
  return data;
}

export async function verifyAdminAuthenticator(account: Account, code: string): Promise<Account> {
  requireAdminSession(account);
  return verifyAuthenticator(account, code);
}

export async function verifyAssessorAuthenticator(account: Account, code: string): Promise<Account> {
  if (account.role !== "assessor" || account.expiresAt <= Date.now()) {
    throw new Error("Your assessor session has expired. Sign in again.");
  }
  return verifyAuthenticator(account, code);
}

async function verifyAuthenticator(account: Account, code: string): Promise<Account> {
  if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit code from your authenticator.");
  async function authRequest(path: string, body?: object) {
    const { response, data } = await request(path, body, account.token);
    if (response.status === 401) throw new Error("Your session could not be verified. Sign in again.");
    if (response.status === 429) throw new Error("Too many requests. Wait a moment before trying again.");
    if (!response.ok) throw new Error("The authenticator code could not be verified. Enter a fresh six-digit code.");
    return data;
  }
  const identity = await authRequest("/auth/v1/user");
  const factor = Array.isArray(identity?.factors) && identity.factors.find((item: { id?: string; factor_type?: string; status?: string }) => item.factor_type === "totp" && item.status === "verified" && typeof item.id === "string");
  if (!factor) throw new Error("Set up your authenticator in the web Account security screen first, then return here to verify a code.");
  const path = "/auth/v1/factors/" + encodeURIComponent(factor.id);
  const challenge = await authRequest(path + "/challenge", {});
  if (typeof challenge?.id !== "string" || !challenge.id) throw new Error("Authenticator verification could not start. Try again.");
  const startedAt = Date.now();
  const verified = await authRequest(path + "/verify", { challenge_id: challenge.id, code });
  if (typeof verified?.access_token !== "string" || !verified.access_token || typeof verified.expires_in !== "number" || !Number.isFinite(verified.expires_in) || verified.expires_in <= 0) throw new Error("Your verified session could not be established. Sign in again.");
  return { ...account, token: verified.access_token, expiresAt: Math.min(account.expiresAt, startedAt + verified.expires_in * 1000) };
}

function validateAccess(input: AdminAccess) {
  if (!["innovator", "admin", "assessor", "support", "committee"].includes(input.new_role) || (input.lead && input.new_role !== "assessor") || !Array.isArray(input.sectors) || input.sectors.some(id => typeof id !== "string" || !id) || input.reason.trim().length < 5 || input.reason.trim().length > 500) throw new Error("Choose a valid role and enter a reason of 5 to 500 characters.");
}

export async function inviteAdminUser(account: Account, input: AdminInvitation) {
  requireAdminSession(account); validateAccess(input);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.address.trim()) || input.address.length > 254 || !input.display_name.trim() || input.display_name.trim().length > 120 || /[<>\p{Cc}\p{Bidi_Control}]/u.test(input.display_name)) throw new Error("Enter a valid full name and email address.");
  try {
    const result = await adminAction(account, "/functions/v1/admininvite", { ...input, address: input.address.trim().toLowerCase(), display_name: input.display_name.trim(), reason: input.reason.trim() });
    if (result?.status !== "sent") throw new Error("Invitation delivery could not be confirmed. Check the provider before retrying.");
    invalidateAdminCache("audit");
  } catch (error) {
    if (error instanceof Error && error.message !== "Failed to fetch" && error.name !== "AbortError" && !(error instanceof TypeError)) throw error;
    throw new Error("Invitation delivery could not be confirmed. Check the provider or web portal before retrying.");
  }
}

export async function createAdminUser(account: Account, input: AdminCreation) {
  requireAdminSession(account); validateAccess(input);
  if (!validAdminPassword(input.password)) throw new Error("Use 12-72 UTF-8 bytes with uppercase, lowercase, a number and a symbol for the password.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.address.trim()) || input.address.length > 254 || !input.display_name.trim() || input.display_name.trim().length > 120 || /[<>\p{Cc}\p{Bidi_Control}]/u.test(input.display_name)) throw new Error("Enter a valid full name and email address.");
  if (input.admin_code !== undefined && !/^\d{6}$/.test(input.admin_code.trim())) throw new Error("Enter the 6-digit temporary administrator code.");
  try {
    const payload = {
      ...input,
      address: input.address.trim().toLowerCase(),
      display_name: input.display_name.trim(),
      reason: input.reason.trim(),
      ...(input.admin_code !== undefined ? { admin_code: input.admin_code.trim() } : {}),
    };
    const result = await adminAction(account, "/functions/v1/admincreate", payload);
    if (result?.status !== "created" || typeof result.id !== "string" || !result.id) throw new Error("Account creation could not be confirmed. Review the directory before retrying.");
    invalidateAdminCache("audit");
  } catch (error) {
    if (error instanceof Error && error.name !== "AbortError" && !(error instanceof TypeError)) throw error;
    throw new Error("Account creation could not be confirmed. Review the directory before retrying.");
  }
}

export async function updateAdminUserAccess(account: Account, targetId: string, input: AdminAccess) {
  requireAdminSession(account); validateAccess(input);
  if (!targetId) throw new Error("Select an account to edit.");
  try {
    await adminAction(account, "/rest/v1/rpc/admin_assign_role", { target_id: targetId, ...input, reason: input.reason.trim() });
    invalidateAdminCache("audit");
  }
  catch (error) {
    if (error instanceof Error && error.name !== "AbortError" && !(error instanceof TypeError)) throw error;
    throw new Error("The save could not be confirmed. Reload the directory before retrying.");
  }
}

export async function saveAdminSector(account: Account, input: { id?: string | null; name: string; status: string; reason: string }): Promise<AdminSector[]> {
  const data = await adminAction(account, "/rest/v1/rpc/admin_save_sector", {
    sector_name: input.name.trim(),
    sector_status: input.status,
    reason: input.reason.trim(),
    sector_id: input.id || null,
  });
  invalidateAdminCache("audit", "applications");
  return Array.isArray(data) ? (data as AdminSector[]) : [];
}

export async function reviseAdminApplication(account: Account, input: {
  app_ref: string;
  new_title: string;
  new_applicant: string;
  new_sector: string;
  new_summary: string;
  expected_version: number;
  reason: string;
}): Promise<AdminApplication[]> {
  const data = await adminAction(account, "/rest/v1/rpc/admin_revise_application", {
    app_ref: input.app_ref,
    new_title: input.new_title.trim(),
    new_applicant: input.new_applicant.trim(),
    new_sector: input.new_sector.trim(),
    new_summary: input.new_summary.trim(),
    expected_version: input.expected_version,
    reason: input.reason.trim(),
  });
  const mapped = Array.isArray(data) ? data.map((r: Record<string, unknown>) => mapAdminApplication(r)) : [];
  invalidateAdminCache("applications", "audit");
  if (mapped.length) setAdminCached("applications", mapped);
  return mapped;
}

export async function interveneAdminApplicationStatus(account: Account, input: {
  app_ref: string;
  new_status: string;
  expected_version: number;
  confirmed: boolean;
  reason: string;
  section_key?: string;
  deadline?: string | null;
  outcome_feedback?: string | null;
}): Promise<AdminApplication[]> {
  const data = await adminAction(account, "/rest/v1/rpc/admin_intervene_application_status_ext", {
    app_ref: input.app_ref,
    new_status: input.new_status,
    expected_version: input.expected_version,
    confirmed: input.confirmed,
    reason: input.reason.trim(),
    p_section_key: input.section_key || "general",
    p_deadline: input.deadline?.trim() || null,
    p_outcome_feedback: input.outcome_feedback?.trim() || null,
  });
  const mapped = Array.isArray(data) ? data.map((r: Record<string, unknown>) => mapAdminApplication(r)) : [];
  invalidateAdminCache("applications", "audit", "notifications");
  if (mapped.length) setAdminCached("applications", mapped);
  kickFcmDispatch(account.token, { limit: 10 });
  return mapped;
}

export async function conferAdminAward(account: Account, input: {
  app_ref: string;
  expected_version: number;
  confirmed: boolean;
  award_title: string;
  award_category?: string;
  award_amount?: string | null;
  award_summary?: string | null;
  reason: string;
}): Promise<AdminApplication[]> {
  const data = await adminAction(account, "/rest/v1/rpc/admin_confer_award", {
    app_ref: input.app_ref,
    expected_version: input.expected_version,
    confirmed: input.confirmed,
    p_award_title: input.award_title.trim(),
    p_award_category: input.award_category?.trim() || "Innovation Recognition & Support",
    p_award_amount: input.award_amount?.trim() || null,
    p_award_summary: input.award_summary?.trim() || null,
    reason: input.reason.trim(),
  });
  const mapped = Array.isArray(data) ? data.map((r: Record<string, unknown>) => mapAdminApplication(r)) : [];
  invalidateAdminCache("applications", "audit", "notifications");
  if (mapped.length) setAdminCached("applications", mapped);
  kickFcmDispatch(account.token, { limit: 10 });
  return mapped;
}

export async function replyAdminApplicationMessage(account: Account, input: {
  app_ref: string;
  reply_body: string;
  thread_kind?: "application" | "clarification";
}): Promise<AdminApplication[]> {
  const data = await adminAction(account, "/rest/v1/rpc/admin_reply_application_message", {
    app_ref: input.app_ref,
    reply_body: input.reply_body.trim(),
    thread_kind: input.thread_kind || "application",
  });
  const mapped = Array.isArray(data) ? data.map((r: Record<string, unknown>) => mapAdminApplication(r)) : [];
  invalidateAdminCache("applications", "audit", "notifications");
  if (mapped.length) setAdminCached("applications", mapped);
  kickFcmDispatch(account.token, { limit: 10 });
  return mapped;
}

export async function createAdminEvidenceSignedUrl(account: Account, storagePath: string): Promise<string> {
  requireAdminSession(account);
  const encodedPath = storagePath.split("/").filter(Boolean).map(seg => encodeURIComponent(seg)).join("/");
  if (!encodedPath) throw new Error("Missing file storage path.");
  const { response, data } = await request("/storage/v1/object/sign/innovation-evidence/" + encodedPath, { expiresIn: 120 }, account.token);
  const signed = (data as { signedURL?: string; signedUrl?: string } | null)?.signedURL || (data as { signedUrl?: string } | null)?.signedUrl;
  if (!response.ok || !signed) throw new Error("Unable to generate a temporary signed link for this file.");
  return signed.startsWith("http") ? signed : new URL("/storage/v1" + (signed.startsWith("/") ? signed : "/" + signed), origin).href;
}

export async function readAdminMatters(account: Account, options?: { forceRefresh?: boolean }): Promise<AdminMatter[]> {
  if (!options?.forceRefresh) {
    const cached = getAdminCached<AdminMatter[]>("matters");
    if (cached) return cached;
  }
  const data = await adminAction(account, "/rest/v1/rpc/admin_matters_list", {});
  const list = Array.isArray(data) ? (data as AdminMatter[]) : [];
  return setAdminCached("matters", list);
}

export async function updateAdminMatter(account: Account, input: {
  matter_ref: string;
  new_owner: string;
  new_state: string;
  reason: string;
  reply_message?: string;
}): Promise<AdminMatter[]> {
  const reply = input.reply_message?.trim() || null;
  const data = await adminAction(account, "/rest/v1/rpc/admin_update_matter_with_reply", {
    matter_ref: input.matter_ref,
    new_owner: input.new_owner.trim(),
    new_state: input.new_state,
    reason: input.reason.trim(),
    reply_message: reply,
  });
  const list = Array.isArray(data) ? (data as AdminMatter[]) : [];
  invalidateAdminCache("matters", "audit", "notifications");
  if (list.length) setAdminCached("matters", list);
  kickFcmDispatch(account.token, { limit: 10 });
  return list;
}

export async function readAdminAuditFeed(account: Account, search = "", page = 0): Promise<AdminAuditEntry[]> {
  const data = await adminAction(account, "/rest/v1/rpc/admin_audit_feed", { search_text: search.trim(), page_number: page });
  return Array.isArray(data) ? (data as AdminAuditEntry[]) : [];
}

export async function readAdminNotifications(account: Account, options?: { forceRefresh?: boolean }): Promise<AdminNotificationsOverview> {
  if (!options?.forceRefresh) {
    const cached = getAdminCached<AdminNotificationsOverview>("notifications");
    if (cached) return cached;
  }
  const data = await adminAction(account, "/rest/v1/rpc/admin_notifications_overview", {});
  const overview = (data && typeof data === "object" ? data : { templates: [], inbox: [] }) as AdminNotificationsOverview;
  return setAdminCached("notifications", overview);
}

export async function saveAdminNotification(account: Account, input: {
  entry_kind: string;
  entry_title: string;
  entry_message: string;
  reason?: string;
  entry_audience?: string;
  entry_channel?: string;
}): Promise<AdminNotificationsOverview> {
  const hasTarget = Boolean(input.entry_audience || input.entry_channel);
  const rpcPath = hasTarget ? "/rest/v1/rpc/admin_save_notification_with_target" : "/rest/v1/rpc/admin_save_notification";
  const payload = hasTarget
    ? {
        entry_kind: input.entry_kind.trim(),
        entry_title: input.entry_title.trim(),
        entry_message: input.entry_message.trim(),
        reason: (input.reason || "Saved via Mobile Admin Notification Center").trim(),
        entry_audience: input.entry_audience?.trim() || null,
        entry_channel: input.entry_channel?.trim() || null,
      }
    : {
        entry_kind: input.entry_kind.trim(),
        entry_title: input.entry_title.trim(),
        entry_message: input.entry_message.trim(),
        reason: (input.reason || "Saved via Mobile Admin Notification Center").trim(),
      };
  const data = await adminAction(account, rpcPath, payload);
  const overview = (data && typeof data === "object" ? data : { templates: [], inbox: [] }) as AdminNotificationsOverview;
  invalidateAdminCache("notifications", "audit");
  setAdminCached("notifications", overview);
  if (input.entry_kind.trim() === "Announcement") {
    kickFcmDispatch(account.token, { limit: 25 });
  }
  return overview;
}

export async function retryAdminNotification(account: Account, queueId: string): Promise<AdminNotificationsOverview> {
  const data = await adminAction(account, "/rest/v1/rpc/admin_retry_notification", {
    p_queue_id: queueId.trim(),
  });
  await Promise.all([
    triggerFcmDispatch(account.token, { mode: "retry", queueId: queueId.trim(), limit: 1 }),
    triggerEmailDispatch(account.token, { mode: "retry", queueId: queueId.trim(), limit: 1 }),
  ]);
  invalidateAdminCache("notifications", "audit");
  const refreshed = await readAdminNotifications(account, { forceRefresh: true }).catch(() => data);
  return (refreshed && typeof refreshed === "object" ? refreshed : { templates: [], inbox: [] }) as AdminNotificationsOverview;
}

export async function sendAdminTestPush(
  account: Account,
  title = "CEDA Innovation push check",
  message = "FCM notification delivery is active for your administrator device."
): Promise<{ overview: AdminNotificationsOverview; dispatch: Awaited<ReturnType<typeof triggerFcmDispatch>> }> {
  const res = (await adminAction(account, "/rest/v1/rpc/admin_send_test_push", {
    p_title: title.trim(),
    p_message: message.trim(),
  })) as { queueId?: string; overview?: AdminNotificationsOverview };
  const dispatch = await triggerFcmDispatch(account.token, {
    mode: "retry",
    queueId: res?.queueId,
    limit: 1,
  });
  invalidateAdminCache("notifications", "audit");
  const overview = await readAdminNotifications(account, { forceRefresh: true }).catch(
    () => res?.overview ?? { templates: [], inbox: [] }
  );
  return { overview, dispatch };
}

export async function sendAdminTestEmail(
  account: Account,
  title = "CEDA Innovation free email alert check",
  message = "Your CEDA Innovation Portal free email alert subscription channel is configured and working."
): Promise<{ overview: AdminNotificationsOverview; dispatch: Awaited<ReturnType<typeof triggerEmailDispatch>> }> {
  const res = (await adminAction(account, "/rest/v1/rpc/admin_send_test_email", {
    p_title: title.trim(),
    p_message: message.trim(),
  })) as { queueId?: string; overview?: AdminNotificationsOverview };
  const dispatch = await triggerEmailDispatch(account.token, {
    mode: "retry",
    queueId: res?.queueId,
    limit: 1,
  });
  invalidateAdminCache("notifications", "audit");
  const overview = await readAdminNotifications(account, { forceRefresh: true }).catch(
    () => res?.overview ?? { templates: [], inbox: [] }
  );
  return { overview, dispatch };
}

export async function dispatchAdminNotifications(
  account: Account
): Promise<{
  overview: AdminNotificationsOverview;
  dispatch: Awaited<ReturnType<typeof triggerFcmDispatch>>;
  emailDispatch?: Awaited<ReturnType<typeof triggerEmailDispatch>>;
}> {
  const [dispatch, emailDispatch] = await Promise.all([
    triggerFcmDispatch(account.token, { mode: "drain", limit: 25 }),
    triggerEmailDispatch(account.token, { mode: "drain", limit: 25 }),
  ]);
  invalidateAdminCache("notifications", "audit");
  const overview = await readAdminNotifications(account, { forceRefresh: true });
  return { overview, dispatch, emailDispatch };
}

export async function readAdminConfigurations(account: Account, options?: { forceRefresh?: boolean }): Promise<{ configs: AdminConfigurations; optimusOverview: AdminOptimusOverview | null }> {
  if (!options?.forceRefresh) {
    const cached = getAdminCached<{ configs: AdminConfigurations; optimusOverview: AdminOptimusOverview | null }>("configurations");
    if (cached) return cached;
  }
  const [configs, overview] = await Promise.all([
    adminAction(account, "/rest/v1/rpc/admin_get_configurations", {}),
    adminAction(account, "/rest/v1/rpc/admin_optimus_overview", {}).catch(() => null),
  ]);
  const bundle = {
    configs: (configs && typeof configs === "object" ? configs : {}) as AdminConfigurations,
    optimusOverview: (overview && typeof overview === "object" ? overview : null) as AdminOptimusOverview | null,
  };
  return setAdminCached("configurations", bundle);
}

export async function saveAdminConfiguration(account: Account, targetKey: string, payload: Record<string, unknown>, reason: string): Promise<AdminConfigurations> {
  const data = await adminAction(account, "/rest/v1/rpc/admin_save_configuration", {
    target_key: targetKey,
    new_payload: payload,
    reason: reason.trim(),
  });
  invalidateAdminCache("configurations", "audit");
  return (data && typeof data === "object" ? data : {}) as AdminConfigurations;
}

export async function readAdminAssessmentCriteria(account: Account, options?: { forceRefresh?: boolean }): Promise<AssessmentRubricConfig> {
  if (!options?.forceRefresh) {
    const cached = getAdminCached<AssessmentRubricConfig>("assessment_criteria");
    if (cached) return cached;
  }
  const data = await adminAction(account, "/rest/v1/rpc/admin_assessment_criteria_get", {});
  const raw = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const normalized: AssessmentRubricConfig = {
    version: Number(raw.version || 1),
    passThreshold: Number(raw.passThreshold ?? 60),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    reason: typeof raw.reason === "string" ? raw.reason : undefined,
    criteria: Array.isArray(raw.criteria) ? (raw.criteria as AssessmentCriterion[]) : [],
    history: Array.isArray(raw.history) ? (raw.history as AssessmentRubricVersion[]) : [],
  };
  return setAdminCached("assessment_criteria", normalized);
}

export async function saveAdminAssessmentCriteria(
  account: Account,
  criteriaList: AssessmentCriterion[],
  reason: string,
  passThreshold = 60,
): Promise<AssessmentRubricConfig> {
  const data = await adminAction(account, "/rest/v1/rpc/admin_save_assessment_criteria", {
    p_criteria: criteriaList,
    p_reason: reason.trim(),
    p_pass_threshold: passThreshold,
  });
  invalidateAdminCache("assessment_criteria", "configurations", "audit");
  const raw = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const normalized: AssessmentRubricConfig = {
    version: Number(raw.version || 1),
    passThreshold: Number(raw.passThreshold ?? passThreshold),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    reason: typeof raw.reason === "string" ? raw.reason : undefined,
    criteria: Array.isArray(raw.criteria) ? (raw.criteria as AssessmentCriterion[]) : [],
    history: Array.isArray(raw.history) ? (raw.history as AssessmentRubricVersion[]) : [],
  };
  return setAdminCached("assessment_criteria", normalized);
}

export async function readAdminContent(account: Account, options?: { forceRefresh?: boolean }): Promise<AdminContentItem[]> {
  if (!options?.forceRefresh) {
    const cached = getAdminCached<AdminContentItem[]>("content");
    if (cached) return cached;
  }
  const data = await adminAction(account, "/rest/v1/rpc/admin_content_list", {});
  const items = Array.isArray(data) ? (data as AdminContentItem[]) : [];
  return setAdminCached("content", items);
}

export async function saveAdminContent(account: Account, input: {
  content_kind: string;
  content_title: string;
  content_body: string;
  reason: string;
  content_id?: string | null;
  content_stage?: string;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  attachment_size?: number | null;
  attachment_path?: string | null;
  external_url?: string | null;
  authority_code?: string | null;
  contact_details?: Record<string, string> | null;
  clear_attachment?: boolean;
}): Promise<AdminContentItem[]> {
  const rpcBody: Record<string, unknown> = {
    content_kind: input.content_kind.trim(),
    content_title: input.content_title.trim(),
    content_body: input.content_body.trim(),
    reason: input.reason.trim(),
    content_id: input.content_id || null,
    content_stage: input.content_stage || "Draft",
  };
  const hasExtendedFields =
    input.attachment_name !== undefined ||
    input.attachment_mime !== undefined ||
    input.attachment_size !== undefined ||
    input.attachment_path !== undefined ||
    input.external_url !== undefined ||
    input.authority_code !== undefined ||
    input.contact_details !== undefined ||
    input.clear_attachment !== undefined;
  if (hasExtendedFields) {
    rpcBody.attachment_name = input.attachment_name ?? null;
    rpcBody.attachment_mime = input.attachment_mime ?? null;
    rpcBody.attachment_size = input.attachment_size ?? null;
    rpcBody.attachment_path = input.attachment_path ?? null;
    rpcBody.external_url = input.external_url ?? null;
    rpcBody.authority_code = input.authority_code ?? null;
    rpcBody.contact_details = input.contact_details ?? null;
    rpcBody.clear_attachment = Boolean(input.clear_attachment);
  }
  const data = await adminAction(account, "/rest/v1/rpc/admin_save_content", rpcBody);
  const items = Array.isArray(data) ? (data as AdminContentItem[]) : [];
  invalidateAdminCache("content", "audit");
  setAdminCached("content", items);
  return items;
}

export async function deleteAdminContent(account: Account, contentId: string, reason: string): Promise<AdminContentItem[]> {
  const data = await adminAction(account, "/rest/v1/rpc/admin_delete_content", {
    content_id: contentId,
    reason: reason.trim(),
  });
  const items = Array.isArray(data) ? (data as AdminContentItem[]) : [];
  invalidateAdminCache("content", "audit");
  setAdminCached("content", items);
  return items;
}

export function getPortalDocumentDownloadUrl(attachmentPath: string | null | undefined): string {
  return buildPortalDocumentPublicUrl(origin, attachmentPath);
}

export async function uploadPortalContentAsset(
  account: Account,
  asset: { uri: string; name: string; size?: number; type?: string; file?: Blob }
): Promise<{
  attachmentName: string;
  attachmentMime: string;
  attachmentSize: number;
  attachmentPath: string;
  publicUrl: string;
}> {
  if (!authConfigured || !origin || !key || !account.token) {
    throw new Error("Sign in as an Administrator before uploading portal documents.");
  }
  const validation = validatePortalDocumentFile(asset);
  if (!validation.valid) throw new Error(validation.message);

  const storagePath = makePortalDocumentStoragePath(asset.name);
  const encodedPath = storagePath.split("/").map((seg) => encodeURIComponent(seg)).join("/");
  const blob = asset.file ?? (await (await fetch(asset.uri)).blob());
  const mimeType = asset.type || blob.type || "application/octet-stream";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${origin}/storage/v1/object/${PORTAL_DOCUMENTS_BUCKET}/${encodedPath}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${account.token}`,
        "Content-Type": mimeType,
        "x-upsert": "true",
      },
      body: blob,
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => null);
      throw new Error(err?.message || err?.error || "Could not upload document to portal storage.");
    }
  } finally {
    clearTimeout(timer);
  }

  return {
    attachmentName: asset.name,
    attachmentMime: mimeType,
    attachmentSize: Number(asset.size || blob.size || 0),
    attachmentPath: storagePath,
    publicUrl: getPortalDocumentDownloadUrl(storagePath),
  };
}

export async function removePortalStorageAsset(account: Account, storagePath: string | null | undefined): Promise<void> {
  if (!authConfigured || !origin || !key || !account.token || !storagePath || storagePath.includes("..")) return;
  const encodedPath = storagePath.split("/").map((seg) => encodeURIComponent(seg)).join("/");
  await fetch(`${origin}/storage/v1/object/${PORTAL_DOCUMENTS_BUCKET}/${encodedPath}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${account.token}` },
    cache: "no-store",
    credentials: "omit",
  }).catch(() => {});
}

import {
  emptyReportingSummary,
  normalizeReportingPeriod,
  normalizeReportingSummary,
} from "./reportingOverview.js";

export type AdminReportingSummary = ReturnType<typeof emptyReportingSummary>;

export async function readAdminReportingSummary(
  account: Account,
  periodDays: 1 | 7 | 30 = 7,
  options?: { forceRefresh?: boolean }
): Promise<AdminReportingSummary> {
  const safePeriod = normalizeReportingPeriod(periodDays);
  const cacheKey = `reporting_${safePeriod}`;
  if (!options?.forceRefresh) {
    const cached = getAdminCached<AdminReportingSummary>(cacheKey);
    if (cached) return cached;
  }
  const data = await adminAction(account, "/rest/v1/rpc/admin_reporting_summary", {
    p_period_days: safePeriod,
  });
  const normalized = data ? normalizeReportingSummary(data, safePeriod) : emptyReportingSummary(safePeriod);
  return setAdminCached(cacheKey, normalized);
}

export async function logAdminReportExport(
  account: Account,
  reportKey: string,
  format: "csv" | "pdf" | "print" | "share" = "csv",
  periodDays: 1 | 7 | 30 = 7
): Promise<{ ok: boolean; auditId?: number; reportKey: string; format: string; periodDays: number }> {
  const safePeriod = normalizeReportingPeriod(periodDays);
  const data = await adminAction(account, "/rest/v1/rpc/admin_log_report_export", {
    p_report_key: reportKey,
    p_format: format,
    p_period_days: safePeriod,
  });
  invalidateAdminCache("audit");
  return (data && typeof data === "object"
    ? data
    : { ok: true, reportKey, format, periodDays: safePeriod }) as {
    ok: boolean;
    auditId?: number;
    reportKey: string;
    format: string;
    periodDays: number;
  };
}

export async function checkEmailVerification(email: string, password: string) {
  const result = await signInInnovator(email, password);
  if (result.status === "error" && result.unconfirmed) {
    return failure("Your email is still unverified. Open the link in your inbox, then come back and tap I have verified my email.");
  }
  return result;
}
