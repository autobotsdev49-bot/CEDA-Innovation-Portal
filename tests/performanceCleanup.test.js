import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("Supabase migrations use unique version prefixes with no scratch payload leftovers", async () => {
  const entries = await readdir(new URL("../supabase/migrations/", import.meta.url));
  assert.equal(entries.includes(".migration_payload.json"), false);

  const sqlFiles = entries.filter((name) => name.endsWith(".sql")).sort();
  assert.ok(sqlFiles.length >= 25);

  const seenPrefixes = new Map();
  for (const name of sqlFiles) {
    const match = /^(\d{14})/.exec(name);
    assert.ok(match, `Migration missing 14-digit timestamp prefix: ${name}`);
    const prefix = match[1];
    assert.equal(
      seenPrefixes.has(prefix),
      false,
      `Duplicate migration version prefix ${prefix}: ${seenPrefixes.get(prefix)} vs ${name}`,
    );
    seenPrefixes.set(prefix, name);
  }
});

test("Built dist/vercel.json sets CDN cache headers on static/public assets and no-store on config & protected routes", async () => {
  const raw = await readFile(new URL("../dist/vercel.json", import.meta.url), "utf8");
  const config = JSON.parse(raw);
  assert.ok(Array.isArray(config.headers));

  const headerMap = new Map(config.headers.map((rule) => [rule.source, rule.headers]));
  const getHeader = (source, key) =>
    headerMap.get(source)?.find((item) => item.key.toLowerCase() === key.toLowerCase())?.value || "";

  assert.match(getHeader("/", "Cache-Control"), /^public, max-age=\d+, s-maxage=\d+/);
  assert.match(getHeader("/help/", "Cache-Control"), /^public, max-age=\d+, s-maxage=\d+/);
  assert.match(getHeader("/assets/(.*)", "Cache-Control"), /^public, max-age=3600, s-maxage=86400/);
  assert.equal(getHeader("/assets/signupConfig.js", "Cache-Control"), "no-store");

  // Ensure signupConfig no-store appears after /assets/(.*) so Vercel overrides Cache-Control cleanly.
  const idxAssets = config.headers.findIndex((r) => r.source === "/assets/(.*)");
  const idxConfig = config.headers.findIndex((r) => r.source === "/assets/signupConfig.js");
  assert.ok(idxAssets >= 0 && idxConfig > idxAssets);

  for (const protectedRoute of ["/signin/", "/register/", "/verify-email/", "/activate/", "/account/", "/admin/", "/assessor/", "/support/", "/committee/"]) {
    assert.equal(getHeader(protectedRoute, "Cache-Control"), "no-store");
    assert.equal(getHeader(protectedRoute, "Referrer-Policy"), "no-referrer");
    assert.match(getHeader(protectedRoute, "Content-Security-Policy"), /frame-ancestors 'none'/);
  }
});

