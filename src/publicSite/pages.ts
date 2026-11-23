import { evidenceChecklist, examples, faqs, reviewTopics, sectors, stages, steps } from "./content.ts";
import { buttonLink, contactDetails, disclosure, icon, siteFooter, siteHeader, textLink } from "./components.ts";
import { ceda, collaborators, impact, stories } from "./ceda.ts";
import { accessScreen, verificationScreen } from "./access.ts";
import { adminScreen } from "./admin.ts";
import { innovatorScreen } from "./innovator.ts";
import { assessorScreen } from "./assessor.ts";
import { supportScreen } from "./support.ts";
import { committeeScreen } from "./committee.ts";
import { DEFAULT_APPLICATION_FORM_CONFIG, HOSTING_SUPPORT_SLA, REGULATORY_AUTHORITIES_BASELINE } from "./assets/portalCatalog.js";

function escapePublicHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderStaticDownloads() {
  const docCards = DEFAULT_APPLICATION_FORM_CONFIG.requiredDocuments.map((doc) => `<article class="portal-card">
    <span class="portal-tag">${escapePublicHtml(doc.required ? "Required copy" : "Stage / conditional")}</span>
    <h3>${escapePublicHtml(doc.label)}</h3>
    <p>${escapePublicHtml(doc.guidance)}</p>
    <ul class="portal-meta">
      <li><strong>Applies to:</strong> ${escapePublicHtml(doc.appliesTo)}</li>
      <li><strong>Accepted formats:</strong> ${escapePublicHtml(doc.acceptedFormats)} (up to ${escapePublicHtml(doc.maxSizeMb)} MB)</li>
    </ul>
  </article>`).join("");
  return `<div class="note"><h3>${escapePublicHtml(DEFAULT_APPLICATION_FORM_CONFIG.formTitle)} (v${escapePublicHtml(DEFAULT_APPLICATION_FORM_CONFIG.formVersion)})</h3><p>${escapePublicHtml(DEFAULT_APPLICATION_FORM_CONFIG.introGuidance)} Up to ${escapePublicHtml(DEFAULT_APPLICATION_FORM_CONFIG.maxEvidenceFileMb)} MB per supporting file.</p><div class="actions">${buttonLink("/account/", "Start or sign in to submit")}</div></div><div class="portal-cards">${docCards}</div>`;
}

function renderStaticRegulators() {
  return REGULATORY_AUTHORITIES_BASELINE.map((auth) => `<article class="portal-card" id="regulator-${escapePublicHtml(auth.authorityCode.toLowerCase())}">
    <span class="portal-tag">${escapePublicHtml(auth.authorityCode)}</span>
    <h3>${escapePublicHtml(auth.title)}</h3>
    <p>${escapePublicHtml(auth.scope)}</p>
    <ul class="portal-meta">
      <li><strong>Phone:</strong> ${escapePublicHtml(auth.phone)}</li>
      <li><strong>Email:</strong> <a href="mailto:${escapePublicHtml(auth.email)}">${escapePublicHtml(auth.email)}</a></li>
      <li><strong>Address:</strong> ${escapePublicHtml(auth.address)}</li>
      <li><strong>Website:</strong> <a href="${escapePublicHtml(auth.website)}" target="_blank" rel="noopener">${escapePublicHtml(auth.website)}</a></li>
    </ul>
  </article>`).join("");
}

