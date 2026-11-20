import { evidenceChecklist, examples, faqs, reviewTopics, sectors, stages, steps } from "./content.ts";
import { buttonLink, contactDetails, disclosure, icon, siteFooter, siteHeader, textLink } from "./components.ts";
import { ceda, collaborators, impact, stories } from "./ceda.ts";
import { accessScreen, accountScreen, verificationScreen } from "./access.ts";

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

const about = heading("About CEDA Innovation", "Backing Botswana’s entrepreneurs.", "The Citizen Entrepreneurial Development Agency provides financing and business support for citizen-owned enterprises. The Innovation Portal shows how innovators can prepare an idea for assessment.", enterprisePhoto) + `
<div class="wrap">
  <section class="block split">
    <div><h2>From business support to innovation</h2><p>The Government of Botswana established CEDA in 2001 to make financial and technical support more accessible to citizen-owned businesses.</p>${textLink(ceda.background, "Read CEDA’s background")}</div>
    <div class="note"><h3>What the portal is for</h3><p>Use the public guide to check eligibility and gather evidence. The planned signed-in portal will give applicants a place to submit an innovation, track its status and receive feedback.</p>${textLink("/how-it-works/", "Explore the application journey")}</div>
  </section>
  <section class="block" id="impact">
    <div class="impact-panel"><h2>CEDA’s impact on businesses and jobs</h2><p>${impact.period} · Agency-wide financing</p>
    <dl class="impact-grid">${impact.figures.map(({value, label}) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
    ${textLink(impact.source, "Read the DailyNews coverage of the parliamentary update")}
    <p class="muted impact-note">Innovation Portal submission and outcome totals are not yet published.</p></div>
  </section>
  <section class="block" id="stories">
    <div class="section-heading"><h2>Businesses and lives transformed</h2>${textLink(ceda.profiles, "Read CEDA customer stories")}</div>
    <div class="story-grid">${stories.map(({place, name, summary, url}) => `<article class="sector-card"><p class="eyebrow">${place}</p><h3>${name}</h3><p>${summary}</p>${textLink(url, `Read about ${name}`)}</article>`).join("")}</div>
    <figure class="story-quote"><blockquote><p>“The people were very helpful and guided us throughout the application process.”</p></blockquote><figcaption>Maggie Gabakgore, on Mabogo-Dinku · <a href="${stories[0].url}">CEDA customer interview</a></figcaption></figure>
  </section>
  <section class="block" id="partners">
    <div class="section-heading"><h2>Partners and collaborators</h2>${textLink(ceda.partnerships, "See CEDA’s published partnerships")}</div>
    <div class="story-grid">${collaborators.map(({shortName, name, role, summary, url}) => `<article class="sector-card"><p class="eyebrow">${role}</p><h3><span class="partner-name">${shortName}</span>${name}</h3><p>${summary}</p>${textLink(url, `Read about ${shortName}’s work`)}</article>`).join("")}</div>
  </section>
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
  <section class="block split" id="programme">
    <div><h2>Innovation begins with a problem worth solving.</h2></div>
    <div class="prose"><p>The CEDA Innovation Portal is designed to give Botswana's innovators a clear route from preparing an idea to receiving feedback. You can explore the guidance, identify your stage and plan the evidence you will need before signing in.</p>
    ${textLink("/about/#impact", "See CEDA’s impact and business stories")}</div>
  </section>
  <section class="block" id="journey">
    <div class="section-heading"><h2>How the journey works</h2>${textLink("/how-it-works/", "Explore the process")}</div>
    ${stepsList()}
  </section>
  <section class="block split" id="eligibility">
    <div><h2>Who can apply?</h2><p class="lead">Prepare your submission as an individual or on behalf of a registered company.</p>${textLink("/eligibility/", "Read the eligibility guide")}</div>
    ${articleList([{title:"Individuals",text:"Describe the problem, your solution and the work you have done to validate it."},{title:"Registered companies",text:"Prepare details about the company and its representative alongside the proposal and evidence."}])}
  </section>
  <section class="block" id="sectors">
    <div class="section-heading"><h2>Explore sectors</h2>${textLink("/sectors/", "Browse all sectors")}</div>
    ${sectorList(sectors)}
  </section>
  <section class="block split" id="review">
    <div><h2>What reviewers look for</h2><p class="lead">Make it easy to see who benefits, what is new and what your evidence supports.</p>${textLink("/how-it-works/#assessment", "Read about assessment")}</div>
    ${articleList(reviewTopics)}
  </section>
  <section class="block" id="examples">
    <div class="section-heading"><h2>Ideas in practice</h2>${textLink("/about/#stories", "Meet CEDA-supported entrepreneurs")}</div>
    <p class="lead">Use these examples to think about how you could explain your own innovation.</p>
    ${articleList(examples)}
  </section>
  <section class="block split" id="faq">
    <div><h2>Frequently asked questions</h2><p class="lead">Find answers before you start preparing an application.</p>${textLink("/help/", "Visit the help centre")}<br>${textLink("/help/#feedback", "Leave a suggestion")}</div>
    ${faqList(faqs.slice(0, 6))}
  </section>
  <section class="block closing">
    <h2>Prepare your submission</h2><p class="lead">Use the guide to organise your ideas and evidence for your current stage.</p>${buttonLink("/eligibility/", "Open the submission guide")}
  </section>
</div>`;

