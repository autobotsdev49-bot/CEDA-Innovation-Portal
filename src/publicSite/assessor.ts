import { assessmentCriteria } from "../features/assessment/round.ts";

const sections = [
  ["overview", "Overview", "M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6"],
  ["assessments", "My assessments", "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"],
  ["library", "Application library", "M3 7h7l2 2h9v11H3zM3 7V4h7l2 2h7v3"],
  ["discussion", "Messages &amp; discussion", "M4 5h16v12H8l-4 4zM8 9h8M8 13h5"],
  ["guidance", "Guidance", "M4 5c3-1 6 0 8 2 2-2 5-3 8-2v14c-3-1-6 0-8 2-2-2-5-3-8-2zM12 7v14"],
  ["progress", "Review progress", "M3 3v18h18M7 16v-4m5 4V8m5 8V5", true],
  ["reports", "Reports", "M3 3v18h18M7 14l4-4 4 3 6-7", true],
  ["notifications", "Notifications", "M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9M10 21h4"],
  ["settings", "Account &amp; security", "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11zM9 12l2 2 4-4"],
] as const;

const bellIconPath = sections.find(([id]) => id === "notifications")![2];

function icon(path: string) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

export function assessorScreen() {
  return `<div class="admin-shell assessor-shell" data-assessor>
    <a class="admin-skip" href="#assessor-main">Skip to workspace</a>
    <header class="admin-header">
      <a href="/assessor/" class="admin-brand" aria-label="CEDA Innovation Assessor workspace"><img src="/assets/ceda.png" alt="CEDA" width="70" height="44"><span>Innovation <small>ASSESSMENTS</small></span></a>
      <div class="admin-header-right" data-assessor-account hidden>
        <a class="admin-notification-bell" href="#notifications" aria-label="Notifications" title="Notifications">${icon(bellIconPath)}</a>
        <a class="admin-identity" href="#settings"><span data-assessor-name></span><span data-assessor-role>Assessor</span></a>
        <button type="button" class="admin-logout" data-assessor-logout>Log out</button>
      </div>
    </header>
    <div class="admin-layout" data-assessor-layout>
      <aside class="admin-sidebar" data-assessor-menu aria-label="Assessor workspace" hidden>
        <div class="admin-sidebar-top"><p class="admin-sidebar-label">WORKSPACE</p><button type="button" class="admin-sidebar-toggle" data-assessor-menu-toggle aria-label="Collapse workspace menu" aria-expanded="true" aria-controls="assessor-navigation">${icon("m14 5-7 7 7 7M20 5v14")}</button></div>
        <nav id="assessor-navigation" aria-label="Assessor sections">${sections.map(([id, label, path, lead]) => `<a href="#${id}" aria-label="${label}" title="${label}"${lead ? " data-assessor-lead hidden" : ""}>${icon(path)}<span>${label}</span></a>`).join("")}</nav>
      </aside>
      <section id="assessor-main" class="admin-content" tabindex="-1" aria-label="Assessment workspace">
        <p class="admin-status-message" data-assessor-status role="status">Checking assessor access.</p>
        <button type="button" class="admin-button-secondary" data-assessor-retry hidden>Try again</button>
        <div data-assessor-view hidden></div>
      </section>
    </div>
    <template data-assessor-rubric>${assessmentCriteria.map(key => `<span data-criterion="${key}"></span>`).join("")}</template>
  </div>`;
}