function renderHostingSupportSla() {
  const tierCards = HOSTING_SUPPORT_SLA.tiers.map((tier) => `<article class="portal-card">
    <span class="portal-tag">${escapePublicHtml(tier.severity)}</span>
    <h3>${escapePublicHtml(tier.resolutionTurnaround)} resolution turnaround</h3>
    <p>${escapePublicHtml(tier.scope)}</p>
    <ul class="portal-meta">
      <li><strong>Acknowledge:</strong> ${escapePublicHtml(tier.acknowledgement)}</li>
      <li><strong>Containment:</strong> ${escapePublicHtml(tier.containment)}</li>
      <li><strong>Owner:</strong> ${escapePublicHtml(tier.escalationOwner)}</li>
    </ul>
  </article>`).join("");
  return `<section class="wrap block" id="hosting-support"><h2>Hosting support &amp; fault remediation SLAs</h2><p class="prose">${escapePublicHtml(HOSTING_SUPPORT_SLA.hostingStack)}. ${escapePublicHtml(HOSTING_SUPPORT_SLA.availabilityTarget)}. ${escapePublicHtml(HOSTING_SUPPORT_SLA.supportHours)}.</p><div class="note"><p><strong>Backup &amp; Recovery Guarantees:</strong> RPO ${escapePublicHtml(HOSTING_SUPPORT_SLA.backupRecovery.rpo)} · RTO ${escapePublicHtml(HOSTING_SUPPORT_SLA.backupRecovery.rto)} · Rollback ${escapePublicHtml(HOSTING_SUPPORT_SLA.backupRecovery.rollbackTurnaround)}.</p><p><strong>Fault Reporting Channels:</strong> ${escapePublicHtml(HOSTING_SUPPORT_SLA.channels.portalQueue)} · <a href="mailto:${escapePublicHtml(HOSTING_SUPPORT_SLA.channels.email)}">${escapePublicHtml(HOSTING_SUPPORT_SLA.channels.email)}</a> · ${escapePublicHtml(HOSTING_SUPPORT_SLA.channels.securityEscalation)}.</p></div><div class="portal-cards">${tierCards}</div></section>`;
}

const stepsList = (extraClass = "") => `<ol class="steps ${extraClass}">${steps.map((step, index) =>
  `<li><span class="step-number" aria-hidden="true">0${index + 1}</span><h3>${step.label}</h3><p>${step.text}</p></li>`).join("")}</ol>`;
const faqList = (items: typeof faqs) => `<div class="faq-list" data-results>${items.map((item) =>
  disclosure(item.question, item.answer)).join("")}</div>`;
const search = (id: string, title: string, placeholder: string) =>
  `<div class="filters" data-filter hidden><label for="${id}">${title}</label><input id="${id}" type="search" placeholder="${placeholder}"></div>`;
const empty = '<p class="empty" data-empty role="status" hidden>No results match your search.</p>';
const sectorList = (items: typeof sectors) => `<div class="sector-grid" data-results>${items.map((sector) =>
  `<article class="sector-card" data-category="${sector.group}"><span class="sector-index" aria-hidden="true">${sector.code}</span><h3>${sector.name}</h3><p>${sector.text}</p></article>`).join("")}</div>`;
const prototypePhoto = {
  src: "/assets/innovation-hero.webp",
  alt: "Two innovators discussing a prototype at a workbench.",
  width: 1440,
  height: 960,
};
const enterprisePhoto = {
  src: "https://www.ceda.co.bw/sites/default/files/inline-images/Pasted%20image%20%28123%29.png",
  alt: "Two people reviewing plans beside a small solar panel.",
  width: 588,
  height: 456,
};

const heroVisual = (photo: typeof prototypePhoto, priority = false) =>
  `<figure class="hero-visual"><img class="hero-photo" src="${photo.src}" alt="${photo.alt}" width="${photo.width}" height="${photo.height}" decoding="async"${priority ? ' fetchpriority="high"' : ""}></figure>`;

const heading = (label: string, title: string, intro: string, photo?: typeof prototypePhoto) =>
  `<section class="page-heading${photo ? " photo-hero" : ""}">
    ${photo ? heroVisual(photo) : ""}
    <div class="wrap${photo ? " hero-inner heading-feature" : ""}"><div>
    <p class="eyebrow">${label}</p><h1>${title}</h1><p class="lead">${intro}</p></div>
  </div></section>`;
const start = textLink("/signin/", "Start an application");

const articleList = (items: { title: string; text: string }[]) => `<div class="editorial-list">${items.map((item) =>
  `<article><h3>${item.title}</h3><p>${item.text}</p></article>`).join("")}</div>`;

const checklist = `<ul class="checklist">${evidenceChecklist.map((item) =>
  `<li>${icon("check")}<span>${item}</span></li>`).join("")}</ul>`;

