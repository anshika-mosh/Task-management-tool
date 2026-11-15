// Renders docs/diagrams/diagrams.mjs to PNG files in docs/diagrams/png using Mermaid inside your installed Chrome.
//   node docs/render-diagrams.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { diagrams } from "./diagrams/diagrams.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "diagrams", "png");
fs.mkdirSync(out, { recursive: true });
const mermaidJs = path.join(here, "..", "node_modules", "mermaid", "dist", "mermaid.min.js");

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || "chrome" });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1400, height: 900 } });
await page.setContent(`<html><body style="margin:0;background:#fff"><div id="host" style="display:inline-block;padding:16px;background:#fff"></div></body></html>`);
await page.addScriptTag({ path: mermaidJs });
await page.evaluate(() =>
  window.mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    securityLevel: "loose",
    fontFamily: "Segoe UI, Arial, sans-serif",
    themeVariables: {
      primaryColor: "#eef1ff", primaryBorderColor: "#4f6bed", primaryTextColor: "#0f172a", lineColor: "#64748b",
      secondaryColor: "#e8f7f1", tertiaryColor: "#fff7e6", fontSize: "15px", noteBkgColor: "#fff7e6", noteTextColor: "#0f172a",
    },
    flowchart: { htmlLabels: true, curve: "basis", padding: 8, nodeSpacing: 22, rankSpacing: 32, useMaxWidth: false, wrappingWidth: 170 },
    state: { useMaxWidth: false },
    sequence: { mirrorActors: false, width: 118, actorMargin: 22, messageMargin: 30, boxMargin: 6, useMaxWidth: false, wrap: true },
    er: { useMaxWidth: false, entityPadding: 8, minEntityWidth: 90, fontSize: 14 },
  }),
);

for (const [name, source] of Object.entries(diagrams)) {
  const svg = await page.evaluate(async ({ name, source }) => {
    const { svg } = await window.mermaid.render("d_" + name, source);
    document.getElementById("host").innerHTML = svg;
    return svg.length;
  }, { name, source });
  const el = page.locator("#host svg").first();
  await el.screenshot({ path: path.join(out, `${name}.png`), omitBackground: false });
  console.log("rendered", name, `${svg} chars`);
}
await browser.close();
