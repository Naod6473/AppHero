// Calendrier du défi Apphéro : la seule source de vérité pour les dates.
// Utilisé par le site (navigateur), le Worker et les scripts Node.
//
// Règles (décidées par Simon le 16/11/2026) :
// - Départ mercredi 18 novembre 2026, rythme lundi-samedi, 30 apps.
// - Toutes les sorties à 18 h, heure de Paris (UTC+1 en novembre-décembre).
// - Vote de la semaine le samedi, finale le mardi 22 décembre (app 30).
// - La roue tourne la veille au soir de chaque jeudi (5 tirages).

export const TZ = "Europe/Paris";
export const RELEASE_HOUR = 18;
// Pas de changement d'heure entre novembre et décembre : Paris = UTC+1.
const OFFSET = "+01:00";
const START = "2026-11-18";
export const TOTAL = 30;

export const WEEKDAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
export const WEEKDAYS_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
export const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const MONTHS_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

// Thème de chaque jour de la semaine (index = getUTCDay()).
export const THEMES = {
  1: { name: "App utile", color: "#FF3D9A", blurb: "Une app utile, tirée de mes idées." },
  2: { name: "2 heures chrono", color: "#25D0E8", blurb: "Une app faite en moins de 2 heures." },
  3: { name: "Communauté", color: "#7CF2B0", blurb: "L'idée vient du public." },
  4: { name: "La roue décide", color: "#FFD83D", blurb: "Le critère sort de la roue la veille au soir." },
  5: { name: "Surprise du vendredi", color: "#B9A3FF", blurb: "Inutile mais magnifique, ou contrainte folle." },
  6: { name: "Jeu + vote", color: "#FF8A3D", blurb: "Une app jeu, et l'app de la semaine." },
};

// Le dimanche : pas d'app prévue… en principe.
export const SUNDAY = { name: "Repos… ou pas !", color: "#FFF8E1", blurb: "Pas d'app prévue le dimanche. Mais une surprise n'est jamais exclue." };

// Fin du défi : résultat de la grande finale.
export const CHALLENGE_END = "2026-12-23T20:00:00+01:00";

function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekday(iso) {
  return new Date(iso + "T12:00:00Z").getUTCDay();
}

export function releaseAt(iso) {
  return `${iso}T${String(RELEASE_HOUR).padStart(2, "0")}:00:00${OFFSET}`;
}

function buildDays() {
  const out = [];
  let iso = START;
  while (out.length < TOTAL) {
    const wd = weekday(iso);
    if (wd !== 0) {
      const num = out.length + 1;
      const theme =
        num === 1
          ? { name: "Le site", color: "#FF3D9A", blurb: "Le site qui lance le défi." }
          : num === TOTAL
            ? { name: "La finale", color: "#FF3D9A", blurb: "La 30e app, et la grande gagnante du défi." }
            : THEMES[wd];
      out.push({
        num,
        id: String(num).padStart(2, "0"),
        date: iso,
        weekday: wd,
        publishAt: releaseAt(iso),
        theme: theme.name,
        color: theme.color,
        blurb: theme.blurb,
        wheel: wd === 4,
      });
    }
    iso = addDays(iso, 1);
  }
  return out;
}

export const DAYS = buildDays();

// Les votes (décidés par Simon le 16/11/2026) :
// - Vote de la semaine : s'ouvre le samedi à 18 h (sortie de la dernière app de la semaine),
//   se ferme le lundi à 18 h. Une voix par personne parmi les apps de la semaine.
// - Grande finale : les 5 gagnantes de la semaine + les apps 29 et 30.
//   Du mardi 22 décembre 18 h au mercredi 23 décembre 20 h.
const nums = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(2, "0"));
export const BALLOTS = [
  { id: "S1", label: "Semaine 1", apps: nums(1, 4), opensAt: "2026-11-21T18:00:00+01:00", closesAt: "2026-11-23T18:00:00+01:00" },
  { id: "S2", label: "Semaine 2", apps: nums(5, 10), opensAt: "2026-11-28T18:00:00+01:00", closesAt: "2026-11-30T18:00:00+01:00" },
  { id: "S3", label: "Semaine 3", apps: nums(11, 16), opensAt: "2026-12-05T18:00:00+01:00", closesAt: "2026-12-07T18:00:00+01:00" },
  { id: "S4", label: "Semaine 4", apps: nums(17, 22), opensAt: "2026-12-12T18:00:00+01:00", closesAt: "2026-12-14T18:00:00+01:00" },
  { id: "S5", label: "Semaine 5", apps: nums(23, 28), opensAt: "2026-12-19T18:00:00+01:00", closesAt: "2026-12-21T18:00:00+01:00" },
  // Les candidates de la finale sont calculées : gagnantes de S1 à S5, plus ces apps-là.
  { id: "F", label: "Grande finale", final: true, extra: nums(29, 30), opensAt: "2026-12-22T18:00:00+01:00", closesAt: "2026-12-23T20:00:00+01:00" },
];

export function ballotStatus(b, now = Date.now()) {
  if (now < Date.parse(b.opensAt)) return "upcoming";
  if (now < Date.parse(b.closesAt)) return "open";
  return "closed";
}

export function fmtDateTime(isoWithTime) {
  const iso = isoWithTime.slice(0, 10);
  const hh = Number(isoWithTime.slice(11, 13));
  return `${fmtShort(iso)} · ${hh} h`;
}

// Les tirages de la roue : la veille au soir de chaque jeudi.
export const WHEEL_DAYS = DAYS.filter((d) => d.wheel).map((d) => ({ forDay: d.date, drawOn: addDays(d.date, -1), num: d.num }));

// Date du jour à Paris (AAAA-MM-JJ) pour un instant donné.
export function parisDate(ms = Date.now()) {
  return new Date(ms + 3600 * 1000).toISOString().slice(0, 10);
}

export function isReleased(publishAt, now = Date.now()) {
  return Date.parse(publishAt) <= now;
}

export function dayByNum(num) {
  return DAYS[num - 1] || null;
}

export function fmtShort(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return `${WEEKDAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}
export function fmtLong(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
