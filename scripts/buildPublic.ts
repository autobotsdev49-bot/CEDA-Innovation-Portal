import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { pages, renderPage } from "../src/publicSite/pages.ts";

const output = new URL("../dist/", import.meta.url);
const assets = new URL("assets/", output);
await mkdir(assets, { recursive: true });
for (const filename of ["ceda.png", "site.css", "admin.css", "admin.js", "adminOperations.js", "adminOverview.js", "activate.js", "access.css", "access.js", "signup.js", "signin.js", "signupApi.js", "verificationSession.js", "verificationCooldown.js", "verificationScreen.js", "verifiedAccount.js", "site.js", "innovation-hero.webp"]) {
  await copyFile(new URL(`../src/publicSite/assets/${filename}`, import.meta.url), new URL(filename, assets));
}
// Keep the Admin entry self-contained when an already-running preview server
// has an older asset allowlist. Catch dependency/startup failures visibly.
const administrationRules = await readFile(new URL("../src/publicSite/assets/applicationAdministration.js", import.meta.url), "utf8");
const operationsSource = await readFile(new URL("../src/publicSite/assets/adminOperations.js", import.meta.url), "utf8");
const overviewSource = await readFile(new URL("../src/publicSite/assets/adminOverview.js", import.meta.url), "utf8");
const adminSource = await readFile(new URL("../src/publicSite/assets/admin.js", import.meta.url), "utf8");
const adminEntry = adminSource
  .replace(/^import \{[^\n]+\} from "\.\/admin(?:Operations|Overview)\.js";\r?\n/gm, "")
  .replace(/^import (\{[^\n]+\}) from ("[^\n]+");/gm, "const $1 = await import($2);");
await writeFile(new URL("admin.js", assets), `try {\n${administrationRules.replaceAll("export function", "function")}\n${operationsSource.replace(/^import[^\n]+\n/m, "").replace("export const applications", "const applications").replace("export function initializeOperations", "function initializeOperations")}\n${overviewSource.replace("export function initializeOverview", "function initializeOverview")}\n${adminEntry}\n} catch {\n  const status = document.querySelector('[data-admin-status]');\n  if (status) {\n    status.classList.remove('admin-status-silent');\n    status.textContent = 'The administrator workspace could not start. Reload the page. If this continues on localhost, restart npm run dev.';\n  }\n}\n`, "utf8");

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
      "img-src 'self' data:",
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

await writeFile(new URL("vercel.json", output), JSON.stringify({
  trailingSlash: true,
  headers: ["/signin", "/register", "/verify-email", "/activate", "/account", "/admin", "/assessor", "/support"].flatMap(path => [path, path + "/", path + "/index.html"]).map(source => ({
    source,
    headers: authHeaders,
  })),
}, null, 2) + "\n", "utf8");
