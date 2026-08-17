/**
 * Film the REAL app for the landing page.
 *
 *   node scripts/capture.mjs
 *
 * Not a re-creation. Playwright drives the actual product against the demo café
 * (35 customers, ~90 days of history) and records what happens, so every pixel
 * on the marketing page is the software doing the thing it claims to do.
 *
 * ONE CONTEXT PER AUDIENCE, ONE PAGE PER CLIP.
 *
 * Playwright writes one video per PAGE, so a single context produces many clips.
 * That matters for a reason that cost a whole run: Supabase rotates the refresh
 * token every time it is used, so a saved storageState replayed into six
 * separate contexts is spent after the first — every later clip silently filmed
 * the LOGIN SCREEN instead of the till, at a convincing 44 KB apiece. One live
 * session, many pages, no replay.
 *
 * THE SHOOT USES ITS OWN CUSTOMER, BY PHONE NUMBER.
 *
 * The till is driven with a phone number rather than a 4-char code, because that
 * is the path a cashier takes with somebody who has not shown their card. The
 * number belongs to an account this script creates and deletes — filming a real
 * cardholder would publish a real person's phone number on the landing page.
 *
 * Output → public/demo/  (a .webm plus a .png and .webp poster per clip)
 */
import { chromium } from "playwright-core";
import { mkdir, rm, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "./db.mjs";

const run = promisify(execFile);

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FFMPEG =
  process.env.FFMPEG ??
  `${process.env.LOCALAPPDATA}/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe`;
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "public/demo";
const TMP = "scratch/capture-tmp";

const OWNER = { email: "elmanar@pointili.online", password: process.env.DEMO_PASSWORD ?? "ElManar2026" };
const SHOP = "cafe-el-manar";
const PHONE_SIZE = { width: 390, height: 844 };

/* The shoot's own customer. Created, filmed, then deleted. */
const NUM = `2${String(Date.now()).slice(-7)}`;
const PIN = "4271";

await mkdir(OUT, { recursive: true });
await rm(TMP, { recursive: true, force: true });
await mkdir(TMP, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });

/*
  Injected into every page.

  1 · Next's dev indicator is a floating badge that sits on the nav — it was
      covering "Réglages" — and would be in every frame of a marketing asset.

  2 · A CURSOR AND A CLICK RING. Playwright moves a real mouse and dispatches
      real events, but the pointer is invisible to the recorder, so a viewer sees
      fields fill and panels open with no idea what was touched. A soft dot
      follows the pointer and a red ring blooms where it presses, which is the
      difference between watching a demo and being shown one.
*/
const OVERLAY = `
  nextjs-portal, #__next-build-watcher, [data-nextjs-toast],
  [data-nextjs-dev-tools-button], #__next-dev-tools-indicator { display: none !important; }
`;

const CURSOR = `(() => {
  const put = () => {
    if (!document.body || document.getElementById("__shoot_cursor")) return;
    const dot = document.createElement("div");
    dot.id = "__shoot_cursor";
    dot.style.cssText =
      "position:fixed;z-index:2147483647;pointer-events:none;width:20px;height:20px;" +
      "margin:-10px 0 0 -10px;border-radius:50%;background:rgba(255,255,255,.22);" +
      "border:2px solid rgba(255,255,255,.92);box-shadow:0 2px 12px rgba(0,0,0,.55);" +
      "opacity:0;transition:transform .08s ease,opacity .2s ease;left:0;top:0";
    document.body.appendChild(dot);

    addEventListener("mousemove", (e) => {
      dot.style.opacity = "1";
      dot.style.left = e.clientX + "px";
      dot.style.top = e.clientY + "px";
    }, true);

    addEventListener("pointerdown", (e) => {
      dot.style.transform = "scale(.65)";
      const ring = document.createElement("div");
      ring.style.cssText =
        "position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;" +
        "width:16px;height:16px;margin:-8px 0 0 -8px;border:3px solid #ff3b5c;" +
        "left:" + e.clientX + "px;top:" + e.clientY + "px";
      document.body.appendChild(ring);
      ring.animate(
        [{ transform: "scale(1)", opacity: .95 }, { transform: "scale(4.2)", opacity: 0 }],
        { duration: 520, easing: "cubic-bezier(.2,.8,.3,1)" },
      ).onfinish = () => ring.remove();
    }, true);

    addEventListener("pointerup", () => { dot.style.transform = "scale(1)"; }, true);
  };
  if (document.body) put();
  else document.addEventListener("DOMContentLoaded", put);
})();`;

