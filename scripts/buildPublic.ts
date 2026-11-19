import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { pages, renderPage } from "../src/publicSite/pages.ts";

const output = new URL("../dist/", import.meta.url);
const assets = new URL("assets/", output);
await mkdir(assets, { recursive: true });
for (const filename of ["site.css", "access.css", "access.js", "signup.js", "signin.js", "signupApi.js", "verificationSession.js", "verificationCooldown.js", "verificationScreen.js", "verifiedAccount.js", "site.js", "innovation-hero.webp"]) {
  await copyFile(new URL(`../src/publicSite/assets/${filename}`, import.meta.url), new URL(filename, assets));
}
let signupConfig: { url: string; key: string } | null = null;
if (process.env.CEDA_SIGNUP_ENABLED === "true") {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      !/^sb_publishable_[\w-]+$/.test(key)) {
    throw new Error("Signup requires a Supabase origin and an sb_publishable_ key.");
  }
  signupConfig = { url: url.origin, key };
}
await writeFile(new URL("signupConfig.js", assets), `export const signupConfig = ${JSON.stringify(signupConfig)};\n`, "utf8");
for (const [path, page] of Object.entries(pages)) {
  const directory = new URL(path.slice(1), output);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("index.html", directory), renderPage(path, page), "utf8");
}
console.log(`Built ${Object.keys(pages).length} pages in dist/.`);