export const pages: Record<string, { title: string; description: string; body: string }> = {
  "/": { title: "CEDA Innovation Portal", description: "Explore the CEDA innovation assessment journey for individuals and registered companies in Botswana.", body: home },
  "/about/": { title: "About CEDA Innovation", description: "Explore CEDA’s background, business impact, customer stories and innovation ecosystem.", body: about },
  "/how-it-works/": { title: "How it works", description: "Follow the CEDA innovation process from account creation to feedback.", body: heading("The process", "From first draft to feedback.", "An overview of the steps you'll follow when the Innovator Portal opens.", prototypePhoto) + `<section class="wrap block"><h2>The submission journey</h2>${stepsList()}<aside class="note"><h3>What happens after submission?</h3><p>Keep your receipt. Check the portal for status changes and respond if more information is requested.</p></aside></section><section id="assessment" class="wrap block split"><div><h2>What reviewers look for</h2><p>Match your evidence to your current stage. Clear examples and honest descriptions help reviewers understand what has been demonstrated and what is still to be tested.</p>${start}</div>${articleList(reviewTopics)}</section>` },
  "/eligibility/": { title: "Eligibility and submission guide", description: "See who can submit and how to prepare evidence for your innovation stage.", body: heading("Submission guide", "Prepare your innovation.", "Start with your applicant type, then gather evidence that matches your innovation's current stage.", prototypePhoto) + `<section class="wrap block guide-content"><h2>Who can submit?</h2><div class="split"><article class="note"><h3>Individuals</h3><p>Prepare a clear description of your idea and supporting material appropriate to its stage.</p></article><article class="note"><h3>Registered companies</h3><p>Prepare company and representative details along with the information and evidence for the innovation.</p></article></div><h2>Choose your current stage</h2><div class="faq-list">${stages.map((stage) => disclosure(stage.name, stage.text)).join("")}</div><aside class="note"><h3>Supporting material</h3><p>Organise relevant evidence by form section. The portal is designed for up to four attachments per section. Share videos as links and check the form for accepted formats.</p></aside><h2>Before you apply</h2>${checklist}${start}</section>` },
  "/sectors/": { title: "Sectors", description: "Browse example sectors for CEDA innovation submissions.", body: heading("Sectors", "Find your area of innovation.", "These examples can help you describe where your idea fits.", prototypePhoto) + `<section class="wrap block" data-filter-area>${search("sector-search", "Search sectors", "Search by name or topic")}<div class="category" data-category-controls hidden><label for="sector-category">Category</label><select id="sector-category"><option value="">All categories</option><option>Environment</option><option>People</option><option>Technology</option></select></div>${sectorList(sectors)}${empty}</section>` },
  "/help/": { title: "Help and FAQs", description: "Find answers to frequently asked questions about innovation submissions.", body: heading("Help centre", "How can we help?", "Get answers about eligibility, evidence and the assessment process before you create an account.") + `<section class="wrap block support-layout"><div data-filter-area>${search("help-search", "Search questions", "Try evidence or eligibility")}${faqList(faqs)}${empty}</div><aside class="note"><h2>Need more help?</h2><p>Contact CEDA for general enquiries or tell us how the portal could make its guidance easier to use.</p>${textLink("/contact/", "Find contact information")}<br>${textLink("#feedback", "Leave a suggestion")}</aside></section>` + feedbackBox },
  "/contact/": { title: "Contact and portal information", description: "Find official CEDA contact information and learn about public portal access.", body: heading("Contact", "Connect with CEDA.", "Use CEDA's official website for current contact information and general enquiries.") + `<section class="wrap block split"><div><h2>General enquiries</h2>${contactDetails}<div class="actions">${buttonLink(ceda.branches, "Find a branch", "secondary")}${textLink("/help/#feedback", "Leave a suggestion")}</div></div><div class="faq-list">${disclosure("Privacy and confidentiality", "The public preview collects no application information. Suggestions open as drafts in your email app. CEDA receives the message only when you send it.", "privacy")}${disclosure("About this preview", "This preview explains the proposed process. Published CEDA guidance governs official submissions and decisions.", "terms")}${disclosure("Accessibility support", "These pages provide keyboard navigation and adjustable text. Use the official contact channels if you need another way to access the information.", "accessibility")}</div></section>` },
  "/signin/": { title: "Sign in", description: "Sign in to your CEDA Innovator account.", body: accessScreen("signin") },
  "/register/": { title: "Sign up", description: "Create an account for the CEDA Innovator Portal.", body: accessScreen("register") },
  "/verify-email/": {
    title: "Verify your email",
    description: "Confirm your email for the CEDA Innovator Portal.",
    body: verificationScreen(),
  },
  "/account/": { title: "Innovator home", description: "Open your CEDA Innovator home screen.", body: accountScreen() },
  "/admin/": { title: "Administrator home", description: "Open your CEDA administration workspace.", body: accountScreen() },
};

