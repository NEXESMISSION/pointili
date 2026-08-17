"use client";

import { useActionState, useState } from "react";
import { BUSINESS_TYPES } from "@/lib/businessTypes";
import type { ShopDetail } from "@/lib/platform";
import {
  deleteShopAction,
  setProgramAction,
  transferShopAction,
  updateShopAction,
  type AdminState,
} from "../../actions";

/**
 * The editors — everything about a shop that used to require psql.
 *
 * "J'ai mal écrit le nom de mon café", "je veux changer mon adresse", "j'ai
 * vendu le commerce", "mon taux de points est faux", "supprimez mon compte".
 * Five real messages, five UPDATE statements typed by hand against production,
 * none of them recorded anywhere.
 *
 * They live BELOW the day-to-day levers on the page, and behind a click each,
 * because that is their frequency: a plan gets extended weekly and a slug gets
 * changed twice a year. Folding them away is not hiding them — it is keeping
 * the destructive ones out from under a cursor that came here to press "+6
 * mois".
 */

function Result({ state }: { state: AdminState }) {
  if (state.error) {
    return (
      <p role="alert" className="k-note k-bad mt-2 w-full  px-3 py-2">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p role="status" className="k-note k-ok mt-2 w-full  px-3 py-2">
        {state.ok}
      </p>
    );
  }
  return null;
}

/* ══ identity ═══════════════════════════════════════════════════════════ */

export function IdentityBox({ shop }: { shop: ShopDetail["shop"] }) {
  const [state, act, pending] = useActionState<AdminState, FormData>(updateShopAction, {});
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(shop.slug);

  const slugChanged = slug.trim().toLowerCase() !== shop.slug;

  if (!open) {
    return (
      <div className="k-card p-4">
        <p className="k-h">Identité</p>
        <dl className="mt-2 space-y-1 text-[12.5px]">
          <Line k="Nom" v={shop.name} />
          <Line k="Adresse" v={`/${shop.slug}`} mono />
          <Line k="Téléphone" v={shop.phone || "—"} mono />
          <Line k="Couleur" v={shop.primaryColor} mono swatch={shop.primaryColor} />
        </dl>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="k-btn k-btn--sm k-btn--ghost mt-3 w-full"
        >
          Modifier
        </button>
      </div>
    );
  }

  return (
    <div className="k-card p-4">
      <p className="k-h">Identité</p>
      <form action={act} className="mt-2.5 space-y-2">
        <input type="hidden" name="businessId" value={shop.id} />

        <Field label="Nom du commerce">
          <input name="name" defaultValue={shop.name} maxLength={60} className="k-field w-full" />
        </Field>

        <Field label="Adresse publique">
          <span className="flex items-stretch gap-1.5">
            <span className="k-num flex shrink-0 items-center rounded-lg border border-[var(--o-edge)] bg-[var(--o-inset)] px-2.5 text-[12px] text-slate">
              /
            </span>
            <input
              name="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              maxLength={40}
              className="k-field k-field--num w-full"
            />
          </span>
        </Field>

        {/*
          THE WARNING THAT MATTERS, and it only appears when it is true.

          Changing a slug does not break the app — it breaks every physical
          object the shop has already paid for. The QR stickers on the tables,
          the poster behind the counter, whatever the print shop ran off in
          March: all of them point at the old address, and nobody finds out
          until a customer scans one and gets nothing. The database cannot
          prevent that. Saying it, at the moment the field is edited and not
          before, is the only thing that can.
        */}
        {slugChanged && (
          <p className="k-note k-warn w-full  px-3 py-2">
            {/* An explicit {" "}: the slug wraps mid-word at this width, and the
                space after </b> was being eaten by the line break — the warning
                read "…pointent vers /cafe-el-manaret cesseront…". */}
            Les QR déjà imprimés pointent vers <b>/{shop.slug}</b>{" "}
            et cesseront de fonctionner. Prévenez le commerce avant
            d&apos;enregistrer.
          </p>
        )}

        <Field label="Téléphone affiché sur la carte">
          <input
            name="phone"
            defaultValue={shop.phone ?? ""}
            dir="ltr"
            placeholder="+216 25 123 456"
            className="k-field k-field--num w-full"
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          <Field label="Catégorie">
            <select name="type" defaultValue={shop.businessType ?? "other"} className="k-field">
              {BUSINESS_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.emoji} {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Couleur">
            <input
              name="color"
              type="color"
              defaultValue={shop.primaryColor}
              className="k-field h-[38px] w-[64px] p-1"
            />
          </Field>
        </div>

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={pending} className="k-btn k-btn--sm flex-1">
            {pending ? "· ·" : "Enregistrer"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSlug(shop.slug);
              setOpen(false);
            }}
            className="k-btn k-btn--sm k-btn--ghost"
          >
            Annuler
          </button>
        </div>
      </form>
      <Result state={state} />
    </div>
  );
}