const conciseAbout = heading("About CEDA Innovation", "Backing Botswana's entrepreneurs.", "CEDA supports citizen enterprise through finance and business development. The Innovation Portal offers innovators a clear application journey.", enterprisePhoto) + `
<div class="wrap about-story">
  <section class="block" id="purpose"><p class="eyebrow">Our purpose</p><h2>Innovation needs opportunity.</h2><p>CEDA was established in 2001 to support citizen-owned enterprise. ${textLink(ceda.background, "Explore CEDA's background")}</p><div class="about-purpose-list"><article><h3>Our mission</h3><p>To fund, grow and sustain a thriving SMME sector in Botswana.</p></article><article><h3>Our vision</h3><p>To build an innovative, competitive and impactful SMME sector.</p></article><article><h3>Our values</h3><p>Collaboration, innovation, courage and accountability guide CEDA's work.</p>${textLink("#values", "Explore our values")}</article></div></section>
  <section class="block" id="values"><div class="section-heading"><h2>What guides CEDA</h2>${textLink("https://www.ceda.co.bw/index.php/ceda-statements", "Read CEDA's statements")}</div><div class="value-grid"><article><h3>Collaborative</h3><p>Working with clients and stakeholders.</p></article><article><h3>Innovative</h3><p>Responding with creativity and fresh solutions.</p></article><article><h3>Courageous</h3><p>Learning and taking thoughtful risks.</p></article><article><h3>Accountable</h3><p>Taking responsibility for decisions.</p></article></div></section>
  <section class="block about-impact" id="impact"><div><p class="eyebrow">Why it matters</p><h2>Supporting businesses and jobs.</h2><p>CEDA's wider work helps Botswana's citizen-owned enterprises grow. Figures below cover the agency through December 2025, not this portal.</p>${textLink(impact.source, "See published figures")}</div><dl class="impact-grid">${impact.figures.map(({value,label})=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl></section>
  <section class="block" id="focus"><p class="eyebrow">What we focus on</p><div class="section-heading"><h2>Innovation across sectors.</h2>${textLink("/sectors/", "Browse sectors")}</div><div class="focus-grid">${sectors.map(({name,text,code})=>`<article><span class="focus-icon" aria-hidden="true">${code}</span><h3>${name}</h3><p>${text}</p></article>`).join("")}</div><p class="muted">These categories help you describe your work; they are not a promise of funding.</p></section>
  <section class="block about-timeline"><p class="eyebrow">Our journey</p><h2>From enterprise support to an innovation pathway.</h2><div class="timeline-items"><div><strong>2001</strong><p>CEDA was established to support citizen entrepreneurship.</p></div><div><strong>Today</strong><p>CEDA supports Botswana businesses through its official channels.</p></div><div><strong>Portal</strong><p>The Innovation Portal offers a clearer route to prepare, submit and follow an application.</p></div></div></section>
  <section class="block" id="stories"><div class="section-heading"><h2>CEDA customer stories</h2>${textLink(ceda.profiles, "Read published profiles")}</div><div class="story-grid">${stories.map(({place,name,summary,url},index)=>{const image=["/assets/story-maggie.png","/assets/story-obakeng.png","/assets/story-tsholefelo.png"][index]; return `<article class="story-item people-story"><div class="story-photo" style="background-image:linear-gradient(0deg,rgba(19,40,38,.55),transparent),url('${image}')"><span class="story-avatar" aria-label="Illustrative profile image for ${name}">${name.split(" ").map(part=>part[0]).join("")}</span></div><div class="story-body"><p class="eyebrow">${place}</p><h3>${name}</h3><p>${summary}</p>${textLink(url, "Read the published profile")}</div></article>`}).join("")}</div><p class="muted">These generated images are illustrative story visuals and are not verified portraits of the named customers.</p></section>
  <section class="block" id="partners"><div class="section-heading"><h2>Partners and collaborators</h2>${textLink(ceda.partnerships, "CEDA's published partnerships")}</div><div class="story-grid">${collaborators.map(({shortName,name,role,summary,url})=>{const domain=shortName === "BITRI" ? "bitri.co.bw" : shortName === "BTC" ? "btc.bw" : "bih.co.bw"; return `<article class="story-item collaborator-card"><div class="collaborator-brand"><img src="https://www.google.com/s2/favicons?domain=${domain}&sz=128" alt="${shortName} logo" width="72" height="72" loading="lazy"><span class="brand-mark">${shortName}</span></div><div class="story-body"><p class="eyebrow">${role}</p><h3>${name}</h3><p>${summary}</p><a class="bordered-link" href="${url}">Read more ${icon("arrow")}</a></div></article>`}).join("")}</div><p class="muted">Partner marks use the same logo treatment as the homepage ecosystem carousel. Their listed relationships differ.</p></section>
</div>`;