export function renderPage(path: string, page: typeof pages[string]) {
  const title = path === "/" ? page.title : `${page.title} | CEDA Innovation Portal`;
  const isAccessPage = path === "/signin/" || path === "/register/";
  const accountScript = path === "/verify-email/" ? "verificationScreen.js" : ["/account/", "/admin/"].includes(path) ? "verifiedAccount.js" : null;
  const pageAssets = isAccessPage
    ? '<link rel="stylesheet" href="/assets/access.css"><script type="module" src="/assets/access.js"></script><script type="module" src="/assets/signup.js"></script><script type="module" src="/assets/signin.js"></script>'
    : accountScript
      ? `<meta name="referrer" content="no-referrer"><link rel="stylesheet" href="/assets/access.css"><script type="module" src="/assets/${accountScript}"></script>`
      : '<script type="module" src="/assets/site.js"></script>';
  return `<!doctype html>
<html lang="en-BW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><meta name="description" content="${page.description}"><link rel="stylesheet" href="/assets/site.css">${pageAssets}</head>
<body><a class="skip" href="#main">Skip to content</a>${isAccessPage || accountScript ? "" : siteHeader(path)}
<main id="main" tabindex="-1">${page.body}</main>
${isAccessPage || accountScript ? "" : siteFooter}</body></html>`;
}
