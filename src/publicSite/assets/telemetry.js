import { detectDeviceClass, sanitizeTelemetryRoute } from "./reportingOverview.js";

const SESSION_KEY_STORAGE = "ceda_tel_session_v1";
let cachedConfigPromise = null;

function randomSessionKey() {
  const bytes = new Uint8Array(12);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getTelemetrySessionKey() {
  try {
    const existing = globalThis.sessionStorage?.getItem(SESSION_KEY_STORAGE);
    if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) return existing;
    const next = randomSessionKey();
    globalThis.sessionStorage?.setItem(SESSION_KEY_STORAGE, next);
    return next;
  } catch {
    return randomSessionKey();
  }
}

async function getSupabaseTelemetryConfig() {
  if (!cachedConfigPromise) {
    cachedConfigPromise = import("./signupConfig.js")
      .then((mod) => {
        const cfg = mod?.signupConfig;
        return cfg?.url && cfg?.key ? { url: cfg.url, key: cfg.key } : null;
      })
      .catch(() => null);
  }
  return cachedConfigPromise;
}

/**
 * Sends a single PII-free telemetry event via non-blocking fetch/keepalive.
 * @param {{
 *   eventType: "page_view" | "screen_view" | "web_vital" | "workflow_step" | "request_error";
 *   route?: string;
 *   routeLabel?: string;
 *   portalRole?: "public" | "innovator" | "assessor" | "support" | "committee" | "admin";
 *   lcpMs?: number | null;
 *   inpMs?: number | null;
 *   clsScore?: number | null;
 *   ttfbMs?: number | null;
 *   statusCode?: number | null;
 *   workflowName?: string | null;
 *   dedupKey?: string | null;
 * }} payload
 */
export async function sendTelemetryEvent(payload) {
  try {
    if (!payload?.eventType) return;
    const cfg = await getSupabaseTelemetryConfig();
    if (!cfg) return;

    const route = sanitizeTelemetryRoute(
      payload.route || globalThis.location?.pathname || "/"
    );
    const routeLabel = String(payload.routeLabel || globalThis.document?.title || route)
      .split("|")[0]
      .trim()
      .slice(0, 120);
    const deviceClass = detectDeviceClass(
      globalThis.innerWidth || 1280,
      globalThis.navigator?.userAgent || ""
    );

    const body = {
      p_event_type: payload.eventType,
      p_route: route,
      p_route_label: routeLabel,
      p_portal_role: payload.portalRole || "public",
      p_device_class: deviceClass,
      p_session_key: getTelemetrySessionKey(),
      p_lcp_ms: Number.isFinite(payload.lcpMs) ? Math.round(payload.lcpMs) : null,
      p_inp_ms: Number.isFinite(payload.inpMs) ? Math.round(payload.inpMs) : null,
      p_cls_score: Number.isFinite(payload.clsScore)
        ? Number(payload.clsScore.toFixed(4))
        : null,
      p_ttfb_ms: Number.isFinite(payload.ttfbMs) ? Math.round(payload.ttfbMs) : null,
      p_status_code: Number.isFinite(payload.statusCode)
        ? Math.trunc(payload.statusCode)
        : null,
      p_workflow_name: payload.workflowName || null,
      p_dedup_key: payload.dedupKey || null,
    };

    await globalThis.fetch(`${cfg.url}/rest/v1/rpc/record_telemetry_event`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Telemetry is non-blocking and must never break page rendering or user workflows.
  }
}

/**
 * Records a page_view immediately and measures Core Web Vitals (LCP, INP, CLS, TTFB)
 * flushed once when the tab hides or unloads.
 * @param {{ portalRole?: "public" | "innovator" | "assessor" | "support" | "committee" | "admin"; route?: string; routeLabel?: string }} [options]
 */
export function initPortalTelemetry(options = {}) {
  if (typeof globalThis.window === "undefined" || typeof PerformanceObserver === "undefined") {
    void sendTelemetryEvent({
      eventType: "page_view",
      portalRole: options.portalRole || "public",
      route: options.route,
      routeLabel: options.routeLabel,
    });
    return;
  }

  const portalRole = options.portalRole || "public";
  const route = sanitizeTelemetryRoute(options.route || globalThis.location?.pathname || "/");
  const routeLabel = String(options.routeLabel || globalThis.document?.title || route)
    .split("|")[0]
    .trim()
    .slice(0, 120);

  void sendTelemetryEvent({
    eventType: "page_view",
    portalRole,
    route,
    routeLabel,
  });

  let lcpMs = null;
  let clsScore = 0;
  let inpMs = null;
  let ttfbMs = null;
  let flushed = false;

  try {
    const navEntries = globalThis.performance?.getEntriesByType?.("navigation");
    const nav = navEntries?.[0];
    if (nav && Number.isFinite(nav.responseStart) && Number.isFinite(nav.requestStart)) {
      const candidate = nav.responseStart - nav.requestStart;
      if (candidate >= 0 && candidate <= 120000) ttfbMs = Math.round(candidate);
    }
  } catch {
    // Navigation timing unavailable
  }

  const observers = [];
  const observeType = (type, buffered, handler) => {
    try {
      if (PerformanceObserver.supportedEntryTypes && !PerformanceObserver.supportedEntryTypes.includes(type)) {
        return;
      }
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) handler(entry);
      });
      obs.observe({ type, buffered });
      observers.push(obs);
    } catch {
      // Unsupported PerformanceObserver entry type
    }
  };

  observeType("largest-contentful-paint", true, (entry) => {
    if (Number.isFinite(entry.startTime)) lcpMs = Math.round(entry.startTime);
  });

  observeType("layout-shift", true, (entry) => {
    if (!entry.hadRecentInput && Number.isFinite(entry.value)) {
      clsScore += entry.value;
    }
  });

  observeType("event", true, (entry) => {
    if (entry.interactionId && Number.isFinite(entry.duration)) {
      inpMs = inpMs === null ? Math.round(entry.duration) : Math.max(inpMs, Math.round(entry.duration));
    }
  });

  const vitalDedup = `wv-${getTelemetrySessionKey()}-${Math.floor(Date.now() / 1000)}-${route}`.slice(0, 120);
  const flushVitals = () => {
    if (flushed) return;
    if (lcpMs === null && inpMs === null && ttfbMs === null && clsScore === 0) return;
    flushed = true;
    for (const obs of observers) {
      try {
        obs.disconnect();
      } catch {}
    }
    void sendTelemetryEvent({
      eventType: "web_vital",
      portalRole,
      route,
      routeLabel,
      lcpMs,
      inpMs,
      clsScore,
      ttfbMs,
      dedupKey: vitalDedup,
    });
  };

  globalThis.document?.addEventListener("visibilitychange", () => {
    if (globalThis.document.visibilityState === "hidden") flushVitals();
  });
  globalThis.window.addEventListener("pagehide", flushVitals, { once: true });
}