const feedbackBox = `
<section class="wrap block" id="feedback">
  <div class="feedback-panel split">
    <div><span class="ballot-icon">${icon("ballot")}</span><h2>How do you think we can improve our services and information delivery?</h2>
      <p>Tell us what was hard to find, what was unclear, or what would make the portal easier to use.</p></div>
    <div>
      <form class="feedback-form" data-feedback data-recipient="${ceda.email}" hidden>
        <label for="feedback-message">Your suggestion</label>
        <textarea id="feedback-message" name="suggestion" required maxlength="1000" rows="4" aria-describedby="feedback-hint"></textarea>
        <p id="feedback-hint" class="muted">Up to 1,000 characters. Leave out personal details and application information.</p>
        <button class="button primary" type="submit">Open email draft ${icon("external")}</button>
        <p class="muted" role="status" data-feedback-status></p>
      </form>
      <p class="feedback-alternative"><a href="mailto:${ceda.email}?subject=CEDA%20Innovation%20Portal%20suggestion">Email ${ceda.email}</a></p>
    </div>
  </div>
</section>`;

const updates = [
  { slug: "hackathon", kind: "Challenge update", title: "CEDA Innovation Management Portal Hackathon", summary: "The 13 to 23 November 2026 build window is underway. Applications were called for from 9 to 12 November.", image: "/assets/innovation-gallery.png", alt: "Illustrative Botswana innovation showcase, not the official hackathon poster", date: "13 to 23 November 2026", body: "The Citizen Entrepreneurial Development Agency Innovation Management Portal Hackathon challenges teams to design an accessible, secure portal for innovation submissions, assessment and feedback. The supplied call for applications lists 9 to 12 November 2026 as the application window. The hackathon development period runs from 13 to 23 November 2026. This listing reports the running event and does not reopen applications. Refer to official CEDA channels for authoritative competition rules.", source: ceda.website, sourceLabel: "Visit official CEDA channels" },
  { slug: "mabogo", kind: "CEDA programme", title: "Mabogo-Dinku for micro entrepreneurs", summary: "Explore CEDA's published support for Botswana's micro entrepreneurs.", image: "/assets/innovation-story.png", alt: "Illustrative image of Botswana innovators", date: "Programme information", body: "Mabogo-Dinku is a CEDA loan programme designed to support micro entrepreneurs and citizen participation in enterprise development. Review the official CEDA page for current requirements and application details.", source: "https://www.ceda.co.bw/index.php/mabogo-dinku", sourceLabel: "View the official programme" },
  { slug: "services", kind: "CEDA programme", title: "Finance and business development", summary: "Discover CEDA's published business support, mentoring and financing services.", image: "/assets/innovation-gallery.png", alt: "Illustrative Botswana innovation showcase", date: "Service information", body: "CEDA describes finance and business development services, including advisory, training and mentoring support. Check its official service pages for current terms and eligibility.", source: "https://www.ceda.co.bw/services", sourceLabel: "Explore official CEDA services" },
  { slug: "prepare", kind: "Submission guide", title: "Prepare your innovation for assessment", summary: "A practical starting point for describing the problem, your solution and the evidence you have.", image: "/assets/innovation-story.png", alt: "Illustrative image of Botswana innovators testing a sensor", date: "Guide", body: "Start with a clear explanation of the problem and who experiences it. Describe what your solution changes, what you have tested and what you still need to learn. Gather research, sketches, prototype photos or pilot feedback that supports your answers. The submission guide explains how to prepare for the portal.", source: "/eligibility/", sourceLabel: "Read the submission guide" },
  { slug: "impact", kind: "Agency update", title: "CEDA support for Botswana businesses", summary: "Agency-wide financing and jobs figures provide context for CEDA's broader work.", image: "/assets/innovation-gallery.png", alt: "Illustrative scene of innovators demonstrating practical prototypes", date: "2025/26 reporting period", body: "CEDA's agency-wide reporting through December 2025 records investment in businesses and jobs supported. These figures cover CEDA as an agency. They are not Innovation Portal submission, funding or winner totals.", source: impact.source, sourceLabel: "Read the published report" },
  { slug: "stories", kind: "Customer stories", title: "Entrepreneurs building across Botswana", summary: "Read published CEDA profiles about businesses that have used its support.", image: "/assets/innovation-story.png", alt: "Illustrative image of Botswana entrepreneurs discussing an innovation", date: "CEDA profiles", body: "CEDA publishes profiles of entrepreneurs working in retail, farming and construction. Their experiences show different paths into enterprise. These are CEDA customer stories, not awards or results from this Innovation Portal.", source: ceda.profiles, sourceLabel: "Read CEDA customer profiles" },
] as const;
const updateCard = (item: typeof updates[number], featured = false) => `<a class="update-card${featured ? " is-featured" : ""}" href="/updates/${item.slug}/" data-update-item data-status="${item.slug === "hackathon" ? "open" : "information"}"><img src="${item.image}" alt="${item.alt}" width="1440" height="960" loading="lazy" decoding="async"><span class="update-meta">${item.slug === "hackathon" ? "Event running" : item.kind} · ${item.date}</span><h3>${item.title}</h3><p>${item.summary}</p><span class="text-link">View details ${icon("arrow")}</span></a>`;
const home = `
<section class="hero photo-hero">
  ${heroVisual(prototypePhoto, true)}
  <div class="wrap hero-inner"><div class="hero-copy">
    <p class="eyebrow">CEDA Innovation Portal</p>
    <h1>Big ideas deserve<br> a place to grow.</h1>
    <p class="lead">Turn a problem you understand into a proposal others can assess. Explore how to prepare your innovation for CEDA.</p>
    <div class="actions">${buttonLink("/signin/", "Submit an innovation")}${buttonLink("#programme", "Explore the programme", "secondary", false)}</div>
    <p class="eligibility-note">${icon("check")} For individuals and registered companies</p>
  </div></div>
</section>
<div class="wrap public-story">
  <section class="block public-highlights" id="programme" aria-labelledby="highlights-heading">
    <div class="public-highlight-main"><p class="eyebrow">Innovation spotlight</p><h2 id="highlights-heading">Good ideas deserve a clear path forward.</h2>${updateCard(updates[0], true)}</div>
    <aside class="public-highlight-feed" aria-labelledby="feed-heading"><div class="section-heading"><h2 id="feed-heading">Innovation feed</h2>${textLink("/updates/", "View all")}</div>${updateCard(updates[1])}${updateCard(updates[2])}</aside>
  </section>
  <section class="block home-partners" aria-labelledby="ecosystem-heading"><p class="eyebrow">Ecosystem</p><div class="section-heading"><h2 id="ecosystem-heading">Partners and collaborators</h2>${textLink("/about/#partners", "Explore their work")}</div><div class="partner-marquee" aria-label="Organisations in the innovation ecosystem"><div class="partner-track">${[...collaborators,...collaborators].map(({shortName,name,url},index) => `<a class="partner-tile" href="${url}"${index >= collaborators.length ? ' tabindex="-1" aria-hidden="true"' : ` aria-label="Learn about ${name}"`}><img src="https://www.google.com/s2/favicons?domain=${shortName === "BITRI" ? "bitri.co.bw" : shortName === "BTC" ? "btc.bw" : "bih.co.bw"}&sz=128" alt="${shortName} logo" width="72" height="72" loading="lazy"><span>${shortName}</span></a>`).join("")}</div></div><p class="muted">These organisations have different relationships with CEDA or Botswana's broader innovation ecosystem. Listing does not imply sponsorship of this portal.</p></section>
  <section class="block public-voices" aria-labelledby="voices-heading"><div class="section-heading"><div><p class="eyebrow">People behind the progress</p><h2 id="voices-heading">Stories from Botswana.</h2></div>${textLink("/about/#stories", "Read more stories")}</div><div data-story-carousel>${stories.map(({place,name,summary,url},index)=>{const image=["/assets/story-maggie.png","/assets/story-obakeng.png","/assets/story-tsholefelo.png"][index]; return `<article class="voice-slide" data-story-slide ${index ? 'hidden' : ''}><figure><img src="${image}" alt="Illustrative story image for ${name}" width="1448" height="1024" loading="lazy" decoding="async"></figure><div><p class="eyebrow">CEDA customer story · ${place}</p><h3>${name}</h3><p>${summary}</p>${textLink(url, "Read the published profile")}</div></article>`}).join("")}<div class="story-controls"><button type="button" data-story-prev aria-label="Previous customer story">${icon("arrow")}</button><span data-story-count role="status" aria-live="polite">1 of ${stories.length}</span><button type="button" data-story-next aria-label="Next customer story">${icon("arrow")}</button></div></div></section>
  <section class="block home-recognition" aria-labelledby="recognition-heading"><div class="section-heading"><div><p class="eyebrow">Innovation recognition</p><h2 id="recognition-heading">A place to celebrate progress.</h2></div>${textLink("/updates/", "Explore updates")}</div><div class="recognition-layout"><figure><img src="/assets/innovation-gallery.png" alt="Illustrative scene of innovators showing their work" width="1536" height="1024" loading="lazy" decoding="async"></figure><div><p class="eyebrow">Featured winners</p><h3>Winner stories will appear here.</h3><p>No CEDA Innovation Portal winners have been published here yet. Once official results are available, this space can feature their work.</p>${textLink("/how-it-works/", "How assessment works")}</div></div></section>
</div>`;

