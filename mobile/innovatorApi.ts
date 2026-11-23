import { buildPortalDocumentPublicUrl, type ApplicationFormConfig } from "./portalCatalog.ts";
import type {
  InnovatorApplication,
  InnovatorDocument,
  InnovatorMessage,
  WizardFormData,
} from "./innovatorDomain";
import { kickFcmDispatch, type AlertSubscriptionItem } from "./notificationsApi.ts";

export interface InnovatorPreferences {
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  inAppNotifications?: boolean;
  freeAlertPlan?: boolean;
  notifyStatus?: boolean;
  notifyClarifications?: boolean;
  notifyMessages?: boolean;
  textSize?: "standard" | "large" | "xlarge";
  highContrast?: boolean;
  reducedMotion?: boolean;
  [key: string]: unknown;
}

export interface InnovatorProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  district: string;
  expertise: string;
  companyName: string;
  companyRegNumber: string;
  companySector: string;
  companyRole: string;
  preferences: InnovatorPreferences;
}

export interface SectorOption {
  id: string;
  name: string;
  description?: string;
}

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  message: string;
  applicationRef: string | null;
  targetHash: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface SupportThreadMessage {
  sender: string;
  role: string;
  body: string;
  at?: string;
}

export interface SupportRequestItem {
  id: string;
  title: string;
  kind: "Bug" | "Support" | "Feedback" | string;
  priority: string;
  state: string;
  owner: string;
  applicationRef: string | null;
  detail: string;
  steps: string;
  escalationSource?: string;
  wizardStep?: number | null;
  queuedOutsideHours?: boolean;
  availabilityStatus?: "available" | "all_agents_busy" | "after_hours" | "non_working_day" | string;
  availabilityNotice?: string | null;
  satisfactionRating?: number | null;
  thread: SupportThreadMessage[];
  reportedAt: string;
  updatedAt?: string;
}

export interface LiveChatStatusPayload {
  status: "available" | "all_agents_busy" | "after_hours" | "non_working_day" | string;
  isLiveAvailable: boolean;
  isWorkingDay: boolean;
  isHoliday?: boolean;
  isWithinHours: boolean;
  dateKey: string;
  currentDayLabel: string;
  currentTimeCat: string;
  scheduleLabel: string;
  shortScheduleLabel: string;
  badgeLabel: string;
  notificationMessage: string;
  availableAgentsCount: number;
  busyAgentsCount: number;
  onlineAgentsCount: number;
  totalActiveChats: number;
  totalCapacity: number;
}

export interface FaqArticle {
  id?: string;
  title: string;
  summary?: string;
  body?: string;
  kind?: string;
  authorityCode?: string | null;
  contactDetails?: Record<string, string> | null;
  externalUrl?: string | null;
}

export interface PortalDocumentItem {
  id: string;
  kind: "Application form" | "Accompanying copies" | string;
  title: string;
  summary?: string;
  body?: string;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  attachmentPath?: string | null;
  externalUrl?: string | null;
  updated?: string;
}

export interface RegulatoryContactItem {
  id: string;
  title: string;
  summary?: string;
  body?: string;
  authorityCode?: string | null;
  contactDetails?: Record<string, string> | null;
  externalUrl?: string | null;
}

export interface OptimusInteraction {
  id: string;
  topic: string;
  question: string;
  answer: string;
  sourceArticle: string;
  escalated: boolean;
  escalationReason?: string | null;
  aiProvider?: string | null;
  rating: "helpful" | "not_helpful" | null;
  createdAt: string;
}

export interface OptimusAskResult {
  latest: OptimusInteraction;
  history: OptimusInteraction[];
  supportRequests?: SupportRequestItem[];
  liveChatStatus?: LiveChatStatusPayload;
  autoEscalated?: boolean;
  escalatedTicketRef?: string | null;
  followUpChips?: string[];
  escalationMode?: "none" | "suggest" | "auto";
  aiProvider?: string;
}

export interface InnovatorWorkspaceData {
  profile: InnovatorProfile;
  liveChatStatus?: LiveChatStatusPayload;
  sectors: SectorOption[];
  applications: InnovatorApplication[];
  documents: InnovatorDocument[];
  messages: InnovatorMessage[];
  notifications: NotificationItem[];
  alertSubscriptions?: AlertSubscriptionItem[];
  supportRequests: SupportRequestItem[];
  faqs: FaqArticle[];
  portalDocuments?: PortalDocumentItem[];
  regulatoryContacts?: RegulatoryContactItem[];
  applicationFormConfig?: ApplicationFormConfig | Record<string, unknown> | null;
  optimusHistory: OptimusInteraction[];
}

