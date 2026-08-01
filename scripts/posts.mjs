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

const shots = {};
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

const POSTS = [
  {
    dir: "post 8 - la caisse etape par etape",
    tag: "الكاس",
    n: "1/3",
    slides: [
      {
        kind: "cover",
        ar: "كيفاش تعطي points لحريفك ؟",
        fr: "La caisse Pointili — خطوة بخطوة",
        note: "كل شي من التيليفون متاعك",
      },
      {
        step: "1",
        ar: "احلّ Caisse",
        fr: "أول écran كي تدخل. فما زوز onglets : « Ajouter des points » و « Valider une récompense ».",
        shot: "till",
      },
      {
        step: "2",
        ar: "لقى الحريف",
        fr: "ثلاثة طرق : تعمل Scan للـ QR متاعو، ولا تكتب نمرة التيليفون، ولا الـ code متاعو (4 حروف).",
        shot: "number",
      },
      {
        step: "3",
        ar: "الـ fiche متاعو تتحلّ",
        fr: "اسمو، الـ code متاعو، قداش عندو points، و الـ tampons. كل شي قدامك في écran واحد.",
        shot: "fiche",
      },
      {
        step: "4",
        ar: "اكتب الدينار — موش الـ points",
        fr: "تكتب قداش خلّص برك. Pointili يحسب الـ points وحدو على حساب الـ taux متاعك. لا إنت ولا الكاشيي تنجمو تغلطو في الحساب.",
        shot: "montant",
        star: true,
      },
      {
        step: "5",
        ar: "اضغط Créditer",
        fr: "« +12 points · nouveau solde 217 ». و يوري للحريف قداش باقيلو للـ cadeau اللي جاي.",
        shot: "bravo",
      },
      {
        step: "6",
        ar: "عندك carte à tampons ؟",
        fr: "« +1 tampon » — زيارة بزيارة. كي تعمر الكارت، الـ code متاع الـ cadeau يخرج وحدو.",
        shot: "tampon",
      },
      {
        step: "7",
        ar: "غلطت ؟ ما يقلقكش",
        fr: "« Corriger / Historique » : تزيد ولا تنقص، تسيّر الـ tampons، و حتى تعاود الـ code secret للحريف اللي نساه. ما يتمسح حتى شي — الـ correction تتكتب في الـ historique.",
        shot: "corriger",
      },
      {
        kind: "fact",
        big: "5",
        unit: "ثواني",
        ar: "قد ما تحتاج باش تعطي points",
        fr: "قد ما تحتاج باش ترد الصرف. بلا caisse جديدة، بلا matériel، بلا formation.",
      },
      { kind: "cta" },
    ],
  },

  {
    dir: "post 9 - le client et son code",
    tag: "الحريف",
    n: "2/3",
    slides: [
      {
        kind: "cover",
        ar: "الحريف : من الـ QR للـ cadeau",
        fr: "و كيفاش الـ code متاعو يوصل للكاشيي",
        note: "بلا application — لا ليه لا ليك",
      },
      {
        step: "1",
        ar: "يعمل Scan للـ QR",
        fr: "الـ QR على الطاولة ولا على الـ comptoir. يتحلّ في الـ navigateur — ما ينزّل حتى شي.",
        shot: "qrposter",
      },
      {
        step: "2",
        ar: "يعمل compte في دقيقة",
        fr: "نمرة التيليفون + code secret + الاسم (optionnel). بلا email، بلا mot de passe.",
        shot: "signup",
      },
      {
        step: "3",
        ar: "الكارت متاعو جاهزة",
        fr: "الـ cadeau متاع الترحيب يجي على طول. يشوف قداش عندو points و قداش باقيلو.",
        shot: "card",
      },
      {
        step: "4",
        ar: "compte واحد لكل الـ commerces",
        fr: "« MON CODE CLIENT : JMD7 » — نفس الـ code في كل commerce يخدم بـ Pointili. عمرو ما يعاود compte جديد.",
        shot: "wallet",
      },
      {
        kind: "link",
        ar: "هنا وين يتلاقاو",
        fr: "الحريف يقولّك الـ code متاعو (4 حروف) ولا نمرتو. إنت تكتبها في الكاس ← نفس الـ compte، نفس الـ solde.",
        shot: "fiche",
      },
      {
        step: "5",
        ar: "كي يحب cadeau",
        fr: "يمشي للـ boutique متاعك، يشوف قداش عندو points، و يختار.",
        shot: "boutique",
      },
      {
        step: "6",
        ar: "يخرجلو code",
        fr: "« Voici ton code : QLPYEU ». يوريهولك في الـ comptoir. code وحيد، يتستعمل مرة برك، و عندو expiration.",
        shot: "code",
      },
      {
        step: "7",
        ar: "إنت : Vérifier ثم Collecter",
        fr: "في الكاس، onglet « Valider une récompense ». تشوف شنوة هو الـ cadeau قبل ما تأكّد — زوز خطوات مانعرفينش، باش ما تعطيش cadeau بالغلط.",
        shot: "till",
      },
      { kind: "cta" },
    ],
  },

  {
    dir: "post 10 - ce que ca fait vraiment",
    tag: "بالحق",
    n: "3/3",
    slides: [
      {
        kind: "cover",
        ar: "بلا كلام زايد — شنوة يعمل بالحق ؟",
        fr: "ما نوعدوك بحتى رقم. هاو برك شنوة يعمل.",
        note: "الأرقام في التصاور متاع commerce démo",
      },
      {
        kind: "big",
        ar: "الرقم اللي عمرك ما عندك : شكون رجع",
        fr: "« Est-ce que vos clients reviennent ? » — على 7 أيام، 30 يوم، ولا من البداية، مع الفرق مع الفترة اللي قبل.",
        shot: "retour",
      },
      {
        kind: "big",
        ar: "و الفلوس اللي دازت من الكاس",
        fr: "Ticket moyen · visites par client · entre deux visites · récompenses servies. و مكتوب بالواضح : « Uniquement ce qui est passé par la caisse Pointili ».",
        shot: "argent",
      },
      {
        kind: "honest",
        ar: "و كي الـ données ما تكفيش، نقولوهالك",
        fr: "أقل من 5 حرفاء ؟ Pointili يكتب « Trop tôt pour conclure ». ما نخترعولكش رقم باش يعجبك.",
      },
      {
        kind: "big",
        ar: "الـ points اللي باقية موش دين عليك",
        fr: "« Des points que vos clients peuvent encore dépenser — pas une dette. » تعرف قداش باقي، و قداش من code تعطى و ما جاش حد يحلّو.",
        shot: "reste",
      },
      {
        kind: "big",
        ar: "إنت اللي تحكم في كل شي",
        fr: "Points par dinar · cadeau de bienvenue · الـ catalogue متاع الـ récompenses · الـ carte à tampons. تبدّل وقت ما تحب.",
        shot: "reglages",
      },
      {
        kind: "big",
        ar: "و الـ kit متاع الـ QR جاهز",
        fr: "Chevalet للطاولة · autocollant · affiche · story. تطبعهم من عندك، بلا ما تكوموندي شي.",
        shot: "qrwhere",
      },
      {
        kind: "honest",
        ar: "و شنوة ما يعملوش ؟",
        fr: "ما يجيبلكش حرفاء جداد وحدو. ما نضمنولك حتى رقم. Pointili يجمع الـ points، يوري شكون رجع، و يخلّي الكارت ما تتنساش. الباقي خدمتك إنت.",
        hard: true,
      },
      {
        kind: "fact",
        big: "14",
        unit: "يوم gratuit",
        ar: "جرّبو قبل ما تحكم",
        fr: "بلا carte bancaire. تيليفون برك — ما فماش matériel تشريه.",
      },
      { kind: "cta" },
    ],
  },
];

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

  .cta { text-align: center; }
  .cta .mark { font-size: 92px; font-weight: 800; letter-spacing: -.02em; direction: ltr; }
  .cta .ar { font-size: 52px; margin-top: 40px; }
  .cta .fr { font-size: 29px; margin-top: 24px; }
  .cta .site {
    margin-top: 54px; display: inline-block; direction: ltr;
    background: #7c3aed; border-radius: 999px;
    padding: 22px 52px; font-size: 34px; font-weight: 800;
  }
