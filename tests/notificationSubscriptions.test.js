import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  classifyEmailErrorResponse,
  computeEmailRetryDelaySeconds,
  EmailCircuitBreaker,
  parseEmailProviderConfig,
  renderAlertEmailContent,
  sendEmailMessage,
} from "../supabase/functions/email-dispatch/email.ts";
import {
  dispatchQueuedNotifications,
  FREE_ALERT_FEE_AMOUNT,
  FREE_ALERT_FEE_LABEL,
  mergeIncrementalNotifications,
  normalizeAlertPreferences,
  summarizeApplicationAlertSubscription,
} from "../src/publicSite/assets/notificationsDomain.js";

process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://cedatest.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_test_key_123456";

const {
  FREE_ALERT_PLAN_LABEL,
  pollInnovatorNotifications,
  toggleSubmissionAlerts,
  triggerEmailDispatch,
  updateAlertPreferences,
} = await import("../mobile/notificationsApi.ts?test=notifSub");

const { dispatchAdminNotifications, sendAdminTestEmail } = await import("../mobile/auth.ts?test=notifSub");

test("email-dispatch config parser handles Resend, EmailJS and unconfigured fallback safely", () => {
  const unconfigured = parseEmailProviderConfig({});
  assert.equal(unconfigured.configured, false);
  assert.equal(unconfigured.provider, "none");

  const resend = parseEmailProviderConfig({
    RESEND_API_KEY: "re_test_key_123",
    EMAIL_FROM: "CEDA <alerts@ceda.org.bw>",
    NEXT_PUBLIC_APP_URL: "https://ceda.example.bw/",
  });
  assert.equal(resend.configured, true);
  assert.equal(resend.provider, "resend");
  assert.equal(resend.portalBaseUrl, "https://ceda.example.bw");

  const emailjs = parseEmailProviderConfig({
    EMAILJS_SERVICE_ID: "svc_123",
    EMAILJS_TEMPLATE_ID: "tpl_456",
    EMAILJS_PUBLIC_KEY: "pub_789",
    EMAILJS_PRIVATE_KEY: "sec_000",
  });
  assert.equal(emailjs.configured, true);
  assert.equal(emailjs.provider, "emailjs");
  assert.equal(emailjs.emailjsServiceId, "svc_123");
});

test("EmailCircuitBreaker, retry backoff and error classification handle transient and auth faults cleanly", () => {
  const breaker = new EmailCircuitBreaker(3, 60_000);
  const t0 = 1_000_000;
  assert.equal(breaker.canExecute(t0), true);
  breaker.recordFailure(t0);
  breaker.recordFailure(t0 + 10);
  assert.equal(breaker.canExecute(t0 + 20), true);
  breaker.recordFailure(t0 + 30);
  assert.equal(breaker.canExecute(t0 + 40), false);
  assert.ok(breaker.remainingCooldownMs(t0 + 40) > 50_000);
  assert.equal(breaker.canExecute(t0 + 61_000), true);

  assert.equal(classifyEmailErrorResponse(401, "Invalid key").outcome, "auth");
  assert.equal(classifyEmailErrorResponse(429, "Rate limited").outcome, "transient");
  assert.equal(classifyEmailErrorResponse(503, "Service busy").tripCircuit, true);
  assert.equal(classifyEmailErrorResponse(400, "Malformed email").tripCircuit, false);

  assert.equal(computeEmailRetryDelaySeconds(1, 0), 30);
  assert.equal(computeEmailRetryDelaySeconds(2, 0), 60);
  assert.ok(computeEmailRetryDelaySeconds(5, 0) <= 900);
});

test("renderAlertEmailContent escapes HTML, routes by role and embeds free-of-charge unsubscribe notice", () => {
  const rendered = renderAlertEmailContent(
    {
      id: "q-1",
      title: "Stage <Awarded> Update",
      message: "Your innovation <Solar Dryer> was conferred an official award.",
      category: "Award conferred",
      applicationRef: "CEDA-2026-009",
      targetHash: "#applications",
      attempts: 1,
    },
    {
      userId: "u-1",
      email: "innovator@example.bw",
      fullName: "Kabo <Tester>",
      role: "innovator",
    },
    "https://portal.ceda.test",
  );

  assert.match(rendered.subject, /^\[CEDA-2026-009\] Stage/);
  assert.equal(rendered.html.includes("<Solar Dryer>"), false);
  assert.ok(rendered.html.includes("&lt;Solar Dryer&gt;"));
  assert.ok(rendered.html.includes("Free Alert Service (No Charge"));
  assert.ok(rendered.html.includes("P0.00"));
  assert.equal(rendered.portalLink, "https://portal.ceda.test/account/#applications");
  assert.equal(rendered.settingsLink, "https://portal.ceda.test/account/#settings");

  const committee = renderAlertEmailContent(
    { id: "q-2", title: "Committee update", message: "Moved to Award.", attempts: 1, targetHash: "#overview" },
    { userId: "c-1", email: "member@ceda.test", fullName: "Observer", role: "committee" },
    "https://portal.ceda.test",
  );
  assert.equal(committee.portalLink, "https://portal.ceda.test/committee/#overview");
});

