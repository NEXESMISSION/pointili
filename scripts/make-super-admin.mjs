/**
 * Promote (or create) a platform operator.
 *
 *   node scripts/make-super-admin.mjs <email> [password]
 *
 * With a password, the account is created if it does not exist. Without one, an
 * existing account is promoted and its password left alone — which is how you
 * promote someone who already signed up normally.
 *
 * A super-admin is deliberately NOT given a café. They are a platform operator,
 * not a shop: ownerHome() sends an account with no café and this role to the
 * console instead of the "create your café" form.
 *
 * WHY A SCRIPT AND NOT A BUTTON: `profiles.role` is the highest-value column in
 * the database — writing it is what the security audit's critical finding was
 * about. There is no UI for it and there should not be. It is reachable only
 * with the service-role key, which lives on the server and never in a browser.
 */
import { createClient } from "@supabase/supabase-js";
import { env } from "./db.mjs";

const [email, password] = process.argv.slice(2);
if (!email) {
  console.error("usage: node scripts/make-super-admin.mjs <email> [password]");
  process.exit(1);
}

const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* Find the auth user. listUsers is paginated, so ask for a generous page rather
   than assuming the account is on the first one. */
async function findUser(mail) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === mail.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

let user = await findUser(email);

if (!user) {
  if (!password) {
    console.error(`No account for ${email}. Pass a password to create one.`);
    process.exit(1);
  }
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no confirmation mail: this is provisioned, not signed up
  });
  if (error) {
    console.error("could not create:", error.message);
    process.exit(1);
  }
  user = data.user;
  console.log(`created  ${email}`);
} else {
  console.log(`found    ${email}`);
  if (password) {
    const { error } = await svc.auth.admin.updateUserById(user.id, { password });
    if (error) {
      console.error("could not set password:", error.message);
      process.exit(1);
    }
    console.log("password set");
  }
}

/* The profiles row is created by a trigger on auth.users, but a freshly created
   user may race it — upsert so this works either way. */
const { error: upErr } = await svc
  .from("profiles")
  .upsert({ id: user.id, email, role: "super_admin" }, { onConflict: "id" });
if (upErr) {
  console.error("could not set role:", upErr.message);
  process.exit(1);
}

const { data: check } = await svc
  .from("profiles")
  .select("email, role")
  .eq("id", user.id)
  .maybeSingle();

const { count: cafes } = await svc
  .from("businesses")
  .select("id", { count: "exact", head: true })
  .eq("owner_id", user.id);

console.log(`role     ${check?.role}`);
console.log(`cafés    ${cafes ?? 0}${cafes ? "  (an operator normally owns none)" : ""}`);
console.log(`\nSign in at /owner/login — with no café, that lands on the console.`);
console.log(`The console then asks for the SAME password again to unlock (30 min).`);