async function context({ record = true, retina = false } = {}) {
  const ctx = await browser.newContext({
    viewport: PHONE_SIZE,
    ...(retina ? { deviceScaleFactor: 2 } : {}),
    ...(record ? { recordVideo: { dir: TMP, size: PHONE_SIZE } } : {}),
  });
  await ctx.addInitScript((css) => {
    const put = () => {
      const st = document.createElement("style");
      st.textContent = css;
      document.head?.appendChild(st);
    };
    if (document.head) put();
    else document.addEventListener("DOMContentLoaded", put);
  }, OVERLAY);
  await ctx.addInitScript(CURSOR);
  return ctx;
}

/** name → { path, lead } once the context has closed. */
const pending = [];
/** page → the ms at which recording began, so the white lead-in can be cut. */
const born = new WeakMap();
/** page → seconds of blank page before the app first painted. */
const lead = new WeakMap();

/**
 * Navigate and mark where the picture actually starts.
 *
 * A recorded page opens on a blank white document, and that white frame is what
 * a looping <video> shows the instant it wraps — so it reads as a white flash at
 * the END of the clip. Measuring the gap here means it can be cut exactly,
 * rather than guessing a fixed offset that is wrong for every clip.
 */
/*
  NETWORKIDLE IS A PREFERENCE HERE, NOT A REQUIREMENT.

  The card screen fires a server action AFTER paint — components/MarkOpened,
  which is what moves the "you have seen this" mark now that doing it during
  render was found to run several times per view. A page that POSTs once it has
  painted may never hand Playwright a 500ms window with no traffic, and on the
  dev server the HMR socket makes that worse. The whole suite died on that one
  navigation with every clip already filmed and none of them yet written.

  So: ask for idle, accept quiet. The fixed pause below is what the shot has
  always actually relied on, and a page that painted but kept talking is
  perfectly filmable.
*/
async function settle(page, url) {
  await page
    .goto(url, { waitUntil: "networkidle", timeout: 20000 })
    .catch(() => page.goto(url, { waitUntil: "domcontentloaded" }));
}

async function ready(page, url) {
  await settle(page, url);
  await page.waitForTimeout(450);
  lead.set(page, (Date.now() - born.get(page)) / 1000);
}

/** Clips whose flow threw. Their footage is discarded, not published. */
const failed = [];

/*
  A FAILED FLOW MUST NOT REPLACE A GOOD CLIP.

  This used to log the error and carry on writing the video anyway, so a flow
  that died waiting for a dialog still produced a plausible file — 25 seconds of
  a till stuck on "Non autorisé", 565 KB, indistinguishable from a good clip in
  a directory listing. It reached the point of being committed. Twice now the
  only thing standing between a broken asset and the landing page was somebody
  happening to open it.

  Now a thrown flow drops the footage on the floor, the previous clip survives
  untouched, and the shoot exits non-zero naming what broke.
*/
async function clip(ctx, name, flow) {
  console.log(`filming: ${name}`);
  const page = await ctx.newPage();
  born.set(page, Date.now());
  let ok = true;
  try {
    await flow(page);
  } catch (e) {
    ok = false;
    failed.push(`${name}: ${String(e.message).split("\n")[0].slice(0, 90)}`);
    console.log(`  ! ${name} FAILED — keeping the previous clip`);
  }
  const video = page.video();
  const cut = Math.max(0, (lead.get(page) ?? 1.2) - 0.15);
  await page.close();
  if (video && ok) pending.push({ from: await video.path(), name, cut });
}

/** Type like a person, so the clip does not look like a script. */
async function human(page, selector, text, delay = 140) {
  /* through tap(), because focusing a field below the fold teleports too */
  await tap(page, page.locator(selector).first());
  for (const ch of text) {
    await page.type(selector, ch, { delay: 0 });
    await page.waitForTimeout(delay);
  }
}

const beat = (page, ms = 900) => page.waitForTimeout(ms);

/**
 * Scroll the way a thumb does, not the way a script does.
 *
 * page.mouse.wheel(0, 380) dispatches ONE wheel event carrying the whole
 * distance, and the browser applies it in a single compositor frame. On a 25fps
 * recording that is a full-page teleport between two frames — the header is
 * there, then it is gone — which is exactly what reads as "glitching" when the
 * clip plays. Nothing is corrupt; the camera faithfully recorded a jump.
 *
 * This walks the same distance in ~40ms steps, eased in and out so it starts
 * and settles like a flick rather than a machine, giving the recorder a frame
 * for every few pixels of travel.
 */
