const navItems = [
  ["overview", "Overview", "M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6"],
  ["users", "Users and access", "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6M23 11h-6"],
  ["sectors", "Sectors", "M4 5h16v14H4zM8 9h8M8 13h5"],
  ["optimus", "Optimus Prime", "M12 3v3M5.6 5.6l2.1 2.1M3 12h3M5.6 18.4l2.1-2.1M12 18v3M16.3 16.3l2.1 2.1M18 12h3M16.3 7.7l2.1-2.1M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8"],
  ["security", "Account security", "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11ZM9 12l2 2 4-4"],
] as const;

function navIcon(path: string) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

export function adminScreen() {
  return `<div class="admin-shell">
    <a class="admin-skip" href="#admin-main">Skip to main content</a>
    <header class="admin-header">
      <a href="/admin/" class="admin-brand" aria-label="CEDA Innovation administration home"><img src="/assets/ceda.png" alt="CEDA" width="70" height="44"><span>Innovation <small>ADMINISTRATION</small></span></a>
      <div class="admin-header-right"><div class="admin-identity" aria-live="polite"><span data-admin-name>Administrator</span><span data-admin-email></span></div><button type="button" class="admin-logout" data-admin-logout>Log out</button></div>
    </header>
    <div class="admin-layout">
      <aside class="admin-sidebar" aria-label="Admin workspace">
        <p class="admin-sidebar-label">WORKSPACE</p>
        <nav aria-label="Administration sections">${navItems.map(([id, label, path], index) => `<a href="#${id}"${index === 0 ? ' aria-current="page"' : ""}>${navIcon(path)}<span>${label}</span></a>`).join("")}</nav>
        <div class="admin-sidebar-note"><span class="admin-status-dot"></span><span>Secure administrator workspace</span></div>
      </aside>
      <main id="admin-main" class="admin-content">
        <p role="status" data-admin-status class="admin-status-message">Checking administrator access.</p>
        <div data-admin-workspace hidden>
          <section id="overview" class="admin-overview" aria-labelledby="admin-page-title">
            <div class="admin-welcome"><div><p class="eyebrow">CEDA INNOVATION PORTAL</p><h1 id="admin-page-title">Administration overview</h1><p>Manage portal access and services from one secure workspace.</p></div><a href="#users" class="admin-cta">Manage users <span aria-hidden="true">→</span></a></div>
            <div class="admin-section-label"><h2>Service monitoring</h2><p>Live measures will appear here when the data connections are approved and enabled.</p></div>
            <div class="admin-metric-grid" aria-label="Service monitoring status">
              <article class="admin-metric"><div class="admin-metric-top"><span class="admin-metric-mark">OP</span><span class="admin-pending">Not connected</span></div><h3>Optimus Prime</h3><p>AI response time and error monitoring are not configured.</p><a href="#optimus">Review AI guidance <span aria-hidden="true">→</span></a></article>
              <article class="admin-metric"><div class="admin-metric-top"><span class="admin-metric-mark">WEB</span><span class="admin-pending">Not connected</span></div><h3>Website performance</h3><p>Visitor performance and Core Web Vitals are not being collected.</p><span class="admin-muted">Performance monitoring</span></article>
              <article class="admin-metric"><div class="admin-metric-top"><span class="admin-metric-mark">PORTAL</span><span class="admin-pending">Not connected</span></div><h3>Portal activity</h3><p>Sign-ins and workflow activity need privacy-reviewed analytics.</p><span class="admin-muted">Activity monitoring</span></article>
            </div>
            <div class="admin-overview-grid">
              <article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">ACCESS MANAGEMENT</p><h2>People and sectors</h2></div></div><p>Create staff accounts, update access, and maintain the portal's sector list.</p><div class="admin-shortcuts"><a href="#users"><span>Users and roles</span><span aria-hidden="true">→</span></a><a href="#sectors"><span>Sector management</span><span aria-hidden="true">→</span></a></div></article>
              <article class="admin-overview-panel admin-overview-guidance"><p class="eyebrow">AI GOVERNANCE</p><h2>Optimus Prime</h2><p>Manage approved response guidance and CEDA knowledge as the controlled AI settings workflow is built.</p><a href="#optimus" class="admin-inline-link">Open guidance workspace <span aria-hidden="true">→</span></a><p class="admin-note">AI configuration is not connected. No model settings or performance data are being changed here.</p></article>
            </div>
            <div class="admin-next-panel"><div><p class="eyebrow">WORKSPACE STATUS</p><h2>Administration foundations</h2><p>User access, sectors and account security are available. Monitoring and AI controls are staged for later delivery.</p></div><a href="#security" class="admin-secondary-link">Review account security <span aria-hidden="true">→</span></a></div>
          </section>

          <section id="optimus" class="admin-work-section" aria-labelledby="optimus-title"><div class="admin-section-heading"><p class="eyebrow">AI GOVERNANCE</p><h2 id="optimus-title">Optimus Prime guidance</h2><p>Approved CEDA knowledge, response guidance, preview and publishing history are planned for this workspace. These controls are not connected yet.</p></div><div class="admin-placeholder"><span class="admin-pending">Planned</span><h3>Guidance management is not available yet</h3><p>Until the controlled workflow is implemented, administrators cannot change Optimus Prime's instructions or knowledge from this portal.</p></div></section>

          <section id="users" class="admin-work-section" aria-labelledby="users-title"><div class="admin-section-heading"><p class="eyebrow">ACCESS MANAGEMENT</p><h2 id="users-title">Users and access</h2><p>Invite staff, review accounts and change role or sector access with an audit reason.</p></div>
            <div class="admin-surface"><div class="admin-surface-heading"><div><h3>User directory</h3><p>Search by name or email, then review the account's current access.</p></div></div>
              <form data-user-search class="admin-inline"><label>Search name or email<input name="search" maxlength="100" autocomplete="off" placeholder="Search users"></label><button type="submit" class="admin-button-secondary">Search</button></form>
              <div class="admin-table" tabindex="0" role="region" aria-label="User directory"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody data-users></tbody></table></div>
              <div class="admin-pagination"><button type="button" data-previous class="admin-button-secondary">Previous</button><span data-page aria-live="polite">Page 1</span><button type="button" data-next class="admin-button-secondary">Next</button></div>
            </div>
            <div class="admin-form-grid"><div class="admin-surface"><h3>Create user</h3><p>The user receives an invitation to set their own password. Verify your authenticator before creating or changing staff access.</p>
              <form data-create-user class="admin-form"><label>Full name<input name="fullName" required maxlength="120" autocomplete="name"></label><label>Email address<input name="email" type="email" required maxlength="254" autocomplete="email"></label>${accessFields()}<label class="admin-form-wide">Reason<textarea name="reason" required minlength="5" maxlength="500"></textarea></label><button type="submit">Create user and send invitation</button></form>
            </div><section data-edit-role hidden class="admin-surface"><h3>Change access for <span data-edit-name></span></h3><p>Changes are recorded in the administrator audit log.</p><form data-role-form class="admin-form">${accessFields()}<label class="admin-form-wide">Reason<textarea name="reason" required minlength="5" maxlength="500"></textarea></label><div class="admin-form-actions"><button type="submit">Save access</button><button type="button" data-cancel-edit class="admin-button-secondary">Cancel</button></div></form></section></div>
          </section>

          <section id="sectors" class="admin-work-section" aria-labelledby="sectors-title"><div class="admin-section-heading"><p class="eyebrow">PORTAL CONFIGURATION</p><h2 id="sectors-title">Sectors</h2><p>Maintain the sectors shown to applicants. Archiving keeps the historical record.</p></div><div class="admin-form-grid"><div class="admin-surface"><h3>Sector directory</h3><ul data-sector-list class="admin-sector-list"></ul></div><div class="admin-surface"><h3>Create or edit a sector</h3><form data-sector-form class="admin-form"><input name="id" type="hidden"><label class="admin-form-wide">Sector name<input name="name" required minlength="2" maxlength="100"></label><label>Status<select name="status"><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label><label class="admin-form-wide">Reason<textarea name="reason" required minlength="5" maxlength="500"></textarea></label><div class="admin-form-actions"><button type="submit">Save sector</button><button type="reset" class="admin-button-secondary">Clear</button></div></form></div></div></section>

          <section id="security" class="admin-work-section" aria-labelledby="security-title"><div class="admin-section-heading"><p class="eyebrow">ACCOUNT PROTECTION</p><h2 id="security-title">Account security</h2><p>Set up an authenticator app. Multi-factor verification is required for sensitive access changes.</p></div><div class="admin-security-card"><div><span class="admin-metric-mark">MFA</span><h3>Authenticator verification</h3><p>Use an authenticator app to generate a rotating six-digit code.</p><button type="button" data-enroll-factor>Set up authenticator</button></div><div data-factor-setup hidden class="admin-factor-setup"><img data-factor-qr alt="Scan this code in your authenticator app" width="200" height="200"></div><form data-mfa-form class="admin-form"><label class="admin-form-wide">Authenticator code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><button type="submit">Verify authenticator</button></form></div></section>
        </div>
      </main>
    </div>
  </div>`;
}

function accessFields() {
  return `<label>Role<select name="role"><option value="innovator">Innovator</option><option value="assessor">Assessor</option><option value="support">Support Officer</option><option value="admin">Admin</option></select></label>
    <label class="admin-check"><input name="lead" type="checkbox">Lead Assessor powers</label>
    <label class="admin-form-wide">Sector scope<select name="sectors" multiple size="4"></select></label>
    <p class="admin-help admin-form-wide">Sector assignments are optional. Lead powers require the Assessor role.</p>`;
}
