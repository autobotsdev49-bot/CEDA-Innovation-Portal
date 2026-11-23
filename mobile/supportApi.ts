import type { Account } from "./auth.ts";
import { kickFcmDispatch } from "./notificationsApi.ts";
import type { SupportTicket } from "./supportOverview.js";

const REQUEST_TIMEOUT_MS = 15_000;
const SUPPORT_CACHE_TTL_MS = 30_000;
const supportRamCache = new Map<string, { tickets: SupportTicket[]; expiresAt: number }>();

function supabaseConfig(): { origin: string; key: string } {
  const origin = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  if (!origin || !key) {
    throw new Error("Configure your Supabase URL and publishable key before continuing.");
  }
  return { origin, key };
}

async function rpcSupport<T>(account: Account, name: string, payload: Record<string, unknown>): Promise<T> {
  if (account.role !== "support" || account.expiresAt <= Date.now()) {
    throw new Error("Your support session has expired. Sign in again.");
  }
  const { origin, key } = supabaseConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${origin}/rest/v1/rpc/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        apikey: key,
        Authorization: `Bearer ${account.token}`,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed: Record<string, unknown> | unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const msg =
        parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).message === "string"
          ? String((parsed as Record<string, unknown>).message)
          : "The support workspace is unavailable. Please retry.";
      throw new Error(msg);
    }
    return parsed as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The server took too long to respond. Check your connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Clears the in-memory Support ticket cache so the next read fetches fresh records.
 */
export function invalidateSupportCache(): void {
  supportRamCache.clear();
}

/**
 * Reads all support tickets assigned to the active Support Officer queue.
 */
export async function fetchSupportTickets(
  account: Account,
  forceRefresh = false
): Promise<SupportTicket[]> {
  if (account.role !== "support" || account.expiresAt <= Date.now()) {
    throw new Error("Your support session has expired. Sign in again.");
  }
  if (!forceRefresh) {
    const cached = supportRamCache.get(account.token);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.tickets;
    }
  }
  const result = await rpcSupport<SupportTicket[]>(account, "support_ticket_list", {});
  const tickets = Array.isArray(result) ? result : [];
  supportRamCache.set(account.token, {
    tickets,
    expiresAt: Date.now() + SUPPORT_CACHE_TTL_MS,
  });
  return tickets;
}

/**
 * Updates a support ticket state and optionally delivers an applicant-facing reply.
 */
export async function updateSupportTicket(
  account: Account,
  input: {
    reference: string;
    state: string;
    reason: string;
    reply?: string | null;
  }
): Promise<SupportTicket[]> {
  const reference = input.reference.trim();
  const reason = input.reason.trim();
  const reply = input.reply?.trim() || null;

  if (!reference || reference.length < 3 || reference.length > 32) {
    throw new Error("Select a valid support request.");
  }
  if (!["Open", "Investigating", "Waiting", "Resolved"].includes(input.state)) {
    throw new Error("Choose a valid ticket status.");
  }
  if (reason.length < 5 || reason.length > 500) {
    throw new Error("Enter an internal action note of 5 to 500 characters.");
  }
  if (reply && (reply.length < 2 || reply.length > 2000)) {
    throw new Error("Reply message must be between 2 and 2000 characters.");
  }

  const updated = await rpcSupport<SupportTicket[]>(account, "support_update_ticket", {
    p_reference: reference,
    p_state: input.state,
    p_reason: reason,
    p_reply: reply,
  });
  const tickets = Array.isArray(updated) ? updated : [];
  invalidateSupportCache();
  supportRamCache.set(account.token, {
    tickets,
    expiresAt: Date.now() + SUPPORT_CACHE_TTL_MS,
  });
  if (process.env.EXPO_PUBLIC_SUPABASE_URL !== "https://demo.supabase.co" && process.env.NODE_ENV !== "test") {
    kickFcmDispatch(account.token, { limit: 10 });
  }
  return tickets;
}

/**
 * Connects the signed-in Support Officer to a ticket so the innovator sees them connected by first name.
 */
export async function connectSupportTicket(
  account: Account,
  reference: string
): Promise<SupportTicket[]> {
  const cleanRef = reference.trim();
  if (!cleanRef || cleanRef.length < 3 || cleanRef.length > 32) {
    throw new Error("Select a valid support request.");
  }
  const updated = await rpcSupport<SupportTicket[]>(account, "support_connect_ticket", {
    p_reference: cleanRef,
  });
  const tickets = Array.isArray(updated) ? updated : [];
  invalidateSupportCache();
  supportRamCache.set(account.token, {
    tickets,
    expiresAt: Date.now() + SUPPORT_CACHE_TTL_MS,
  });
  if (process.env.EXPO_PUBLIC_SUPABASE_URL !== "https://demo.supabase.co" && process.env.NODE_ENV !== "test") {
    kickFcmDispatch(account.token, { limit: 10 });
  }
  return tickets;
}

/**
 * Persists the Support Officer's live chat availability ("Available" | "Busy" | "Offline")
 * and multi-chat concurrency capacity to the server.
 */
export async function updateSupportOfficerAvailability(
  account: Account,
  availability: "Available" | "Busy" | "Offline",
  maxConcurrent = 5
): Promise<Record<string, unknown> | null> {
  if (!["Available", "Busy", "Offline"].includes(availability)) {
    throw new Error("Choose Available, Busy, or Offline.");
  }
  const safeMax = Math.max(1, Math.min(20, Math.round(maxConcurrent || 5)));
  try {
    return await rpcSupport<Record<string, unknown>>(account, "support_set_availability", {
      p_availability: availability,
      p_max_concurrent: safeMax,
    });
  } catch {
    return null;
  }
}

/**
 * Fetches authoritative server-side live chat working hours (09:00-16:00 working days) and multi-agent status.
 */
export async function fetchLiveChatStatus(
  account: Account
): Promise<Record<string, unknown> | null> {
  try {
    return await rpcSupport<Record<string, unknown>>(account, "live_chat_status", {});
  } catch {
    return null;
  }
}
