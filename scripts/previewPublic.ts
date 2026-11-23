import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pages } from "../src/publicSite/pages.ts";

const port = Number(process.env.PORT ?? 3000);
const output = new URL("../dist/", import.meta.url);
const files = new Map(Object.keys(pages).map((path) =>
  [path, { path: `${path.slice(1)}index.html`, type: "text/html; charset=utf-8" }]));
for (const filename of ["site.css", "access.css", "admin.css", "innovator.css", "assessor.css", "support.css", "committee.css", "accessibility.css"]) {
  files.set(`/assets/${filename}`, { path: `assets/${filename}`, type: "text/css; charset=utf-8" });
}
for (const filename of ["site.js", "accessibility.js", "telemetry.js", "reportingOverview.js", "portalCatalog.js", "notificationsDomain.js", "webFcm.js", "admin.js", "adminOperations.js", "adminOverview.js", "innovator.js", "assessor.js", "support.js", "supportOverview.js", "committee.js", "committeeOverview.js", "assessmentForm.js", "assessmentOverview.js", "activate.js", "access.js", "signup.js", "signin.js", "signupApi.js", "signupConfig.js", "verificationSession.js", "verificationCooldown.js", "verificationScreen.js", "verifiedAccount.js"]) {
  files.set(`/assets/${filename}`, { path: `assets/${filename}`, type: "text/javascript; charset=utf-8" });
}
files.set("/firebase-messaging-sw.js", { path: "firebase-messaging-sw.js", type: "text/javascript; charset=utf-8" });
files.set("/assets/innovation-hero.webp", { path: "assets/innovation-hero.webp", type: "image/webp" });
for (const name of ["innovation-story.png", "innovation-gallery.png"]) {
  files.set(`/assets/${name}`, { path: `assets/${name}`, type: "image/png" });
}
for (const name of ["story-maggie.png", "story-obakeng.png", "story-tsholefelo.png"]) {
  files.set(`/assets/${name}`, { path: `assets/${name}`, type: "image/png" });
}
files.set("/assets/ceda.png", { path: "assets/ceda.png", type: "image/png" });

createServer(async (request, response) => {
  let path: string;
  try {
    path = decodeURIComponent(request.url?.split("?")[0] ?? "/");
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Invalid URL");
    return;
  }

  // Handle Gemini AI smart assistance endpoint
  if (request.method === "POST" && path === "/api/gemini-ask") {
    let bodyText = "";
    request.on("data", chunk => { bodyText += chunk; });
    request.on("end", async () => {
      try {
        const payload = JSON.parse(bodyText || "{}");
        const question = String(payload.question || "").trim();
        const context = String(payload.context || "").trim();
        const mode = String(payload.mode || "qa").trim();

        if (!question && !context) {
          response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Question or context required" }));
          return;
        }

        const apiKey = process.env.GEMINI_API_KEY || "AQ.Ab8RN6J4Zohj40MS_3soM4NCvfcv4j4kx2CmDGHR0eljYn6bgA";
        const systemPrompt = "You are the CEDA Botswana Innovation Portal Assistant. Provide concise, friendly, and accessible answers (strictly 2 to 3 sentences maximum) designed for people using TalkBack or voice control. Ground answers in CEDA Botswana policies (innovator grant phases, youth support, eligibility, eligible sectors). Avoid markdown formatting like asterisks or bullet points.";

        const userPrompt = mode === "summary"
          ? `Summarize this CEDA page content in 2 concise sentences for a screen-reader user:\n\n${context || question}`
          : `Page context: ${context ? context.slice(0, 500) : "CEDA Innovation Portal"}\n\nUser Question: ${question}`;

        const models = ["gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-2.5-flash-lite"];
        let answer = "";

        for (const model of models) {
          try {
            const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ parts: [{ text: userPrompt }] }]
              }),
              signal: AbortSignal.timeout(6000)
            });
            if (apiRes.ok) {
              const data = await apiRes.json();
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text && text.trim()) {
                answer = text.trim();
                break;
              }
            }
          } catch {
            // Try next model
          }
        }

        if (!answer) {
          answer = "CEDA Botswana provides financial and technical backing for viable innovations across agriculture, technology, manufacturing, and services. Visit the eligibility checker to verify requirements.";
        }

        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store"
        }).end(JSON.stringify({ answer }));
      } catch (err) {
        response.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Failed to process query" }));
      }
    });
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD, POST" }).end();
    return;
  }
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
    response.writeHead(200, { "Content-Type": file.type, "Content-Length": contents.byteLength, "Cache-Control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("Build the public site before starting the preview.");
  }
}).listen(port, "127.0.0.1", () => console.log(`CEDA public site: http://127.0.0.1:${port}/`));
