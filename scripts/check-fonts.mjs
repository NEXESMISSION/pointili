/*
  Any element asking for a weight its font does not actually ship gets a
  browser-SYNTHESISED bold, which thickens strokes until letter counters close.
  This reads the real @font-face weight ranges from document.fonts rather than a
  hardcoded list, so it stays true when app/layout.tsx changes.
*/
import { chromium } from "playwright-core";
const BASE = "http://localhost:3000";
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
let problems = 0;
for (const path of ["/", "/moi", "/cartes", "/conditions", "/confidentialite", "/owner/login", "/owner/signup"]) {
  await p.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
  await p.waitForTimeout(600);
  const res = await p.evaluate(async () => {
    await document.fonts.ready;
    // family -> list of [min,max] weight ranges the page actually loaded
    const ranges = {};
    for (const f of document.fonts) {
      const fam = f.family.replace(/["']/g, "");
      const [a, bb] = String(f.weight).split(/\s+/);
      (ranges[fam] ??= []).push([Number(a), Number(bb ?? a)]);
    }
    const covered = (fam, w) => (ranges[fam] ?? []).some(([lo, hi]) => w >= lo && w <= hi);
    const bad = new Set();
    for (const el of document.querySelectorAll("body *")) {
      if (!el.textContent?.trim() || el.children.length) continue;
      const cs = getComputedStyle(el);
      const fam = cs.fontFamily.split(",")[0].replace(/["']/g, "");
      const w = Number(cs.fontWeight);
      if (ranges[fam] && !covered(fam, w)) {
        bad.add(`${fam} @${w} ${cs.fontSize} — "${el.textContent.trim().slice(0, 34)}"`);
      }
    }
    return { ranges: Object.fromEntries(Object.entries(ranges).map(([k, v]) => [k, v.map((r) => r.join("-")).join(",")])), bad: [...bad] };
  });
  if (path === "/") console.log("loaded weight ranges:", JSON.stringify(res.ranges), "\n");
  if (res.bad.length) { problems += res.bad.length; console.log(path); res.bad.forEach((r) => console.log("  " + r)); }
}
console.log(problems ? `\n${problems} synthesised weight(s)` : "no synthesised weights on any page");
await b.close();
process.exit(problems ? 1 : 0);
