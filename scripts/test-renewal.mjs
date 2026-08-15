/**
 * RENOUVELER MON ABONNEMENT — the money path, end to end.
 *
 * A shop picks an offer, pays outside the product, photographs the receipt and
 * sends it; the console sees the request WITH the photograph and approves; the
 * plan is extended by exactly the months that were paid for.
 *
 * What this suite is really guarding:
 *   · the amount and the duration come from the price list, NOT from the form
 *   · one pending request per shop, so an anxious owner cannot send five
 *   · the receipt is readable by the console and by nobody else
 *   · approving is what extends the plan — the two can never disagree
 */
import { deflateSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { env } from "./db.mjs";
import { ensureTestCafe, dropTestCafe } from "./fixture.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SUPER = { email: env.SUPER_ADMIN_EMAIL, password: env.SUPER_ADMIN_PASSWORD };

/*
  TWO PEOPLE, WHICH IS THE POINT.

  This used to hand the cafe to the super-admin, so one account both sent the
  request and approved it — which tests the screens and not the boundary. The
  shop belongs to the fixture's own owner now; the console step signs in as the
  operator. Submitter and approver are different humans, as they are in life.
*/
const { id: cafeId, ownerEmail: OWNER_EMAIL, ownerPassword: OWNER_PASSWORD } =
  await ensureTestCafe();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/* start from a known state: no leftovers from an earlier run */
await admin.from("renewal_requests").delete().eq("business_id", cafeId);

const b = await chromium.launch({ executablePath: CHROME });
const cleanup = async () => {
  await b.close().catch(() => {});
  await admin.from("renewal_requests").delete().eq("business_id", cafeId);
  await dropTestCafe().catch(() => {});
};

try {
  const login = async (page, email, password) => {
    await page.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});
  };

  /* the shop owner — the one who pays */
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await login(p, OWNER_EMAIL, OWNER_PASSWORD);

  /* ── 1 · the flow exists and is reachable from the settings screen ── */
  await p.goto(`${BASE}/owner/reglages`, { waitUntil: "networkidle" });
  /* the price list is FOLDED unless the plan is ending — an owner who has paid
     should not be advertised at. Open it, the way a curious owner would. */
  await p.locator("summary:has-text('Formules et tarifs')").click();
  const reglages = await p.locator("main").innerText();
  check("Réglages offers renewal as an action", /Renouveler mon abonnement/i.test(reglages));

  await p.goto(`${BASE}/owner/renouveler`, { waitUntil: "networkidle" });
  const form = await p.locator("main").innerText();
  check("the flow states the total", /Total à payer/i.test(form) && /80 TND/.test(form));
  check(
    "all three ways to pay are offered",
    /D17/.test(form) && /Flouci/i.test(form) && /RIB/i.test(form),
  );
  /*
    The one thing that must never be quiet: while lib/billing says PLACEHOLDER,
    the screen has to say so, or somebody transfers 80 TND into a demo.
  */
  check(
    "placeholder coordinates announce themselves",
    /démonstration/i.test(form) && /EXEMPLE/i.test(form),
    form.match(/⚠[^\n]*/)?.[0]?.slice(0, 60) ?? "",
  );

  /* the receipt is required — nothing can be sent without one */
  const sendDisabled = await p.locator('button[type="submit"]').first().isDisabled();
  check("no receipt, no request", sendDisabled);

  /* ── 2 · send one ─────────────────────────────────────────────────── */
  // a real 64×64 PNG, drawn here: the browser has to DECODE the receipt to
  // downscale it, so a hand-written two-pixel stub is not a stand-in for one.
  const PNG_BYTES = receiptPng();
  const PNG = PNG_BYTES.toString("base64");
  await p.locator('input[type="file"]').setInputFiles({
    name: "recu.png",
    mimeType: "image/png",
    buffer: PNG_BYTES,
  });
  await p.locator('input[name="note"]').fill("Virement 4471 — test");
  await p.waitForTimeout(1200);
  await p.locator('button[type="submit"]').first().click();
  await p.waitForFunction(
    () => /Demande envoyée|vérifie/i.test(document.querySelector("main")?.innerText ?? ""),
    undefined,
    { timeout: 20000 },
  ).catch(() => {});

  const { data: rows } = await admin
    .from("renewal_requests")
    .select("id, offer, months, amount, method, status, proof, note")
    .eq("business_id", cafeId);
  const req = rows?.[0];
  check("the request reaches the database", !!req, req ? req.id : "none");
  check(
    "the price comes from the price list, not the form",
    Number(req?.amount) === 80 && req?.months === 12,
    `${req?.amount} TND · ${req?.months} mois`,
  );
  check("the receipt is stored with it", String(req?.proof ?? "").startsWith("data:image/"));
  check("the owner's note is kept", /4471/.test(String(req?.note ?? "")));

  /* ── 3 · one pending request per shop ─────────────────────────────── */
  await p.goto(`${BASE}/owner/renouveler`, { waitUntil: "networkidle" });
  const again = await p.locator("main").innerText();
  check(
    "a second attempt shows the pending one instead of the form",
    /En vérification/i.test(again) && !/Total à payer/i.test(again),
  );

  const dup = await admin.rpc("submit_renewal_request", {
    p_owner: "00000000-0000-0000-0000-000000000000",
    p_business_id: cafeId,
    p_offer: "12m",
    p_months: 12,
    p_amount: 1,
    p_method: "d17",
    p_proof: `data:image/png;base64,${PNG}`,
    p_note: null,
  });
  check(
    "a request for somebody else's shop is refused",
    dup.data?.ok === false && dup.data?.reason === "forbidden",
    String(dup.data?.reason ?? dup.error?.message ?? ""),
  );

  /* ── 4 · the console sees it, with the photograph ─────────────────── */
  /* A SECOND SESSION, as the operator. The owner who sent this request must
     never be the account that approves it — that is the whole boundary. */
  const opCtx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const op = await opCtx.newPage();
  await login(op, SUPER.email, SUPER.password);
  await op.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const consoleTxt = await op.locator("body").innerText();
  check("the console queues the request", /Renouvellements/i.test(consoleTxt));
  check(
    "it carries the amount and the method",
    /80 TND/.test(consoleTxt) && /D17/i.test(consoleTxt),
  );

  const proofUrl = `${BASE}/api/admin/proof/${req.id}`;
  const asAdmin = await op.request.get(proofUrl);
  check("the console can read the receipt", asAdmin.status() === 200, String(asAdmin.status()));

  const stranger = await b.newContext();
  const anon = await stranger.request.get(proofUrl);
  check(
    "a stranger cannot read a shop's receipt",
    anon.status() === 404,
    String(anon.status()),
  );
  await stranger.close();

  /* ── 5 · approving is what extends the plan ───────────────────────── */
  const { data: before } = await admin
    .from("businesses")
    .select("plan_expires_at")
    .eq("id", cafeId)
    .single();

  await op.locator('button:has-text("Valider")').first().click();
  await op.waitForFunction(
    () => /Renouvellement validé/i.test(document.body.innerText),
    undefined,
    { timeout: 20000 },
  ).catch(() => {});

  const { data: after } = await admin
    .from("businesses")
    .select("plan, plan_expires_at")
    .eq("id", cafeId)
    .single();
  const from = new Date(before?.plan_expires_at ?? Date.now()).getTime();
  const to = new Date(after?.plan_expires_at ?? 0).getTime();
  const days = Math.round((to - Math.max(from, Date.now())) / 86400000);
  check(
    "approving extends the plan by what was paid for",
    after?.plan === "pro" && days >= 360 && days <= 370,
    `+${days} jours`,
  );

  const { data: settled } = await admin
    .from("renewal_requests")
    .select("status")
    .eq("id", req.id)
    .single();
  check("the request is closed", settled?.status === "approved", String(settled?.status));

  const decided = await admin.rpc("admin_decide_renewal", {
    p_actor: (await admin.from("profiles").select("id").eq("role", "super_admin").limit(1).single()).data?.id,
    p_id: req.id,
    p_approve: true,
    p_note: null,
  });
  check(
    "a settled request cannot be approved twice",
    decided.data?.ok === false && decided.data?.reason === "already_decided",
    String(decided.data?.reason ?? ""),
  );

  /* the owner sees the outcome on their own screen */
  await p.goto(`${BASE}/owner/renouveler`, { waitUntil: "networkidle" });
  const closing = await p.locator("main").innerText();
  check("the owner sees it was validated", /Validée/i.test(closing));
} catch (e) {
  console.error("--- suite crashed ---");
  console.error(String(e).slice(0, 600));
} finally {
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} renewal checks passed`);
  await cleanup();
  if (passed !== results.length) process.exit(1);
}

/** A small valid PNG, built by hand — no fixture file to keep in the repo. */
function receiptPng() {
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let r = 0xffffffff;
    for (const b of buf) r = crcTable[(r ^ b) & 255] ^ (r >>> 8);
    return (r ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const W = 64;
  const H = 64;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = y * (W * 3 + 1) + 1 + x * 3;
      raw[o] = (x * 4) % 256;
      raw[o + 1] = (y * 4) % 256;
      raw[o + 2] = 180;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