export const pages: Record<string, { title: string; description: string; body: string }> = {
  "/": { title: "CEDA Innovation Portal", description: "Explore the CEDA innovation assessment journey for individuals and registered companies in Botswana.", body: home },
  "/about/": { title: "About CEDA Innovation", description: "Explore CEDA's mission, vision, values, impact, history and innovation ecosystem.", body: conciseAbout },
  "/updates/": { title: "Updates and highlights", description: "Browse the running CEDA portal hackathon and published CEDA programmes and stories.", body: heading("Updates and highlights", "Ideas, programmes and progress.", "Explore the current hackathon and published CEDA programmes and stories.") + `<section class="wrap block" aria-labelledby="updates-heading"><h2 id="updates-heading">Browse updates</h2><div class="updates-toolbar" data-updates-controls><label for="updates-query">Search updates<input id="updates-query" type="search" placeholder="Search programmes and updates" autocomplete="off"></label><div role="group" aria-label="Filter updates"><button type="button" data-updates-status="all" aria-pressed="true">All</button><button type="button" data-updates-status="open" aria-pressed="false">Open</button><button type="button" data-updates-status="information" aria-pressed="false">Programmes and stories</button></div></div><p class="muted" data-updates-empty role="status" hidden>No updates match your search. Try another term or choose All.</p><div class="updates-grid" data-updates-list>${updates.map(item => updateCard(item)).join("")}</div><p class="muted">Illustrative images show concepts and do not depict the events or people described. Application and event dates are distinct.</p></section>` },
  ...Object.fromEntries(updates.map(item => [`/updates/${item.slug}/`, { title: item.title, description: item.summary, body: `<article class="wrap block update-article"><a class="text-link" href="/updates/">All updates ${icon("arrow")}</a><p class="eyebrow">${item.kind} · ${item.date}</p><h1>${item.title}</h1><p class="lead">${item.summary}</p><figure><img src="${item.image}" alt="${item.alt}" width="1440" height="960" decoding="async"><figcaption>Illustrative imagery. This image does not document a CEDA event or customer.</figcaption></figure><div class="update-article-body"><p>${item.body}</p>${textLink(item.source, item.sourceLabel)}</div></article>` }])),
  "/how-it-works/": { title: "How it works", description: "Follow the CEDA innovation process from account creation to feedback.", body: heading("The process", "From first draft to feedback.", "Explore each stage of the innovation journey and what to prepare along the way.", prototypePhoto) + `<section class="wrap block"><div class="section-heading"><h2>The submission journey</h2>${textLink("/eligibility/", "Prepare your submission")}</div>${stepsList()}<aside class="note"><h3>After you submit</h3><p>Keep your receipt, check your account for status updates and respond if the review team requests additional information.</p></aside></section><section id="assessment" class="wrap block split"><div><p class="eyebrow">Assessment</p><h2>Help reviewers understand your idea.</h2><p>Describe what you have demonstrated and what you still need to test. Match your evidence to your current stage.</p>${start}</div>${articleList(reviewTopics)}</section><section class="wrap block public-feature"><div class="public-feature-copy"><p class="eyebrow">Prepare at your own pace</p><h2>Bring your evidence together before you begin.</h2><p>Sketches, customer feedback and working prototypes can all help tell the story of an innovation. Choose material that supports your answers.</p>${textLink("/eligibility/", "Open the preparation guide")}</div><figure class="public-feature-image"><img src="/assets/innovation-hero.webp" alt="Two innovators discussing a prototype" width="1440" height="960" loading="lazy" decoding="async"></figure></section>` },
  "/eligibility/": { title: "Eligibility and submission guide", description: "See who can submit and how to prepare evidence for your innovation stage.", body: heading("Submission guide", "Prepare your innovation.", "Start with your applicant type, then gather evidence that matches your innovation's current stage.", prototypePhoto) + `<section class="wrap block guide-content"><h2>Who can submit?</h2><div class="split"><article class="note"><h3>Individuals</h3><p>Prepare a clear description of your idea and supporting material appropriate to its stage.</p></article><article class="note"><h3>Registered companies</h3><p>Prepare company and representative details along with the information and evidence for the innovation.</p></article></div><h2>Choose your current stage</h2><div class="faq-list">${stages.map((stage) => disclosure(stage.name, stage.text)).join("")}</div><aside class="note"><h3>Supporting material</h3><p>Attach relevant evidence alongside your answers. Step 11 also accepts applicant verification records and additional supporting documents. File limits vary by section; check the form before uploading. Share videos as HTTPS links.</p></aside><h2>Required form &amp; accompanying copies</h2><p class="prose">Review the active CEDA Innovation Portal form checklist and any downloadable worksheets published by portal administrators.</p><div data-public-downloads>${renderStaticDownloads()}</div><h2>Before you apply</h2>${checklist}${start}</section>` },
  "/sectors/": { title: "Sectors", description: "Browse example sectors for CEDA innovation submissions.", body: heading("Sectors", "Find your area of innovation.", "These examples can help you describe where your idea fits.", prototypePhoto) + `<section class="wrap block" data-filter-area>${search("sector-search", "Search sectors", "Search by name or topic")}<div class="category" data-category-controls hidden><label for="sector-category">Category</label><select id="sector-category"><option value="">All categories</option><option>Environment</option><option>People</option><option>Technology</option></select></div>${sectorList(sectors)}${empty}</section>` },
  "/help/": { title: "Help and FAQs", description: "Find answers to frequently asked questions about innovation submissions.", body: heading("Help centre", "How can we help?", "Get answers about eligibility, evidence, regulatory authority contacts and the assessment process before you create an account.") + `<section class="wrap block support-layout"><div data-filter-area data-public-faqs>${search("help-search", "Search questions", "Try evidence or regulatory")}${faqList(faqs)}${empty}</div><aside class="note"><h2>Need more help?</h2><p>Contact CEDA for general enquiries, browse downloadable application copies below, or reach a sector regulator.</p>${textLink("/contact/#regulators", "Regulatory authority contacts")}<br>${textLink("/eligibility/", "Eligibility & form checklist")}<br>${textLink("#hosting-support", "Hosting support & turnaround SLAs")}<br>${textLink("#feedback", "Leave a suggestion")}</aside></section><section class="wrap block" id="forms"><h2>Application form &amp; accompanying copies</h2><p class="prose">Download official application templates, offline preparation worksheets and accompanying copy checklists managed by CEDA administrators.</p><div data-public-downloads>${renderStaticDownloads()}</div></section><section class="wrap block" id="regulators"><h2>Botswana regulatory authority contacts</h2><p class="prose">Direct contact channels for Botswana statutory and sector authorities relevant to company registration, tax compliance, IP, standards, ICT, finance, energy and health innovations.</p><div class="portal-cards" data-public-regulators>${renderStaticRegulators()}</div></section>${renderHostingSupportSla()}` + feedbackBox },
  "/contact/": { title: "Contact and portal information", description: "Find official CEDA contact information and regulatory authority contacts.", body: heading("Contact", "Connect with CEDA and regulators.", "Use CEDA's official channels for general enquiries, or contact a sector regulatory authority directly.") + `<section class="wrap block split"><div><h2>General enquiries</h2>${contactDetails}<div class="actions">${buttonLink(ceda.branches, "Find a branch", "secondary")}${textLink("/help/#feedback", "Leave a suggestion")}</div></div><div class="faq-list">${disclosure("Privacy and confidentiality", "The public preview collects no application information. Suggestions open as drafts in your email app. CEDA receives the message only when you send it.", "privacy")}${disclosure("About this preview", "This preview explains the proposed process. Published CEDA guidance governs official submissions and decisions.", "terms")}${disclosure("Accessibility support", "These pages provide keyboard navigation and adjustable text. Use the official contact channels if you need another way to access the information.", "accessibility")}</div></section><section class="wrap block" id="regulators"><h2>Regulatory authority directory</h2><p class="prose">Verify registration, standards or sector licensing requirements with the relevant Botswana authority.</p><div class="portal-cards" data-public-regulators>${renderStaticRegulators()}</div></section>${renderHostingSupportSla()}` },
  "/signin/": { title: "Sign in", description: "Sign in to your CEDA Innovator account.", body: accessScreen("signin") },
  "/register/": { title: "Sign up", description: "Create an account for the CEDA Innovator Portal.", body: accessScreen("register") },
  "/verify-email/": {
    title: "Verify your email",
    description: "Confirm your email for the CEDA Innovator Portal.",
    body: verificationScreen(),
  },
  "/account/": { title: "Innovator home", description: "Open your CEDA Innovator home screen.", body: innovatorScreen() },
  "/admin/": { title: "Administration", description: "Manage CEDA users, roles and sectors.", body: adminScreen() },
  "/assessor/": { title: "Assessment workspace", description: "Review assigned applications and manage assessment panels.", body: assessorScreen() },
  "/support/": { title: "Support Officer home", description: "Manage innovator support requests and conversations.", body: supportScreen() },
  "/committee/": { title: "Committee observer workspace", description: "Read-only oversight of CEDA innovation pipeline stages, timeline milestones, and awards.", body: committeeScreen() },
  "/activate/": { title: "Set up your account", description: "Accept your CEDA invitation.", body: `<section class="wrap block"><h1>Set up your account</h1><p data-activation-status role="status"></p><form data-activation class="access-form"><label>New password<input type="password" name="password" minlength="8" required autocomplete="new-password"></label><label>Confirm password<input type="password" name="confirmation" minlength="8" required autocomplete="new-password"></label><button type="submit" class="button primary" disabled>Set password and continue</button></form><a href="/signin/">Sign in</a></section>` },
};

