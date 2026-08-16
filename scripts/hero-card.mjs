/**
 * Shoot public/hero-card.png — the phone on the landing page.
 *
 *   node scripts/hero-card.mjs        (needs the dev server on :3000)
 *
 * WHY THIS EXISTS AS A SCRIPT. The hero was captured by hand once, and the day
 * the demo shop changed colour the largest image on the marketing site was the
 * only thing still wearing the old one — with nothing in the repo saying how it
 * had been made. Every other asset on that page is filmed by a script against
 * the real app (capture.mjs, theme-shots.mjs); this one is now too.
 *
 * IT IS A REAL BROWSER SHOT OF THE REAL CARD, not a mockup: Yassine's own
 * session, his own balance, his own client code. The frame around it is drawn
 * here rather than in the page because the landing page needs one flat image it
 * can mask and fade, and because a bezel is the one part of the picture that is
 * NOT the product.
 *
 * The card is loaded in an IFRAME on the app's own origin. A data: URL would be
 * cross-origin, the diner cookie would not travel, and the shot would be of the
 * join screen — which is exactly the failure capture.mjs documents at length.
 */
import { chromium } from "playwright-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOP = "cafe-el-manar";

/*
  Yassine — the demo customer the landing page names in its alt text, and the
  ONLY one who can be signed in as: demo.mjs gives every other seeded customer
  a well-formed hash of a PIN nobody holds, so a wrong number here does not
  fail, it silently ENROLS and shoots a brand-new card reading 10 points.
  That is how this file first shipped a hero of an empty card.
*/
const PHONE = "97 202 908";
const PIN = "2468";

/* 452×953 at DPR 2 = 904×1906, the size the page's <Image> is declared at.
   7px of bezel: enough to read as a device, not so much that it becomes the
   subject. */
const W = 452;
const H = 953;
const BEZEL = 7;

/*
  HIDE THE DEV BADGE — IN EVERY FRAME, INCLUDING THE IFRAME.

  Next's dev-tools indicator is a floating dark pill that lands on the top-right
  of the card, exactly where the notification bell is. The first version of this
  script shipped a hero with it sitting in place of the bell, on the largest
  image on the marketing site. capture.mjs has hidden it for the same reason
  since the day it was written.

  It goes on the CONTEXT, not the page: the card is loaded in an iframe, and a
  style added to the top document would never reach it.
*/
const HIDE_DEV = `
  nextjs-portal, #__next-build-watcher, [data-nextjs-toast],
  [data-nextjs-dev-tools-button], #__next-dev-tools-indicator { display: none !important; }
`;

const browser = await chromium.launch({ executablePath: CHROME });
try {
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
  });
  await ctx.addInitScript((css) => {
    const put = () => {
      const st = document.createElement("style");
      st.textContent = css;
      document.head?.appendChild(st);
    };
    if (document.head) put();
    else document.addEventListener("DOMContentLoaded", put);
  }, HIDE_DEV);
  const page = await ctx.newPage();

  /* Sign in, so the iframe below renders the card and not the join form. */
  await page.goto(`${BASE}/${SHOP}/rejoindre`, { waitUntil: "networkidle" });
  if (page.url().includes("rejoindre")) {
    await page.fill('input[name="phone"]', PHONE);
    await page.fill('input[name="pin"]', PIN);
    await page.click('button[type="submit"]');
    await page.waitForURL(`**/${SHOP}`, { timeout: 30000 }).catch(() => {});
  }

  /* Build the frame on the app's own origin. */
  await page.setContent("<body style='margin:0;background:#fff'></body>");
  await page.goto(`${BASE}/${SHOP}`, { waitUntil: "networkidle" });

  const shot = await page.evaluate(
    ({ w, h, bezel, shop }) =>
      new Promise((resolve) => {
        document.documentElement.style.background = "transparent";
        document.body.innerHTML = "";
        document.body.style.cssText = "margin:0;background:transparent;overflow:hidden";

        const frame = document.createElement("div");
        frame.id = "hero-frame";
        frame.style.cssText = [
          `width:${w}px`,
          `height:${h}px`,
          `padding:${bezel}px`,
          "box-sizing:border-box",
          /* Not black: a pure-black bezel on a white page is a hole. This is
             the page's own deep aubergine, which reads as a dark device. */
          "background:#150b26",
          "border-radius:58px",
          "overflow:hidden",
        ].join(";");

        const el = document.createElement("iframe");
        el.src = `/${shop}`;
        el.style.cssText = [
          `width:${w - bezel * 2}px`,
          `height:${h - bezel * 2}px`,
          "border:0",
          "display:block",
          "border-radius:52px",
          "background:#fff",
        ].join(";");
        el.addEventListener("load", () => setTimeout(resolve, 2500));
        frame.appendChild(el);
        document.body.appendChild(frame);
      }),
    { w: W, h: H, bezel: BEZEL, shop: SHOP },
  ).then(() => page.locator("#hero-frame").screenshot({ path: "public/hero-card.png" }));

  void shot;

  /*
    Say what was actually shot, and REFUSE a card that is obviously the
    silent-enrol failure above. The landing page's alt text quotes this
    balance; a hero showing the welcome bonus would make that text a lie and
    would sell the product on an empty card.
  */
  const text = await page.frameLocator("#hero-frame iframe").locator("body").innerText();
  const balance = Number((text.match(/(\d[\d\s,.]*)\s*points/i)?.[1] ?? "0").replace(/[\s.]/g, "").replace(",", "."));
  const shop = text.split("\n").find((l) => l.includes("El Manar")) ?? "?";

  if (balance <= 10) {
    throw new Error(
      `refusing to ship this shot: the card reads ${balance} points, which is a freshly enrolled card, not ${PHONE}'s. Check the phone and PIN.`,
    );
  }
  console.log(`wrote public/hero-card.png — ${shop.trim()}, ${balance} points`);
} finally {
  await browser.close();
}