async function glide(page, distance, ms = 1200) {
  const steps = Math.max(14, Math.round(ms / 40));
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  let done = 0;
  for (let i = 1; i <= steps; i++) {
    const target = Math.round(distance * ease(i / steps));
    const step = target - done;
    done = target;
    if (step) await page.mouse.wheel(0, step);
    await page.waitForTimeout(ms / steps);
  }
}

/**
 * Click something, having first travelled to it.
 *
 * Playwright's own .click() scrolls the target into view when it is below the
 * fold — instantly, in one compositor frame, exactly the teleport that glide()
 * exists to avoid. Reaching the element under our own power first means the
 * click itself has nothing left to scroll, so the picture stays continuous.
 *
 * The element is parked around 45% down the screen rather than at the very
 * edge, so the viewer sees what was pressed and what it sits among.
 */
async function tap(page, locator, ms = 850) {
  const box = await locator.boundingBox().catch(() => null);
  if (box) {
    const travel = Math.round(box.y + box.height / 2 - PHONE_SIZE.height * 0.45);
    if (Math.abs(travel) > 24) {
      await glide(page, travel, ms);
      await beat(page, 320);
    }
  }
  await locator.click();
}

/** Open the till and find our customer BY PHONE — the walk-in path. */
async function findByPhone(page) {
  await ready(page, `${BASE}/owner`);
  await page.locator('input[name="customer"]').waitFor({ timeout: 20000 });
  await beat(page, 600);
  await human(page, 'input[name="customer"]', NUM, 130);
  await beat(page, 400);
  await tap(page, page.locator('button:has-text("Chercher")'));
  /* .first(): the install prompt is a dialog too, and a strict locator that
     matches two elements throws rather than waiting for the one we mean. */
  await page.locator('[role="dialog"]').first().waitFor({ timeout: 20000 });
  await beat(page, 700);
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  1 · THE CUSTOMER SIGNS UP — this is who every other clip is about     */
/* ══════════════════════════════════════════════════════════════════════ */

const guest = await context();
await clip(guest, "signup", async (page) => {
  await ready(page, `${BASE}/${SHOP}/rejoindre`);
  await beat(page, 700);
  await human(page, 'input[name="phone"]', NUM, 125);
  await beat(page, 250);
  await human(page, 'input[name="pin"]', PIN, 210);
  await beat(page, 250);
  await human(page, 'input[name="name"]', "Karim", 145);
  await beat(page, 450);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**/${SHOP}`, { timeout: 25000 }).catch(() => {});
  await beat(page, 3200); // the card arriving, welcome bonus and all
});
await guest.close();

/*
  Give them a realistic history before the till clips.

  A brand-new card holds only the welcome bonus: the till would show a balance of
  10 and nothing affordable in the boutique, which is the opposite of the point.
  Credited through the real RPC, so the points arrive exactly as at the counter.
*/
const { createClient } = await import("@supabase/supabase-js");
const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: biz } = await svc.from("businesses").select("id").eq("slug", SHOP).single();
await svc.rpc("credit_points", { p_business_id: biz.id, p_phone: `+216${NUM}`, p_amount_tnd: 195 });

/*
  FROM HERE ON, A CUSTOMER EXISTS IN THE REAL DATABASE.

  The teardown at the bottom of this file only runs if the script reaches it,
  and it does not: a failed sign-in calls process.exit(1) fifteen lines below,
  which skipped the cleanup entirely and left the account, its points and its
  card sitting in production — quietly inflating the very analytics the landing
  page then films. Three of them accumulated before anyone looked.

  Registering it here means the customer is removed however this script ends:
  cleanly, by throw, or by exit.
*/
let cleaned = false;
async function removeShootCustomer() {
  if (cleaned) return;
  cleaned = true;
  const norm = `+216${NUM}`;
  for (const t of ["loyalty_redemptions", "stamp_rewards", "loyalty_stamps"]) {
    await svc.from(t).delete().eq("phone", norm);
  }
  await svc.from("points_ledger").delete().eq("customer_phone", norm);
  await svc.from("diner_cafes").delete().eq("phone", norm);
  await svc.from("pin_attempts").delete().eq("phone", norm);
  await svc.from("accounts").delete().eq("phone", norm);
  console.log("cleaned up the shoot's customer");
}

/* process.exit() does not await, so bail out through here instead. */
async function die(code, ...lines) {
  for (const l of lines) console.error(l);
  await removeShootCustomer().catch((e) => console.error(`cleanup failed: ${e.message}`));
  await browser.close().catch(() => {});
  process.exit(code);
}

/* ══════════════════════════════════════════════════════════════════════ */
/*  2 · THE OWNER — one signed-in context, one page per clip              */
/* ══════════════════════════════════════════════════════════════════════ */

const owner = await context();
{
  const page = await owner.newPage();
  /*
    networkidle, NOT domcontentloaded. The form posts through a React server
    action, so filling and clicking before hydration types into a live input and
    presses a button wired to nothing — the click "succeeds", the page never
    navigates, and the shoot runs on with no session.
  */
  /*
    Twice, because a single attempt is not evidence of anything.

    Signing in repeatedly while iterating on the shoot runs into Supabase's own
    auth rate limit, and a cold dev server can take longer than the timeout to
    compile the route — both transient, both indistinguishable from a wrong
    password when every error is swallowed with .catch(() => {}). A second go
    after a pause separates "try again" from "the password changed", and the
    form's own message is read back rather than guessed at.
  */
  let why = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
    if (!page.url().includes("/login")) break;

    await page.fill('input[name="email"]', OWNER.email);
    await page.fill('input[name="password"]', OWNER.password);
    await page.locator('button[type="submit"]').click({ timeout: 25000 }).catch(() => {});
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 }).catch(() => {});
    if (!page.url().includes("/login")) break;

    why = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
    if (attempt === 1) {
      console.log(`  sign-in did not take — retrying once in 6s`);
      await page.waitForTimeout(6000);
    }
  }
  if (page.url().includes("/login")) {
    await die(
      1,
      `could not sign in as ${OWNER.email} — nothing to film.`,
      why ? `the page said: ${why}` : "the page gave no reason.",
      "If the password changed: DEMO_PASSWORD=… node scripts/capture.mjs",
    );
  }
  /*
    PROVE THE SESSION BEFORE FILMING, not during.

    Landing off /login means the page renders, which is a weaker claim than it
    looks: the layout reads the session server-side, but a SERVER ACTION posted
    a moment later can still arrive with the cookie Supabase just rotated away.
    That is not hypothetical — the till rendered perfectly, complete with the
    café name, and then answered the very first search with "Non autorisé",
    producing 25 seconds of unusable footage.

    So: load the till, wait for it to settle, and only then let the clips run.
  */
  await settle(page, `${BASE}/owner`);
  await page.locator('input[name="customer"]').waitFor({ timeout: 20000 });
  await page.waitForTimeout(1800);
  console.log("signed in — every owner clip shares this session\n");
  await page.close();
}

await clip(owner, "credit", async (page) => {
  await findByPhone(page);
  await human(page, 'input[name="amount"]', "12", 190);
  await beat(page, 450);
  await tap(page, page.locator('button:has-text("Créditer")'));
  await beat(page, 3400);
});

await clip(owner, "stamp", async (page) => {
  await findByPhone(page);
  const stamp = page.locator('button:has-text("tampon")').first();
  if (!(await stamp.count())) throw new Error("stamps are off for this café");
  await tap(page, stamp);
  await beat(page, 3200);
});

await clip(owner, "analyses", async (page) => {
  await ready(page, `${BASE}/owner/analyses`);
  await beat(page, 1400);
  for (let i = 0; i < 3; i++) { await glide(page, 380, 1300); await beat(page, 900); }
});

await clip(owner, "reglages", async (page) => {
  await ready(page, `${BASE}/owner/reglages`);
  await beat(page, 1100);
  const row = page.locator('button:has-text("Les points")').first();
  if (await row.count()) { await tap(page, row); await beat(page, 2400); }
  else { await glide(page, 480, 1500); await beat(page, 1200); }
});

await clip(owner, "qr", async (page) => {
  await ready(page, `${BASE}/owner/qr`);
  await beat(page, 1400);
  await glide(page, 420, 1400);
  await beat(page, 1200);
});

await clip(owner, "correction", async (page) => {
  await findByPhone(page);
  const more = page.locator('button:has-text("Corriger")').first();
  if (!(await more.count())) throw new Error("no correction control on the sheet");
  await tap(page, more);
  await beat(page, 1900);
  await glide(page, 240, 1100);
  await beat(page, 1600);
});

/* one retina still, in the same live session */
{
  const page = await owner.newPage();
  await settle(page, `${BASE}/owner`);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/till.png` });
  console.log(`  ✓ ${OUT}/till.png`);
  await page.close();
}

