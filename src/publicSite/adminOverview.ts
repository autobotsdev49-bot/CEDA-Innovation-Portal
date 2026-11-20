function icon(path: string) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

export function adminOverview() {
  return `<section id="overview" class="admin-overview" aria-labelledby="admin-page-title">
    <h1 id="admin-page-title" class="visually-hidden">Administrator overview</h1>
    <div class="overview-toolbar"><time data-admin-date></time><div><label class="visually-hidden" for="overview-period">Reporting period</label><select id="overview-period" data-overview-period><option value="1">Today</option><option value="7" selected>Last 7 days</option><option value="30">Last 30 days</option></select><button class="admin-button-secondary" type="button" data-overview-refresh>Refresh</button></div></div>
    <p class="overview-updated" data-overview-updated role="status"></p>
    <div class="admin-demo-notice" role="note"><span class="admin-demo-dot" aria-hidden="true"></span><div><strong>Sample dashboard</strong><span>Reporting ends 20 November 2026 in this preview. Metrics and events are fictional. Refresh redraws the sample; live telemetry is not connected.</span></div><span class="admin-demo-tag">Sample data</span></div>
    <div class="admin-summary-grid overview-metrics">${[["applications","Submitted applications","applications"],["review","Applications in review","review"],["active","Active visitors now","active"],["visits","Portal page views","traffic"]].map(([key,label,target])=>`<button type="button" class="admin-summary-card" data-overview-open="${target}"><span class="admin-summary-top">${label}<span class="admin-demo-tag">Sample</span></span><strong data-overview-metric="${key}">—</strong><span class="admin-summary-foot">${key === "active" ? "Last 5 minutes" : "Selected period"}</span><svg class="overview-card-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></button>`).join("")}</div>
    <div class="admin-overview-grid overview-charts"><article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">WEBSITE AUDIENCE</p><h2>Page views over time</h2></div><button class="overview-link" type="button" data-overview-open="traffic">View full analytics</button></div><div data-overview-chart></div><p class="admin-help">Sample page views. One session can view multiple pages.</p></article><article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">SUBMISSION PIPELINE</p><h2>Application outcomes</h2></div><button type="button" class="overview-link" data-overview-open="applications">View applications</button></div><div class="overview-outcomes" data-overview-outcomes></div><button class="overview-link" type="button" data-overview-open="review">Open in-review applications</button></article></div>
    <div class="admin-overview-grid overview-health"><article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">WEBSITE HEALTH</p><h2>Speed and stability</h2></div><span class="admin-demo-tag">Sample</span></div><div class="overview-health-values"><div><strong>2.1 s</strong><span>Main content load</span></div><div><strong>168 ms</strong><span>Interaction response</span></div><div><strong>0.08</strong><span>Layout shift</span></div></div><button class="overview-link" type="button" data-overview-open="web">View website health</button></article><article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">OPTIMUS PRIME</p><h2>Assistant health</h2></div><span class="admin-demo-tag">Sample</span></div><div class="overview-health-values"><div><strong>98.6%</strong><span>Response success</span></div><div><strong>1.8 s</strong><span>Average response</span></div><div><strong>28</strong><span>Support handoffs</span></div></div><button type="button" class="overview-link" data-overview-open="ai">View AI performance</button><a href="#optimus" class="overview-link">Open Optimus Prime</a></article></div>
    <div class="admin-overview-grid overview-bottom"><article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">FOLLOW UP</p><h2>Admin follow-up</h2></div><button class="overview-link" type="button" data-overview-open="followup">View all matters</button></div><div class="overview-attention" data-overview-attention></div></article><article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">PORTAL UPDATES</p><h2>Recent activity</h2></div><button type="button" class="overview-link" data-overview-open="audit">View audit logs</button></div><ol class="overview-events" data-overview-events></ol></article></div>
    <section data-overview-detail hidden><span class="admin-demo-tag">Sample details</span><div data-overview-detail-body></div></section>
  </section>${insightScreens()}`;
}

function insightScreens() {
  const notice = `<div class="admin-demo-notice" role="note"><span class="admin-demo-dot" aria-hidden="true"></span><div><strong>Sample workspace</strong><span>Fictional records for design review. Live analytics, issue reporting and export feeds are not connected.</span></div><span class="admin-demo-tag">Sample data</span></div>`;
  return `<section id="analytics" class="admin-work-section" hidden aria-labelledby="analytics-title">
    <div class="admin-users-heading"><div><h2 id="analytics-title">Analytics & reports</h2><p>Understand portal traffic, application outcomes, sector activity and reporting readiness.</p></div><label>Period<select data-analytics-period><option value="1">Today</option><option value="7" selected>Last 7 days</option><option value="30">Last 30 days</option></select></label></div>
    ${notice}
    <div class="admin-user-stats" aria-label="Analytics and reporting summary">
      <article class="admin-user-stat"><span class="admin-user-stat-icon">${icon("M3 3v18h18M7 14l4-4 4 3 6-7")}</span><div><span>Page views</span><strong data-analytics-stat="views">—</strong><small>Selected period / Sample</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon active">${icon("M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8")}</span><div><span>Active sessions</span><strong>24</strong><small>Last 5 minutes / Sample</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon admins">${icon("M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7")}</span><div><span>Sample applications</span><strong data-analytics-stat="applications">6</strong><small>Across innovation sectors</small></div></article>
      <article class="admin-user-stat"><span class="admin-user-stat-icon inactive">${icon("M4 20V4h16v16zM8 16v-4m4 4V8m4 8v-6")}</span><div><span>CSV / PDF exports</span><strong>Pending</strong><small>Awaiting reporting API</small></div></article>
    </div>
    <p class="admin-help" data-analytics-range></p>
    <div class="admin-overview-grid">
      <article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">TRAFFIC TREND</p><h3>Page views over time</h3></div><span class="admin-demo-tag">Sample</span></div><div data-analytics-chart></div><p class="admin-help">Page views count loads, not unique people.</p></article>
      <article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">VISITOR DEVICES</p><h3>Device breakdown</h3></div><span class="admin-demo-tag">Sample</span></div><div class="insight-device-ring" role="img" aria-label="Sample device shares: mobile 64 percent, desktop 30 percent, tablet 6 percent"><span>64%<small>Mobile</small></span></div><ul class="insight-legend"><li>Mobile <strong>64%</strong></li><li>Desktop <strong>30%</strong></li><li>Tablet <strong>6%</strong></li></ul><p class="admin-help">Illustrative device snapshot; independent of the selected period.</p></article>
    </div>
    <div class="admin-overview-grid">
      <article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">CONTENT REACH</p><h3>Popular pages</h3></div><span class="admin-demo-tag">Index / 100</span></div><div class="insight-page-bars">${[["Home",64],["How it works",42],["Eligibility",28],["Help",16]].map(([name,value])=>`<div><span>${name}</span><meter min="0" max="100" value="${value}" aria-label="${name}: sample popularity index ${value} out of 100"></meter><strong>${value}</strong></div>`).join("")}</div><p class="admin-help">Sample popularity index out of 100, not page-view counts.</p></article>
      <article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">DAILY BREAKDOWN</p><h3>Daily page views</h3></div><span class="admin-demo-tag">Botswana time</span></div><div class="admin-table insight-scroll" tabindex="0" role="region" aria-label="Sample daily page views"><table><thead><tr><th>Date</th><th>Page views</th></tr></thead><tbody data-analytics-days></tbody></table></div></article>
    </div>
    <div class="admin-overview-grid">
      <article class="admin-overview-panel">
        <div class="admin-panel-heading"><div><p class="eyebrow">SUBMISSION PIPELINE REPORT</p><h3>Application & sector outcomes</h3></div><a href="#applications" class="overview-link">Open applications →</a></div>
        <div class="admin-table" tabindex="0" role="region" aria-label="Sample submission pipeline report">
          <table><thead><tr><th>Stage</th><th>Sample cases</th><th>Share</th></tr></thead><tbody data-report-pipeline></tbody></table>
        </div>
        <div class="governance-actions"><a href="#sectors" class="overview-link">Compare sectors →</a><a href="#applications" class="overview-link">Inspect submissions →</a></div>
      </article>
      <article class="admin-overview-panel">
        <div class="admin-panel-heading"><div><p class="eyebrow">AUTHORIZED EXPORTS</p><h3>Report packages</h3></div><span class="admin-demo-tag">Not connected</span></div>
        <div class="admin-table" tabindex="0" role="region" aria-label="Planned report packages">
          <table><thead><tr><th>Report</th><th>Scope</th><th>Status</th></tr></thead><tbody>
            <tr><td><strong>Application outcomes</strong></td><td>Submissions & released decisions</td><td><span class="admin-sector-badge sector-draft">Awaiting backend</span></td></tr>
            <tr><td><strong>Sector activity</strong></td><td>Per-sector volume & outcomes</td><td><span class="admin-sector-badge sector-draft">Awaiting backend</span></td></tr>
            <tr><td><strong>Assessment progress</strong></td><td>Aggregate turnaround metrics</td><td><span class="admin-sector-badge sector-draft">Awaiting backend</span></td></tr>
            <tr><td><strong>Platform traffic summary</strong></td><td>Sanitized page-view aggregates</td><td><span class="admin-sector-badge sector-draft">Awaiting backend</span></td></tr>
          </tbody></table>
        </div>
        <p class="admin-help">Privacy-reviewed CSV exports will unlock when real application and assessment tables are connected.</p>
      </article>
    </div>
  </section>
  <section id="health" class="admin-work-section" hidden aria-labelledby="health-title">
    <div class="admin-users-heading"><div><h2 id="health-title">Website health</h2><p>Inspect loading speed, responsiveness, stability and reported errors.</p></div><a href="#followup" class="admin-cta">View reported issues</a></div>
    ${notice}
    <div class="admin-user-stats">${[
      ["Main content load","2.1 s","Largest Contentful Paint","active","M3 12h4l3-8 4 16 3-8h4"],
      ["Interaction response","168 ms","Interaction to Next Paint","active","M13 2L3 14h9l-1 8 10-12h-9l1-8z"],
      ["Visual stability","0.08","Cumulative Layout Shift","active","M4 5h16v14H4zM8 9h8"],
      ["Request failures","3","Sample latest snapshot","admins","M12 8v4M12 16h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"],
    ].map(([label,value,note,tone,path])=>`<article class="admin-user-stat"><span class="admin-user-stat-icon ${tone}">${icon(path)}</span><div><span>${label}</span><strong>${value}</strong><small>${note}</small></div></article>`).join("")}</div>
    <div class="admin-overview-grid"><article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">CORE WEB VITALS</p><h3>Loading speed trend</h3></div><span class="admin-demo-tag">Sample</span></div><svg class="admin-ai-line" viewBox="0 0 600 210" role="img" aria-label="Sample main content loading times over seven days: 2.6, 2.4, 2.5, 2.2, 2.3, 2.0, 2.1 seconds"><path class="ai-grid" d="M30 40h540M30 100h540M30 160h540"/><path class="ai-trend" d="M30 50 120 75 210 62 300 100 390 88 480 125 570 112"/><g class="ai-axis"><text x="30" y="195">Nov 14</text><text x="270" y="195">Nov 17</text><text x="520" y="195">Nov 20</text></g></svg><p class="admin-help">Sample LCP trend in seconds: 2.6, 2.4, 2.5, 2.2, 2.3, 2.0, 2.1.</p></article><article class="admin-overview-panel"><div class="admin-panel-heading"><div><p class="eyebrow">METRIC DEFINITIONS</p><h3>What these measurements mean</h3></div></div><dl class="admin-ai-draft health-explanations"><dt>Largest Contentful Paint (LCP)</dt><dd>Time until the main content appears.</dd><dt>Interaction to Next Paint (INP)</dt><dd>Time until the page responds visibly after interaction.</dd><dt>Cumulative Layout Shift (CLS)</dt><dd>How much visible content moves unexpectedly.</dd><dt>Time to First Byte (TTFB)</dt><dd>Sample: 540 ms. Time until the server starts responding.</dd></dl></article></div>
  </section>
  <section id="followup" class="admin-work-section" hidden aria-labelledby="followup-title">
    <div class="admin-users-heading"><div><h2 id="followup-title">Admin follow-up</h2><p>Investigate reported bugs, support escalations, delivery failures and user feedback.</p></div></div>
    ${notice}
    <div class="followup-summary" aria-label="Issue queue by status">${["Open","Investigating","Waiting","Resolved"].map(status=>`<button type="button" data-issue-summary="${status}" class="admin-user-stat"><span>${status}</span><strong data-issue-total="${status}">0</strong></button>`).join("")}</div>
    <div class="admin-surface admin-directory-surface">
      <form data-issue-filters class="admin-directory-toolbar">
        <label class="admin-directory-query"><span class="visually-hidden">Search reported matters</span>${icon("M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0")}<input type="search" name="query" placeholder="Search reference, issue or reporter" maxlength="100" autocomplete="off"></label>
        <label><span class="visually-hidden">Matter type</span><select name="kind"><option value="">All types</option><option>Bug</option><option>Support</option><option>Delivery</option><option>Feedback</option></select></label>
        <label><span class="visually-hidden">Matter status</span><select name="state"><option value="">All statuses</option><option>Open</option><option>Investigating</option><option>Waiting</option><option>Resolved</option></select></label>
        <label><span class="visually-hidden">Priority</span><select name="priority"><option value="">All priorities</option><option>High</option><option>Normal</option></select></label>
        <label><span class="visually-hidden">Owner</span><select name="owner"><option value="">All owners</option><option value="Unassigned">Unassigned</option><option value="Sample admin C">Sample admin C</option><option value="Sample admin (you)">Sample admin (you)</option></select></label>
        <button type="reset" class="admin-button-secondary">Clear filters</button>
      </form>
      <div class="admin-table" tabindex="0" role="region" aria-label="Sample reported matters"><table><thead><tr><th>Reference / matter</th><th>Type</th><th>Priority</th><th>Status</th><th>Owner</th><th>Reported</th><th>Action</th></tr></thead><tbody data-issue-rows></tbody></table></div>
      <div class="admin-directory-footer" data-issue-count role="status"></div>
    </div>
  </section>`;
}
