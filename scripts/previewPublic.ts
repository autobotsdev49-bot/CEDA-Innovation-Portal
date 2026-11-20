import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pages } from "../src/publicSite/pages.ts";

const port = Number(process.env.PORT ?? 3000);
const output = new URL("../dist/", import.meta.url);
const files = new Map(Object.keys(pages).map((path) =>
  [path, { path: `${path.slice(1)}index.html`, type: "text/html; charset=utf-8" }]));
for (const filename of ["site.css", "access.css", "admin.css"]) {
  files.set(`/assets/${filename}`, { path: `assets/${filename}`, type: "text/css; charset=utf-8" });
}
for (const filename of ["site.js", "admin.js", "activate.js", "access.js", "signup.js", "signin.js", "signupApi.js", "signupConfig.js", "verificationSession.js", "verificationCooldown.js", "verificationScreen.js", "verifiedAccount.js"]) {
  files.set(`/assets/${filename}`, { path: `assets/${filename}`, type: "text/javascript; charset=utf-8" });
}
files.set("/assets/innovation-hero.webp", { path: "assets/innovation-hero.webp", type: "image/webp" });
files.set("/assets/ceda.png", { path: "assets/ceda.png", type: "image/png" });

createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const path = request.url?.split("?")[0] ?? "/";
  if (!files.has(path) && files.has(`${path}/`)) {
    response.writeHead(308, { Location: `${path}/` }).end();
    return;
  }
  const file = files.get(path);
  if (!file) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Page not found");
    return;
  }
  try {
    const contents = await readFile(new URL(file.path, output));
    response.writeHead(200, { "Content-Type": file.type, "Content-Length": contents.byteLength });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("Build the public site before starting the preview.");
  }
}).listen(port, "127.0.0.1", () => console.log(`CEDA public site: http://127.0.0.1:${port}/`));