/*
  THE WALK-IN SHEET — a customer who has no account at all.

  No clip passes through this state, because the shoot signs its own customer up
  before it films anything. But it is the single best thing the till does: type
  a number nobody has registered and it opens them anyway, saying "ses points
  l'attendent", so a cashier never has to turn someone away for not being a
  member yet. scripts/posts.mjs builds a carousel slide out of it.

  Nothing is created here. The walk-in path mints no account until the person
  signs up themselves (see scripts/test-walkin.mjs), and this only searches.
*/
{
  const page = await owner.newPage();
  const unknown = `2${String(Date.now()).slice(-7)}`;
  await settle(page, `${BASE}/owner`);
  await page.locator('input[name="customer"]').waitFor({ timeout: 20000 });
  await page.fill('input[name="customer"]', unknown);
  await page.locator('button:has-text("Chercher")').click();
  await page.locator('[role="dialog"]').waitFor({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1100);

  /* Remove the dev overlay rather than style it away: the round "N" button
     renders in a shadow root that a document stylesheet cannot reach, and it
     sat in the corner of a finished marketing slide. */
  await page.evaluate(() => {
    document
      .querySelectorAll(
        "nextjs-portal, #__next-build-watcher, [data-nextjs-toast], [data-nextjs-dev-tools-button], #__next-dev-tools-indicator",
      )
      .forEach((el) => el.remove());
  });

  const txt = await page.locator('[role="dialog"]').innerText().catch(() => "");
  if (/première visite/i.test(txt)) {
    await page.screenshot({ path: `${OUT}/walkin.png` });
    console.log(`  ✓ ${OUT}/walkin.png`);
  } else {
    console.log("  ! walkin.png skipped — the till did not show the walk-in state");
  }
  await page.close();
}
await owner.close();

/* ══════════════════════════════════════════════════════════════════════ */
/*  3 · BACK TO THE CUSTOMER, now that they have points                   */
/* ══════════════════════════════════════════════════════════════════════ */

const diner = await context();
{
  const page = await diner.newPage();
  await settle(page, `${BASE}/moi`);
  await page.fill('input[name="phone"]', NUM);
  await page.fill('input[name="pin"]', PIN);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2600);
  /*
    SPEND THE CELEBRATION BEFORE FILMING THE CARD.

    The shoot credits 195 TND, which carries this customer past several reward
    thresholds at once — so the first time the card is opened it is covered,
    correctly, by "Récompense débloquée !". The poster for the clip called
    "carte" was therefore a full-screen overlay with no card visible on it.

    Opening it once here lets that play to an empty room. The mark only moves
    from the browser, after paint (components/MarkOpened), so this waits for
    the action to land rather than for the page.
  */
  await settle(page, `${BASE}/${SHOP}`);
  await page.waitForTimeout(3000);
  await page.close();
}