export function renderPage(path: string, page: typeof pages[string]) {
  const title = path === "/" ? page.title : `${page.title} | CEDA Innovation Portal`;
  const isAccessPage = path === "/signin/" || path === "/register/";
  const accountScript = path === "/verify-email/" ? "verificationScreen.js" : path === "/activate/" ? "activate.js" : path === "/admin/" ? "admin.js" : path === "/account/" ? "innovator.js" : path === "/assessor/" ? "assessor.js" : path === "/support/" ? "support.js" : path === "/committee/" ? "committee.js" : null;
  const pageAssets = isAccessPage
    ? '<link rel="stylesheet" href="/assets/access.css"><script type="module" src="/assets/access.js"></script><script type="module" src="/assets/signup.js"></script><script type="module" src="/assets/signin.js"></script>'
    : accountScript
      ? `<meta name="referrer" content="no-referrer"><link rel="stylesheet" href="/assets/access.css">${path === "/admin/" ? '<link rel="stylesheet" href="/assets/admin.css">' : path === "/account/" ? '<link rel="stylesheet" href="/assets/admin.css"><link rel="stylesheet" href="/assets/innovator.css">' : path === "/assessor/" ? '<link rel="stylesheet" href="/assets/admin.css"><link rel="stylesheet" href="/assets/assessor.css">' : path === "/support/" ? '<link rel="stylesheet" href="/assets/admin.css"><link rel="stylesheet" href="/assets/support.css">' : path === "/committee/" ? '<link rel="stylesheet" href="/assets/admin.css"><link rel="stylesheet" href="/assets/committee.css">' : ""}<script type="module" src="/assets/${accountScript}"></script>`
      : '<script type="module" src="/assets/site.js"></script>';
  return `<!doctype html>
<html lang="en-BW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><meta name="description" content="${page.description}"><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/accessibility.css"><link rel="stylesheet" href="/assets/tour.css"><script src="/assets/accessibility.js"></script><script src="/assets/tour.js" defer></script>${pageAssets}</head>
<body><a class="skip" href="#main">Skip to content</a>${isAccessPage || accountScript ? "" : siteHeader(path)}
<main id="main" tabindex="-1">${page.body}</main>
${isAccessPage || accountScript ? "" : siteFooter}</body></html>`;
}
