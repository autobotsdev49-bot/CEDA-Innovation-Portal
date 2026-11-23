function icon(path: string) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

export function adminGovernance() {
  return `<section id="content" class="admin-work-section" hidden aria-labelledby="content-title">
    <div class="admin-users-heading">
      <div><h2 id="content-title">Content, forms &amp; FAQs management</h2><p>Upload, modify or delete application forms, accompanying copies, FAQs, regulatory authority contacts and portal pages.</p></div>
      <div class="admin-form-actions">
        <button type="button" class="admin-button-secondary" data-open-form-builder>${icon("M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2")} Form &amp; checklist builder</button>
        <button type="button" class="admin-cta" data-create-content>${icon("M12 5v14M5 12h14")} Prepare content or upload</button>
      </div>
    </div>
    <div class="admin-user-stats" aria-label="Content summary">
      <article class="admin-user-stat"><span class="admin-user-stat-icon">${icon("M4 4h16v16H4zM8 8h8M8 12h8M8 16h5")}</span><div><span>Total items</span><strong data-content-stat="total">0</strong><small>All portal categories</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M5 12l4 4L19 6")}</span><div><span>Forms &amp; copies</span><strong data-content-stat="forms">0</strong><small>Forms, templates &amp; guides</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon admins">${icon("M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9M10 21h4")}</span><div><span>FAQs &amp; regulators</span><strong data-content-stat="guidance">0</strong><small>FAQs &amp; regulatory contacts</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon inactive">${icon("M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z")}</span><div><span>Drafts</span><strong data-content-stat="drafts">0</strong><small>In draft stage</small></div></article>
    </div>
    <div class="admin-surface admin-directory-surface">
      <div class="admin-directory-tabs-bar">
        <div class="governance-tabs" role="group" aria-label="Content type">${["All","Application form","Accompanying copies","FAQs","Regulatory contacts","Public pages","Announcements","Partners"].map((label,i)=>`<button type="button" data-content-type="${label}" aria-pressed="${i===0}">${label}</button>`).join("")}</div>
      </div>
      <form data-content-search class="admin-directory-toolbar">
        <label class="admin-directory-query"><span class="visually-hidden">Search content by title or summary</span>${icon("M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0")}<input name="query" type="search" maxlength="100" autocomplete="off" placeholder="Search content, regulator, attachment or FAQ"></label>
        <label><span class="visually-hidden">Filter by stage</span><select name="stage"><option value="">All stages</option><option value="Published">Published</option><option value="Awaiting review">Awaiting review</option><option value="Draft">Draft</option><option value="Archived">Archived</option></select></label>
        <button type="reset" class="admin-button-secondary">Clear</button>
      </form>
      <div class="admin-table" tabindex="0" role="region" aria-label="Content directory">
        <table><thead><tr><th>Title</th><th>Type</th><th>Audience</th><th>Stage</th><th>Updated</th><th>Action</th></tr></thead><tbody data-content-rows></tbody></table>
      </div>
      <div class="admin-directory-footer"><span data-content-count role="status" aria-live="polite"></span></div>
    </div>

    <div class="admin-surface admin-form-builder-surface" id="admin-form-builder" data-form-builder-section>
      <div class="admin-users-heading">
        <div>
          <h3>Application form &amp; accompanying copies builder</h3>
          <p class="admin-help">Configure the live Innovator submission form title, file limits, step guidance, required accompanying copies and custom questions. Active version: <strong data-form-config-version>v1</strong>.</p>
        </div>
      </div>
      <form data-form-config-form class="admin-form">
        <label class="admin-form-wide">Application form title<input name="formTitle" required maxlength="160" placeholder="CEDA Innovation Portal: Official Submission Form"></label>
        <label>Form version code<input name="formVersion" required maxlength="32" placeholder="2026.1"></label>
        <label>Max evidence file size (MB)<input name="maxEvidenceFileMb" type="number" min="1" max="50" required value="15"></label>
        <label class="admin-form-wide">Introductory guidance<textarea name="introGuidance" rows="2" maxlength="600" placeholder="Guidance displayed at the top of the submission form"></textarea></label>
        <label class="admin-form-wide">Video evidence link note<input name="maxVideoUrlNote" maxlength="300" placeholder="Guidance on submitting HTTPS pitch or product demo links"></label>

        <div class="admin-form-wide admin-builder-block">
          <div class="admin-builder-head">
            <h4>Submission form steps &amp; guidance (Steps 1 to 12)</h4>
          </div>
          <div class="admin-builder-list" data-builder-steps></div>
        </div>

        <div class="admin-form-wide admin-builder-block">
          <div class="admin-builder-head">
            <h4>Accompanying copies checklist</h4>
            <button type="button" class="admin-button-secondary" data-builder-add-doc>Add accompanying copy</button>
          </div>
          <div class="admin-builder-list" data-builder-docs></div>
        </div>

        <div class="admin-form-wide admin-builder-block">
          <div class="admin-builder-head">
            <h4>Custom submission fields</h4>
            <button type="button" class="admin-button-secondary" data-builder-add-field>Add custom field</button>
          </div>
          <p class="admin-help">Add extra mandatory or optional questions into any form step without redeploying code.</p>
          <div class="admin-builder-list" data-builder-fields></div>
        </div>

        <label class="admin-form-wide">Change summary / audit reason<textarea name="reason" required minlength="5" maxlength="500" rows="2" placeholder="Document why the application form structure or required copies changed"></textarea></label>
        <div class="admin-form-actions">
          <button type="submit">Save form configuration</button>
        </div>
      </form>
    </div>

    <section data-content-editor hidden>
      <p class="admin-modal-intro">Revisions, file attachments and deletes are saved with version tracking and an administrator audit entry.</p>
      <form data-content-form class="admin-form">
        <label>Type<select name="kind"><option>Application form</option><option>Accompanying copies</option><option>FAQs</option><option>Regulatory contacts</option><option>Public pages</option><option>Announcements</option><option>Partners</option></select></label>
        <label>Publishing stage<select name="stage"><option value="Published">Published (visible to public &amp; innovators)</option><option value="Awaiting review">Awaiting review</option><option value="Draft">Draft</option><option value="Archived">Archived</option></select></label>
        <label class="admin-form-wide">Title<input name="title" required maxlength="160" placeholder="Enter content, FAQ question, document or authority title"></label>
        <div class="admin-form-wide admin-builder-block" data-regulatory-fields hidden>
          <h4>Regulatory authority contact fields</h4>
          <div class="admin-form-grid">
            <label>Authority code<input name="authorityCode" maxlength="32" placeholder="e.g. CIPA, BURS, BOBS, BOCRA"></label>
            <label>Phone / toll-free<input name="authorityPhone" maxlength="120" placeholder="+267 ..."></label>
            <label>Email<input name="authorityEmail" type="email" maxlength="140" placeholder="enquiries@authority.org.bw"></label>
            <label>Official website<input name="authorityWebsite" type="url" maxlength="300" placeholder="https://www.authority.org.bw"></label>
            <label class="admin-form-wide">Physical &amp; postal address<input name="authorityAddress" maxlength="240" placeholder="Plot / Street, Gaborone"></label>
            <label class="admin-form-wide">Regulatory mandate / scope<input name="authorityScope" maxlength="240" placeholder="Registration, permits, testing or licensing covered"></label>
          </div>
        </div>
        <label class="admin-form-wide">Upload file attachment (optional PDF, DOCX, XLSX, PPTX, CSV or image up to 10 MB)<input name="documentFile" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg"></label>
        <div class="admin-form-wide" data-content-attachment-wrap hidden>
          <p class="admin-help" data-content-attachment-current></p>
          <label class="admin-check"><input type="checkbox" name="clearAttachment"> Remove current attachment on save</label>
        </div>
        <label class="admin-form-wide">External reference or download URL (optional)<input name="externalUrl" type="url" maxlength="500" placeholder="https://..."></label>
        <label class="admin-form-wide">Content / instructions<textarea name="body" required minlength="10" maxlength="5000" rows="5" placeholder="Write the approved FAQ answer, document instructions or regulatory overview..."></textarea></label>
        <label class="admin-form-wide">Source or approval note<textarea name="reason" required minlength="5" maxlength="500" rows="2" placeholder="Record the CEDA policy source or reviewer reference..."></textarea></label>
        <button type="submit">Save content</button>
      </form>
    </section>

    <section data-content-delete-panel hidden>
      <p class="admin-modal-intro">Deleting removes this item from the portal immediately. An audit entry recording the target and your reason is permanently kept.</p>
      <form data-content-delete-form class="admin-form">
        <p class="admin-form-wide"><strong data-content-delete-target>Selected item</strong></p>
        <label class="admin-form-wide">Audit reason for deletion<textarea name="reason" required minlength="5" maxlength="500" rows="3" placeholder="Explain why this form, file, FAQ or notice is being removed..."></textarea></label>
        <div class="admin-form-actions">
          <button type="submit" class="admin-button-danger">Confirm permanent delete</button>
          <button type="button" class="admin-button-secondary" data-content-delete-cancel>Cancel</button>
        </div>
      </form>
    </section>
  </section>

  <section data-notification-center hidden class="admin-notification-center">
    <div class="admin-user-stats admin-notification-stats" aria-label="Notifications summary">
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M5 12l4 4L19 6")}</span><div><span>Email queue</span><strong data-notification-stat="email">0 sent</strong><small data-notification-stat="email-detail">0 queued · 0 failed</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon">${icon("M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9M10 21h4")}</span><div><span>Push devices</span><strong data-notification-stat="push">0 devices</strong><small data-notification-stat="push-detail">0 queued · 0 sent</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon admins">${icon("M12 8v4M12 16h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0")}</span><div><span>Free alerts active</span><strong data-notification-stat="subscriptions">0 active</strong><small data-notification-stat="subscriptions-detail">No charge (Free, P0.00)</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon inactive">${icon("M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z")}</span><div><span>Templates &amp; saves</span><strong data-notification-stat="templates">5</strong><small data-notification-stat="drafts">0 saved in session</small></div></article>
    </div>
    <div class="case-detail-actions">
      <button type="button" class="admin-cta" data-notification-open="announcement">${icon("M12 5v14M5 12h14")} Prepare announcement</button>
      <button type="button" class="admin-button-secondary" data-notification-open="template">Prepare template</button>
      <button type="button" class="admin-button-secondary" data-notification-dispatch-now>Dispatch queued alerts</button>
      <button type="button" class="admin-button-secondary" data-notification-test-email>Send test email</button>
      <button type="button" class="admin-button-secondary" data-notification-test-push>Send test push</button>
      <a href="#followup" class="admin-button-secondary" data-notification-followup>View delivery failures</a>
    </div>
    <div class="case-tabs" role="tablist" aria-label="Notification views">
      <button type="button" role="tab" aria-selected="true" data-notification-tab="inbox">Inbox &amp; delivery queue</button>
      <button type="button" role="tab" aria-selected="false" data-notification-tab="templates">Event templates</button>
    </div>
    <div data-notification-pane="inbox" class="admin-surface admin-directory-surface">
      <div class="admin-table" tabindex="0" role="region" aria-label="Recent administrator notifications">
        <table><thead><tr><th>Notification / alert</th><th>Channel &amp; category</th><th>Delivery status</th><th>When</th><th>Action</th></tr></thead><tbody data-notification-inbox-rows></tbody></table>
      </div>
    </div>
    <div data-notification-pane="templates" hidden class="admin-surface admin-directory-surface">
      <div class="admin-table" tabindex="0" role="region" aria-label="Event-triggered notification templates">
        <table><thead><tr><th>Event template</th><th>Channel</th><th>Audience</th><th>Status</th><th>Action</th></tr></thead><tbody data-notification-template-rows></tbody></table>
      </div>
    </div>
    <p data-notification-draft role="status" class="admin-help">Live email, push, and portal alert outbox synced with PostgreSQL.</p>
    <section data-notification-editor hidden>
      <button type="button" class="case-back" data-notification-return>← Back to notifications</button>
      <p class="admin-modal-intro">Updates are saved and recorded in the administrator audit log.</p>
      <form data-notification-form class="admin-form">
        <label>Kind<select name="kind"><option>Announcement</option><option>Email template</option><option>Push template</option></select></label>
        <label>Audience<select name="audience"><option>All visitors</option><option>Innovator</option><option>Assessor</option><option>Support Officer</option><option>Committee</option><option>Administrator</option></select></label>
        <label>Channel<select name="channel"><option>In-app + Email + Push</option><option>In-app + Email</option><option>In-app + Push</option><option>Email</option><option>Push</option></select></label>
        <label class="admin-form-wide">Title / subject<input name="title" required maxlength="160" placeholder="Update on your CEDA innovation assessment"></label>
        <label class="admin-form-wide">Message<textarea name="message" required minlength="10" maxlength="2000" rows="5" placeholder="Write the notification or template wording..."></textarea></label>
        <button type="submit">Save &amp; queue notification</button>
      </form>
    </section>
  </section>

  <section id="audit" class="admin-work-section" hidden aria-labelledby="audit-title">
    <div class="admin-users-heading">
      <div><h2 id="audit-title">Audit logs &amp; portal activity</h2><p>Inspect every user login, portal action and logout across roles, or filter by a specific user.</p></div>
      <button type="button" class="admin-button-secondary" data-audit-refresh>Refresh logs</button>
    </div>
    <div class="admin-user-stats" aria-label="Audit and activity summary">
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0")}</span><div><span>Portal activity logs</span><strong data-audit-stat="activity">0</strong><small>Logins, actions &amp; logouts</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon">${icon("M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8")}</span><div><span>Tracked users</span><strong data-audit-stat="users">0</strong><small>Filterable by user</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon admins">${icon("M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z")}</span><div><span>Protected audit rows</span><strong data-audit-stat="protected">0</strong><small>Current audit page</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M5 12l4 4L19 6")}</span><div><span>Audit policy</span><strong>Append-only</strong><small>Botswana time (CAT)</small></div></article>
    </div>
    <div class="admin-surface admin-directory-surface">
      <div class="admin-directory-tabs-bar">
        <div class="governance-tabs" role="tablist" aria-label="Audit and activity views">
          <button type="button" role="tab" data-audit-tab="activity" aria-selected="true">Portal activity</button>
          <button type="button" role="tab" data-audit-tab="protected" aria-selected="false">Protected audit log</button>
        </div>
      </div>
      <div data-audit-pane="activity">
        <form data-activity-filters class="admin-directory-toolbar">
          <label class="admin-directory-query"><span class="visually-hidden">Search activity</span>${icon("M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0")}<input type="search" name="query" placeholder="Search user, action, section or record" maxlength="100" autocomplete="off"></label>
          <label><span class="visually-hidden">Filter by user</span><select name="user" data-activity-user-filter><option value="">All users</option></select></label>
          <label><span class="visually-hidden">Filter by role</span><select name="role"><option value="">All roles</option><option value="Administrator">Administrator</option><option value="Assessor">Assessor</option><option value="Support Officer">Support Officer</option><option value="Innovator">Innovator</option></select></label>
          <label><span class="visually-hidden">Filter by event type</span><select name="category"><option value="">All events (Login, Activity &amp; Logout)</option><option value="Login">Login</option><option value="Activity">Portal activity</option><option value="Logout">Logout</option></select></label>
          <button type="reset" class="admin-button-secondary">Clear filters</button>
        </form>
        <div data-activity-user-summary class="admin-activity-user-summary" hidden></div>
        <p class="admin-directory-note" data-activity-note>Every user login, portal navigation, action and logout is logged below. Select any user to inspect their complete session history.</p>
        <div class="admin-table" tabindex="0" role="region" aria-label="Portal activity log">
          <table><thead><tr><th>When (Botswana)</th><th>User</th><th>Role</th><th>Event</th><th>Action</th><th>Target / record</th><th>Details</th></tr></thead><tbody data-activity-rows></tbody></table>
        </div>
        <div class="admin-directory-footer" data-activity-count role="status"></div>
      </div>
      <div data-audit-pane="protected" hidden>
        <form data-audit-search class="admin-directory-toolbar">
          <label class="admin-directory-query"><span class="visually-hidden">Search actor, record or action</span>${icon("M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0")}<input name="query" type="search" maxlength="100" autocomplete="off" placeholder="Search actor, record or action"></label>
          <label><span class="visually-hidden">Filter audit by user</span><select name="user" data-audit-user-filter><option value="">All users</option></select></label>
          <button type="submit" class="admin-button-secondary">Search</button>
        </form>
        <p role="status" data-audit-state class="admin-directory-note">Loading protected audit records.</p>
        <div class="admin-table" tabindex="0" role="region" aria-label="Protected administrator audit log">
          <table><thead><tr><th>When (Botswana)</th><th>Actor</th><th>Action</th><th>Record</th><th>Reason / details</th></tr></thead><tbody data-audit-rows></tbody></table>
        </div>
        <div class="admin-directory-footer">
          <span>Protected administrator audit feed</span>
          <div class="admin-pagination"><button type="button" data-audit-previous class="admin-button-secondary">Previous</button><span data-audit-page>Page 1</span><button type="button" data-audit-next class="admin-button-secondary">Next</button></div>
        </div>
      </div>
    </div>
  </section>

  <section id="settings" class="admin-work-section" hidden aria-labelledby="settings-title">
    <div class="admin-users-heading">
      <div><h2 id="settings-title">Account & settings</h2><p>Manage account access, security preferences and portal rules.</p></div>
      <button type="button" data-open-security class="admin-cta">${icon("M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11ZM9 12l2 2 4-4")} Manage authenticator</button>
    </div>
    <div class="admin-user-stats" aria-label="Account and settings summary">
      <article class="admin-user-stat"><span class="admin-user-stat-icon admins">${icon("M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11ZM9 12l2 2 4-4")}</span><div><span>Account security</span><strong>Authenticator</strong><small>Protects sensitive actions</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7")}</span><div><span>Evidence policy</span><strong>4 files</strong><small>Max 10 MB per section</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M5 12l4 4L19 6")}</span><div><span>Assessment model</span><strong data-admin-stat-criteria>6 criteria</strong><small data-admin-stat-criteria-sub>Weighted 100% · v1 rubric</small></div></article>
    </div>
    <div class="governance-tabs admin-settings-tabs" role="tablist" aria-label="Account and settings sections">
      <button type="button" role="tab" data-settings-tab="profile" aria-selected="true">Profile and sessions</button>
      <button type="button" role="tab" data-settings-tab="security" aria-selected="false">Account security</button>
      <button type="button" role="tab" data-settings-tab="criteria" aria-selected="false">Evaluation criteria & weights</button>
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
          <p class="admin-help">Review your account details and confirm that they are correct.</p>
        </article>
        <article class="admin-overview-panel">
          <div class="admin-panel-heading"><div><p class="eyebrow">ACCOUNT ACCESS</p><h3>Password and sessions</h3></div><span class="admin-live-tag"><i></i>Current session</span></div>
          <dl class="admin-ai-draft admin-settings-list">
            <dt>Password guidance</dt><dd>Use at least 12 characters with uppercase and lowercase letters, a number and a symbol.</dd>
            <dt>Password changes</dt><dd>Use the secure account recovery process when you need to change your password.</dd>
            <dt>Current session</dt><dd>You are currently signed in on this browser. Log out when using a shared device.</dd>
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
          <div class="admin-panel-heading"><div><p class="eyebrow">ADDITIONAL VERIFICATION</p><h3>Authenticator protection</h3></div><span class="admin-role-badge admin-role-admin">Required</span></div>
          <p>Use an authenticator app to generate a six digit verification code before completing sensitive actions.</p>
          <dl class="admin-ai-draft admin-settings-list">
            <dt>Verification method</dt><dd>Authenticator app verification code</dd>
            <dt>Protected actions</dt><dd>Creating users, changing roles and updating sensitive account access.</dd>
          </dl>
          <div class="case-detail-actions">
            <button type="button" data-open-security class="admin-cta">Set up or verify authenticator</button>
          </div>
        </article>
        <article class="admin-overview-panel">
          <div class="admin-panel-heading"><div><p class="eyebrow">ACCESS CONTROLS</p><h3>Administrator safeguards</h3></div><span class="admin-sector-badge sector-published">Active</span></div>
          <dl class="admin-ai-draft admin-settings-list">
            <dt>Account protection</dt><dd>Your own administrator role cannot be changed from this screen.</dd>
            <dt>Change reasons</dt><dd>Sensitive administrative changes require a clear reason.</dd>
            <dt>Role boundaries</dt><dd>Assessment scoring and outcome decisions remain with the authorised assessment team.</dd>
          </dl>
        </article>
      </div>
    </div>
    <div data-settings-pane="policies" hidden>
      <div class="admin-overview-grid">
        <article class="admin-overview-panel">
          <div class="admin-panel-heading"><div><p class="eyebrow">PORTAL CONFIGURATION</p><h3>Submission & assessment rules</h3></div><span class="admin-sector-badge sector-published">Active policy</span></div>
          <dl class="admin-ai-draft admin-settings-list">
            <dt>Submission rules</dt><dd>Individual and registered company applicants; up to 4 supporting files per section (10 MB max) plus validated HTTPS video links.</dd>
            <dt>Assessment access</dt><dd>All active Assessors receive default access to submitted applications unless excluded by a Lead Assessor for conflict of interest.</dd>
            <dt>Scoring and release</dt><dd>Configurable weighted evaluation criteria scored from 1 to 5 (total weight 100%). In-flight assessment rounds keep their pinned rubric snapshot, and outcome release requires an authorised Lead Assessor.</dd>
            <dt>Notifications</dt><dd>Approved templates are used for account, application and service updates. Open the notification bell to review them.</dd>
          </dl>
          <div class="governance-actions">
            <button type="button" class="admin-button-secondary" data-switch-settings-tab="criteria">Configure criteria & weights</button>
            <a href="#sectors" class="overview-link">Manage sectors →</a>
            <a href="#content" class="overview-link">Review public content →</a>
          </div>
        </article>
        <article class="admin-overview-panel">
          <div class="admin-panel-heading"><div><p class="eyebrow">CHANGE CONTROL</p><h3>Update policy configuration</h3></div></div>
          <p>Portal setting changes require a clear reason and a plan for reversing the change if necessary.</p>
          <form data-settings-form class="admin-form">
            <label class="admin-form-wide">Policy area<select name="area"><option>Submission & evidence rules</option><option>Assessment & review workflow</option><option>Notification & delivery preferences</option><option>Public portal configuration</option></select></label>
            <label class="admin-form-wide">Proposed setting update<input name="proposal" required maxlength="160" placeholder="Describe the proposed threshold or rule adjustment"></label>
            <label class="admin-form-wide">Reason and reversal plan<textarea name="reason" required minlength="5" maxlength="500" rows="3" placeholder="Explain why this change is needed and how it can be reversed"></textarea></label>
            <button type="submit">Save policy update</button>
          </form>
          <p data-settings-draft-status role="status" class="admin-help">Active portal policy configuration is applied across submission and review workflows.</p>
        </article>
      </div>
    </div>
    <div data-settings-pane="criteria" hidden>
      <div class="admin-overview-grid admin-criteria-grid">
        <article class="admin-overview-panel admin-criteria-editor-panel">
          <div class="admin-panel-heading">
            <div>
              <p class="eyebrow">WEIGHTED RUBRIC GOVERNANCE</p>
              <h3>Evaluation criteria & weights</h3>
            </div>
            <span class="admin-sector-badge sector-published" data-criteria-version-badge>v1 active</span>
          </div>
          <p class="admin-criteria-lead">Define what innovation panels score and how heavily each dimension counts toward a 100% total. Saving publishes a new versioned rubric for upcoming rounds without changing in-flight or historical rounds.</p>
          <div class="admin-criteria-meter-card">
            <div class="admin-criteria-meter-top">
              <div>
                <span class="admin-criteria-meter-label">Total active weight allocation</span>
                <strong data-criteria-total-label>100% / 100%</strong>
              </div>
              <span class="admin-criteria-allocation-badge is-balanced" data-criteria-balance-badge>Balanced (100%)</span>
            </div>
            <progress class="admin-criteria-meter" data-criteria-total-meter max="100" value="100"></progress>
            <div class="admin-criteria-toolbar">
              <button type="button" class="admin-button-secondary" data-criteria-add>+ Add criterion</button>
              <button type="button" class="admin-button-secondary" data-criteria-equalize>Equalize 100%</button>
              <button type="button" class="admin-button-secondary" data-criteria-reset>Restore baseline 6</button>
            </div>
            <div class="admin-criteria-starters" aria-label="Quick-add starter criteria">
              <span class="admin-criteria-starter-label">Starter criteria:</span>
              <button type="button" class="admin-criteria-chip" data-criteria-starter="Commercial viability" data-criteria-starter-desc="Evidence of paying customers, revenue unit economics, and competitive positioning." data-criteria-starter-weight="15">+ Commercial viability</button>
              <button type="button" class="admin-criteria-chip" data-criteria-starter="Job creation and inclusion" data-criteria-starter-desc="Projected citizen employment, youth/women participation, and regional uplift." data-criteria-starter-weight="15">+ Job creation & inclusion</button>
              <button type="button" class="admin-criteria-chip" data-criteria-starter="IP and regulatory readiness" data-criteria-starter-desc="Intellectual property ownership, licensing pathway, and compliance readiness." data-criteria-starter-weight="10">+ IP & regulatory readiness</button>
            </div>
          </div>
          <form data-criteria-form class="admin-form">
            <div class="admin-criteria-list" data-criteria-list></div>
            <div class="admin-criteria-footer-fields">
              <label>
                Pass benchmark threshold (%)
                <input name="passThreshold" data-criteria-threshold type="number" min="20" max="100" step="1" value="60" required>
              </label>
              <label class="admin-form-wide">
                Audit reason for rubric update
                <textarea name="reason" data-criteria-reason required minlength="5" maxlength="500" rows="2" placeholder="Explain why criteria, weights or benchmark changed (recorded in administrator audit log)"></textarea>
              </label>
            </div>
            <div class="admin-criteria-submit-row">
              <button type="submit" data-criteria-save>Save evaluation rubric</button>
              <p data-criteria-status role="status" class="admin-help">Loaded active evaluation criteria.</p>
            </div>
          </form>
        </article>
        <article class="admin-overview-panel admin-criteria-history-panel">
          <div class="admin-panel-heading">
            <div>
              <p class="eyebrow">VERSIONED SNAPSHOTS</p>
              <h3>Rubric version history</h3>
            </div>
            <span class="admin-live-tag"><i></i>Audit pinned</span>
          </div>
          <p class="admin-help">Rounds lock the exact rubric version and weights active when configured so panel evaluations stay reproducible over time.</p>
          <div class="admin-criteria-history" data-criteria-history></div>
        </article>
      </div>
    </div>
    <div data-security-panel hidden class="admin-security-card">
      <div><span class="admin-metric-mark">MFA</span><p>Use an authenticator app to generate a rotating six-digit code for sensitive administrator actions.</p><button type="button" data-enroll-factor>Set up authenticator</button></div>
      <div data-factor-setup hidden class="admin-factor-setup">
        <img data-factor-qr alt="Scan this code in your authenticator app" width="200" height="200">
        <div class="admin-factor-manual"><p>If scanning is unavailable, enter this setup key in your authenticator app:</p><output data-factor-secret aria-label="Authenticator setup key"></output></div>
      </div>
      <form data-mfa-form class="admin-form"><label class="admin-form-wide">Authenticator code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="6-digit code"></label><button type="submit">Verify authenticator</button></form>
    </div>
  </section>`;
}