await clip(diner, "carte", async (page) => {
  await ready(page, `${BASE}/${SHOP}`);
  await beat(page, 1500);
  await glide(page, 420, 1400);
  await beat(page, 1200);
});

await clip(diner, "redeem", async (page) => {
  await ready(page, `${BASE}/${SHOP}/boutique`);
  await beat(page, 1300);
  /*
    PICK, THEN COMMIT, THEN CONFIRM — three steps, because that is what the
    screen does now.

    This used to press `form button[type="submit"]`, which stopped existing
    when the boutique became pick-then-commit: the commit button is type=button
    (it opens the question) and the submit lives inside the confirmation. The
    clip therefore threw "nothing affordable to buy" on a card holding 205
    points, and the landing page kept showing a redeem from an older UI.

    Filming the confirmation is not a cost — it is the honest picture: spending
    a month of coffees asks first.
  */
  const buy = page.locator('form[data-redeem] button:has-text("Échanger")').first();
  if (!(await buy.count()) || !(await buy.isEnabled())) {
    /*
      Top them up and try once more, rather than failing the clip.

      What the customer can afford at this point is the sum of everything the
      till clips did to them — a credit here, a correction there — and any one
      of those changing means the redeem clip silently keeps its previous
      version. A marketing page showing a UI that no longer exists is a worse
      outcome than a shoot that tops up its own actor.
    */
    await svc.rpc("credit_points", { p_business_id: biz.id, p_phone: `+216${NUM}`, p_amount_tnd: 120 });
    await ready(page, `${BASE}/${SHOP}/boutique`);
    await beat(page, 1200);
    if (!(await buy.count()) || !(await buy.isEnabled())) throw new Error("nothing affordable to buy");
  }
  await tap(page, buy);
  await beat(page, 1100);
  await tap(page, page.locator('button:has-text("Oui, échanger")').first());
  await beat(page, 3200);
});

