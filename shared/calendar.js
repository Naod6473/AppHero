// Calendrier du défi Apphéro : la seule source de vérité pour les dates.
// Utilisé par le site (navigateur), le Worker et les scripts Node.
//
// Règles (décidées par Simon le 16/11/2026) :
// - Départ mercredi 18 novembre 2026, une app TOUS les jours, dimanche compris : 30 apps,
//   la dernière le jeudi 17 décembre (Simon, 16/11 à 18 h).
// - Toutes les sorties à 18 h, heure de Paris (UTC+1 en novembre-décembre).
// - Vote de la semaine du dimanche 18 h au mardi 18 h, finale le jeudi 17 décembre (app 30).
// - Un critère tiré au sort par case (Simon, 17/11/2026), révélé au lancement. Si une case tombe
//   sur « La roue décide », la roue tourne la veille au soir pour elle.

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

// Plus de thème par jour de la semaine (Simon, 17/11/2026) : chaque case a un critère tiré au sort,
// voir shared/criteria.js. Le tirage est en base et est public à partir de REVEAL_AT.
export const PAPER = "#FFF8E1";

// Fin du défi : résultat de la grande finale, le lendemain de la 30e app.
export const CHALLENGE_END = "2026-12-18T20:00:00+01:00";

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
  return Array.from({ length: TOTAL }, (_, i) => {
    const iso = addDays(START, i);
    const num = i + 1;
    return { num, id: String(num).padStart(2, "0"), date: iso, weekday: weekday(iso), publishAt: releaseAt(iso), color: PAPER };
  });
}

export const DAYS = buildDays();

// Les votes (décidés par Simon le 16/11/2026) :
// - Vote de la semaine : s'ouvre le dimanche à 18 h (sortie de la dernière app de la semaine),
//   se ferme le mardi à 18 h. Une voix par personne parmi les apps de la semaine (lundi-dimanche).
// - Grande finale : les 4 gagnantes de la semaine + les 4 apps de la dernière semaine (27 à 30).
//   Du jeudi 17 décembre 18 h au vendredi 18 décembre 20 h.
const nums = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(2, "0"));
export const BALLOTS = [
  { id: "S1", label: "Semaine 1", apps: nums(1, 5), opensAt: "2026-11-22T18:00:00+01:00", closesAt: "2026-11-24T18:00:00+01:00" },
  { id: "S2", label: "Semaine 2", apps: nums(6, 12), opensAt: "2026-11-29T18:00:00+01:00", closesAt: "2026-12-01T18:00:00+01:00" },
  { id: "S3", label: "Semaine 3", apps: nums(13, 19), opensAt: "2026-12-06T18:00:00+01:00", closesAt: "2026-12-08T18:00:00+01:00" },
  { id: "S4", label: "Semaine 4", apps: nums(20, 26), opensAt: "2026-12-13T18:00:00+01:00", closesAt: "2026-12-15T18:00:00+01:00" },
  // Les candidates de la finale sont calculées : gagnantes de S1 à S4, plus ces apps-là.
  { id: "F", label: "Grande finale", final: true, extra: nums(27, 30), opensAt: "2026-12-17T18:00:00+01:00", closesAt: "2026-12-18T20:00:00+01:00" },
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

// Les critères sont révélés dès le tirage en direct (Simon, 17/11) : le calendrier tiré est public.
export const REVEAL_AT = "2026-11-17T14:30:00+01:00";

// Les tirages de la roue : la veille au soir de chaque case tombée sur « La roue décide ».
export function wheelDays(criteria) {
  return DAYS.filter((d) => criteria?.[d.id]?.key === "roue").map((d) => ({ forDay: d.date, drawOn: addDays(d.date, -1), num: d.num }));
}

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
