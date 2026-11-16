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

// Fenêtres de vote : un vote compte pour la semaine pendant laquelle il est fait.
// Chaque semaine se clôt le samedi à 18 h (annonce avec l'app jeu du samedi).
// La finale prend tous les votes du défi, jusqu'au mardi 22 décembre à 23 h 59.
export const WEEKS = [
  { id: "S1", label: "Semaine 1", announce: "2026-11-21", from: "2026-11-18T18:00:00+01:00", to: "2026-11-21T18:00:00+01:00" },
  { id: "S2", label: "Semaine 2", announce: "2026-11-28", from: "2026-11-21T18:00:00+01:00", to: "2026-11-28T18:00:00+01:00" },
  { id: "S3", label: "Semaine 3", announce: "2026-12-05", from: "2026-11-28T18:00:00+01:00", to: "2026-12-05T18:00:00+01:00" },
  { id: "S4", label: "Semaine 4", announce: "2026-12-12", from: "2026-12-05T18:00:00+01:00", to: "2026-12-12T18:00:00+01:00" },
  { id: "S5", label: "Semaine 5", announce: "2026-12-19", from: "2026-12-12T18:00:00+01:00", to: "2026-12-19T18:00:00+01:00" },
  { id: "F", label: "Finale", announce: "2026-12-22", from: "2026-11-18T18:00:00+01:00", to: "2026-12-22T23:59:59+01:00", final: true },
];

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