await clip(diner, "wallet", async (page) => {
  await ready(page, `${BASE}/cartes`);
  await beat(page, 1800);
  await glide(page, 300, 1200);
  await beat(page, 1200);
});

await diner.close();
await browser.close();

/* ══════════════════════════════════════════════════════════════════════ */
/*  4 · CUT THE WHITE LEAD-IN, so the loop is seamless                    */
/* ══════════════════════════════════════════════════════════════════════ */

if (!existsSync(FFMPEG)) {
  console.log(`\nffmpeg not found at ${FFMPEG} — clips keep their white opening.`);
  for (const { from, name } of pending) if (existsSync(from)) await rename(from, `${OUT}/${name}.webm`);
} else {
  for (const { from, name, cut } of pending) {
    if (!existsSync(from)) continue;
    const to = `${OUT}/${name}.webm`;
    try {
      /* Re-encoded, not stream-copied: a copy can only cut at a keyframe, which
         leaves part of the white opening behind. */
      await run(FFMPEG, ["-y", "-ss", String(cut), "-i", from, "-c:v", "libvpx", "-b:v", "900k", "-an", to]);

      /* The poster IS frame 0 of the clip it stands in for.

         It used to be a screenshot taken at the END of the flow, which meant a
         visitor saw the success sheet, then watched the video snap back to the
         keypad the moment it started — a jump that reads as a glitch. Pulling
         the first frame out of the finished file means the still and the first
         moment of playback are the same pixels. */
      await run(FFMPEG, ["-y", "-i", to, "-frames:v", "1", "-update", "1", `${OUT}/${name}.png`]);

      /*
        AND AGAIN AS WEBP, WHICH IS THE ONE THE PAGE ACTUALLY LOADS.

        Everywhere else on this site an image goes through next/image, which
        negotiates WebP by itself. A <video poster> does not: the attribute
        takes a raw URL and ships exactly the bytes it names. The nine PNGs
        were 1,240 KB between them and 193 KB as WebP — on the frame every
        visitor downloads whether or not the clip ever plays.

        The PNG stays: it is what ffmpeg can write, it is the source this
        converts, and scripts/posts.mjs still reads one of them.
      */
      const { default: sharp } = await import("sharp");
      const webp = await sharp(`${OUT}/${name}.png`).webp({ quality: 82 }).toFile(`${OUT}/${name}.webp`);

      console.log(
        `  ✓ ${to}  (cut ${cut.toFixed(1)}s of blank opening · poster ${(webp.size / 1024).toFixed(0)} KB webp)`,
      );
    } catch {
      await rename(from, to);
      console.log(`  ✓ ${to}  (uncut — ffmpeg failed)`);
    }
  }
}
await rm(TMP, { recursive: true, force: true });

/*
  Stamp the shoot.

  Every clip keeps its filename between shoots, so a browser that already has
  credit.webm has no reason to ask for it again — you re-record, deploy, and
  still watch last week's footage. The version below is appended as ?v= to every
  asset URL, which makes a new shoot a new URL and settles it for good.
*/
{
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  await writeFile(
    "components/demoVersion.ts",
    `/* Written by scripts/capture.mjs — do not edit by hand.
   Busts the cache when the clips are re-shot; see that script for why. */
export const DEMO_VERSION = "${stamp}";
`,
  );
  console.log(`  ✓ components/demoVersion.ts (${stamp})`);
}

/*
  Remove the customer created for the shoot. These captures run against the REAL
  database — leaving them and their points behind would quietly inflate the demo
  café's own analytics, which are the numbers the landing page then shows.
*/
await removeShootCustomer();

/*
  Say so, loudly, and fail.

  The cleanup above always runs — a half-finished shoot must still not leave a
  customer behind in the real database — but a shoot that could not film
  everything is not a shoot you should push.
*/
if (failed.length) {
  console.error(`\n${failed.length} clip(s) did not film. The previous versions are untouched:`);
  for (const f of failed) console.error(`  ! ${f}`);
  process.exit(1);
}
console.log("\nall clips filmed");