test("sendEmailMessage delivers cleanly across both Resend and EmailJS APIs", async () => {
  const calls = [];
  const mockFetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body || "{}")) });
    return new Response(JSON.stringify({ id: "msg-resend-1" }), { status: 200 });
  };

  const resendCfg = parseEmailProviderConfig({ RESEND_API_KEY: "re_live_123" });
  const item = { id: "q-10", title: "Review started", message: "Panel review opened.", attempts: 1, applicationRef: "APP-10" };
  const rec = { userId: "u-10", email: "applicant@example.bw", fullName: "Thabo" };

  const resendOut = await sendEmailMessage(resendCfg, rec, item, mockFetch);
  assert.equal(resendOut.status, "sent");
  assert.equal(resendOut.providerMessageId, "msg-resend-1");
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.deepEqual(calls[0].body.to, ["applicant@example.bw"]);

  const emailJsCfg = parseEmailProviderConfig({
    EMAILJS_SERVICE_ID: "svc_1",
    EMAILJS_TEMPLATE_ID: "tpl_1",
    EMAILJS_PUBLIC_KEY: "pub_1",
  });
  const jsOut = await sendEmailMessage(emailJsCfg, rec, item, mockFetch);
  assert.equal(jsOut.status, "sent");
  assert.equal(calls[1].url, "https://api.emailjs.com/api/v1.0/email/send");
  assert.equal(calls[1].body.template_params.to_email, "applicant@example.bw");
});

test("free alert subscription helpers default to subscribed at P0.00 and respect opt-outs", async () => {
  assert.equal(FREE_ALERT_FEE_AMOUNT, 0);
  assert.equal(FREE_ALERT_FEE_LABEL, FREE_ALERT_PLAN_LABEL);
  assert.match(FREE_ALERT_FEE_LABEL, /No charge|P0\.00/);

  const defaults = normalizeAlertPreferences({});
  assert.equal(defaults.emailNotifications, true);
  assert.equal(defaults.pushNotifications, true);
  assert.equal(defaults.notifyStatus, true);
  assert.equal(defaults.feeAmount, 0);

  const subOn = summarizeApplicationAlertSubscription({ isSubscribed: true }, defaults);
  assert.equal(subOn.isSubscribed, true);
  assert.equal(subOn.activeChannelsLabel, "Portal + Email + Push");
  assert.equal(subOn.badgeText, "Free alerts on (P0.00)");

  const subNoEmail = summarizeApplicationAlertSubscription({ isSubscribed: true }, { emailNotifications: false });
  assert.equal(subNoEmail.emailActive, false);
  assert.equal(subNoEmail.activeChannelsLabel, "Portal + Push");

  const unsub = summarizeApplicationAlertSubscription({ isSubscribed: false }, defaults);
  assert.equal(unsub.isSubscribed, false);
  assert.equal(unsub.activeChannelsLabel, "Paused (Unsubscribed)");

  const merged = mergeIncrementalNotifications(
    [{ id: "n1", title: "Old" }, { id: "n2", title: "Older" }],
    [{ id: "n3", title: "New" }, { id: "n1", title: "Old" }],
  );
  assert.deepEqual(merged.map((n) => n.id), ["n3", "n1", "n2"]);

  const dispatchedUrls = [];
  await dispatchQueuedNotifications(
    { url: "https://cedatest.supabase.co", key: "sb_publishable_test" },
    "jwt-123",
    { mode: "drain" },
    async (url) => {
      dispatchedUrls.push(String(url));
      return new Response(JSON.stringify({ ok: true, sent: 1 }), { status: 200 });
    },
  );
  assert.ok(dispatchedUrls.some((u) => u.endsWith("/functions/v1/email-dispatch")));
  assert.ok(dispatchedUrls.some((u) => u.endsWith("/functions/v1/fcm-dispatch")));
});

