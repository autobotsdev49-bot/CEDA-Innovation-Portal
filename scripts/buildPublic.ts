import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { pages, renderPage } from "../src/publicSite/pages.ts";

const output = new URL("../dist/", import.meta.url);
const assets = new URL("assets/", output);
await mkdir(assets, { recursive: true });
// Keep the Assessor entry self-contained alongside assessmentForm & assessmentOverview helpers.
const assessmentFormSource = await readFile(new URL("../mobile/assessmentForm.js", import.meta.url), "utf8");
const assessmentOverviewSource = await readFile(new URL("../mobile/assessmentOverview.js", import.meta.url), "utf8");
const assessorSource = await readFile(new URL("../src/publicSite/assets/assessor.js", import.meta.url), "utf8");
const assessorEntry = assessorSource
  .replace(/^import \{[^}]*\} from "\.\/(?:assessmentForm|assessmentOverview)\.js";\r?\n/gm, "")
  .replace(/^import (\{[^}]*\}) from ("[^\n]+");/gm, "const $1 = await import($2);");
await writeFile(new URL("assessor.js", assets), `try {\n${assessmentFormSource.replace(/\bexport\s+(const|function)\s+/g, "$1 ")}\n${assessmentOverviewSource.replace(/\bexport\s+(const|function)\s+/g, "$1 ")}\n${assessorEntry}\n} catch {\n  const status = document.querySelector('[data-assessor-status]');\n  if (status) {\n    status.classList.remove('admin-status-silent');\n    status.textContent = 'The assessor workspace could not start. Reload the page. If this continues on localhost, restart npm run dev.';\n  }\n}\n`, "utf8");
for (const filename of ["assessmentForm.js", "assessmentOverview.js", "supportOverview.js", "committeeOverview.js", "reportingOverview.js"]) {
  await copyFile(new URL(`../mobile/${filename}`, import.meta.url), new URL(filename, assets));
}
for (const filename of ["ceda.png", "site.css", "admin.css", "innovator.css", "assessor.css", "support.css", "committee.css", "accessibility.css", "accessibility.js", "telemetry.js", "portalCatalog.js", "notificationsDomain.js", "admin.js", "adminOperations.js", "adminOverview.js", "activate.js", "access.css", "access.js", "signup.js", "signin.js", "signupApi.js", "verificationSession.js", "verificationCooldown.js", "verificationScreen.js", "verifiedAccount.js", "site.js", "innovation-hero.webp", "innovation-story.png", "innovation-gallery.png", "story-maggie.png", "story-obakeng.png", "story-tsholefelo.png"]) {
  await copyFile(new URL(`../src/publicSite/assets/${filename}`, import.meta.url), new URL(filename, assets));
}

// Keep the Support Officer entry self-contained alongside supportOverview helpers.
const supportOverviewSource = await readFile(new URL("../mobile/supportOverview.js", import.meta.url), "utf8");
const supportSource = await readFile(new URL("../src/publicSite/assets/support.js", import.meta.url), "utf8");
const supportEntry = supportSource
  .replace(/^import \{\r?\n[\s\S]*?\} from "\.\/supportOverview\.js";\r?\n/m, "")
  .replace(/^import (\{[^}]*\}) from ("[^\n]+");/gm, "const $1 = await import($2);");
await writeFile(new URL("support.js", assets), `try {\n${supportOverviewSource.replace(/\bexport\s+(const|function)\s+/g, "$1 ")}\n${supportEntry}\n} catch {\n  const status = document.querySelector('[data-support-status]');\n  if (status) {\n    status.classList.remove('admin-status-silent');\n    status.textContent = 'The support workspace could not start. Reload the page. If this continues on localhost, restart npm run dev.';\n  }\n}\n`, "utf8");
// Keep the Committee Observer entry self-contained alongside committeeOverview helpers.
const committeeOverviewSource = await readFile(new URL("../mobile/committeeOverview.js", import.meta.url), "utf8");
const committeeSource = await readFile(new URL("../src/publicSite/assets/committee.js", import.meta.url), "utf8");
const committeeEntry = committeeSource
  .replace(/^import \{\r?\n[\s\S]*?\} from "\.\/committeeOverview\.js";\r?\n/m, "")
  .replace(/^import (\{[^}]*\}) from ("[^\n]+");/gm, "const $1 = await import($2);");
await writeFile(new URL("committee.js", assets), `try {\n${committeeOverviewSource.replace(/\bexport\s+(const|function)\s+/g, "$1 ")}\n${committeeEntry}\n} catch {\n  const status = document.querySelector('[data-committee-status]');\n  if (status) {\n    status.classList.remove('admin-status-silent');\n    status.textContent = 'The committee workspace could not start. Reload the page. If this continues on localhost, restart npm run dev.';\n  }\n}\n`, "utf8");
// Keep the Admin entry self-contained when an already-running preview server
// has an older asset allowlist. Catch dependency/startup failures visibly.
const reportingSource = (await readFile(new URL("../mobile/reportingOverview.js", import.meta.url), "utf8"))
  .replace(/^export (const|function) /gm, "$1 ");