export interface ApiConfig {
  origin: string;
  key: string;
  fetchFn?: typeof fetch;
}

const REQUEST_TIMEOUT_MS = 15000;
const RAM_CACHE_TTL_MS = 30000;
const ramCache = new Map<string, { value: unknown; expiresAt: number }>();

function getSupabaseConfig(override?: Partial<ApiConfig>): ApiConfig {
  const rawOrigin = override?.origin ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  const origin = rawOrigin.trim().replace(/\/+$/, "");
  const key = (override?.key ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  if (!origin || !key) {
    throw new Error("Configure your Supabase URL and publishable key before continuing.");
  }
  return { origin, key };
}

export function getPortalContentDownloadUrl(attachmentPath: string | null | undefined, override?: Partial<ApiConfig>): string {
  try {
    const { origin } = getSupabaseConfig(override);
    return buildPortalDocumentPublicUrl(origin, attachmentPath);
  } catch {
    return "";
  }
}

export function getCachedValue<T>(key: string): T | null {
  const hit = ramCache.get(key);
  if (!hit || Date.now() > hit.expiresAt) {
    ramCache.delete(key);
    return null;
  }
  return hit.value as T;
}

export function setCachedValue<T>(key: string, value: T, ttlMs = RAM_CACHE_TTL_MS): void {
  ramCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateInnovatorCache(): void {
  ramCache.clear();
}

export function encodeStoragePath(storagePath: string): string {
  return String(storagePath || "")
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function callRpc<T>(
  name: string,
  payload: Record<string, unknown>,
  token: string,
  configOverride?: Partial<ApiConfig>
): Promise<T> {
  if (!token) throw new Error("Sign in required to access your Innovator workspace.");
  const { origin, key } = getSupabaseConfig(configOverride);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${origin}/rest/v1/rpc/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        apikey: key,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const errObj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
      const message =
        typeof errObj.message === "string"
          ? errObj.message
          : typeof errObj.error_description === "string"
            ? errObj.error_description
            : typeof errObj.hint === "string"
              ? errObj.hint
              : `Request failed (${response.status}).`;
      throw new Error(message);
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("The server took too long to respond. Please check your connection and try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchInnovatorBootstrap(
  token: string,
  forceRefresh = false,
  configOverride?: Partial<ApiConfig>
): Promise<InnovatorWorkspaceData> {
  const cacheKey = `bootstrap:${token.slice(-12)}`;
  if (!forceRefresh) {
    const cached = getCachedValue<InnovatorWorkspaceData>(cacheKey);
    if (cached) return cached;
  }
  const data = await callRpc<InnovatorWorkspaceData>("innovator_workspace_bootstrap", {}, token, configOverride);
  setCachedValue(cacheKey, data);
  return data;
}

export async function createDraftApplication(
  token: string,
  applicantType: string,
  sectorId: string,
  configOverride?: Partial<ApiConfig>
): Promise<InnovatorApplication> {
  const created = await callRpc<InnovatorApplication>(
    "innovator_create_draft",
    { p_applicant_type: applicantType, p_sector_id: sectorId },
    token,
    configOverride
  );
  invalidateInnovatorCache();
  return created;
}

export async function saveDraftApplication(
  token: string,
  appId: string,
  currentStep: number,
  formData: WizardFormData,
  expectedVersion: number,
  configOverride?: Partial<ApiConfig>
): Promise<InnovatorApplication> {
  const updated = await callRpc<InnovatorApplication>(
    "innovator_save_draft",
    {
      p_app_id: appId,
      p_current_step: currentStep,
      p_form_data: formData,
      p_expected_version: expectedVersion,
    },
    token,
    configOverride
  );
  invalidateInnovatorCache();
  return updated;
}

export async function addApplicationDocument(
  token: string,
  params: {
    appId: string;
    sectionKey: string;
    docKind: "file" | "video_link" | "supplemental";
    title: string;
    category: string;
    description?: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    storagePath?: string | null;
    videoUrl?: string | null;
    passwordProtected?: boolean;
    replaceDocId?: string;
  },
  configOverride?: Partial<ApiConfig>
): Promise<InnovatorDocument[]> {
  const docs = await callRpc<InnovatorDocument[]>(
    params.replaceDocId ? "innovator_replace_document" : "innovator_add_document",
    {
      ...(params.replaceDocId ? { p_replace_doc_id: params.replaceDocId } : {}),
      p_app_id: params.appId,
      p_section_key: params.sectionKey,
      p_doc_kind: params.docKind,
      p_title: params.title,
      p_category: params.category || "Supporting document",
      p_description: params.description || "",
      p_file_name: params.fileName,
      p_mime_type: params.mimeType || "application/octet-stream",
      p_file_size: params.fileSize,
      p_storage_path: params.storagePath ?? null,
      p_video_url: params.videoUrl ?? null,
      p_password_protected: Boolean(params.passwordProtected),
    },
    token,
    configOverride
  );
  invalidateInnovatorCache();
  return docs;
}

export async function removeApplicationDocument(
  token: string,
  docId: string,
  configOverride?: Partial<ApiConfig>
): Promise<InnovatorDocument[]> {
  const docs = await callRpc<InnovatorDocument[]>(
    "innovator_remove_document",
    { p_doc_id: docId },
    token,
    configOverride
  );
  invalidateInnovatorCache();
  return docs;
}

export async function submitApplication(
  token: string,
  params: {
    appId: string;
    formData: WizardFormData;
    expectedVersion: number;
    idempotencyKey: string;
  },
  configOverride?: Partial<ApiConfig>
): Promise<InnovatorApplication> {
  const submitted = await callRpc<InnovatorApplication>(
    "innovator_submit_application",
    {
      p_app_id: params.appId,
      p_form_data: params.formData,
      p_expected_version: params.expectedVersion,
      p_idempotency_key: params.idempotencyKey,
    },
    token,
    configOverride
  );
  invalidateInnovatorCache();
  kickFcmDispatch(token, { limit: 10 }, configOverride ? { url: configOverride.origin, publishableKey: configOverride.key, fetchFn: configOverride.fetchFn } : undefined);
  return submitted;
}

export async function withdrawApplication(
  token: string,
  appId: string,
  reason: string,
  configOverride?: Partial<ApiConfig>
): Promise<InnovatorApplication> {
  const updated = await callRpc<InnovatorApplication>(
    "innovator_withdraw_application",
    { p_app_id: appId, p_reason: reason },
    token,
    configOverride
  );
  invalidateInnovatorCache();
  return updated;
}

export async function submitClarification(
  token: string,
  params: {
    appId: string;
    sectionKey: string;
    updatedFields: WizardFormData;
    responseNote: string;
    expectedVersion: number;
  },
  configOverride?: Partial<ApiConfig>
): Promise<InnovatorApplication> {
  const updated = await callRpc<InnovatorApplication>(
    "innovator_submit_clarification",
    {
      p_app_id: params.appId,
      p_section_key: params.sectionKey,
      p_updated_fields: params.updatedFields,
      p_response_note: params.responseNote,
      p_expected_version: params.expectedVersion,
    },
    token,
    configOverride
  );
  invalidateInnovatorCache();
  kickFcmDispatch(token, { limit: 10 }, configOverride ? { url: configOverride.origin, publishableKey: configOverride.key, fetchFn: configOverride.fetchFn } : undefined);
  return updated;
}

export async function sendPortalMessage(
  token: string,
  params: {
    applicationId: string | null;
    threadType: "application" | "support" | "clarification";
    subject: string;
    body: string;
    attachmentName?: string | null;
    attachmentPath?: string | null;
  },
  configOverride?: Partial<ApiConfig>
): Promise<InnovatorMessage[]> {
  const messages = await callRpc<InnovatorMessage[]>(
    "innovator_send_message",
    {
      p_application_id: params.applicationId,
      p_thread_type: params.threadType,
      p_subject: params.subject,
      p_body: params.body,
      p_attachment_name: params.attachmentName ?? null,
      p_attachment_path: params.attachmentPath ?? null,
    },
    token,
    configOverride
  );
  invalidateInnovatorCache();
  kickFcmDispatch(token, { limit: 10 }, configOverride ? { url: configOverride.origin, publishableKey: configOverride.key, fetchFn: configOverride.fetchFn } : undefined);
  return messages;
}

export async function markThreadRead(
  token: string,
  applicationId: string | null,
  threadType: string | null,
  configOverride?: Partial<ApiConfig>
): Promise<void> {
  await callRpc<void>(
    "innovator_mark_thread_read",
    { p_application_id: applicationId, p_thread_type: threadType },
    token,
    configOverride
  );
  invalidateInnovatorCache();
}

export async function markNotificationsRead(
  token: string,
  notificationId?: string | null,
  configOverride?: Partial<ApiConfig>
): Promise<NotificationItem[]> {
  const items = await callRpc<NotificationItem[]>(
    "innovator_mark_notifications_read",
    { p_notification_id: notificationId ?? null },
    token,
    configOverride
  );
  invalidateInnovatorCache();
  return items;
}

export async function createSupportRequest(
  token: string,
  params: {
    kind: "Support" | "Bug" | "Feedback";
    title: string;
    detail: string;
    applicationRef?: string | null;
    steps?: string;
  },
  configOverride?: Partial<ApiConfig>
): Promise<SupportRequestItem[]> {
  const requests = await callRpc<SupportRequestItem[]>(
    "innovator_create_support_request",
    {
      p_kind: params.kind,
      p_title: params.title,
      p_detail: params.detail,
      p_application_ref: params.applicationRef || null,
      p_steps: params.steps || "Not supplied",
    },
    token,
    configOverride
  );
  invalidateInnovatorCache();
  kickFcmDispatch(token, { limit: 10 }, configOverride ? { url: configOverride.origin, publishableKey: configOverride.key, fetchFn: configOverride.fetchFn } : undefined);
  return requests;
}

export async function replySupportRequest(
  token: string,
  reference: string,
  message: string,
  configOverride?: Partial<ApiConfig>
): Promise<SupportRequestItem[]> {
  const requests = await callRpc<SupportRequestItem[]>(
    "innovator_reply_support_request",
    { p_reference: reference, p_message: message },
    token,
    configOverride
  );
  invalidateInnovatorCache();
  kickFcmDispatch(token, { limit: 10 }, configOverride ? { url: configOverride.origin, publishableKey: configOverride.key, fetchFn: configOverride.fetchFn } : undefined);
  return requests;
}

export async function askOptimusPrime(
  token: string,
  question: string,
  contextSection = "general",
  configOverride?: Partial<ApiConfig>
): Promise<OptimusAskResult> {
  if (!token) throw new Error("Sign in required to access your Innovator workspace.");
  const { origin, key } = getSupabaseConfig(configOverride);
  const edgeUrl = `${origin}/functions/v1/optimus`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        apikey: key,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ question, contextSection }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    if (response.ok) {
      const edgeResult = (await response.json()) as OptimusAskResult;
      if (edgeResult && edgeResult.latest && Array.isArray(edgeResult.history)) {
        invalidateInnovatorCache();
        return edgeResult;
      }
    }
  } catch {
    // Circuit breaker falls back cleanly to SQL controlled assistant RPC
  } finally {
    clearTimeout(timer);
  }

  const result = await callRpc<OptimusAskResult>(
    "innovator_ask_optimus",
    { p_question: question, p_context_section: contextSection },
    token,
    configOverride
  );
  invalidateInnovatorCache();
  return result;
}

export async function rateOptimusInteraction(
  token: string,
  interactionId: string,
  rating: "helpful" | "not_helpful",
  configOverride?: Partial<ApiConfig>
): Promise<OptimusInteraction[]> {
  const history = await callRpc<OptimusInteraction[]>(
    "innovator_rate_optimus",
    { p_interaction_id: interactionId, p_rating: rating },
    token,
    configOverride
  );
  invalidateInnovatorCache();
  return history;
}

export async function escalateOptimusToSupport(
  token: string,
  interactionId: string | null,
  summary: string,
  configOverride?: Partial<ApiConfig>
): Promise<SupportRequestItem[]> {
  const requests = await callRpc<SupportRequestItem[]>(
    "innovator_escalate_optimus",
    { p_interaction_id: interactionId, p_summary: summary },
    token,
    configOverride
  );
  invalidateInnovatorCache();
  kickFcmDispatch(token, { limit: 10 }, configOverride ? { url: configOverride.origin, publishableKey: configOverride.key, fetchFn: configOverride.fetchFn } : undefined);
  return requests;
}

export async function updateInnovatorProfile(
  token: string,
  params: {
    fullName: string;
    phone: string;
    district: string;
    expertise: string;
    companyName: string;
    companyRegNumber: string;
    companySector: string;
    companyRole: string;
    preferences: InnovatorPreferences;
  },
  configOverride?: Partial<ApiConfig>
): Promise<InnovatorProfile> {
  const profile = await callRpc<InnovatorProfile>(
    "innovator_update_profile",
    {
      p_full_name: params.fullName,
      p_phone: params.phone,
      p_district: params.district,
      p_expertise: params.expertise,
      p_company_name: params.companyName,
      p_company_reg_number: params.companyRegNumber,
      p_company_sector: params.companySector,
      p_company_role: params.companyRole,
      p_preferences: params.preferences,
    },
    token,
    configOverride
  );
  invalidateInnovatorCache();
  return profile;
}

export interface UploadableAsset {
  uri: string;
  name: string;
  type: string;
  file?: Blob;
}

export async function uploadPrivateEvidenceFile(
  token: string,
  storagePath: string,
  asset: UploadableAsset,
  onProgress?: (percent: number) => void,
  configOverride?: Partial<ApiConfig>
): Promise<void> {
  if (!token) throw new Error("Sign in required before uploading evidence.");
  const { origin, key } = getSupabaseConfig(configOverride);
  const encodedPath = encodeStoragePath(storagePath);
  const targetUrl = `${origin}/storage/v1/object/innovation-evidence/${encodedPath}`;
  const blob = asset.file ?? (await (await fetch(asset.uri)).blob());
  const mimeType = asset.type || "application/octet-stream";

  if (typeof XMLHttpRequest === "function") {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", targetUrl);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", key);
      xhr.setRequestHeader("Content-Type", mimeType);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.timeout = 45000;
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && onProgress) {
          onProgress(Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          resolve();
        } else {
          reject(new Error("Private file upload failed. Verify size/format and retry."));
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload."));
      xhr.ontimeout = () => reject(new Error("Upload timed out. Check your connection and retry."));
      xhr.send(blob);
    });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: key,
        "Content-Type": mimeType,
        "x-upsert": "false",
      },
      body: blob,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error("Private file upload failed. Verify size/format and retry.");
    onProgress?.(100);
  } finally {
    clearTimeout(timer);
  }
}