test("SQL migration and web/mobile bundles wire zero-charge subscriptions, email outbox and live sync cleanly", async () => {
  const sql = await readFile(
    new URL("../supabase/migrations/20261123050000NotificationDeliveryAndSubscriptions.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /create table if not exists public\.application_alert_subscriptions/);
  assert.match(sql, /fee_amount numeric\(10, 2\) not null default 0\.00 check \(fee_amount = 0\.00\)/);
  assert.match(sql, /create or replace function ceda_private\.user_wants_alert/);
  assert.match(sql, /create or replace function public\.email_lease_queue_batch/);
  assert.match(sql, /create or replace function public\.email_complete_queue_item/);
  assert.match(sql, /create or replace function public\.innovator_toggle_submission_alerts/);
  assert.match(sql, /create or replace function public\.innovator_update_alert_preferences/);
  assert.match(sql, /create or replace function public\.innovator_poll_notifications/);
  assert.match(sql, /enqueue_committee_stage_alerts/);
  assert.match(sql, /supabase_realtime/);

  const distInnovatorJs = await readFile(new URL("../dist/assets/innovator.js", import.meta.url), "utf8");
  const distAdminJs = await readFile(new URL("../dist/assets/admin.js", import.meta.url), "utf8");
  const innovatorHtml = await readFile(new URL("../dist/account/index.html", import.meta.url), "utf8");
  const adminHtml = await readFile(new URL("../dist/admin/index.html", import.meta.url), "utf8");

  assert.match(distInnovatorJs, /innovator_toggle_submission_alerts/);
  assert.match(distInnovatorJs, /innovator_poll_notifications/);
  assert.match(distInnovatorJs, /innovator_update_alert_preferences/);
  assert.match(distAdminJs, /admin_retry_notification/);
  assert.match(distAdminJs, /admin_send_test_email/);
  assert.ok(innovatorHtml.includes('name="emailNotifications"'));
  assert.ok(innovatorHtml.includes('name="pushNotifications"'));
  assert.ok(adminHtml.includes("data-notification-dispatch-now"));
  assert.ok(adminHtml.includes("data-notification-test-email"));
  assert.equal(/\sstyle="/i.test(innovatorHtml), false);
  assert.equal(/\sstyle="/i.test(adminHtml), false);
});

test("mobile subscription, polling and admin email/push dispatch APIs send valid payloads", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body || "{}")) });
    if (String(url).includes("/functions/v1/")) {
      return new Response(JSON.stringify({ ok: true, configured: true, sent: 1 }), { status: 200 });
    }
    if (String(url).endsWith("admin_notifications_overview")) {
      return new Response(JSON.stringify({ templates: [], inbox: [], emailSummary: { queuedEmail: 0, sentEmail: 1, failedEmail: 0 } }), { status: 200 });
    }
    if (String(url).endsWith("admin_send_test_email")) {
      return new Response(JSON.stringify({ queueId: "q-99", overview: { templates: [], inbox: [] } }), { status: 200 });
    }
    if (String(url).endsWith("innovator_poll_notifications")) {
      return new Response(JSON.stringify({ notifications: [], unreadCount: 0, applicationStatuses: [] }), { status: 200 });
    }
    return new Response(JSON.stringify([{ applicationId: "app-1", applicationRef: "REF-1", isSubscribed: false }]), { status: 200 });
  };

  try {
    const subs = await toggleSubmissionAlerts("tok-1", { applicationId: "app-1", isSubscribed: false });
    assert.equal(subs[0].isSubscribed, false);

    await updateAlertPreferences("tok-1", {
      emailEnabled: true,
      pushEnabled: false,
      notifyStatus: true,
      notifyClarifications: true,
      notifyMessages: false,
    });

    await pollInnovatorNotifications("tok-1", "2026-11-23T06:00:00Z");

    const emailRes = await triggerEmailDispatch("tok-1", { mode: "drain", limit: 10 });
    assert.equal(emailRes.ok, true);

    const adminAccount = { token: "adm-jwt", name: "Admin", role: "admin", expiresAt: Date.now() + 60_000 };
    const testEmail = await sendAdminTestEmail(adminAccount);
    assert.equal(testEmail.dispatch.ok, true);

    const drained = await dispatchAdminNotifications(adminAccount);
    assert.equal(drained.dispatch.ok, true);
    assert.equal(drained.emailDispatch?.ok, true);

    assert.ok(calls.some((c) => c.url.endsWith("/rest/v1/rpc/innovator_toggle_submission_alerts")));
    assert.ok(calls.some((c) => c.url.endsWith("/rest/v1/rpc/innovator_update_alert_preferences") && c.body.p_email_enabled === true));
    assert.ok(calls.some((c) => c.url.endsWith("/rest/v1/rpc/innovator_poll_notifications")));
    assert.ok(calls.some((c) => c.url.endsWith("/functions/v1/email-dispatch")));
    assert.ok(calls.some((c) => c.url.endsWith("/functions/v1/fcm-dispatch")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