const administrationRules = await readFile(new URL("../src/publicSite/assets/applicationAdministration.js", import.meta.url), "utf8");
const operationsSource = (await readFile(new URL("../src/publicSite/assets/adminOperations.js", import.meta.url), "utf8"))
  .replace(/^import[^\n]+\n/m, "")
  .replace(/^export\s+(const|let|function)\s+/gm, "$1 ");
const overviewSource = (await readFile(new URL("../src/publicSite/assets/adminOverview.js", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?from\s+"[^"]*reportingOverview\.js";\r?\n/gm, "")
  .replace(/^export\s+(const|let|function)\s+/gm, "$1 ");
const adminSource = await readFile(new URL("../src/publicSite/assets/admin.js", import.meta.url), "utf8");
const adminEntry = adminSource
  .replace(/^import \{[^\n]+\} from "\.\/admin(?:Operations|Overview)\.js";\r?\n/gm, "")
  .replace(/^import[\s\S]*?from\s+"[^"]*reportingOverview\.js";\r?\n/gm, "")
  .replace(/^import (\{[^\n]+\}) from ("[^\n]+");/gm, "const $1 = await import($2);");
await writeFile(new URL("admin.js", assets), `try {\n${reportingSource}\n${administrationRules.replace(/^export\s+(const|let|function)\s+/gm, "$1 ")}\n${operationsSource}\n${overviewSource}\n${adminEntry}\n} catch {\n  const status = document.querySelector('[data-admin-status]');\n  if (status) {\n    status.classList.remove('admin-status-silent');\n    status.textContent = 'The administrator workspace could not start. Reload the page. If this continues on localhost, restart npm run dev.';\n  }\n}\n`, "utf8");

// Keep the Innovator entry self-contained alongside applicationWizard helpers.
const wizardSource = await readFile(new URL("../src/publicSite/assets/applicationWizard.js", import.meta.url), "utf8");
const innovatorSource = await readFile(new URL("../src/publicSite/assets/innovator.js", import.meta.url), "utf8");
const innovatorEntry = innovatorSource
  // Remove only the multiline wizard import. The previous pattern started at
  // the first import and consumed every import before applicationWizard.js,
  // leaving signupConfig/accountToken undefined in the browser bundle.
  .replace(/^import \{\r?\n[\s\S]*?\} from "\.\/applicationWizard\.js";\r?\n/m, "")
  .replace(/^import (\{[^\n]+\}) from ("[^\n]+");/gm, "const $1 = await import($2);");
await writeFile(new URL("innovator.js", assets), `try {\n${wizardSource.replace(/\bexport\s+(const|function)\s+/g, "$1 ")}\n${innovatorEntry}\n} catch {\n  const status = document.querySelector('[data-innovator-status]');\n  if (status) {\n    status.classList.remove('admin-status-silent');\n    status.textContent = 'The innovator workspace could not start. Reload the page. If this continues on localhost, restart npm run dev.';\n  }\n}\n`, "utf8");

let signupConfig: { url: string; key: string } | null = null;
const signupEnabled = process.env.CEDA_SIGNUP_ENABLED === "true";
if (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      !/^sb_publishable_[\w-]+$/.test(key)) {
    if (signupEnabled) throw new Error("Signup requires a Supabase origin and an sb_publishable_ key.");
  } else {
    signupConfig = { url: url.origin, key };
  }
}
if (signupEnabled && !signupConfig) throw new Error("Signup requires a Supabase origin and an sb_publishable_ key.");
await writeFile(new URL("signupConfig.js", assets), `export const signupConfig = ${JSON.stringify(signupConfig)};\nexport const signupEnabled = ${signupEnabled};\n`, "utf8");
for (const [path, page] of Object.entries(pages)) {
  const directory = new URL(path.slice(1), output);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("index.html", directory), renderPage(path, page), "utf8");
}
console.log(`Built ${Object.keys(pages).length} pages in dist/.`);

const authHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      signupConfig ? `connect-src ${signupConfig.url}` : "connect-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join("; "),
  },
  { key: "Cache-Control", value: "no-store" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const publicCacheHeaders = [
  { key: "Cache-Control", value: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const staticAssetCacheHeaders = [
  { key: "Cache-Control", value: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const configNoStoreHeaders = [
  { key: "Cache-Control", value: "no-store" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const publicHeaderRoutes = [
  "/",
  "/index.html",
  ...["/process", "/eligibility", "/sectors", "/stories", "/help", "/contact"].flatMap(path => [path, path + "/", path + "/index.html"]),
];

const protectedHeaderRoutes = [
  "/signin",
  "/register",
  "/verify-email",
  "/activate",
  "/account",
  "/admin",
  "/assessor",
  "/support",
  "/committee",
].flatMap(path => [path, path + "/", path + "/index.html"]);

await writeFile(new URL("vercel.json", output), JSON.stringify({
  trailingSlash: true,
  headers: [
    ...publicHeaderRoutes.map(source => ({ source, headers: publicCacheHeaders })),
    { source: "/assets/(.*)", headers: staticAssetCacheHeaders },
    { source: "/assets/signupConfig.js", headers: configNoStoreHeaders },
    ...protectedHeaderRoutes.map(source => ({ source, headers: authHeaders })),
  ],
}, null, 2) + "\n", "utf8");