export async function deletePrivateEvidenceObject(
  token: string,
  storagePath: string,
  configOverride?: Partial<ApiConfig>
): Promise<void> {
  try {
    const { origin, key } = getSupabaseConfig(configOverride);
    const encodedPath = encodeStoragePath(storagePath);
    await fetch(`${origin}/storage/v1/object/innovation-evidence/${encodedPath}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, apikey: key },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
  } catch {
    // Best-effort orphan cleanup when replacing or rolling back failed registration.
  }
}

export async function createSignedEvidenceUrl(
  token: string,
  storagePath: string,
  expiresIn = 120,
  configOverride?: Partial<ApiConfig>
): Promise<string> {
  if (!token) throw new Error("Sign in required to access private evidence.");
  const { origin, key } = getSupabaseConfig(configOverride);
  const encodedPath = encodeStoragePath(storagePath);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${origin}/storage/v1/object/sign/innovation-evidence/${encodedPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        apikey: key,
      },
      body: JSON.stringify({ expiresIn }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: { signedURL?: string; signedUrl?: string } | null = null;
    try {
      parsed = text ? (JSON.parse(text) as { signedURL?: string; signedUrl?: string }) : null;
    } catch {
      parsed = null;
    }
    const signedRel = parsed?.signedURL || parsed?.signedUrl;
    if (!res.ok || !signedRel) {
      throw new Error("Unable to generate a temporary authorized file link.");
    }
    if (/^https?:\/\//i.test(signedRel)) return signedRel;
    return `${origin}/storage/v1${signedRel.startsWith("/") ? "" : "/"}${signedRel}`;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendPasswordResetEmail(
  email: string,
  configOverride?: Partial<ApiConfig>
): Promise<void> {
  if (!email) throw new Error("No registered email address found.");
  const { origin, key } = getSupabaseConfig(configOverride);
  const res = await fetch(`${origin}/auth/v1/recover`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ email }),
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
  });
  if (!res.ok) throw new Error("Unable to send password reset email right now.");
}

export async function signOutOtherDevices(
  token: string,
  configOverride?: Partial<ApiConfig>
): Promise<void> {
  if (!token) return;
  const { origin, key } = getSupabaseConfig(configOverride);
  const res = await fetch(`${origin}/auth/v1/logout?scope=others`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, apikey: key },
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
  });
  if (!res.ok) throw new Error("Unable to sign out other devices right now.");
}

export function isClosedSupportRequest(request: Partial<SupportRequestItem> | null | undefined): boolean {
  return /closed|resolved|complete|cancelled|canceled|done/i.test(String(request?.state || ""));
}

export function isOptimusSupportRequest(request: Partial<SupportRequestItem> | null | undefined): boolean {
  if (!request) return false;
  if (request.title === "Human support follow-up from Optimus Prime") return true;
  const combined = [
    request.title,
    request.steps,
    request.escalationSource,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /optimus|live chat|escalat|submission step|wizard step|consultant/i.test(combined);
}

export function getActiveOptimusSupportRequest(
  requests: SupportRequestItem[] = []
): SupportRequestItem | null {
  return (requests || []).find((r) => isOptimusSupportRequest(r) && !isClosedSupportRequest(r)) || null;
}

export function getActiveLiveChatRequests(
  requests: SupportRequestItem[] = []
): SupportRequestItem[] {
  return (requests || []).filter((r) => !isClosedSupportRequest(r));
}

export async function startLiveChat(
  token: string,
  input: {
    title?: string;
    message: string;
    escalationSource?: string;
    applicationRef?: string | null;
    wizardStep?: number | null;
    kind?: "Support" | "Bug" | "Feedback";
    priority?: "Normal" | "High";
  },
  configOverride?: Partial<ApiConfig>
): Promise<SupportRequestItem[]> {
  const cleanMsg = (input.message || "").trim();
  if (cleanMsg.length < 2 || cleanMsg.length > 2000) {
    throw new Error("Enter a message between 2 and 2000 characters.");
  }
  const cleanTitle = (input.title || "").trim() || (
    input.wizardStep
      ? `Submission live chat · Step ${input.wizardStep}`
      : "Live chat with CEDA Service Consultant"
  );
  const source = (input.escalationSource || "").trim() || (
    input.wizardStep ? "Submission Wizard" : "Live Chat"
  );

  try {
    const res = await callRpc<SupportRequestItem[]>(
      "innovator_start_live_chat",
      {
        p_title: cleanTitle,
        p_message: cleanMsg,
        p_escalation_source: source,
        p_application_ref: input.applicationRef || null,
        p_wizard_step: input.wizardStep ?? null,
        p_kind: input.kind || "Support",
        p_priority: input.priority || "Normal",
      },
      token,
      configOverride
    );
    invalidateInnovatorCache();
    kickFcmDispatch(token, { limit: 10 }, configOverride ? { url: configOverride.origin, publishableKey: configOverride.key, fetchFn: configOverride.fetchFn } : undefined);
    return Array.isArray(res) ? res : [];
  } catch {
    // Fallback to standard support request creation if older DB schema is connected
    const res = await callRpc<SupportRequestItem[]>(
      "innovator_create_support_request",
      {
        p_kind: input.kind || "Support",
        p_title: cleanTitle,
        p_detail: cleanMsg.length >= 10 ? cleanMsg : `${cleanTitle}: ${cleanMsg}`,
        p_application_ref: input.applicationRef || null,
        p_steps: input.wizardStep ? `Live Chat · Submission Step ${input.wizardStep}` : `Live Chat · ${source}`,
      },
      token,
      configOverride
    );
    invalidateInnovatorCache();
    kickFcmDispatch(token, { limit: 10 }, configOverride ? { url: configOverride.origin, publishableKey: configOverride.key, fetchFn: configOverride.fetchFn } : undefined);
    return Array.isArray(res) ? res : [];
  }
}

export async function rateSupportChat(
  token: string,
  reference: string,
  rating: number,
  comment?: string,
  configOverride?: Partial<ApiConfig>
): Promise<SupportRequestItem[]> {
  const res = await callRpc<SupportRequestItem[]>(
    "innovator_rate_support_chat",
    {
      p_reference: reference.trim(),
      p_rating: Math.max(1, Math.min(5, Math.round(rating))),
      p_comment: comment?.trim() || null,
    },
    token,
    configOverride
  );
  invalidateInnovatorCache();
  return Array.isArray(res) ? res : [];
}

export function generateIdempotencyKey(): string {
  const bytes = new Uint8Array(12);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `mob-sub-${Date.now()}-${hex}`;
}
