/**
 * Build the carousel slides for Instagram / Facebook.
 *
 *   node scripts/posts.mjs
 *
 * Three carousels, rendered as 1080×1350 PNGs:
 *   1 · الكاس        — how the commerce gives points, step by step
 *   2 · الحريف       — the customer's side, and how their code reaches the till
 *   3 · بالحق        — what Pointili actually does for you, without the sales talk
 *
 * EVERY SCREENSHOT IS A REAL FRAME OF THE REAL APP, lifted straight out of the
 * clips in public/demo that scripts/capture.mjs films against the demo café.
 * Nothing here is a mockup, so nothing here can drift away from what ships.
 *
 * THE LANGUAGE IS NOT NEGOTIABLE. It follows
 * `Desktop/pointili postes/docs/DICTIONNAIRE-POINTILI.txt`, the validated brand
 * dictionary, whose golden rule is: the SENTENCE stays Tunisian, the TECHNICAL
 * WORDS stay French. Never half-and-half word by word. So:
 *
 *   حريف        never  زبون / عميل
 *   points, cadeau, récompense, fidélité, compte, code   never their Arabic
 *   يخلص · يعمل Scan · يجمع points · ياخو                never MSA equivalents
 *   برشا · تو · هكا · قداش · كيفاش · فما · موش · باهي    the fixed spellings
 *   Latin digits — 65 DT, never ٦٥
 *   A space before ? ! : as in French — « شنوة ؟ »
 *
 * And rule 18 of that dictionary, which decides the whole of post 3: NEVER
 * promise a result. No "+25% ventes", no "80% يرجعو". Only what the tool does.
 * The dashboard figures that appear in the screenshots belong to the demo café
 * and every slide showing one says so.
 */
