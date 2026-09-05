import Link from "next/link";
import { redirect } from "next/navigation";
import { OwnerSidebar } from "@/components/OwnerNav";
import { OwnerMenu } from "@/components/OwnerMenu";
import { InstallPrompt } from "@/components/InstallPrompt";
import { ownerAccess, ownerCafe, ownerHome } from "@/lib/auth/owner";
import { ROLE_LABEL, can, currentStaff, type Area } from "@/lib/auth/staff";
import { listStaff } from "@/lib/db";
import { ownerNotices, remaining } from "@/lib/platform";
import { StaffGate } from "./equipe/StaffGate";

export const metadata = { title: "Espace café" };

/**
 * Never prerender the owner app: every page here reads live, per-owner data
 * (balances, stats, codes). Without this the dev-bypass path (which reads no
 * cookies) would let Next statically cache the dashboard at build time and
 * serve frozen numbers.
 */
export const dynamic = "force-dynamic";

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const owner = await ownerAccess();
  if (!owner) redirect("/owner/login");

  const cafe = await ownerCafe();
  /*
    Every page in this group needs a café — /owner/nouveau lives in (setup),
    outside it. Each page already refuses without one, but a redirect thrown
    from a PAGE lands inside the loading.tsx boundary, and once that has
    streamed Next can no longer send an HTTP 307: it emits <meta refresh>
    instead. A brand-new owner's very first screen was a spinner, one dead
    second, then a reload. Deciding here, above the boundary, makes it a real
    redirect. The page-level guards stay — they are what narrows the type.
  */
  if (!cafe) redirect(await ownerHome());

  /*
    ── WHO IS HOLDING THE PHONE ───────────────────────────────────

    ONE CHOKE POINT, HERE, ABOVE EVERY SCREEN IN THE GROUP. A gate that each
    page opts into is a gate with a page somebody forgot to add it to — and the
    forgotten one is always the new one.

    When the shop has not switched this on (the default), currentStaff() is null
    and nothing below changes: the app renders exactly as it did, every tab is
    present, and the record of who did what says "Propriétaire", which is the
    truth because the owner's login is the only identity there is.
  */
  const staff = cafe.staffPinsEnabled ? await currentStaff(cafe.id) : null;
  if (cafe.staffPinsEnabled && !staff) {
    const people = await listStaff(cafe.id);
    /*
      An empty team would be a locked door with no handle. The actions refuse to
      switch the gate on without somebody who can open it, and refuse to remove
      the last of them — this is the third guard, for a row deleted in the
      database, and it opens the app rather than stranding the owner in it.
    */
    if (people.length) return <StaffGate shop={cafe.name} people={people} />;
  }

  /* What this person's role allows. undefined when the gate is off — the nav
     reads it as "everything", and every page re-asks server-side anyway. */
  const areas: Area[] | undefined = staff
    ? (["caisse", "qr", "clients", "analyses", "reglages", "equipe"] as Area[]).filter((a) =>
        can(staff, a),
      )
    : undefined;

  /* owner.id is the owner OF this café by construction: ownerCafe() resolves
     the shop by that same id. The RPC re-checks the pairing anyway (0045). */
  const notices = await ownerNotices(cafe.id, owner.id);

  const left = remaining(cafe.planExpiresAt);

  /*
    THE CHIP IS FOR PLANS THAT NEED SOMETHING DOING. "Pro" needed nothing.

    A paid shop got a permanent violet badge on every screen of its own admin,
    saying it had paid. It carried no date, no action and no change of state —
    and on Réglages it was the THIRD statement of the plan in one viewport,
    beside "Formule Pro · jusqu'au 30 novembre" (which has the date) and
    "Formules et tarifs" (which has the prices). Removing it costs a paid shop
    nothing and settles one of the duplications.

    A trial running out and an expired plan still chip, because those are the
    two that want a decision.
  */
  const planChip =
    cafe.plan === "pro"
      ? null
      : left.expired
        ? { text: "Expiré", cls: "bg-[#e5484d]/12 text-[#e5484d]" }
        : { text: `Essai · ${left.label ?? ""}`.trim(), cls: "bg-[#a06e00]/12 text-[#a06e00]" };

  return (
    /* Phone: one column, header on top, tabs at the bottom.
       Laptop: a sidebar owns navigation, so the header collapses to nothing. */
    /* NOT .app-shell — that is the diner's phone column and it would cap this
       whole app (sidebar included) at ~480px. It is unlayered CSS, so a
       md:max-w-* utility cannot win against it; the class has to be absent. */
    <div className="a-shell flex min-h-dvh md:items-start">
      <OwnerSidebar
        name={cafe.name}
        initial={cafe.name.charAt(0).toUpperCase()}
        colour={cafe.primaryColor}
        plan={planChip}
        slug={cafe.slug}
        areas={areas}
        staff={staff ? { name: staff.name, role: ROLE_LABEL[staff.role] } : null}
      />

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
      {/*
        THE MOBILE HEADER IS GONE.

        It was a sticky bar carrying the shop logo, its name, the words
        "Espace café" and the plan chip — about 64px of every phone screen,
        permanently, to tell a cashier which shop they are in. They know. They
        work there, and it is the only shop this login can reach.

        The plan chip went with it and is not lost: the two states that
        actually need attention already have their own banners directly below
        (expired/suspended, and "se termine dans N jours"), and the exact
        formula and dates live in Réglages → Votre compte. A permanent chip
        reading "Pro" is a fact nobody needs during service.

        safe-t moves onto <main>: the header was what kept content clear of
        the notch, so dropping it without moving the inset would put the till
        under the status bar in the installed app.
      */}

      {owner.dev && (
        <p className="border-b border-[var(--o-edge)] bg-[#a06e00]/12 px-5 py-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.08em] text-[#a06e00]">
          ⚠ Mode développement — aucune authentification
        </p>
      )}

      {/*
        The café is dark. The owner keeps their panel and their data — they just
        can't serve diners — so tell them plainly rather than letting them wonder
        why the QR stopped working.
      */}
      {!cafe.live && (
        <div className="border-b border-[#e5484d]/35 bg-[#e5484d]/12 px-5 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#e5484d]">
            ◆ Café hors ligne
          </p>
          {/*
            Say the frightening half AND the reassuring half.

            This used to stop at "vos clients ne peuvent plus scanner", which is
            the whole of what an owner is told when their shop goes dark. The
            answer to the question they actually have — do I lose my customers?
            — was already written, and true, and filed where only a diner would
            find it: /conditions says "Rien n'est effacé", and CafeClosed.tsx
            tells the DINER "tes points sont conservés". The person paying was
            the one left guessing.
          */}
          <p className="mt-0.5 text-[12px] leading-snug text-[#e5484d]">
            {cafe.suspendedAt
              ? `Suspendu : ${cafe.suspendedReason ?? "contactez-nous"}`
              : "Votre abonnement a expiré — vos clients ne peuvent plus scanner."}
          </p>
          <p className="mt-1 text-[12px] leading-snug text-slate">
            Rien n&apos;est effacé : vos clients et leurs points vous attendent,
            intacts, le jour où vous rallumez.
          </p>
          {/* A dead end otherwise: the product told an owner their shop was dark
              and gave them nothing to press. */}
          {!cafe.suspendedAt && (
            /* straight to the flow, not to the settings screen it lives on:
               a shop that is dark has one thing to do */
            <Link href="/owner/renouveler" className="mt-1.5 inline-block text-[12px] font-bold text-charcoal underline underline-offset-2">
              Renouveler mon abonnement →
            </Link>
          )}
        </div>
      )}

      {cafe.live && left.soon && !left.unlimited && (
        <p className="border-b border-[#a06e00]/30 bg-[#a06e00]/12 px-5 py-2 text-[12px] leading-snug text-[#a06e00]">
          Votre {cafe.plan === "trial" ? "essai" : "abonnement"} se termine dans{" "}
          <b>{left.label}</b>. Vos clients et leurs points sont conservés.{" "}
          <Link href="/owner/renouveler" className="font-bold underline underline-offset-2">
            Renouveler
          </Link>
        </p>
      )}

      {notices.map((n) => (
        <div
          key={n.id}
          className={`border-b-[1.5px] px-5 py-2.5 ${
            n.kind === "urgent"
              ? "border-[#e5484d]/35 bg-[#e5484d]/12 text-[#e5484d]"
              : n.kind === "warning"
                ? "border-[#a06e00]/30 bg-[#a06e00]/12 text-[#a06e00]"
                : "border-[var(--o-edge)] bg-[var(--o-inset)] text-slate"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] opacity-70">
            {n.kind === "urgent" ? "◆ Urgent" : n.kind === "warning" ? "◆ Important" : "◆ Info"}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug">{n.message}</p>
        </div>
      ))}

      {/*
        680px is right for the till and wrong for the dashboard.

        The counter is a one-handed terminal — one customer, one amount, one
        button — and widening it would only push the keypad further from the
        thumb. Analyses is the opposite: it is the reason an owner opens a
        laptop at all, and it was one small card with ~530px of empty page
        beneath it and 224px of dead background either side.

        A page opts in by rendering [data-owner-wide]; the widening rule lives
        in globals.css. Not a CSS variable set by the page — custom properties
        inherit DOWNWARD, and this cap is on the page's own parent, so the
        variable would never have reached it.
      */}
      {/*
        ── AND IT SITS IN THE MIDDLE OF THE SCREEN ───────────────────────

        Every screen in this app used to start at the top edge and stop wherever
        it ran out. The till is two buttons: on a 900px phone that put them under
        the notch with six hundred pixels of nothing beneath — the two controls
        pressed hundreds of times a shift, as far from the thumb as the screen
        allows, in a corner that reads like the page failed to finish loading.

        `m-auto` ON THE CHILD, not `items-center` on the parent. A centred flex
        child that outgrows its container crops at BOTH ends and the cropped part
        is unreachable — no scroll can get to it. Auto margins do the same
        centring while the content is short and COLLAPSE TO ZERO the moment it is
        not, so Réglages and the client list flow from the top and scroll exactly
        as before. The receipt sheet makes the same argument in its own file; it
        is the same trick and the same reason.
      */}
      {/* pb-20 on a phone: the menu button floats OVER this column, so the room
          it needs is its own height (52px) plus its inset (16px) — 80px, not the
          96 this reserved. On the counter those 16px are the difference between
          fitting a short phone and scrolling it. */}
      <main className="owner-main safe-t flex flex-1 flex-col px-5 pb-20 md:px-8 md:py-8 md:pb-8 md:[--safe-pt:2rem] [--safe-pt:1.25rem]">
        <div className="m-auto w-full max-w-[680px]">{children}</div>
      </main>

      {/*
        The tab bar is gone from the phone. Everything that is not one of the
        till's two acts lives behind one floating button now — see OwnerMenu for
        why five peers was the wrong claim about these screens.
      */}
      <OwnerMenu
        areas={areas}
        slug={cafe.slug}
        staff={staff ? { name: staff.name, role: ROLE_LABEL[staff.role] } : null}
      />
      {/* the till is opened dozens of times a shift, on one phone */}
      <InstallPrompt audience="owner" />
      </div>
    </div>
  );
}
