/** TEMP — screenshot the dark owner app. */
import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";
import { env } from "./db.mjs";
import { ensureTestCafe, dropTestCafe, TEST_SLUG } from "./fixture.mjs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "scratch/ownershots";
const LOCAL = `2${String(Date.now()).slice(-7)}`;
const NORM = `+216${LOCAL}`;

const { id } = await ensureTestCafe({ ownerEmail: env.SUPER_ADMIN_EMAIL });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
await admin.from("businesses").update({ name: "Café El Ali", business_type: "cafe" }).eq("id", id);
await admin.from("loyalty_programs")
  .update({ stamps_enabled: true, stamps_required: 10, stamp_reward: "Café offert" })
  .eq("business_id", id);

await mkdir(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: CHROME });

const d = await b.newPage({ viewport: { width: 390, height: 844 } });
await d.goto(`${BASE}/${TEST_SLUG}/rejoindre`, { waitUntil: "networkidle" });
await d.fill('input[name="phone"]', LOCAL);
await d.fill('input[name="pin"]', "4271");
await d.fill('input[name="name"]', "Yassine");
await d.click('button[type="submit"]');
await d.waitForURL(`**/${TEST_SLUG}`, { timeout: 15000 }).catch(() => {});
const days = (n) => new Date(Date.now() - n * 86400000).toISOString();
await admin.from("points_ledger").insert([
  { business_id: id, customer_phone: NORM, delta: 64, reason: "earn", created_at: days(18) },
  { business_id: id, customer_phone: NORM, delta: 52, reason: "earn", created_at: days(11) },
  { business_id: id, customer_phone: NORM, delta: -40, reason: "redeem", created_at: days(9) },
  { business_id: id, customer_phone: NORM, delta: 45, reason: "earn", created_at: days(4) },
  { business_id: id, customer_phone: NORM, delta: 61, reason: "earn", created_at: days(1) },
]);
await admin.from("loyalty_stamps").upsert(
  { business_id: id, phone: NORM, count: 7, cycles: 1, started_at: days(16) },
  { onConflict: "business_id,phone" },
);
const { data: card } = await admin
  .from("diner_cafes").select("code").eq("business_id", id).eq("phone", NORM).maybeSingle();

const s = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const hide = () =>
  s.addStyleTag({ content: "nextjs-portal,[data-next-badge-root]{display:none!important}" }).catch(() => {});
await s.goto(`${BASE}/owner/login`, { waitUntil: "networkidle" });
await s.fill('input[name="email"]', env.SUPER_ADMIN_EMAIL);
await s.fill('input[name="password"]', env.SUPER_ADMIN_PASSWORD);
await s.click('button[type="submit"]');
await s.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});

const shot = async (path, name, full = false) => {
  await s.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await s.reload({ waitUntil: "networkidle" });
  await hide();
  await s.waitForTimeout(800);
  await s.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
  console.log("  >", name);
};

await s.goto(`${BASE}/owner`, { waitUntil: "networkidle" });
await s.fill('input[name="customer"]', card.code);
await s.locator('button:has-text("Chercher")').click();
await s.locator('input[name="amount"]').waitFor({ timeout: 20000 }).catch(() => {});
await hide();
await s.waitForTimeout(700);
await s.screenshot({ path: `${OUT}/d1-caisse.png` });
console.log("  > d1-caisse");

await shot("/owner/analyses", "d2-analyses", true);
await shot("/owner/qr", "d3-qr", true);
await shot("/owner/reglages", "d4-reglages");

await b.close();
for (const t of ["loyalty_redemptions", "stamp_rewards", "loyalty_stamps"]) await admin.from(t).delete().eq("phone", NORM);
await admin.from("points_ledger").delete().eq("customer_phone", NORM);
await admin.from("diner_cafes").delete().eq("phone", NORM);
await admin.from("pin_attempts").delete().eq("phone", NORM);
await admin.from("accounts").delete().eq("phone", NORM);
await dropTestCafe();
console.log("done");
