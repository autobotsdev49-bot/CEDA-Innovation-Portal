import { navigation } from "./content.ts";
import { ceda } from "./ceda.ts";

const iconPaths = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  external: '<path d="M6 18 18 6M9 6h9v9"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="m3 3 18 18M10.6 5.6 12 5.5c6.4 0 10 6.5 10 6.5a16 16 0 0 1-3 3.5M6.4 7.4A17 17 0 0 0 2 12s3.6 6.5 10 6.5c1.1 0 2.2-.2 3.2-.6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  ballot: '<path d="M4 11h16l2 4v5H2v-5l2-4Zm-2 4h20M8 12h8m-8-1-2-7 9-2 2 9"/>',
};

export function icon(name: keyof typeof iconPaths) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name]}</svg>`;
}

export function buttonLink(path: string, label: string, variant: "primary" | "secondary" = "primary", showIcon = true) {
  const indicator = showIcon
    ? `<span class="button-icon">${icon(path.startsWith("https://") ? "external" : "arrow")}</span>`
    : "";
  return `<a class="button ${variant}" href="${path}">${label}${indicator}</a>`;
}

export function textLink(path: string, label: string) {
  return `<a class="text-link" href="${path}">${label}${icon(path.startsWith("https://") ? "external" : "arrow")}</a>`;
}

export function disclosure(label: string, text: string, id?: string) {
  return `<details${id ? ` id="${id}"` : ""}><summary>${label}${icon("chevron")}</summary><p>${text}</p></details>`;
}

export const brand = '<a class="brand" href="/" aria-label="CEDA Innovation Portal home"><img class="brand-logo" src="https://www.ceda.co.bw/sites/default/files/logo_2.png" alt="CEDA" width="160" height="98" decoding="async" referrerpolicy="no-referrer"><span>Innovation Portal</span></a>';

export function siteHeader(path: string) {
  const links = navigation.map((item) =>
    `<a href="${item.path}"${item.path === path ? ' aria-current="page"' : ""}>${item.label}</a>`).join("");
  return `<header class="header"><div class="wrap header-inner">${brand}
<nav class="desktop-nav" aria-label="Main navigation">${links}</nav>
<div class="header-actions">${buttonLink("/register/", "Sign up", "secondary", false)}${buttonLink("/signin/", "Submit innovation")}</div>
<details class="mobile-nav"><summary>${icon("menu")} Menu</summary><nav aria-label="Main navigation">${links}<a href="/register/">Sign up</a><a href="/signin/">Submit innovation</a></nav></details></div></header>`;
}

export const contactDetails = `<address class="contact-details">
  <span>${ceda.postalAddress}</span>
  <a href="tel:+2673170895">${ceda.phone}</a>
  <a href="tel:0800600253">Toll-free ${ceda.tollFree}</a>
  <a href="mailto:${ceda.email}">${ceda.email}</a>
</address>`;

export const siteFooter = `<footer class="footer"><div class="wrap">
  <div class="footer-grid">
    <div>${brand}<p>Citizen Entrepreneurial Development Agency</p>${textLink(ceda.website, "Official CEDA website")}</div>
    <nav aria-label="Explore the portal"><h2>Explore</h2><a href="/about/">About CEDA Innovation</a><a href="/how-it-works/">How it works</a><a href="/eligibility/">Submission guide</a><a href="/sectors/">Innovation sectors</a></nav>
    <nav aria-label="Get support"><h2>Support</h2><a href="/help/">Help centre</a><a href="/help/#feedback">Suggestion box</a><a href="/contact/">Contact information</a><a href="${ceda.branches}">Find a CEDA branch</a></nav>
    <div><h2>CEDA head office</h2>${contactDetails}</div>
  </div>
  <div class="footer-bottom"><p>CEDA Innovation Portal · Hackathon preview</p><nav aria-label="Portal policies"><a href="/contact/#privacy">Privacy</a><a href="/contact/#terms">Preview terms</a><a href="/contact/#accessibility">Accessibility</a></nav></div>
</div></footer>`;
