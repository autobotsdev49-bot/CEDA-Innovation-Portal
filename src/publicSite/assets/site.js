for (const area of document.querySelectorAll("[data-filter-area]")) {
  const controls = area.querySelector("[data-filter]");
  const input = controls.querySelector("input");
  const categoryControls = area.querySelector("[data-category-controls]");
  const category = categoryControls?.querySelector("select");
  const items = [...area.querySelector("[data-results]").children];
  const empty = area.querySelector("[data-empty]");

  function filter() {
    const query = input.value.trim().toLowerCase();
    let matchCount = 0;
    for (const item of items) {
      const matches = item.textContent.toLowerCase().includes(query)
        && (!category?.value || item.dataset.category === category.value);
      item.hidden = !matches;
      if (matches) matchCount++;
    }
    empty.hidden = matchCount > 0;
  }

  controls.hidden = false;
  if (categoryControls) categoryControls.hidden = false;
  input.addEventListener("input", filter);
  category?.addEventListener("change", filter);
  filter();
}

function openLinkedDetails() {
  const target = document.getElementById(location.hash.slice(1));
  if (target instanceof HTMLDetailsElement) target.open = true;
}
openLinkedDetails();
window.addEventListener("hashchange", openLinkedDetails);

const feedbackForm = document.querySelector("[data-feedback]");
if (feedbackForm) {
  const message = feedbackForm.querySelector("textarea");
  const status = feedbackForm.querySelector("[data-feedback-status]");
  feedbackForm.hidden = false;
  message.addEventListener("input", () => message.setCustomValidity(""));
  feedbackForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const suggestion = message.value.trim();
    if (!suggestion) {
      message.setCustomValidity("Enter a suggestion before opening your email draft.");
      message.reportValidity();
      return;
    }
    const subject = encodeURIComponent("CEDA Innovation Portal suggestion");
    const body = encodeURIComponent(suggestion.replace(/\r?\n/g, "\r\n"));
    status.textContent = "Send the draft from your email app. If it does not open, use the email address below.";
    window.location.href = `mailto:${feedbackForm.dataset.recipient}?subject=${subject}&body=${body}`;
  });
}

for (const menu of document.querySelectorAll(".mobile-nav")) {
  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !menu.open) return;
    menu.open = false;
    menu.querySelector("summary").focus();
  });
}

// Stage tabs on eligibility page
for (const panel of document.querySelectorAll(".stage-tabs")) {
  const tabs = [...panel.querySelectorAll(".stage-tab")];
  const contents = [...panel.querySelectorAll(".stage-content")];
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      contents.forEach(c => c.classList.remove("active"));
      tab.classList.add("active");
      contents[i]?.classList.add("active");
    });
  });
}

// ── Animated number counter for impact figures ──────────────────────────────
const counterEls = document.querySelectorAll("[data-counter]");
if (counterEls.length) {
  const runCounter = (el) => {
    if (el.dataset.countingDone) return;
    el.dataset.countingDone = "true";
    const raw = el.textContent.trim();
    const match = raw.match(/^([^\d]*)(\d[\d,]*)([^\d]*)$/);
    if (!match) return;
    const prefix = match[1];
    const target = parseInt(match[2].replace(/,/g, ""), 10);
    const suffix = match[3];
    const isFast = el.hasAttribute("data-count-fast");
    // Fast numbers (huge number like P696m) finish in 350ms very rapidly; normal in 1400ms
    const duration = isFast ? 350 : 1400;
    const startTime = performance.now();
    (function tick(now) {
      const p = Math.min((now - startTime) / duration, 1);
      const eased = isFast ? Math.sin((p * Math.PI) / 2) : 1 - Math.pow(1 - p, 3);
      const current = Math.round(eased * target);
      el.textContent = prefix + current.toLocaleString("en") + suffix;
      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        el.textContent = prefix + target.toLocaleString("en") + suffix;
      }
    })(startTime);
  };

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        observer.unobserve(entry.target);
        runCounter(entry.target);
      }
    }
  }, { threshold: 0.1, rootMargin: "50px" });

  for (const el of counterEls) {
    observer.observe(el);
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      runCounter(el);
    }
  }
}
