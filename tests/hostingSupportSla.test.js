import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HOSTING_SUPPORT_SLA as webSla } from "../src/publicSite/assets/portalCatalog.js";
import { HOSTING_SUPPORT_SLA as mobileSla } from "../mobile/portalCatalog.ts";
import { pages, renderPage } from "../src/publicSite/pages.ts";

test("HOSTING_SUPPORT_SLA stays synchronized between Web and Mobile catalogs with complete P1-P4 and RPO/RTO terms", () => {
  assert.deepEqual(mobileSla, webSla);
  assert.equal(webSla.tiers.length, 4);
  assert.deepEqual(
    webSla.tiers.map((tier) => tier.severity.split(/[: ]/)[0]),
    ["P1", "P2", "P3", "P4"],
  );
  for (const tier of webSla.tiers) {
    assert.ok(tier.scope.length > 10);
    assert.ok(tier.acknowledgement.length > 3);
    assert.ok(tier.containment.length > 3);
    assert.ok(tier.resolutionTurnaround.length > 3);
    assert.ok(tier.escalationOwner.length > 5);
  }
  assert.match(webSla.backupRecovery.rpo, /24 hours/i);
  assert.match(webSla.backupRecovery.rto, /4 hours/i);
  assert.match(webSla.backupRecovery.rollbackTurnaround, /15 minutes/i);
  assert.match(webSla.supportHours, /09:00 to 16:00 CAT/);
  assert.match(webSla.channels.email, /@/);
});

test("Built and rendered Web Help, Contact, and Support pages publish hosting support SLAs without inline styles", async () => {
  const routesToCheck = [
    ["dist/help/index.html", "/help/", 'id="hosting-support"'],
    ["dist/contact/index.html", "/contact/", 'id="hosting-support"'],
    ["dist/support/index.html", "/support/", 'id="support-hosting-sla"'],
  ];

  for (const [distPath, routePath, marker] of routesToCheck) {
    const rendered = renderPage(routePath, pages[routePath]);
    assert.ok(rendered.includes(marker), `${routePath} rendered output missing ${marker}`);
    assert.ok(rendered.includes("P1: Critical"), `${routePath} missing P1 SLA`);
    assert.ok(rendered.includes("4 hours"), `${routePath} missing 4h resolution turnaround`);
    assert.ok(!/\sstyle\s*=/i.test(rendered), `${routePath} must stay CSP-clean with zero inline style=`);

    const builtHtml = await readFile(new URL(`../${distPath}`, import.meta.url), "utf8");
    assert.ok(builtHtml.includes(marker), `${distPath} missing ${marker}`);
    assert.ok(builtHtml.includes(webSla.backupRecovery.rollbackTurnaround), `${distPath} missing rollback SLA`);
    assert.ok(!/\sstyle\s*=/i.test(builtHtml), `${distPath} must stay CSP-clean with zero inline style=`);
  }
});

test("Mobile Support Playbook, Innovator Help, and Operations doc all surface consistent hosting support SLAs", async () => {
  const [supportWorkspace, innovatorHelp, opsDoc] = await Promise.all([
    readFile(new URL("../mobile/SupportWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../mobile/InnovatorMoreScreens.tsx", import.meta.url), "utf8"),
    readFile(new URL("../Development Pack/docs/Security Accessibility and Operations.md", import.meta.url), "utf8"),
  ]);

  assert.ok(supportWorkspace.includes('import { HOSTING_SUPPORT_SLA } from "./portalCatalog";'));
  assert.ok(supportWorkspace.includes("Hosting support & SLAs"));
  assert.ok(supportWorkspace.includes("HOSTING_SUPPORT_SLA.tiers.map"));

  assert.ok(innovatorHelp.includes("HOSTING_SUPPORT_SLA"));
  assert.ok(innovatorHelp.includes("Fault remediation & turnaround times"));

  assert.ok(opsDoc.includes("## Hosting support, fault remediation & turnaround SLAs"));
  assert.ok(opsDoc.includes("P1: Critical"));
  assert.ok(opsDoc.includes("15 minutes"));
  assert.ok(opsDoc.includes("4 hours"));
});
