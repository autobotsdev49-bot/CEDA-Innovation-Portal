for (const area of document.querySelectorAll("[data-filter-area]")) {
  const controls = area.querySelector("[data-filter]");
  const input = controls.querySelector("input");
  const categoryControls = area.querySelector("[data-category-controls]");
  const category = categoryControls?.querySelector("select");
  const items = [...area.querySelector("[data-results]").children];
  const empty = area.querySelector("[data-empty]");

  function isSafePublicUrl(url) {
  return /^https?:\/\//i.test(String(url || "").trim());
}

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
}

function makeMetaRow(label, value, href) {
  const li = document.createElement("li");
  const strong = makeEl("strong", "", `${label}: `);
  li.append(strong);
  if (href) {
    const link = makeEl("a", "", value);
    link.href = href;
    if (href.startsWith("http")) {
      link.target = "_blank";
      link.rel = "noopener";
    }
    li.append(link);
  } else {
    li.append(document.createTextNode(String(value)));
  }
  return li;
}

async function hydratePublicPortalCatalog() {
  const faqArea = document.querySelector("[data-public-faqs]");
  const regulatorsContainer = document.querySelector("[data-public-regulators]");
  const downloadContainers = [...document.querySelectorAll("[data-public-downloads]")];
  if (!faqArea && !regulatorsContainer && !downloadContainers.length) return;

  let configModule;
  let catalogModule;
  try {
    [configModule, catalogModule] = await Promise.all([
      import("./signupConfig.js"),
      import("./portalCatalog.js"),
    ]);
  } catch {
    return;
  }

  const signupConfig = configModule?.signupConfig;
  if (!signupConfig?.url || !signupConfig?.key) return;

  let data;
  try {
    const response = await fetch(`${signupConfig.url}/rest/v1/rpc/public_portal_catalog`, {
      method: "POST",
      headers: {
        apikey: signupConfig.key,
        Authorization: `Bearer ${signupConfig.key}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    if (!response.ok) return;
    data = await response.json();
  } catch {
    return;
  }
  if (!data || typeof data !== "object") return;

  if (faqArea && Array.isArray(data.faqs) && data.faqs.length) {
    const list = faqArea.querySelector(".faq-list");
    const templateIcon = list?.querySelector("summary svg")?.cloneNode(true);
    if (list) {
      list.replaceChildren();
      for (const item of data.faqs) {
        const details = document.createElement("details");
        const summary = makeEl("summary", "", item.title || "Question");
        if (templateIcon) summary.append(templateIcon.cloneNode(true));
        const body = makeEl("p", "", item.body || item.summary || "");
        details.append(summary, body);
        list.append(details);
      }
      const searchInput = faqArea.querySelector('input[type="search"]');
      const emptyBox = faqArea.querySelector(".empty");
      if (searchInput) {
        const applyDynamicFilter = () => {
          const term = searchInput.value.trim().toLowerCase();
          let visibleCount = 0;
          for (const d of list.querySelectorAll("details")) {
            const match = !term || d.textContent.toLowerCase().includes(term);
            d.hidden = !match;
            if (match) visibleCount += 1;
          }
          if (emptyBox) emptyBox.hidden = visibleCount > 0;
        };
        searchInput.addEventListener("input", applyDynamicFilter);
        applyDynamicFilter();
      }
    }
  }

  if (regulatorsContainer && Array.isArray(data.regulatoryContacts) && data.regulatoryContacts.length) {
    regulatorsContainer.replaceChildren();
    for (const item of data.regulatoryContacts) {
      const details = item.contactDetails && typeof item.contactDetails === "object" ? item.contactDetails : {};
      const card = makeEl("article", "portal-card");
      card.append(makeEl("span", "portal-tag", item.authorityCode || details.authorityCode || "Regulator"));
      card.append(makeEl("h3", "", item.title || details.fullName || "Regulatory authority"));
      card.append(makeEl("p", "", details.scope || item.summary || item.body || ""));
      const meta = makeEl("ul", "portal-meta");
      if (details.phone) meta.append(makeMetaRow("Phone", details.phone));
      if (details.whatsapp) meta.append(makeMetaRow("WhatsApp", details.whatsapp));
      if (details.email) meta.append(makeMetaRow("Email", details.email, `mailto:${details.email}`));
      if (details.address) meta.append(makeMetaRow("Address", details.address));
      const siteUrl = details.website || item.externalUrl || "";
      if (isSafePublicUrl(siteUrl)) meta.append(makeMetaRow("Website", siteUrl, siteUrl));
      if (meta.childElementCount) card.append(meta);
      regulatorsContainer.append(card);
    }
  }

  if (downloadContainers.length) {
    const formConfig = catalogModule.normalizeApplicationFormConfig(data.applicationFormConfig);
    const docs = Array.isArray(data.applicationForms) ? data.applicationForms : [];
    for (const container of downloadContainers) {
      container.replaceChildren();
      const note = makeEl("div", "note");
      note.append(makeEl("h3", "", `${formConfig.formTitle} (v${formConfig.formVersion})`));
      note.append(makeEl("p", "", `${formConfig.introGuidance} Up to ${formConfig.maxEvidenceFileMb} MB per supporting file.`));
      const actions = makeEl("div", "actions");
      const startLink = makeEl("a", "button primary", "Start or sign in to submit");
      startLink.href = "/account/";
      actions.append(startLink);
      note.append(actions);
      container.append(note);

      const cards = makeEl("div", "portal-cards");
      for (const item of docs) {
        const card = makeEl("article", "portal-card");
        card.append(makeEl("span", "portal-tag", item.kind || "Application form"));
        card.append(makeEl("h3", "", item.title || "Portal document"));
        card.append(makeEl("p", "", item.summary || item.body || ""));
        const downloadUrl = item.attachmentPath
          ? catalogModule.buildPortalDocumentPublicUrl(signupConfig.url, item.attachmentPath)
          : isSafePublicUrl(item.externalUrl)
            ? item.externalUrl
            : "";
        if (downloadUrl) {
          const cardActions = makeEl("div", "actions");
          const dl = makeEl("a", "button secondary", item.attachmentName ? `Download ${item.attachmentName}` : "Open document");
          dl.href = downloadUrl;
          dl.target = "_blank";
          dl.rel = "noopener";
          cardActions.append(dl);
          card.append(cardActions);
        }
        cards.append(card);
      }
      for (const req of formConfig.requiredDocuments) {
        const card = makeEl("article", "portal-card");
        card.append(makeEl("span", "portal-tag", req.required ? "Required copy" : "Stage / conditional"));
        card.append(makeEl("h3", "", req.label));
        card.append(makeEl("p", "", req.guidance || req.category));
        const meta = makeEl("ul", "portal-meta");
        meta.append(makeMetaRow("Applies to", req.appliesTo));
        meta.append(makeMetaRow("Accepted formats", `${req.acceptedFormats} (up to ${req.maxSizeMb} MB)`));
        card.append(meta);
        cards.append(card);
      }
      container.append(cards);
    }
  }
}

void hydratePublicPortalCatalog();
void import("./telemetry.js")
  .then((mod) => mod.initPortalTelemetry?.({ portalRole: "public" }))
  .catch(() => {});

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

for (const controls of document.querySelectorAll("[data-updates-controls]")) {
  const input = controls.querySelector("input");
  const buttons = [...controls.querySelectorAll("[data-updates-status]")];
  const cards = [...document.querySelectorAll("[data-updates-list] [data-update-item]")];
  const emptyMessage = document.querySelector("[data-updates-empty]");
  let status = "all";
  function refresh() {
    const query = input.value.trim().toLocaleLowerCase();
    let count = 0;
    for (const card of cards) {
      const visible = (status === "all" || card.dataset.status === status) && card.textContent.toLocaleLowerCase().includes(query);
      card.hidden = !visible;
      if (visible) count++;
    }
    emptyMessage.hidden = count !== 0;
  }
  input.addEventListener("input", refresh);
  for (const button of buttons) button.addEventListener("click", () => {
    status = button.dataset.updatesStatus;
    for (const choice of buttons) choice.setAttribute("aria-pressed", String(choice === button));
    refresh();
  });
  refresh();
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

for (const carousel of document.querySelectorAll("[data-story-carousel]")) {
  const slides = [...carousel.querySelectorAll("[data-story-slide]")];
  let index = 0;
  function show(offset) {
    index = (index + offset + slides.length) % slides.length;
    slides.forEach((slide, position) => { slide.hidden = position !== index; });
    carousel.querySelector("[data-story-count]").textContent = `${index + 1} of ${slides.length}`;
  }
  carousel.querySelector("[data-story-prev]")?.addEventListener("click", () => show(-1));
  carousel.querySelector("[data-story-next]")?.addEventListener("click", () => show(1));
}
