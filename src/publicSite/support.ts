import { HOSTING_SUPPORT_SLA } from "./assets/portalCatalog.js";

const escapeSupportHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const supportIcon = (path: string) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;

const supportNav = [
  ["overview", "Overview", "M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6"],
  ["queue", "Support queue", "M4 5h16v12H8l-4 4zM8 9h8M8 13h5"],
  ["performance", "Performance", "M4 19V9M10 19V5M16 19v-7M22 19H2"],
  ["guidance", "Playbook", "M4 5c3-1 6 0 8 2 2-2 5-3 8-2v14c-3-1-6 0-8 2-2-2-5-3-8-2zM12 7v14"],
  ["settings", "Account &amp; security", "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11zM9 12l2 2 4-4"],
] as const;

export function supportScreen() {
  return `<div class="admin-shell support-shell" data-support>
    <a class="admin-skip" href="#support-main">Skip to workspace</a>
    <header class="admin-header support-header">
      <a class="admin-brand" href="/support/" aria-label="CEDA Support Officer workspace"><img src="/assets/ceda.png" alt="CEDA" width="70" height="44"><span>Innovation <small>SUPPORT</small></span></a>
      <div class="admin-header-right support-identity" data-support-account hidden>
        <a class="admin-notification-bell support-bell" href="#queue" data-support-bell aria-label="Active support requests" title="View support queue">
          ${supportIcon("M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9M10 21h4")}
          <span class="support-bell-count" data-support-bell-count hidden>0</span>
        </a>
        <a class="admin-identity" href="#settings"><span data-support-name>Support Officer</span><span>Support Officer</span></a>
        <button type="button" class="admin-logout" data-support-logout>Log out</button>
      </div>
    </header>
    <div class="admin-layout support-layout" data-support-layout>
      <aside class="admin-sidebar support-sidebar" data-support-menu aria-label="Support Officer workspace" hidden>
        <div class="admin-sidebar-top">
          <p class="admin-sidebar-label">WORKSPACE</p>
          <button type="button" class="admin-sidebar-toggle" data-support-menu-toggle aria-label="Collapse workspace menu" aria-expanded="true" aria-controls="support-navigation">${supportIcon("m14 5-7 7 7 7M20 5v14")}</button>
        </div>
        <nav id="support-navigation" aria-label="Support sections">
          ${supportNav.map(([id, label, path], index) => `<a href="#${id}" aria-label="${label}" title="${label}"${index === 0 ? ' aria-current="page"' : ""}>${supportIcon(path)}<span>${label}</span></a>`).join("")}
        </nav>
        <div class="admin-sidebar-note"><span class="admin-status-dot"></span><span>Secure support workspace</span></div>
      </aside>

      <main id="support-main" class="admin-content support-main" tabindex="-1">
        <p class="admin-status-message support-status" data-support-status role="status">Checking support access.</p>
        <button type="button" class="admin-button-secondary" data-support-retry hidden>Try again</button>

        <div data-support-root hidden>
          <section id="overview" class="support-section" aria-labelledby="support-overview-title">
            <div class="admin-dashboard-bar support-dashboard-bar">
              <p>SUPPORT OFFICER <strong data-support-avail-label>Available</strong> <small data-support-hours-badge></small></p>
              <time data-support-date></time>
            </div>
            <div class="admin-welcome support-welcome">
              <div>
                <h1 id="support-overview-title">Overview</h1>
                <span data-support-first-name hidden>Support Officer</span>
              </div>
              <div class="support-welcome-controls">
                <div class="support-availability-wrap">
                  <span class="support-control-label">Current availability</span>
                  <div class="support-availability-group" role="group" aria-label="Current availability">
                    ${["Available", "Busy", "Offline"].map((statusName, idx) => `<button type="button" class="support-availability-btn is-${statusName.toLowerCase()}" data-support-availability="${statusName}" aria-pressed="${idx === 0}"><span class="support-avail-dot" aria-hidden="true"></span>${statusName}</button>`).join("")}
                  </div>
                </div>
                <button type="button" class="admin-button-secondary support-refresh" data-support-refresh>Refresh</button>
              </div>
            </div>

            <section class="support-metrics support-kpi-grid" aria-label="Support workload summary">
              <article class="admin-overview-panel support-kpi-card"><div class="support-kpi-top"><span class="support-kpi-label">Open requests</span></div><div class="support-kpi-body"><strong class="support-kpi-value" data-support-metric="open">0</strong></div><small class="support-kpi-caption">All unresolved support requests</small></article>
              <article class="admin-overview-panel support-kpi-card"><div class="support-kpi-top"><span class="support-kpi-label">New requests</span></div><div class="support-kpi-body"><strong class="support-kpi-value" data-support-metric="new">0</strong></div><small class="support-kpi-caption">Requests that have not been opened by an officer</small></article>
              <article class="admin-overview-panel support-kpi-card"><div class="support-kpi-top"><span class="support-kpi-label">Urgent requests</span></div><div class="support-kpi-body"><strong class="support-kpi-value" data-support-metric="urgent">0</strong></div><small class="support-kpi-caption">High-priority or overdue cases</small></article>
              <article class="admin-overview-panel support-kpi-card"><div class="support-kpi-top"><span class="support-kpi-label">Resolved today</span></div><div class="support-kpi-body"><strong class="support-kpi-value" data-support-metric="resolvedToday">0</strong></div><small class="support-kpi-caption">Requests completed during the current day</small></article>
            </section>

            <div class="support-overview-lower" data-support-overview-panels></div>
          </section>

          <section id="queue" class="admin-work-section support-section" hidden aria-labelledby="support-queue-section-title">
          <div class="support-section-head">
            <div>
              <h2 id="support-queue-section-title">Support queue</h2>
            </div>
            <span class="support-queue-pill-count" data-support-count>0 requests</span>
          </div>

          <div class="admin-surface support-active-chats-bar" data-support-active-chats hidden aria-label="My concurrent active live chats"></div>

          <section class="support-workspace admin-surface" data-support-workspace aria-label="Support queue and conversation view">
            <aside class="support-queue" aria-labelledby="support-queue-title">
              <div class="support-panel-heading">
                <div><p class="eyebrow">Requests</p><h3 id="support-queue-title">Queue</h3></div>
                <button type="button" class="admin-button-secondary support-reset-filters" data-support-reset-filters hidden>Reset</button>
              </div>
              <div class="support-pill-bar" role="group" aria-label="Queue filters" data-support-state-pills>
                ${[
                  ["all", "All"],
                  ["new", "New"],
                  ["urgent", "Urgent"],
                  ["Resolved", "Resolved"],
                ].map(([key, label], idx) => `<button type="button" class="support-pill-tab" data-support-state-pill="${key}" aria-pressed="${idx === 0}">${label}</button>`).join("")}
              </div>
              <div class="support-filters">
                <label><span>Search</span><input type="search" data-support-search placeholder="Ticket ref, innovator, app ref or subject"></label>
                <label class="visually-hidden-select"><span>Status</span><select data-support-filter><option value="all">All</option><option value="new">New</option><option value="urgent">Urgent</option><option value="Resolved">Resolved</option></select></label>
              </div>
              <div class="support-ticket-list" data-support-list aria-live="polite"></div>
            </aside>
            <section class="support-conversation" data-support-conversation aria-labelledby="support-conversation-title" hidden></section>
          </section>
        </section>

        <section id="performance" class="admin-work-section support-section" hidden aria-labelledby="support-performance-title">
          <div class="support-section-head">
            <div>
              <h2 id="support-performance-title">Performance summary</h2>
              <p class="support-section-copy">Personal turnaround metrics for <strong data-support-perf-name>you</strong>. Team metrics remain in the Admin portal.</p>
            </div>
            <div class="support-conv-actions">
              <span class="support-queue-pill-count" data-support-perf-scope>Personal officer metrics</span>
              <button type="button" class="admin-button-secondary" data-support-export-csv>Export chat analytics (CSV)</button>
            </div>
          </div>
          <div class="support-perf-grid" data-support-performance-grid aria-live="polite"></div>
          <div class="admin-surface" data-support-chat-analytics aria-live="polite"></div>
        </section>

        <section id="guidance" class="admin-work-section support-section support-playbook" hidden aria-labelledby="support-guidance-title">
          <div class="support-section-head">
            <div><p class="eyebrow">STANDARDS &amp; REFERENCE</p><h2 id="support-guidance-title">Support playbook &amp; escalation policy</h2></div>
          </div>
          <div class="support-playbook-grid">
            <article class="admin-overview-panel">
              <div class="support-playbook-icon is-teal">${supportIcon("M12 3v3M5.6 5.6l2.1 2.1M3 12h3M5.6 18.4l2.1-2.1M12 18v3M16.3 16.3l2.1 2.1M18 12h3M16.3 7.7l2.1-2.1M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8")}</div>
              <h3>Optimus Prime human handoffs</h3>
              <p>When Optimus Prime escalates a question, read the applicant's consented context, address missing portal guidance cleanly, and move the ticket from Open to Investigating on first response.</p>
            </article>
            <article class="admin-overview-panel">
              <div class="support-playbook-icon is-rust">${supportIcon("M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z")}</div>
              <h3>Role separation &amp; privacy</h3>
              <p>Support Officers do not score, unlock, or release innovation assessments. Always keep assessment recommendations impartial and log a brief internal note (5+ chars) with every update.</p>
            </article>
            <article class="admin-overview-panel">
              <div class="support-playbook-icon is-blue">${supportIcon("M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7")}</div>
              <h3>Submission &amp; evidence rules</h3>
              <p>Applicants may attach up to 12 applicant records, 8 supplementary documents, and 4 section files (max 10 MB each: PDF, DOCX, PPTX, XLSX, JPG, PNG) plus HTTPS video links.</p>
            </article>
            <article class="admin-overview-panel" id="support-hosting-sla">
              <div class="support-playbook-icon is-teal">${supportIcon("M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11zM9 12l2 2 4-4")}</div>
              <h3>Hosting support &amp; fault remediation SLAs</h3>
              <p>${escapeSupportHtml(HOSTING_SUPPORT_SLA.availabilityTarget)}. ${escapeSupportHtml(HOSTING_SUPPORT_SLA.supportHours)}.</p>
              <dl class="support-facts-list">
                ${HOSTING_SUPPORT_SLA.tiers.map((tier) => `<div><dt>${escapeSupportHtml(tier.severity)}</dt><dd>Ack ${escapeSupportHtml(tier.acknowledgement)} · Contain ${escapeSupportHtml(tier.containment)} · Resolve ${escapeSupportHtml(tier.resolutionTurnaround)}: ${escapeSupportHtml(tier.scope)}</dd></div>`).join("")}
                <div><dt>Recovery targets</dt><dd>RPO ${escapeSupportHtml(HOSTING_SUPPORT_SLA.backupRecovery.rpo)} · RTO ${escapeSupportHtml(HOSTING_SUPPORT_SLA.backupRecovery.rto)} · Rollback ${escapeSupportHtml(HOSTING_SUPPORT_SLA.backupRecovery.rollbackTurnaround)}</dd></div>
                <div><dt>Escalation channels</dt><dd>${escapeSupportHtml(HOSTING_SUPPORT_SLA.channels.portalQueue)} · ${escapeSupportHtml(HOSTING_SUPPORT_SLA.channels.email)}</dd></div>
              </dl>
            </article>
          </div>
        </section>

        <section id="settings" class="admin-work-section support-section support-security" hidden aria-labelledby="support-settings-title">
          <div class="support-section-head">
            <div><p class="eyebrow">PROFILE &amp; MFA</p><h2 id="support-settings-title">Account &amp; security</h2></div>
          </div>
          <div class="support-security-grid">
            <article class="admin-overview-panel">
              <h3>Support Officer identity</h3>
              <dl class="support-facts-list">
                <div><dt>Full name</dt><dd data-support-profile-name>Support Officer</dd></div>
                <div><dt>Email address</dt><dd data-support-profile-email>Verified session</dd></div>
                <div><dt>Role</dt><dd>Support Officer · Queue triage &amp; applicant messaging</dd></div>
                <div><dt>Authenticator status</dt><dd data-support-mfa-status>Checking session…</dd></div>
              </dl>
              <div class="support-security-actions">
                <button type="button" class="admin-button-secondary" data-support-signout-others>Sign out other devices</button>
              </div>
            </article>

            <article class="admin-overview-panel">
              <h3>Authenticator app (2FA)</h3>
              <p class="admin-help">Protect your Support Officer account with a 6-digit TOTP authenticator app.</p>
              <div data-support-mfa-box>
                <button type="button" class="admin-cta" data-support-enroll-mfa>Set up or verify authenticator</button>
                <div class="support-mfa-setup" data-support-mfa-setup hidden>
                  <img data-support-mfa-qr alt="Authenticator QR code" width="180" height="180">
                  <output class="support-mfa-secret" data-support-mfa-secret aria-label="Authenticator manual setup key"></output>
                </div>
                <form class="support-mfa-form" data-support-mfa-form hidden>
                  <label><span>Six-digit code</span><input name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="000000"></label>
                  <button type="submit" class="admin-cta">Verify session</button>
                </form>
              </div>
              <p class="admin-help support-form-feedback" data-support-mfa-feedback role="status"></p>
            </article>

            <article class="admin-overview-panel">
              <h3>Update password</h3>
              <p class="admin-help">Use 12 to 72 UTF-8 bytes with uppercase, lowercase, a number and a symbol.</p>
              <form class="support-password-form" data-support-password-form>
                <label><span>New password</span><input name="password" type="password" minlength="12" maxlength="72" autocomplete="new-password" required></label>
                <label><span>Confirm password</span><input name="confirm" type="password" minlength="12" maxlength="72" autocomplete="new-password" required></label>
                <button type="submit" class="admin-cta">Update password</button>
              </form>
              <p class="admin-help support-form-feedback" data-support-pw-feedback role="status"></p>
            </article>
          </div>
        </section>
        </div>
      </main>
    </div>
  </div>`;
}