`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function render(post, s, i) {
  const top = `<div class="top"><span class="tag">${esc(post.tag)}</span><span class="pill">${esc(post.n)}</span></div>`;
  const foot = `<div class="foot"><span class="site">pointili.online</span><span class="pill">${i + 1}/${post.slides.length}</span></div>`;
  let body = "";

  if (s.kind === "cover") {
    body = `<div class="body cover"><div class="ar">${esc(s.ar)}</div>
      <div class="fr">${esc(s.fr)}</div>
      ${s.note ? `<div><span class="note">${esc(s.note)}</span></div>` : ""}</div>`;
  } else if (s.kind === "fact") {
    body = `<div class="body fact"><div class="big">${esc(s.big)}</div>
      <div class="unit">${esc(s.unit)}</div>
      <div class="ar">${esc(s.ar)}</div><div class="fr">${esc(s.fr)}</div></div>`;
  } else if (s.kind === "honest") {
    body = `<div class="body honest ${s.hard ? "hard" : ""}"><div class="rule"></div>
      <div class="ar">${esc(s.ar)}</div><div class="fr">${esc(s.fr)}</div></div>`;
  } else if (s.kind === "cta") {
    body = `<div class="body cta"><div class="mark">Pointili</div>
      <div class="ar">جرّبو و وقتها تحكم</div>
      <div class="fr">14 يوم gratuit · بلا carte bancaire · تيليفون برك</div>
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
      <div class="words">${badge}<div class="ar">${esc(s.ar)}</div>
      <div class="fr">${esc(s.fr)}</div></div>
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
console.log("\nthree carousels built");