import { chromium } from "playwright-core";
import { mkdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

/*
  A REAL ffmpeg, not the one Playwright ships.

  The bundled build is minimal — it has no filters at all, so `select` and
  `negate` fail with "No such filter" rather than anything that looks like a
  missing dependency. Prefer whatever is on PATH and only fall back to the
  bundled binary, which is enough for the plain seek used below.
*/
const FFMPEG = await (async () => {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  try {
    await run("ffmpeg", ["-version"]);
    return "ffmpeg";
  } catch {
    return `${process.env.LOCALAPPDATA}/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe`;
  }
})();
const OUT = process.env.POSTS_OUT ?? "C:/Users/Med Saief Allah/Desktop/pointili postes";
const W = 1080;
const H = 1350;

/*
  The exact frames used, by clip and frame number.

  Picked by eye from the finished clips, not guessed: f140 of credit is the
  moment the 8 digits are all in the field, f245 is the amount typed with the
  "+12 points" preview underneath, f150 of redeem is the reward code on screen.
*/
const FRAMES = {
  till: ["credit", 5], // the empty till, both onglets visible
  number: ["credit", 140], // 27830367 typed in
  fiche: ["credit", 160], // the customer sheet just opened
  montant: ["credit", 295], // "12" with the +12 points preview
  bravo: ["credit", 350], // the receipt
  tampon: ["stamp", 285], // 1/10, "Encore 9 visites"
  corriger: ["correction", 320], // corriger les points / code secret oublié
  qrposter: ["qr", 5], // the printable QR, four formats
  qrwhere: ["qr", 100], // "Où le mettre"
  signup: ["signup", 150], // numéro + code secret + prénom
  card: ["signup", 300], // Bonjour Karim, the card
  wallet: ["wallet", 110], // Mes cartes + MON CODE CLIENT
  boutique: ["redeem", 5], // Choisis ta récompense
  code: ["redeem", 150], // Voici ton code : QLPYEU
  retour: ["analyses", 5], // Est-ce que vos clients reviennent ?
  argent: ["analyses", 100], // ticket moyen, passé par la caisse
  reste: ["analyses", 225], // ce qu'ils préfèrent + points en circulation
  reglages: ["reglages", 120], // points par dinar, cadeau de bienvenue
};

/*
  Stills that are not frames of a clip.

  The walk-in sheet — the till holding somebody who has no account, saying
  "ses points l'attendent" — is the strongest slide in the first carousel and no
  clip passes through that state, because the shoot creates its own customer
  before it films. capture.mjs photographs it separately, next to till.png.
*/
const STILLS = { walkin: "public/demo/walkin.png" };

const shots = {};
for (const [key, file] of Object.entries(STILLS)) {
  shots[key] = `data:image/png;base64,${(await readFile(file)).toString("base64")}`;
}
{
  await mkdir("scratch/postshots", { recursive: true });
  for (const [key, [clip, frame]] of Object.entries(FRAMES)) {
    const to = `scratch/postshots/${key}.png`;
    /* -ss AFTER -i is output seeking: it decodes from the start and discards,
       which is slower than seeking the input but lands on the frame actually
       asked for. The clips are a few seconds each, so the cost is nothing, and
       it needs no filter — which keeps this working on a minimal build. */
    await run(FFMPEG, [
      "-y", "-i", `public/demo/${clip}.webm`,
      "-ss", (frame / 25).toFixed(3),
      "-frames:v", "1", "-update", "1", to,
    ]);
    shots[key] = `data:image/png;base64,${(await readFile(to)).toString("base64")}`;
  }
  console.log(`lifted ${Object.keys(shots).length} frames out of the real clips`);
}

/* ── the slides ──────────────────────────────────────────────────────── */

/*
  Three stories, not three feature lists:

    1 · الكاس    "كيفاش نزيد Points ؟"   — the cashier's thirty seconds
    2 · الحريف   "كيفاش ناخذ Cadeau ؟"   — the customer's journey
    3 · بالحق    "شنوّة باش نربح ؟"       — why an owner should care

  ONE VOCABULARY THROUGHOUT, so the brand reads as one product:
  الحريف · Points · QR · Compte · Code · Carte · Cadeau · Scan · Stamp ·
  Historique · Pointili. Cadeau always, never هدية — the dictionary bans the
  Arabic in marketing and a single word everywhere is the whole point.
*/
const POSTS = [
  {
    dir: "post 8 - la caisse etape par etape",
    tag: "الكاس",
    n: "1/3",
    slides: [
      {
        kind: "cover",
        ar: "كيفاش تزيد Points للحريف ؟",
        fr: "في أقل من 5 ثواني.",
        note: "من التيليفون متاعك — بلا matériel",
      },
      {
        step: "1",
        ar: "دخّل رقم الحريف",
        fr: "ولا اعمل Scan للـ QR متاعو إذا عندو. الزوز يخدمو كيف كيف.",
        shot: "number",
      },
      /*
        THE SLIDE THAT SELLS IT, and it is true — scripts/test-walkin.mjs
        covers exactly this: the till opens a customer with no account, says
        "Première visite ici — ses points l'attendent", credit works before
        signup, no ghost account is minted, and the points are on the card when
        they join later. The screenshot is that real screen.
      */
      {
        step: "2",
        star: true,
        badge: "حتى كان ما عندوش Compte",
        ar: "ما عندوش Compte ؟ موش مشكل.",
        fr: "دخّل رقم تيليفونو عادي. الـ Points تستنّاه. كي يعمل Compte من بعد، يلقاهم الكل في الـ Carte متاعو — ما يضيع حتى Point.",
        /* deliberately one sentence, not a list: it is an argument, not an
           inventory, and it has to be read as a sentence to land. */
        shot: "walkin",
      },
      {
        step: "3",
        ar: "اكتب قداش خلّص",
        fr: "بالدينار برك. Pointili يحسب الـ Points وحدو، على حساب الـ taux متاعك.",
        shot: "montant",
      },
      {
        step: "4",
        ar: "أكّد العملية",
        fr: "« Créditer » — و الحريف يلقى الـ Points متاعو على طول.",
        shot: "bravo",
      },
      {
        step: "5",
        ar: "عندو Carte بالـ Stamps ؟",
        fr: "« +1 tampon » بنفس الطريقة. كي تعمر الـ Carte، الـ Code متاع الـ Cadeau يخرج وحدو.",
        shot: "tampon",
      },
      {
        step: "6",
        ar: "غلطت ؟",
        fr: "تنجم تصلّحها من « Corriger / Historique ». ما يتمسح حتى شي — التصليح روحو يتكتب.",
        shot: "corriger",
      },
      {
        kind: "cta",
        ar: "كل عملية ما تاخذش أكثر من 5 ثواني",
        list: ["بلا caisse جديدة", "بلا matériel", "بلا formation"],
      },
    ],
  },

  {
    dir: "post 9 - le client et son code",
    tag: "الحريف",
    n: "2/3",
    slides: [
      {
        kind: "cover",
        ar: "الحريف : من الـ QR للـ Cadeau 🎁",
        fr: "كل شي يصير في أقل من دقيقة.",
        note: "بلا application — لا ليه لا ليك",
      },
      {
        step: "1",
        ar: "يعمل Scan للـ QR",
        fr: "من الكاميرا متاع التيليفون. يتحلّ في الـ navigateur.",
        shot: "qrposter",
      },
      /*
        No screenshot here on purpose. The claim is about what is ABSENT — no
        download — and a phone in the frame would be arguing the opposite.
      */
      {
        kind: "honest",
        badge: "⭐ موش لازم Application",
        ar: "حتى حد ما ينزّل شي",
        fr: "لا الحريف ولا إنت. و حتى كان ما عندوش Compte، الكاشيي ينجم يزيدلو Points بالرقم متاعو، و هو يعمل Compte وقت ما يحب.",
      },
      {
        step: "2",
        ar: "أول مرة ؟ يعمل Compte في دقيقة",
        fr: "بالتيليفون برك : رقم + Code secret.",
        shot: "signup",
      },
      {
        step: "3",
        ar: "الـ Carte جاهزة",
        fr: "كل مرة يخلّص، تزيدلو Points. و كل زيارة يزيدلو Stamp، كان الـ Carte بالـ Stamps.",
        shot: "card",
      },
      {
        step: "4",
        ar: "Compte واحد لكل المحلات",
        fr: "نفس الـ Code في كل commerce يخدم بـ Pointili. ما يعاودش يعمل Compte كل مرة.",
        shot: "wallet",
      },
      {
        step: "5",
        ar: "يحب Cadeau ؟",
        fr: "يضغط على اللي يحبو. وخلاص.",
        shot: "boutique",
      },
      {
        step: "6",
        ar: "يخرجلو Code",
        fr: "يورّيه للكاشيي.",
        shot: "code",
      },
      {
        step: "7",
        ar: "الكاشيي يأكّد الـ Code",
        fr: "يشوفو قبل، يأكّد بعد — باش ما يتعطاش Cadeau بالغلط. و الـ Code يتستعمل مرة برك.",
        shot: "till",
      },
      {
        kind: "cta",
        ar: "كل العملية أقل من دقيقة",
        list: ["بلا application", "بلا email", "بلا mot de passe"],
      },
    ],
  },

  {
    dir: "post 10 - ce que ca fait vraiment",
    tag: "بالحق",
    n: "3/3",
    slides: [
      {
        kind: "cover",
        ar: "بلا كلام زايد… شنوّة يعمل Pointili بالحق ؟",
        fr: "كل شي قدّامك بالأرقام.",
        note: "الأرقام في التصاور متاع commerce démo",
      },
      {
        kind: "big",
        ar: "الحرفاء يرجعولك ؟",
        fr: "تشوف نسبة الرجوع بالأرقام — موش بالإحساس. على 7 أيام، 30 يوم، ولا من البداية، و الفرق مع الفترة اللي قبل.",
        shot: "retour",
      },
      /*
        NOT "شكون أكثر الحرفاء نشاط". There is no per-customer ranking in the
        product — the browsable client list was removed from the till (see
        scripts/test-walkin.mjs) and Analyses reports aggregates only. Nothing
        can tell an owner who "deserves a Cadeau", so the slide says the true
        thing the same screen does answer: how often they come back, and which
        Cadeau they actually take.
      */
      {
        kind: "big",
        ar: "قداش من مرة يرجعو ؟ و شنوّة يحبو ؟",
        fr: "باش تعرف شنوّة تحط في الـ catalogue.",
        list: ["Visites par client", "Entre deux visites", "أكثر Cadeau يتاخذ"],
        shot: "reste",
      },
      {
        kind: "big",
        ar: "قداش من فلوس دازت من الكاس ؟",
        fr: "كل شي في écran واحد.",
        list: ["Ticket moyen", "عدد الزيارات", "الـ Points الموزّعين", "الـ Cadeaux اللي تعطاو"],
        shot: "argent",
      },
      {
        kind: "honest",
        ar: "الـ Données تبدا من أول نهار",
        fr: "كل زيارة… كل Point… كل Cadeau… يتسجّل وحدو. ما فماش شي تكتبو بيدك.",
      },
      {
        kind: "big",
        ar: "إنت تحدّد القوانين",
        fr: "كل شي من عندك.",
        list: ["قداش Points في الدينار ؟", "شنوّة Cadeaux ؟", "قداش Stamp ؟"],
        shot: "reglages",
      },
      {
        kind: "honest",
        badge: "⭐ بلا engagement",
        ar: "تبدّل ولا توقّف وقت ما تحب",
        fr: "كل شي يتبدّل في ثواني.",
        list: ["بدّل قيمة الـ Points", "بدّل الـ Cadeaux", "ولا زيد جداد"],
      },
      {
        kind: "big",
        ar: "الـ QR ديما حاضر",
        fr: "اطبعو و حطّو على الطاولة، على الكونتوار، ولا في الـ vitrine. الحريف يعمل Scan وخلاص.",
        shot: "qrwhere",
      },
      {
        kind: "fact",
        big: "14",
        unit: "يوم gratuit",
        ar: "جرّب Pointili",
        list: ["بلا carte bancaire", "بلا terminal", "بلا matériel"],
      },
    ],
  },

  /*
    THE ANSWER TO "شنوّة نربح ؟", which is the first thing a stranger asks.

    Deliberately the simplest of the four: one idea per slide, a headline and a
    single line under it, no lists in the middle and no numbers to study. The
    other three assume somebody already curious enough to follow a workflow;
    this one has to work for a shop owner who has never heard the name and is
    reading it in a Messenger thread.

    No promised result and no price — the first is the dictionary's rule 18,
    the second is unvalidated in docs/PRODUIT.md.
  */
  {
    dir: "post 11 - les benefices",
    tag: "شنوّة تربح ؟",
    n: "",
    slides: [
      {
        kind: "cover",
        ar: "شنوّة تربح بـ Pointili ؟",
        fr: "6 حاجات برك — بلا كلام تقني.",
        note: "carte fidélité digitale لمحلك",
      },
      {
        kind: "big",
        ar: "بلا application",
        fr: "لا إنت تنزّل شي و لا الحريف. كل شي في الـ navigateur.",
        shot: "qrposter",
      },
      {
        kind: "big",
        ar: "الحريف يعمل Scan، و في دقيقة تولّي عندو Carte",
        fr: "رقم تيليفون + Code secret. بلا email، بلا mot de passe.",
        shot: "signup",
      },
      {
        kind: "big",
        ar: "كل مرة يخلّص، يجمع Points",
        fr: "و يبدّلهم بـ Cadeau من عندك.",
        shot: "card",
      },
      {
        kind: "big",
        badge: "⭐ حتى كان ما عندوش Compte",
        ar: "ما يضيع حتى Point",
        fr: "تزيدلو Points بالرقم متاعو، و يلقاهم الكل كي يعمل Compte.",
        shot: "walkin",
      },
      {
        kind: "big",
        ar: "إنت تحدّد كل شي",
        fr: "قداش Points في الدينار، شنوّة Cadeaux، و الـ Carte بالـ Stamps.",
        shot: "reglages",
      },
      {
        kind: "big",
        ar: "تعرف شكون رجع — بالأرقام",
        fr: "نسبة الرجوع، عدد الزيارات، و الـ ticket moyen. موش بالإحساس.",
        shot: "retour",
      },
      {
        kind: "fact",
        big: "14",
        unit: "يوم gratuit",
        ar: "جرّب و وقتها تحكم",
        list: ["بلا carte bancaire", "بلا matériel", "تيليفون برك"],
      },
    ],
  },

  /*
    THE LANDING PAGE, AS A CAROUSEL.

    components/Showcase.tsx already explains the product one capability at a
    time, against real footage, with three checkable facts under each. That is
    the most detailed honest description of Pointili that exists — it just lives
    somewhere a Facebook reader never goes.

    So this is the same eight sections, same facts, same order, in Derja. It is
    the LONG one on purpose: the other carousels answer "what is it"; this one
    is for somebody who already wants to know exactly what he is getting.

    The facts are translated, not rewritten. If a line here stops matching the
    landing page, one of the two is lying.
  */
  /*
    THE ONE THAT SOUNDS LIKE A SHOP OWNER.

    Same eleven slides, rewritten line by line against the founder's list. The
    corrections were never about vocabulary — they were about verbs a Tunisian
    would actually reach for:

      دخل → جاك          "دخل" is walking into a room, not becoming a customer
      يعطيك → يمدّلك      what a hand does
      تضيف → تحطلو        nobody "adds" points, you put them on
      تتجمع → يزيد يجمع   the reflexive is written Arabic, not spoken
      يبدّلهم → يصرفهم    you SPEND points
      نجمو نصلحو → تتصلّح shorter, and it is the thing that repairs itself
      الهاتف → التاليفون · بطاقة → Carte · عميل → Client · رمز QR → QR Code

    And the code-switching is deliberate: Client, Carte, Scan, QR Code, Compte,
    Numéro, Cadeau, Points. A shop owner in Tunis mixes French into every second
    sentence — writing around it is what makes copy sound translated.
  */
  {
    dir: "post 1 update",
    tag: "بالتفصيل",
    n: "",
    slides: [
      {
        kind: "cover",
        ar: "الحريف جاك مرة… ومن بعد ما عادش رجع؟",
        fr: "هذا أكثر شي يخسّر في المحلات الصغيرة.",
        note: "شنوّة يعمل Pointili، و كيفاش تستعملو",
      },
      {
        kind: "big",
        ar: "Pointili يخلّي الحريف يرجع",
        fr: "كل مرة يخلّص، يزيد يجمع Points. وكي يلمّ، يصرفهم في Cadeau من عندك.",
        shot: "card",
      },
      {
        kind: "big",
        badge: "الكاس متاعك",
        ar: "في 5 ثواني برك، تحطلو الـ Points",
        list: [
          "الحريف يمدّلك الـ Numéro متاعو",
          "إنت تدخّل المبلغ بالدينار",
          "و Pointili يحسب وحدو",
        ],
        shot: "montant",
      },
      {
        kind: "big",
        badge: "الكاس متاعك",
        ar: "لا Carte كارتون، لا ضياع",
        fr: "ما عادش تستحق Carte ورقية.",
        list: ["لا تضيع", "لا تتنسى", "لا تتفسّخ"],
        shot: "tampon",
      },
      {
        kind: "big",
        badge: "الكاس متاعك",
        ar: "أول مرة تنجم تعرف شكون رجع",
        list: [
          "قدّاش من Client رجعلك",
          "قدّاش مرة يعاود يجي في الشهر",
          "و شنوّة أكثر Cadeau يتاخذ",
        ],
        shot: "retour",
      },
      {
        kind: "big",
        badge: "الكاس متاعك",
        ar: "إنت تقرّر كل شي",
        fr: "إنت ركّز كان على خدمتك — الباقي Pointili يعملو.",
        list: [
          "قدّاش يعطي Points",
          "شنوّة الـ Cadeau",
          "و وقتاش الحريف يربح",
        ],
        shot: "reglages",
      },
      {
        kind: "big",
        badge: "الكاس متاعك",
        ar: "كل شي في بلاصة وحدة باش تبدأ",
        list: ["QR Code جاهز", "تحطّو في بلاصتو", "و تبدأ تخدم"],
        shot: "qrposter",
      },
      {
        kind: "big",
        badge: "تاليفون الحريف",
        ar: "10 ثواني، بلا app وبلا email",
        list: [
          "يعمل Scan للـ QR Code",
          "يدخّل الـ Numéro متاعو",
          "و هاو عندو carte fidélité",
        ],
        shot: "signup",
      },
      {
        kind: "big",
        badge: "تاليفون الحريف",
        ar: "الـ Points تولّي عندها قيمة",
        fr: "يخرجلو Code، يورّيه للكاشيي، وياخو الـ Cadeau متاعو.",
        list: ["الحريف يجمع Points", "و يصرفهم في Cadeau"],
        shot: "code",
      },
      {
        kind: "big",
        badge: "الكاس متاعك",
        ar: "غلطت؟ ما فما حتى مشكل",
        fr: "و التصليح روحو يتكتب في الـ historique — ما يتمسح حتى شي.",
        list: [
          "الـ Points تتصلّح",
          "الـ Stamps تتصلّح",
          "و الـ Code secret اللي نساه يتعاود",
        ],
        shot: "corriger",
      },
      {
        kind: "fact",
        big: "14",
        unit: "نهار تجربة",
        ar: "جرّب Pointili",
        list: ["بلا carte bancaire", "بلا matériel", "بالتاليفون برك"],
      },
    ],
  },];
/* ── the look ────────────────────────────────────────────────────────── */

const CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; }
  body {
    background: #0a0614;
    color: #fff;
    font-family: "Segoe UI", Tahoma, Arial, sans-serif;
    direction: rtl;
    overflow: hidden;
    position: relative;
  }
  /* the brand's purple, thrown from the top-right so the eye starts where
     Arabic starts */
  body::before {
    content: "";
    position: absolute; inset: 0;
    background:
      radial-gradient(900px 620px at 88% -8%, rgba(124,58,237,.42), transparent 62%),
      radial-gradient(700px 520px at 6% 104%, rgba(167,139,250,.15), transparent 60%);
  }
  .frame {
    position: relative; z-index: 1;
    width: 100%; height: 100%;
    padding: 62px 66px 54px;
    display: flex; flex-direction: column;
  }
  .top { display: flex; align-items: center; justify-content: space-between; }
  .tag {
    background: #7c3aed; color: #fff;
    font-size: 25px; font-weight: 800;
    padding: 11px 26px; border-radius: 999px;
  }
  .pill {
    color: rgba(255,255,255,.42); font-size: 25px; font-weight: 700;
    letter-spacing: .06em; direction: ltr;
  }
  .body { flex: 1; display: flex; flex-direction: column; justify-content: center; }
  .foot {
    display: flex; align-items: center; justify-content: space-between;
    color: rgba(255,255,255,.34); font-size: 25px; font-weight: 600;
  }
  .foot .site { direction: ltr; letter-spacing: .02em; }

  .ar { font-weight: 800; line-height: 1.28; letter-spacing: -.01em; }
  .fr { color: rgba(255,255,255,.66); line-height: 1.62; font-weight: 500; }

  /* a step slide: the phone on the left, the words on the right */
  .row { display: flex; gap: 44px; align-items: center; }
  .words { flex: 1; }
  .phone {
    width: 392px; flex: none;
    border: 7px solid #1b1430; border-radius: 34px; overflow: hidden;
    background: #0b0616;
    box-shadow: 0 40px 90px -34px rgba(0,0,0,.95);
  }
  .phone img { display: block; width: 100%; }

  .num {
    display: inline-grid; place-items: center;
    width: 74px; height: 74px; border-radius: 22px;
    background: rgba(124,58,237,.2);
    color: #c4b5fd; font-size: 38px; font-weight: 800;
    direction: ltr; margin-bottom: 24px;
  }
  .num.star { background: #7c3aed; color: #fff; }

  .cover .ar { font-size: 78px; }
  .cover .fr { font-size: 33px; margin-top: 30px; }
  .cover .note {
    margin-top: 44px; display: inline-block;
    border: 2px solid rgba(255,255,255,.16); border-radius: 999px;
    padding: 14px 30px; font-size: 25px; color: rgba(255,255,255,.6);
  }

  .step .ar { font-size: 52px; }
  .step .fr { font-size: 28px; margin-top: 22px; }

  .wide .ar { font-size: 50px; }
  .wide .fr { font-size: 27px; margin-top: 20px; }

  .fact { text-align: center; }
  .fact .big {
    font-size: 250px; font-weight: 800; line-height: 1;
    color: #a78bfa; direction: ltr;
  }
  .fact .unit { font-size: 46px; font-weight: 800; margin-top: 6px; }
  .fact .ar { font-size: 46px; margin-top: 40px; }
  .fact .fr { font-size: 28px; margin-top: 22px; }

  .honest .ar { font-size: 62px; }
  .honest .fr { font-size: 31px; margin-top: 32px; }
  .honest .rule {
    width: 132px; height: 7px; border-radius: 99px;
    background: #7c3aed; margin-bottom: 44px;
  }
  .honest.hard .rule { background: #ff3b5c; }

  /*
    A term list. Each item is its own line and its own bidi context, so a
    French term never has to be found inside a right-to-left sentence.
    The dot is drawn as a real element rather than typed as "·", because a
    typed separator is a neutral character and neutrals are the whole problem.
  */
  .terms { list-style: none; margin-top: 26px; }
  .terms li {
    display: flex; align-items: baseline; gap: 16px;
    font-size: 27px; font-weight: 600; color: rgba(255,255,255,.78);
    line-height: 1.5; padding: 7px 0;
  }
  .terms li::before {
    content: ""; flex: none;
    width: 11px; height: 11px; border-radius: 50%;
    background: #a78bfa; transform: translateY(-4px);
  }
  /* On a centred slide the list is centred as a BLOCK while its lines stay
     right-aligned — right-aligning the whole thing pins it to the slide edge,
     away from the heading it belongs to. */
  .fact .terms,
  .cta .terms { display: inline-block; text-align: right; margin-top: 30px; }
  .honest .terms li { font-size: 29px; }

  /* the ⭐ badge — a claim that needs naming before the sentence lands */
  .badge {
    display: inline-block; margin-bottom: 22px;
    background: rgba(124,58,237,.28); color: #ddd0ff;
    border: 2px solid rgba(167,139,250,.45); border-radius: 999px;
    padding: 12px 26px; font-size: 24px; font-weight: 800;
  }
  .honest .badge { margin-bottom: 30px; }

  .cta { text-align: center; }
  .cta .mark { font-size: 92px; font-weight: 800; letter-spacing: -.02em; direction: ltr; }
  .cta .ar { font-size: 52px; margin-top: 40px; }
  .cta .fr { font-size: 29px; margin-top: 24px; }
  .cta .cta-line {
    display: inline-block; margin-top: 34px;
    font-size: 34px; font-weight: 800; color: #c4b5fd;
  }
  .cta .site {
    margin-top: 54px; display: inline-block; direction: ltr;
    background: #7c3aed; border-radius: 999px;
    padding: 22px 52px; font-size: 34px; font-weight: 800;
  }
`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

/**
 * Arabic carrying French words, laid out so it can actually be read.
 *
 * A sentence like «‎Ticket moyen · عدد الزيارات · Points الموزّعين‎» renders
 * wrong without help, and wrong in a way that is easy to miss: the "·" between
 * an Arabic word and a French one is a NEUTRAL character, and the bidi
 * algorithm resolves neutrals toward the paragraph direction. So the separator
 * jumps to the far side of the Latin run and the eye groups "· Cadeaux" when
 * what was written is "الموزّعين ·". Every list of French terms inside an
 * Arabic sentence came out subtly mis-grouped.
 *
 * Two things fix it:
 *
 *   · Each Latin run goes in a <bdi>, which is an independent bidirectional
 *     context. Neutrals on either side can no longer be pulled across the
 *     boundary, so the run sits exactly where it was written.
 *
 *   · «الـ» is joined to the word it introduces with a NO-BREAK SPACE, so a
 *     line can never end on the article and start the next line with its noun
 *     — which is how «في الـ / Carte متاعو» happened.
 *
 * The wrapping is done against the RAW string and each piece escaped as it is
 * emitted, rather than escaping first: escaping first turns "&" into "&amp;",
 * whose "amp" is a Latin run, and the tag would land inside the entity.
 */
function txt(s) {
  const glued = String(s).replace(/(الـ)[  ]+/g, "$1 ");
  const RUN = /[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’.‑-]*(?:[  ]+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9'’.‑-]*)*/g;
  let out = "";
  let last = 0;
  let m;
  while ((m = RUN.exec(glued)) !== null) {
    out += esc(glued.slice(last, m.index)) + `<bdi>${esc(m[0])}</bdi>`;
    last = m.index + m[0].length;
  }
  return out + esc(glued.slice(last));
}

function render(post, s, i) {
  const top = `<div class="top"><span class="tag">${esc(post.tag)}</span><span class="pill">${esc(post.n)}</span></div>`;
  const foot = `<div class="foot"><span class="site">pointili.online</span><span class="pill">${i + 1}/${post.slides.length}</span></div>`;
  let body = "";

  /*
    A run of French terms goes on its OWN LINES, never inline in an Arabic
    sentence. Isolation puts each term where it belongs, but four of them
    threaded through one right-to-left paragraph still makes the reader change
    direction four times mid-sentence. One term per line, and the reading order
    is the line order.
  */
  const list = (items) =>
    items?.length
      ? `<ul class="terms">${items.map((x) => `<li>${txt(x)}</li>`).join("")}</ul>`
      : "";

  if (s.kind === "cover") {
    body = `<div class="body cover"><div class="ar">${txt(s.ar)}</div>
      <div class="fr">${txt(s.fr)}</div>
      ${s.note ? `<div><span class="note">${txt(s.note)}</span></div>` : ""}</div>`;
  } else if (s.kind === "fact") {
    body = `<div class="body fact"><div class="big">${esc(s.big)}</div>
      <div class="unit">${txt(s.unit)}</div>
      <div class="ar">${txt(s.ar)}</div>
      ${s.fr ? `<div class="fr">${txt(s.fr)}</div>` : ""}
      ${list(s.list)}</div>`;
  } else if (s.kind === "honest") {
    body = `<div class="body honest ${s.hard ? "hard" : ""}"><div class="rule"></div>
      ${s.badge ? `<div><span class="badge">${txt(s.badge)}</span></div>` : ""}
      <div class="ar">${txt(s.ar)}</div><div class="fr">${txt(s.fr)}</div>
      ${list(s.list)}</div>`;
  } else if (s.kind === "cta") {
    body = `<div class="body cta"><div class="mark">Pointili</div>
      <div class="ar">${txt(s.ar ?? "جرّبو و وقتها تحكم")}</div>
      ${s.fr ? `<div class="fr">${txt(s.fr)}</div>` : ""}
      ${list(s.list)}
      <div><span class="cta-line">جرّبها اليوم</span></div>
      <div><span class="site">pointili.online</span></div></div>`;
  } else {
    /* everything with a screenshot beside it */
    const cls = s.kind === "big" || s.kind === "link" ? "wide" : "step";
    const badge = s.step
      ? `<div class="num ${s.star ? "star" : ""}">${esc(s.step)}</div>`
      : s.kind === "link"
        ? `<div class="num star">↔</div>`
        : "";
    body = `<div class="body ${cls}"><div class="row">
      <div class="phone"><img src="${shots[s.shot]}"></div>
      <div class="words">${badge}
      ${s.badge ? `<div><span class="badge">${txt(s.badge)}</span></div>` : ""}
      <div class="ar">${txt(s.ar)}</div>
      ${s.fr ? `<div class="fr">${txt(s.fr)}</div>` : ""}
      ${list(s.list)}</div>
    </div></div>`;
  }
  return `<style>${CSS}</style><div class="frame">${top}${body}${foot}</div>`;
}

/* ── shoot them ──────────────────────────────────────────────────────── */

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });

for (const post of POSTS) {
  const dir = `${OUT}/${post.dir}`;
  await mkdir(dir, { recursive: true });
  for (let i = 0; i < post.slides.length; i++) {
    await page.setContent(render(post, post.slides[i], i), { waitUntil: "load" });
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${dir}/${String(i + 1).padStart(2, "0")}.png` });
  }
  console.log(`  ✓ ${post.dir} — ${post.slides.length} slides`);
}

await browser.close();
console.log(`\n${POSTS.length} carousels built`);
