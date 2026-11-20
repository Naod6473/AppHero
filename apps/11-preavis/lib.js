// Préavis : les règles du jeu, partagées par l'app (navigateur), le Worker (API) et les tests.
// Tout se joue en « pavés », une monnaie fictive : aucun argent, aucun lot.

export const START = 1000; // pavés offerts à l'inscription
export const DAILY = 50; // la caisse de grève : une fois par jour, tant que la fortune est sous START
export const MIN_BET = 10;
export const MAX_PER_MARKET = 500; // ce qu'une personne peut miser en tout sur un même pari
export const HOUSE = 1000; // la mise de la maison, répartie sur les issues à l'ouverture d'un pari
export const MAX_OUTCOMES = 6;

export const CATS = {
  greves: { name: "Grèves", color: "#ff2d46" },
  rue: { name: "Dans la rue", color: "#ff8a1f" },
  assemblee: { name: "Assemblée", color: "#4d8dff" },
  elysee: { name: "Course à 2027", color: "#b47cff" },
  divers: { name: "Hors-série", color: "#19d38a" },
};

// ---------------------------------------------------------------- le pari mutuel
//
// Chaque issue a une cagnotte : la mise de la maison (seed) + les mises des joueurs (pool).
// La cote d'une issue = total des cagnottes / cagnotte de l'issue. Elle bouge à chaque mise,
// jusqu'à la clôture. Au verdict, les gagnants se partagent tout, au prorata de leur mise.

const sum = (a) => a.reduce((s, x) => s + x, 0);
export const sizes = (outcomes) => outcomes.map((o) => (o.seed || 0) + (o.pool || 0));

// Part de chaque issue (de 0 à 1) : ce que « pense » la salle.
export function shares(outcomes) {
  const s = sizes(outcomes);
  const t = sum(s);
  return s.map((x) => (t ? x / t : 0));
}

// Cote de chaque issue : pour 1 pavé misé, ce qui revient si elle gagne.
export function odds(outcomes) {
  const s = sizes(outcomes);
  const t = sum(s);
  return s.map((x) => (x ? t / x : 0));
}

// Ce que touche une mise gagnante, une fois le pari tranché (arrondi au pavé inférieur).
export function payout(amount, outcomes, winner) {
  const s = sizes(outcomes);
  return s[winner] ? Math.floor((amount * sum(s)) / s[winner]) : 0;
}

// Ce que rapporterait une mise faite maintenant (elle fait elle-même baisser la cote).
export function quote(outcomes, idx, amount) {
  const s = sizes(outcomes);
  const mine = s[idx] + amount;
  return mine ? Math.floor((amount * (sum(s) + amount)) / mine) : 0;
}

// La mise de la maison, répartie selon l'estimation de départ (en %, total 100).
// Rend null si l'estimation ne tient pas debout.
export function seedsFor(percents) {
  if (!Array.isArray(percents) || percents.length < 2 || percents.length > MAX_OUTCOMES) return null;
  if (!percents.every((p) => Number.isFinite(p) && p >= 1 && p <= 99)) return null;
  if (Math.abs(sum(percents) - 100) > 0.5) return null;
  return percents.map((p) => Math.max(10, Math.round((HOUSE * p) / 100)));
}

// ---------------------------------------------------------------- le grognomètre
//
// Chaque issue porte une note de « grogne » de -100 (tout va bien) à +100 (ça chauffe).
// L'indice (0 à 100) est la moyenne, sur les paris en cours, de ce que la salle attend.

export function grogneIndex(markets) {
  let total = 0;
  let n = 0;
  for (const m of markets) {
    if (m.status !== "open" && m.status !== "closed") continue;
    if (!m.outcomes.some((o) => o.grogne)) continue;
    const sh = shares(m.outcomes);
    total += m.outcomes.reduce((s, o, i) => s + (sh[i] * (o.grogne || 0)) / 100, 0);
    n++;
  }
  return n ? Math.max(0, Math.min(100, Math.round(50 + 50 * (total / n)))) : null;
}

export const GROGNE_LEVELS = [
  [20, "Calme plat"],
  [40, "Ça grogne"],
  [60, "Ça gronde"],
  [80, "Ça chauffe"],
  [101, "Ça va péter"],
];
export const grogneLabel = (v) => (v == null ? "En attente" : GROGNE_LEVELS.find(([max]) => v < max)[1]);

// ---------------------------------------------------------------- les joueurs

// Le titre affiché à côté du pseudo, selon le parcours.
export function titleOf(p) {
  const settled = p.settled || 0;
  if (settled >= 5 && p.won / settled >= 0.7) return "Prophète";
  if (settled >= 5 && p.won / settled <= 0.2) return "Chat noir";
  if (p.fortune >= 5 * START) return "Rentier";
  if (p.fortune < 100) return "Fauché";
  if ((p.wagered || 0) >= 300) {
    const tilt = (p.mood || 0) / (p.wagered * 100);
    if (tilt >= 0.5) return "Cassandre";
    if (tilt <= -0.5) return "Candide";
    return "Normand";
  }
  return "Bleu";
}
export const TITLES = {
  Prophète: "Au moins 7 paris gagnés sur 10.",
  "Chat noir": "Moins de 2 paris gagnés sur 10. Respect.",
  Rentier: "Plus de 5 000 pavés. Les pavés font des petits.",
  Fauché: "Moins de 100 pavés. La caisse de grève est là pour ça.",
  Cassandre: "Parie presque toujours que ça va chauffer.",
  Candide: "Parie presque toujours que tout ira bien.",
  Normand: "P'têt ben qu'oui, p'têt ben qu'non.",
  Bleu: "Débute dans la salle des marchés.",
};