test("All Web portals wire anonymized telemetry and Web + Mobile workspaces avoid residual demo data and background polling", async () => {
  const [
    adminJs,
    assessorJs,
    supportJs,
    innovatorJs,
    committeeJs,
    adminOverviewJs,
    adminInsightsTsx,
    assessorCaseTsx,
    innovatorWorkspaceTsx,
    supportWorkspaceTsx,
  ] = await Promise.all([
    readFile(new URL("../src/publicSite/assets/admin.js", import.meta.url), "utf8"),
    readFile(new URL("../src/publicSite/assets/assessor.js", import.meta.url), "utf8"),
    readFile(new URL("../src/publicSite/assets/support.js", import.meta.url), "utf8"),
    readFile(new URL("../src/publicSite/assets/innovator.js", import.meta.url), "utf8"),
    readFile(new URL("../src/publicSite/assets/committee.js", import.meta.url), "utf8"),
    readFile(new URL("../src/publicSite/assets/adminOverview.js", import.meta.url), "utf8"),
    readFile(new URL("../mobile/AdminInsights.tsx", import.meta.url), "utf8"),
    readFile(new URL("../mobile/AssessorCaseView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../mobile/InnovatorWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../mobile/SupportWorkspace.tsx", import.meta.url), "utf8"),
  ]);

  for (const [name, src] of [
    ["admin.js", adminJs],
    ["assessor.js", assessorJs],
    ["support.js", supportJs],
    ["innovator.js", innovatorJs],
    ["committee.js", committeeJs],
  ]) {
    assert.match(src, /initPortalTelemetry/, `${name} missing non-blocking initPortalTelemetry wiring`);
  }

  assert.match(innovatorJs, /if\s*\(\s*optimusPanel\.hidden\s*\|\|\s*document\.hidden\s*\)/);
  assert.match(assessorJs, /document\.hidden/);
  assert.match(supportJs, /document\.visibilityState\s*===\s*"visible"/);
  assert.match(committeeJs, /document\.visibilityState\s*===\s*"visible"/);

  assert.doesNotMatch(adminOverviewJs, /\bdemoMatters\b/);
  assert.doesNotMatch(adminOverviewJs, /\bbaselineActivityEvents\b/);
  assert.doesNotMatch(adminOverviewJs, /\bactive:\s*24\b/);
  assert.doesNotMatch(adminOverviewJs, /120\s*\+\s*\(\(i\s*\*\s*37\)/);
  assert.doesNotMatch(adminInsightsTsx, /\bactivityRoles\b/);

  for (const [name, src] of [
    ["AssessorCaseView.tsx", assessorCaseTsx],
    ["InnovatorWorkspace.tsx", innovatorWorkspaceTsx],
    ["SupportWorkspace.tsx", supportWorkspaceTsx],
  ]) {
    assert.match(src, /AppState/, `${name} missing AppState background pause for polling timers`);
  }
});

test("Built dist/assets/*.js pass syntax check, Optimus launcher is visible, modals stay high-contrast light, Support boilerplate is removed, and zero en/em dashes remain in UI copy", async () => {
  const assetsDir = new URL("../dist/assets/", import.meta.url);
  const assetFiles = (await readdir(assetsDir)).filter((name) => name.endsWith(".js"));
  assert.ok(assetFiles.includes("admin.js"));

  await Promise.all(
    assetFiles.map((file) =>
      execFileAsync(process.execPath, ["--check", fileURLToPath(new URL(file, assetsDir))])
    )
  );

  const [
    distAdminJs,
    distSupportHtml,
    innovatorCss,
    innovatorJs,
    mobileInnovatorWorkspace,
    frostedGlassTsx,
    adminCss,
    assessorCss,
    supportTs,
    supportJs,
  ] = await Promise.all([
    readFile(new URL("../dist/assets/admin.js", import.meta.url), "utf8"),
    readFile(new URL("../dist/support/index.html", import.meta.url), "utf8"),
    readFile(new URL("../src/publicSite/assets/innovator.css", import.meta.url), "utf8"),
    readFile(new URL("../src/publicSite/assets/innovator.js", import.meta.url), "utf8"),
    readFile(new URL("../mobile/InnovatorWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../mobile/FrostedGlass.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/publicSite/assets/admin.css", import.meta.url), "utf8"),
    readFile(new URL("../src/publicSite/assets/assessor.css", import.meta.url), "utf8"),
    readFile(new URL("../src/publicSite/support.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/publicSite/assets/support.js", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(distAdminJs, /^\s*export\s+/m);
  assert.match(innovatorCss, /\.innovator-optimus-launcher[\s\S]*background:\s*var\(--innovator-accent,\s*#9a3d2b\)/);
  assert.match(innovatorJs, /querySelector\("\.innovator-shell"\)/);
  assert.match(mobileInnovatorWorkspace, /optimusFloatingPill:\s*\{[\s\S]*backgroundColor:\s*adminStyleColors\.rust/);

  assert.match(frostedGlassTsx, /tint="light"/);
  assert.match(adminCss, /\.admin-shell\s+\.admin-dialog\s*\{[\s\S]*color-scheme:\s*light/);
  assert.match(assessorCss, /\.assessor-thread\s*\{[\s\S]*color-scheme:\s*light/);

  for (const removedBanner of [
    "SUPPORT WORKSPACE",
    "SUPPORT QUEUE &amp; MULTI-USER LIVE CHAT",
    "PERSONAL METRICS &amp; ONLINE CHAT ANALYTICS",
    "Multi-user live chat capacity: 0 of",
    "Quick view of workload, urgency",
  ]) {
    assert.equal(distSupportHtml.includes(removedBanner), false, `Removed text still present: ${removedBanner}`);
    assert.equal(supportTs.includes(removedBanner), false, `Removed text still in support.ts: ${removedBanner}`);
    assert.equal(supportJs.includes(removedBanner), false, `Removed text still in support.js: ${removedBanner}`);
  }

  for (const dirRel of ["../src/publicSite", "../src/publicSite/assets", "../mobile"]) {
    const dirUrl = new URL(`${dirRel}/`, import.meta.url);
    const files = await readdir(dirUrl, { withFileTypes: true });
    for (const entry of files) {
      if (!entry.isFile() || !/\.(ts|tsx|js)$/.test(entry.name)) continue;
      const body = await readFile(new URL(entry.name, dirUrl), "utf8");
      assert.doesNotMatch(body, /[\u2013\u2014]/, `Found en/em dash in ${dirRel}/${entry.name}`);
    }
  }
});