/* ══ the loyalty programme ══════════════════════════════════════════════ */

export function ProgramBox({
  shop,
  program,
}: {
  shop: ShopDetail["shop"];
  program: ShopDetail["program"];
}) {
  const [state, act, pending] = useActionState<AdminState, FormData>(setProgramAction, {});
  const [open, setOpen] = useState(false);
  const [stamps, setStamps] = useState(program?.stampsEnabled ?? false);

  if (!open) {
    return (
      <div className="k-card p-4">
        <p className="k-h">Programme</p>
        {program ? (
          <dl className="mt-2 space-y-1 text-[12.5px]">
            {/* Shown, never offered. See the editor below. */}
            <Line k="Taux" v="1 dinar = 1 point" />
            <Line k="Bienvenue" v={`${program.welcomePoints} points`} />
            <Line k="Code récompense" v={`${program.redeemExpiryHours} h`} />
            <Line
              k="Tampons"
              v={
                program.stampsEnabled
                  ? `${program.stampsRequired} → ${program.stampReward || "sans récompense"}`
                  : "désactivés"
              }
            />
          </dl>
        ) : (
          <p className="mt-2 text-[12px] leading-snug text-slate">
            Aucun programme — ce café n&apos;a jamais terminé son installation. Le créer
            ici le rend utilisable tout de suite.
          </p>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="k-btn k-btn--sm k-btn--ghost mt-3 w-full"
        >
          {program ? "Modifier" : "Créer le programme"}
        </button>
      </div>
    );
  }

  return (
    <div className="k-card p-4">
      <p className="k-h">Programme</p>
      <form action={act} className="mt-2.5 space-y-2">
        <input type="hidden" name="businessId" value={shop.id} />

        {/*
          THE RATE IS NOT EDITABLE HERE, AND IT WAS THE FIRST THING I BUILT.

          Migration 0031 pinned points_per_tnd to exactly 1 with a CHECK
          constraint, and wrote down why: "the rate is no longer an owner
          setting… this makes it true of the database rather than true of one
          screen that happens not to offer the field any more." A super-admin
          field for it would have been that screen, reintroduced from the other
          side — and the database refused the write, which is the constraint
          doing precisely its job.

          One dinar earns one point everywhere on this platform. It is on the
          landing page, on the owner's settings screen, and it is what lets a
          customer check a balance in their head. Making it 0.5 for one café
          would turn a promise into a per-shop surprise that nobody at that
          counter could explain.
        */}
        <p className="k-inset px-3 py-2 text-[11.5px] leading-snug text-slate">
          <b className="text-charcoal">1 dinar = 1 point</b>, sur toute la plateforme.
          Ce taux n&apos;est pas réglable — ni par le commerce, ni ici.
        </p>

        <Field label="Points de bienvenue">
          <input
            name="welcome"
            type="number"
            min="0"
            max="10000"
            defaultValue={program?.welcomePoints ?? 10}
            className="k-field k-field--num w-[90px] text-center"
          />
        </Field>
        <Field label="Validité d'un code de récompense (heures)">
          <input
            name="expiry"
            type="number"
            min="1"
            max="8760"
            defaultValue={program?.redeemExpiryHours ?? 48}
            className="k-field k-field--num w-[90px] text-center"
          />
        </Field>

        <label className="flex items-center gap-2 pt-1 text-[12.5px] font-semibold text-charcoal">
          <input
            type="checkbox"
            name="stamps"
            defaultChecked={program?.stampsEnabled ?? false}
            onChange={(e) => setStamps(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-royal)]"
          />
          Carte à tampons
        </label>

        {/* The two stamp fields only exist when stamps do — a required-looking
            field that decides nothing is how a form teaches people to ignore it. */}
        {stamps && (
          <div className="space-y-2 border-s-2 border-[var(--o-edge)] ps-3">
            <Field label="Tampons pour une récompense">
              <input
                name="stampsRequired"
                type="number"
                min="2"
                max="50"
                defaultValue={program?.stampsRequired ?? 8}
                className="k-field k-field--num w-[90px] text-center"
              />
            </Field>
            <Field label="Récompense">
              <input
                name="stampReward"
                defaultValue={program?.stampReward ?? ""}
                maxLength={60}
                placeholder="Café offert"
                className="k-field w-full"
              />
            </Field>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={pending} className="k-btn k-btn--sm flex-1">
            {pending ? "· ·" : "Enregistrer"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="k-btn k-btn--sm k-btn--ghost"
          >
            Annuler
          </button>
        </div>
      </form>
      <Result state={state} />
    </div>
  );
}

/* ══ the end of a shop ══════════════════════════════════════════════════ */

/**
 * Transfer and delete.
 *
 * Full width and at the very bottom of the page, under a heading that says what
 * it is. Both are rare, both are hard to undo, and neither should ever be one
 * scroll away from the button that extends a subscription.
 */
export function DangerZone({ shop, cards }: { shop: ShopDetail["shop"]; cards: number }) {
  return (
    <div className="mt-8 rounded-[14px] border border-[#f0c4bd] bg-[#fffafa] p-4">
      <p className="k-h !text-[#b3202f]">Zone dangereuse</p>
      <div className="mt-3 grid gap-2.5 lg:grid-cols-2">
        <TransferBox shop={shop} />
        <DeleteBox shop={shop} cards={cards} />
      </div>
    </div>
  );
}

function TransferBox({ shop }: { shop: ShopDetail["shop"] }) {
  const [state, act, pending] = useActionState<AdminState, FormData>(transferShopAction, {});
  const [email, setEmail] = useState("");

  return (
    <div className="k-card p-4">
      <p className="text-[13px] font-bold text-charcoal">Changer de propriétaire</p>
      <p className="mt-1 text-[11.5px] leading-snug text-slate">
        Le commerce a été vendu, ou le propriétaire a perdu l&apos;accès à{" "}
        <span className="k-num">{shop.ownerEmail ?? "son email"}</span>. Le nouveau
        compte doit déjà exister sur Pointili.
      </p>
      <form action={act} className="mt-2.5 space-y-2">
        <input type="hidden" name="businessId" value={shop.id} />
        <input
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nouveau@proprietaire.tn"
          className="k-field w-full"
          aria-label="Email du nouveau propriétaire"
        />
        <button
          type="submit"
          disabled={pending || !email.includes("@")}
          className="k-btn k-btn--sm k-btn--ghost w-full"
        >
          {pending ? "· ·" : "Transférer le café"}
        </button>
      </form>
      <Result state={state} />
    </div>
  );
}

function DeleteBox({ shop, cards }: { shop: ShopDetail["shop"]; cards: number }) {
  const [state, act, pending] = useActionState<AdminState, FormData>(deleteShopAction, {});
  const [typed, setTyped] = useState("");

  /* The confirmation is the SLUG, typed. A dialog protects against a stray
     click; it does nothing about an operator with two tabs open who is looking
     at the wrong shop. Typing the address is the only guard that requires
     having read which one this is. */
  const matches = typed.trim().toLowerCase() === shop.slug;

  return (
    <div className="k-card p-4">
      <p className="text-[13px] font-bold text-[#b3202f]">Supprimer le café</p>
      <p className="mt-1 text-[11.5px] leading-snug text-slate">
        Efface définitivement le commerce, ses récompenses, son historique et{" "}
        <b>
          {cards} carte{cards === 1 ? "" : "s"} client
        </b>
        . Irréversible : il n&apos;y a pas de corbeille.
      </p>
      <form action={act} className="mt-2.5 space-y-2">
        <input type="hidden" name="businessId" value={shop.id} />
        <input
          name="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={`Tapez ${shop.slug} pour confirmer`}
          className="k-field k-field--num w-full"
          aria-label="Confirmer avec l'adresse du café"
        />
        <button
          type="submit"
          disabled={pending || !matches}
          className="k-btn k-btn--sm k-btn--danger w-full"
        >
          {pending ? "· ·" : `Supprimer ${shop.name}`}
        </button>
      </form>
      <Result state={state} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-slate">{label}</span>
      {children}
    </label>
  );
}

function Line({
  k,
  v,
  mono,
  swatch,
}: {
  k: string;
  v: string;
  mono?: boolean;
  swatch?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate">{k}</dt>
      <dd className={`flex items-center gap-1.5 text-end font-semibold text-charcoal ${mono ? "k-num" : ""}`}>
        {swatch && (
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded-full border border-[var(--o-edge)]"
            style={{ background: swatch }}
          />
        )}
        {v}
      </dd>
    </div>
  );
}
