import { COMMITTEE_STATUS_FILTERS } from "./assets/committeeOverview.js";

const navItems = [
  ["overview", "Overview", "M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6"],
  ["timeline", "Pipeline timeline", "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0"],
  ["applications", "Applications", "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"],
  ["awards", "Awards showcase", "M12 2l2.9 6.1 6.7.9-4.9 4.7 1.2 6.7L12 17.3l-5.9 3.1 1.2-6.7L2.4 9l6.7-.9L12 2z"],
  ["settings", "Account & security", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 12l2-2-1-3 3-2 2 1 2-2 2 2 3-1 2 3-1 2 2 2-2 2 1 3-3 2-2-1-2 2-2-2-3 1-2-3 1-2z"],
] as const;

function navIcon(path: string) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

export function committeeScreen() {
  return `<div class="admin-shell committee-shell" data-committee-shell>
    <a class="admin-skip" href="#committee-main">Skip to main content</a>
    <header class="admin-header">
      <a href="/committee/#overview" class="admin-brand" aria-label="CEDA Committee observer home">
        <img src="/assets/ceda.png" alt="CEDA" width="70" height="44">
        <span>Innovation <small>COMMITTEE OBSERVER</small></span>
      </a>
      <form class="admin-header-search" data-committee-search role="search">
        <label class="visually-hidden" for="committee-search-input">Search applications, awards, or timeline milestones</label>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
        <input id="committee-search-input" type="search" name="query" maxlength="100" placeholder="Search applications, awards or milestones" autocomplete="off">
        <button type="submit">Search</button>
      </form>
      <div class="admin-header-right">
        <span class="committee-readonly-pill" title="Strict read-only oversight mode">Read-only observer</span>
        <a href="#settings" class="admin-identity" aria-live="polite" title="Open account and security">
          <span data-committee-name>Committee Member</span>
          <span data-committee-email></span>
        </a>
        <button type="button" class="admin-logout" data-committee-logout>Log out</button>
      </div>
    </header>

    <div class="admin-layout" data-committee-layout>
      <aside class="admin-sidebar" aria-label="Committee observer navigation">
        <div class="admin-sidebar-top">
          <p class="admin-sidebar-label">OVERSIGHT MENU</p>
          <button type="button" class="admin-sidebar-toggle" data-committee-sidebar-toggle aria-label="Collapse committee menu" aria-expanded="true" aria-controls="committee-primary-navigation" title="Collapse menu">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7M20 5v14"/></svg>
          </button>
        </div>
        <nav id="committee-primary-navigation" aria-label="Committee workspace sections">
          ${navItems.map(([id, label, path], index) => `<a href="#${id}" data-nav-target="${id}" data-tooltip="${label}" aria-label="${label}" title="${label}"${index === 0 ? ' aria-current="page"' : ""}>${navIcon(path)}<span>${label}</span></a>`).join("")}
        </nav>
        <div class="admin-sidebar-note"><span class="admin-status-dot"></span><span data-committee-scope-note>Read-only oversight</span></div>
      </aside>

      <main id="committee-main" class="admin-content">
        <p role="status" data-committee-status class="admin-status-message">Verifying committee observer access.</p>
        <div data-committee-workspace hidden>
          <dialog data-committee-dialog class="admin-dialog" aria-labelledby="committee-dialog-title">
            <div class="admin-dialog-header">
              <div>
                <p class="eyebrow" data-dialog-eyebrow>READ-ONLY APPLICATION RECORD</p>
                <h2 id="committee-dialog-title" tabindex="-1">Application details</h2>
              </div>
              <button type="button" data-dialog-close class="admin-button-secondary" aria-label="Close application dialog">Close</button>
            </div>
            <p data-dialog-status role="status" class="admin-dialog-status"></p>
            <div data-dialog-body class="committee-dialog-body"></div>
          </dialog>

          <!-- 1. OVERVIEW -->
          <section id="overview" class="admin-work-section" aria-labelledby="committee-overview-title">
            <div class="admin-users-heading">
              <div>
                <p class="eyebrow">COMMITTEE OVERSIGHT</p>
                <h2 id="committee-overview-title">Innovation pipeline &amp; award summary</h2>
                <p>Monitor live progression across Submission, Review, Feedback, Approval, and Award stages in strict read-only mode.</p>
              </div>
              <button type="button" class="admin-button-secondary" data-committee-refresh>Refresh data</button>
            </div>

            <div class="admin-user-stats" data-committee-kpis></div>

            <div class="admin-surface committee-funnel-panel">
              <div class="admin-panel-heading">
                <div>
                  <p class="eyebrow">LIFECYCLE PROGRESSION</p>
                  <h3>Submission → Review → Feedback → Approval → Award</h3>
                </div>
                <a href="#timeline" class="overview-link">Open full timeline view</a>
              </div>
              <div class="committee-funnel-grid" data-committee-funnel></div>
            </div>

            <div class="admin-overview-grid">
              <article class="admin-overview-panel">
                <div class="admin-panel-heading">
                  <div>
                    <p class="eyebrow">RECENT CONFERRED AWARDS</p>
                    <h3>Latest innovation awards</h3>
                  </div>
                  <a href="#awards" class="overview-link">View all awards</a>
                </div>
                <div data-overview-awards class="committee-compact-list"></div>
              </article>

              <article class="admin-overview-panel">
                <div class="admin-panel-heading">
                  <div>
                    <p class="eyebrow">LATEST MILESTONES</p>
                    <h3>Recent pipeline activity</h3>
                  </div>
                  <a href="#timeline" class="overview-link">Timeline view</a>
                </div>
                <div data-overview-timeline class="committee-compact-list"></div>
              </article>
            </div>

            <div class="admin-surface admin-directory-surface">
              <div class="admin-panel-heading">
                <div>
                  <p class="eyebrow">SECTOR DISTRIBUTION</p>
                  <h3>Visible portfolio by sector</h3>
                </div>
              </div>
              <div class="admin-table" tabindex="0" role="region" aria-label="Portfolio breakdown by sector">
                <table>
                  <thead>
                    <tr>
                      <th>Sector</th>
                      <th>Submitted</th>
                      <th>In review</th>
                      <th>Feedback</th>
                      <th>Approved</th>
                      <th>Awarded</th>
                      <th>Total visible</th>
                    </tr>
                  </thead>
                  <tbody data-committee-sectors></tbody>
                </table>
              </div>
            </div>
          </section>

          <!-- 2. TIMELINE VIEW -->
          <section id="timeline" class="admin-work-section" hidden aria-labelledby="committee-timeline-title">
            <div class="admin-users-heading">
              <div>
                <p class="eyebrow">LIFECYCLE AUDIT STREAM</p>
                <h2 id="committee-timeline-title">Application timeline view</h2>
                <p>Chronological milestones across visible submissions, assessment cycles, clarifications, outcome releases, and award conferrals.</p>
              </div>
            </div>

            <div class="admin-surface admin-directory-surface">
              <form data-timeline-filters class="admin-directory-toolbar">
                <label class="admin-directory-query">
                  <span class="visually-hidden">Filter timeline milestones</span>
                  ${navIcon("M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0")}
                  <input type="search" name="query" maxlength="100" placeholder="Search milestone, reference or innovation" autocomplete="off">
                </label>
                <label><span class="visually-hidden">Filter by stage</span>
                  <select name="stage">
                    <option value="All">All stages</option>
                    <option value="Submission">Submission</option>
                    <option value="Review">Review</option>
                    <option value="Feedback">Feedback</option>
                    <option value="Approval">Approval</option>
                    <option value="Award">Award</option>
                  </select>
                </label>
                <label><span class="visually-hidden">Filter by sector</span>
                  <select name="sector" data-timeline-sector-select>
                    <option value="All">All sectors</option>
                  </select>
                </label>
                <button type="button" class="admin-button-secondary" data-reset-timeline>Reset</button>
              </form>
              <p class="admin-help" data-timeline-results aria-live="polite"></p>
              <ol class="committee-timeline-stream" data-committee-timeline-list></ol>
            </div>
          </section>

          <!-- 3. APPLICATIONS DIRECTORY -->
          <section id="applications" class="admin-work-section" hidden aria-labelledby="committee-apps-title">
            <div class="admin-users-heading">
              <div>
                <p class="eyebrow">PORTFOLIO DIRECTORY</p>
                <h2 id="committee-apps-title">Applications &amp; stage progression</h2>
                <p>Inspect non-draft submissions, stage milestones, and outcome records. Unsubmitted drafts, private ballots, and internal deliberations remain isolated.</p>
              </div>
            </div>

            <div class="admin-surface admin-directory-surface">
              <div class="committee-filter-pills" role="group" aria-label="Filter applications by status">
                ${COMMITTEE_STATUS_FILTERS.map((label, idx) => `<button type="button" class="committee-pill-filter${idx === 0 ? " is-active" : ""}" data-committee-status-filter="${label}" aria-pressed="${idx === 0 ? "true" : "false"}">${label}</button>`).join("")}
              </div>

              <form data-apps-filters class="admin-directory-toolbar">
                <label class="admin-directory-query">
                  <span class="visually-hidden">Search visible applications</span>
                  ${navIcon("M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0")}
                  <input type="search" name="query" maxlength="100" placeholder="Search by reference, title, applicant or sector" autocomplete="off">
                </label>
                <label><span class="visually-hidden">Filter applications by sector</span>
                  <select name="sector" data-apps-sector-select>
                    <option value="All">All sectors</option>
                  </select>
                </label>
                <button type="button" class="admin-button-secondary" data-reset-apps>Clear filters</button>
              </form>

              <div class="admin-table" tabindex="0" role="region" aria-label="Committee applications directory">
                <table>
                  <thead>
                    <tr>
                      <th>Innovation</th>
                      <th>Applicant</th>
                      <th>Sector</th>
                      <th>Stage</th>
                      <th>Status</th>
                      <th>Updated</th>
                      <th>Inspect</th>
                    </tr>
                  </thead>
                  <tbody data-committee-apps-tbody></tbody>
                </table>
              </div>
              <p class="admin-help" data-committee-apps-results aria-live="polite"></p>
            </div>
          </section>

          <!-- 4. AWARDS SHOWCASE -->
          <section id="awards" class="admin-work-section" hidden aria-labelledby="committee-awards-title">
            <div class="admin-users-heading">
              <div>
                <p class="eyebrow">RECOGNITION &amp; ONBOARDING</p>
                <h2 id="committee-awards-title">Awarded innovations</h2>
                <p>Innovations formally conferred Award status alongside Approved candidates awaiting award conferral.</p>
              </div>
            </div>
            <div class="committee-awards-grid" data-committee-awards-list></div>
            <div class="admin-surface admin-directory-surface committee-awaiting-box">
              <div class="admin-panel-heading">
                <div>
                  <p class="eyebrow">PIPELINE QUEUE</p>
                  <h3>Approved &amp; awaiting award conferral</h3>
                </div>
              </div>
              <div data-committee-awaiting-list class="committee-compact-list"></div>
            </div>
          </section>

          <!-- 5. ACCOUNT & SECURITY -->
          <section id="settings" class="admin-work-section" hidden aria-labelledby="committee-settings-title">
            <div class="admin-users-heading">
              <div>
                <p class="eyebrow">ACCESS &amp; ACCOUNT</p>
                <h2 id="committee-settings-title">Committee observer account</h2>
                <p>Manage your password, authenticator app verification (MFA), and active portal session.</p>
              </div>
            </div>

            <div class="admin-overview-grid">
              <article class="admin-overview-panel">
                <p class="eyebrow">OBSERVER PROFILE</p>
                <h3>Assigned access scope</h3>
                <dl class="admin-case-facts" data-committee-profile-facts></dl>
                <p class="admin-help">External stakeholders and committee members operate in strict read-only mode across visible sectors.</p>
              </article>

              <article class="admin-overview-panel">
                <p class="eyebrow">AUTHENTICATOR MFA</p>
                <h3>Multi-factor security</h3>
                <p data-mfa-status class="admin-help">Checking authenticator status...</p>
                <div class="admin-form-actions" data-mfa-actions>
                  <button type="button" class="admin-cta" data-mfa-enroll hidden>Set up authenticator app</button>
                  <button type="button" class="admin-button-secondary" data-mfa-verify hidden>Verify session code</button>
                </div>
                <form data-mfa-form class="admin-form" hidden>
                  <div class="admin-form-wide" data-mfa-setup></div>
                  <label>6-digit authenticator code<input type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code"></label>
                  <button type="submit">Confirm authenticator</button>
                </form>
              </article>
            </div>

            <article class="admin-overview-panel">
              <p class="eyebrow">PASSWORD MANAGEMENT</p>
              <h3>Update password</h3>
              <form data-password-form class="admin-form">
                <label>New password<input type="password" name="password" minlength="8" required autocomplete="new-password"></label>
                <label>Confirm password<input type="password" name="confirmation" minlength="8" required autocomplete="new-password"></label>
                <button type="submit">Update password</button>
              </form>
            </article>
          </section>
        </div>
      </main>
    </div>
  </div>`;
}
