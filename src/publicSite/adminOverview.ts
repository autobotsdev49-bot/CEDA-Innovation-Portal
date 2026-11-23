function icon(path: string) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

export function adminOverview() {
  return `<section id="overview" class="admin-overview" aria-labelledby="admin-page-title">
    <h1 id="admin-page-title" class="visually-hidden">Administrator overview</h1>
    <div class="overview-toolbar"><time data-admin-date></time><div class="overview-toolbar-actions"><label class="visually-hidden" for="overview-period">Reporting period</label><select id="overview-period" data-overview-period><option value="1">Today</option><option value="7" selected>Last 7 days</option><option value="30">Last 30 days</option></select><button class="admin-button-secondary" type="button" data-overview-refresh>Refresh</button><button class="admin-button-secondary" type="button" data-export-csv="executive">Export CSV</button><button class="admin-cta" type="button" data-export-pdf="executive">Print / PDF</button></div></div>
    <p class="overview-updated" data-overview-updated role="status"></p>
    <div class="admin-summary-grid overview-metrics">${[["applications","Submitted applications","applications"],["review","Applications in review","review"],["active","Active visitors now","active"],["visits","Portal page views","traffic"]].map(([key,label,target])=>`<button type="button" class="admin-summary-card" data-overview-open="${target}"><span class="admin-summary-top">${label}</span><strong data-overview-metric="${key}">0</strong><span class="admin-summary-foot">${key === "active" ? "Last 5 minutes" : "Selected period"}</span><svg class="overview-card-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></button>`).join("")}</div>
    <div class="admin-overview-grid overview-charts"><article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">WEBSITE AUDIENCE</p><h2>Page views over time</h2></div><button class="overview-link" type="button" data-overview-open="traffic">View full analytics</button></div><div data-overview-chart></div><p class="admin-help">Portal page views across the selected period. One session can view multiple pages.</p></article><article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">SUBMISSION PIPELINE</p><h2>Application outcomes</h2></div><button type="button" class="overview-link" data-overview-open="applications">View applications</button></div><div class="overview-outcomes" data-overview-outcomes></div><button class="overview-link" type="button" data-overview-open="review">Open in-review applications</button></article></div>
    <div class="admin-overview-grid overview-health"><article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">WEBSITE HEALTH</p><h2>Speed and stability</h2></div></div><div class="overview-health-values"><div><strong>2.1 s</strong><span>Main content load</span></div><div><strong>168 ms</strong><span>Interaction response</span></div><div><strong>0.08</strong><span>Layout shift</span></div></div><button class="overview-link" type="button" data-overview-open="web">View website health</button></article><article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">OPTIMUS PRIME</p><h2>Assistant health</h2></div></div><div class="overview-health-values"><div><strong>98.6%</strong><span>Response success</span></div><div><strong>1.8 s</strong><span>Average response</span></div><div><strong>28</strong><span>Support handoffs</span></div></div><button type="button" class="overview-link" data-overview-open="ai">View AI performance</button><a href="#optimus" class="overview-link">Open Optimus Prime</a></article></div>
    <div class="admin-overview-grid overview-bottom"><article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">FOLLOW UP</p><h2>Admin follow-up</h2></div><button class="overview-link" type="button" data-overview-open="followup">View all matters</button></div><div class="overview-attention" data-overview-attention></div></article><article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">PORTAL UPDATES</p><h2>Recent activity</h2></div><button type="button" class="overview-link" data-overview-open="audit">View audit logs</button></div><ol class="overview-events" data-overview-events></ol></article></div>
    <section data-overview-detail hidden><div data-overview-detail-body></div></section>
  </section>${insightScreens()}`;
}

function insightScreens() {
  return `<section id="analytics" class="admin-work-section" hidden aria-labelledby="analytics-title">
    <div class="admin-users-heading"><div><h2 id="analytics-title">Analytics &amp; real reporting</h2><p>Live participation, application outcomes, sector activity, turnaround SLAs, and audited exports.</p></div><div class="report-toolbar-actions"><label>Period<select data-analytics-period><option value="1">Today</option><option value="7" selected>Last 7 days</option><option value="30">Last 30 days</option></select></label><button type="button" class="admin-button-secondary" data-overview-refresh>Refresh</button><button type="button" class="admin-button-secondary" data-export-csv="executive">Export CSV</button><button type="button" class="admin-cta" data-export-pdf="executive">Print / PDF</button></div></div>
    <p class="admin-help" data-export-status role="status" hidden></p>
    <div class="admin-user-stats" aria-label="Analytics and reporting summary">
      <article class="admin-user-stat"><span class="admin-user-stat-icon">${icon("M3 3v18h18M7 14l4-4 4 3 6-7")}</span><div><span>Page views</span><strong data-analytics-stat="views">0</strong><small>Selected period</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8")}</span><div><span>Active sessions</span><strong data-analytics-stat="active">0</strong><small>Last 5 minutes</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon admins">${icon("M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7")}</span><div><span>Submitted applications</span><strong data-analytics-stat="applications">0</strong><small data-analytics-stat-note="applications">Excludes drafts</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M4 20V4h16v16zM8 16v-4m4 4V8m4 8v-6")}</span><div><span>Approval rate</span><strong data-analytics-stat="approvalRate">N/A</strong><small data-analytics-stat-note="approvalRate">Decided applications</small></div></article>
    </div>
    <p class="admin-help" data-analytics-range></p>
    <div class="admin-overview-grid">
      <article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">TRAFFIC &amp; SUBMISSION TREND</p><h3>Daily views &amp; submissions</h3></div></div><div data-analytics-chart></div><p class="admin-help">Sanitized page-view counts paired with submitted application totals per calendar day (Africa/Gaborone).</p></article>
      <article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">VISITOR DEVICES</p><h3>Device breakdown</h3></div></div><div data-analytics-devices><p class="admin-help">Loading device breakdown…</p></div><p class="admin-help">Traffic share recorded across desktop, mobile, and tablet clients.</p></article>
    </div>
    <div class="admin-overview-grid">
      <article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">CONTENT REACH</p><h3>Popular pages</h3></div></div><div class="insight-page-bars" data-analytics-routes><p class="admin-help">Loading popular routes…</p></div><p class="admin-help">Top sanitized routes in the selected window.</p></article>
      <article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">DAILY BREAKDOWN</p><h3>Daily traffic &amp; submissions</h3></div></div><div class="admin-table insight-scroll" tabindex="0" role="region" aria-label="Daily page views and submissions"><table><thead><tr><th>Date</th><th>Page views</th><th>Sessions</th><th>Submissions</th></tr></thead><tbody data-analytics-days></tbody></table></div></article>
    </div>
    <div class="admin-overview-grid">
      <article class="admin-overview-panel">
        <div class="admin-panel-heading"><div><p class="eyebrow">SUBMISSION PIPELINE REPORT</p><h3>Application outcomes</h3></div><a href="#applications" class="overview-link">Open applications →</a></div>
        <div class="admin-table" tabindex="0" role="region" aria-label="Submission pipeline report">
          <table><thead><tr><th>Stage</th><th>Applications</th><th>Share</th></tr></thead><tbody data-report-pipeline></tbody></table>
        </div>
        <div class="governance-actions"><a href="#sectors" class="overview-link">Compare sectors →</a><a href="#applications" class="overview-link">Inspect submissions →</a></div>
      </article>
      <article class="admin-overview-panel">
        <div class="admin-panel-heading"><div><p class="eyebrow">PARTICIPATION &amp; APPLICANT MIX</p><h3>Portal participants</h3></div><a href="#users" class="overview-link">Directory →</a></div>
        <div class="admin-table" tabindex="0" role="region" aria-label="Participation breakdown">
          <table><thead><tr><th>Segment</th><th>Count</th><th>Notes</th></tr></thead><tbody data-report-participation></tbody></table>
        </div>
      </article>
    </div>
    <div class="admin-overview-grid">
      <article class="admin-overview-panel">
        <div class="admin-panel-heading"><div><p class="eyebrow">SECTOR ACTIVITY</p><h3>Applications by innovation sector</h3></div><a href="#sectors" class="overview-link">Manage sectors →</a></div>
        <div class="admin-table insight-scroll" tabindex="0" role="region" aria-label="Sector activity report">
          <table><thead><tr><th>Sector</th><th>Submitted / Total</th><th>In review</th><th>Approved</th><th>Rejected</th></tr></thead><tbody data-report-sectors></tbody></table>
        </div>
      </article>
      <article class="admin-overview-panel">
        <div class="admin-panel-heading"><div><p class="eyebrow">WORKFLOW SLA &amp; TURNAROUND</p><h3>Review, assessment &amp; support timelines</h3></div></div>
        <div class="admin-table" tabindex="0" role="region" aria-label="Turnaround SLA report">
          <table><thead><tr><th>Stage / SLA</th><th>Samples</th><th>Average</th><th>Median</th><th>P95</th></tr></thead><tbody data-report-turnaround></tbody></table>
        </div>
      </article>
    </div>
    <article class="admin-overview-panel report-packages-panel">
      <div class="admin-panel-heading"><div><p class="eyebrow">AUDITED REPORT EXPORTS</p><h3>Export report packages</h3></div></div>
      <div class="admin-table" tabindex="0" role="region" aria-label="Report packages">
        <table><thead><tr><th>Report</th><th>Audience</th><th>Scope</th><th>Actions</th></tr></thead><tbody data-report-packages></tbody></table>
      </div>
      <p class="admin-help">Every CSV download and Print / PDF export reflects live database totals and writes a verification record to the Admin Audit log.</p>
    </article>
  </section>
  <section id="health" class="admin-work-section" hidden aria-labelledby="health-title">
    <div class="admin-users-heading"><div><h2 id="health-title">Website health &amp; delivery</h2><p>Inspect Core Web Vitals, portal availability, request failures, and notification queue health.</p></div><a href="#followup" class="admin-cta">View reported issues</a></div>
    <div class="admin-user-stats">
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M3 12h4l3-8 4 16 3-8h4")}</span><div><span>Main content load (LCP)</span><strong data-health-stat="lcp">Pending</strong><small data-health-note="lcp">P75 Largest Contentful Paint</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M13 2L3 14h9l-1 8 10-12h-9l1-8z")}</span><div><span>Interaction response (INP)</span><strong data-health-stat="inp">Pending</strong><small data-health-note="inp">P75 Interaction to Next Paint</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M4 5h16v14H4zM8 9h8")}</span><div><span>Visual stability (CLS)</span><strong data-health-stat="cls">Pending</strong><small data-health-note="cls">P75 Cumulative Layout Shift</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon admins">${icon("M12 8v4M12 16h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0")}</span><div><span>Request failures</span><strong data-health-stat="errors">Pending</strong><small data-health-note="errors">Selected telemetry window</small></div></article>
    </div>
    <div class="admin-overview-grid">
      <article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">CORE WEB VITALS</p><h3>Daily latency &amp; errors</h3></div></div><div data-health-chart><p class="admin-help">Loading live telemetry samples…</p></div><p class="admin-help" data-health-summary-note>14-day sanitized telemetry retention; metrics show live recorded browser samples only.</p></article>
      <article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">SYSTEM &amp; DELIVERY DIAGNOSTICS</p><h3>Queue &amp; response summary</h3></div></div><dl class="admin-ai-draft health-explanations"><dt>Time to First Byte (P75 TTFB)</dt><dd data-health-ttfb>No live samples yet.</dd><dt>Portal availability</dt><dd data-health-availability>No live samples yet.</dd><dt>Notification queue</dt><dd data-health-notifications>Loading delivery queue…</dd><dt>Active Optimus guidance status</dt><dd data-health-optimus>Loading assistant metrics…</dd></dl></article>
    </div>
  </section>
  <section id="admin-print-sheet" class="admin-print-sheet" hidden aria-label="Printable CEDA executive report"></section>
  <section id="followup" class="admin-work-section" hidden aria-labelledby="followup-title">
    <div class="admin-users-heading"><div><h2 id="followup-title">Admin follow-up</h2><p>Investigate reported bugs, support escalations, delivery failures and user feedback.</p></div></div>
    <div class="followup-summary" aria-label="Issue queue by status">${["Open","Investigating","Waiting","Resolved"].map(status=>`<button type="button" data-issue-summary="${status}" class="admin-user-stat"><span>${status}</span><strong data-issue-total="${status}">0</strong></button>`).join("")}</div>
    <div class="admin-surface admin-directory-surface">
      <form data-issue-filters class="admin-directory-toolbar">
        <label class="admin-directory-query"><span class="visually-hidden">Search reported matters</span>${icon("M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0")}<input type="search" name="query" placeholder="Search reference, issue or reporter" maxlength="100" autocomplete="off"></label>
        <label><span class="visually-hidden">Matter type</span><select name="kind"><option value="">All types</option><option>Bug</option><option>Support</option><option>Delivery</option><option>Feedback</option></select></label>
        <label><span class="visually-hidden">Matter status</span><select name="state"><option value="">All statuses</option><option>Open</option><option>Investigating</option><option>Waiting</option><option>Resolved</option></select></label>
        <label><span class="visually-hidden">Priority</span><select name="priority"><option value="">All priorities</option><option>High</option><option>Normal</option></select></label>
        <label><span class="visually-hidden">Owner</span><select name="owner" data-matter-owner-filter><option value="">All owners</option><option value="Unassigned">Unassigned</option></select></label>
        <button type="reset" class="admin-button-secondary">Clear filters</button>
      </form>
      <div class="admin-table" tabindex="0" role="region" aria-label="Reported matters"><table><thead><tr><th>Reference / matter</th><th>Type</th><th>Priority</th><th>Status</th><th>Owner</th><th>Reported</th><th>Action</th></tr></thead><tbody data-issue-rows></tbody></table></div>
      <div class="admin-directory-footer" data-issue-count role="status"></div>
    </div>
  </section>`;
}
