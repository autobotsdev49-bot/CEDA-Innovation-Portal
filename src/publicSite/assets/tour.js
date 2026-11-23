/**
 * CEDA Innovation Portal - Interactive Guided Tour
 * Covers Public Site, Auth, Innovator, Admin, Assessor, Support, and Committee portals.
 * Highlights key cards, metrics, Optimus Prime AI, and Accessibility controls,
 * and automatically switches to the target screen before highlighting.
 */
(function () {
  "use strict";

  const SEEN_PREFIX = "ceda.tour.seen.";

  function detectPortal() {
    const path = (window.location.pathname || "/").toLowerCase();
    if (path.startsWith("/account")) return "innovator";
    if (path.startsWith("/admin")) return "admin";
    if (path.startsWith("/assessor")) return "assessor";
    if (path.startsWith("/support")) return "support";
    if (path.startsWith("/committee")) return "committee";
    if (path.startsWith("/signin") || path.startsWith("/register")) return "auth";
    return "public";
  }

  const TOURS = {
    innovator: [
      {
        navigateHash: "#overview",
        selector: "#overview .admin-metrics, #overview .innovator-kpi-grid, #overview .admin-overview-panel, #overview",
        title: "Overview & Application Metrics",
        description:
          "Welcome to your Innovator Overview. Here you can see your submitted applications, drafts in progress, and unread updates at a glance.",
      },
      {
        navigateHash: "#overview",
        selector: 'a[href="#submit"], [data-nav-target="submit"]',
        title: "Submit a New Innovation",
        description:
          "Ready to apply? Click Submit innovation to open the 12-step guided application wizard. You can save drafts anytime and return later.",
      },
      {
        navigateHash: "#applications",
        selector: "#applications .admin-surface, #applications h1, #applications",
        title: "Track Your Applications",
        description:
          "In My applications, monitor each submission's live review stage, view assessor feedback, and respond if CEDA requests more information.",
      },
      {
        navigateHash: "#overview",
        selector: ".innovator-optimus-launcher, [data-optimus-launcher]",
        title: "Optimus Prime AI Assistant",
        description:
          "This is Optimus Prime, your personal AI assistant. It is here 24/7 to answer questions on eligibility, evidence, and portal steps, especially when live support is busy or unavailable.",
      },
      {
        navigateHash: "#support",
        selector: "#support .admin-surface, #support h1, #support",
        title: "Live Support & Botswana Regulators",
        description:
          "Open Help and support to chat with a CEDA Support Officer during working hours or look up Botswana regulatory authority contacts.",
      },
      {
        selector: "#a11y-toggle-btn, .a11y-toggle-btn",
        title: "Accessibility & Voice Control",
        description:
          "Customize dark mode, text size (A- to A+++), TalkBack speech readouts, Gemini AI screen summaries, and voice navigation anytime from here.",
      },
    ],
    admin: [
      {
        navigateHash: "#overview",
        selector: "#overview .admin-metrics, #overview .admin-overview-panel, #overview",
        title: "Executive Overview & Live Metrics",
        description:
          "Your Administration Overview tracks live portal traffic, Optimus Prime interactions, total applications, and open follow-up matters.",
      },
      {
        navigateHash: "#applications",
        selector: "#applications .admin-surface, #applications h1, #applications",
        title: "Applications & Review Pipeline",
        description:
          "Inspect all submitted innovations, filter by sector or status, and oversee assessment progression.",
      },
      {
        navigateHash: "#users",
        selector: "#users .admin-surface, #users h1, #users",
        title: "Users & Role Management",
        description:
          "Manage innovators, assessors, support officers, and committee observers, including account creation and MFA security.",
      },
      {
        navigateHash: "#optimus",
        selector: "#optimus .admin-ai-tools, #optimus .admin-overview-panel, #optimus",
        title: "Optimus Prime AI Governance",
        description:
          "Configure Optimus Prime's response tone, controlled CEDA knowledge base, and human support escalation rules.",
      },
      {
        navigateHash: "#overview",
        selector: "[data-open-notifications], .admin-notification-bell",
        title: "Real-Time Alerts & Notifications",
        description:
          "Check urgent administrative alerts, escalations, and system notifications directly from the top bell icon.",
      },
      {
        selector: "#a11y-toggle-btn, .a11y-toggle-btn",
        title: "Accessibility & Voice Control",
        description:
          "Enable dark mode, resize text from A- to A+++, turn on TalkBack speech readouts, or control the portal by voice.",
      },
    ],
    assessor: [
      {
        navigateHash: "#overview",
        selector: "#overview .admin-metrics, #overview .admin-overview-panel, #overview",
        title: "Assessor Overview & Workload",
        description:
          "Your Assessor Overview highlights assigned applications, pending reviews, and upcoming panel deadlines.",
      },
      {
        navigateHash: "#assessments",
        selector: "#assessments .admin-surface, #assessments h1, #assessments",
        title: "My Assessments",
        description:
          "Open My assessments to evaluate assigned innovations using the structured CEDA rubric and submit your formal scores.",
      },
      {
        navigateHash: "#library",
        selector: "#library .admin-surface, #library h1, #library",
        title: "Application Library",
        description:
          "Browse submissions across all sectors to review supporting evidence and project context.",
      },
      {
        navigateHash: "#discussion",
        selector: "#discussion .admin-surface, #discussion h1, #discussion",
        title: "Panel Discussion",
        description:
          "Collaborate securely with fellow assessors on specific cases before finalizing panel recommendations.",
      },
      {
        selector: "#a11y-toggle-btn, .a11y-toggle-btn",
        title: "Accessibility & Voice Control",
        description:
          "Adjust dark mode, text size, TalkBack speech readouts, and voice control anytime from the Accessibility button.",
      },
    ],
    support: [
      {
        navigateHash: "#overview",
        selector: "#overview .admin-metrics, #overview .admin-overview-panel, #overview",
        title: "Support Desk Overview",
        description:
          "Monitor open requests, urgent escalations, and toggle your live chat availability status (09:00 to 16:00 working days).",
      },
      {
        navigateHash: "#queue",
        selector: "#queue .admin-surface, #queue h1, #queue",
        title: "Live Support & AI Escalations Queue",
        description:
          "Pick up live innovator chats and escalated Optimus Prime handoffs with full consented conversation history.",
      },
      {
        navigateHash: "#performance",
        selector: "#performance .admin-surface, #performance h1, #performance",
        title: "Personal Officer Performance",
        description:
          "Review your personal resolution rate, response turnaround times, and workload balance.",
      },
      {
        selector: "#a11y-toggle-btn, .a11y-toggle-btn",
        title: "Accessibility & Voice Control",
        description:
          "Switch between light and dark mode, scale text from A- to A+++, and use TalkBack or voice commands.",
      },
    ],
    committee: [
      {
        navigateHash: "#overview",
        selector: "#overview .admin-metrics, #overview .admin-overview-panel, #overview",
        title: "Committee Observer Overview",
        description:
          "View read-only portfolio metrics, sector distribution, and overall innovation pipeline health.",
      },
      {
        navigateHash: "#timeline",
        selector: "#timeline .admin-surface, #timeline h1, #timeline",
        title: "Pipeline Lifecycle Timeline",
        description:
          "Track how each innovation progresses from initial submission through assessment to final decision.",
      },
      {
        navigateHash: "#awards",
        selector: "#awards .admin-surface, #awards h1, #awards",
        title: "Awards Showcase",
        description:
          "Review conferred CEDA Innovation Awards and exportable award summaries.",
      },
      {
        selector: "#a11y-toggle-btn, .a11y-toggle-btn",
        title: "Accessibility & Voice Control",
        description:
          "Customize dark mode, text scaling, TalkBack speech readouts, and voice control here.",
      },
    ],
    auth: [
      {
        selector: ".access-card h1, main h1",
        title: "Sign In or Create an Account",
        description:
          "Enter your credentials to access your CEDA portal workspace, or register as an innovator to submit your idea.",
      },
      {
        selector: "#a11y-toggle-btn, .a11y-toggle-btn",
        title: "Accessibility & Voice Control",
        description:
          "Turn on dark mode, adjust text size (A- to A+++), enable TalkBack speech readouts, or use voice navigation before signing in.",
      },
    ],
    public: [
      {
        selector: ".hero .button, .hero-actions, .cta, main h1",
        title: "Start Your Innovation Journey",
        description:
          "Welcome to the CEDA Innovation Portal. Create an account or sign in to submit an idea, prototype, or registered business innovation.",
      },
      {
        selector: ".site-nav, header nav",
        title: "Guides, Sectors & Help Centre",
        description:
          "Explore how assessment works, browse example sectors, check eligibility checklists, and find Botswana regulatory contacts.",
      },
      {
        selector: "#a11y-toggle-btn, .a11y-toggle-btn",
        title: "Accessibility & Voice Control",
        description:
          "Personalize your experience with dark mode, 5-step text sizing (A- to A+++), TalkBack speech readouts, and voice control.",
      },
    ],
  };

  let active = false;
  let stepIndex = 0;
  let steps = [];
  let backdropEl = null;
  let spotlightEl = null;
  let cardEl = null;

  function isVisible(el) {
    if (!el) return false;
    if (el.hidden) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findVisibleElement(selector) {
    if (!selector) return null;
    const parts = selector.split(",").map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const list = document.querySelectorAll(part);
      for (const el of list) {
        if (isVisible(el)) return el;
      }
    }
    return null;
  }

  function navigateToHash(hash) {
    if (!hash) return Promise.resolve();
    const link = document.querySelector(`a[href="${hash}"]`);
    if (link) {
      link.click();
    } else if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    return new Promise((resolve) => setTimeout(resolve, 200));
  }

  function ensureOverlay() {
    if (!backdropEl) {
      backdropEl = document.createElement("div");
      backdropEl.className = "ceda-tour-backdrop";
      backdropEl.addEventListener("click", (e) => {
        if (e.target === backdropEl) stopTour();
      });
      document.body.appendChild(backdropEl);
    }
    if (!spotlightEl) {
      spotlightEl = document.createElement("div");
      spotlightEl.className = "ceda-tour-spotlight";
      document.body.appendChild(spotlightEl);
    }
    if (!cardEl) {
      cardEl = document.createElement("div");
      cardEl.className = "ceda-tour-card";
      cardEl.setAttribute("role", "dialog");
      cardEl.setAttribute("aria-modal", "true");
      cardEl.setAttribute("aria-labelledby", "ceda-tour-title");
      cardEl.innerHTML = [
        '<div class="ceda-tour-meta">',
        '  <span class="ceda-tour-step" id="ceda-tour-step"></span>',
        '  <button type="button" class="ceda-tour-close" id="ceda-tour-close" aria-label="Close tour">&times;</button>',
        "</div>",
        '<h3 class="ceda-tour-title" id="ceda-tour-title"></h3>',
        '<p class="ceda-tour-desc" id="ceda-tour-desc"></p>',
        '<div class="ceda-tour-actions">',
        '  <button type="button" class="ceda-tour-btn ceda-tour-btn-ghost" id="ceda-tour-skip">Skip tour</button>',
        '  <div class="ceda-tour-actions-right">',
        '    <button type="button" class="ceda-tour-btn ceda-tour-btn-secondary" id="ceda-tour-prev">Back</button>',
        '    <button type="button" class="ceda-tour-btn ceda-tour-btn-primary" id="ceda-tour-next">Next</button>',
        "  </div>",
        "</div>",
      ].join("");
      document.body.appendChild(cardEl);

      cardEl.querySelector("#ceda-tour-close").addEventListener("click", stopTour);
      cardEl.querySelector("#ceda-tour-skip").addEventListener("click", stopTour);
      cardEl.querySelector("#ceda-tour-prev").addEventListener("click", () => {
        if (stepIndex > 0) showStep(stepIndex - 1);
      });
      cardEl.querySelector("#ceda-tour-next").addEventListener("click", () => {
        if (stepIndex < steps.length - 1) showStep(stepIndex + 1);
        else stopTour();
      });
    }
  }

  function positionElements(target) {
    if (!spotlightEl || !cardEl) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardRect = cardEl.getBoundingClientRect();
    const cardW = cardRect.width || Math.min(370, vw - 24);
    const cardH = cardRect.height || 210;

    if (target) {
      const r = target.getBoundingClientRect();
      const pad = 8;
      const top = Math.max(8, r.top - pad);
      const left = Math.max(8, r.left - pad);
      const width = Math.min(vw - 16, r.width + pad * 2);
      const height = Math.min(vh - 16, r.height + pad * 2);

      spotlightEl.hidden = false;
      spotlightEl.style.top = `${top}px`;
      spotlightEl.style.left = `${left}px`;
      spotlightEl.style.width = `${width}px`;
      spotlightEl.style.height = `${height}px`;

      let cardTop = top + height + 14;
      if (cardTop + cardH > vh - 12) {
        cardTop = top - cardH - 14;
      }
      if (cardTop < 12) {
        cardTop = Math.max(12, Math.min(vh - cardH - 12, vh - cardH - 16));
      }
      let cardLeft = Math.max(12, Math.min(vw - cardW - 12, left));
      cardEl.style.top = `${cardTop}px`;
      cardEl.style.left = `${cardLeft}px`;
    } else {
      spotlightEl.hidden = true;
      cardEl.style.top = `${Math.max(16, (vh - cardH) / 2)}px`;
      cardEl.style.left = `${Math.max(12, (vw - cardW) / 2)}px`;
    }
  }

  async function showStep(index) {
    if (!active || index < 0 || index >= steps.length) return;
    stepIndex = index;
    const step = steps[index];

    if (step.navigateHash) {
      await navigateToHash(step.navigateHash);
    }

    const target = findVisibleElement(step.selector);
    if (target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      await new Promise((resolve) => setTimeout(resolve, 180));
    }

    ensureOverlay();
    cardEl.querySelector("#ceda-tour-step").textContent = `Step ${index + 1} of ${steps.length}`;
    cardEl.querySelector("#ceda-tour-title").textContent = step.title;
    cardEl.querySelector("#ceda-tour-desc").textContent = step.description;

    const prevBtn = cardEl.querySelector("#ceda-tour-prev");
    const nextBtn = cardEl.querySelector("#ceda-tour-next");
    prevBtn.disabled = index === 0;
    prevBtn.style.opacity = index === 0 ? "0.45" : "1";
    nextBtn.textContent = index === steps.length - 1 ? "Finish" : "Next";

    positionElements(target);
    nextBtn.focus();

    if (document.documentElement.dataset.talkback === "true" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(`${step.title}. ${step.description}`));
      } catch {}
    }
  }

  function onKeydown(e) {
    if (!active) return;
    if (e.key === "Escape") stopTour();
    else if (e.key === "ArrowRight") {
      if (stepIndex < steps.length - 1) showStep(stepIndex + 1);
      else stopTour();
    } else if (e.key === "ArrowLeft") {
      if (stepIndex > 0) showStep(stepIndex - 1);
    }
  }

  function onResizeOrScroll() {
    if (!active || !steps[stepIndex]) return;
    const target = findVisibleElement(steps[stepIndex].selector);
    positionElements(target);
  }

  function startTour() {
    const portal = detectPortal();
    steps = TOURS[portal] || TOURS.public;
    active = true;
    try {
      localStorage.setItem(SEEN_PREFIX + portal, "true");
    } catch {}
    ensureOverlay();
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("resize", onResizeOrScroll);
    showStep(0);
  }

  function stopTour() {
    active = false;
    window.removeEventListener("keydown", onKeydown);
    window.removeEventListener("resize", onResizeOrScroll);
    if (backdropEl) {
      backdropEl.remove();
      backdropEl = null;
    }
    if (spotlightEl) {
      spotlightEl.remove();
      spotlightEl = null;
    }
    if (cardEl) {
      cardEl.remove();
      cardEl = null;
    }
  }

  function buildTriggerButton() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ceda-tour-trigger";
    btn.setAttribute("aria-label", "Start interactive portal tour");
    btn.title = "Take a guided tour of this portal";
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg><span>Tour</span>';
    btn.addEventListener("click", startTour);
    return btn;
  }

  function injectTriggers() {
    const targets = [
      document.getElementById("a11y-header-mount"),
      document.getElementById("a11y-access-mount"),
      document.querySelector(".header-actions"),
      ...document.querySelectorAll(".admin-header-right"),
      ...document.querySelectorAll(".access-brand"),
    ].filter(Boolean);

    for (const container of targets) {
      if (container.querySelector(".ceda-tour-trigger")) continue;
      const a11yWrap = container.querySelector(".a11y-wrapper");
      const btn = buildTriggerButton();
      if (a11yWrap) {
        container.insertBefore(btn, a11yWrap);
      } else {
        container.appendChild(btn);
      }
    }
  }

  function boot() {
    injectTriggers();
    if (typeof MutationObserver !== "undefined") {
      let timer = null;
      const observer = new MutationObserver(() => {
        if (timer) return;
        timer = setTimeout(() => {
          timer = null;
          injectTriggers();
        }, 120);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  window.cedaTour = { start: startTour, stop: stopTour };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
