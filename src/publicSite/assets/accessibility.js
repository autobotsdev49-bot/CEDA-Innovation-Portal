/**
 * CEDA Innovation Portal - Accessibility preferences
 * Handles: dark/light theme toggle + 5-step font scaling + TalkBack speech read aloud
 * Placement: Desktop header (public + all signed-in workspaces + auth) and mobile menu
 * Storage: localStorage keys ceda.theme, ceda.fontsize, ceda.talkback
 */

(function () {
  "use strict";

  // Storage keys
  const THEME_KEY = "ceda.theme";
  const FONTSIZE_KEY = "ceda.fontsize";
  const TALKBACK_KEY = "ceda.talkback";

  // State read from storage
  function readTheme() {
    try { return localStorage.getItem(THEME_KEY) || "light"; } catch { return "light"; }
  }
  function readFontSize() {
    try { return localStorage.getItem(FONTSIZE_KEY) || "default"; } catch { return "default"; }
  }
  function readTalkback() {
    try { return localStorage.getItem(TALKBACK_KEY) === "true"; } catch { return false; }
  }

  // Apply to html element
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  }
  function applyFontSize(size) {
    if (size === "default") {
      delete document.documentElement.dataset.fontsize;
    } else {
      document.documentElement.dataset.fontsize = size;
    }
    try { localStorage.setItem(FONTSIZE_KEY, size); } catch {}
  }
  function applyTalkback(enabled) {
    if (enabled) {
      document.documentElement.dataset.talkback = "true";
      try { localStorage.setItem(TALKBACK_KEY, "true"); } catch {}
      speak("TalkBack enabled. Click or focus any card or section to read it aloud.");
    } else {
      delete document.documentElement.dataset.talkback;
      try { localStorage.setItem(TALKBACK_KEY, "false"); } catch {}
      stopSpeaking();
      announce("TalkBack disabled");
    }
  }

  // Announce changes to screen readers via aria-live region
  function announce(msg) {
    const el = document.getElementById("a11y-announce");
    if (!el) return;
    el.textContent = "";
    requestAnimationFrame(() => requestAnimationFrame(() => { el.textContent = msg; }));
  }

  // Web Speech Synthesis (TalkBack read aloud)
  function speak(text) {
    if (!("speechSynthesis" in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const clean = String(text).replace(/\s+/g, " ").trim();
      if (!clean) return;
      const utt = new SpeechSynthesisUtterance(clean);
      utt.rate = 1.0;
      utt.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const engVoice = voices.find(v => v.lang.startsWith("en-") || v.lang === "en");
      if (engVoice) utt.voice = engVoice;
      window.speechSynthesis.speak(utt);
    } catch {}
  }

  function stopSpeaking() {
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      document.querySelectorAll(".a11y-speaking").forEach(el => el.classList.remove("a11y-speaking"));
    } catch {}
  }

  function readCurrentPage() {
    if (!("speechSynthesis" in window)) {
      announce("Speech synthesis is not supported in this browser.");
      return;
    }
    if (window.speechSynthesis.speaking) {
      stopSpeaking();
      announce("Reading stopped.");
      return;
    }
    const h1 = document.querySelector("h1");
    const lead = document.querySelector(".lead, .access-intro, .admin-modal-intro");
    const activeSection = document.querySelector("main section:not([hidden]), .admin-content > div:not([hidden]), .access-content");
    const parts = [];
    if (h1 && h1.textContent) parts.push(h1.textContent.trim());
    if (lead && lead.textContent) parts.push(lead.textContent.trim());
    if (activeSection) {
      const summaryText = Array.from(activeSection.querySelectorAll("h2, h3, p"))
        .filter(el => !el.hidden && el.offsetParent !== null)
        .slice(0, 5)
        .map(el => el.textContent.trim())
        .filter(Boolean)
        .join(". ");
      if (summaryText) parts.push(summaryText);
    }
    const fullText = parts.join(". ");
    if (fullText) {
      speak(fullText);
    } else {
      speak(document.title);
    }
  }

  // SVG icons (inline, no external request)
  const ICON = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    a11y: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="5" r="1.5"/><path d="M5 9l7 1 7-1M9 21l1-6 2 3 2-3 1 6"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  };

  const SIZE_STEPS = [
    { key: "sm", label: "A-", title: "Smaller text size" },
    { key: "default", label: "A", title: "Default text size" },
    { key: "lg", label: "A+", title: "Large text" },
    { key: "xl", label: "A++", title: "Extra-large text" },
    { key: "xxl", label: "A+++", title: "Maximum text" },
  ];

  // Build the panel HTML
  function buildPanel(idSuffix) {
    const panelId = `a11y-panel-${idSuffix}`;
    const theme = readTheme();
    const size = readFontSize();
    const talkback = readTalkback();

    const themeButtons = ["light", "dark"].map(t => `
      <button type="button"
        class="a11y-theme-btn"
        data-a11y-theme="${t}"
        aria-pressed="${theme === t}"
        title="${t === "light" ? "Light mode" : "Dark mode"}">
        ${t === "light" ? ICON.sun : ICON.moon}
        ${t === "light" ? "Light" : "Dark"}
      </button>`).join("");

    const sizeButtons = SIZE_STEPS.map(s => `
      <button type="button"
        class="a11y-size-btn"
        data-a11y-size="${s.key}"
        aria-pressed="${size === s.key}"
        title="${s.title}"
        style="font-size:${s.key === "sm" ? ".72rem" : s.key === "default" ? ".8rem" : s.key === "lg" ? ".9rem" : s.key === "xl" ? "1rem" : "1.08rem"}">
        ${s.label}
      </button>`).join("");

    return `
      <div class="a11y-wrapper" id="a11y-wrapper-${idSuffix}">
        <button type="button"
          class="a11y-btn"
          aria-expanded="false"
          aria-controls="${panelId}"
          aria-label="Accessibility preferences"
          title="Accessibility preferences">
          ${ICON.a11y}
        </button>
        <div id="${panelId}" class="a11y-panel" aria-hidden="true" role="dialog" aria-label="Accessibility preferences">
          <p class="a11y-panel-title">Accessibility</p>
          <p class="a11y-section-label">Theme</p>
          <div class="a11y-theme-row">${themeButtons}</div>
          <p class="a11y-section-label">Text size</p>
          <div class="a11y-size-row">${sizeButtons}</div>
          <p class="a11y-section-label">TalkBack (Read aloud)</p>
          <div class="a11y-talkback-row">
            <button type="button"
              class="a11y-talkback-toggle"
              data-a11y-talkback
              aria-pressed="${talkback}"
              title="Turn TalkBack speech assistance on or off">
              ${ICON.speaker} <span>TalkBack</span>
            </button>
            <button type="button"
              class="a11y-read-btn"
              data-a11y-read-page
              title="Read current page or active section aloud">
              ${ICON.play} <span>Read aloud</span>
            </button>
          </div>
        </div>
      </div>`;
  }

  // Build the mobile-nav inline controls
  function buildMobileControls() {
    const theme = readTheme();
    const size = readFontSize();
    const talkback = readTalkback();

    const themeButtons = ["light", "dark"].map(t => `
      <button type="button"
        class="a11y-theme-btn"
        data-a11y-theme="${t}"
        aria-pressed="${theme === t}"
        title="${t === "light" ? "Light mode" : "Dark mode"}">
        ${t === "light" ? ICON.sun : ICON.moon}
        ${t === "light" ? "Light" : "Dark"}
      </button>`).join("");

    const sizeButtons = SIZE_STEPS.map(s => `
      <button type="button"
        class="a11y-size-btn"
        data-a11y-size="${s.key}"
        aria-pressed="${size === s.key}"
        title="${s.title}"
        style="font-size:${s.key === "sm" ? ".68rem" : s.key === "default" ? ".75rem" : s.key === "lg" ? ".82rem" : s.key === "xl" ? ".9rem" : ".96rem"}">
        ${s.label}
      </button>`).join("");

    return `
      <div class="mobile-nav-a11y">
        <span class="mobile-a11y-label">${ICON.a11y} Accessibility</span>
        <div class="mobile-a11y-theme-row">${themeButtons}</div>
        <div class="mobile-a11y-size-row">${sizeButtons}</div>
        <div class="mobile-a11y-talkback-row">
          <button type="button"
            class="a11y-talkback-toggle"
            data-a11y-talkback
            aria-pressed="${talkback}"
            title="Turn TalkBack speech assistance on or off">
            ${ICON.speaker} <span>TalkBack</span>
          </button>
          <button type="button"
            class="a11y-read-btn"
            data-a11y-read-page
            title="Read current page aloud">
            ${ICON.play} <span>Read page</span>
          </button>
        </div>
      </div>`;
  }

  // Sync all pressed states across all instances
  function syncAllPressed() {
    const theme = readTheme();
    const size = readFontSize();
    const talkback = readTalkback();
    document.querySelectorAll("[data-a11y-theme]").forEach(btn => {
      btn.setAttribute("aria-pressed", String(btn.dataset.a11yTheme === theme));
    });
    document.querySelectorAll("[data-a11y-size]").forEach(btn => {
      btn.setAttribute("aria-pressed", String(btn.dataset.a11ySize === size));
    });
    document.querySelectorAll("[data-a11y-talkback]").forEach(btn => {
      btn.setAttribute("aria-pressed", String(talkback));
    });
  }

  // Wire up event delegation on a container
  function wireContainer(container) {
    container.addEventListener("click", (e) => {
      const themeBtn = e.target.closest("[data-a11y-theme]");
      const sizeBtn = e.target.closest("[data-a11y-size]");
      const talkbackBtn = e.target.closest("[data-a11y-talkback]");
      const readBtn = e.target.closest("[data-a11y-read-page]");

      if (themeBtn) {
        const t = themeBtn.dataset.a11yTheme;
        applyTheme(t);
        syncAllPressed();
        announce(`${t === "dark" ? "Dark" : "Light"} mode on`);
      }
      if (sizeBtn) {
        const s = sizeBtn.dataset.a11ySize;
        applyFontSize(s);
        syncAllPressed();
        const label = SIZE_STEPS.find(x => x.key === s)?.title || "Text size changed";
        announce(label);
      }
      if (talkbackBtn) {
        const next = !readTalkback();
        applyTalkback(next);
        syncAllPressed();
      }
      if (readBtn) {
        readCurrentPage();
      }
    });
  }

  // Panel open/close for desktop wrapper
  function wirePanel(wrapperEl) {
    const btn = wrapperEl.querySelector(".a11y-btn");
    const panel = wrapperEl.querySelector(".a11y-panel");
    if (!btn || !panel) return;

    function open() {
      btn.setAttribute("aria-expanded", "true");
      panel.setAttribute("aria-hidden", "false");
    }
    function close() {
      btn.setAttribute("aria-expanded", "false");
      panel.setAttribute("aria-hidden", "true");
    }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = btn.getAttribute("aria-expanded") === "true";
      if (isOpen) {
        close();
      } else {
        open();
      }
    });

    document.addEventListener("click", (e) => {
      if (!wrapperEl.contains(e.target)) close();
    });
    wrapperEl.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        close();
        btn.focus();
        stopSpeaking();
      }
    });
  }

  // Mount a panel into a target element
  function mountPanel(target, idSuffix, prepend = false) {
    if (!target || target.querySelector(".a11y-wrapper")) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = buildPanel(idSuffix);
    const wrapper = tmp.firstElementChild;
    if (prepend && target.firstChild) {
      target.insertBefore(wrapper, target.firstChild);
    } else {
      target.appendChild(wrapper);
    }
    wirePanel(wrapper);
    wireContainer(wrapper);
  }

  // Inject into all active headers (Public, Workspaces, Auth)
  function injectAll() {
    const headerMount = document.getElementById("a11y-header-mount");
    if (headerMount) mountPanel(headerMount, "public");

    const accessMount = document.getElementById("a11y-access-mount");
    if (accessMount) mountPanel(accessMount, "access");

    const headerActions = document.querySelector(".header-actions");
    if (headerActions && !headerActions.querySelector(".a11y-wrapper")) {
      mountPanel(headerActions, "header-actions", true);
    }

    document.querySelectorAll(".admin-header").forEach((header, idx) => {
      if (header.querySelector(".a11y-wrapper")) return;
      const right = header.querySelector(".admin-header-right");
      if (right) {
        mountPanel(right, `ws-${idx}`, true);
      } else {
        mountPanel(header, `ws-hdr-${idx}`, false);
      }
    });

    document.querySelectorAll(".access-brand").forEach((brandEl, idx) => {
      if (brandEl.querySelector(".a11y-wrapper")) return;
      mountPanel(brandEl, `access-brand-${idx}`, false);
    });

    document.querySelectorAll(".mobile-nav").forEach((mobileNav) => {
      if (mobileNav.querySelector(".mobile-nav-a11y")) return;
      const nav = mobileNav.querySelector("nav");
      if (!nav) return;
      const tmp = document.createElement("div");
      tmp.innerHTML = buildMobileControls();
      nav.appendChild(tmp.firstElementChild);
      wireContainer(nav);
    });

    syncAllPressed();
  }

  // Hidden live region for screen-reader announcements
  function ensureAnnounceRegion() {
    if (document.getElementById("a11y-announce")) return;
    const el = document.createElement("div");
    el.id = "a11y-announce";
    el.className = "a11y-announce";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-atomic", "true");
    document.body.appendChild(el);
  }

  // Global TalkBack click & focus reader
  function setupTalkbackListeners() {
    document.addEventListener("click", (e) => {
      if (!readTalkback()) return;
      if (e.target.closest(".a11y-wrapper, .mobile-nav-a11y")) return;
      const item = e.target.closest("button, a, label, h1, h2, h3, h4, p, .admin-metric, .admin-overview-panel, .portal-card, .sector-card, .admin-user-stat");
      if (!item) return;
      const textToRead = item.getAttribute("aria-label") || item.textContent || "";
      if (textToRead.trim()) {
        stopSpeaking();
        item.classList.add("a11y-speaking");
        speak(textToRead);
        setTimeout(() => item.classList.remove("a11y-speaking"), 4000);
      }
    });

    document.addEventListener("focusin", (e) => {
      if (!readTalkback()) return;
      if (e.target.closest(".a11y-wrapper, .mobile-nav-a11y")) return;
      const item = e.target.closest("button, a, input, select, textarea");
      if (!item) return;
      const label = item.getAttribute("aria-label") || item.getAttribute("placeholder") || item.textContent || "";
      const role = item.getAttribute("role") || item.tagName.toLowerCase();
      if (label.trim()) {
        speak(`${role}: ${label.trim()}`);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") stopSpeaking();
    });
  }

  // Boot
  function boot() {
    applyTheme(readTheme());
    applyFontSize(readFontSize());
    if (readTalkback()) document.documentElement.dataset.talkback = "true";

    ensureAnnounceRegion();
    injectAll();
    setupTalkbackListeners();

    if (typeof MutationObserver !== "undefined") {
      let timeoutId = null;
      const observer = new MutationObserver(() => {
        if (timeoutId) return;
        timeoutId = setTimeout(() => {
          timeoutId = null;
          injectAll();
        }, 100);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
