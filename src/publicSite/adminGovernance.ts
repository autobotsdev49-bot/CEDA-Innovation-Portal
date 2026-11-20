const notice = `<div class="admin-demo-notice" role="note"><span class="admin-demo-dot" aria-hidden="true"></span><div><strong>Workspace preview</strong><span>These records are illustrative. Publishing, sending, exports and policy updates require protected server services.</span></div><span class="admin-demo-tag">Not connected</span></div>`;

function icon(path: string) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

export function adminGovernance() {
  return `<section id="content" class="admin-work-section" hidden aria-labelledby="content-title">
    <div class="admin-users-heading">
      <div><h2 id="content-title">Content management</h2><p>Review public website pages, frequently asked questions, announcements and partner profiles.</p></div>
      <button type="button" class="admin-cta" data-create-content>${icon("M12 5v14M5 12h14")} Prepare draft</button>
    </div>
    ${notice}
    <div class="admin-user-stats" aria-label="Content summary">
      <article class="admin-user-stat"><span class="admin-user-stat-icon">${icon("M4 4h16v16H4zM8 8h8M8 12h8M8 16h5")}</span><div><span>Total items</span><strong data-content-stat="total">4</strong><small>All public categories</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M5 12l4 4L19 6")}</span><div><span>Pages & FAQs</span><strong data-content-stat="guidance">2</strong><small>Guidance & public info</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon admins">${icon("M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9M10 21h4")}</span><div><span>Announcements</span><strong data-content-stat="announcements">2</strong><small>Notices & partners</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon inactive">${icon("M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z")}</span><div><span>Tab drafts</span><strong data-content-stat="drafts">0</strong><small>Prepared in this session</small></div></article>
    </div>
    <div class="admin-surface admin-directory-surface">
      <div class="admin-directory-tabs-bar">
        <div class="governance-tabs" role="group" aria-label="Content type">${["All","Public pages","FAQs","Announcements","Partners"].map((label,i)=>`<button type="button" data-content-type="${label}" aria-pressed="${i===0}">${label}</button>`).join("")}</div>
      </div>
      <form data-content-search class="admin-directory-toolbar">
        <label class="admin-directory-query"><span class="visually-hidden">Search content by title or summary</span>${icon("M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0")}<input name="query" type="search" maxlength="100" autocomplete="off" placeholder="Search content by title or summary"></label>
        <label><span class="visually-hidden">Filter by stage</span><select name="stage"><option value="">All stages</option><option value="Published preview">Published preview</option><option value="Awaiting review">Awaiting review</option><option value="Tab draft">Tab draft</option></select></label>
        <button type="reset" class="admin-button-secondary">Clear</button>
      </form>
      <div class="admin-table" tabindex="0" role="region" aria-label="Content directory">
        <table><thead><tr><th>Title</th><th>Type</th><th>Audience</th><th>Stage</th><th>Updated</th><th>Action</th></tr></thead><tbody data-content-rows></tbody></table>
      </div>
      <div class="admin-directory-footer"><span data-content-count role="status" aria-live="polite"></span></div>
    </div>
    <section data-content-editor hidden>
      <p class="admin-modal-intro">A draft stays in this tab. Publication needs server approval and revision history.</p>
      <form data-content-form class="admin-form">
        <label>Type<select name="kind"><option>Public pages</option><option>FAQs</option><option>Announcements</option><option>Partners</option></select></label>
        <label>Title<input name="title" required maxlength="160" placeholder="Enter content title"></label>
        <label class="admin-form-wide">Content<textarea name="body" required minlength="10" maxlength="5000" rows="5" placeholder="Write the approved public content or revision..."></textarea></label>
        <label class="admin-form-wide">Source or approval note<textarea name="reason" required minlength="5" maxlength="500" rows="3" placeholder="Record the CEDA policy source or reviewer reference..."></textarea></label>
        <button type="submit">Save tab draft</button>
      </form>
    </section>
  </section>

  <section data-notification-center hidden class="admin-notification-center">
    <div class="admin-demo-notice" role="note"><span class="admin-demo-dot" aria-hidden="true"></span><div><strong>Notification center preview</strong><span>Inspect transactional templates, delivery alerts and prepare announcement drafts. No email or push message is sent from this preview.</span></div><span class="admin-demo-tag">Sample data</span></div>
    <div class="admin-user-stats admin-notification-stats" aria-label="Notifications summary">
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M5 12l4 4L19 6")}</span><div><span>Event templates</span><strong data-notification-stat="templates">5</strong><small>Transactional events</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon">${icon("M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9M10 21h4")}</span><div><span>Channels</span><strong>In-app + Email</strong><small>Server outbox pending</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon admins">${icon("M12 8v4M12 16h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0")}</span><div><span>Delivery alerts</span><strong>1</strong><small>Requires investigation</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon inactive">${icon("M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z")}</span><div><span>Session drafts</span><strong data-notification-stat="drafts">0</strong><small>Prepared in this tab</small></div></article>
    </div>
    <div class="case-detail-actions">
      <button type="button" class="admin-cta" data-notification-open="announcement">${icon("M12 5v14M5 12h14")} Prepare announcement</button>
      <button type="button" class="admin-button-secondary" data-notification-open="template">Prepare template</button>
      <a href="#followup" class="admin-button-secondary" data-notification-followup>View delivery failures</a>
    </div>
    <div class="case-tabs" role="tablist" aria-label="Notification views">
      <button type="button" role="tab" aria-selected="true" data-notification-tab="inbox">Inbox & delivery alerts</button>
      <button type="button" role="tab" aria-selected="false" data-notification-tab="templates">Event templates</button>
    </div>
    <div data-notification-pane="inbox" class="admin-surface admin-directory-surface">
      <div class="admin-table" tabindex="0" role="region" aria-label="Recent administrator notifications">
        <table><thead><tr><th>Notification / alert</th><th>Category</th><th>Status</th><th>When</th><th>Action</th></tr></thead><tbody data-notification-inbox-rows></tbody></table>
      </div>
    </div>
    <div data-notification-pane="templates" hidden class="admin-surface admin-directory-surface">
      <div class="admin-table" tabindex="0" role="region" aria-label="Event-triggered notification templates">
        <table><thead><tr><th>Event template</th><th>Channel</th><th>Audience</th><th>Status</th><th>Action</th></tr></thead><tbody data-notification-template-rows></tbody></table>
      </div>
    </div>
    <p data-notification-draft role="status" class="admin-help">No draft prepared in this tab.</p>
    <section data-notification-editor hidden>
      <button type="button" class="case-back" data-notification-return>← Back to notifications</button>
      <p class="admin-modal-intro">Tab draft only. Nothing will be sent until provider credentials and the server outbox are connected.</p>
      <form data-notification-form class="admin-form">
        <label>Kind<select name="kind"><option>Announcement</option><option>Email template</option><option>Push template</option></select></label>
        <label>Title / subject<input name="title" required maxlength="160" placeholder="Update on your CEDA innovation assessment"></label>
        <label class="admin-form-wide">Message<textarea name="message" required minlength="10" maxlength="2000" rows="5" placeholder="Write the notification or template wording..."></textarea></label>
        <button type="submit">Keep draft in tab</button>
      </form>
    </section>
  </section>

  <section id="audit" class="admin-work-section" hidden aria-labelledby="audit-title">
    <div class="admin-users-heading">
      <div><h2 id="audit-title">Audit logs</h2><p>Inspect protected administrator audit records and portal operational activity in one place.</p></div>
      <button type="button" class="admin-button-secondary" data-audit-refresh>Refresh logs</button>
    </div>
    <div class="admin-user-stats" aria-label="Audit and activity summary">
      <article class="admin-user-stat"><span class="admin-user-stat-icon admins">${icon("M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z")}</span><div><span>Protected audit rows</span><strong data-audit-stat="protected">—</strong><small>Current database page</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0")}</span><div><span>Activity events</span><strong data-audit-stat="activity">4</strong><small>Sample operational stream</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon">${icon("M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8")}</span><div><span>Access boundary</span><strong>Admin + MFA</strong><small>Verified session required</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M5 12l4 4L19 6")}</span><div><span>Audit policy</span><strong>Append-only</strong><small>Botswana time (CAT)</small></div></article>
    </div>
    <div class="admin-surface admin-directory-surface">
      <div class="admin-directory-tabs-bar">
        <div class="governance-tabs" role="tablist" aria-label="Audit and activity views">
          <button type="button" role="tab" data-audit-tab="protected" aria-selected="true">Protected audit log</button>
          <button type="button" role="tab" data-audit-tab="activity" aria-selected="false">Portal activity stream (Sample)</button>
        </div>
      </div>
      <div data-audit-pane="protected">
        <form data-audit-search class="admin-directory-toolbar">
          <label class="admin-directory-query"><span class="visually-hidden">Search actor, record or action</span>${icon("M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0")}<input name="query" type="search" maxlength="100" autocomplete="off" placeholder="Search actor, record or action"></label>
          <button type="submit" class="admin-button-secondary">Search</button>
        </form>
        <p role="status" data-audit-state class="admin-directory-note">Loading protected audit records.</p>
        <div class="admin-table" tabindex="0" role="region" aria-label="Protected administrator audit log">
          <table><thead><tr><th>When (Botswana)</th><th>Actor</th><th>Action</th><th>Record</th><th>Reason</th></tr></thead><tbody data-audit-rows></tbody></table>
        </div>
        <div class="admin-directory-footer">
          <span>Protected database audit feed</span>
          <div class="admin-pagination"><button type="button" data-audit-previous class="admin-button-secondary">Previous</button><span data-audit-page>Page 1</span><button type="button" data-audit-next class="admin-button-secondary">Next</button></div>
        </div>
      </div>
      <div data-audit-pane="activity" hidden>
        <form data-activity-filters class="admin-directory-toolbar">
          <label class="admin-directory-query"><span class="visually-hidden">Search activity</span>${icon("M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0")}<input type="search" name="query" placeholder="Search actor, action or record" maxlength="100" autocomplete="off"></label>
          <label><span class="visually-hidden">Actor role</span><select name="role"><option value="">All roles</option><option>Administrator</option><option>Support Officer</option><option>Innovator</option><option>System</option></select></label>
          <button type="reset" class="admin-button-secondary">Clear</button>
        </form>
        <p class="admin-directory-note">Sample operational activity across portal roles for interface review. Switch to Protected audit log for database audit records.</p>
        <div class="admin-table" tabindex="0" role="region" aria-label="Sample activity log">
          <table><thead><tr><th>When (Botswana)</th><th>Actor</th><th>Role</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody data-activity-rows></tbody></table>
        </div>
        <div class="admin-directory-footer" data-activity-count role="status"></div>
      </div>
    </div>
  </section>

  <section id="settings" class="admin-work-section" hidden aria-labelledby="settings-title">
    <div class="admin-users-heading">
      <div><h2 id="settings-title">Account & settings</h2><p>Manage your administrator profile, multi-factor authenticator security and portal policies in one place.</p></div>
      <button type="button" data-open-security class="admin-cta">${icon("M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11ZM9 12l2 2 4-4")} Manage authenticator</button>
    </div>
    <div class="admin-user-stats" aria-label="Account and settings summary">
      <article class="admin-user-stat"><span class="admin-user-stat-icon">${icon("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-2a8 8 0 0 1 16 0v2")}</span><div><span>Signed-in profile</span><strong data-profile-card-name>Administrator</strong><small>Active verified session</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon admins">${icon("M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11ZM9 12l2 2 4-4")}</span><div><span>Account security</span><strong>TOTP MFA</strong><small>Required for access writes</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7")}</span><div><span>Evidence policy</span><strong>4 files</strong><small>Max 10 MB per section</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M5 12l4 4L19 6")}</span><div><span>Assessment model</span><strong>6 criteria</strong><small>1–5 unweighted scale</small></div></article>
    </div>
    <div class="governance-tabs admin-settings-tabs" role="tablist" aria-label="Account and settings sections">
      <button type="button" role="tab" data-settings-tab="profile" aria-selected="true">Profile & sessions</button>
      <button type="button" role="tab" data-settings-tab="security" aria-selected="false">Account security (MFA)</button>
      <button type="button" role="tab" data-settings-tab="policies" aria-selected="false">Portal policies & settings</button>
    </div>
    <div data-settings-pane="profile">
      <div class="admin-overview-grid">
        <article class="admin-overview-panel">
          <div class="admin-panel-heading"><div><p class="eyebrow">VERIFIED IDENTITY</p><h3>Administrator profile</h3></div><span class="admin-account-badge is-active">active</span></div>
          <dl class="admin-ai-draft admin-settings-list">
            <dt>Full name</dt><dd data-profile-name>Administrator</dd>
            <dt>Email address</dt><dd data-profile-email>Verified session</dd>
            <dt>Role & scope</dt><dd><span class="admin-role-badge admin-role-admin">Administrator</span> Platform administration, user access & sectors</dd>
          </dl>
          <p class="admin-help">Your signed-in identity is verified from Supabase Auth and your protected profile record.</p>
        </article>
        <article class="admin-overview-panel">
          <div class="admin-panel-heading"><div><p class="eyebrow">CREDENTIALS & DEVICES</p><h3>Password & active sessions</h3></div><span class="admin-live-tag"><i></i>Current session</span></div>
          <dl class="admin-ai-draft admin-settings-list">
            <dt>Password policy</dt><dd>12–128 characters with uppercase, lowercase, number and symbol. Existing passwords can never be viewed.</dd>
            <dt>Password changes</dt><dd>Handled through verified account recovery so credentials stay inside Supabase Auth.</dd>
            <dt>Active session</dt><dd>This browser tab holds an authenticated session token. Use Log out in the header or below to revoke it immediately.</dd>
          </dl>
          <div class="case-detail-actions">
            <button type="button" class="admin-button-secondary" data-switch-settings-tab="security">Open account security</button>
            <button type="button" class="admin-button-secondary" data-settings-logout>Log out of this session</button>
          </div>
        </article>
      </div>
    </div>
    <div data-settings-pane="security" hidden>
      <div class="admin-overview-grid">
        <article class="admin-overview-panel">
          <div class="admin-panel-heading"><div><p class="eyebrow">MULTI-FACTOR AUTHENTICATION</p><h3>Authenticator protection</h3></div><span class="admin-role-badge admin-role-admin">AAL2 required</span></div>
          <p>Set up an authenticator app to generate a rotating six-digit verification code. Multi-factor verification is enforced by the database before creating accounts or changing user roles and permissions.</p>
          <dl class="admin-ai-draft admin-settings-list">
            <dt>Verification method</dt><dd>Time-based One-Time Password (TOTP) authenticator app</dd>
            <dt>Protected operations</dt><dd>Creating staff/user accounts (<code>admincreate</code> / <code>admin_prepare_invitation</code>) and changing roles or Lead powers (<code>admin_assign_role</code>)</dd>
          </dl>
          <div class="case-detail-actions">
            <button type="button" data-open-security class="admin-cta">Set up or verify authenticator</button>
          </div>
        </article>
        <article class="admin-overview-panel">
          <div class="admin-panel-heading"><div><p class="eyebrow">ACCESS SAFEGUARDS</p><h3>Database security boundaries</h3></div><span class="admin-sector-badge sector-published">Enforced</span></div>
          <dl class="admin-ai-draft admin-settings-list">
            <dt>Administrator continuity</dt><dd>Role changes reject self-modification and preserve the final active Administrator account.</dd>
            <dt>Audit trail requirement</dt><dd>Every user creation, role assignment and sector update requires a 5–500 character reason recorded in <code>admin_audit</code>.</dd>
            <dt>Separation of duties</dt><dd>Administrators manage platform operations and access but cannot score applications, alter votes or release assessment decisions.</dd>
          </dl>
        </article>
      </div>
    </div>
    <div data-settings-pane="policies" hidden>
      ${notice}
      <div class="admin-overview-grid">
        <article class="admin-overview-panel">
          <div class="admin-panel-heading"><div><p class="eyebrow">PORTAL CONFIGURATION</p><h3>Submission & assessment rules</h3></div><span class="admin-demo-tag">Baseline policy</span></div>
          <dl class="admin-ai-draft admin-settings-list">
            <dt>Submission rules</dt><dd>Individual and registered company applicants; up to 4 supporting files per section (10 MB max) plus validated HTTPS video links.</dd>
            <dt>Assessment access</dt><dd>All active Assessors receive default access to submitted applications unless excluded by a Lead Assessor for conflict of interest.</dd>
            <dt>Scoring & release</dt><dd>Six predefined criteria scored 1–5 without automatic weighting. Outcome release requires a designated Lead / decision-maker.</dd>
            <dt>Notification delivery</dt><dd>Transactional notices require approved templates and server-held EmailJS / FCM credentials. Open the header notification bell to inspect templates.</dd>
          </dl>
          <div class="governance-actions">
            <a href="#sectors" class="overview-link">Manage sectors →</a>
            <a href="#content" class="overview-link">Review public content →</a>
          </div>
        </article>
        <article class="admin-overview-panel">
          <div class="admin-panel-heading"><div><p class="eyebrow">CHANGE CONTROL</p><h3>Prepare policy change draft</h3></div><span class="admin-demo-tag">Tab draft</span></div>
          <p>Before portal settings can be modified in production, each change requires a version, reviewer, justification and rollback path.</p>
          <form data-settings-form class="admin-form">
            <label class="admin-form-wide">Policy area<select name="area"><option>Submission & evidence rules</option><option>Assessment & review workflow</option><option>Notification & delivery preferences</option><option>Public portal configuration</option></select></label>
            <label class="admin-form-wide">Proposed setting update<input name="proposal" required maxlength="160" placeholder="Describe the proposed threshold or rule adjustment"></label>
            <label class="admin-form-wide">Reason & rollback plan<textarea name="reason" required minlength="5" maxlength="500" rows="3" placeholder="Explain why this policy change is needed and how to revert if required"></textarea></label>
            <button type="submit">Keep policy draft in tab</button>
          </form>
          <p data-settings-draft-status role="status" class="admin-help">No policy change draft prepared in this tab.</p>
        </article>
      </div>
    </div>
    <div data-security-panel hidden class="admin-security-card">
      <div><span class="admin-metric-mark">MFA</span><p>Use an authenticator app to generate a rotating six-digit code for sensitive administrator actions.</p><button type="button" data-enroll-factor>Set up authenticator</button></div>
      <div data-factor-setup hidden class="admin-factor-setup"><img data-factor-qr alt="Scan this code in your authenticator app" width="200" height="200"></div>
      <form data-mfa-form class="admin-form"><label class="admin-form-wide">Authenticator code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="6-digit code"></label><button type="submit">Verify authenticator</button></form>
    </div>
  </section>`;
}