// Pseudo : 2 à 16 caractères, lettres latines, chiffres, espace et . ' _ -
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿŒœ0-9][A-Za-zÀ-ÖØ-öø-ÿŒœ0-9 .'_-]{1,15}$/;
export function cleanName(s) {
  const n = String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  return NAME_RE.test(n) ? n : null;
}
// Deux pseudos qui ne diffèrent que par les accents, la casse ou la ponctuation sont le même.
export function nameKey(name) {
  return String(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[œŒ]/g, "oe")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
// Pseudos refusés : ceux qui se font passer pour la maison, et les insultes les plus courantes.
const RESERVED_START = ["admin", "lamaison", "parieurparti", "parieurn"];
const RESERVED_ANY = ["arbitre", "apphero", "preavis", "moderateur", "moderatrice", "organisateur", "organisatrice"];
const RUDE = ["connard", "connasse", "salope", "salaud", "encule", "enfoire", "niquetamere", "nazi", "hitler", "negro", "bougnoul", "youpin", "tarlouze", "pedophile", "pedoph", "fistfuck"];
const RUDE_WHOLE = ["pute", "putes", "bite", "bites", "pd", "fdp", "ntm", "tg", "con", "conne", "cul", "nique"];
export function blockedName(name) {
  const k = nameKey(name);
  if (k.length < 2) return true;
  return RESERVED_START.some((w) => k.startsWith(w)) || RESERVED_ANY.some((w) => k.includes(w)) || RUDE.some((w) => k.includes(w)) || RUDE_WHOLE.includes(k);
}

// ---------------------------------------------------------------- dates (heure de Paris, été comme hiver)

const dayFmt = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
export const parisDay = (ms) => dayFmt.format(new Date(ms)); // « 2026-11-28 »
export const parisMonth = (ms) => parisDay(ms).slice(0, 7); // « 2026-11 »

// Semaine ISO (« 2026-W48 ») du jour de Paris : la grille du bingo change chaque lundi.
export function weekKey(ms) {
  const [y, m, d] = parisDay(ms).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const year = date.getUTCFullYear();
  const week = Math.ceil(((date - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- affichage

// Espace insécable ordinaire : l'espace fine (U+202F) manque dans beaucoup de polices web.
const SP = "\u00a0";
export const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, SP);
export function fmtOdds(x) {
  if (!x || !Number.isFinite(x)) return "–";
  const digits = x >= 100 ? 0 : x >= 10 ? 1 : 2;
  return "×" + x.toFixed(digits).replace(".", ",");
}
export const fmtPct = (share) => `${Math.round(share * 100)}${SP}%`;

// ---------------------------------------------------------------- le bingo des petites phrases
//
// Une grille de 16 formules toutes faites, la même pour tout le monde, renouvelée chaque lundi.
// On coche ce qu'on entend à la télé ou à la radio. C'est pour rire : rien à gagner, même pas des pavés.

export const PHRASES = [
  "« Je l'assume »",
  "« On a entendu la colère »",
  "« Il faut faire de la pédagogie »",
  "« Les Français nous regardent »",
  "« Rien n'est tabou »",
  "« Tout est sur la table »",
  "« Pas de langue de bois »",
  "« En responsabilité »",
  "« Un cap clair »",
  "« Changer de logiciel »",
  "« Les lignes rouges »",
  "« Les usagers pris en otage »",
  "« Le dialogue social »",
  "« Une main tendue »",
  "« Je vais être très clair »",
  "« Les Françaises et les Français »",
  "« Ni totem ni tabou »",
  "« Co-construction »",
  "« Le compte n'y est pas »",
  "« Un passage en force »",
  "« Un déni de démocratie »",
  "« La balle est dans leur camp »",
  "« Selon la police… selon les syndicats »",
  "« Une mobilisation historique »",
  "« Le mouvement s'essouffle »",
  "« La galère des usagers »",
  "« Trafic très perturbé »",
  "« Un train sur trois »",
  "« Une reprise progressive »",
  "« Le service minimum »",
  "« Jeudi noir »",
  "« La convergence des luttes »",
  "« La rue ne gouverne pas »",
  "« Un Grenelle »",
  "« Une grande concertation »",
  "« Un numéro vert »",
  "« Une commission d'enquête »",
  "« En même temps »",
  "« Les extrêmes »",
  "« L'arc républicain »",
  "« Faire barrage »",
  "« Un moment de vérité »",
  "« Renverser la table »",
  "« Les territoires »",
  "« Du concret »",
  "« Sans filtre »",
  "« Une séquence politique »",
  "« Les éléments de langage »",
  "« Une sortie de crise »",
  "« Le texte ira au bout »",
  "« Ni chèque en blanc ni blocage »",
  "« Une clause de revoyure »",
  "« Une feuille de route »",
  "« Dans le dur »",
  "« Remettre l'église au milieu du village »",
  "« Un signal fort »",
];
export const BINGO_SIZE = 4;

// Petit générateur pseudo-aléatoire à graine (mulberry32) : même semaine, même grille.
function rng(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function bingoGrid(week) {
  const rand = rng(`preavis|${week}`);
  const bag = PHRASES.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag.slice(0, BINGO_SIZE * BINGO_SIZE);
}
// Les lignes complètes (rangées, colonnes, diagonales) : liste des index de cases.
export function bingoLines(checked) {
  const n = BINGO_SIZE;
  const lines = [];
  for (let r = 0; r < n; r++) lines.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) lines.push(Array.from({ length: n }, (_, r) => r * n + c));
  lines.push(Array.from({ length: n }, (_, i) => i * n + i));
  lines.push(Array.from({ length: n }, (_, i) => i * n + (n - 1 - i)));
  return lines.filter((l) => l.every((i) => checked[i]));
}
