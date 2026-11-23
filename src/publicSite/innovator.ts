import {
  BOTSWANA_DISTRICTS,
  INNOVATION_STAGES,
  INNOVATION_TYPES,
  BENEFICIARY_GROUPS,
  EVIDENCE_RULES,
  WIZARD_STEPS,
  APPLICATION_STATUS_FILTERS,
} from "./assets/applicationWizard.js";

const navItems = [
  ["overview", "Overview", "M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6"],
  ["applications", "My applications", "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"],
  ["submit", "Submit innovation", "M12 5v14M5 12h14"],
  ["messages", "Messages", "M4 5h16v12H8l-4 4zM8 9h8M8 13h5"],
  ["documents", "Verification documents", "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6"],
  ["support", "Help and support", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01"],
  ["settings", "Account and settings", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 12l2-2-1-3 3-2 2 1 2-2 2 2 3-1 2 3-1 2 2 2-2 2 1 3-3 2-2-1-2 2-2-2-3 1-2-3 1-2z"],
] as const;

function navIcon(path: string) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

function arrowIcon() {
  return `<svg class="admin-arrow-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>`;
}

export function innovatorScreen() {
  return `<div class="admin-shell innovator-shell" data-innovator-shell>
    <a class="admin-skip" href="#innovator-main">Skip to main content</a>
    <header class="admin-header">
      <a href="/account/#overview" class="admin-brand" aria-label="CEDA Innovation portal home"><img src="/assets/ceda.png" alt="CEDA" width="70" height="44"><span>Innovation <small>INNOVATOR PORTAL</small></span></a>
      <form class="admin-header-search" data-innovator-search role="search">
        <label class="visually-hidden" for="innovator-search-input">Search applications, documents or help</label>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
        <input id="innovator-search-input" type="search" name="query" maxlength="100" placeholder="Search applications, files or FAQs" autocomplete="off">
        <button type="submit">Search</button>
      </form>
      <div class="admin-header-right">
        <button type="button" class="admin-notification-bell innovator-bell" data-open-notifications aria-label="Open notifications" aria-haspopup="dialog" title="Notifications">
          ${navIcon("M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9M10 21h4")}
          <span class="innovator-bell-badge" data-notification-badge hidden>0</span>
        </button>
        <a href="#settings" class="admin-identity" aria-live="polite" title="Open account and settings">
          <span data-innovator-name>Innovator</span>
          <span data-innovator-email></span>
        </a>
        <button type="button" class="admin-logout" data-innovator-logout-header>Log out</button>
      </div>
    </header>

    <div class="admin-layout" data-innovator-layout>
      <aside class="admin-sidebar" aria-label="Innovator workspace">
        <div class="admin-sidebar-top">
          <p class="admin-sidebar-label">PORTAL MENU</p>
          <button type="button" class="admin-sidebar-toggle" data-innovator-sidebar-toggle aria-label="Collapse portal menu" aria-expanded="true" aria-controls="innovator-primary-navigation" title="Collapse menu">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7M20 5v14"/></svg>
          </button>
        </div>
        <nav id="innovator-primary-navigation" aria-label="Innovator sections">
          ${navItems.map(([id, label, path], index) => `<a href="#${id}" data-nav-target="${id}" data-tooltip="${label}" aria-label="${label}" title="${label}"${index === 0 ? ' aria-current="page"' : ""}>${navIcon(path)}<span>${label}</span></a>`).join("")}
        </nav>
        <div class="admin-sidebar-note"><span class="admin-status-dot"></span><span>Private innovator workspace</span></div>
      </aside>

      <main id="innovator-main" class="admin-content">
        <p role="status" data-innovator-status class="admin-status-message">Verifying your innovator session.</p>
        <div data-innovator-workspace hidden>
          <dialog data-innovator-dialog class="admin-dialog" aria-labelledby="innovator-dialog-title">
            <div class="admin-dialog-header">
              <h2 id="innovator-dialog-title" tabindex="-1">Notifications</h2>
              <div class="innovator-preview-header-actions">
                <button type="button" class="admin-button-secondary" data-preview-download hidden>Download file</button>
                <button type="button" data-dialog-close class="admin-button-secondary" aria-label="Close dialog">Close</button>
              </div>
            </div>
            <p data-dialog-status role="status" class="admin-dialog-status"></p>
            <div data-dialog-body>
              <section data-inn-dialog-panel="notifications" hidden>
                <div class="innovator-dialog-toolbar">
                  <p class="admin-modal-intro">Status updates, clarification requests, and CEDA messages appear here.</p>
                  <button type="button" class="admin-button-secondary" data-mark-all-notifications>Mark all read</button>
                </div>
                <ul class="innovator-notification-list" data-notification-list></ul>
              </section>

              <section data-inn-dialog-panel="submit-confirm" hidden>
                <p class="admin-modal-intro">Submitting creates a locked snapshot for CEDA screening. You cannot edit submitted fields unless CEDA requests clarification.</p>
                <div class="innovator-checklist-box" data-submit-confirm-summary></div>
                <div class="admin-form-actions">
                  <button type="button" class="admin-cta" data-confirm-submit-btn>Confirm and submit innovation</button>
                  <button type="button" class="admin-button-secondary" data-dialog-cancel>Review sections</button>
                </div>
              </section>

              <section data-inn-dialog-panel="withdraw-confirm" hidden>
                <p class="admin-modal-intro">Withdrawing stops CEDA assessment for this application. Your submission record remains archived for reference, and any review slot in the current cycle will be released.</p>
                <form data-withdraw-form class="admin-form">
                  <label class="admin-form-wide">Reason for withdrawal (minimum 5 characters)
                    <textarea name="reason" required minlength="5" maxlength="500" rows="3" placeholder="Explain briefly why you are withdrawing this application."></textarea>
                  </label>
                  <div class="admin-form-actions">
                    <button type="submit" class="admin-cta">Confirm withdrawal</button>
                    <button type="button" class="admin-button-secondary" data-dialog-cancel>Keep application active</button>
                  </div>
                </form>
              </section>

              <section data-inn-dialog-panel="unsaved-confirm" hidden>
                <p class="admin-modal-intro">You have unsaved edits in your active draft step. Save before leaving so you keep every change you built.</p>
                <div class="admin-form-actions">
                  <button type="button" class="admin-cta" data-save-and-leave>Save draft &amp; continue</button>
                  <button type="button" class="admin-button-secondary" data-discard-and-leave>Discard unsaved edits</button>
                </div>
              </section>

              <section data-inn-dialog-panel="doc-preview" hidden>
                <div class="innovator-preview-meta" data-preview-meta></div>
                <div class="innovator-preview-stage" data-preview-stage></div>
              </section>

              <section data-inn-dialog-panel="app-preview" hidden>
                <div class="innovator-snapshot-preview" data-snapshot-preview-body></div>
              </section>
            </div>
          </dialog>

          <!-- 1. OVERVIEW -->
          <section id="overview" class="admin-work-section" aria-labelledby="overview-heading">
            <div class="admin-users-heading">
              <div>
                <p class="eyebrow">INNOVATOR OVERVIEW</p>
                <h2 id="overview-heading" data-overview-welcome>Your innovation workspace</h2>
                <p class="innovator-subtitle">Track your applications, progress, messages and next steps.</p>
              </div>
              <div class="innovator-hero-actions">
                <button type="button" class="admin-button-secondary" data-continue-latest-draft>Continue draft</button>
                <button type="button" class="admin-cta" data-start-new-innovation>${navIcon("M12 5v14M5 12h14")} Submit new innovation</button>
              </div>
            </div>

            <!-- 1. Application status summary cards -->
            <div class="admin-user-stats" aria-label="Application status summary cards">
              <article class="admin-user-stat"><span class="admin-user-stat-icon">${navIcon("M6 3h9l4 4v14H6z")}</span><div><span>Drafts</span><strong data-kpi="drafts">0</strong><small>Private in progress</small></div></article>
              <article class="admin-user-stat"><span class="admin-user-stat-icon active">${navIcon("M5 12l4 4L19 6")}</span><div><span>Submitted</span><strong data-kpi="submitted">0</strong><small>Awaiting review</small></div></article>
              <article class="admin-user-stat"><span class="admin-user-stat-icon admins">${navIcon("M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0")}</span><div><span>Under review</span><strong data-kpi="review">0</strong><small>Active screening</small></div></article>
              <article class="admin-user-stat"><span class="admin-user-stat-icon inactive">${navIcon("M12 8v4M12 16h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0")}</span><div><span>Action required</span><strong data-kpi="action">0</strong><small>Clarifications &amp; drafts</small></div></article>
            </div>

            <div class="admin-overview-grid">
              <!-- 2. Current application progress -->
              <article class="admin-overview-panel">
                <div class="admin-panel-heading"><div><p class="eyebrow">CURRENT PROGRESS</p><h3>Current application progress</h3></div></div>
                <div data-overview-progress class="innovator-overview-card"></div>
              </article>

              <!-- 3. Required actions -->
              <article class="admin-overview-panel">
                <div class="admin-panel-heading"><div><p class="eyebrow">NEXT STEPS</p><h3>Required actions</h3></div></div>
                <div data-overview-required-actions class="innovator-overview-list"></div>
              </article>

              <!-- 4. Recent application activity -->
              <article class="admin-overview-panel">
                <div class="admin-panel-heading"><div><p class="eyebrow">TIMELINE</p><h3>Recent application activity</h3></div></div>
                <div data-overview-recent-activity class="innovator-overview-list"></div>
              </article>

              <!-- 5. Messages and deadlines -->
              <article class="admin-overview-panel">
                <div class="admin-panel-heading"><div><p class="eyebrow">COMMUNICATION</p><h3>Messages and deadlines</h3></div></div>
                <div data-overview-messages-deadlines class="innovator-overview-list"></div>
              </article>
            </div>
          </section>

          <!-- 2. MY APPLICATIONS & PERMANENT DETAIL WORKSPACE -->
          <section id="applications" class="admin-work-section" hidden aria-labelledby="apps-heading">
            <div data-apps-list-view>
              <div class="admin-users-heading">
                <div>
                  <p class="eyebrow">APPLICATIONS WORKSPACE</p>
                  <h2 id="apps-heading">My applications</h2>
                  <p>Manage private drafts, monitor CEDA screening progress, respond to clarification requests, and inspect official outcomes.</p>
                </div>
                <button type="button" class="admin-cta" data-start-new-innovation>${navIcon("M12 5v14M5 12h14")} Submit new innovation</button>
              </div>

              <div class="admin-surface admin-directory-surface">
                <div class="innovator-filter-pills" role="group" aria-label="Filter applications by status">
                  ${APPLICATION_STATUS_FILTERS.map((label, idx) => `<button type="button" class="innovator-pill-filter${idx === 0 ? " is-active" : ""}" data-app-status-filter="${label}" aria-pressed="${idx === 0 ? "true" : "false"}">${label}</button>`).join("")}
                </div>

                <form data-apps-toolbar class="admin-directory-toolbar">
                  <label class="admin-directory-query">
                    <span class="visually-hidden">Search my applications</span>
                    ${navIcon("M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0")}
                    <input type="search" name="query" maxlength="100" placeholder="Search by reference, title, or sector" autocomplete="off">
                  </label>
                  <label><span class="visually-hidden">Sort applications</span>
                    <select name="sort">
                      <option value="updated_desc">Last updated (newest)</option>
                      <option value="created_desc">Date created (newest)</option>
                      <option value="submitted_desc">Date submitted (newest)</option>
                      <option value="title_asc">Innovation title (A to Z)</option>
                      <option value="status">Current status</option>
                    </select>
                  </label>
                  <button type="button" class="admin-button-secondary" data-clear-app-filters>Clear filters</button>
                </form>

                <div class="admin-table" tabindex="0" role="region" aria-label="My innovation applications table">
                  <table>
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>Innovation title</th>
                        <th>Applicant type</th>
                        <th>Sector</th>
                        <th>Created</th>
                        <th>Submitted</th>
                        <th>Status</th>
                        <th>Last updated</th>
                        <th>Required action</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody data-apps-tbody></tbody>
                  </table>
                </div>
                <div class="innovator-empty-state" data-apps-empty hidden>
                  <h3>No matching applications</h3>
                  <p>Start a new innovation draft or clear your current filters to view all records.</p>
                  <button type="button" class="admin-cta" data-start-new-innovation>Start new application</button>
                </div>

                <div class="admin-directory-footer">
                  <span data-apps-results aria-live="polite">0 applications</span>
                  <div class="admin-pagination">
                    <button type="button" class="admin-button-secondary" data-apps-prev>Previous</button>
                    <span data-apps-page aria-live="polite">Page 1 of 1</span>
                    <button type="button" class="admin-button-secondary" data-apps-next>Next</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Permanent Application Detail Workspace -->
            <div data-app-detail-workspace hidden>
              <div class="innovator-detail-topbar">
              <button type="button" class="innovator-text-action" data-back-to-apps>Back to My applications</button>
                <div class="innovator-detail-actions" data-detail-header-actions></div>
              </div>

              <div class="admin-surface innovator-detail-header">
                <div>
                  <p class="eyebrow" data-detail-ref>CEDA-INN-2026</p>
                  <h2 data-detail-title>Application Workspace</h2>
                  <p class="innovator-subtitle" data-detail-meta></p>
                </div>
                <div class="innovator-detail-badges" data-detail-badges></div>
              </div>

              <div class="case-tabs innovator-detail-tabs" role="tablist" aria-label="Application detail tabs">
                ${[
                  ["summary", "Summary"],
                  ["submitted", "Submitted information"],
                  ["evidence", "Evidence"],
                  ["progress", "Progress"],
                  ["messages", "Messages"],
                  ["changes", "Requested changes"],
                ].map(([key, label], i) => `<button type="button" role="tab" class="case-tab${i === 0 ? " is-active" : ""}" data-detail-tab="${key}" aria-selected="${i === 0 ? "true" : "false"}">${label}</button>`).join("")}
              </div>

              <div data-detail-panel="summary" class="admin-surface"></div>
              <div data-detail-panel="submitted" class="admin-surface" hidden></div>
              <div data-detail-panel="evidence" class="admin-surface" hidden></div>
              <div data-detail-panel="progress" class="admin-surface" hidden></div>
              <div data-detail-panel="messages" class="admin-surface" hidden></div>
              <div data-detail-panel="changes" class="admin-surface" hidden></div>
            </div>
          </section>

          <!-- 3. SUBMIT INNOVATION (START -> 12-STEP WIZARD -> SUCCESS) -->
          <section id="submit" class="admin-work-section" hidden aria-labelledby="submit-heading">
            <div data-start-application-view>
              <div class="admin-users-heading">
                <div>
                  <p class="eyebrow">NEW SUBMISSION</p>
                  <h2 id="submit-heading">Submit an innovation to CEDA</h2>
                  <p class="innovator-subtitle">Choose how you are applying and select your innovation sector before starting your private autosaved draft.</p>
                </div>
              </div>

              <div class="admin-overview-grid">
                <form class="admin-surface admin-form" data-start-application-form>
                  <fieldset class="admin-form-wide innovator-radio-cards">
                    <legend>1. Who is applying?</legend>
                    <label class="innovator-choice-card">
                      <input type="radio" name="applicantType" value="Individual" checked>
                      <span><strong>Individual applicant</strong><small>Independent inventor, founder, student, researcher, or pre-registration team.</small></span>
                    </label>
                    <label class="innovator-choice-card">
                      <input type="radio" name="applicantType" value="Registered company">
                      <span><strong>Registered company</strong><small>Authorized representative submitting on behalf of a Botswana registered entity.</small></span>
                    </label>
                  </fieldset>

                  <label class="admin-form-wide">2. Primary innovation sector
                    <select name="sectorId" data-start-sector-select required>
                      <option value="">Loading published sectors...</option>
                    </select>
                  </label>

                  <div class="admin-form-wide innovator-start-footer">
                    <button type="submit" class="admin-cta" data-create-draft-submit>Start application ${arrowIcon()}</button>
                    <p class="admin-help">Progress saves automatically after you start. Drafts remain strictly private to you until submitted.</p>
                  </div>
                </form>

                <aside class="admin-surface innovator-guidance-box">
                  <p class="eyebrow">BEFORE YOU BEGIN</p>
                  <h3>What to expect</h3>
                  <dl class="innovator-explainer-list">
                    <dt>Information required</dt>
                    <dd>12 short sections covering applicant info, problem, solution, beneficiaries, market impact, innovation stage, implementation, team, support needs, evidence, and declaration.</dd>
                    <dt>Supported evidence</dt>
                    <dd>Up to 4 files per section (max 10 MB each: PDF, DOCX, PPTX, XLSX, JPG, PNG) plus HTTPS demonstration video links. Protected files never use public links.</dd>
                    <dt>Saving progress</dt>
                    <dd>Changes autosave safely with version protection. Leave and return anytime via Save and continue later.</dd>
                    <dt>Submission process</dt>
                    <dd>Final submission locks a verified snapshot, generates a receipt reference, and enters CEDA screening.</dd>
                    <dt>Eligibility &amp; privacy notice</dt>
                    <dd>Botswana residents and registered entities across published CEDA sectors may apply. Drafts stay private; submitted applications are isolated from internal assessor notes.</dd>
                  </dl>
                </aside>
              </div>
            </div>

            <!-- 12-Step Adaptive Wizard -->
            <div data-wizard-view hidden>
              <div class="admin-surface innovator-wizard-topbar">
                <div>
                  <div class="innovator-wizard-meta-row">
                    <span class="admin-case-badge case-submitted" data-wizard-status-badge>Draft</span>
                    <strong data-wizard-ref>CEDA-INN-2026</strong>
                    <span class="admin-help" data-wizard-last-saved>Not yet modified</span>
                  </div>
                  <h2 data-wizard-app-title>Untitled innovation draft</h2>
                </div>
                <div class="innovator-wizard-top-actions">
                  <button type="button" class="admin-button-secondary" data-wizard-live-chat>Live chat with CEDA Consultant</button>
                  <button type="button" class="admin-button-secondary" data-wizard-save-later>Save &amp; continue later</button>
                  <button type="button" class="admin-button-secondary" data-wizard-exit>Exit draft</button>
                </div>
              </div>

              <div class="admin-surface innovator-wizard-progress-bar">
                <div class="innovator-progress-copy">
                  <span data-wizard-step-label>Step 1 of 12: Applicant information</span>
                  <strong data-wizard-readiness-label>0% complete</strong>
                </div>
                <progress max="100" value="8" data-wizard-progress aria-label="Application completion progress"></progress>
                <nav class="innovator-step-track" aria-label="Application progress">
                  <ol>${WIZARD_STEPS.map(s => `<li><button type="button" class="innovator-track-step" data-track-jump="${s.step}" aria-label="Step ${s.step}: ${s.title}"><span class="innovator-track-dot" aria-hidden="true">${s.step}</span><span class="innovator-track-caption">${s.shortTitle}</span></button></li>`).join("")}</ol>
                </nav>
              </div>

              <div class="innovator-wizard-grid">
                <nav class="admin-surface innovator-wizard-rail" aria-label="Application steps">
                  <ol data-wizard-rail>
                    ${WIZARD_STEPS.map(s => `<li><button type="button" class="innovator-rail-step" data-wizard-jump="${s.step}"><span class="innovator-rail-num">${s.step}</span><span class="innovator-rail-title">${s.shortTitle}</span><span class="innovator-rail-state" data-rail-state="${s.step}">Pending</span></button></li>`).join("")}
                  </ol>
                </nav>

                <form class="admin-surface innovator-wizard-form" data-wizard-form novalidate>
                  <div class="innovator-step-intro">
                    <p class="eyebrow" data-step-eyebrow>STEP 1 OF 12</p>
                    <h3 data-step-heading>Applicant information</h3>
                    <p class="admin-help" data-step-hint></p>
                  </div>

                  <!-- STEP 1: Applicant info -->
                  <div data-wizard-step-panel="1" class="admin-form">
                    <label>Applicant type
                      <select name="applicantType">
                        <option value="Individual">Individual</option>
                        <option value="Registered company">Registered company</option>
                      </select>
                    </label>
                    <label>Full name<input name="fullName" required maxlength="120" autocomplete="name"></label>
                    <label>Email address<input name="email" type="email" required maxlength="254" autocomplete="email"></label>
                    <label>Phone number<input name="phone" maxlength="40" placeholder="+267 ..."></label>
                    <label>District
                      <select name="district">
                        ${BOTSWANA_DISTRICTS.map(d => `<option value="${d}">${d}</option>`).join("")}
                      </select>
                    </label>
                    <label>Applicant role or background<input name="expertise" maxlength="160" placeholder="e.g. Agri-tech engineer, founder"></label>
                    <label>Applying with co-founders or collaborators?
                      <select name="hasCollaborators"><option value="No">No</option><option value="Yes">Yes</option></select>
                    </label>
                    <label class="admin-form-wide" data-collaborators-field hidden>Co-founders / collaborators (full names, roles and contact details)<textarea name="collaboratorsText" rows="3" maxlength="1000" placeholder="Full name, role, and email or phone for each collaborator"></textarea></label>
                    <fieldset class="admin-form-wide innovator-optional-contact"><legend>Alternative contact (optional)</legend><p class="admin-help">Only provide someone who agrees to be contacted if CEDA cannot reach you about this application. This person is not assessed as part of your innovation.</p><div class="admin-form"><label>Contact name<input name="alternativeContactName" maxlength="120" autocomplete="off"></label><label>Relationship<input name="alternativeContactRelationship" maxlength="80" autocomplete="off"></label><label>Phone number<input name="alternativeContactPhone" type="tel" maxlength="40" autocomplete="off"></label><label class="admin-form-wide innovator-checkbox"><input type="checkbox" name="alternativeContactConsent"><span>I confirm that this person agreed to be contacted for this purpose.</span></label></div></fieldset>
                    <div class="admin-form-wide innovator-company-fields" data-company-fields hidden>
                      <div class="admin-form">
                        <label>Registered company name<input name="companyName" maxlength="160"></label>
                        <label>CIPA / Registration number<input name="companyRegNumber" maxlength="80" placeholder="BW0000..."></label>
                        <label>Company sector<input name="companySector" maxlength="100"></label>
                        <label>Your role in the company<input name="representativeRole" maxlength="100" placeholder="Managing Director / Founder"></label>
                        <label class="admin-form-wide innovator-checkbox"><input type="checkbox" name="companyAuthority"> <span>I confirm that I am authorized to submit this application on behalf of the registered company.</span></label>
                      </div>
                    </div>
                  </div>

                  <!-- STEP 2: Innovation overview -->
                  <div data-wizard-step-panel="2" class="admin-form" hidden>
                    <label class="admin-form-wide">Innovation title <span class="innovator-field-help" tabindex="0" aria-label="Innovation title help" data-help="A short name for your idea or product. For example: Botswana Market Finder.">?</span>
                      <input name="title" required minlength="3" maxlength="200" placeholder="Clear, descriptive title for your innovation">
                      <small class="admin-help" data-count-for="title"></small>
                    </label>
                    <label class="admin-form-wide">Plain-language summary (20 to 5000 chars)
                      <textarea name="summary" required rows="4" maxlength="5000" placeholder="Explain what your innovation is and the core outcome in plain terms."></textarea>
                      <small class="admin-help" data-count-for="summary"></small>
                    </label>
                    <label>Primary sector <span class="innovator-field-help" tabindex="0" aria-label="Primary sector help" data-help="The main industry your innovation serves. Choose from the published sectors available in this application.">?</span>
                      <select name="primarySector" data-wizard-sector-select required></select>
                    </label>
                    <label>Core technology or method <span class="innovator-field-help" tabindex="0" aria-label="Core technology or method help" data-help="How your idea works, such as a mobile app, solar equipment or a new production process. A technical term is not required.">?</span>
                      <input name="technologyMethod" maxlength="300" placeholder="e.g. Solar IoT telemetry, mobile USSD workflow, bio-processing">
                    </label>
                    <fieldset class="admin-form-wide innovator-check-grid">
                      <legend>What kind of innovation is this? <span class="innovator-field-help" tabindex="0" aria-label="Innovation type help" data-help="Choose how your innovation is delivered, such as a digital product, physical product, improved process or service. This differs from the industry sector above.">?</span></legend>
                      ${INNOVATION_TYPES.map(t => `<label class="innovator-checkbox"><input type="checkbox" name="innovationType" value="${t}"> <span>${t}</span></label>`).join("")}
                    </fieldset>
                  </div>

                  <!-- STEP 3: Problem being addressed -->
                  <div data-wizard-step-panel="3" class="admin-form" hidden>
                    <label class="admin-form-wide">Problem being addressed (min 20 chars)
                      <textarea name="problem" required rows="5" maxlength="5000" placeholder="Describe the concrete problem observed in Botswana, its scale, and why current solutions are inadequate."></textarea>
                      <small class="admin-help" data-count-for="problem"></small>
                    </label>
                    <label class="admin-form-wide">Why this problem needs solving now
                      <textarea name="problemUrgency" rows="3" maxlength="2000" placeholder="Explain the cost of inaction for households, MSMEs, or public systems."></textarea>
                      <small class="admin-help" data-count-for="problemUrgency"></small>
                    </label>
                  </div>

                  <!-- STEP 4: Proposed solution -->
                  <div data-wizard-step-panel="4" class="admin-form" hidden>
                    <label class="admin-form-wide">Proposed solution &amp; how it works (min 20 chars)
                      <textarea name="solution" required rows="5" maxlength="5000" placeholder="Detail your solution architecture, user experience, and key differentiators."></textarea>
                      <small class="admin-help" data-count-for="solution"></small>
                    </label>
                    <label>Are alternatives already available in the market?
                      <select name="hasAlternatives"><option value="Unsure">Unsure</option><option value="Yes">Yes</option><option value="No">No</option></select>
                    </label>
                    <label>Have you tested this with real users?
                      <select name="testedWithUsers"><option value="No">No</option><option value="Yes">Yes</option></select>
                    </label>
                    <label class="admin-form-wide">How your solution compares with existing alternatives
                      <textarea name="alternativesDetail" rows="3" maxlength="2000" placeholder="Cost, reliability, local fit, or accessibility advantages."></textarea>
                    </label>
                    <label class="admin-form-wide" data-testing-lessons-wrap hidden>What did early user testing teach you?
                      <textarea name="testingLessons" rows="3" maxlength="2000" placeholder="Summarise user feedback and changes already made."></textarea>
                    </label>
                  </div>

                  <!-- STEP 5: Target users or beneficiaries -->
                  <div data-wizard-step-panel="5" class="admin-form" hidden>
                    <fieldset class="admin-form-wide innovator-check-grid">
                      <legend>Primary beneficiaries</legend>
                      ${BENEFICIARY_GROUPS.map(g => `<label class="innovator-checkbox"><input type="checkbox" name="beneficiaries" value="${g}"> <span>${g}</span></label>`).join("")}
                    </fieldset>
                    <label>Deployment footprint
                      <select name="deploymentFootprint">
                        <option value="National (Botswana)">National (Botswana)</option>
                        <option value="Greater Gaborone">Greater Gaborone</option>
                        <option value="District / Rural priority">District / Rural priority</option>
                        <option value="SADC regional export">SADC regional export</option>
                      </select>
                    </label>
                    <label>Citizen empowerment focus
                      <select name="empowermentFocus"><option value="Yes">Yes</option><option value="Partial">Partial</option><option value="No">No</option></select>
                    </label>
                    <label class="admin-form-wide">How Batswana and local communities benefit
                      <textarea name="botswanaBenefit" rows="4" maxlength="3000" placeholder="Describe measurable accessibility, affordability, or local value-chain benefits."></textarea>
                      <small class="admin-help" data-count-for="botswanaBenefit"></small>
                    </label>
                    <label>Environmental sustainability impact
                      <select name="environmentalImpact"><option value="Positive">Positive</option><option value="Neutral">Neutral</option><option value="Managed risk">Managed risk</option></select>
                    </label>
                    <label>Environmental notes
                      <input name="environmentalNotes" maxlength="500" placeholder="e.g. Solar powered, cuts water waste, recycles inputs">
                    </label>
                  </div>

                  <!-- STEP 6: Market and impact -->
                  <div data-wizard-step-panel="6" class="admin-form" hidden>
                    <label class="admin-form-wide">Market demand &amp; sustainability model
                      <textarea name="marketDemand" rows="4" maxlength="4000" placeholder="Who pays or adopts, estimated addressable demand, and unit viability."></textarea>
                      <small class="admin-help" data-count-for="marketDemand"></small>
                    </label>
                    <label>Expected direct job creation?
                      <select name="createsJobs"><option value="Yes">Yes</option><option value="Unsure">Unsure</option><option value="No">No</option></select>
                    </label>
                    <label>Year 1 jobs estimate<input name="jobsYear1" maxlength="40" placeholder="e.g. 4"></label>
                    <label>Year 3 jobs estimate<input name="jobsYear3" maxlength="40" placeholder="e.g. 15"></label>
                    <label>Year 5 jobs estimate<input name="jobsYear5" maxlength="40" placeholder="e.g. 35"></label>
                    <label class="admin-form-wide">Assumptions behind demand &amp; impact estimates
                      <textarea name="jobsAssumptions" rows="3" maxlength="2000" placeholder="Briefly explain realistic customer or operational milestones behind these figures."></textarea>
                    </label>
                  </div>

                  <!-- STEP 7: Innovation stage (Adaptive) -->
                  <div data-wizard-step-panel="7" class="admin-form" hidden>
                    <label class="admin-form-wide">Current innovation stage
                      <select name="stage">
                        ${INNOVATION_STAGES.map(st => `<option value="${st}">${st}</option>`).join("")}
                      </select>
                    </label>
                    <div class="admin-form-wide innovator-stage-banner" data-stage-guidance-box></div>
                    <label class="admin-form-wide"><span data-stage-metrics-label>Stage evidence &amp; validation metrics</span>
                      <textarea name="stageEvidenceNotes" rows="4" maxlength="3000"></textarea>
                      <small class="admin-help" data-count-for="stageEvidenceNotes"></small>
                    </label>
                    <label class="admin-form-wide">Next technical or commercial milestone
                      <textarea name="stageMilestoneNext" rows="3" maxlength="1500" placeholder="What concrete milestone will you unlock over the next 6 months?"></textarea>
                    </label>
                  </div>

                  <!-- STEP 8: Implementation plan -->
                  <div data-wizard-step-panel="8" class="admin-form" hidden>
                    <label class="admin-form-wide">Implementation approach (min 10 chars)
                      <textarea name="implementationApproach" required rows="4" maxlength="4000" placeholder="Step-by-step rollout plan, regulatory checks, and operational workflow."></textarea>
                      <small class="admin-help" data-count-for="implementationApproach"></small>
                    </label>
                    <label>1-Year milestone<input name="milestone1Year" maxlength="300" placeholder="Pilot or MVP release target"></label>
                    <label>3-Year milestone<input name="milestone3Year" maxlength="300" placeholder="District expansion &amp; breakeven target"></label>
                    <label>5-Year milestone<input name="milestone5Year" maxlength="300" placeholder="National/regional scale target"></label>
                    <label class="admin-form-wide">Key delivery risks &amp; mitigations
                      <textarea name="risksAndMitigations" rows="3" maxlength="2500" placeholder="Technical, supply-chain, regulatory, or adoption risks and how you mitigate them."></textarea>
                    </label>
                  </div>

                  <!-- STEP 9: Team information -->
                  <div data-wizard-step-panel="9" class="admin-form" hidden>
                    <label class="admin-form-wide">Founder &amp; team capabilities
                      <textarea name="teamExperience" rows="4" maxlength="3000" placeholder="Relevant technical, business, or domain experience on the team."></textarea>
                      <small class="admin-help" data-count-for="teamExperience"></small>
                    </label>
                    <label class="admin-form-wide">Critical skills or resources still needed
                      <textarea name="resourcesNeeded" rows="3" maxlength="2000" placeholder="Roles, mentorship, equipment, or certification support needed."></textarea>
                    </label>
                    <label class="admin-form-wide">Existing or target institutional partners
                      <input name="partnerships" maxlength="500" placeholder="Universities, hubs, supply partners, off-takers">
                    </label>
                  </div>

                  <!-- STEP 10: Financial or support requirements -->
                  <div data-wizard-step-panel="10" class="admin-form" hidden>
                    <label class="admin-form-wide">Support required from CEDA
                      <textarea name="supportRequestedSummary" rows="4" maxlength="3000" placeholder="Specify advisory, testing, market access, or funding requirements clearly."></textarea>
                      <small class="admin-help" data-count-for="supportRequestedSummary"></small>
                    </label>
                    <label>Business plan prepared?
                      <select name="hasBusinessPlan"><option value="No">No</option><option value="In progress">In progress</option><option value="Yes">Yes</option></select>
                    </label>
                    <label>Financial projections prepared?
                      <select name="hasFinancialProjections"><option value="No">No</option><option value="In progress">In progress</option><option value="Yes">Yes</option></select>
                    </label>
                    <label class="admin-form-wide">Budget &amp; unit cost assumptions
                      <textarea name="financialAssumptions" rows="3" maxlength="2500" placeholder="Key capital items, operating costs, and expected pricing sustainability."></textarea>
                    </label>
                  </div>

                  <!-- STEP 11: Supporting evidence (Private upload + Video links) -->
                  <div data-wizard-step-panel="11" class="innovator-evidence-step" hidden>
                    <div class="innovator-document-checklist" data-wizard-forms-guide></div>
                    <div class="innovator-document-checklist" data-document-checklist aria-live="polite"></div>
                    <div class="innovator-evidence-policy">
                      <strong>Supporting documents</strong>
                      <span>Attach verification records above, then add any other documents that help explain your innovation. Each file can be up to 10 MB. Attachments to earlier answers remain with those answers.</span>
                    </div>

                    <div class="innovator-evidence-forms">
                      <div class="admin-form innovator-upload-box">
                        <h4>Additional supporting documents</h4>
                        <input type="hidden" data-evidence-section value="supplementary">
                        <label>Document category
                          <select name="evidenceCategory" data-evidence-category>
                            ${EVIDENCE_RULES.sectionCategories.map(cat => `<option value="${cat}">${cat}</option>`).join("")}
                          </select>
                        </label>
                        <label>Document title<input type="text" data-evidence-title maxlength="160" placeholder="e.g. Pilot testing metrics report"></label>
                        <label>Notes (optional)<input type="text" data-evidence-desc maxlength="300" placeholder="What assessors should look at"></label>
                        <label class="admin-form-wide">Select file
                          <input type="file" data-evidence-file-input accept=".pdf,.docx,.pptx,.xlsx,.jpg,.jpeg,.png">
                        </label>
                        <div class="innovator-upload-progress" data-upload-progress-wrap hidden>
                          <progress max="100" value="0" data-upload-progress></progress>
                          <span data-upload-progress-label>Uploading privately...</span>
                        </div>
                        <button type="button" class="admin-cta" data-evidence-upload-btn>Attach document</button>
                      </div>

                      <div class="admin-form innovator-upload-box">
                        <h4>Attach link</h4>
                        <label>What does the link show?<input type="text" data-video-title maxlength="160" placeholder="e.g. Prototype demonstration"></label>
                        <label>Link address<input type="url" data-video-url maxlength="500" placeholder="https://..."></label>
                        <input type="hidden" data-video-section value="supplementary">
                        <button type="button" class="admin-button-secondary" data-add-video-btn>Attach link</button>
                      </div>
                    </div>

                    <div class="innovator-evidence-list-wrap">
                      <h4>Attached evidence for this draft</h4>
                      <div class="admin-table" tabindex="0" role="region" aria-label="Draft evidence files">
                        <table>
                          <thead><tr><th>Title</th><th>Section</th><th>File / Link</th><th>Size</th><th>Status</th><th>Actions</th></tr></thead>
                          <tbody data-wizard-evidence-tbody></tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <!-- STEP 12: Declaration and review -->
                  <div data-wizard-step-panel="12" class="innovator-review-step" hidden>
                    <div class="innovator-review-summary" data-review-readiness-summary></div>
                    <div class="admin-form">
                      <label>Did you or your team develop this innovation?
                        <select name="selfDeveloped"><option value="Yes">Yes</option><option value="Licensed / Partnered">Licensed / Partnered</option></select>
                      </label>
                      <label>Are there third-party IP contributors?
                        <select name="otherContributors"><option value="No">No</option><option value="Yes">Yes</option></select>
                      </label>
                      <label>Has any technical trade secret already been published openly?
                        <select name="sharedPublicly"><option value="No">No</option><option value="Yes">Yes</option></select>
                      </label>
                      <label>Any existing funding or investor agreements?
                        <select name="existingAgreements"><option value="No">No</option><option value="Yes">Yes</option></select>
                      </label>
                      <label class="admin-form-wide innovator-checkbox"><input type="checkbox" name="permissionToSubmit"> <span>I confirm that I hold the right and permission to submit this innovation and attached evidence to CEDA.</span></label>
                      <label class="admin-form-wide innovator-checkbox"><input type="checkbox" name="accuracyConfirmed"> <span>I declare that all information provided in this application is truthful and accurate to the best of my knowledge.</span></label>
                      <label class="admin-form-wide innovator-checkbox"><input type="checkbox" name="privacyConfirmed"> <span>I consent to CEDA processing this submission confidentially for innovation screening and support delivery.</span></label>
                    </div>
                    <div class="admin-form-actions">
                      <button type="button" class="admin-cta" data-open-submit-confirm>Submit application ${arrowIcon()}</button>
                    </div>
                  </div>

                  <div class="innovator-wizard-footer">
                    <button type="button" class="innovator-text-action" data-wizard-prev>Previous step</button>
                    <div class="innovator-wizard-footer-right">
                      <button type="button" class="admin-button-secondary" data-wizard-manual-save><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 3h11l4 4v14H3V3h3Zm0 0v7h11V3M7 21v-8h10v8"/></svg> Draft</button>
                      <button type="button" class="admin-cta" data-wizard-next>Save &amp; next step ${arrowIcon()}</button>
                    </div>
                  </div>
                </form>
              </div>
            </div>

            <!-- Submission Success Screen -->
            <div data-submission-success-view class="admin-surface innovator-success-view" hidden>
              <div class="verification-success innovator-success-badge" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M5 12.5 9.5 17 19 7"/></svg>
              </div>
              <p class="eyebrow">APPLICATION SUBMITTED</p>
              <h2 data-success-title>Your innovation application is now with CEDA</h2>
              <p class="innovator-subtitle">Reference <strong data-success-ref></strong> &bull; Receipt <strong data-success-receipt></strong> &bull; Submitted <span data-success-date></span></p>
              <div class="innovator-success-next">
                <h3>What happens next</h3>
                <ol>
                  <li>CEDA screening checks sector alignment and confirms your supporting evidence files.</li>
                  <li>Your application snapshot stays safely locked unless CEDA requests specific clarifications.</li>
                  <li>Any status change, message, or clarification deadline notifies you via the header bell.</li>
                </ol>
              </div>
              <div class="admin-form-actions innovator-success-actions">
                <button type="button" class="admin-cta" data-success-view-app>View application</button>
                <button type="button" class="admin-button-secondary" data-success-download-receipt>Download official receipt</button>
                <button type="button" class="admin-button-secondary" data-success-overview>Return to overview</button>
              </div>
            </div>
          </section>

          <!-- 4. MESSAGES -->
          <section id="messages" class="admin-work-section" hidden aria-labelledby="messages-heading">
            <div class="admin-users-heading">
              <div>
                <p class="eyebrow">COMMUNICATION</p>
                <h2 id="messages-heading">Messages</h2>
                <p>Application updates and direct communication with CEDA staff.</p>
              </div>
              <button type="button" class="admin-button-secondary" data-messages-escalate>Request human support</button>
            </div>

            <div class="innovator-messages-grid">
              <aside class="admin-surface innovator-thread-list-panel" aria-label="Conversations">
                <div class="innovator-panel-title-row">
                  <h3>Conversations</h3>
                  <button type="button" class="admin-button-secondary" data-new-general-thread>New message</button>
                </div>
                <ul class="innovator-thread-list" data-thread-list></ul>
                <p class="admin-help" data-thread-empty hidden>No conversations yet. Submit an application or send a message to CEDA support.</p>
              </aside>

              <div class="admin-surface innovator-thread-view">
                <div class="innovator-thread-header" data-active-thread-header>
                  <h3>Select a conversation</h3>
                </div>
                <div class="innovator-message-stream" data-message-stream></div>
                <form class="admin-form innovator-message-composer" data-message-reply-form hidden>
                  <label class="admin-form-wide">Subject<input name="subject" maxlength="160" placeholder="Question regarding application"></label>
                  <label class="admin-form-wide">Message<textarea name="body" required minlength="2" maxlength="4000" rows="3" placeholder="Write your message to CEDA staff..."></textarea></label>
                  <label class="admin-form-wide">Optional private attachment (PDF/Image, max 10 MB)
                    <input type="file" name="attachment" accept=".pdf,.docx,.jpg,.jpeg,.png">
                  </label>
                  <div class="admin-form-actions">
                    <button type="submit" class="admin-cta">Send message</button>
                  </div>
                </form>
              </div>
            </div>
          </section>

          <!-- 5. DOCUMENTS -->
          <section id="documents" class="admin-work-section" hidden aria-labelledby="documents-heading">
            <div class="admin-users-heading">
              <div>
                <p class="eyebrow">PRIVATE EVIDENCE LIBRARY</p>
                <h2 id="documents-heading">Verification documents</h2>
                <p>Find the identity, residence and company verification records attached to your applications here. New applications collect these documents in step 11.</p>
              </div>
            </div>
            <div class="admin-surface admin-directory-surface">
              <form data-docs-filter-form class="admin-directory-toolbar">
                <label class="admin-directory-query">
                  <span class="visually-hidden">Search documents</span>
                  ${navIcon("M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0")}
                  <input type="search" name="query" maxlength="100" placeholder="Search by file name, title, or application reference" autocomplete="off">
                </label>
                <label><span class="visually-hidden">Filter by section</span>
                  <select name="section">
                    <option value="">All sections</option>
                    <option value="applicant">Applicant records</option>
                    <option value="problem">Problem &amp; solution</option>
                    <option value="impact">Market &amp; impact</option>
                    <option value="feasibility">Feasibility &amp; stage</option>
                    <option value="supplementary">Financial &amp; supplementary</option>
                    <option value="clarification">Clarification response</option>
                  </select>
                </label>
              </form>
              <div class="admin-table" tabindex="0" role="region" aria-label="Uploaded innovator documents">
                <table>
                  <thead>
                    <tr><th>Document / File name</th><th>Application ref</th><th>Section</th><th>Uploaded</th><th>Size</th><th>Version</th><th>Actions</th></tr>
                  </thead>
                  <tbody data-docs-tbody></tbody>
                </table>
              </div>
              <div class="admin-directory-footer"><span data-docs-results aria-live="polite">0 documents</span></div>
            </div>
          </section>

          <!-- 6. OPTIMUS PRIME -->
          <section id="optimus" class="admin-work-section" hidden role="dialog" aria-modal="true" aria-labelledby="optimus-heading" aria-describedby="optimus-chat-description">
            <div class="admin-users-heading">
              <div class="innovator-optimus-identity">
                <span class="innovator-optimus-mark" aria-hidden="true"><svg viewBox="0 0 32 32" focusable="false"><path d="M16 4v4M10 9h12a5 5 0 0 1 5 5v7a5 5 0 0 1-5 5h-1l-5 4-5-4h-1a5 5 0 0 1-5-5v-7a5 5 0 0 1 5-5Z"/><path d="M11 16h.1M21 16h.1M12 21h8M6 16H3M29 16h-3M9 7 7 5M23 7l2-2"/></svg></span>
                <div>
                  <p class="eyebrow">CEDA PORTAL ASSISTANT</p>
                  <h2 id="optimus-heading">Optimus Prime</h2>
                  <p id="optimus-chat-description">Ask me about your portal, application, or supporting documents.</p>
                </div>
              </div>
              <div class="innovator-optimus-header-actions">
                <span class="innovator-optimus-online" data-live-chat-pill><i aria-hidden="true"></i> Here to help · Live Chat 09:00 to 16:00</span>
                <button type="button" class="admin-button-secondary" data-optimus-direct-live-chat>Live chat with consultant</button>
                <button type="button" class="admin-button-secondary" data-optimus-clear aria-label="Clear visible chat history">Clear</button>
                <button type="button" class="innovator-optimus-close" data-optimus-close aria-label="Close Optimus Prime chat">&times;</button>
              </div>
            </div>

            <div class="innovator-guardrail-banner" role="note" data-optimus-disclaimer>
              <strong>Guidance disclaimer:</strong> Optimus Prime provides general portal guidance only. It does not score applications, influence assessors, monitor your activity, or make assessment decisions.
            </div>

            <div class="innovator-guardrail-banner" role="status" data-live-chat-hours-banner>
              <strong>Live Chat Availability (09:00hrs to 16:00hrs Working Days ONLY):</strong> <span data-live-chat-hours-text>Checking CEDA service consultant availability…</span>
            </div>

            <div class="innovator-optimus-grid">
              <div class="admin-surface innovator-optimus-chat-shell">
                <div class="innovator-optimus-topics" role="group" aria-label="Guidance topics">
                  <button type="button" class="innovator-chip" data-optimus-prompt="How do I navigate the portal between applications, documents, and messages?" data-optimus-topic="navigation">Portal navigation</button>
                  <button type="button" class="innovator-chip" data-optimus-prompt="Who is eligible to apply as an individual or registered company?" data-optimus-topic="eligibility">Eligibility</button>
                  <button type="button" class="innovator-chip" data-optimus-prompt="How do the 12 application sections work?" data-optimus-topic="sections">Application sections</button>
                  <button type="button" class="innovator-chip" data-optimus-prompt="What supporting evidence files and video links are allowed?" data-optimus-topic="evidence">Evidence requirements</button>
                </div>

                <div class="innovator-optimus-chat-log" data-optimus-feed role="log" aria-live="polite" aria-label="Optimus Prime conversation history"></div>

                <form class="innovator-chat-composer" data-optimus-form>
                  <div class="innovator-chat-input-row">
                    <label class="visually-hidden" for="optimus-question-input">Ask Optimus Prime a question</label>
                    <textarea id="optimus-question-input" name="question" required minlength="3" maxlength="1000" rows="1" autocomplete="off" placeholder="Message Optimus Prime…"></textarea>
                    <button type="submit" class="innovator-optimus-send" aria-label="Send message">&#10148;</button>
                  </div>
                </form>
                <aside class="admin-surface innovator-escalate-panel" data-optimus-escalate-panel hidden>
                  <p>I'll bring a CEDA Support Officer into this conversation. Add a short note so they know how to help.</p>
                  <form class="admin-form" data-optimus-escalate-form>
                    <label class="visually-hidden" for="optimus-support-summary">What do you need help with?</label>
                    <textarea id="optimus-support-summary" name="summary" required minlength="5" maxlength="1000" rows="2" placeholder="What do you need help with?"></textarea>
                    <div class="innovator-optimus-escalate-actions">
                      <button type="button" class="admin-button-secondary" data-optimus-escalate-cancel>Cancel</button>
                      <button type="submit" class="admin-cta">Join support queue</button>
                    </div>
                  </form>
                </aside>
              </div>
            </div>
          </section>

          <!-- 7. HELP AND SUPPORT -->
          <section id="support" class="admin-work-section" hidden aria-labelledby="support-heading">
            <div class="admin-users-heading">
              <div>
                <p class="eyebrow">HELP CENTRE, LIVE CHAT &amp; ESCALATIONS</p>
                <h2 id="support-heading">Help and support</h2>
                <p>Search published help articles, start a live chat with a CEDA service consultant (09:00hrs to 16:00hrs working days), or escalate any issue.</p>
              </div>
              <div class="innovator-hero-actions">
                <button type="button" class="admin-cta" data-support-open-live-chat>Live chat with CEDA Consultant</button>
              </div>
            </div>

            <div class="innovator-guardrail-banner" role="status" data-support-live-chat-banner>
              <strong>Live Chat Operating Hours:</strong> <span data-support-live-chat-text>09:00hrs to 16:00hrs on working days ONLY (Monday to Friday CAT).</span>
            </div>

            <div class="admin-overview-grid">
              <div class="admin-surface">
                <h3>Approved help articles &amp; FAQs</h3>
                <form class="admin-directory-toolbar" data-faq-search-form>
                  <label class="admin-directory-query">
                    <span class="visually-hidden">Search help articles</span>
                    ${navIcon("M21 21l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0")}
                    <input type="search" name="query" maxlength="100" placeholder="Search FAQs and guides" autocomplete="off">
                  </label>
                </form>
                <div class="innovator-faq-list" data-faq-list></div>
              </div>

              <div class="admin-surface">
                <h3>Create support request or bug report</h3>
                <form class="admin-form" data-support-create-form>
                  <label>Request type
                    <select name="kind">
                      <option value="Support">General support request</option>
                      <option value="Bug">Report technical problem</option>
                      <option value="Feedback">Portal feedback</option>
                    </select>
                  </label>
                  <label>Related application reference (optional)
                    <select name="applicationRef" data-support-app-select>
                      <option value="">Not linked to an application</option>
                    </select>
                  </label>
                  <label class="admin-form-wide">Subject<input name="title" required minlength="3" maxlength="200" placeholder="Short summary of what happened"></label>
                  <label class="admin-form-wide">Details<textarea name="detail" required minlength="10" maxlength="2000" rows="3" placeholder="Explain clearly what help you need or what error occurred."></textarea></label>
                  <label class="admin-form-wide">Steps to reproduce (optional for bugs)<input name="steps" maxlength="500" placeholder="Which screen or button triggered the issue"></label>
                  <button type="submit" class="admin-cta">Submit support request</button>
                </form>
              </div>
            </div>

            <div class="admin-surface" data-support-forms-panel>
              <h3>Application forms, accompanying copies &amp; regulatory authority contacts</h3>
              <p class="admin-help">Download official application forms and accompanying templates managed by CEDA administrators, or reach Botswana sector regulatory authorities.</p>
              <div class="admin-overview-grid">
                <div class="innovator-faq-list" data-support-portal-docs></div>
                <div class="innovator-faq-list" data-support-regulators></div>
              </div>
            </div>

            <div class="admin-surface admin-directory-surface">
              <h3>Your support requests &amp; resolution status</h3>
              <div class="admin-table" tabindex="0" role="region" aria-label="My support tickets">
                <table>
                  <thead><tr><th>Ticket</th><th>Type</th><th>Subject</th><th>Priority</th><th>Status</th><th>Owner</th><th>Updated</th><th>Action</th></tr></thead>
                  <tbody data-support-tbody></tbody>
                </table>
              </div>
              <div class="innovator-support-thread" data-support-detail hidden></div>
            </div>
          </section>

          <!-- 8. ACCOUNT AND SETTINGS -->
          <section id="settings" class="admin-work-section" hidden aria-labelledby="settings-heading">
            <div class="admin-users-heading">
              <div>
                <p class="eyebrow">PROFILE, ACCESSIBILITY &amp; SECURITY</p>
                <h2 id="settings-heading">Account and settings</h2>
                <p>Keep personal and company defaults accurate, adjust readability &amp; contrast, and review active sessions.</p>
              </div>
            </div>

            <div class="governance-tabs" role="tablist" aria-label="Account and settings categories">
              ${[
                ["personal", "Personal information"],
                ["company", "Company information"],
                ["security", "Password & account access"],
                ["notifications", "Notifications"],
                ["accessibility", "Accessibility"],
                ["privacy", "Privacy"],
                ["sessions", "Active sessions"],
              ].map(([key, label], i) => `<button type="button" role="tab" class="governance-tab${i === 0 ? " is-active" : ""}" data-settings-tab="${key}" aria-selected="${i === 0 ? "true" : "false"}">${label}</button>`).join("")}
            </div>

            <form class="admin-surface admin-form" data-settings-personal-form data-settings-panel="personal">
              <label>Full name<input name="fullName" required maxlength="120"></label>
              <label>Email address<input name="email" type="email" readonly aria-readonly="true"></label>
              <label>Phone number<input name="phone" maxlength="40" placeholder="+267 ..."></label>
              <label>Home district
                <select name="district">
                  ${BOTSWANA_DISTRICTS.map(d => `<option value="${d}">${d}</option>`).join("")}
                </select>
              </label>
              <label class="admin-form-wide">Primary expertise / role<input name="expertise" maxlength="200"></label>
              <div class="admin-form-actions"><button type="submit" class="admin-cta">Save personal details</button></div>
            </form>

            <form class="admin-surface admin-form" data-settings-company-form data-settings-panel="company" hidden>
              <label>Registered company name<input name="companyName" maxlength="160"></label>
              <label>CIPA registration number<input name="companyRegNumber" maxlength="80"></label>
              <label>Company sector<input name="companySector" maxlength="120"></label>
              <label>Your role / authority<input name="companyRole" maxlength="120" placeholder="Founder / Managing Director"></label>
              <div class="admin-form-actions"><button type="submit" class="admin-cta">Save company defaults</button></div>
            </form>

            <div class="admin-surface" data-settings-panel="security" hidden>
              <h3>Password and account access</h3>
              <p>For security, password updates verify ownership by sending a secure password reset link to your registered email address.</p>
              <p><strong>Signed in account:</strong> <span data-security-email></span></p>
              <div class="admin-form-actions">
                <button type="button" class="admin-cta" data-send-password-reset>Send password reset email</button>
              </div>
            </div>

            <form class="admin-surface admin-form" data-settings-notifications-form data-settings-panel="notifications" hidden>
              <div class="admin-form-wide innovator-guidance-box">
                <h4>Free alert subscriptions (At no charge, P0.00)</h4>
                <p>You can subscribe to receive automatic email, push, and portal notifications whenever your submission progresses through Submission, Review, Clarification, Approval, or Award, completely free of charge.</p>
              </div>
              <label class="admin-form-wide innovator-checkbox"><input type="checkbox" name="emailNotifications"> <span>Receive free email alerts when submission updates occur (P0.00 / No charge)</span></label>
              <label class="admin-form-wide innovator-checkbox"><input type="checkbox" name="pushNotifications"> <span>Receive mobile &amp; browser push alerts on registered devices (No charge)</span></label>
              <label class="admin-form-wide innovator-checkbox"><input type="checkbox" name="notifyStatus"> <span>Notify me immediately when application status changes (Submission, Review, Approval &amp; Award)</span></label>
              <label class="admin-form-wide innovator-checkbox"><input type="checkbox" name="notifyClarifications"> <span>Prioritize alerts for clarification requests &amp; deadlines</span></label>
              <label class="admin-form-wide innovator-checkbox"><input type="checkbox" name="notifyMessages"> <span>Show alerts for new messages from CEDA Staff or Support Officers</span></label>
              <p class="admin-form-wide admin-help">Turning off email or clarification alerts pauses external notices immediately; urgent deadlines and decisions remain visible inside your portal timeline.</p>
              <div class="admin-form-actions"><button type="submit" class="admin-cta">Save free alert preferences</button></div>
            </form>

            <form class="admin-surface admin-form" data-settings-accessibility-form data-settings-panel="accessibility" hidden>
              <label>Text size
                <select name="textSize">
                  <option value="standard">Standard</option>
                  <option value="large">Large (+15%)</option>
                  <option value="xlarge">Extra large (+30%)</option>
                </select>
              </label>
              <label class="admin-form-wide innovator-checkbox"><input type="checkbox" name="highContrast"> <span>Higher contrast borders &amp; focus rings</span></label>
              <label class="admin-form-wide innovator-checkbox"><input type="checkbox" name="reducedMotion"> <span>Reduced motion (disables celebration animations &amp; smooth scrolling)</span></label>
              <div class="admin-form-wide innovator-guidance-box">
                <h4>Screen reader &amp; keyboard navigation guidance</h4>
                <ul>
                  <li>Press <strong>Tab</strong> / <strong>Shift+Tab</strong> to move across sidebar navigation, wizard steps, and form fields.</li>
                  <li>Use the <strong>Skip to main content</strong> link at the top of any screen to jump past navigation.</li>
                  <li>Every status change and validation check announces cleanly through polite <code>aria-live</code> regions.</li>
                </ul>
              </div>
              <div class="admin-form-actions"><button type="submit" class="admin-cta">Apply &amp; save accessibility settings</button></div>
            </form>

            <div class="admin-surface" data-settings-panel="privacy" hidden>
              <h3>Privacy &amp; confidentiality protections</h3>
              <ul>
                <li><strong>Private drafts:</strong> Applications in <em>Draft</em> status stay strictly visible only to your account. Administrators and Assessors never see unsubmitted drafts.</li>
                <li><strong>Protected storage:</strong> Uploaded evidence is stored in a private encrypted bucket and opened only via temporary authorized links.</li>
                <li><strong>Assessment isolation:</strong> Internal reviewer identities, scoring notes, and conflict exclusions are permanently isolated from applicant views.</li>
              </ul>
            </div>

            <div class="admin-surface" data-settings-panel="sessions" hidden>
              <h3>Active browser sessions</h3>
              <p>Signed in via Supabase authenticated session (<span data-session-email></span>). End sessions if you used a shared workstation.</p>
              <div class="admin-form-actions">
                <button type="button" class="admin-button-secondary" data-logout-other-sessions>Log out other devices</button>
                <button type="button" class="admin-cta" data-innovator-logout-settings>Log out current session</button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  </div>`;
}
